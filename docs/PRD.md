# Product Requirements Document

Status: Working draft - clarification in progress
Last updated: 2026-09-15
Source: CS203-G2-team5-project-vision.pdf (9 pages), supplemented by team clarification in this conversation.

## 1. Product purpose

Help marine fuel procurement officers and bunker buyers purchasing in Singapore understand near-term market movements, assess the potential cost impact on a planned purchase, and consider an advisory purchasing action.

The current vision is to use Singapore Gasoil futures movements to predict Singapore Marine Gas Oil (MGO) movements. The exact mathematical relationship has not been established. MGO is a product differentiator because access to Singapore MGO data is expensive and often paywalled, according to the team. The team may later pivot to forecasting Gasoil futures directly; that decision remains TBD.

The product must not present an unvalidated Gasoil forecast as a measured or validated MGO price forecast.

## 2. Decision status and interpretation

- **Confirmed by team:** MGO is the current intended output; Gasoil movements are the proposed predictive basis; conversion mathematics remain undecided; a Gasoil-only pivot is possible.
- **Vision requirement:** A requirement stated in the supplied vision, awaiting reconciliation where the vision is internally inconsistent.
- **Proposed:** A suggestion in this PRD, not an approved implementation decision.
- **TBD:** An unresolved decision. No implicit default or delivery commitment is created by listing an option.

The vision's claims about data availability, historical depth, and proxy suitability are source claims, not independently verified findings. The opening statement that the proxy relationship is validated conflicts with later uncertainty about using real MGO data; validation is therefore treated as pending.

## 3. Users and core journey

Primary user: a marine fuel procurement officer or bunker buyer at a shipping company purchasing MGO in Singapore.

Intended journey:

1. Register or log in.
2. Review dated market history and selected indicators.
3. Enter a planned fuel purchase quantity and purchase deadline; review the automatically derived urgency.
4. Review the forecast range, uncertainty, and available explanation.
5. Compare the estimated purchase cost with a stated reference price.
6. Review an advisory action and accept, reject, or ignore it.

Confirmed by team: purchase plans include quantity, purchase deadline, and automatically derived urgency for the MVP. Calculate urgency from the time remaining between the scenario's "as of" date and the purchase deadline, rather than today's date. Users enter quantity and deadline; urgency is not a separate user-selected input. Recommendations must account for the deadline and derived urgency when suggesting an action. Urgency categories, thresholds, calendar-day versus trading-day counting, and date-validation rules remain TBD. The discussed 3-day and 7-day thresholds were illustrative, not agreed. The MVP supports at most one saved purchase plan per user, with create, view, edit, and delete operations. Multiple saved plans and plan comparisons are post-MVP nice-to-haves. A separate delivery date and budget remain TBD.

## 4. Scope and priorities

### Historical-data delivery approach

The team plans to use data only up to a chosen historical cutoff and probably will not conduct a live-market demo. The working delivery assumption is a fixed historical dataset; the exact cutoff and demonstration format remain TBD. This does not by itself remove the interactive application or the vision's public-deployment constraint.

Proposed: show an explicit historical "as of" date throughout the dashboard, forecasts, recommendations, and purchase-impact results. Interpret "current price" as the reference available at that scenario date, not today's market price. Live ingestion, continuous monitoring, and scheduled production retraining are deferred until after the MVP.

Historical change detection could still run as a batch analysis or replay of dated observations. Whether to include it, generate forecasts on demand, or display precomputed forecasts remains TBD.

Recommended approach (team-requested; final decision TBD): generate forecasts ahead of time for supported historical scenario dates and save the results. The application retrieves the saved forecast for a scenario; users can still enter purchase quantities and receive calculated cost impacts. This simplifies the fixed-data demonstration and avoids requiring model inference during the user interaction. Supported dates, saved output contents, and compatibility with course requirements remain TBD. Each saved forecast must still obey the historical information cutoff; precomputation must not introduce future-data leakage.

### Agreed MVP focus

Deliver one complete historical purchase-decision flow: review the dashboard, view a forecast range and uncertainty, create or update one saved purchase plan, calculate its cost impact, and review an explained advisory action with accept/reject controls. Precomputed forecasts remain the recommended delivery approach; the final inference-mode decision remains TBD as previously agreed.

The first feasibility priority is to test whether the available MGO observations support a defensible mapping from Gasoil movements. The MGO conversion and reference-price policy remain unresolved dependencies of credible absolute-price and purchase-cost outputs.

The following scope reflects the team's latest clarification and supersedes conflicting priority statements in the original vision.

