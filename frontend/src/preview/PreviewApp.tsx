import { createMockRecommendationService, RECOMMENDATION_DEMO_PLAN } from '../features/recommendations/mockService';
import { useMemo, useRef, useState } from 'react';
import { App } from '../app/App';
import { navigate } from '../app/router';
import { DEMO_PLAN, DEMO_SCENARIO_DATE } from '../features/purchase-plan/fixtures';
import { createMockPlanService } from '../features/purchase-plan/mockService';
import { createMockAuthService, DEMO_USER } from './mockAuthService';
import './preview.css';
import { buildMockForecast } from '../features/forecast/mockService';
import ForecastWidget from '../features/forecast/ForecastWidget';
import type { ReadyForecast } from '../features/forecast/apiService';
import { createScenarioForecastService, createScenarioRecommendationService, PREVIEW_BUYER, PREVIEW_MANAGER, previewDecisionPlans, scenarioPlan, SCENARIO_DATE, withPreviewApproval, type RecommendationScenario } from './recommendationScenarios';
import type { PurchasePlanService } from '../features/purchase-plan/types';
function PreviewMarketDashboard() { return <main><ForecastWidget /></main>; }

const examples = {
  market: 'Market dashboard - synthetic forecast',
  'rec-monitor': 'Recommendation - Monitor (8-day plan)', 'rec-buy': 'Recommendation - Buy now (33-day plan)', 'rec-wait': 'Recommendation - Wait (33-day plan)',
  'rec-awaiting': 'Approval - awaiting manager (buyer)', 'rec-review': 'Approval - manager review (manager)', 'rec-approved': 'Approval - approved (buyer)', 'rec-rejected': 'Approval - rejected (buyer)',
  'plans-decisions': 'Purchase plans - every approval state',
  'rec-ready': 'Recommendation - legacy fixture, no horizon fits', 'rec-loading': 'Recommendation - loading', 'rec-error': 'Recommendation - fails once', 'rec-unavailable': 'Recommendation - unavailable', 'rec-missing': 'Recommendation - missing forecast', 'rec-unsupported': 'Recommendation - unsupported context',
  'rec-empty': 'Recommendation - no saved plan',
  login: 'Sign in', signup: 'Create account', home: 'Home', 'home-loading': 'Home loading (8 seconds)',
  'session-error': 'Session load fails once', 'login-error': 'Sign-in fails once', 'signup-error': 'Signup fails once', 'logout-error': 'Sign-out fails once',
  multiple: 'Purchase plans - multiple', empty: 'Purchase plans - empty', saved: 'Purchase plans - saved', loading: 'Plan loading (8 seconds)',
  'load-error': 'Plan load fails once', 'save-error': 'Create / save fails once',
  'edit-error': 'Edit / save fails once', 'delete-error': 'Delete fails once',
};
type Example = keyof typeof examples;
const publicExamples = ['login', 'signup', 'login-error', 'signup-error'];
const recommendationScenarios: Partial<Record<Example, RecommendationScenario>> = { 'rec-monitor': 'monitor', 'rec-buy': 'buy', 'rec-wait': 'wait',
  'rec-awaiting': 'wait', 'rec-review': 'wait', 'rec-approved': 'wait', 'rec-rejected': 'wait' };
const approvalStarts: Partial<Record<Example, 'submitted' | 'approved' | 'rejected'>> = { 'rec-awaiting': 'submitted', 'rec-review': 'submitted', 'rec-approved': 'approved', 'rec-rejected': 'rejected' };
const decisionPlans = previewDecisionPlans();

export function PreviewApp() {
  const [example, setExample] = useState<Example>('rec-monitor');
  const [revision, setRevision] = useState(0);
  const [slow, setSlow] = useState(false);
  const [scenarioDate, setScenarioDate] = useState(SCENARIO_DATE);
  const scenario = recommendationScenarios[example];
  const withScenarioApproval = (plans: PurchasePlanService) => scenario ? withPreviewApproval(plans, scenario, approvalStarts[example])
    : example === 'plans-decisions' ? decisionPlans.withDecisions(plans) : plans;
  const planAccess = example === 'rec-review' ? PREVIEW_MANAGER : scenario || example === 'plans-decisions' ? PREVIEW_BUYER : undefined;
  const activeDate = useRef(scenarioDate);
  activeDate.current = scenarioDate;
  const auth = useMemo(() => createMockAuthService({
    user: publicExamples.includes(example) ? null : DEMO_USER,
    delayMs: example === 'home-loading' ? 8000 : slow ? 3500 : 650,
    failOnce: example === 'session-error' ? 'session' : example === 'login-error' ? 'login' : example === 'signup-error' ? 'signup' : example === 'logout-error' ? 'logout' : undefined,
  }), [example, revision, slow]);

  function select(next: Example) {
    navigate(next === 'market' ? '/market-dashboard' : next.startsWith('rec-') ? `/purchase-plans/recommendation?plan_id=${RECOMMENDATION_DEMO_PLAN.plan_id}` : next.startsWith('signup') ? '/signup' : publicExamples.includes(next) ? '/login' : ['home', 'home-loading', 'session-error', 'logout-error'].includes(next) ? '/home' : '/purchase-plans', true);
    setExample(next); setRevision(value => value + 1);
    setScenarioDate(recommendationScenarios[next] || next === 'plans-decisions' ? SCENARIO_DATE : DEMO_SCENARIO_DATE);
  }

  return <>
    <App key={`${example}-${revision}-${slow}`} auth={auth} scenarioDate={scenarioDate} mock MarketDashboard={PreviewMarketDashboard} createForecastService={() => scenario ? createScenarioForecastService(scenario) : ({ read: async horizon => buildMockForecast(horizon) as ReadyForecast })} createRecommendationService={() => scenario ? createScenarioRecommendationService(scenario, slow ? 3500 : 600) : createMockRecommendationService({ delayMs: example === 'rec-loading' ? 8000 : slow ? 3500 : 700, failOnce: example === 'rec-error', example: example === 'rec-unavailable' ? 'unavailable' : example === 'rec-missing' ? 'missing-forecast' : example === 'rec-unsupported' ? 'unsupported' : 'ready' })} planAccess={planAccess} createPlanService={() => withScenarioApproval(createMockPlanService({
      initialPlans: example === 'multiple' ? [DEMO_PLAN, { ...DEMO_PLAN, plan_id: 'second-demo-plan', quantity_mt: 250 }] : example === 'plans-decisions' ? decisionPlans.plans : undefined,
      initialPlan: scenario ? scenarioPlan(scenario) : example === 'rec-empty' ? null : example.startsWith('rec-') ? RECOMMENDATION_DEMO_PLAN : ['saved', 'edit-error', 'delete-error'].includes(example) ? DEMO_PLAN : null,
      getScenarioDate: () => activeDate.current,
      delayMs: example === 'loading' ? 8000 : slow ? 3500 : 700,
      failOnce: { read: example === 'load-error', create: example === 'save-error', update: example === 'edit-error', delete: example === 'delete-error' },
    }))} />
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
