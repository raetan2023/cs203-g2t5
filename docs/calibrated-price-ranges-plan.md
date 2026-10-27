# Calibrated buyer price ranges: audit and implementation plan

Base: origin/main f395627 (25 October 2026). Scope: active ridge-regression-model forecast horizons (7/14/30d), FastAPI contract and existing preview widget. The Spring proxy/live dashboard integration is separate unfinished work; do not silently replace it or claim deployment.

## Audit

- Active service uses Ridge point estimates and symmetric empirical residual ranges, not q10/q90 models. Older models/ experiments are not the serving path.
- Existing walk-forward purges labels whose target date has not passed. Preserve this rule everywhere.
- train._range_stats selects interval method against all outcomes, including holdout. New intervals must use a fixed rule without selecting against test coverage.
- Historical predict(as_of) loads a full-data fitted model. New artifacts must record latest used label date and reject dates before that cutoff.
- Only 253 irregular MGO quotes exist; horizon tables are smaller. Prefer regularized linear quantiles over additional boosting dependencies or unvalidated hyperparameter searches.
- React widget currently serves synthetic data; MAE skill/evidence is not calibrated coverage. Forecast target is anchor+h, not stale request date+h.

## Proposed design for independent review

1. Keep Ridge central predictions and additive feature drivers unchanged. Add standardized sklearn QuantileRegressor at q=.1/.9, fixed alpha=.01 and highs solver; use existing FEATURES and log-return labels. Do not apply Ridge gamma to quantiles.
2. At each walk-forward origin, use only rows with target_date < origin. Use the last 20 mature rows as calibration, with at least 30 proper training rows; purge proper-training labels reaching the first calibration origin. Fit scalers/models only on the proper subset.
3. Sort predicted endpoints. Use expansion-only CQR score max(q10-y,y-q90,0), with ceil((n+1)*.8) order statistic. Compare a persistence baseline calibrated on the exact same suffix using absolute log returns. Retain raw and calibrated endpoints separately. Ridge point need not be inside the interval; do not clamp it or widen the evaluated interval just for display.
4. Refit the same split rule at artifact creation, retain calibration models without refitting on their calibration outcomes, and record latest used target date. Serve only matched-version quantile artifacts; missing new artifacts explicitly require training. Preserve low/high API names and add typed range metadata, nominal coverage, empirical coverage/count/scope, baseline results, target_date, and limitations.
5. Report paired raw/calibrated/persistence coverage, tails, mean price width, interval score and raw quantile pinball losses on identical rows; dev requires both origin and target before DEV_END, holdout starts at DEV_END. Show sample counts and sparse/dependent-data limitations. No guaranteed 80% claim for market time series.
6. Fix frozen forward evaluation cutoff to latest used label date and evaluate the frozen quantile/baseline interval rule without retraining. Keep unrelated nowcast behavior scoped out.
7. Label the widget synthetic; show nominal vs empirical coverage only when available, correct target-date anchoring, and remove inference that no_edge necessarily means persistence.
8. Verify chronology/future mutation independence, target purges, crossings, finite positive ordered bounds, insufficient data, save/load, API metadata, real-data chronological evaluation and frontend tests/build. Preserve baseline frozen artifacts; report exact reproducible commands and results.

## Research

- sklearn QuantileRegressor: https://scikit-learn.org/stable/modules/generated/sklearn.linear_model.QuantileRegressor.html (pinball loss with L1 regularization, HiGHS solver).
- Romano, Patterson, Candes, Conformalized Quantile Regression (2019): https://arxiv.org/abs/1905.03222 (split calibration; exchangeability assumptions mean nominal coverage is not a guarantee for these dependent series).
- sklearn quantile interval example: https://scikit-learn.org/1.5/auto_examples/ensemble/plot_gradient_boosting_quantile.html (quantile endpoints and empirical evaluation; no evidence here justifies selecting boosting).

## Independent plan reviews and decisions

Three independent reviewers audited modelling, integration and statistics. All approved the architecture; their changes were incorporated before final verification:

- Modelling: keep QR independent of Ridge gamma; minimum 30 proper rows applies after label purge; sort crossings before calibration; retain sorted raw endpoints. Chose regularized linear models given sparse data, not unvalidated boosting complexity.
- Statistics: fixed 20-point calibration gives a coarse 17th-order correction; no exchangeable-series guarantee. Compare both tails, width and interval score on paired rows. Preserve training-time development cutoff, and distinguish retrospectively examined data from a genuinely new prospective holdout.
- Integration: preserve Ridge point/drivers even outside the range; do not enforce point containment. Record latest used target date, validate shared training-run IDs, reject historical replay, and score frozen future intervals without retraining. UI stays explicitly synthetic; target date follows the quote anchor.

No reviewer identified a remaining blocking statistical issue after these refinements. Frozen old artifacts remain unchanged in `artifacts/frozen_baseline_20261021_0935/`. Active forecast artifacts/reports are regenerated; nowcast fitting/serving is outside this change.

## Empirical result and release decision

New chronological intervals meet the story's training/evaluation requirement, but are experimental. They do **not** establish superiority to persistence. Do not promote this result as a validated purchasing advantage or silently tune the method against these test outcomes. Keep the real comparative results available for review and future frozen evaluation; a later iteration needs new observations and a predeclared method.