| Capability | Current scope | Clarification |
| --- | --- | --- |
| Historical market dashboard | MVP | Show an explicit historical as-of date; distinguish observed MGO, Gasoil futures, and derived MGO estimates |
| Selected historical market indicators | MVP | Final inputs depend on data availability and usefulness |
| Forecast range and uncertainty | MVP | Current target MGO; mapping remains experimental until validated; precomputed delivery recommended, final mode TBD |
| One saved purchase plan per user | MVP | Create, view, edit, and delete; quantity, deadline, and derived urgency |
| Purchase impact calculation | MVP | Requires a valid dated MGO reference and comparable forecast |
| Recommendation and human decision | MVP | Account for deadline/urgency, provide a short explanation, and allow accept/reject |
| Registration and login | MVP | Retain if required by course or agreed vision scope; mechanism TBD. One-plan-per-user persistence requires an agreed user identity and ownership mechanism. |
| Per-prediction SHAP | Method TBD | A short recommendation explanation is required; detailed SHAP visualizations can follow after MVP |
| Keyword-filtered historical GDELT features | TBD | Candidate model input, not an agreed MVP dependency |
| Historical change detection | TBD | Batch/replay may be considered; not a dependency of the agreed minimum flow |
| Broader profile/domain CRUD | TBD | Purchase-plan CRUD is agreed; administration of market records and saved analyses is not yet scoped |

### Nice-to-haves after the MVP

- Multiple saved purchase plans per user and screens to compare plans or purchase scenarios.
- Detailed SHAP visualizations for individual forecasts.
- Live data feeds, continuous monitoring, alerts, and automatic production retraining.
- LLM-based news relevance/impact classification.
- Quantile-regression intervals, as a later modeling option from the vision.

These are backlog candidates, not requirements for completing the MVP or commitments to deliver a later release.

Excluded from the stated product: automatic purchasing or trading. Jet fuel features and paid spread data are later considerations, not committed scope. A generic chatbot is not the main product.

## 5. Functional requirements and acceptance criteria

The criteria below operationalize the vision. Criteria labelled proposed need team agreement.

| ID | Requirement | Acceptance criteria |
| --- | --- | --- |
| FR-01 | Account access | Registration/login remain conditional on course or agreed vision scope. Before implementing per-user persistence, agree a user identity mechanism and enforce ownership so users cannot access another user's private purchase plan or decisions. Authentication and profile scope TBD. |
| FR-02 | Market dashboard | Display historical prices and selected indicators with dates, source labels, currency, units, and whether the value is observed or estimated. |
| FR-03 | Market data ingestion | Import selected historical source data up to a declared dataset cutoff and retain observation dates. Proposed: retain availability timestamps and report missing or invalid inputs rather than silently substituting values. Live refresh is not assumed. |
| FR-04 | Forecast output | Show target commodity, forecast origin, horizon, estimated range, and uncertainty method. The MGO conversion method is TBD; an unvalidated proxy must be identified as such. |
| FR-05 | Uncertainty | Range width responds to market conditions as intended by the vision. A heuristic band is described as heuristic; a numerical confidence claim requires supporting evaluation. |
| FR-06 | Purchase plan and impact | Accept a positive quantity in metric tonnes and a purchase deadline. Automatically derive and display urgency from time remaining relative to the historical scenario date; recompute when the deadline or scenario date changes. Show reference cost, forecast cost range, and difference range using comparable currency and units. Invalid quantities receive a clear error. Urgency categories, thresholds, day-count convention, date validation, and reference-price policy TBD. |
| FR-07 | Recommendation | Provide an advisory action with supporting forecast, uncertainty, assumptions, and the plan's deadline/urgency. Do not recommend delaying beyond the purchase deadline. Proposed: if the forecast horizon does not support the decision window, explain that limitation instead of extrapolating silently. Detailed rules for earlier purchase, partial purchase, delay, and monitor are TBD. Never execute a purchase. |
| FR-08 | User decision | Allow accept, reject, or ignore. Whether ignore is explicit or inferred from no response is TBD. Proposed: persist decisions against the exact recommendation version. |
| FR-09 | Explanation | MVP recommendations include a short explanation grounded in the forecast, uncertainty, and purchase deadline/urgency. Explanation method TBD; do not invent market drivers. If per-prediction SHAP is used, describe associations rather than established causes and distinguish Gasoil-model drivers from MGO conversion assumptions. Detailed SHAP visualizations are post-MVP. |
| FR-10 | Change detection | If in scope, evaluate rolling volatility and/or filtered news against configured thresholds on historical observations using only information available at each scenario date. Batch/replay mode, re-forecast behavior, thresholds, and presentation of flags are TBD. Live alerts are not assumed. |
| FR-11 | Saved purchase-plan management | MVP users can create, view, edit, and delete their own saved purchase plan, with at most one saved plan per user. A saved plan remains available across sessions; editing updates that plan rather than creating another. Deletion permits a new plan to be created. Multiple plans and plan comparisons are post-MVP. Broader domain CRUD and retention of related analyses/decisions after edits or deletion remain TBD. |

