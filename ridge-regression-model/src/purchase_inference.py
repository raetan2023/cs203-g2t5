"""Private stdin/stdout adapter executing the original saved Ridge pipeline.

Uses audited repository CSV data, never unknown-unit live futures or a parallel
model. No HTTP listener, credentials, news features or fallback prediction.
"""
import hashlib
import json
import sys
import pandas as pd
from .config import ARTIFACTS, OBS_CSV, LAG_DAYS
from .data_loader import load_wide
from .predict import predict


def snapshot():
    paths = [*sorted((ARTIFACTS.parent / 'src').glob('*.py')), OBS_CSV, *sorted(ARTIFACTS.glob('ridge_*.*')), *sorted(ARTIFACTS.glob('quantile_*.joblib'))]
    return {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in paths if p.is_file()}


def infer(horizon, as_of):
    before = snapshot()
    wide = load_wide()
    result = predict(horizon, as_of, wide)
    after = snapshot()
    if before != after:
        raise RuntimeError('Model artifacts or input snapshot changed during inference; retry.')
    result['inference_snapshot'] = hashlib.sha256(json.dumps(after, sort_keys=True).encode()).hexdigest()
    result['input_snapshot'] = after[OBS_CSV.name]
    result['artifact_sha256'] = after[f'ridge_{horizon}d.joblib']
    result['model_version'] += '-sha256-' + result['artifact_sha256']
    result['execution'] = 'src.predict.predict:standardscaler+ridgecv'
    anchor = pd.Timestamp(result['anchor_quote_date'])
    result['source_dates'] = {'mgo': result['anchor_quote_date']}
    for column, lag in LAG_DAYS.items():
        available = wide[column].dropna().loc[:anchor - pd.Timedelta(days=lag)]
        result['source_dates'][column] = str(available.index.max().date())
    return result


def main():
    request = json.load(sys.stdin)
    try:
        result = infer(request['horizon_days'], request['as_of_date'])
        print(json.dumps({'status': 'ready', **result}, allow_nan=False))
    except (ValueError, FileNotFoundError, RuntimeError) as error:
        print(json.dumps({'status': 'unavailable', 'message': str(error)}))


if __name__ == '__main__':
    main()
