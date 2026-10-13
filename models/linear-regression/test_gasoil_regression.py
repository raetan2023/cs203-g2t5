"""Checks for arithmetic correctness and chronological leakage prevention."""
import unittest

import numpy as np
import pandas as pd

from gasoil_regression import fit_ols, make_features, mapping_pairs, predict, split_time


class RegressionTests(unittest.TestCase):
    def test_ols_recovers_known_relationship(self):
        x = np.arange(20, dtype=float)
        model = fit_ols(x, 3 + 2 * x)
        np.testing.assert_allclose(predict(model, [21, 22]), [45, 47], atol=1e-10)

    def test_features_never_use_origin_or_future_observations(self):
        dates = pd.bdate_range("2020-01-01", periods=25)
        source = pd.Series(np.arange(25, dtype=float) + 100, index=dates)
        data = {key: source.copy() for key in ["gasoil", "brent", "dubai", "usd", "mgo"]}
        # A source gap must align backward, rather than reading the next date.
        data["brent"] = source.drop(dates[8:11])
        frame, _ = make_features(data)
        for key in ["gasoil", "brent", "dubai", "usd"]:
            self.assertTrue((frame[f"{key}_source_date"] < frame.origin).all())
        before = frame.loc[frame.origin.le(dates[15])].copy()
        for key in data:
            data[key].loc[data[key].index > dates[16]] *= 10
        after, _ = make_features(data)
        pd.testing.assert_frame_equal(before.reset_index(drop=True), after.loc[after.origin.le(dates[15])].reset_index(drop=True))

    def test_stale_source_rows_are_excluded(self):
        dates = pd.bdate_range("2020-01-01", periods=30)
        source = pd.Series(np.arange(30, dtype=float) + 100, index=dates)
        data = {key: source.copy() for key in ["gasoil", "brent", "dubai", "usd", "mgo"]}
        data["usd"] = source.iloc[:3]
        valid, candidates = make_features(data)
        self.assertTrue(valid.usd_age_days.le(7).all())
        self.assertTrue(candidates.exclusion_reason.eq("stale_feature").any())

    def test_split_purges_crossing_labels(self):
        dates = pd.bdate_range("2020-01-01", periods=201)
        frame = pd.DataFrame({"origin": dates[:-1], "target_date": dates[1:]})
        folds, _, _ = split_time(frame)
        self.assertLess(folds["train"].target_date.max(), folds["validation"].origin.min())
        self.assertLess(folds["validation"].target_date.max(), folds["test"].origin.min())
        self.assertEqual(sum(map(len, folds.values())), len(frame) - 2)

    def test_mapping_does_not_invent_mgo_quotes(self):
        dates = pd.bdate_range("2020-01-01", periods=30)
        gasoil = pd.Series(np.arange(30) + 100., index=dates)
        mgo = pd.Series([500., 510., 530., 535.], index=dates[[0, 5, 15, 29]])
        pairs, _ = mapping_pairs({"gasoil": gasoil, "mgo": mgo}, dates[10], dates[20])
        self.assertTrue(pairs.origin.isin(mgo.index).all())
        self.assertTrue(pairs.target_date.isin(mgo.index).all())
        self.assertEqual(pairs.split.tolist(), ["train", "boundary_excluded", "boundary_excluded"])


if __name__ == "__main__":
    unittest.main()
