import contextlib
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import import_market as market


def payload(source_id, series=None, value=10, unit=None, metadata=None):
    _, provider, units, _ = market.SOURCES[source_id]
    row = {"date": "2026-08-01", "series": series or source_id,
           "source": provider, "unit": unit or sorted(units)[0], "value": value,
           "retrieved_at": "2026-10-20T01:00:00Z", "metadata": metadata or {}}
    return {"source": {"id": source_id, "provider": provider, "name": source_id},
            "meta": {"served_from": "snapshot"}, "data": [row]}


class MarketImportTests(unittest.TestCase):
    def test_bunker_categories_same_date_do_not_collide_and_zero_is_retained(self):
        data = payload("bunker_sales", "bunker_sales_marine_gas_oil", value=0)
        data["data"].append({**data["data"][0], "series": "bunker_sales_methanol", "value": 2})
        groups = market.normalize(data, "bunker_sales")
        self.assertEqual(len(groups), 2)
        self.assertEqual(groups[0]["rows"][0]["value"], "0")
        self.assertIsNone(groups[0]["metadata"]["currency_code"])
        self.assertNotIn("availability_timestamp", groups[0]["rows"][0])

    def test_unknown_futures_units_are_not_guessed(self):
        data = payload("gasoil_singapore", unit="source-defined")
        data["data"][0]["source"] = "Investing.com manual export"
        group = market.normalize(data, "gasoil_singapore")[0]
        self.assertEqual(group["metadata"]["unit"], "source-defined")
        self.assertIsNone(group["metadata"]["currency_code"])

    def test_usd_index_is_not_a_currency_price(self):
        group = market.normalize(payload("usd_index"), "usd_index")[0]
        self.assertEqual(group["metadata"]["unit"], "index")
        self.assertIsNone(group["metadata"]["currency_code"])

    def test_gdelt_count_and_tone_remain_different_series(self):
        data = payload("gdelt", "gdelt_article_count", metadata={"average_tone": -2.5})
        groups = market.normalize(data, "gdelt")
        self.assertEqual({g["metadata"]["series_key"] for g in groups}, {"GDELT_ARTICLE_COUNT", "GDELT_AVERAGE_TONE"})
        tone = next(g for g in groups if g["metadata"]["series_key"] == "GDELT_AVERAGE_TONE")
        self.assertEqual(tone["rows"][0]["value"], "-2.5")

    def test_missing_tone_does_not_become_zero(self):
        groups = market.normalize(payload("gdelt", "gdelt_article_count"), "gdelt")
        self.assertEqual(len(groups), 1)

    def test_invalid_source_blocks_every_write(self):
        with tempfile.TemporaryDirectory() as tmp:
            Path(tmp, "brent.json").write_text(json.dumps(payload("brent")))
            bad = payload("usd_index", value="NaN")
            Path(tmp, "usd_index.json").write_text(json.dumps(bad))
            with patch.object(market.db, "check_supabase") as check, patch.object(market.db, "write_series") as write:
                with contextlib.redirect_stdout(io.StringIO()), self.assertRaises(ValueError):
                    market.run(["brent", "usd_index"], input_dir=tmp, apply=True)
                check.assert_not_called()
                write.assert_not_called()

    def test_inconsistent_units_and_duplicate_dates_are_rejected(self):
        data = payload("brent")
        data["data"].append(dict(data["data"][0]))
        with self.assertRaises(ValueError): market.normalize(data, "brent")
        data = payload("usd_index", unit="USD/barrel")
        with self.assertRaises(ValueError): market.normalize(data, "usd_index")

    def test_bunker_month_label_and_gdelt_counts_are_validated(self):
        data = payload("bunker_sales", "bunker_sales_marine_gas_oil")
        data["data"][0]["date"] = "2026-08-15"
        with self.assertRaises(ValueError): market.normalize(data, "bunker_sales")
        with self.assertRaises(ValueError): market.normalize(payload("gdelt", "gdelt_article_count", value=1.5), "gdelt")


if __name__ == "__main__": unittest.main()
