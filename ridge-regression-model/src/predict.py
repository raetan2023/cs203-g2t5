"""predict(h, as_of): load the saved Ridge pipeline for horizon h and forecast MGO.
nowcast(as_of): estimate today's MGO price from latest quote + gasoil movement.

When a quote is stale (as_of > quote date), the forecast starts from the nowcast anchor,
and prediction intervals scale with market volatility (gasoil_vol20)."""
import json
import joblib
import numpy as np
import pandas as pd
from .config import ARTIFACTS
from .data_loader import load_wide
from .feature_engineering import prepare, origin_features


def evidence_label(bt: dict) -> str:
    """How much to trust the model, from its own walk-forward backtest."""
    lo = bt["paired_MAE_gain_CI95"][0]
    if bt["MAE_skill_vs_persist"] > 0 and lo > 0:
        return "supported"        # beats persistence and the 95% CI excludes zero
    if bt["MAE_skill_vs_persist"] > 0:
        return "weak"             # beats persistence on average, but CI includes zero
    return "no_edge"              # does not beat 'no change'


def nowcast(as_of=None, wide: pd.DataFrame = None, p=None) -> dict:
    """Estimates today's MGO price ('what is MGO worth today?') from the latest quote
    and subsequent benchmark market movement (gasoil direct transfer).
    """
    if p is None:
        p = prepare(wide if wide is not None else load_wide())
    as_of = pd.Timestamp(as_of) if as_of is not None else p.mgo.index.max()
    avail = p.mgo.index[p.mgo.index <= as_of]
    if len(avail) < 1:
        raise ValueError("No MGO quote on or before as_of_date.")
    origin = avail[-1]
    anchor = float(p.mgo[origin])
    age_days = int((as_of - origin).days)

    if age_days == 0:
        return {
            "as_of_date": str(as_of.date()),
            "anchor_quote_date": str(origin.date()),
            "anchor_price": anchor,
            "quote_age_days": 0,
            "gasoil_move_since_quote": 0.0,
            "nowcast_price": anchor,
            "nowcast_return": 0.0,
            "unit": "USD/metric tonne",
            "status": "fresh_quote",
            "explanation": f"Latest quote from {origin.date()} is fresh (0 days old).",
        }

    # Calculate gasoil movement between origin and as_of
    L = p.lagged
    as_of_clamped = min(as_of, L.index.max())
    origin_clamped = max(origin, L.index.min())

    g_origin = float(L["gasoil"].loc[:origin_clamped].iloc[-1])
    g_as_of = float(L["gasoil"].loc[:as_of_clamped].iloc[-1])

    if g_origin > 0 and g_as_of > 0:
        g_ret = float(np.log(g_as_of / g_origin))
    else:
        g_ret = 0.0

    nowcast_price = anchor * float(np.exp(g_ret))
    pct_move = (np.exp(g_ret) - 1.0) * 100.0
    sign = "+" if pct_move >= 0 else ""

    return {
        "as_of_date": str(as_of.date()),
        "anchor_quote_date": str(origin.date()),
        "anchor_price": anchor,
        "quote_age_days": age_days,
        "gasoil_move_since_quote": round(g_ret, 4),
        "nowcast_price": round(nowcast_price, 2),
        "nowcast_return": round(g_ret, 4),
        "unit": "USD/metric tonne",
        "status": "nowcasted",
        "explanation": f"Anchor quote is {age_days} days old (${anchor:.2f}). Gasoil moved {sign}{pct_move:.2f}% since then, nowcasting today's MGO at ${nowcast_price:.2f}.",
    }


def predict(h: int, as_of=None, wide: pd.DataFrame = None) -> dict:
    meta = json.loads((ARTIFACTS / f"ridge_{h}d.json").read_text())
    model = joblib.load(ARTIFACTS / f"ridge_{h}d.joblib")
    p = prepare(wide if wide is not None else load_wide())
    as_of = pd.Timestamp(as_of) if as_of is not None else p.mgo.index.max()
    avail = p.mgo.index[p.mgo.index <= as_of]
    if len(avail) < 2:
        raise ValueError("No MGO quote on or before as_of_date.")
    origin = avail[-1]
    age_days = int((as_of - origin).days)

    X = origin_features(p, [origin])[meta["features"]]
    if X.isna().any(axis=None):
        raise ValueError("Features unavailable for this date (insufficient history).")
    ret = float(model.predict(X)[0])
    gamma = float(meta.get("gamma", 1.0))
    shrunk_ret = ret * gamma
    anchor = float(p.mgo[origin])

    # Nowcast starting anchor for stale quotes
    nc = nowcast(as_of=as_of, wide=wide, p=p)
    nowcast_price = float(nc["nowcast_price"])
    nowcast_ret = float(nc["nowcast_return"])

    # Volatility-scaled prediction interval
    vol = float(X["gasoil_vol20"].values[0]) if "gasoil_vol20" in X.columns else 0.02
    vol = max(vol, 1e-4)
    q_scale = float(meta.get("q_scale", abs(meta.get("q_hi", 0.15))))
    margin = q_scale * vol

    forecast = nowcast_price * float(np.exp(shrunk_ret))
    low = nowcast_price * float(np.exp(shrunk_ret - margin))
    high = nowcast_price * float(np.exp(shrunk_ret + margin))
    bt = meta["backtest"]

    return {
        "horizon_days": h,
        "as_of_date": str(as_of.date()),
        "anchor_quote_date": str(origin.date()),
        "anchor_price": anchor,
        "nowcast_price": round(nowcast_price, 2),
        "nowcast_return": round(nowcast_ret, 4),
        "forecast_return": round(shrunk_ret, 4),
        "raw_return": round(ret, 4),
        "gamma": round(gamma, 2),
        "quote_age_days": age_days,
        "forecast": round(forecast, 2),
        "low": round(low, 2),
        "high": round(high, 2),
        "unit": "USD/metric tonne",
        "evidence": evidence_label(bt),
        "mae_skill_vs_persistence": bt["MAE_skill_vs_persist"],
        "backtest_rows": bt["n"],
        "model_version": f"ridge-{h}d-alpha{meta['alpha']:.3g}-to-{meta['trained_to_origin']}",
    }

