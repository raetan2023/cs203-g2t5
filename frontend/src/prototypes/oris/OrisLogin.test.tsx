import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { OrisLogin } from './OrisLogin';

describe('isolated Oris login', () => {
  it('validates locally and completes a mock login without network requests', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    render(<OrisLogin />);
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(screen.getByText('Enter your email address.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'demo@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'demo-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'text');
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(screen.getByRole('button', { name: 'Signing in…' })).toBeDisabled();
    await screen.findByRole('heading', { name: 'You’re signed in.' });
    expect(fetchSpy).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Back to sign in' }));
    await waitFor(() => expect(screen.getByLabelText('Password')).toHaveValue(''));
  });

  it('keeps account creation inside the prototype and removes decorative copy', async () => {
    const path = window.location.pathname;
    render(<OrisLogin />);
    fireEvent.click(screen.getByRole('button', { name: 'Create an account' }));
    expect(screen.getByLabelText('Full name')).toBeInTheDocument();
    expect(window.location.pathname).toBe(path);
    expect(screen.queryByText(/Advisory only|SINGAPORE|CLARITY IN EVERY PURCHASE/)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Demo User' } });
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'demo@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'demo-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    await screen.findByRole('heading', { name: 'You’re signed in.' });
    expect(window.location.pathname).toBe(path);
  });

  it('explains that social authentication is disconnected', () => {
    render(<OrisLogin />);
    fireEvent.click(screen.getByRole('button', { name: 'Continue with Google' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Google sign-in is not connected');
    expect(screen.getByLabelText('Email address')).toBeInTheDocument();
  });

  it('does not load video when reduced motion is preferred', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    try {
      const { container } = render(<OrisLogin />);
      expect(container.querySelector('video')).toBeNull();
      expect(container.querySelector('.oris-vessel')).toHaveAttribute('src', expect.stringContaining('vessel-poster.jpg'));
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
