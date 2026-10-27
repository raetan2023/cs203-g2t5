import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { clerkAppearance, colors } from '../../styles/theme';
import { ClerkAuthPage } from './ClerkAuthPage';

const received = vi.hoisted(() => ({ props: [] as Record<string, unknown>[] }));
vi.mock('@clerk/react', () => ({
  SignIn: (props: Record<string, unknown>) => { received.props.push(props); return <p>Clerk sign-in form</p>; },
  SignUp: (props: Record<string, unknown>) => { received.props.push(props); return <p>Clerk sign-up form</p>; },
}));

describe('ClerkAuthPage', () => {
  it('renders the wireframe layout around the Clerk sign-in form', () => {
    received.props = [];
    const { container } = render(<ClerkAuthPage mode="login" />);
    expect(screen.getByRole('heading', { level: 1, name: /A clearer course/ })).toBeInTheDocument();
    expect(container.querySelector('[data-wireframe-vessel]')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Sign in' })).toHaveTextContent('Clerk sign-in form');
    expect(received.props[0]).toMatchObject({ routing: 'hash', signUpUrl: '/signup', fallbackRedirectUrl: '/home', appearance: clerkAppearance });
  });

  it('keeps sign-up routing and themes Clerk from the shared tokens', () => {
    received.props = [];
    render(<ClerkAuthPage mode="signup" />);
    expect(screen.getByRole('region', { name: 'Create account' })).toHaveTextContent('Clerk sign-up form');
    expect(received.props[0]).toMatchObject({ routing: 'hash', signInUrl: '/login', fallbackRedirectUrl: '/home' });
    expect(clerkAppearance.variables).toMatchObject({ colorPrimary: colors.action, colorBackground: colors.surface, colorForeground: colors.text });
  });
});
