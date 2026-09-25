# Product Requirements Document

Status: Working draft - clarification in progress
Last updated: 2026-09-23
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

Overall product journey (forecasting, impact, and recommendations follow the current sprint):

1. Register or log in.
2. Review dated market history and selected indicators.
3. Enter a planned fuel purchase quantity and purchase deadline; review the automatically derived urgency.
4. Review the forecast range, uncertainty, and available explanation.
5. Compare the estimated purchase cost with a stated reference price.
6. Review an advisory action and accept, reject, or ignore it.

Confirmed by team: purchase plans include quantity, purchase deadline, and automatically derived urgency for the MVP. Calculate urgency from the time remaining between the scenario's "as of" date and the purchase deadline, rather than today's date. Users enter quantity and deadline; urgency is not a separate user-selected input. Recommendations must account for the deadline and derived urgency when suggesting an action. Urgency categories, thresholds, calendar-day versus trading-day counting, and date-validation rules remain TBD. The discussed 3-day and 7-day thresholds were illustrative, not agreed. The MVP supports at most one saved purchase plan per user, with create, view, edit, and delete operations. Multiple saved plans and plan comparisons are post-MVP nice-to-haves. A separate delivery date and budget remain TBD.

### Current MVP user flow

The team accepted the login, dashboard, sidebar navigation, and single-plan management flow. Forecasting, purchase-impact calculations, and recommendations remain later work. Deadline semantics and the detailed rules below are proposals pending agreement.

1. **Register or log in.** Registration collects email, username/display name, and password. Login uses email and password; the username is used for display. Show clear authentication errors and provide a password-reset route. Supabase Free is the team's tentative platform choice; Supabase Auth is the recommended authentication approach, not yet a finalized implementation decision.
2. **Open the home dashboard.** Users can view historical MGO prices, alongside Gasoil market history and selected indicators, after login. For the current local demo these series use explicitly labelled mock data. Display them with an explicit historical scenario date, sources, currency, units, and observed/estimated labels. Show unavailable data clearly rather than inventing observations. The supported scenario dates and whether users can select them remain TBC.
3. **Navigate using the sidebar.** Provide Dashboard, My purchase plan, and Log out. The singular plan label reflects the current limit of one saved plan per user.
4. **Create a plan.** When no plan exists, show an empty state and a Create plan button. The form displays the historical scenario date and accepts a positive quantity in metric tonnes and a purchase deadline through a date picker. Show derived time remaining and provide Save and Cancel actions. Saving displays the plan summary and persists it across sessions.
5. **View or edit the plan.** The summary shows quantity, deadline, scenario date, and derived time remaining, with Edit and Delete actions. Editing updates the same plan. Recalculate time remaining when the deadline or applicable scenario date changes. Once saved analyses exist in later work, editing preserves their original input snapshots and results; new calculations use the updated plan.
6. **Delete the plan.** Deleting removes the plan and its associated saved analyses, impacts, recommendations, and decisions when those features exist. Shared market data and forecasts remain. Return to the empty state so the user can create a new plan.
7. **Log out.** End the application session and return to login. Private plan access requires authentication.

#### Proposed purchase-deadline presentation

Recommended label: **Order by**. Recommended helper text: "The latest date you intend to confirm the fuel order with a supplier. This is not the fuel delivery date."

This is a proposed product definition, pending team agreement. Do not infer an order deadline from a delivery date or assume a fixed supplier lead time. A separate delivery field remains outside the current agreed scope.

Display the scenario date beside the deadline and time remaining. For example, a scenario date of 1 September 2026 and an order deadline of 8 September 2026 would show **7 calendar days remaining**, if calendar-day counting is adopted. This example does not establish an urgency threshold or forecast horizon.

Proposed initial rules, not yet confirmed:

- Show exact days remaining first; urgency categories such as High/Medium/Low require separately agreed thresholds.
- Count calendar days from the historical scenario date, not today's date.
- Reject a deadline before the scenario date; show Due today for the same date and X days remaining for a later date.
- A deadline may extend beyond available historical observations. Later forecasting features must explain when a forecast does not cover the purchasing decision window.

