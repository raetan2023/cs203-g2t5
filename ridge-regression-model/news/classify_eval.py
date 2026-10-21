
import argparse
import json
import os

import numpy as np
import pandas as pd
import requests

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    confusion_matrix,
    precision_recall_fscore_support,
)

from . import config
from .classifier import (
    LABELS,
    SYSTEM,
    build_user,
    classify,
    PROMPT_VERSION,
)


# ============================================================
# API CONFIGURATION
# ============================================================

# Replace with the URL used to retrieve your original JSON response.
API_URL = os.getenv(
    "NEWS_API_URL",
    "https://mgo-historical-events-ahcrwx3.svc.aped-4627-b74a.pinecone.io",
)

API_KEY = os.getenv("NEWS_API_KEY")

# Change these to match your API documentation.
API_KEY_HEADER = "Authorization"
API_KEY_PREFIX = "Bearer "

# Change these parameter names if your API supports date filtering.
API_START_DATE_PARAM = "start_date"
API_END_DATE_PARAM = "end_date"

# Pagination settings. Adapt to your API if pagination is supported.
API_PAGE_PARAM = "page"
API_PAGE_SIZE_PARAM = "page_size"
API_PAGE_SIZE = 100
API_MAX_PAGES = 100

# Classes with fewer test examples are reported but excluded from macro-F1.
MIN_SUPPORT = 10


# ============================================================
# API DATA RETRIEVAL
# ============================================================

def fetch_api_response(start_date=None, end_date=None):
    """
    Retrieve the API response in the same structure as the saved JSON:
        {
            "events": [...]
        }

    Update the authentication, date parameters and pagination
    to match the API that originally produced your JSON file.
    """

    if not API_URL or API_URL == "YOUR_API_URL_HERE":
        raise ValueError("Set NEWS_API_URL to your API endpoint.")

    if not API_KEY:
        raise ValueError("Set NEWS_API_KEY in the environment.")

    headers = {
        API_KEY_HEADER: f"{API_KEY_PREFIX}{API_KEY}",
        "Accept": "application/json",
    }

    params = {}

    if start_date:
        params[API_START_DATE_PARAM] = start_date

    if end_date:
        params[API_END_DATE_PARAM] = end_date

    all_events = []

    with requests.Session() as session:
        for page in range(1, API_MAX_PAGES + 1):
            # This assumes page-number pagination.
            # Remove or change these parameters if your API differs.
            page_params = {
                **params,
                API_PAGE_PARAM: page,
                API_PAGE_SIZE_PARAM: API_PAGE_SIZE,
            }

            response = session.get(
                API_URL,
                headers=headers,
                params=page_params,
                timeout=60,
            )

            response.raise_for_status()
            data = response.json()

            if not isinstance(data, dict) or not isinstance(
                data.get("events"), list
            ):
                raise ValueError(
                    "Unexpected API response. Expected a JSON object "
                    "containing an 'events' list, matching the saved file."
                )

            events = data["events"]

            if not events:
                break

            all_events.extend(events)

            # Generic stopping condition for page-based APIs.
            # Adapt this if your API returns a next-page URL, cursor,
            # has_more flag, or total page count.
            if len(events) < API_PAGE_SIZE:
                break

        else:
            print(
                f"Warning: reached API_MAX_PAGES={API_MAX_PAGES}; "
                "the response may be incomplete."
            )

    if not all_events:
        raise ValueError(
            "The API returned no events. Check the URL, authentication, "
            "date filters and pagination settings."
        )

    # Preserve the original top-level JSON structure.
    return {"events": all_events}


# ============================================================
# LOAD AND NORMALIZE EVENTS
# ============================================================

def headline_for(e) -> str:
    """Real article headline; anchors fall back to their title."""
    return (e.get("source_title") or "").strip() or e["title"].strip()


def load_events(path=None, source="api",
                start_date=None, end_date=None):
    """
    Load events from the API or an existing saved JSON response.
    Return the same DataFrame schema as the original code.
    """

    if source == "api":
        data = fetch_api_response(start_date, end_date)

        # Save the raw response in the original JSON format.
        config.ARTIFACTS.mkdir(parents=True, exist_ok=True)

        (config.ARTIFACTS / "api_response.json").write_text(
            json.dumps(data, indent=2, ensure_ascii=False),
            encoding="utf-8",
        )

    elif source == "json":
        if not path:
            raise ValueError("--file is required when --source=json")

        with open(path, encoding="utf-8") as f:
            data = json.load(f)

    else:
        raise ValueError(f"Unsupported data source: {source}")

    if not isinstance(data, dict) or not isinstance(
        data.get("events"), list
    ):
        raise ValueError("Expected a JSON object with an 'events' list.")

    rows = [
        {
            "id": e["event_id"],
            "date": pd.Timestamp(e["public_date"]),
            "headline": headline_for(e),
            "description": e["description"],
            "category": e["category"],
            "gold": e["screening_status"].startswith("individually"),
        }
        for e in data["events"]
    ]

    if not rows:
        raise ValueError("No events found in the input.")

    return (
        pd.DataFrame(rows)
        .sort_values("date", kind="stable")
        .reset_index(drop=True)
    )


