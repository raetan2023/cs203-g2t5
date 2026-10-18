import numpy as np
import pandas as pd
from src.feature_engineering import prepare
from src.labels import build_table
from src.config import TOLERANCE_DAYS


def test_labels_are_observed_quotes_only(wide):
    p = prepare(wide)
    t = build_table(p, 7)
    assert len(t) > 60
    assert (t.target_date > t.origin).all()
    assert (((t.target_date - t.origin).dt.days - 7).abs() <= TOLERANCE_DAYS).all()
    observed = set(p.mgo.index)
    assert set(t.target_date) <= observed and set(t.origin) <= observed
    np.testing.assert_allclose(t.y, np.log(t.mgo_target / t.mgo_t))
    assert not t.drop(columns=["origin", "target_date"]).isna().any().any()
