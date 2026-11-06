"""Private decision-day news-aware Ridge adapter; legacy infer retained for audits.

Uses a validated database snapshot when supplied by the backend. No HTTP listener, credentials or mock prediction.
"""
import hashlib
import json
import sys
import pandas as pd
import math
from .config import ARTIFACTS, OBS_CSV, LAG_DAYS
from .data_loader import load_wide, load_wide_supabase
from .predict import predict


def snapshot(include_csv=True):
    paths = [*sorted((ARTIFACTS.parent / 'src').glob('*.py')), *([OBS_CSV] if include_csv else []), ARTIFACTS.parent / 'data/series_dictionary.json', *sorted(ARTIFACTS.glob('ridge_*.*')), *sorted(ARTIFACTS.glob('quantile_*.joblib'))]
    return {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in paths if p.is_file()}


def infer_decision(horizon, as_of, observations=None):
    if not isinstance(observations, list) or horizon not in (7, 14, 30):
        raise ValueError('A database observation snapshot and supported horizon are required')
    for row in observations:
        is_news = row['series'] in ('GDELT_ARTICLE_COUNT', 'GDELT_AVERAGE_TONE')
        kind = row.get('value_type', 'OBSERVED')
        if kind != 'OBSERVED' and not (is_news and kind == 'ESTIMATED'):
            raise ValueError('Only labelled news inputs may be estimated')
        if is_news:
            value = float(row['value'])
            unit = 'articles' if row['series'] == 'GDELT_ARTICLE_COUNT' else 'tone'
            if row.get('source') != 'GDELT' or row.get('unit') != unit or pd.Timestamp(row['date']) > pd.Timestamp(as_of) or not math.isfinite(value):
                raise ValueError('Invalid GDELT source, units, date or value')
            if unit == 'articles' and (value < 0 or value != int(value)):
                raise ValueError('GDELT article counts must be nonnegative integers')
    before = snapshot(observations is None)
    wide = load_wide() if observations is None else load_wide_supabase([r for r in observations if r['series'] not in ('GDELT_ARTICLE_COUNT', 'GDELT_AVERAGE_TONE')], as_of)
    input_hash = hashlib.sha256(json.dumps(observations, sort_keys=True).encode()).hexdigest()
    from .decision_ridge import train, predict as predict_decision
    news_rows = [r for r in (observations or []) if r['series'] in ('GDELT_ARTICLE_COUNT', 'GDELT_AVERAGE_TONE')]
    news_frame = pd.DataFrame(news_rows)
    if news_frame.empty:
        raise ValueError('Database GDELT inputs are required for decision-day Ridge.')
    news_frame['date'] = pd.to_datetime(news_frame['date'])
    news_frame['value'] = pd.to_numeric(news_frame['value'])
    def news_table(rows):
        return rows.pivot(index='date', columns='series', values='value').rename(columns={
            'GDELT_ARTICLE_COUNT': 'count', 'GDELT_AVERAGE_TONE': 'tone'}).sort_index()
    observed = news_frame[news_frame.get('value_type', pd.Series('OBSERVED', index=news_frame.index)) == 'OBSERVED']
    news = news_table(news_frame)
    bundle = train(wide, news_table(observed), horizon, as_of)
    result = predict_decision(bundle, wide, news, as_of)
    result['unit'] = 'USD/metric tonne'
    result['raw_q10_price'] = result['low']
    result['raw_q90_price'] = result['high']
    result['model_version'] = f"ridge-decision-gdelt-{horizon}d-sha256-{result['artifact_sha256']}"
    after = snapshot(observations is None)
    if before != after:
        raise RuntimeError('Model artifacts or input snapshot changed during inference; retry.')
    result['inference_snapshot'] = hashlib.sha256(json.dumps(after, sort_keys=True).encode()).hexdigest()
    result['input_snapshot'] = input_hash
    result['input_source'] = 'supabase' if observations is not None else 'csv'
    result['inference_snapshot'] = hashlib.sha256((result['inference_snapshot'] + input_hash).encode()).hexdigest()
    return result


def infer(horizon, as_of, observations=None):
    before = snapshot(observations is None)
    wide = load_wide() if observations is None else load_wide_supabase(observations, as_of)
    input_hash = hashlib.sha256(wide.to_json(date_format="iso", double_precision=15).encode()).hexdigest()
    result = predict(horizon, as_of, wide)
    after = snapshot(observations is None)
    if before != after:
        raise RuntimeError('Model artifacts or input snapshot changed during inference; retry.')
    result['inference_snapshot'] = hashlib.sha256(json.dumps(after, sort_keys=True).encode()).hexdigest()
    result['input_snapshot'] = input_hash
    result['input_source'] = 'supabase' if observations is not None else 'csv'
    result['inference_snapshot'] = hashlib.sha256((result['inference_snapshot'] + input_hash).encode()).hexdigest()
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
        if not isinstance(request.get('observations'), list):
            raise ValueError('Database observations are required for purchase inference.')
        result = infer_decision(request['horizon_days'], request['as_of_date'], request['observations'])
        print(json.dumps({'status': 'ready', **result}, allow_nan=False))
    except (ValueError, FileNotFoundError, RuntimeError) as error:
        print(json.dumps({'status': 'unavailable', 'message': str(error)}))


if __name__ == '__main__':
    main()
