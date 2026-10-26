"""Return the same wide price table whatever the source.
Training reads the CSV; serving can read Supabase through the same interface."""
import pandas as pd
from .config import NAMES, OBS_CSV


def load_wide(path=None) -> pd.DataFrame:
    obs = pd.read_csv(path or OBS_CSV, parse_dates=["date"])
    obs = obs[(obs["value_status"] == "observed") & obs["series"].isin(NAMES.values())]
    if obs.duplicated(["date", "series"]).any():
        raise ValueError("Duplicate (date, series) rows; resolve before training.")
    inverse = {v: k for k, v in NAMES.items()}
    wide = obs.pivot(index="date", columns="series", values="value").rename(columns=inverse).sort_index()
    missing = set(NAMES) - set(wide.columns)
    if missing:
        raise ValueError(f"Series missing from data: {sorted(missing)}")
    return wide


DB_SERIES = {
    "SGP_MGO_OBSERVED": "mgo", "SGP_GASOIL_FUT": "gasoil", "BRENT_CRUDE": "brent",
    "DUBAI_CRUDE": "dubai", "USD_INDEX": "usd",
}


def load_wide_supabase(observations, as_of):
    """Validate one backend DB snapshot, held only in memory. No CSV fallback.

    Legacy source-defined futures units are resolved ONLY for the exact product URL
    whose USD/barrel definition is verified in the repository's series dictionary.
    No numeric conversion or database metadata rewrite is performed.
    """
    import json
    import numpy as np
    from .config import ROOT
    definitions = {r['series']: r for r in json.loads((ROOT / 'data/series_dictionary.json').read_text())}
    rows = []
    for row in observations:
        column = DB_SERIES.get(row['series'])
        if column is None:
            raise ValueError('Unexpected model input series.')
        definition = definitions[NAMES[column]]
        if row.get('source_url') != definition['source']:
            raise ValueError(f'Unverified provider product for {column}.')
        expected = {'mgo': 'USD/MT', 'usd': 'index'}.get(column, 'USD/barrel')
        unit = row.get('unit')
        if unit == 'source-defined' and column in ('gasoil', 'dubai'):
            if definition['unit_status'] != 'verified' or definition['unit'] != 'USD/barrel':
                raise ValueError(f'Unverified units for {column}.')
        elif unit != expected:
            raise ValueError(f'Incompatible units for {column}.')
        providers = {'mgo': {'The Maritime'}, 'brent': {'FRED'}, 'usd': {'FRED'},
                     'gasoil': {'Investing.com', 'Investing.com manual export'},
                     'dubai': {'Investing.com', 'Investing.com manual export'}}
        if row.get('source') not in providers[column]:
            raise ValueError(f'Unexpected provider for {column}.')
        currency = row.get('currency')
        if currency != 'USD' and not (column == 'usd' and currency is None) and not (
                column in ('gasoil', 'dubai') and unit == 'source-defined' and currency is None):
            raise ValueError(f'Incompatible currency for {column}.')
        date = pd.Timestamp(row['date'])
        value = float(row['value'])
        if date > pd.Timestamp(as_of) or not np.isfinite(value) or value <= 0:
            raise ValueError('Invalid model observation date or price.')
        rows.append({'date': date, 'series': column, 'value': value})
    obs = pd.DataFrame(rows, columns=['date', 'series', 'value'])
    if obs.duplicated(['date', 'series']).any():
        raise ValueError('Duplicate database series/date.')
    wide = obs.pivot(index='date', columns='series', values='value').sort_index()
    if set(DB_SERIES.values()) - set(wide.columns):
        raise ValueError('Required database price series are missing.')
    return wide
