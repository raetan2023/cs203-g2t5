# Release goal

A bunker buyer can open a dated historical Singapore market scenario, view an experimental MGO forecast range, enter a purchase plan, see its possible cost impact, and accept or reject an explained recommendation.

The system is advisory only. It must not claim live prices, a validated MGO forecast, guaranteed savings, or automatic purchasing.

## Product backbone

| Step | User activity | Current epic | Release 1 story |
| --- | --- | --- | --- |
| 1 | Understand the historical market | [MPP-8: Linking backend, frontend, DB and API](https://computing-team-bdns52iy.atlassian.net/browse/MPP-8) | [MPP-19: View dated market context](https://computing-team-bdns52iy.atlassian.net/browse/MPP-19) — 4 points |
| 2 | Understand the forecast | MPP-8 | [MPP-20: View forecast range and uncertainty](https://computing-team-bdns52iy.atlassian.net/browse/MPP-20) — 3 points |
| 3 | Evaluate a planned purchase | MPP-8 | [MPP-21: Manage one purchase plan and view cost impact](https://computing-team-bdns52iy.atlassian.net/browse/MPP-21) — 4 points |
| 4 | Make and record a decision | MPP-8 | [MPP-22: Review and decide on a purchase recommendation](https://computing-team-bdns52iy.atlassian.net/browse/MPP-22) — 5 points |

The other current epics support this journey:

- [MPP-6: Decide exact project features and tech stack](https://computing-team-bdns52iy.atlassian.net/browse/MPP-6): discovery and release decisions.
- [MPP-7: Setup Database and Data API](https://computing-team-bdns52iy.atlassian.net/browse/MPP-7): data, Spring Boot, database, and infrastructure work.
- [MPP-9: Deploy and test](https://computing-team-bdns52iy.atlassian.net/browse/MPP-9): release verification and deployment.
- [MPP-10: Add on advanced AI features](https://computing-team-bdns52iy.atlassian.net/browse/MPP-10): post-MVP work, not part of the walking skeleton.

MPP-22 currently has no parent in Jira. Put it under MPP-8 so all four Release 1 stories belong to the same user journey.

## Walking skeleton

The walking skeleton is the smallest real path through the application:

**Frontend → Spring Boot workflow → historical data/forecast → purchase calculation → saved decision**

Use the existing stories in this order:

1. **MPP-19 — Market context:** load one fixed historical scenario through the real UI and API. Show the as-of date, source, unit, and observed/estimated label. Supporting work: MPP-23, MPP-24, and MPP-33.
2. **MPP-20 — Forecast:** show one precomputed forecast with its origin, horizon, range, uncertainty method, and “experimental proxy” warning. Supporting work: MPP-25 and MPP-26.
3. **MPP-21 — Purchase plan:** accept a positive quantity and deadline, derive urgency, calculate the cost range, and save one plan. Supporting work: MPP-27, MPP-28, and MPP-32.
4. **MPP-22 — Human decision:** show a deadline-safe recommendation with assumptions and allow accept/reject. Save the decision against the displayed recommendation version. Supporting work: MPP-29 and MPP-30.

The first demo may use one clearly labelled fixed forecast. That proves integration only; it does not prove model accuracy. A story is Done only when its acceptance criteria work through the integrated application.

## Release scope and sequencing

| Increment | Scope | Demo outcome |
| --- | --- | --- |
| 1 | MPP-19 + thin connection into MPP-20 | One dated scenario and forecast travel through the real application layers. |
| 2 | Complete MPP-20 + MPP-21 | The buyer can understand the forecast and calculate a saved purchase impact. |
| 3 | MPP-22 + MPP-9 release work | The buyer can record a decision; the complete journey is tested and deployed. |

Release 1 contains **16 story points**: `4 + 3 + 4 + 5`. The 18-point total in MPP-31 is incorrect.

## Velocity and capacity

- There is **no reliable user-story velocity yet**. Sprints 1 and 2 mainly completed research and technical tasks, not accepted buyer stories.
- The current historical reconstruction is about **5 task points in Sprint 1** and **3 task points in Sprint 2**. This is task throughput, not product-story velocity.
- Sprint 3 currently contains **20 assigned points** before unpointed subtasks, while MPP-31 describes a much smaller plan. It is overloaded.
- Use **4 accepted story points** as a cautious Sprint 3 capacity hypothesis. Recalculate velocity after two comparable sprints containing completed user stories.
- At 4–5 accepted points per sprint, the 16-point release is roughly **3–4 sprints**, not a defensible two-sprint commitment.

At every sprint close, record planned points, added or removed scope, accepted Done story points, carry-over, sprint length, and team availability. Only accepted user stories count toward release velocity; track technical-task throughput separately.
