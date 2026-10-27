"""Real saved artifacts, no replacement model or fabricated market prices."""
import hashlib
import json
import subprocess
import sys
from pathlib import Path
from unittest.mock import patch
import pytest
from src.config import ARTIFACTS, ROOT, NAMES
from src.data_loader import load_wide, load_wide_supabase, DB_SERIES
from src.predict import predict
from src.purchase_inference import infer



def database_rows():
    # The same audited historical values, shaped like the backend's DB snapshot.
    definitions = {r['series']: r for r in json.loads((ROOT / 'data/series_dictionary.json').read_text())}
    inverse = {v:k for k,v in DB_SERIES.items()}
    rows=[]
    for column, series in load_wide().items():
        for date,value in series.dropna().items():
            rows.append({'series':inverse[column], 'source': 'The Maritime' if column=='mgo' else 'FRED' if column in ('brent','usd') else 'Investing.com manual export',
                'source_url':definitions[NAMES[column]]['source'], 'unit': 'USD/MT' if column=='mgo' else 'index' if column=='usd' else 'source-defined' if column in ('gasoil','dubai') else 'USD/barrel',
                'currency': 'USD' if column in ('mgo','brent') else None,
                'date':str(date.date()), 'value':str(value)})
    return rows


def test_database_snapshot_executes_saved_model_without_csv_fallback():
    rows = database_rows()
    with patch('src.purchase_inference.load_wide', side_effect=AssertionError('CSV fallback')):
        actual = infer(30, '2026-10-26', rows)
    assert actual['input_source'] == 'supabase'
    assert actual['forecast'] == predict(30, '2026-10-26')['forecast']
    assert actual['anchor_quote_date'] == '2026-10-06'


@pytest.mark.parametrize('change', [
    {'unit':'USD/tonne'}, {'source_url':'https://wrong-product.example'},
    {'value':'NaN'}, {'date':'2026-10-27'}, {'currency':'EUR'}, {'source':'unknown'},
])
def test_database_loader_rejects_incompatible_or_future_observations(change):
    rows = database_rows()
    rows[0] = {**rows[0], **change}
    with pytest.raises(ValueError):
        load_wide_supabase(rows, '2026-10-26')


def test_database_loader_rejects_duplicates_and_missing_series():
    rows = database_rows()
    with pytest.raises(ValueError, match='Duplicate'):
        load_wide_supabase(rows + [rows[0]], '2026-10-26')
    with pytest.raises(ValueError, match='missing'):
        load_wide_supabase([r for r in rows if r['series']!='BRENT_CRUDE'], '2026-10-26')


def test_adapter_executes_same_saved_ridge_with_identifiable_artifact():
    from src.predict import _load
    meta, pipeline = _load('30d')
    # Observe the actual estimator invocation without replacing its numerical result.
    from sklearn.pipeline import Pipeline
    original = Pipeline.predict
    calls = []
    def recording(self, X, *args, **kwargs):
        if 'ridgecv' in self.named_steps:
            calls.append((list(X.columns), self.named_steps['ridgecv'].alpha_))
        return original(self, X, *args, **kwargs)
    with patch.object(Pipeline, 'predict', recording):
        actual = infer(30, '2026-10-26')
    expected = predict(30, '2026-10-26')
    assert calls and calls[0][0] == meta['features']
    assert actual['forecast'] == expected['forecast']
    assert actual['target_date'] == '2026-11-05'
    assert actual['artifact_sha256'] == hashlib.sha256((ARTIFACTS / 'ridge_30d.joblib').read_bytes()).hexdigest()


@pytest.mark.parametrize('h', [7, 14])
def test_expired_targets_are_not_relabelled_as_today_plus_h(h):
    with pytest.raises(ValueError, match='target date has passed'):
        infer(h, '2026-10-26')


def test_private_subprocess_contract_runs_real_model():
    root = Path(__file__).resolve().parents[1]
    result = subprocess.run([sys.executable, '-m', 'src.purchase_inference'], cwd=root,
        input=json.dumps({'horizon_days': 30, 'as_of_date': '2026-10-26', 'observations':database_rows()}),
        text=True, capture_output=True, check=True, timeout=25)
    response = json.loads(result.stdout)
    assert response['status'] == 'ready'
    assert response['execution'] == 'src.predict.predict:standardscaler+ridgecv'
    assert response['forecast'] == predict(30, '2026-10-26')['forecast']


def test_serving_adapter_requires_database_snapshot_instead_of_using_csv():
    result = subprocess.run([sys.executable, '-m', 'src.purchase_inference'], cwd=ROOT,
        input=json.dumps({'horizon_days':7, 'as_of_date':'2026-10-26'}),
        text=True, capture_output=True, check=True, timeout=25)
    response = json.loads(result.stdout)
    assert response['status'] == 'unavailable'
    assert 'Database observations are required' in response['message']
