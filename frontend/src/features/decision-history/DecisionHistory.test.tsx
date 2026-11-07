import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PurchasePlan } from '../purchase-plan/types';
import { PlanError } from '../purchase-plan/types';
import { DecisionHistory } from './DecisionHistory';
import { buildCard, expectedSavingText, filterCards, savedOf, tilesOf, titleOf } from './model';
import {
  APPROVED_PLAN as APPROVED, COMPLETED_PLAN as DONE, createDecisionFixtureService as service, DECISION_FIXTURE_TODAY as TODAY,
  DRAFT_PLAN as DRAFT, PENDING_PLAN as PENDING, REJECTED_PLAN as REJECTED, SUBMISSION_FIXTURES as submissions, WITHDRAWN_PLAN as WITHDRAWN,
} from './fixtures';

const plan = (id: string, status: PurchasePlan['status'], quantity_mt: number, purchase_deadline: string): PurchasePlan =>
  ({ plan_id: id, status, quantity_mt, purchase_deadline, scenario_as_of_date: TODAY, days_remaining: 20, submitted_at: '2026-11-06T00:57:00Z' });

const card = (name: RegExp | string) => screen.getByRole('article', { name });

describe('decision history page', () => {
  it('shows one card per submitted plan, newest first, and never a draft', async () => {
    const { container } = render(<DecisionHistory planService={service([DRAFT, DONE, PENDING, REJECTED, APPROVED, WITHDRAWN])} organisationName="MPP" today={TODAY} />);
    await screen.findByRole('tabpanel');
    const titles = [...container.querySelectorAll<HTMLElement>('.dh-action')].map(el => el.textContent);
    expect(titles).toEqual(['Monitor', 'Wait, buy Sun 06 Dec', 'Buy now', 'Wait, buy Sun 06 Dec', 'Buy now']);
    expect(screen.queryByText('999 MT', { exact: false })).toBeNull();
  });

  it('counts the summary tiles and sums what completed buys saved', async () => {
    render(<DecisionHistory planService={service([DONE, PENDING, REJECTED, APPROVED, WITHDRAWN])} today={TODAY} />);
    await screen.findByRole('tabpanel');
    const tiles = within(screen.getByRole('region', { name: 'Summary' }));
    expect(tiles.getByText('Awaiting approval').nextElementSibling).toHaveTextContent('1');
    expect(tiles.getByText('Approved, not yet bought').nextElementSibling).toHaveTextContent('1');
    expect(tiles.getByText('Completed').nextElementSibling).toHaveTextContent('1');
    expect(tiles.getByText('Saved on completed buys').nextElementSibling).toHaveTextContent('USD 51,500');
  });

  it('tells each stage its own story: pending, approved with progress, rejected with the comment, completed with the saving', async () => {
    render(<DecisionHistory planService={service([PENDING, APPROVED, REJECTED, DONE])} organisationName="MPP" today={TODAY} />);
    await screen.findByRole('tabpanel');

    const pending = within(card(/^Monitor/));
    expect(pending.getByText('Waiting for a manager')).toBeVisible();
    expect(pending.getByText('Get a current supplier quote first.')).toBeVisible();
    expect(pending.getByText(/Buying today: USD 1\.2m at \$1,351\.50\/MT/)).toBeVisible();
    expect(pending.getByText('Sent to every manager in MPP')).toBeVisible();
    expect(pending.getByRole('link', { name: 'View recommendation' })).toHaveAttribute('href', '/purchase-plans/recommendation?plan_id=p1');

    const approved = within(card(/^Wait, buy/));
    expect(approved.getByText('Approved by Alex Tan')).toBeVisible();
    expect(approved.getByText(/Expected saving ≈ USD 1\.16m–1\.70m/)).toBeVisible();
    const steps = within(approved.getByRole('list', { name: 'Progress' })).getAllByRole('listitem');
    expect(steps.map(s => s.textContent)).toEqual([
      'SubmittedThu 05 Nov', 'ApprovedFri 06 Nov · Alex Tan', 'Buy dateSun 06 Dec · in 30 days', 'OutcomeMeasured once you record the purchase',
    ]);

    const rejected = within(screen.getAllByRole('article', { name: /^Buy now/ })[0]);
    expect(rejected.getByText('Rejected by Alex Tan')).toBeVisible();
    expect(rejected.getByText('“Budget is frozen until January.”')).toBeVisible();

    const done = within(screen.getAllByRole('article', { name: /^Buy now/ })[1]);
    expect(done.getByText('Completed')).toBeVisible();
    expect(done.getByText(/Bought 1,000 MT at \$1,300\.00\/MT on Sat 07 Nov 2026\./)).toBeVisible();
    expect(done.getByText('Advice saved ≈ USD 51,500')).toBeVisible();
    expect(done.getByRole('link', { name: 'View purchase record' })).toBeVisible();
    expect(done.queryByRole('list', { name: 'Progress' })).toBeNull();
  });

  it('filters by status tab and by the search box', async () => {
    render(<DecisionHistory planService={service([PENDING, APPROVED, REJECTED, DONE, WITHDRAWN])} today={TODAY} />);
    await screen.findByRole('tabpanel');
    expect(screen.getAllByRole('article')).toHaveLength(5);

    fireEvent.click(screen.getByRole('tab', { name: /Approved/ }));
    expect(screen.getAllByRole('article')).toHaveLength(1);
    expect(screen.getByRole('tab', { name: /Approved/ })).toHaveAttribute('aria-selected', 'true');

    fireEvent.click(screen.getByRole('tab', { name: 'All' }));
    fireEvent.change(screen.getByLabelText('Find a plan'), { target: { value: '6,767' } });
    expect(screen.getAllByRole('article')).toHaveLength(1);
    expect(card(/^Wait, buy/)).toBeVisible();

    fireEvent.change(screen.getByLabelText('Find a plan'), { target: { value: '26 Nov' } });
    expect(card(/^Monitor/)).toBeVisible();

    fireEvent.change(screen.getByLabelText('Find a plan'), { target: { value: 'nothing here' } });
    expect(screen.getByRole('status')).toHaveTextContent('No plans match');
    fireEvent.click(screen.getByRole('button', { name: 'Show all plans' }));
    expect(screen.getAllByRole('article')).toHaveLength(5);
  });

  it('moves between tabs with the arrow keys', async () => {
    render(<DecisionHistory planService={service([PENDING, APPROVED])} today={TODAY} />);
    await screen.findByRole('tabpanel');
    const all = screen.getByRole('tab', { name: 'All' });
    all.focus();
    fireEvent.keyDown(all, { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: /Pending approval/ })).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(screen.getByRole('tablist'), { key: 'End' });
    expect(screen.getByRole('tab', { name: 'Completed' })).toHaveAttribute('aria-selected', 'true');
  });

  it('still shows a plan whose submission could not be read, and says so', async () => {
    const svc = service([PENDING, plan('p9', 'submitted', 300, '2026-12-15')]);
    render(<DecisionHistory planService={svc} today={TODAY} />);
    await screen.findByRole('tabpanel');
    const broken = within(card('Recommendation'));
    expect(broken.getByText('No saved purchase plan was found.')).toBeVisible();
    expect(broken.getByText('Waiting for a manager')).toBeVisible();
  });

  it('offers an empty state and a retry after a failed load', async () => {
    const list = vi.fn().mockRejectedValueOnce(new PlanError('Network down', {}, 503)).mockResolvedValue({ plans: [] });
    render(<DecisionHistory planService={service([], { list })} today={TODAY} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Network down');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(screen.getByText('Nothing submitted yet')).toBeVisible());
    expect(screen.getByRole('link', { name: 'Go to your plans' })).toHaveAttribute('href', '/purchase-plans');
  });
});

