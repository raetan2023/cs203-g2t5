"""Decision-day Ridge with observed market targets and paired GDELT inputs.

No mock prices, return multiplier, or constant directional assumption. Price labels
are exact observed day+h targets. Walk-forward evaluation purges immature labels.
"""
import hashlib
import pickle
import numpy as np
import pandas as pd
from sklearn.linear_model import RidgeCV
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

MARKETS = {'gasoil': 1, 'brent': 3, 'dubai': 1, 'usd': 5}
FEATURES = ['mgo_ret5', 'quote_age', 'basis', 'gdelt_log_count', 'gdelt_tone'] + [f'{k}_{metric}' for k in MARKETS for metric in ('ret5', 'age')]


def latest(series, cutoff):
    known = series.dropna().loc[:cutoff]
    if known.empty:
        raise ValueError('Insufficient causal observation history')
    return float(known.iloc[-1]), known.index[-1]


def features(wide, news, origin):
    origin = pd.Timestamp(origin)
    quote, quote_date = latest(wide.mgo, origin - pd.Timedelta(days=1))
    previous, _ = latest(wide.mgo, origin - pd.Timedelta(days=6))
    result = {'mgo_ret5': np.log(quote / previous), 'quote_age': (origin - quote_date).days}
    dates = {'mgo': str(quote_date.date())}
    for key, lag in MARKETS.items():
        value, date = latest(wide[key], origin - pd.Timedelta(days=lag))
        previous, _ = latest(wide[key], origin - pd.Timedelta(days=lag+5))
        result[f'{key}_ret5'] = np.log(value / previous)
        result[f'{key}_age'] = (origin - date).days
        dates[key] = str(date.date())
        if key == 'gasoil':
            result['basis'] = np.log(quote / value)
    available = news.loc[news.index < origin].dropna(subset=['count', 'tone'])
    if available.empty:
        raise ValueError('Paired completed GDELT count/tone required')
    day = available.index[-1]
    if (origin - day).days > 7:
        raise ValueError('Paired GDELT inputs are older than seven days')
    result['gdelt_log_count'] = np.log1p(float(available.iloc[-1]['count']))
    result['gdelt_tone'] = float(available.iloc[-1]['tone'])
    dates['gdelt'] = str(day.date())
    frame = pd.DataFrame([result], columns=FEATURES)
    if not np.isfinite(frame.to_numpy()).all():
        raise ValueError('Nonfinite model features')
    return frame, quote, dates


def training_table(wide, observed_news, horizon, cutoff):
    rows = []
    for target, price in wide.mgo.dropna().sort_index().items():
        if target >= pd.Timestamp(cutoff):
            continue
        origin = target - pd.Timedelta(days=horizon)
        try:
            x, quote, dates = features(wide, observed_news, origin)
        except ValueError:
            continue
        # Historical training uses the exact prior news day, never invented gaps.
        if dates['gdelt'] != str((origin-pd.Timedelta(days=1)).date()):
            continue
        rows.append(dict(x.iloc[0], origin=origin, target=target,
                         anchor=quote, actual=float(price), y=np.log(float(price)/quote)))
    table = pd.DataFrame(rows)
    if len(table) < 30:
        raise ValueError(f'Insufficient paired observed price/news labels: {len(table)}/30')
    return table


def fit(table):
    # All tuning folds are chronological and discard labels not mature at validation.
    folds = []
    for start in np.linspace(len(table)//2, len(table)-5, 3, dtype=int):
        validation = np.arange(start, min(start+5, len(table)))
        training = np.flatnonzero((table.target < table.iloc[start].origin).to_numpy())
        if len(training) >= 10:
            folds.append((training, validation))
    # With a short mature cohort, analytic RidgeCV tuning uses only these past labels.
    # The outer evaluation still strictly excludes all immature targets.
    return make_pipeline(StandardScaler(), RidgeCV(alphas=[1.,10.,100.,1000.], cv=folds or None,
                         scoring='neg_mean_absolute_error')).fit(table[FEATURES], table.y)


def train(wide, observed_news, horizon, cutoff):
    table = training_table(wide, observed_news, horizon, cutoff)
    residuals, errors, baseline = [], [], []
    for i, row in table.iterrows():
        known = table[table.target < row.origin]
        if len(known) < 25:
            continue
        try:
            model = fit(known)
        except ValueError:
            continue
        prediction = row.anchor * np.exp(float(model.predict(table.loc[[i], FEATURES])[0]))
        residuals.append(np.log(row.actual/prediction))
        errors.append(abs(row.actual-prediction))
        baseline.append(abs(row.actual-row.anchor))
    if len(residuals) < 5:
        raise ValueError('At least five chronological predictions required for empirical ranges')
    return {'model': fit(table), 'horizon': horizon, 'cutoff': str(pd.Timestamp(cutoff).date()),
            'trained_through': str(table.target.max().date()), 'residuals': residuals,
            'training_rows': len(table), 'evaluation_rows': len(errors),
            'mae': float(np.mean(errors)), 'persistence_mae': float(np.mean(baseline))}


def predict(bundle, wide, news, origin):
    origin = pd.Timestamp(origin)
    if pd.Timestamp(bundle['trained_through']) >= origin:
        raise ValueError('Training targets must mature before the decision day')
    x, quote, dates = features(wide, news, origin)
    model = bundle['model']
    log_return = float(model.predict(x)[0])
    central = quote*np.exp(log_return)
    low, high = central*np.exp(np.quantile(bundle['residuals'], [.1,.9]))
    if not np.isfinite([central,low,high]).all() or min(central,low,high) <= 0:
        raise ValueError('Model produced invalid prices')
    contributions = model[0].transform(x)[0] * model[-1].coef_
    return {'horizon_days': bundle['horizon'], 'as_of_date': str(origin.date()),
            'forecast_origin_date': str(origin.date()), 'target_date': str((origin+pd.Timedelta(days=bundle['horizon'])).date()),
            'anchor_quote_date': dates['mgo'], 'anchor_price': quote, 'forecast': float(central),
            'low': float(low), 'high': float(high), 'source_dates': dates,
            'artifact_sha256': hashlib.sha256(pickle.dumps(bundle)).hexdigest(),
            'execution': 'src.decision_ridge:standardscaler+ridgecv+gdelt',
            'top_drivers': [{'feature': k, 'contribution': float(v)} for k,v in sorted(zip(FEATURES,contributions), key=lambda p: abs(p[1]), reverse=True)],
            'evaluation': {k:bundle[k] for k in ('training_rows','evaluation_rows','mae','persistence_mae')},
            'limitations': 'Experimental news-aware Ridge. Sparse chronological evaluation; empirical residual range is not calibrated confidence. Input observation ages are retained.'}
