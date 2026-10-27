import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { RecommendationApproval, SubmittedRecommendationView } from './RecommendationApproval';
import { RecommendationsPage } from './RecommendationsPage';
import { ForecastProvider } from '../forecast/ForecastContext';
import { buildMockForecast } from '../forecast/mockService';
import { DEMO_PLAN, DEMO_ANALYSIS, DEMO_SCENARIO_DATE } from '../purchase-plan/fixtures';
import { createMockPlanService } from '../purchase-plan/mockService';
import { PlanError, type PlanAnalysis, type PlanResultContext } from '../purchase-plan/types';
import type { Horizon, ReadyForecast } from '../forecast/apiService';

const draft = { ...DEMO_PLAN, status: 'draft' as const };
const submitted = { ...draft, status: 'submitted' as const, submitted_at: '2025-10-24T08:00:00Z' };
const forecast = (h: Horizon) => ({ ...buildMockForecast(h), status: 'ready' as const, run_id: '00000000-0000-0000-0000-000000000001',
  anchor_quote_date: '2025-10-22', forecast_origin_date: '2025-10-22',
  target_date: new Date(Date.parse('2025-10-22') + h * 86400000).toISOString().slice(0, 10) } as ReadyForecast);
function analysis(h: Horizon = 14, context: PlanResultContext = draft): PlanAnalysis {
  return { ...structuredClone(DEMO_ANALYSIS), source: 'api', provenance: 'model', approval_fingerprint: (h === 7 ? 'a' : 'b').repeat(64), context: { ...context, urgency: context.urgency ?? 'NORMAL' },
    forecast: { status: 'ready', value: { prices: { lower: 680, upper: 740 }, target_date: forecast(h).target_date,
      basis: { commodity: 'MGO', currency: 'USD', unit: 'MT' }, range_description: 'Experimental bounds',
      central_estimate: 710, run_id: forecast(h).run_id, model_version: 'ridge-test' } },
    recommendation: { status: 'ready', value: { recommendation_id: `rec-${h}`, action: 'WAIT', explanation: `Review the ${h}-day recommendation.` } } };
}
function service() { return { ...createMockPlanService({ initialPlan: draft, delayMs: 0 }),
  submit: vi.fn().mockResolvedValue({ plan: submitted }), readSubmission: vi.fn().mockResolvedValue({ submission: { horizon_days: 14, analysis: analysis() } }) }; }

it('confirms the selected recommendation, horizon, run and urgency, without trusting client prices', async () => {
  const api = service(), callback = vi.fn(), user = userEvent.setup();
  render(<RecommendationApproval analysis={analysis()} plan={draft} horizon={14} planService={api} onSubmitted={callback} />);
  await user.click(screen.getByRole('button', { name: 'Request approval for this recommendation' }));
  expect(api.submit).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Cancel request' }));
  await user.click(screen.getByRole('button', { name: 'Request approval for this recommendation' }));
  await user.click(screen.getByRole('button', { name: 'Confirm approval request' }));
  expect(api.submit).toHaveBeenCalledWith(draft.plan_id, { horizon_days: 14, run_id: forecast(14).run_id,
    recommendation_id: 'rec-14', approval_fingerprint: 'b'.repeat(64), urgency: 'NORMAL',
    quantity_mt: draft.quantity_mt, purchase_deadline: draft.purchase_deadline, scenario_as_of_date: DEMO_SCENARIO_DATE });
  expect(callback).toHaveBeenCalledWith(submitted);
});

it('blocks missing evidence and shows stale-selection errors for refresh and retry', async () => {
  const api = service(), user = userEvent.setup();
  api.submit.mockRejectedValue(new PlanError('The forecast run changed.', {}, 409));
  const view = render(<RecommendationApproval analysis={{ ...analysis(), approval_fingerprint: undefined }} plan={draft} horizon={14} planService={api} onSubmitted={vi.fn()} />);
  expect(screen.getByRole('button', { name: 'Request approval for this recommendation' })).toBeDisabled();
  view.rerender(<RecommendationApproval analysis={analysis()} plan={draft} horizon={14} planService={api} onSubmitted={vi.fn()} />);
  await user.click(screen.getByRole('button', { name: 'Request approval for this recommendation' }));
  await user.click(screen.getByRole('button', { name: 'Confirm approval request' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('The forecast run changed.');
});

it('does not submit twice or publish a response after the selection component is unmounted', async () => {
  const api = service(), callback = vi.fn(), user = userEvent.setup();
  let finish!: (value: { plan: typeof submitted }) => void;
  api.submit.mockReturnValue(new Promise(resolve => { finish = resolve; }));
  const view = render(<RecommendationApproval analysis={analysis()} plan={draft} horizon={14} planService={api} onSubmitted={callback} />);
  await user.click(screen.getByRole('button', { name: 'Request approval for this recommendation' }));
  await user.click(screen.getByRole('button', { name: 'Confirm approval request' }));
  expect(screen.getByRole('button', { name: 'Submitting request…' })).toBeDisabled();
  view.unmount(); await act(async () => finish({ plan: submitted }));
  expect(api.submit).toHaveBeenCalledTimes(1); expect(callback).not.toHaveBeenCalled();
});

it('switches the actual recommendation page to the chosen horizon before requesting approval', async () => {
  const api = service(), user = userEvent.setup();
  const recommendations = { read: vi.fn(async (context: PlanResultContext, h: Horizon = 7) => analysis(h, context)) };
  render(<ForecastProvider service={{ read: async h => forecast(h) }} scenarioDate={DEMO_SCENARIO_DATE}>
    <RecommendationsPage canSubmit planId={draft.plan_id} planService={api} service={recommendations} scenarioDate={DEMO_SCENARIO_DATE} />
  </ForecastProvider>);
  await screen.findByRole('button', { name: 'Request approval for this recommendation' });
  fireEvent.click(screen.getByRole('button', { name: /^14 days$/ }));
  await screen.findByText('Review the 14-day recommendation.');
  await user.click(screen.getByRole('button', { name: 'Request approval for this recommendation' }));
  await user.click(screen.getByRole('button', { name: 'Confirm approval request' }));
  await waitFor(() => expect(api.submit).toHaveBeenCalledWith(draft.plan_id, expect.objectContaining({ horizon_days: 14, recommendation_id: 'rec-14' })));
  expect(await screen.findByRole('heading', { name: 'Submitted recommendation' })).toBeVisible();
  expect(api.readSubmission).toHaveBeenCalledWith(draft.plan_id);
});

it('never offers approval requests to read-only viewers and shows the persisted snapshot after submission', async () => {
  const api = service();
  const view = render(<RecommendationsPage planId={draft.plan_id} planService={api} scenarioDate={DEMO_SCENARIO_DATE} />);
  await screen.findByText('No recommendation available');
  expect(screen.queryByRole('button', { name: 'Request approval for this recommendation' })).not.toBeInTheDocument();
  view.rerender(<SubmittedRecommendationView plan={submitted} planService={api} />);
  expect(await screen.findByRole('heading', { name: '14-day estimate · WAIT' })).toBeVisible();
  expect(screen.getByText('Review the 14-day recommendation.')).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Request approval for this recommendation' })).not.toBeInTheDocument();
});
