import numpy as np
import pandas as pd
import pytest
from src.decision_ridge import train, predict, FEATURES

@pytest.fixture(scope='module')
def inputs():
    days=pd.date_range('2025-01-01',periods=200)
    t=np.arange(len(days))
    wide=pd.DataFrame({'mgo':700+20*np.sin(t/9)+t*.3,'gasoil':90+np.sin(t/7),
        'brent':80+np.sin(t/11),'dubai':75+np.sin(t/12),'usd':110+np.cos(t/13)},index=days)
    news=pd.DataFrame({'count':1000+50*np.sin(t/5),'tone':-2+np.cos(t/9)},index=days)
    return wide,news,days[-1]+pd.Timedelta(days=1)

@pytest.mark.parametrize('h',[7,14,30])
def test_executes_news_aware_model_for_decision_day_horizons(inputs,h):
    wide,news,day=inputs
    bundle=train(wide,news,h,day)
    result=predict(bundle,wide,news,day)
    assert result['target_date']==str((day+pd.Timedelta(days=h)).date())
    assert pd.Timestamp(bundle['trained_through'])<day
    assert result['evaluation']['evaluation_rows']>=5
    assert 0<result['low']<=result['high']
    assert 'gdelt_tone' in FEATURES and 'gdelt_log_count' in FEATURES
    changed=news.copy();changed.loc[changed.index[-1],'tone']+=1
    assert predict(bundle,wide,changed,day)['forecast']!=result['forecast']
    assert result['execution']=='src.decision_ridge:standardscaler+ridgecv+gdelt'
    assert len(result['artifact_sha256'])==64

def test_future_observations_cannot_change_current_prediction(inputs):
    wide,news,day=inputs
    bundle=train(wide,news,7,day)
    original=predict(bundle,wide,news,day)
    future=wide.copy();future.loc[day+pd.Timedelta(days=1)]=1e9
    future_news=news.copy();future_news.loc[day]=[1e9,100]
    assert predict(bundle,future,future_news,day)['forecast']==original['forecast']
    with pytest.raises(ValueError,match='seven days'):
        predict(bundle,wide,news.iloc[:-8],day)
