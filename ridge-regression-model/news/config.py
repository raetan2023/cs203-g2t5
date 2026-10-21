"""Settings for the news-impact pipeline. Fill the FIELD NAMES after running `python -m news.audit_pinecone`.

Outcome values are used exactly as stored (fraction, percent or log return). Keep ONE unit and say which in the UI."""
import os
from pathlib import Path

DATE_FIELD = os.environ.get("NEWS_DATE_FIELD", "event_date")     # metadata field holding the event date
TEXT_FIELD = os.environ.get("NEWS_TEXT_FIELD", "text")           # metadata field holding the description
# outcome name -> metadata field. Edit to match the index (e.g. {"mgo": "mgo_ret_7d", "brent": "brent_ret_7d"}).
OUTCOME_FIELDS = {"mgo": "mgo_ret_7d", "brent": "brent_ret_7d"}
OUTCOME_DEFAULT = "mgo"
OUTCOME_HORIZON_DAYS = int(os.environ.get("NEWS_HORIZON_DAYS", "7"))   # how long after an event its effect is measured

EMBED_MODEL = os.environ.get("NEWS_EMBED_MODEL", "text-embedding-3-small")  # MUST equal the model used to fill the index
TOP_K = 8                    # fixed in advance; do not tune it on the evaluation
MIN_NEIGHBOURS = 3
MIN_SIMILARITY = 0.0
DIRECTION_AGREEMENT_MIN = 0.65   # below this the answer is reported as 'mixed'

ARTIFACTS = Path(__file__).resolve().parents[1] / "artifacts"
EVENTS_NPZ = Path(os.environ.get("NEWS_EVENTS_NPZ", ARTIFACTS / "news_events.npz"))
EVAL_JSON = ARTIFACTS / "news_eval.json"

# live news source (GDELT DOC 2.0 API: roughly the most recent 3 months only; 1 request per 5 seconds)
GDELT_QUERY = ('(oil OR crude OR "marine fuel" OR bunker OR OPEC OR refinery OR tanker OR Hormuz OR "Red Sea" '
               'OR sanctions OR "Suez Canal") sourcelang:english')
GDELT_TIMESPAN = "3d"