## 6. Forecast target and proposed MGO mapping

### Current intent

Forecast Gasoil futures movement, then translate it into an MGO movement or price estimate. The team has not selected or validated the conversion formula. Forecasting Gasoil futures directly remains an alternative product direction.

### Proposed baseline: transfer percentage movement

Start with a simple, testable baseline rather than assuming the two commodities have identical price levels:

- `G0`: observed Gasoil price at forecast origin.
- `Gh`: predicted Gasoil price at horizon `h`.
- `M0`: a reliable MGO reference price at the same origin.
- Predicted Gasoil return: `rG = Gh / G0 - 1`.
- Candidate MGO estimate: `Mh = M0 * (1 + rG)`.

This assumes one-to-one percentage movement. It is a proposed baseline, not an established relationship. Multiplying a dimensionless return by an MGO price avoids directly equating futures and physical-fuel price units, but it does not resolve differences in products, contract maturity, or market behavior.

A current absolute MGO price estimate needs a credible MGO price anchor. Without one, a percentage-movement proxy can be demonstrated, but its output cannot substantiate a current MGO purchase cost. A user-supplied supplier quote is a possible anchor; allowing this input is TBD.

If the only MGO quote is old, do not label it current. A baseline could bridge the movement from that quote's date using observed Gasoil returns and then forecast forward, but that adds accumulated proxy error. Whether such estimates are acceptable, and their maximum anchor age, are TBD.

### Proposed calibrated alternative

If enough usable paired MGO observations are available, compare the baseline with a simple fitted relationship:

`rM = alpha + beta * rG + error`

Pair MGO and Gasoil returns over the same historical intervals. Fit parameters using training data only. Sparse, irregular quotes may span substantially longer intervals than the intended forecast horizon; an apparent relationship over those intervals does not by itself validate a short-horizon forecast.

Retain the simpler baseline unless chronological held-out evidence supports calibration. Whether there is enough data to evaluate either method is TBD.

### Uncertainty and validation boundary

A mapped Gasoil interval is not automatically a calibrated MGO interval. MGO output must account for uncertainty in the futures forecast, mapping error, and anchor freshness. The combination method is TBD. Until evaluated against held-out MGO observations, label the result as an experimental proxy estimate rather than assigning an unsupported MGO coverage probability.

### Possible Gasoil-only pivot

Decision owner, deadline, and go/no-go evidence: TBD. If the team pivots, revise target users, purchase scenario, units, financial-impact logic, terminology, and evaluation. This would be a product scope change, not simply a label change. Proposed: keep forecast records explicit about their target so existing MGO analyses remain interpretable.

## 7. Purchase impact calculation

For a quantity `Q` in metric tonnes, reference MGO price `P0` in USD/MT, and forecast MGO bounds `[L, U]` in USD/MT:

- Reference cost: `Q * P0`.
- Forecast cost range: `[Q * L, Q * U]`.
- Difference from reference: `[Q * (L - P0), Q * (U - P0)]`.

Positive differences represent a higher estimated cost; negative differences represent a lower estimated cost. Currency choice, rounding, inclusion of taxes/delivery charges, reference-price sourcing, and freshness tolerance are TBD. Do not equate a forecast cost difference with realized savings.

Illustration from the vision: 500 MT at USD 720/MT costs USD 360,000; at USD 740/MT it costs USD 370,000, a USD 10,000 increase. These are illustrative values, not market observations.

## 8. Data and modeling requirements

Candidate sources from the vision:

