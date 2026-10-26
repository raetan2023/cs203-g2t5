# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary: marine fuel procurement officers and bunker buyers at shipping companies purchasing Marine Gas Oil (MGO) in Singapore. They review dated market history, enter a planned purchase (quantity in metric tonnes, purchase deadline), and want to understand cost impact and an advisory action.

Also: CS203 course assessors and stakeholders who evaluate the app as a team project, so the buyer workflow must be legible in a demo.

## Product Purpose

Bunker Buddy (CS203 Group 2 Team 5, Singapore Management University) brings dated market context and a user's fuel purchase plan into one app. It helps buyers see near-term market movement, assess the potential cost impact of a planned purchase, and consider an advisory purchasing action.

Success: a buyer can sign in, read the historical market dashboard, save and manage purchase plans, and open the forecast, cost-impact and recommendation views with clear loading, error and unavailable states.

## Positioning

Singapore MGO data is expensive and often paywalled. The product's intended mechanism is to use Singapore Gasoil futures movements as a proxy to estimate MGO movements. The exact relationship is not yet established, and a pivot to forecasting Gasoil futures directly is possible (TBD).

## Operating Context

- Time is anchored to a configured historical scenario date, not today's date. Days remaining and urgency derive from the gap between that date and the purchase deadline.
- Purchase plans hold quantity (metric tonnes) and deadline; urgency is derived, never user-selected.
- Forecasting, cost-impact and recommendation interfaces call a backend analysis API. Its default provider currently reports forecasts and guidance as unavailable. Python models (linear regression, ridge, CatBoost, Random Forest) live separately and are not yet connected. Real forecasts and recommendations are coming soon.

## Capabilities and Constraints

- Stack: React 19 + TypeScript + Vite frontend (Recharts for charts), Java Spring Boot API, Clerk authentication, Supabase-hosted PostgreSQL. Tests use Vitest and Testing Library.
- Features: Clerk sign-in/sign-up/logout; historical market dashboard (prices, charts, indicators); multiple saved purchase plans per user with create, view, edit, delete; authenticated recommendation and cost-impact views.
- Navigation: Dashboard, purchase plan(s), log out.
- Undecided product facts: urgency thresholds and counting rules (calendar vs trading days), supported scenario dates, separate delivery date and budget, whether the Gasoil-to-MGO mapping stays.
- The UI revamp must not change logic, data, API calls, routes, validation, or user flows (see docs/UI_REVAMP_PLAN.md).

## Brand Commitments

Name "Bunker Buddy" is the current name. Nothing is confirmed as binding: the approved black-and-white, dark-only wireframe theme (DESIGN_SYSTEM.md, docs/UI_REVAMP_PLAN.md) is the current working direction, not a locked identity.

## Evidence on Hand

- Product requirements: docs/PRD.md; database design and sprint contracts under docs/.
- State mockups: docs/ui-mockups/*.png (state checklist).
- Wireframe login prototype: frontend/src/prototypes/wireframe/.
- No real customer testimonials, benchmarks or validated model performance exist. Synthetic preview/fixture outputs are labelled as such and must not be presented as real model results.

## Product Principles

1. **Label what is real.** Dated historical data, synthetic previews and unavailable forecasts are distinguished clearly; unavailable states are shown rather than invented numbers. Model outputs are coming, but must not be presented as validated MGO predictions until they are.
2. **Anchored to the scenario date.** All time-remaining and urgency language reads from the historical scenario date.
3. **Plan first.** The buyer's purchase plan (quantity, deadline) is the spine; analysis views serve that plan.
4. **Advisory, not authoritative.** Recommendations inform a buyer's decision and can be accepted, rejected or ignored.
5. **Demo-legible.** An assessor should grasp the buyer workflow and system states without explanation.

## Accessibility & Inclusion

Preserve existing accessibility behaviour: skip link, dialog focus trap and focus return, `aria-current`, `role="alert"`/`role="status"`, labelled form controls. Colour never carries meaning alone (rise/fall also needs a sign, arrow or word).
