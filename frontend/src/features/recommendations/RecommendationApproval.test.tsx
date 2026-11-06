import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { RecommendationApproval, SUBMIT_LABEL, SubmittedRecommendationView } from './RecommendationApproval';
import { RecommendationsPage } from './RecommendationsPage';
import { ForecastProvider } from '../forecast/ForecastContext';
import { buildMockForecast } from '../forecast/mockService';
import { DEMO_PLAN, DEMO_ANALYSIS, DEMO_SCENARIO_DATE } from '../purchase-plan/fixtures';
import { createMockPlanService } from '../purchase-plan/mockService';
import { PlanError, type PlanAnalysis, type PlanResultContext, type BuyerDecisionInput, type BuyerDecisionRecord } from '../purchase-plan/types';
import type { Horizon, ReadyForecast } from '../forecast/apiService';

const draft = { ...DEMO_PLAN, status: 'draft' as const };
const submitted = { ...draft, status: 'submitted' as const, submitted_at: '2025-10-24T08:00:00Z' };
const forecast = (h: Horizon) => ({ ...buildMockForecast(h), status: 'ready' as const, run_id: '00000000-0000-0000-0000-000000000001',
  anchor_quote_date: '2025-10-22', forecast_origin_date: '2025-10-22',
  target_date: new Date(Date.parse(DEMO_SCENARIO_DATE) + h * 86400000).toISOString().slice(0, 10) } as ReadyForecast);
function analysis(h: Horizon = 14, context: PlanResultContext = draft): PlanAnalysis {
  return { ...structuredClone(DEMO_ANALYSIS), source: 'api', provenance: 'model', approval_fingerprint: (h === 7 ? 'a' : 'b').repeat(64), context: { ...context, urgency: context.urgency ?? 'NORMAL' },
    forecast: { status: 'ready', value: { prices: { lower: 680, upper: 740 }, target_date: forecast(h).target_date,
      basis: { commodity: 'MGO', currency: 'USD', unit: 'MT' }, range_description: 'Experimental bounds',
      central_estimate: 710, run_id: forecast(h).run_id, model_version: 'ridge-test' } },
    recommendation: { status: 'ready', value: { recommendation_id: 'plan-rec', action: 'WAIT', explanation: 'One recommendation for this plan.' } } };
}
function service() {
  const history: BuyerDecisionRecord[] = [];
  return {
    ...createMockPlanService({ initialPlan: draft, delayMs: 0 }),
    submit: vi.fn().mockResolvedValue({ plan: submitted }),
    readSubmission: vi.fn().mockResolvedValue({ submission: { horizon_days: 14, analysis: analysis() } }),
    readRecommendationDecisions: vi.fn(async () => [...history]),
    recordRecommendationDecision: vi.fn(async (planId: string, input: BuyerDecisionInput) => {
      const record = { id: String(history.length + 1), plan_id: planId, recommendation_id: input.recommendationId,
        run_id: input.runId ?? null, action: input.action ?? null, decision: input.decision, reason: input.reason ?? '',
        decided_at: '2025-10-24T08:00:00Z' };
      history.unshift(record);
      return record;
    }),
  };
}

const submitButton = () => screen.getByRole('button', { name: SUBMIT_LABEL });