describe('decision history model', () => {
  it('names the card after the action and the buy date', () => {
    expect(titleOf('WAIT', '2026-12-06')).toBe('Wait, buy Sun 06 Dec');
    expect(titleOf('WAIT', null)).toBe('Wait');
    expect(titleOf('SPLIT', null)).toBe('Split purchase');
    expect(titleOf(null, null)).toBe('Recommendation');
  });

  it('reads the saving from the backend comparison, and falls back to the snapshot reference', () => {
    expect(savedOf(submissions.p4.comparison, submissions.p4.purchase, 1_351_500, 1000)).toBe(51_500);
    expect(savedOf(null, submissions.p4.purchase, 1_351_500, 1000)).toBe(51_500);
    // A smaller delivery is compared with the reference for the same tonnage, never with the whole plan.
    expect(savedOf(null, { ...submissions.p4.purchase!, quantity_mt: 500, total_usd: 650_000 }, 1_351_500, 1000)).toBe(25_750);
    expect(savedOf(null, null, 1_351_500, 1000)).toBeNull();
  });

  it('words an expected saving by its sign', () => {
    expect(expectedSavingText({ lower: 100_000, upper: 1_450_000 })).toBe('Expected saving ≈ USD 0.10m–1.45m');
    expect(expectedSavingText({ lower: -20_000, upper: 30_000 })).toBe('Expected change: USD 30,000 less to USD 20,000 more');
    expect(expectedSavingText({ lower: -50_000, upper: -10_000 })).toBe('Expected to cost USD 10,000–50,000 more');
  });

  it('builds tiles from cards and filters by stage and text', () => {
    const cards = [buildCard(PENDING, 'pending', submissions.p1), buildCard(DONE, 'completed', submissions.p4), buildCard(APPROVED, 'approved', submissions.p2)];
    expect(tilesOf(cards)).toEqual({ pending: 1, approved: 1, completed: 1, saved: 51_500 });
    expect(filterCards(cards, 'completed', '')).toHaveLength(1);
    expect(filterCards(cards, 'all', '888')).toHaveLength(1);
    expect(filterCards(cards, 'all', '2027')).toHaveLength(1);
    expect(filterCards(cards, 'pending', '2027')).toHaveLength(0);
  });
});
