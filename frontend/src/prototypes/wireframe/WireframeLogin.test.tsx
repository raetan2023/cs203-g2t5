import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { OrisLogin } from '../oris/OrisLogin';
import { WireframeLogin } from './WireframeLogin';

describe('wireframe theme', () => {
  it('preserves the Oris login copy and controls exactly', () => {
    const original = render(<OrisLogin />);
    const copy = original.container.textContent;
    const controls = screen.getAllByRole('button').map(button => button.getAttribute('aria-label') || button.textContent);
    original.unmount();
    const themed = render(<WireframeLogin />);
    expect(themed.container.textContent).toBe(copy);
    expect(screen.getAllByRole('button').map(button => button.getAttribute('aria-label') || button.textContent)).toEqual(controls);
    expect(themed.container.querySelector('video')).toBeNull();
    expect(themed.container.querySelector('[data-wireframe-vessel]')).toBeInTheDocument();
  });

  it('uses the same validation and mock sign-in behavior', async () => {
    render(<WireframeLogin />);
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(screen.getByText('Enter your email address.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'demo@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'demo-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await screen.findByRole('heading', { name: 'You’re signed in.' });
  });
});
