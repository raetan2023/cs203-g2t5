import { createMockRecommendationService, RECOMMENDATION_DEMO_PLAN } from '../features/recommendations/mockService';
import { useMemo, useRef, useState } from 'react';
import { App } from '../app/App';
import { navigate } from '../app/router';
import { DEMO_PLAN, DEMO_SCENARIO_DATE } from '../features/purchase-plan/fixtures';
import { createMockPlanService } from '../features/purchase-plan/mockService';
import { createMockAuthService, DEMO_USER } from './mockAuthService';
import './preview.css';

const examples = {
  'rec-ready': 'Recommendation - ready', 'rec-loading': 'Recommendation - loading', 'rec-error': 'Recommendation - fails once', 'rec-unavailable': 'Recommendation - unavailable', 'rec-missing': 'Recommendation - missing forecast', 'rec-unsupported': 'Recommendation - unsupported context',
  'rec-empty': 'Recommendation - no saved plan',
  login: 'Sign in', signup: 'Create account', home: 'Home', 'home-loading': 'Home loading (8 seconds)',
  'session-error': 'Session load fails once', 'login-error': 'Sign-in fails once', 'signup-error': 'Signup fails once', 'logout-error': 'Sign-out fails once',
  empty: 'Purchase plans - empty', saved: 'Purchase plans - saved', loading: 'Plan loading (8 seconds)',
  'load-error': 'Plan load fails once', 'save-error': 'Create / save fails once',
  'edit-error': 'Edit / save fails once', 'delete-error': 'Delete fails once',
};
type Example = keyof typeof examples;
const publicExamples = ['login', 'signup', 'login-error', 'signup-error'];

export function PreviewApp() {
  const [example, setExample] = useState<Example>('rec-ready');
  const [revision, setRevision] = useState(0);
  const [slow, setSlow] = useState(false);
  const [scenarioDate, setScenarioDate] = useState(DEMO_SCENARIO_DATE);
  const activeDate = useRef(scenarioDate);
  activeDate.current = scenarioDate;
  const auth = useMemo(() => createMockAuthService({
    user: publicExamples.includes(example) ? null : DEMO_USER,
    delayMs: example === 'home-loading' ? 8000 : slow ? 3500 : 650,
    failOnce: example === 'session-error' ? 'session' : example === 'login-error' ? 'login' : example === 'signup-error' ? 'signup' : example === 'logout-error' ? 'logout' : undefined,
  }), [example, revision, slow]);

  function select(next: Example) {
    navigate(next.startsWith('rec-') ? '/purchase-plans/recommendation' : next.startsWith('signup') ? '/signup' : publicExamples.includes(next) ? '/login' : ['home', 'home-loading', 'session-error', 'logout-error'].includes(next) ? '/home' : '/purchase-plans', true);
    setExample(next); setRevision(value => value + 1);
    setScenarioDate(DEMO_SCENARIO_DATE);
  }

  return <>
    <App key={`${example}-${revision}-${slow}`} auth={auth} scenarioDate={scenarioDate} mock createRecommendationService={() => createMockRecommendationService({ delayMs: example === 'rec-loading' ? 8000 : slow ? 3500 : 700, failOnce: example === 'rec-error', example: example === 'rec-unavailable' ? 'unavailable' : example === 'rec-missing' ? 'missing-forecast' : example === 'rec-unsupported' ? 'unsupported' : 'ready' })} createPlanService={() => createMockPlanService({
      initialPlan: example === 'rec-empty' ? null : example.startsWith('rec-') ? RECOMMENDATION_DEMO_PLAN : ['saved', 'edit-error', 'delete-error'].includes(example) ? DEMO_PLAN : null,
      getScenarioDate: () => activeDate.current,
      delayMs: example === 'loading' ? 8000 : slow ? 3500 : 700,
      failOnce: { read: example === 'load-error', create: example === 'save-error', update: example === 'edit-error', delete: example === 'delete-error' },
    })} />
    <details className="preview-tools">
      <summary>Demo controls</summary>
      <div className="preview-tools-body">
        <strong>Local preview - mock sessions and data</strong>
        <label htmlFor="preview-state">Starting state</label>
        <select id="preview-state" value={example} onChange={event => select(event.target.value as Example)}>
          {Object.entries(examples).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <label className="preview-checkbox"><input type="checkbox" checked={slow} onChange={event => setSlow(event.target.checked)} />Slow requests (3.5 seconds)</label>
        <button onClick={() => select(example)}>Reset example</button>
        <button onClick={() => setScenarioDate(date => date === DEMO_SCENARIO_DATE ? '2025-10-25' : DEMO_SCENARIO_DATE)}>Toggle demo scenario (24 / 25 October)</button>
        <button onClick={() => auth.expire()}>Simulate session expiry</button>
        <p>Sign in with john@example.com and any demo password. Signup uses your entered name. No real accounts are created.</p>
        <p>Changing controls resets the session and plan. Failures happen once; retry succeeds. Refresh signs out and clears data.</p>
      </div>
    </details>
  </>;
}
