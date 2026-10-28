import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { clerkAppearance, colors } from '../../styles/theme';
import { ClerkAuthPage } from './ClerkAuthPage';

const received = vi.hoisted(() => ({ props: [] as Record<string, unknown>[] }));
vi.mock('@clerk/react', () => ({
  SignIn: (props: Record<string, unknown>) => { received.props.push(props); return <><p>Clerk sign-in form</p>
    <div className="cl-formFieldRow__password" aria-hidden="true"><label htmlFor="pw">Password</label><input id="pw" name="password" type="password" tabIndex={-1} /></div></>; },
  SignUp: (props: Record<string, unknown>) => { received.props.push(props); return <p>Clerk sign-up form</p>; },
}));

describe('ClerkAuthPage', () => {
  it('renders the reactive-ship layout around the Clerk sign-in form', () => {
    received.props = [];
    const { container } = render(<ClerkAuthPage mode="login" />);
    expect(screen.getByRole('heading', { level: 1, name: /A clearer course/ })).toBeInTheDocument();
    expect(container.querySelector('[data-reactive-ship]')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Sign in' })).toHaveTextContent('Clerk sign-in form');
    expect(received.props[0]).toMatchObject({ routing: 'hash', signUpUrl: '/signup', fallbackRedirectUrl: '/home', appearance: clerkAppearance });
  });

  it('keeps sign-up routing and themes Clerk from the shared tokens', () => {
    received.props = [];
    render(<ClerkAuthPage mode="signup" />);
    expect(screen.getByRole('region', { name: 'Create account' })).toHaveTextContent('Clerk sign-up form');
    expect(received.props[0]).toMatchObject({ routing: 'hash', signInUrl: '/login', fallbackRedirectUrl: '/home' });
    expect(clerkAppearance.variables).toMatchObject({ colorPrimary: colors.authInk, colorBackground: colors.authCard, colorForeground: colors.authInk });
  });

  it("keeps Clerk's first-step password field visible and reachable", async () => {
    render(<ClerkAuthPage mode="login" />);
    const password = screen.getByLabelText('Password');
    expect(password).not.toHaveAttribute('tabindex');
    expect(password.closest('[aria-hidden="true"]')).toBeNull();
    // Clerk hides it again when the field empties; the attributes are removed again.
    password.closest('.cl-formFieldRow__password')!.setAttribute('aria-hidden', 'true');
    password.setAttribute('tabindex', '-1');
    await waitFor(() => expect(password.closest('[aria-hidden="true"]')).toBeNull());
    expect(password).not.toHaveAttribute('tabindex');
  });
});
