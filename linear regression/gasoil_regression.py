"""Reproducible gasoil OLS experiment and separate experimental MGO mapping.

Run: python "linear regression/gasoil_regression.py" --data-dir /path/to/market_data_cleaned
Requires Python 3.10+, numpy and pandas. No source files are modified.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
import pandas as pd

SERIES = {
    "gasoil": "sg_gasoil_investing",
    "brent": "brent_fred",
    "dubai": "dubai_crude_investing",
    "usd": "usd_index_fred",
    "mgo": "sg_mgo_themaritime",
}
FEATURES = ["gasoil_return", "brent_return", "dubai_return", "usd_return"]


def read_market(data_dir):
    path = Path(data_dir) / "market_observations.csv"
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    manifest = json.loads((Path(data_dir) / "manifest.json").read_text())
    expected = next(item for item in manifest if item["file"] == path.name)
    if digest != expected["sha256"]:
        raise ValueError("Market CSV does not match its supplied manifest hash")
    raw = pd.read_csv(path, parse_dates=["date"])
    if raw.duplicated(["date", "series"]).any():
        raise ValueError("Duplicate date/series keys")
    if len(raw) != expected["rows"]:
        raise ValueError("Market row count does not match manifest")
    values = raw.pivot(index="date", columns="series", values="value").sort_index()
    series = {key: values[name].dropna() for key, name in SERIES.items()}
    if any((s <= 0).any() for s in series.values()):
        raise ValueError("Return modelling requires positive selected values")
    coverage = []
    for key, name in SERIES.items():
        source = raw.loc[raw.series.eq(name)]
        coverage.append({"name": key, "series": name, "rows": len(source),
                         "observed": len(series[key]), "missing": int(source.value.isna().sum()),
                         "first": str(series[key].index.min().date()),
                         "last": str(series[key].index.max().date())})
    return series, coverage, digest


def make_features(series, max_age_days=7):
    gasoil = series["gasoil"]
    frame = pd.DataFrame({"origin": gasoil.index, "gasoil_origin": gasoil.values})
    frame["target_date"] = frame.origin.shift(-1)
    frame["gasoil_actual"] = frame.gasoil_origin.shift(-1)
    frame["target_return"] = frame.gasoil_actual / frame.gasoil_origin - 1
    # Extra trading-date lag: all predictors stop at the previous gasoil date.
    frame["feature_cutoff"] = frame.origin.shift(1)
    for key in ["gasoil", "brent", "dubai", "usd"]:
        s = series[key]
        observations = pd.DataFrame({f"{key}_source_date": s.index,
                                     f"{key}_return": s.pct_change(fill_method=None).values,
                                     f"{key}_return_start": pd.Series(s.index).shift(1).values})
        joined = pd.merge_asof(frame.loc[frame.feature_cutoff.notna()].sort_values("feature_cutoff"),
                               observations, left_on="feature_cutoff", right_on=f"{key}_source_date",
                               direction="backward")
        frame = joined
        frame[f"{key}_age_days"] = (frame.origin - frame[f"{key}_source_date"]).dt.days
    required = FEATURES + ["target_return", "target_date"]
    missing = frame[required].isna().any(axis=1)
    stale = frame[[f"{k}_age_days" for k in SERIES if k != "mgo"]].gt(max_age_days).any(axis=1)
    frame["exclusion_reason"] = np.select([missing, stale], ["missing_feature_or_target", "stale_feature"], default="")
    valid = frame.loc[frame.exclusion_reason.eq("")].copy().reset_index(drop=True)
    for key in ["gasoil", "brent", "dubai", "usd"]:
        assert (valid[f"{key}_source_date"] <= valid.feature_cutoff).all()
        assert (valid[f"{key}_source_date"] < valid.origin).all()
    assert (valid.target_date > valid.origin).all()
    return valid, frame


def split_time(frame):
    if len(frame) < 100:
        raise ValueError("Too few complete rows for this experiment")
    first, second = int(len(frame) * .70), int(len(frame) * .85)
    train_end, validation_end = frame.iloc[first - 1].target_date, frame.iloc[second - 1].target_date
    # Purge boundary rows: no training outcome touches a later fold origin.
    train = frame.loc[frame.target_date.le(train_end)].copy()
    validation = frame.loc[frame.origin.gt(train_end) & frame.target_date.le(validation_end)].copy()
    test = frame.loc[frame.origin.gt(validation_end)].copy()
    assert train.target_date.max() < validation.origin.min()
    assert validation.target_date.max() < test.origin.min()
    return {"train": train, "validation": validation, "test": test}, train_end, validation_end


def fit_ols(x, y):
    x = np.asarray(x, dtype=float)
    if x.ndim == 1:
        x = x[:, None]
    mean, scale = x.mean(axis=0), x.std(axis=0)
    scale = np.where(scale == 0, 1, scale)
    design = np.column_stack([np.ones(len(x)), (x - mean) / scale])
    weights, _, rank, _ = np.linalg.lstsq(design, np.asarray(y), rcond=None)
    slopes = weights[1:] / scale
    return {"intercept": float(weights[0] - slopes @ mean), "slopes": slopes.tolist(),
            "rank": int(rank), "training_rows": len(x)}


def predict(model, x):
    x = np.asarray(x, dtype=float)
    if x.ndim == 1:
        x = x[:, None]
    return model["intercept"] + x @ np.array(model["slopes"])


def scores(actual, estimate):
    actual, estimate = np.asarray(actual), np.asarray(estimate)
    if len(actual) == 0:
        return {"n": 0, "mae": None, "rmse": None, "r2": None}
    error = estimate - actual
    total = ((actual - actual.mean()) ** 2).sum()
    return {"n": len(actual), "mae": float(np.abs(error).mean()),
            "rmse": float(np.sqrt((error ** 2).mean())),
            "r2": float(1 - (error ** 2).sum() / total) if total > 0 else None}


def mapping_pairs(series, train_end, validation_end):
    # Require exact gasoil dates at both observed MGO endpoints. Never synthesize labels.
    mgo = series["mgo"]
    pairs = pd.DataFrame({"origin": mgo.index, "mgo_origin": mgo.values})
    pairs["target_date"] = pairs.origin.shift(-1)
    pairs["mgo_actual"] = pairs.mgo_origin.shift(-1)
    pairs["gasoil_origin"] = pairs.origin.map(series["gasoil"])
    pairs["gasoil_actual"] = pairs.target_date.map(series["gasoil"])
    pairs["interval_days"] = (pairs.target_date - pairs.origin).dt.days
    pairs["gasoil_return"] = pairs.gasoil_actual / pairs.gasoil_origin - 1
    pairs["mgo_return"] = pairs.mgo_actual / pairs.mgo_origin - 1
    valid = pairs.dropna().loc[lambda d: d.interval_days.le(30)].copy()
    valid["split"] = "boundary_excluded"
    valid.loc[valid.target_date.le(train_end), "split"] = "train"
    valid.loc[valid.origin.gt(train_end) & valid.target_date.le(validation_end), "split"] = "validation"
    valid.loc[valid.origin.gt(validation_end), "split"] = "test"
    return valid, pairs


def run(data_dir, output_dir):
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    series, coverage, digest = read_market(data_dir)
    frame, candidates = make_features(series)
    folds, train_end, validation_end = split_time(frame)
    model = fit_ols(folds["train"][FEATURES], folds["train"].target_return)
    metrics, predictions = {}, []
    for name, fold in folds.items():
        fold["split"] = name
        fold["predicted_return"] = predict(model, fold[FEATURES])
        fold["gasoil_predicted"] = fold.gasoil_origin * (1 + fold.predicted_return)
        if (fold.gasoil_predicted <= 0).any():
            raise ValueError("OLS produced a nonpositive gasoil price; review specification")
        metrics[name] = {"regression": scores(fold.gasoil_actual, fold.gasoil_predicted),
                         "persistence": scores(fold.gasoil_actual, fold.gasoil_origin),
                         "return_regression": scores(fold.target_return, fold.predicted_return),
                         "first_origin": str(fold.origin.min().date()),
                         "last_target": str(fold.target_date.max().date())}
        predictions.append(fold)
    predictions = pd.concat(predictions, ignore_index=True)
    pairs, pair_candidates = mapping_pairs(series, train_end, validation_end)
    mapping_train = pairs.loc[pairs.split.eq("train")]
    mapping_model = fit_ols(mapping_train[["gasoil_return"]], mapping_train.mgo_return) if len(mapping_train) >= 10 else None
    mapping_metrics = {}
    for name in folds:
        selected = pairs.loc[pairs.split.eq(name)].copy()
        selected["mgo_transfer"] = selected.mgo_origin * (1 + selected.gasoil_return)
        pairs.loc[selected.index, "mgo_transfer"] = selected.mgo_transfer
        mapping_metrics[name] = {"actual_gasoil_transfer": scores(selected.mgo_actual, selected.mgo_transfer),
                                 "persistence": scores(selected.mgo_actual, selected.mgo_origin),
                                 "interval_days_min": int(selected.interval_days.min()) if len(selected) else None,
                                 "interval_days_max": int(selected.interval_days.max()) if len(selected) else None}
        if mapping_model:
            calibrated = selected.mgo_origin * (1 + predict(mapping_model, selected[["gasoil_return"]]))
            pairs.loc[selected.index, "mgo_calibrated"] = calibrated
            mapping_metrics[name]["calibrated_actual_gasoil"] = scores(selected.mgo_actual, calibrated)
    # Exact observed MGO origins and targets matching each one-step gasoil forecast.
    end_to_end = predictions.copy()
    end_to_end["mgo_origin"] = end_to_end.origin.map(series["mgo"])
    end_to_end["mgo_actual"] = end_to_end.target_date.map(series["mgo"])
    end_to_end = end_to_end.dropna(subset=["mgo_origin", "mgo_actual"]).copy()
    end_to_end["mgo_predicted"] = end_to_end.mgo_origin * (1 + end_to_end.predicted_return)
    # Do not apply an intercept fitted on mixed-duration intervals to a daily forecast.
    # A calibrated daily chain needs enough training pairs at the same horizon.
    chain_metrics = {}
    for name in folds:
        selected = end_to_end.loc[end_to_end.split.eq(name)]
        chain_metrics[name] = {"transfer": scores(selected.mgo_actual, selected.mgo_predicted),
                               "persistence": scores(selected.mgo_actual, selected.mgo_origin)}
    result = {"source_sha256": digest, "coverage": coverage, "features": FEATURES,
              "horizon": "next observed gasoil trading date", "max_feature_age_days": 7,
              "feature_lag": "previous gasoil trading date", "train_end": str(train_end.date()),
              "validation_end": str(validation_end.date()), "gasoil_model": model,
              "mapping_model": mapping_model, "gasoil_metrics": metrics,
              "mapping_diagnostic_metrics": mapping_metrics, "end_to_end_mgo_metrics": chain_metrics,
              "row_accounting": {"gasoil_source_rows": len(series["gasoil"]), "feature_candidates": len(candidates),
                                 "complete_rows": len(frame), "boundary_purged": len(frame) - len(predictions),
                                 "exclusions": candidates.exclusion_reason.value_counts().to_dict(),
                                 "adjacent_mgo_intervals": len(pair_candidates) - 1,
                                 "eligible_mapping_intervals": len(pairs),
                                 "end_to_end_rows": len(end_to_end)}}
    for name, data in [("coverage", pd.DataFrame(coverage)), ("feature_candidates", candidates),
                       ("gasoil_predictions", predictions), ("mgo_mapping_pairs", pairs),
                       ("mgo_pair_candidates", pair_candidates), ("mgo_predictions", end_to_end)]:
        data.to_csv(output_dir / f"{name}.csv", index=False)
    (output_dir / "results.json").write_text(json.dumps(result, indent=2, allow_nan=False) + "\n")
    (output_dir / "report.md").write_text(make_report(result))
    return result


def make_report(result):
    lines = ["# Singapore gasoil linear regression and experimental MGO mapping", "",
             "This is an initial experiment, not a validated purchasing forecast.", "",
             "## Specification", "",
             "OLS predicts the next observed gasoil trading-date return from four historical returns: gasoil, Brent, Dubai and broad USD index. Returns are decimal fractions. Predictors stop at the previous gasoil trading date; backward as-of joins have a seven-calendar-day maximum age. Missing feature rows are excluded. Source dates and return interval starts are retained.", "",
             "Chronological 70/15/15 boundaries are determined on complete rows. Boundary-crossing labels are purged. Coefficients are fitted only on training data, with no validation/test refitting or model selection. OLS uses NumPy least squares, algebraically equivalent to an intercept-bearing linear regression. Training standardization is folded back into the published coefficients.", "",
             f"Training outcomes end {result['train_end']}; validation outcomes end {result['validation_end']}.", "",
             "## Gasoil price evaluation (USD/barrel)", "",
             "| Split | Rows | Regression MAE | Persistence MAE | Regression RMSE | Persistence RMSE |",
             "|---|---:|---:|---:|---:|---:|"]
    for name, metrics in result["gasoil_metrics"].items():
        a, b = metrics["regression"], metrics["persistence"]
        lines.append(f"| {name} | {a['n']} | {a['mae']:.4f} | {b['mae']:.4f} | {a['rmse']:.4f} | {b['rmse']:.4f} |")
    lines += ["", "Persistence predicts the origin price, equivalent to zero return. Price-level R² can look high for persistent prices; baseline error comparison is the main check.", "",
              "## End-to-end MGO evaluation (USD/metric tonne)", "",
              "Only actual MGO quotes at both the gasoil forecast origin and target qualify. One trading step can span weekends/holidays. No target interpolation or quote carry-forward is used.", "",
              "| Split | Rows | Percentage-transfer MAE | Persistence MAE |", "|---|---:|---:|---:|"]
    for name, metrics in result["end_to_end_mgo_metrics"].items():
        a, b = metrics["transfer"], metrics["persistence"]
        fmt = lambda value: "unavailable" if value is None else f"{value:.4f}"
        lines.append(f"| {name} | {a['n']} | {fmt(a['mae'])} | {fmt(b['mae'])} |")
    test = result["gasoil_metrics"]["test"]
    verdict = "beats" if test["regression"]["mae"] < test["persistence"]["mae"] else "does not beat"
    lines += ["", f"The gasoil regression **{verdict} persistence on test MAE** in this run.", "",
              "## Mapping diagnostic", "",
              "Separately, adjacent MGO quote intervals with exact gasoil endpoints and at most 30 calendar days are checked using REALIZED gasoil returns. This is a relationship diagnostic, not a gasoil forecasting result. The optional second OLS estimates MGO_return = alpha + beta * gasoil_return from training-period pairs only. Both mapping variants are reported without selecting a winner on the test set. Mixed-duration intervals do not validate a daily mapping, so the fitted mapping is NOT applied to the one-step forecast chain.", "",
              "## Limits and next steps", "",
              "- Forecast horizon is an initial modelling choice, not a confirmed team requirement.",
              "- Source publication times, revision vintages and futures roll treatment remain unresolved. The extra lag reduces timing risk but does not establish a strict point-in-time backtest.",
              "- MGO quotes are sparse and may repeat; exact date matches do not prove contemporaneous publication. Inspect quote provenance before treating the small MGO test subset as representative.",
              "- News and monthly sales are excluded from this first specification. The supplied news has no MGO date overlap; monthly sales need release-date rules.",
              "- MGO output assumes a reliable aligned price anchor. Mapping uncertainty and calibrated prediction intervals have not been established.",
              "- Review expanding-window performance and a team-agreed horizon before promoting this experiment. If changes are chosen after viewing test results, reserve new data for the next final evaluation.", "",
              "Full coefficients, counts, mapping metrics and return-level R² are in results.json; CSVs preserve features, dates, exclusions and individual predictions.", ""]
    return "\n".join(lines)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-dir", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, default=Path(__file__).parent / "outputs")
    args = parser.parse_args()
    result = run(args.data_dir, args.output_dir)
    print(make_report(result))