| Series | Named source | Intended role / outstanding issue |
| --- | --- | --- |
| Singapore MGO quotes | [themaritime.net - Port of Singapore](https://themaritime.net/market/bunker/port-of-singapore) | Team reports approximately 2-3 public records per month; additional data is paywalled. Possible calibration, validation, or dated anchor; actual usage TBD. |
| Singapore Gasoil (Platts) futures | Investing.com | Forecast target underlying current proxy approach; contract specification, units, roll treatment, and reliable ingestion TBD |
| Dubai crude futures | Investing.com | Candidate price and spread input |
| Brent crude | FRED DCOILBRENTEU | Candidate price and spread input |
| USD index | FRED DTWEXBGS | Candidate level and return input |
| Singapore bunker sales | data.gov.sg / MPA | Monthly demand indicator; product breakdown and publication lag TBD |
| News/events | GDELT | Keyword-filtered article counts and tone; final MVP priority TBD |

The source lists seven series including MGO while the pipeline refers to six sources. Treat MGO's optional role as unresolved, rather than assuming it is ingested.

The team identified an existing public MGO database with approximately 2-3 records per month. This availability is team-reported; the linked page could not be independently inspected during drafting. Exact observation dates, historical coverage, units, and extraction access still need verification. These records must not be treated as daily ground truth: interpolating or forward-filling them does not create additional observed MGO outcomes for evaluation. Proposed: assess them first for historical proxy validation and calibration, with use as a dated price anchor subject to a separately agreed freshness policy. Purchasing paid data is not an agreed requirement.

Candidate features: lagged Gasoil prices, Dubai and Brent prices, USD index level/change, Brent-Dubai spread, Gasoil-Dubai crack spread, monthly bunker-sales change, rolling averages, volatility, momentum, and filtered news counts/tone.

Requirements:

- Use only data available at the forecast origin. Align monthly sales by release availability before forward-filling; do not expose a month's eventual total earlier in that month.
- Define the forecast cutoff, timezone, trading calendar, horizon, and missing-data policy before training. All remain TBD.
- Distinguish the dataset's final cutoff from each forecast origin and training cutoff. For a historical backtest, later observations within the frozen dataset may be held out as outcomes, but cannot enter that forecast's training or features. A forecast beyond the dataset's final date has no observed outcome in that dataset and cannot be scored there.
- Normalize compatible units before computing price spreads.
- Do not use the target value as a same-time predictor of itself. Lagged or origin-time features must obey the selected forecast cutoff.
- Use chronological splits and walk-forward evaluation; prevent overlapping targets from leaking future information across training and evaluation boundaries.
- The vision proposes XGBoost or LightGBM against naive/moving-average baselines and volatility-based intervals for MVP. It also proposes weekly retraining, which is not assumed necessary for the historical-data approach. Final model choice, historical retraining/backtest protocol, and any operational schedule remain TBD.
- Retain model version, training cutoff, feature configuration, and evaluation results. Tracking mechanism TBD.

## 9. Evaluation and release criteria

The vision proposes directional accuracy, interval coverage, and baseline comparison. Exact thresholds, evaluation dates, forecast horizon, and minimum sample sizes are TBD.

Proposed evaluation additions:

- Report Gasoil-model performance separately from MGO-conversion performance. Gasoil accuracy does not establish MGO accuracy.
- Define up/down/flat using an explicit flat threshold. Because this is a three-class task, exceeding 50% alone is not an adequate acceptance rule; compare with relevant baselines and class frequencies.
- Report absolute-price error alongside direction when the output supports financial calculations.
- Evaluate interval coverage together with interval width so an excessively broad interval does not appear useful solely because it covers most observations.
- Report dated evaluation windows and counts, including the limited MGO sample size.
- Verify an end-to-end historical scenario from market input through forecast, explanation where in scope, purchase impact, recommendation, and human decision. This does not require live market data; presentation or demo format remains TBD.

Whether insufficient MGO evidence triggers reduced output scope, an experimental-only label, or a Gasoil pivot is TBD.

## 10. Technical constraints and quality requirements

The vision lists React, Java Spring Boot, Supabase/Postgres, a Python FastAPI ML service, scheduled pandas pipelines, and Swagger API documentation. It identifies Java Spring Boot, Git/GitHub, Jira, and public cloud deployment as mandatory. These are recorded as source constraints; their status is to be confirmed with the team. Earlier conversation indicated the stack had not been decided.

Proposed service responsibility: the frontend uses the Spring Boot API; Spring Boot manages user/domain workflows and calls the internal ML service; the ingestion layer prepares dated model inputs; persistent records retain the outputs and versions used for each analysis. Exact architecture and deployment provider are TBD.

Proposed quality requirements:

- Protect accounts and enforce record ownership; keep secrets outside version control.
- Display data timestamps and explicit loading, unavailable, stale-data, and model-error states.
- Preserve the inputs and model version behind saved analyses so later updates do not silently change old results.
- Avoid presenting an old forecast as newly generated after an inference failure.
- Keep key flows usable with keyboard navigation and readable uncertainty labels.

Performance targets, availability targets, supported devices, retention policy, recovery strategy, security implementation, budget, and project milestones are TBD.

## 11. Open decision register

All owners and due dates are TBD unless subsequently assigned.

| ID | Decision | Current status / consequence |
| --- | --- | --- |
| D-01 | Final product target: MGO or Gasoil | MGO current; later pivot possible |
| D-02 | MGO conversion mathematics | TBD; percentage-return transfer proposed as baseline |
| D-03 | Real MGO data role and anchor | Public source identified; team reports 2-3 records/month. Calibration/validation use, current-price anchor, and acceptable quote age remain TBD. |
| D-04 | Forecast horizon and calendar | Team explicitly confirmed forecast horizon remains TBD. The vision's 7-day example is not a committed requirement. Calendar convention also remains TBD. |
| D-05 | Change detection, news, and explanation details | Short recommendation explanation required for MVP. Live alerts and detailed SHAP visualizations deferred; historical change detection, keyword-filtered news input, and explanation method remain TBD. |
| D-06 | Purchase-plan fields | Quantity, purchase deadline, and urgency confirmed. MVP urgency is derived from time remaining relative to the historical scenario date. One saved plan per user with CRUD confirmed for MVP; multiple saved plans and comparisons are post-MVP nice-to-haves. Categories, thresholds, day-count convention, date validation, delivery date, budget, and quote input TBD. |
| D-07 | Recommendation rules | Must account for purchase deadline and urgency; detailed action rules, forecast-horizon alignment, and uncertainty treatment TBD. |
| D-08 | Interval method and confidence label | Volatility heuristic proposed in vision; calibrated MGO uncertainty TBD |
| D-09 | Historical data access and import policy | Fixed historical dataset intended; extraction, permissions, units, timestamps, missing inputs, and any later refresh TBD |
| D-10 | Model acceptance and pivot criteria | Metrics proposed; measurable thresholds and minimum evidence TBD |
| D-11 | Roles, authentication, and CRUD boundaries | One saved plan per user with create/view/edit/delete confirmed. Registration/login conditional on course or agreed vision scope; identity mechanism, broader roles/domain CRUD, and related-record retention TBD. |
| D-12 | Final stack and course constraints | Vision lists technologies/mandatory items; team confirmation pending |
| D-13 | Release plan and hosting | Dates, milestones, provider, and budget TBD |
| D-14 | Model versioning and retraining | Historical training/backtest protocol and tracking TBD; vision's weekly production retraining is not assumed for fixed data |
| D-15 | Historical dataset cutoff and presentation | Data limited to a historical period; exact cutoff, scenario dates, inference mode, and demo format TBD. Precomputed forecasts with interactive purchase-impact calculation are the team-requested recommendation, not a finalized decision. Team probably will not conduct a live-market demo. |

## 12. Clarification log

2026-09-15: Team accepted the focused MVP proposal: one complete historical purchase-decision flow and one saved plan per user with create/view/edit/delete. Multiple saved plans and plan comparisons are nice-to-haves after MVP. Live feeds, alerts, automatic retraining, LLM news classification, and detailed SHAP visualizations are deferred. Precomputed forecasts remain recommended with the final mode TBD; registration/login remain conditional on course or agreed scope.

2026-09-15: Team accepted automatically derived urgency for the MVP, based on time remaining until the purchase deadline. Urgency thresholds remain TBD; the example thresholds are not requirements. This resolves the earlier explicit-versus-derived urgency question.

2026-09-15: Team confirmed that purchase plans should include purchase deadline/urgency in addition to quantity. Their representation and detailed recommendation rules remain TBD.

2026-09-15: Team asked to keep precomputed versus on-demand forecasts TBD while recommending precomputed forecasts (option 2), with interactive purchase-quantity and impact calculations.

2026-09-15: Team stated that data will be limited to a certain period and that a live demo is unlikely. Recorded a fixed historical dataset as the working delivery assumption; exact dates and demo format remain TBD. This does not settle whether historical change detection or interactive inference is included.

2026-09-15: Team explicitly confirmed the forecast horizon remains TBD; do not use the illustrative 7-day horizon as the MVP default.

2026-09-15: Team identified https://themaritime.net/market/bunker/port-of-singapore as an existing public MGO database with approximately 2-3 records per month; the remaining data is behind a paywall. This clarifies source availability, but does not decide whether the latest public quote is an acceptable purchase-cost reference.

2026-09-15: Team clarified that Gasoil movements are intended to predict MGO, but exact mathematics are not established. MGO differentiates the project because Singapore MGO data is expensive/paywalled. A later switch to predicting Gasoil futures is possible. The mapping methods in section 6 are suggestions for evaluation, not decisions made by the team.
