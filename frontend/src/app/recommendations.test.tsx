import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { navigate } from './router';
import { createMockAuthService, DEMO_USER } from '../preview/mockAuthService';
import { createMockPlanService } from '../features/purchase-plan/mockService';
import { createMockRecommendationService, RECOMMENDATION_DEMO_PLAN as plan } from '../features/recommendations/mockService';
import type { PlanAnalysis } from '../features/purchase-plan/types';

describe('recommendations app integration', () => {
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
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
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
