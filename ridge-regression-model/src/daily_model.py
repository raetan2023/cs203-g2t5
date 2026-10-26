"""Decision-day Ridge centres and news-conditioned out-of-sample error quantiles.

This is the batch serving path. Legacy quote-origin experiments remain separate.
No price targets or news collection gaps are interpolated.
"""
from datetime import timedelta
import hashlib
import json
import numpy as np
import pandas as pd
from . import config
from .feature_engineering import FEATURES, Prepared, prepare, market_features
from .model import make_model
from .quantile import fit_quantile, predict_quantile, summarize_quantile, _order_statistic

VERSION = 1
MIN_CENTRAL = 30
MIN_EVALUATION = 40


def source_dates(wide, origin):
    origin = pd.Timestamp(origin)
    dates = {}
    for name in ("mgo", "gasoil", "brent", "dubai", "usd"):
        cutoff = origin - pd.Timedelta(days=1 if name == "mgo" else config.LAG_DAYS[name])
        series = wide[name].dropna()
        known = series[series.index <= cutoff]
        if known.empty or (origin - known.index[-1]).days > 7:
            raise ValueError(f"Stale or missing {name} observation")
        if not np.isfinite(known.iloc[-1]) or known.iloc[-1] <= 0:
            raise ValueError(f"Invalid {name} price/index")
        dates[name] = str(known.index[-1].date())
    return dates


def decision_features(wide, origins):
    """Daily morning features: only MGO quotes strictly before the decision day.

    Publication times are unavailable. Same-day quotes are therefore excluded;
    market inputs keep the existing conservative per-source publication lags.
    """
    origins = pd.DatetimeIndex(origins)
    p = prepare(wide, end=origins.max())
    causal = Prepared(p.mgo, p.daily, p.lagged, p.mgo_ff.shift(1))
    f = market_features(causal).reindex(origins).copy()
    quotes = p.mgo.sort_index()
    anchors, anchor_dates = [], []
    for origin in origins:
        known = quotes.loc[quotes.index < origin]
        anchor_date = known.index[-1] if len(known) else pd.NaT
        anchor = float(known.iloc[-1]) if len(known) else np.nan
        anchors.append(anchor); anchor_dates.append(anchor_date)
        f.loc[origin, "mgo_prev_ret"] = np.clip(np.log(known.iloc[-1] / known.iloc[-2]), -.25, .25) if len(known) > 1 else np.nan
        f.loc[origin, "quote_age"] = np.log1p((origin - anchor_date).days) if len(known) else np.nan
        for c in ("gasoil", "brent"):
            current = p.lagged[c].get(origin, np.nan)
            previous = p.lagged[c].get(anchor_date, np.nan)
            f.loc[origin, f"{c}_since_quote"] = np.clip(np.log(current / previous), -.25, .25)
    f = f[FEATURES]
    f["mgo_t"] = anchors
    f["anchor_date"] = anchor_dates
    return f


def daily_table(wide, horizon, cutoff):
    """One actual target quote per row, at exact decision day + horizon.

    Exact targets avoid duplicating one sparse outcome across many daily origins.
    This also prevents maturity changing after an initially nearest quote arrives.
    """
    quotes = wide.mgo.dropna().sort_index()
    quotes = quotes[quotes.index < pd.Timestamp(cutoff)]
    origins = quotes.index - pd.Timedelta(days=horizon)
    f = decision_features(wide, origins)
    f["origin"] = origins
    f["target_date"] = quotes.index
    f["mgo_target"] = quotes.to_numpy()
    f["y"] = np.log(f.mgo_target / f.mgo_t)
    f = f.dropna(subset=FEATURES + ["mgo_t", "y"]).reset_index(drop=True)
    eligible = []
    for row in f.itertuples():
        try:
            source_dates(wide, row.origin)
            eligible.append(True)
        except ValueError:
            eligible.append(False)
    return f[np.isfinite(f[FEATURES + ["mgo_t", "y"]]).all(axis=1) & np.array(eligible, dtype=bool)].reset_index(drop=True)


def _gamma(known):
    if len(known) < 20:
        return 0.0
    return float(min(config.GAMMAS, key=lambda g: np.mean(np.abs(
        known.mgo_target - known.mgo_t * np.exp(g * known.pred_ret_raw)))))


