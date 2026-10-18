from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import RidgeCV
from sklearn.model_selection import TimeSeriesSplit
from .config import ALPHAS


def make_model():
    return make_pipeline(
        StandardScaler(),
        RidgeCV(alphas=ALPHAS, cv=TimeSeriesSplit(5), scoring="neg_mean_absolute_error"),
    )
