import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("import_brent", Path(__file__).with_name("import_brent.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def response():
    return {"source": {"id": "brent", "provider": "FRED", "unit": "USD/barrel"},
            "data": [{"date": "2026-10-14", "value": 126.55, "series": "brent", "source": "FRED",
                      "unit": "USD/barrel", "retrieved_at": "2026-10-19T09:58:04Z"}]}


class ImportTests(unittest.TestCase):
    def test_collection_time_does_not_become_historical_availability(self):
        _, rows = module.validate_payload(response())
        self.assertEqual(rows[0]["value"], "126.55")
        self.assertNotIn("availability_timestamp", rows[0])

    def test_invalid_rows_rejected_before_any_write(self):
        for value in [None, True, "NaN", "Infinity", "invalid"]:
            data = response()
            data["data"][0]["value"] = value
            with self.subTest(value=value), self.assertRaises(ValueError):
                module.validate_payload(data)

    def test_conflicting_duplicate_dates_rejected(self):
        data = response()
        data["data"].append({**data["data"][0], "value": 120})
        with self.assertRaises(ValueError):
            module.validate_payload(data)

    def test_preview_never_calls_database(self):
        with patch.object(module, "request_json", return_value=response()), patch.object(module, "apply_rows") as apply:
            module.main(["--limit", "2"])
            apply.assert_not_called()

    def test_database_check_only_issues_read_requests(self):
        with patch.object(module, "supabase_settings", return_value=("https://example.supabase.co", {"apikey": "hidden"})), patch.object(
            module, "request_json", return_value=[]
        ) as request:
            module.check_supabase()
            self.assertEqual(request.call_count, 2)
            for call in request.call_args_list:
                self.assertEqual(call.kwargs.get("method", "GET"), "GET")
                self.assertNotIn("payload", call.kwargs)

    def test_batches_use_series_date_conflict_key_and_decimal_values(self):
        source, rows = module.validate_payload(response())
        uuid = "00000000-0000-0000-0000-000000000001"
        with patch.object(module, "supabase_settings", return_value=("https://example.supabase.co", {"apikey": "hidden"})), patch.object(
            module, "request_json", side_effect=[[], [], [{"series_id": uuid}], None]
        ) as request:
            self.assertEqual(module.apply_rows(source, rows, "BRENT_CRUDE"), 1)
            call = request.call_args_list[-1]
            self.assertIn("on_conflict=series_id,observation_date", call.args[0])
            self.assertEqual(call.kwargs["payload"][0]["series_id"], uuid)
            self.assertEqual(call.kwargs["payload"][0]["value"], "126.55")


if __name__ == "__main__":
    unittest.main()