#### Recommended authentication and password ownership

If Supabase Auth is adopted, it manages credential storage, password verification, email confirmation, and password resets. Do not add a password or password_hash field to the application's public user/profile table, and do not duplicate Auth's credential data. Supabase currently hashes passwords using bcrypt; the application does not implement its own hashing for this approach. See [Supabase password security](https://supabase.com/docs/guides/auth/password-security).

Recommended schema adaptation if adopted: represent the application's user record as a profile with a user_id referencing the primary key of Supabase-managed auth.users, plus the display name and any agreed profile fields. Email stays managed by Auth. This is a proposed adaptation of the current logical USERS entity; the database diagrams have not yet committed to a provider. See [Supabase user management](https://supabase.com/docs/guides/auth/managing-user-data).

Recommended integration: the frontend authenticates with Supabase Auth and sends its access token to Spring Boot for domain requests. Spring Boot verifies the token and uses the authenticated user ID to enforce ownership. A direct backend database connection does not automatically carry the end user's identity; ownership enforcement must be explicit. Configure appropriate Row Level Security if exposing tables through Supabase's data API. Provider selection, email delivery configuration for confirmation/reset messages, and final integration remain TBC.

## 4. Scope and priorities

### Current local demo: confirmed 2026-09-23

Run the frontend and Spring Boot backend on localhost first; deployment is outside this stage. Demonstrate the current MVP flow in section 3: registration/login, password-reset route, historical market context including MGO prices, sidebar navigation, one saved purchase plan with CRUD, and logout. Forecasts, purchase impacts, and recommendations remain deferred.

All application/demo data uses mock fixtures for now, including dated MGO/Gasoil prices and sample purchase inputs. Clearly display "Mock data - demonstration only" and identify synthetic sources; mock points must not be represented as actual market observations. Retain scenario dates, units, and the intended data structure so real data can replace fixtures later. Integration with Rae's smaller current-sprint database (USERS, PURCHASE_PLANS, MARKET_SERIES, MARKET_OBSERVATIONS) is required this sprint. Frontend/backend contributors may inject mock fixtures while it is being prepared, then connect their features to database-backed mock data before sprint completion. Real historical sourcing and the larger forecasting/analysis schema remain deferred.

Mock domain data does not decide the authentication implementation. Use test accounts for actual authentication verification; a simulated session only demonstrates UI behaviour. Authentication provider remains TBC. An in-memory mock plan store may be used during development, but is not sufficient for sprint completion. Verify saved plans persist across browser refresh, logout/login, and backend restart after integrating the smaller database.

### Historical-data delivery approach

The team plans to use data only up to a chosen historical cutoff and probably will not conduct a live-market demo. The later data-backed delivery assumption is a fixed historical dataset; the exact cutoff remains TBD. The current local demo uses mock fixtures as specified above. This does not by itself remove the interactive application or the vision's public-deployment constraint.

Proposed: show an explicit historical "as of" date throughout the dashboard, forecasts, recommendations, and purchase-impact results. Interpret "current price" as the reference available at that scenario date, not today's market price. Live ingestion, continuous monitoring, and scheduled production retraining are deferred until after the MVP.

Historical change detection could still run as a batch analysis or replay of dated observations. Whether to include it, generate forecasts on demand, or display precomputed forecasts remains TBD.

Recommended approach (team-requested; final decision TBD): generate forecasts ahead of time for supported historical scenario dates and save the results. The application retrieves the saved forecast for a scenario; users can still enter purchase quantities and receive calculated cost impacts. This simplifies the fixed-data demonstration and avoids requiring model inference during the user interaction. Supported dates, saved output contents, and compatibility with course requirements remain TBD. Each saved forecast must still obey the historical information cutoff; precomputation must not introduce future-data leakage.

### Current sprint boundary

2026-09-20: Start with the historical dashboard, selected displayed indicators, and one saved purchase plan per user with CRUD and ownership. The complete forecast/impact/recommendation flow below is the later product goal, not the current sprint commitment. Keep generic market-series and observation tables; import only dashboard data rather than every candidate model input. Model tracking and dataset-cutoff storage remain TBC. See [database schema](database-schema.md).

### Overall product flow

Deliver one complete historical purchase-decision flow: review the dashboard, view a forecast range and uncertainty, create or update one saved purchase plan, calculate its cost impact, and review an explained advisory action with accept/reject controls. Precomputed forecasts remain the recommended delivery approach; the final inference-mode decision remains TBD as previously agreed.

The first feasibility priority is to test whether the available MGO observations support a defensible mapping from Gasoil movements. The MGO conversion and reference-price policy remain unresolved dependencies of credible absolute-price and purchase-cost outputs.

The following table describes the basic current sprint; the complete purchase-decision flow is deferred to later work.

| Capability | Current scope | Clarification |
| --- | --- | --- |
| Historical market dashboard | MVP | Show an explicit historical as-of date; distinguish observed MGO, Gasoil futures, and derived MGO estimates |
| Selected historical market indicators | MVP | Final inputs depend on data availability and usefulness |
| One saved purchase plan per user with CRUD| MVP | Create, view, edit, and delete; quantity, deadline, and derived urgency |
| Broader profile/domain CRUD | MVP | Purchase-plan CRUD is agreed; administration of market records and saved analyses is not yet scoped |
| Registration and login | MVP | Included in the accepted user flow: register with email, display name, and password; log in with email/password. Supabase Auth recommended; provider/integration TBC. Enforce per-user ownership. |
| --- | --- | --- |
| Recommendation and human decision | later | Account for deadline/urgency, provide a short explanation, and allow accept/reject |
| Forecast range and uncertainty | later | Current target MGO; mapping remains experimental until validated; precomputed delivery recommended, final mode TBD |
| Purchase impact calculation | later | Requires a valid dated MGO reference and comparable forecast |
| Per-prediction SHAP | later | A short recommendation explanation is required; detailed SHAP visualizations can follow after MVP |
| Keyword-filtered historical GDELT features | later | Candidate model input, not an agreed MVP dependency |

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
| FR-01 | Account access | Support registration with email, username/display name, and password; login with email/password; password reset; and logout as described in section 3. Enforce ownership so users cannot access another user's private purchase plan or decisions. Supabase Free is tentative and Supabase Auth is recommended; provider and integration remain TBC. If adopted, Auth manages credentials and the application profile stores no password/hash. |
| FR-02 | Market dashboard | Let users view historical MGO prices, Gasoil history, and selected indicators. Use clearly labelled mock fixtures for the current localhost demo; for the data-backed version, display historical prices and selected indicators with dates, source labels, currency, units, and whether the value is observed or estimated. |
| FR-03 | Market data ingestion | Deferred for the current local mock stage. At database/data integration, import selected historical source data up to a declared dataset cutoff and retain observation dates. Proposed: retain availability timestamps and report missing or invalid inputs rather than silently substituting values. Live refresh is not assumed. |
| FR-04 | Forecast output | Show target commodity, forecast origin, horizon, estimated range, and uncertainty method. The MGO conversion method is TBD; an unvalidated proxy must be identified as such. |
| FR-05 | Uncertainty | Range width responds to market conditions as intended by the vision. A heuristic band is described as heuristic; a numerical confidence claim requires supporting evaluation. |
| FR-06 | Purchase plan and impact | Accept a positive quantity in metric tonnes and a purchase deadline. Automatically derive and display urgency from time remaining relative to the historical scenario date; recompute when the deadline or scenario date changes. Show reference cost, forecast cost range, and difference range using comparable currency and units. Invalid quantities receive a clear error. Urgency categories, thresholds, day-count convention, date validation, and reference-price policy TBD. |
| FR-07 | Recommendation | Provide an advisory action with supporting forecast, uncertainty, assumptions, and the plan's deadline/urgency. Do not recommend delaying beyond the purchase deadline. Proposed: if the forecast horizon does not support the decision window, explain that limitation instead of extrapolating silently. Detailed rules for earlier purchase, partial purchase, delay, and monitor are TBD. Never execute a purchase. |
| FR-08 | User decision | Allow accept, reject, or ignore. Whether ignore is explicit or inferred from no response is TBD. Proposed: persist decisions against the exact recommendation version. |
| FR-09 | Explanation | When recommendations are implemented, they include a short explanation grounded in the forecast, uncertainty, and purchase deadline/urgency. Explanation method TBD; do not invent market drivers. If per-prediction SHAP is used, describe associations rather than established causes and distinguish Gasoil-model drivers from MGO conversion assumptions. Detailed SHAP visualizations are post-MVP. |
| FR-10 | Change detection | If in scope, evaluate rolling volatility and/or filtered news against configured thresholds on historical observations using only information available at each scenario date. Batch/replay mode, re-forecast behavior, thresholds, and presentation of flags are TBD. Live alerts are not assumed. |
| FR-11 | Saved purchase-plan management | MVP users can create, view, edit, and delete their own saved purchase plan, with at most one saved plan per user. A saved plan remains available across sessions; editing updates that plan rather than creating another. Deletion permits a new plan to be created. Multiple plans and plan comparisons are post-MVP. Editing a plan preserves the input snapshots and results of its existing saved analyses; new calculations use the updated plan. Deleting a plan also deletes its saved analyses, impacts, recommendations, and decisions, while retaining shared market data and forecasts. Broader domain CRUD remains TBD. |

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

Positive differences represent a higher estimated cost; negative differences represent a lower estimated cost. Currency is USD. Rounding, inclusion of taxes/delivery charges, reference-price sourcing, and freshness tolerance are TBD. Do not equate a forecast cost difference with realized savings.

Illustration from the vision: 500 MT at USD 720/MT costs USD 360,000; at USD 740/MT it costs USD 370,000, a USD 10,000 increase. These are illustrative values, not market observations.

## 8. Data and modeling requirements

### Selected data sources

The team confirmed the following sources after data-feasibility research. Access methods, frequency, and historical depth below are team-reported research findings. Selection confirms the intended sources; predictive usefulness and the Gasoil-to-MGO relationship still require modelling evaluation.

| Variable | Source | Access method | Frequency / depth | Intended role |
| --- | --- | --- | --- | --- |
| SG MGO prices (ground truth) | [themaritime.net - Port of Singapore](https://themaritime.net/market/bunker/port-of-singapore) | Free | Monthly; earlier team research reported approximately 2-3 public quotes per month | Observed MGO outcomes for calibration/validation and possible dated price anchors; anchor freshness policy TBC |
| SG Gasoil futures (target proxy) | [Investing.com - NYMEX Singapore Gasoil (Platts) historical data](https://www.investing.com/commodities/nymex-singapore-gasoil-platts-c1-futures-historical-data) | Free historical download | Daily, 10+ years - verified by team | Gasoil forecasting target underlying the intended MGO mapping; physical unit, price/contract definition, and roll treatment TBC |
| Dubai crude | [Investing.com - Dubai Crude Oil (Platts) futures historical data](https://www.investing.com/commodities/dubai-crude-oil-platts-futures-historical-data) | Free historical download | Daily | Price and spread input for Gasoil forecasting |
| Brent crude | [FRED - DCOILBRENTEU](https://fred.stlouisfed.org/series/DCOILBRENTEU) | Free CSV download | Daily | Price and spread input for Gasoil forecasting |
| USD index | [FRED - DTWEXBGS](https://fred.stlouisfed.org/series/DTWEXBGS) | Free CSV download | Daily | Level and return input for Gasoil forecasting |
| SG bunker sales volume | [data.gov.sg - Bunker Sales Breakdown, Monthly (MPA)](https://data.gov.sg/datasets/d_4f5abbf4486bf8e52bbed3be56dde562/view) | Free CSV download | Monthly, Jan 1995-present; forward-filled to daily only after release availability | Demand input; product breakdown and publication lag TBC |
| News / geopolitical events | [GDELT](https://www.gdeltproject.org/) | Free API | Approximately 15-minute refresh | Historical keyword-filtered article counts and tone; live ingestion is outside the current sprint |

The team dropped crude oil inventories from the original candidate list after its feasibility research, on the rationale that Dubai/Brent crude and the crack spread already provide the intended supply-side signal without a separate inventories feed. This records the team's input-selection rationale; it does not establish causal effects or measured predictive performance.

MGO observations are ground truth only at their actual observation dates. Interpolating or forward-filling sparse quotes does not create additional observed MGO outcomes for evaluation. Their use as price anchors remains subject to an agreed freshness policy. Purchasing paid data is not an agreed requirement.

### Later modelling and database integration

The intended modelling flow uses the selected market indicators and historical Gasoil data to forecast Gasoil futures movements, then maps those movements to an MGO price estimate using a dated MGO anchor. The mapping mathematics and validation remain TBC; source feasibility does not validate the mapping.

The current sprint remains the dashboard and purchase-plan CRUD, loading only data used by displayed features. Integrating the full selected source set and derived features into the forecasting pipeline is later work and will require revisiting the database design. The existing generic MARKET_SERIES and MARKET_OBSERVATIONS tables can accommodate additional numeric series without a table per variable. Additional structures for news/events, derived features, source-specific metadata, or forecast lineage will be decided when those workflows are scoped. Extended model tracking and dataset-cutoff storage remain TBC; this source selection does not require loading all training data into the application database now.

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
| D-05 | Change detection, news, and explanation details | Recommendations are deferred beyond the current sprint; when implemented, they must include a short explanation as specified in FR-09. Live alerts and detailed SHAP visualizations deferred; historical change detection, keyword-filtered news input, and explanation method remain TBD. |
| D-06 | Purchase-plan fields | Quantity, purchase deadline, and urgency confirmed. MVP urgency is derived from time remaining relative to the historical scenario date. One saved plan per user with CRUD confirmed for MVP; multiple saved plans and comparisons are post-MVP nice-to-haves. Categories, thresholds, day-count convention, date validation, delivery date, budget, and quote input TBD. |
| D-07 | Recommendation rules | Must account for purchase deadline and urgency; detailed action rules, forecast-horizon alignment, and uncertainty treatment TBD. |
| D-08 | Interval method and confidence label | Volatility heuristic proposed in vision; calibrated MGO uncertainty TBD |
| D-09 | Historical data access and import policy | Fixed historical dataset intended; extraction, permissions, units, timestamps, missing inputs, and any later refresh TBD |
| D-10 | Model acceptance and pivot criteria | Metrics proposed; measurable thresholds and minimum evidence TBD |
| D-11 | Roles, authentication, and CRUD boundaries | One saved plan per user with create/view/edit/delete confirmed. Registration/login included in the accepted user flow; Supabase Auth recommended with provider/integration and broader roles/domain CRUD TBC. Plan edits preserve saved analysis snapshots; plan deletion cascades to its analyses, impacts, recommendations, and decisions. |
| D-12 | Final stack and course constraints | Vision lists technologies/mandatory items; team confirmation pending |
| D-13 | Release plan and hosting | Current stage runs on localhost with mock data; no deployment now. Later hosting, dates, and budget TBD. |
| D-14 | Model versioning and retraining | Historical training/backtest protocol and tracking TBD; vision's weekly production retraining is not assumed for fixed data |
| D-15 | Historical dataset cutoff and presentation | Data limited to a historical period; exact cutoff, scenario dates, inference mode, and demo format TBD. Precomputed forecasts with interactive purchase-impact calculation are the team-requested recommendation, not a finalized decision. Team probably will not conduct a live-market demo. |

