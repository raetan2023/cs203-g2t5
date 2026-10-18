import numpy as np
from src.feature_engineering import prepare, origin_features, FEATURES

FORBIDDEN = {"y", "target_date", "mgo_target", "oracle_gasoil_ret", "pred_ret"}


def test_no_forbidden_columns_in_features():
    assert not FORBIDDEN & set(FEATURES)


def test_features_ignore_future_data(wide):
    p = prepare(wide)
    origin = p.mgo.index[len(p.mgo) // 2]
    base = origin_features(p, [origin]).iloc[0]
    w2 = wide.copy()
    later = w2.index >= origin
    w2.loc[later, ["gasoil", "brent", "dubai", "usd"]] *= 5.0       # corrupt everything from the origin on
    w2.loc[w2.index > origin, "mgo"] *= 5.0                          # and every later MGO quote
    changed = origin_features(prepare(w2), [origin]).iloc[0]
    np.testing.assert_allclose(base.values, changed.values, rtol=1e-9)
