import { StrictMode } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { navigate } from './router';
import { createMockAuthService, DEMO_USER } from '../preview/mockAuthService';
import { createMockPlanService } from '../features/purchase-plan/mockService';
import { DEMO_SCENARIO_DATE } from '../features/purchase-plan/fixtures';
import { AuthError } from '../features/auth/types';

beforeEach(() => window.history.replaceState(null, '', '/login'));
function setup(auth = createMockAuthService({ delayMs: 0 })) {
  const factory = vi.fn(() => createMockPlanService({ delayMs: 0 }));
  render(<StrictMode><App auth={auth} scenarioDate={DEMO_SCENARIO_DATE} createPlanService={factory} mock /></StrictMode>);
  return { user: userEvent.setup(), auth, factory };
}
async function login(user: ReturnType<typeof userEvent.setup>) {
  await user.type(await screen.findByLabelText('Email address'), 'john@example.com');
  await user.type(screen.getByLabelText('Password', { exact: true }), 'demo-password');
  await user.click(screen.getByRole('button', { name: 'Sign in' }));
}
async function openMenu(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'Open navigation' }));
  return screen.getByRole('dialog', { name: 'Main navigation' });
}

describe('shared app and auth journeys', () => {
  it('validates sign-in fields and toggles the password without submitting', async () => {
    const { user, auth } = setup();
    const signIn = vi.spyOn(auth, 'signIn');
    await user.click(await screen.findByRole('button', { name: 'Sign in' }));
    expect(screen.getByText('Enter your email address.')).toBeVisible();
    expect(screen.getByText('Enter your password.')).toBeVisible();
    expect(screen.getByLabelText('Email address')).toHaveFocus();
    await user.type(screen.getByLabelText('Email address'), 'invalid');
    await user.type(screen.getByLabelText('Password', { exact: true }), 'secret');
    await user.click(screen.getByRole('button', { name: 'Show password' }));
    expect(screen.getByLabelText('Password', { exact: true })).toHaveAttribute('type', 'text');
    expect(signIn).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(screen.getByLabelText('Password', { exact: true })).toHaveValue('secret');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(screen.getByText('Enter a valid email address.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeDisabled();
    expect(screen.queryByText('Forgot password?')).not.toBeInTheDocument();
  });

  it('signs in, creates a plan, preserves it across navigation, signs out and clears user data', async () => {
    const { user, factory } = setup();
    await login(user);
    expect(await screen.findByRole('heading', { name: 'Welcome back, John' })).toBeVisible();
    await user.click(screen.getByRole('link', { name: 'Go to purchase plans' }));
    await user.click(await screen.findByRole('button', { name: 'Create plan' }));
    await user.type(screen.getByLabelText('Quantity'), '500');
    fireEvent.change(screen.getByLabelText('Purchase deadline'), { target: { value: '2025-11-15' } });
    await user.click(screen.getByRole('button', { name: 'Save plan' }));
    await screen.findByText('500 MT');
    let menu = await openMenu(user);
    expect(within(menu).getByRole('link', { name: 'Purchase plans' })).toHaveAttribute('aria-current', 'page');
    await user.click(within(menu).getByRole('link', { name: 'Home' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Go to purchase plans' }));
    expect(await screen.findByText('500 MT')).toBeVisible();
    expect(factory).toHaveBeenCalledTimes(1);
    menu = await openMenu(user);
    await user.click(within(menu).getByRole('button', { name: 'Sign out' }));
    await screen.findByRole('button', { name: 'Sign in' });
    await act(async () => navigate('/purchase-plans'));
    await waitFor(() => expect(window.location.pathname).toBe('/login'));
    await login(user);
    expect(await screen.findByText("You haven't created a purchase plan yet.")).toBeVisible();
    expect(factory).toHaveBeenCalledTimes(2);
  });

  it('validates signup, surfaces provider field errors, retries and uses the entered name', async () => {
    window.history.replaceState(null, '', '/signup');
    const { user, auth } = setup();
    vi.spyOn(auth, 'signUp').mockRejectedValueOnce(new AuthError('Please check your email.', { email: 'That email is already registered.' }));
    await user.click(await screen.findByRole('button', { name: 'Create account' }));
    expect(screen.getByText('Enter your full name.')).toBeVisible();
    await user.type(screen.getByLabelText('Full name'), 'Rae');
    await user.type(screen.getByLabelText('Email address'), 'rae@example.com');
    await user.type(screen.getByLabelText('Password', { exact: true }), 'demo');
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Please check your email.');
    expect(screen.getByLabelText('Email address')).toHaveAccessibleDescription('That email is already registered.');
    expect(screen.getByLabelText('Full name')).toHaveValue('Rae');
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByRole('heading', { name: 'Welcome back, Rae' })).toBeVisible();
  });

  it('keeps session loading separate from private content and retries a failed session check', async () => {
    window.history.replaceState(null, '', '/home');
    const auth = createMockAuthService({ user: DEMO_USER, delayMs: 0, failOnce: 'session' });
    const read = vi.spyOn(auth, 'readSession');
    const { user } = setup(auth);
    expect(screen.getByText('Loading your home...')).toBeVisible();
    expect(screen.queryByText('Welcome back, John')).not.toBeInTheDocument();
    expect(await screen.findByRole('alert')).toHaveTextContent('Your session could not be loaded.');
    expect(read).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Welcome back, John')).toBeVisible();
  });

  it('retains inputs after login failure and prevents duplicate submits during a pending request', async () => {
    const auth = createMockAuthService({ delayMs: 0, failOnce: 'login' });
    const { user } = setup(auth);
    await login(user);
    expect(await screen.findByRole('alert')).toHaveTextContent('Sign-in failed.');
    expect(screen.getByLabelText('Email address')).toHaveValue('john@example.com');
    let resolve!: (value: typeof DEMO_USER) => void;
    const signIn = vi.spyOn(auth, 'signIn').mockImplementation(() => new Promise(done => { resolve = done; }));
    await user.dblClick(screen.getByRole('button', { name: 'Sign in' }));
    expect(signIn).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Signing in...' })).toBeDisabled();
    expect(screen.getByLabelText('Email address')).toBeDisabled();
    await act(async () => resolve(DEMO_USER));
    expect(await screen.findByText('Welcome back, John')).toBeVisible();
  });

  it('traps navigation focus, supports Escape, and retains the session when sign-out fails', async () => {
    window.history.replaceState(null, '', '/home');
    const { user } = setup(createMockAuthService({ user: DEMO_USER, delayMs: 0, failOnce: 'logout' }));
    let menu = await openMenu(user);
    expect(within(menu).getByRole('button', { name: 'Close navigation' })).toHaveFocus();
    await user.tab({ shift: true });
    expect(within(menu).getByRole('button', { name: 'Sign out' })).toHaveFocus();
    await user.tab();
    expect(within(menu).getByRole('button', { name: 'Close navigation' })).toHaveFocus();
    expect(within(menu).getByRole('button', { name: /Recommendation/ })).toBeDisabled();
    expect(within(menu).getByRole('button', { name: 'Market dashboard' })).toBeDisabled();
    fireEvent(menu, new Event('cancel', { bubbles: true, cancelable: true }));
    expect(screen.getByRole('button', { name: 'Open navigation' })).toHaveFocus();
    menu = await openMenu(user);
    await user.click(within(menu).getByRole('button', { name: 'Sign out' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't sign you out.");
    expect(screen.getByText('Welcome back, John')).toBeVisible();
    await user.click(within(menu).getByRole('button', { name: 'Sign out' }));
    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeVisible();
  });

  it('handles session expiry and does not restore private data with browser navigation', async () => {
    window.history.replaceState(null, '', '/purchase-plans');
    const { auth, user } = setup(createMockAuthService({ user: DEMO_USER, delayMs: 0 }));
    await user.click(await screen.findByRole('button', { name: 'Create plan' }));
    await user.type(screen.getByLabelText('Quantity'), '600');
    await act(async () => auth.expire());
    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeVisible();
    expect(screen.getByText(/Your session ended/)).toBeVisible();
    expect(screen.queryByLabelText('Quantity')).not.toBeInTheDocument();
    await act(async () => { window.history.replaceState(null, '', '/purchase-plans'); window.dispatchEvent(new PopStateEvent('popstate')); });
    await waitFor(() => expect(window.location.pathname).toBe('/login'));
  });

  it('responds to browser history, shows unknown routes and mounts a supplied market component', async () => {
    window.history.replaceState(null, '', '/home');
    const auth = createMockAuthService({ user: DEMO_USER, delayMs: 0 });
    render(<App auth={auth} scenarioDate={DEMO_SCENARIO_DATE} createPlanService={() => createMockPlanService({ delayMs: 0 })} MarketDashboard={({ scenarioDate }) => <h1>Market component {scenarioDate}</h1>} />);
    await screen.findByText('Welcome back, John');
    await act(async () => { window.history.pushState(null, '', '/market-dashboard'); window.dispatchEvent(new PopStateEvent('popstate')); });
    expect(screen.getByText('Market component 2025-10-24')).toBeVisible();
    await act(async () => navigate('/not-a-route'));
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  });
});