it('records Accept, then submits the selected recommendation, horizon, run and urgency, only after confirming', async () => {
  const api = service(), callback = vi.fn(), user = userEvent.setup();
  render(<RecommendationApproval analysis={analysis()} plan={draft} horizon={14} planService={api} onSubmitted={callback} />);
  expect(screen.queryByRole('button', { name: 'Reject' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Ignore' })).not.toBeInTheDocument();
  await user.click(submitButton());
  expect(api.recordRecommendationDecision).not.toHaveBeenCalled();
  expect(api.submit).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(api.recordRecommendationDecision).not.toHaveBeenCalled();
  await user.click(submitButton());
  await user.click(screen.getByRole('button', { name: 'Confirm submission' }));
  expect(api.recordRecommendationDecision).toHaveBeenCalledWith(draft.plan_id, expect.objectContaining({
    recommendationId: 'plan-rec', runId: forecast(14).run_id, action: 'WAIT', decision: 'accept' }));
  expect(api.recordRecommendationDecision.mock.invocationCallOrder[0]).toBeLessThan(api.submit.mock.invocationCallOrder[0]);
  expect(api.submit).toHaveBeenCalledWith(draft.plan_id, { horizon_days: 14, run_id: forecast(14).run_id,
    recommendation_id: 'plan-rec', approval_fingerprint: 'b'.repeat(64), urgency: 'NORMAL',
    quantity_mt: draft.quantity_mt, purchase_deadline: draft.purchase_deadline, scenario_as_of_date: DEMO_SCENARIO_DATE });
  expect(callback).toHaveBeenCalledWith(submitted);
});

it('blocks missing evidence and shows stale-selection errors for refresh and retry', async () => {
  const api = service(), user = userEvent.setup();
  api.submit.mockRejectedValue(new PlanError('The forecast run changed.', {}, 409));
  const view = render(<RecommendationApproval analysis={{ ...analysis(), approval_fingerprint: undefined }} plan={draft} horizon={14} planService={api} onSubmitted={vi.fn()} />);
  expect(submitButton()).toBeDisabled();
  view.rerender(<RecommendationApproval analysis={analysis()} plan={draft} horizon={14} planService={api} onSubmitted={vi.fn()} />);
  await user.click(submitButton());
  await user.click(screen.getByRole('button', { name: 'Confirm submission' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('The forecast run changed. Nothing was submitted.');
  // The Accept is already on record, so trying again simply records it again and resubmits.
  api.submit.mockResolvedValue({ plan: submitted });
  await user.click(screen.getByRole('button', { name: 'Confirm submission' }));
  await waitFor(() => expect(api.submit).toHaveBeenCalledTimes(2));
});

it('shows why nothing was submitted when the Accept cannot be recorded', async () => {
  const api = service(), user = userEvent.setup();
  api.recordRecommendationDecision.mockRejectedValue(new PlanError('Could not save your decision.', {}, 500));
  render(<RecommendationApproval analysis={analysis()} plan={draft} horizon={14} planService={api} onSubmitted={vi.fn()} />);
  await user.click(submitButton());
  await user.click(screen.getByRole('button', { name: 'Confirm submission' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not save your decision.');
  expect(api.submit).not.toHaveBeenCalled();
});

it('submits a forecast on its real target date, counted from the quote', async () => {
  const api = service(), user = userEvent.setup();
  const dated = analysis(14);
  if (dated.forecast.status === 'ready') dated.forecast.value.target_date = '2025-11-05';
  render(<RecommendationApproval analysis={dated} plan={draft} horizon={14} planService={api} onSubmitted={vi.fn()} />);
  await user.click(submitButton());
  await user.click(screen.getByRole('button', { name: 'Confirm submission' }));
  await waitFor(() => expect(api.submit).toHaveBeenCalledOnce());
});

it('never submits a forecast whose target date has passed', () => {
  const api = service();
  const passed = analysis(14);
  if (passed.forecast.status === 'ready') passed.forecast.value.target_date = DEMO_SCENARIO_DATE;
  render(<RecommendationApproval analysis={passed} plan={draft} horizon={14} planService={api} onSubmitted={vi.fn()} />);
  expect(screen.getByText('An updated 14-day forecast is required before submitting.')).toBeVisible();
  expect(submitButton()).toBeDisabled();
});

it('never submits illustrative results', () => {
  render(<RecommendationApproval analysis={{ ...analysis(), source: 'mock', provenance: 'fixture' }} plan={draft} horizon={14} planService={service()} onSubmitted={vi.fn()} />);
  expect(submitButton()).toBeDisabled();
});

it('does not submit twice or publish a response after the selection component is unmounted', async () => {
  const api = service(), callback = vi.fn(), user = userEvent.setup();
  let finish!: (value: { plan: typeof submitted }) => void;
  api.submit.mockReturnValue(new Promise(resolve => { finish = resolve; }));
  const view = render(<RecommendationApproval analysis={analysis()} plan={draft} horizon={14} planService={api} onSubmitted={callback} />);
  await user.click(submitButton());
  await user.click(screen.getByRole('button', { name: 'Confirm submission' }));
  await waitFor(() => expect(api.submit).toHaveBeenCalled());
  expect(screen.getByRole('button', { name: 'Submitting…' })).toBeDisabled();
  view.unmount(); await act(async () => finish({ plan: submitted }));
  expect(api.submit).toHaveBeenCalledTimes(1); expect(callback).not.toHaveBeenCalled();
});

it('keeps one plan recommendation while selecting the forecast cost detail for approval', async () => {
  const api = service(), user = userEvent.setup();
  const recommendations = { read: vi.fn(async (context: PlanResultContext, h: Horizon = 7) => analysis(h, context)) };
  render(<ForecastProvider service={{ read: async h => forecast(h) }} scenarioDate={DEMO_SCENARIO_DATE}>
    <RecommendationsPage canSubmit planId={draft.plan_id} planService={api} service={recommendations} scenarioDate={DEMO_SCENARIO_DATE} />
  </ForecastProvider>);
  // A disabled placeholder holds the button's place while the recommendation loads.
  expect(await screen.findByText('One recommendation for this plan.')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: /^14 days$/ }));
  // The answer stays on screen while the new date's figures load.
  expect(screen.getByText('One recommendation for this plan.')).toBeVisible();
  await waitFor(() => expect(screen.getByText(/^14-day forecast · /)).toBeVisible());
  await waitFor(() => expect(submitButton()).toBeEnabled());
  await user.click(submitButton());
  await user.click(screen.getByRole('button', { name: 'Confirm submission' }));
  await waitFor(() => expect(api.submit).toHaveBeenCalledWith(draft.plan_id, expect.objectContaining({ horizon_days: 14, recommendation_id: 'plan-rec' })));
  expect(await screen.findByRole('heading', { name: 'Submitted recommendation' })).toBeVisible();
  expect(api.readSubmission).toHaveBeenCalledWith(draft.plan_id);
});

it('never offers approval requests to read-only viewers and shows the persisted snapshot after submission', async () => {
  const api = service();
  const view = render(<RecommendationsPage planId={draft.plan_id} planService={api} scenarioDate={DEMO_SCENARIO_DATE} />);
  await screen.findByText('No recommendation available');
  expect(screen.queryByRole('button', { name: SUBMIT_LABEL })).not.toBeInTheDocument();
  view.rerender(<SubmittedRecommendationView plan={submitted} planService={api} />);
  expect(await screen.findByRole('heading', { name: 'Plan recommendation · Wait' })).toBeVisible();
  expect(screen.getByText('One recommendation for this plan.')).toBeVisible();
  expect(screen.queryByRole('button', { name: SUBMIT_LABEL })).not.toBeInTheDocument();
});


it('allows the deadline policy buy-now request using the reference price when no forecast fits', async () => {
  const api = service(), user = userEvent.setup();
  const data: PlanAnalysis = { ...analysis(7), cost_impact: { status: 'unavailable', reason: 'unsupported_horizon', message: 'No forecast fits.' },
    recommendation: { status: 'ready', value: { recommendation_id: 'buy-now-plan', action: 'BUY_NOW', explanation: 'Buying now is the only priced option.' } } };
  render(<RecommendationApproval analysis={data} plan={draft} horizon={7} planService={api} onSubmitted={vi.fn()} />);
  expect(screen.getByText(/Uses the observed reference price/)).toBeVisible();
  await user.click(submitButton());
  await user.click(screen.getByRole('button', { name: 'Confirm submission' }));
  await waitFor(() => expect(api.submit).toHaveBeenCalledWith(draft.plan_id, expect.objectContaining({ recommendation_id: 'buy-now-plan' })));
});

it('leads a decided request with its status, who decided, the comment and the next step', async () => {
  const api = service();
  api.readSubmission.mockResolvedValue({ submission: { horizon_days: 14, analysis: analysis() }, decision: {
    decision_id: 'd1', decision: 'approved', comment: 'Within budget', manager_clerk_user_id: 'user_m',
    manager_label: 'Procurement Manager', decided_at: '2026-10-28T01:30:00Z' } });
  render(<SubmittedRecommendationView plan={{ ...submitted, status: 'approved' }} planService={api} />);
  const status = await screen.findByRole('region', { name: 'Approval status' });
  expect(within(status).getByRole('heading', { name: 'Recommendation approved' })).toBeVisible();
  expect(within(status).getByText(/Decided by Procurement Manager/)).toBeVisible();
  expect(within(status).getByText('Within budget')).toBeVisible();
  expect(within(status).getByText(/Read-only access/)).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Record purchase' })).not.toBeInTheDocument();
  expect(within(screen.getByRole('complementary', { name: 'Saved recommendation summary' })).getByText('Wait')).toBeVisible();
  expect(screen.getByRole('heading', { name: 'Plan recommendation · Wait' })).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Approve recommendation' })).not.toBeInTheDocument();
});
