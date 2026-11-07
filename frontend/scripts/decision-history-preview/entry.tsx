import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/app/app.css';
import { DecisionHistory } from '../../src/features/decision-history/DecisionHistory';
import { ALL_FIXTURE_PLANS, createDecisionFixtureService, DECISION_FIXTURE_TODAY } from '../../src/features/decision-history/fixtures';

// The production page with its sample data, for scripts/test-decision-history-layout.mjs. Not part of the app.
const params = new URLSearchParams(location.search);
const state = params.get('state') ?? 'ready';
const service = createDecisionFixtureService(
  state === 'empty' ? [] : ALL_FIXTURE_PLANS,
  state === 'error' ? { list: () => Promise.reject(new Error('The server did not respond.')) } : {},
  state === 'loading' ? 60_000 : 0,
);

createRoot(document.getElementById('root')!).render(<StrictMode>
  <DecisionHistory planService={service} today={DECISION_FIXTURE_TODAY} />
</StrictMode>);
