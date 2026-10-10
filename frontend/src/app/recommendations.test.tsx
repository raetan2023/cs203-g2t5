import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
    expect(await screen.findByText('Consider purchasing on 29 October')).toBeVisible();
    expect(document.title).toContain('Purchase recommendation');
    fireEvent.click(screen.getByRole('link', { name: 'Back to purchase plans' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: '200' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    fireEvent.click(await screen.findByRole('link', { name: 'View recommendation →' }));
    expect(await screen.findByText('No recommendation available')).toBeVisible();
    expect(read).toHaveBeenLastCalledWith(expect.objectContaining({ quantity_mt: 200 }));
    await act(async () => navigate('/purchase-plans'));
    await screen.findByText('200 MT');
    await act(async () => planService.delete());
    await act(async () => { window.history.pushState(null, '', '/purchase-plans/recommendation'); window.dispatchEvent(new PopStateEvent('popstate')); });
    expect(await screen.findByText('No saved purchase plan')).toBeVisible();
  });

  it('protects the direct route and discards a late reply after session expiry', async () => {
    window.history.replaceState(null, '', '/purchase-plans/recommendation');
    const auth = createMockAuthService({ user: DEMO_USER, delayMs: 0 });
    let resolve!: (value: PlanAnalysis) => void;
    const service = { read: vi.fn(() => new Promise<PlanAnalysis>(done => { resolve = done; })) };
    render(<App auth={auth} scenarioDate={plan.scenario_as_of_date} createPlanService={() => createMockPlanService({ initialPlan: plan, delayMs: 0 })} createRecommendationService={() => service} />);
    await waitFor(() => expect(service.read).toHaveBeenCalledOnce());
    await act(async () => auth.expire());
    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeVisible();
    await act(async () => resolve(await createMockRecommendationService({ delayMs: 0 }).read(plan)));
    expect(screen.queryByText('Consider purchasing on 29 October')).not.toBeInTheDocument();
    await act(async () => navigate('/purchase-plans/recommendation'));
    await waitFor(() => expect(window.location.pathname).toBe('/login'));
  });
});