def central_oos(table, min_train=MIN_CENTRAL):
    """Every centre and shrinkage choice uses only labels mature at its origin."""
    rows = []
    for i, test in table.iterrows():
        known = table.iloc[:i]
        known = known[known.target_date < test.origin]
        if len(known) < min_train:
            continue
        model = make_model().fit(known[FEATURES], known.y)
        raw = float(model.predict(table.loc[[i], FEATURES])[0])
        previous = pd.DataFrame(rows)
        if not previous.empty:
            previous = previous[previous.target_date < test.origin]
        gamma = _gamma(previous)
        row = test.to_dict()
        row.update(pred_ret_raw=raw, gamma=gamma,
                   central=float(test.mgo_t * np.exp(raw * gamma)))
        row["error"] = float(np.log(test.mgo_target / row["central"]))
        rows.append(row)
    return pd.DataFrame(rows)


def attach_news(oos, archives, feature_names):
    rows = []
    for _, row in oos.iterrows():
        news_day = (row.origin - pd.Timedelta(days=1)).date().isoformat()
        news = archives.get(news_day)
        if not news or news.get("status") != "complete":
            continue
        if set(news["features"]) != set(feature_names):
            raise ValueError("News feature schema mismatch")
        item = row.to_dict()
        item.update(news["features"])
        item["news_date"] = news_day
        rows.append(item)
    return pd.DataFrame(rows)


def _error_table(rows):
    out = rows.copy()
    out["mgo_t"] = out.central
    out["y"] = out.error
    return out


def fit_error_models(rows, news_features):
    error_table = _error_table(rows)
    news = fit_quantile(error_table, FEATURES + list(news_features))
    market = fit_quantile(error_table, FEATURES)
    calibration = rows.iloc[-20:]
    persistence_margin = _order_statistic(np.abs(np.log(calibration.mgo_target / calibration.mgo_t)))
    return {"news": news, "market": market, "persistence_margin": persistence_margin}


def error_bounds(models, rows):
    out = predict_quantile(models["news"], rows, rows.central)
    market = predict_quantile(models["market"], rows, rows.central)
    for col in ("raw_low", "raw_high", "low", "high"):
        out["market_" + col] = market[col]
    out["baseline_low"] = rows.mgo_t.to_numpy() * np.exp(-models["persistence_margin"])
    out["baseline_high"] = rows.mgo_t.to_numpy() * np.exp(models["persistence_margin"])
    return out


def evaluate_errors(rows, news_features):
    predictions = []
    for i in range(50, len(rows)):
        test = rows.iloc[[i]]
        known = rows.iloc[:i]
        known = known[known.target_date < test.origin.iloc[0]]
        try:
            models = fit_error_models(known, news_features)
        except ValueError as exc:
            if str(exc).startswith("Insufficient"):
                continue
            raise
        result = test.copy()
        bounds = error_bounds(models, test)
        for column in bounds:
            result[column] = bounds[column].to_numpy()
        # Quantile pinball errors are relative to the central forecast.
        result["y"] = result.error
        predictions.append(result)
    if not predictions:
        return None, {"evaluation_rows": 0, "reason": "insufficient_evaluation"}
    evaluated = pd.concat(predictions, ignore_index=True)
    report = summarize_quantile(evaluated)
    market = evaluated.copy()
    for name in ("raw_low", "raw_high", "low", "high"):
        market[name] = evaluated["market_" + name]
    # Pinball fields for the market comparator must describe its own endpoints.
    market["raw_q10_return"] = np.log(market.raw_low / market.central)
    market["raw_q90_return"] = np.log(market.raw_high / market.central)
    report["market_only"] = summarize_quantile(market)
    report["evaluation_rows"] = len(evaluated)
    report["target_policy"] = "Exact observed target quote at decision date + horizon; one row per actual target."
    return evaluated, report