# ============================================================
# EVALUATION METRICS
# ============================================================

def scores(y_true, y_pred, labels=None):
    labels = labels or [c for c in LABELS if c != "other"]

    if len(y_true) == 0:
        raise ValueError("Cannot evaluate an empty dataset.")

    p, r, f, support = precision_recall_fscore_support(
        y_true,
        y_pred,
        labels=labels,
        zero_division=0,
    )

    big = support >= MIN_SUPPORT

    per_class = {
        label: {
            "precision": float(p[i]),
            "recall": float(r[i]),
            "f1": float(f[i]),
            "support": int(support[i]),
        }
        for i, label in enumerate(labels)
        if support[i] > 0
    }

    correct = np.asarray(y_true) == np.asarray(y_pred)
    accuracy = float(np.mean(correct))

    rng = np.random.default_rng(42)

    boots = [
        np.mean(
            correct[
                rng.integers(0, len(correct), len(correct))
            ]
        )
        for _ in range(1000)
    ]

    confusion_labels = list(dict.fromkeys(
        list(labels) + ["other", "invalid"]
    ))

    return {
        "n": int(len(y_true)),
        "accuracy": accuracy,
        "accuracy_CI95": [
            float(np.quantile(boots, 0.025)),
            float(np.quantile(boots, 0.975)),
        ],
        "macro_f1_classes_with_support": (
            float(f[big].mean()) if big.any() else None
        ),
        "classes_in_macro": [
            label
            for label, included in zip(labels, big)
            if included
        ],
        "per_class": per_class,
        "confusion": {
            "labels": confusion_labels,
            "matrix": confusion_matrix(
                y_true,
                y_pred,
                labels=confusion_labels,
            ).tolist(),
        },
    }


# ============================================================
# BASELINE MODELS
# ============================================================

def baselines(df, split=0.6):
    if not 0 < split < 1:
        raise ValueError("--split must be between 0 and 1.")

    cut = int(len(df) * split)

    if cut < 1 or cut >= len(df):
        raise ValueError(
            "Not enough events for the requested train/test split."
        )

    tr = df.iloc[:cut]
    te = df.iloc[cut:]

    majority = tr["category"].mode()[0]

    vec = TfidfVectorizer(
        ngram_range=(1, 2),
        sublinear_tf=True,
        min_df=1,
    )

    clf = LogisticRegression(max_iter=2000)

    clf.fit(
        vec.fit_transform(tr["headline"]),
        tr["category"],
    )

    pred = clf.predict(vec.transform(te["headline"]))

    return te, {
        "majority_class": {
            "class": majority,
            **scores(
                te["category"].tolist(),
                [majority] * len(te),
            ),
        },
        "tfidf_logreg": scores(
            te["category"].tolist(),
            pred.tolist(),
        ),
        "train_n": int(len(tr)),
        "test_n": int(len(te)),
        "test_from": str(te["date"].min().date()),
    }


# ============================================================
# COMPLETE EVALUATION PIPELINE
# ============================================================

