import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { navigate } from './router';
import { createMockAuthService, DEMO_USER } from '../preview/mockAuthService';
import { createMockPlanService } from '../features/purchase-plan/mockService';
import { createMockRecommendationService, RECOMMENDATION_DEMO_PLAN as plan } from '../features/recommendations/mockService';
import type { PlanAnalysis } from '../features/purchase-plan/types';
import { buildMockForecast } from '../features/forecast/mockService';
import type { Horizon, ReadyForecast } from '../features/forecast/apiService';

describe('recommendations app integration', () => {
  it('shows fast results immediately, retains them while idle, and refreshes a changed publication on demand', async () => {
    window.history.replaceState(null, '', `/purchase-plans/recommendation?plan_id=${plan.plan_id}`);
    const currentPlan = { ...plan, purchase_deadline: '2025-11-05', days_remaining: 12 };
    const analysis = await createMockRecommendationService({ delayMs: 0 }).read(plan);
    const auth = { ...createMockAuthService({ user: DEMO_USER, delayMs: 0 }), readSession: async () => DEMO_USER };
    const planService = { ...createMockPlanService({ initialPlan: currentPlan, delayMs: 0 }), read: vi.fn(async () => ({ plan: currentPlan })) };
    let publication = 'first-run';
    const forecasts = { read: vi.fn(async (h: Horizon) => ({ ...buildMockForecast(h), run_id: publication,
      anchor_quote_date: '2025-10-22', forecast_origin_date: '2025-10-22',
      target_date: new Date(Date.parse(plan.scenario_as_of_date) + h * 86_400_000).toISOString().slice(0, 10),
    }) as ReadyForecast) };
    const service = { read: vi.fn(async (context: PlanAnalysis['context'], _horizon?: number, runId?: string) => {
      const response = structuredClone(analysis);
      response.context = context;
      if (response.forecast.status === 'ready') response.forecast.value.target_date = '2025-10-31';
      if (response.recommendation.status === 'ready') response.recommendation.value.explanation = `Guidance from ${runId}.`;
      return response;
    }) };
    const props = { auth, scenarioDate: plan.scenario_as_of_date,
      createPlanService: () => planService, createRecommendationService: () => service,
      createPurchaseForecastService: () => forecasts };
    vi.useFakeTimers();
    try {
      const view = render(<App {...props} />);
      // Promise-only services should settle without advancing the loading view's step timers.
      await act(async () => {});
      const answer = () => within(screen.getByRole('region', { name: 'Recommendation' }));
      expect(answer().getByText('Guidance from first-run.')).toBeVisible();
      expect(screen.queryByText('Working out your recommendation')).not.toBeInTheDocument();
      expect(service.read).toHaveBeenCalledOnce();
      expect(forecasts.read).toHaveBeenCalledTimes(3);

      publication = 'second-run';
      await act(async () => { vi.advanceTimersByTime(180_000); document.dispatchEvent(new Event('visibilitychange')); });
      view.rerender(<App {...props} mock />);
      await act(async () => {});
      expect(answer().getByText('Guidance from first-run.')).toBeVisible();
      expect(service.read).toHaveBeenCalledOnce();
      expect(forecasts.read).toHaveBeenCalledTimes(3);
      expect(planService.read).toHaveBeenCalledOnce();

      await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Refresh prices' })));
      expect(answer().getByText('Guidance from second-run.')).toBeVisible();
      expect(screen.queryByText('Guidance from first-run.')).not.toBeInTheDocument();
      expect(service.read).toHaveBeenLastCalledWith(expect.objectContaining({ plan_id: plan.plan_id }), 7, 'second-run');
      expect(forecasts.read).toHaveBeenCalledTimes(6);
    } finally {
      vi.useRealTimers();
    }
  });

  it('opens from the saved plan, refreshes edited inputs on return, and handles deletion', async () => {
    window.history.replaceState(null, '', '/purchase-plans');
    const planService = createMockPlanService({ initialPlan: plan, delayMs: 0 });
    const service = createMockRecommendationService({ delayMs: 0 });
    const read = vi.spyOn(service, 'read');
    render(<App auth={createMockAuthService({ user: DEMO_USER, delayMs: 0 })} scenarioDate={plan.scenario_as_of_date} createPlanService={() => planService} createRecommendationService={() => service} />);
    fireEvent.click(await screen.findByRole('link', { name: 'View recommendation →' }));
    // The decision rail repeats the action; read it from the recommendation itself.
    expect(await within(await screen.findByRole('region', { name: 'Recommendation' })).findByText('Consider purchasing on 29 October')).toBeVisible();
    expect(document.title).toContain('Purchase estimate');
    fireEvent.click(screen.getByRole('link', { name: 'Back to purchase plans' }));
    fireEvent.click(await screen.findByRole('button', { name: /^Edit / }));
    fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: '200' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    fireEvent.click(await screen.findByRole('link', { name: 'View recommendation →' }));
    expect(await screen.findByText('No recommendation available')).toBeVisible();
    expect(read).toHaveBeenLastCalledWith(expect.objectContaining({ quantity_mt: 200 }));
    await act(async () => navigate('/purchase-plans'));
    await screen.findByText('200 MT');
    await act(async () => planService.delete(plan.plan_id));
    await act(async () => { window.history.pushState(null, '', `/purchase-plans/recommendation?plan_id=${plan.plan_id}`); window.dispatchEvent(new PopStateEvent('popstate')); });
    expect(await screen.findByText('No saved purchase plan')).toBeVisible();
  });

  it('protects the direct route and discards a late reply after session expiry', async () => {
    window.history.replaceState(null, '', `/purchase-plans/recommendation?plan_id=${plan.plan_id}`);
    const auth = createMockAuthService({ user: DEMO_USER, delayMs: 0 });
    let resolve!: (value: PlanAnalysis) => void;
    const service = { read: vi.fn(() => new Promise<PlanAnalysis>(done => { resolve = done; })) };
    render(<App auth={auth} scenarioDate={plan.scenario_as_of_date} createPlanService={() => createMockPlanService({ initialPlan: plan, delayMs: 0 })} createRecommendationService={() => service} />);
    await waitFor(() => expect(service.read).toHaveBeenCalledOnce());
    await act(async () => auth.expire());
    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeVisible();
    await act(async () => resolve(await createMockRecommendationService({ delayMs: 0 }).read(plan)));
    expect(screen.queryByText('Consider purchasing on 29 October')).not.toBeInTheDocument();
    await act(async () => navigate(`/purchase-plans/recommendation?plan_id=${plan.plan_id}`));
    await waitFor(() => expect(window.location.pathname).toBe('/login'));
  });
});

it('changes recommendation selection when only the URL plan ID changes', async () => {
  const second = { ...plan, plan_id: 'second-plan', quantity_mt: 250 };
  window.history.replaceState(null, '', `/purchase-plans/recommendation?plan_id=${plan.plan_id}`);
  const planService = createMockPlanService({ initialPlans: [plan, second], delayMs: 0 });
  const read = vi.spyOn(planService, 'read');
  render(<App auth={createMockAuthService({ user: DEMO_USER, delayMs: 0 })}
    scenarioDate={plan.scenario_as_of_date} createPlanService={() => planService} />);
  await screen.findByText('100 MT');
  await act(async () => navigate('/purchase-plans/recommendation?plan_id=second-plan'));
  expect(await screen.findByText('250 MT')).toBeVisible();
  expect(screen.queryByText('100 MT')).not.toBeInTheDocument();
  expect(read).toHaveBeenLastCalledWith('second-plan');
});