def train_horizon(wide, archives, news_features, horizon, cutoff, min_evaluation=MIN_EVALUATION):
    table = daily_table(wide, horizon, cutoff)
    oos = central_oos(table)
    if oos.empty:
        raise ValueError("Insufficient mature price history for out-of-sample central forecasts")
    joined = attach_news(oos, archives, news_features)
    if joined.empty:
        raise ValueError("Insufficient complete historical GDELT overlap")
    used = [archives[d] for d in joined.news_date]
    identities = {(a["classification_version"], a["classifier_id"]) for a in used}
    if len(identities) != 1:
        raise ValueError("Historical news classifier versions differ; reclassify consistently")
    evaluated, report = evaluate_errors(joined, news_features)
    report.update(price_rows=len(table), central_oos_rows=len(oos), news_overlap_rows=len(joined))
    if report["evaluation_rows"] < min_evaluation:
        raise ValueError(f"Insufficient chronological news evaluation: {report['evaluation_rows']}/{min_evaluation}; price rows={len(table)}, news overlap={len(joined)}")
    final = make_model().fit(table[FEATURES], table.y)
    models = fit_error_models(joined, news_features)
    return {"version": VERSION, "horizon_days": horizon, "central_model": final,
            "gamma": _gamma(oos), "models": models, "features": FEATURES,
            "news_features": list(news_features), "evaluation": report,
            "trained_through_target_date": str(table.target_date.max().date()),
            "training_cutoff": str(pd.Timestamp(cutoff).date()),
            "classification_version": used[0]["classification_version"],
            "classifier_id": used[0]["classifier_id"]}, evaluated


def predict_day(bundle, wide, news, origin):
    origin = pd.Timestamp(origin)
    if bundle.get("version") != VERSION:
        raise ValueError("Unsupported daily model bundle")
    if origin <= pd.Timestamp(bundle["trained_through_target_date"]):
        raise ValueError("Training labels are not strictly earlier than forecast origin")
    expected_day = (origin - pd.Timedelta(days=1)).date().isoformat()
    if news.get("status") != "complete" or news["news_date"] != expected_day:
        raise ValueError("Exact previous-day complete news is required")
    if (news["classification_version"], news["classifier_id"]) != (bundle["classification_version"], bundle["classifier_id"]):
        raise ValueError("News classification version differs from training")
    x = decision_features(wide, [origin])
    source_dates(wide, origin)
    if not np.isfinite(x[FEATURES + ["mgo_t"]]).all(axis=None):
        raise ValueError("Decision-day market features unavailable")
    if (origin - x.anchor_date.iloc[0]).days > 7:
        raise ValueError("MGO anchor is stale")
    for key in bundle["news_features"]:
        x[key] = news["features"][key]
    ret = float(bundle["central_model"].predict(x[FEATURES])[0]) * bundle["gamma"]
    x["central"] = x.mgo_t * np.exp(ret)
    bounds = error_bounds(bundle["models"], x).iloc[0]
    model = bundle["central_model"]
    contributions = model[0].transform(x[FEATURES])[0] * model[-1].coef_ * bundle["gamma"]
    drivers = sorted(zip(FEATURES, contributions), key=lambda item: abs(item[1]), reverse=True)[:5]
    report = bundle["evaluation"]["all"]
    return {"status": "ready", "horizon_days": bundle["horizon_days"],
            "forecast_origin_date": str(origin.date()), "as_of_date": str(origin.date()),
            "target_date": str((origin + pd.Timedelta(days=bundle["horizon_days"])).date()),
            "anchor_quote_date": str(x.anchor_date.iloc[0].date()), "anchor_price": float(x.mgo_t.iloc[0]),
            "quote_age_days": (origin - x.anchor_date.iloc[0]).days,
            "forecast": float(x.central.iloc[0]), "low": float(bounds.low), "high": float(bounds.high),
            "raw_q10_price": float(bounds.raw_low), "raw_q90_price": float(bounds.raw_high),
            "unit": "USD/metric tonne", "evidence": "unevaluated", "mae_skill_vs_persistence": None,
            "backtest_rows": report["n"],
            "top_drivers": [{"feature": f, "contribution": float(v)} for f, v in drivers],
            "interval": {"method": "gdelt_error_quantiles", "nominal_coverage": .8,
                "empirical_coverage": report["calibrated"]["coverage"], "evaluation_rows": report["n"],
                "mean_width": report["calibrated"]["mean_width"],
                "baseline_coverage": report["baseline"]["coverage"],
                "baseline_mean_width": report["baseline"]["mean_width"],
                "evaluation_scope": "Chronological retrospective, paired news-eligible origins; exact observed targets.",
                "limitations": "Experimental news-conditioned range. Dependent outcomes; nominal coverage is not guaranteed. Central estimate may lie outside bounds."}}