def run_on_dataframe(df, limit=None, llm=None,
                     workers=4, split=0.6):
    te, base = baselines(df, split)

    out = {
        "prompt_version": PROMPT_VERSION,
        "input": "headline only (source_title, else title for anchors)",
        "baselines": base,
    }

    if llm is not None:
        if limit is None or limit >= len(df):
            sub = df.copy()
        else:
            sub = (
                df.sample(limit, random_state=42)
                .sort_values("date")
                .copy()
            )

        res = classify(
            sub["headline"].tolist(),
            llm,
            workers,
        )

        sub = sub.assign(
            pred=[r["category"] for r in res],
            conf=[r["confidence"] for r in res],
            reason=[r["reason"] for r in res],
        )

        in_test = sub["date"] >= te["date"].min()

        out["llm"] = {
            "model": llm.name,
            "n_scored": int(len(sub)),
            "invalid_rate": float(
                (sub["pred"] == "invalid").mean()
            ),
            "other_rate": float(
                (sub["pred"] == "other").mean()
            ),
            "all_scored": scores(
                sub["category"].tolist(),
                sub["pred"].tolist(),
            ),
            "same_test_period_as_baselines": (
                scores(
                    sub.loc[in_test, "category"].tolist(),
                    sub.loc[in_test, "pred"].tolist(),
                )
                if in_test.sum() >= 20
                else "too few"
            ),
            "gold_reviewed_only": (
                scores(
                    sub.loc[sub["gold"], "category"].tolist(),
                    sub.loc[sub["gold"], "pred"].tolist(),
                )
                if sub["gold"].sum() >= 8
                else "too few"
            ),
        }

        config.ARTIFACTS.mkdir(parents=True, exist_ok=True)

        sub[sub["pred"] != sub["category"]].to_csv(
            config.ARTIFACTS / "news_classify_errors.csv",
            index=False,
        )

    return out


# ============================================================
# COMMAND-LINE INTERFACE
# ============================================================

def main():
    ap = argparse.ArgumentParser()

    ap.add_argument(
        "--source",
        choices=["api", "json"],
        default="api",
    )
    ap.add_argument("--file")
    ap.add_argument("--start-date")
    ap.add_argument("--end-date")
    ap.add_argument("--limit", type=int)
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--split", type=float, default=0.6)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--baseline-only", action="store_true")

    a = ap.parse_args()

    if a.limit is not None and a.limit < 1:
        ap.error("--limit must be at least 1")

    df = load_events(
        path=a.file,
        source=a.source,
        start_date=a.start_date,
        end_date=a.end_date,
    )

    print(f"Source: {a.source}")
    print(f"Loaded {len(df)} events.")
    print(f"Date range: {df['date'].min()} to {df['date'].max()}")

    if a.dry_run:
        n = min(a.limit, len(df)) if a.limit else len(df)
        example_index = min(5, len(df) - 1)

        print("SYSTEM PROMPT:\n" + SYSTEM)
        print(
            "\nEXAMPLE USER MESSAGE:\n"
            + build_user(df["headline"].iloc[example_index])
        )
        print(
            f"\nUp to {n} classification calls planned. "
            "No LLM calls were made."
        )
        return

    llm = None

    if not a.baseline_only:
        from .llm import build_llm
        llm = build_llm()

    result = run_on_dataframe(
        df,
        limit=a.limit,
        llm=llm,
        workers=a.workers,
        split=a.split,
    )

    result["data_source"] = a.source
    result["articles_loaded"] = int(len(df))
    result["data_start"] = str(df["date"].min())
    result["data_end"] = str(df["date"].max())

    config.ARTIFACTS.mkdir(parents=True, exist_ok=True)

    output_path = config.ARTIFACTS / "news_classify_eval.json"

    output_path.write_text(
        json.dumps(result, indent=2),
        encoding="utf-8",
    )

    base = result["baselines"]
    majority = base["majority_class"]
    tfidf = base["tfidf_logreg"]

    print(
        f"\nBASELINES on the last {base['test_n']} events "
        f"(from {base['test_from']}), trained on the earlier "
        f"{base['train_n']}:"
    )

    print(
        f"  Always '{majority['class']}': "
        f"accuracy {majority['accuracy']:.3f}"
    )

    print(
        f"  TF-IDF + logistic regression: "
        f"accuracy {tfidf['accuracy']:.3f} "
        f"{[round(x, 3) for x in tfidf['accuracy_CI95']]}, "
        f"macro-F1 {tfidf['macro_f1_classes_with_support']}"
    )

    if "llm" in result:
        llm_result = result["llm"]

        print(
            f"LLM {llm_result['model']}: "
            f"scored {llm_result['n_scored']}, "
            f"invalid {llm_result['invalid_rate']:.1%}, "
            f"'other' {llm_result['other_rate']:.1%}"
        )

        for key in (
            "all_scored",
            "same_test_period_as_baselines",
            "gold_reviewed_only",
        ):
            metric = llm_result[key]

            if isinstance(metric, str):
                print(f"  {key}: {metric}")
            else:
                print(
                    f"  {key}: n={metric['n']} "
                    f"accuracy={metric['accuracy']:.3f} "
                    f"95% CI={metric['accuracy_CI95']} "
                    f"macro-F1="
                    f"{metric['macro_f1_classes_with_support']}"
                )

    print(f"\nEvaluation saved to: {output_path}")


if __name__ == "__main__":
    main()
