import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { AuthLayout } from './AuthLayout';

/** A stand-in for the form in the card: the scene only reads it. */
function Form() {
  const [error, setError] = useState(false);
  return <form onSubmit={event => { event.preventDefault(); setError(true); }}>
    <label>Email<input name="email" type="email" /></label>
    <label>Password<input name="password" type="password" /></label>
    {error && <p role="alert">Wrong password.</p>}
    <button type="submit">Sign in</button>
  </form>;
}

const lights = (container: HTMLElement) => [...container.querySelectorAll('[data-deck-light]')].map(light => light.getAttribute('data-deck-light'));
const ship = (container: HTMLElement) => container.querySelector('[data-reactive-ship]')!;

describe('AuthLayout reactive ship', () => {
  it('lights the deck as the email is typed and dims while a hidden password is focused', async () => {
    const user = userEvent.setup();
    const { container } = render(<AuthLayout label="Sign in"><Form /></AuthLayout>);
    expect(lights(container).every(level => level === 'on')).toBe(true);
    await user.type(screen.getByLabelText('Email'), 'abc');
    expect(lights(container).filter(level => level === 'hot')).toHaveLength(3);
    expect(lights(container).filter(level => level === 'off')).toHaveLength(7);
    await user.click(screen.getByLabelText('Password'));
    expect(lights(container).every(level => level === 'off')).toBe(true);
    expect(ship(container)).toHaveClass('dim');
  });

  it('sets off on a password submit and turns back with a shake when an error appears', async () => {
    const { container } = render(<AuthLayout label="Sign in"><Form /></AuthLayout>);
    const card = screen.getByRole('region', { name: 'Sign in' });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.co' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong' } });
    await act(async () => { fireEvent.submit(card.querySelector('form')!); });
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(ship(container)).not.toHaveClass('go');
    expect(card).toHaveClass('auth-shake');
  });

  it("does not set off from Clerk's email step, whose password input is hidden for password managers", () => {
    const { container } = render(<AuthLayout label="Sign in"><form onSubmit={event => event.preventDefault()}>
      <label>Email<input name="identifier" /></label>
      <div aria-hidden="true"><input name="password" type="password" tabIndex={-1} /></div>
    </form></AuthLayout>);
    fireEvent.submit(container.querySelector('form')!);
    expect(ship(container)).not.toHaveClass('go');
  });

  it('keeps the headline and puts the form inside the main landmark', () => {
    render(<AuthLayout label="Create account"><Form /></AuthLayout>);
    expect(screen.getByRole('heading', { level: 1, name: /A clearer course/ })).toBeInTheDocument();
    expect(screen.getByRole('main')).toContainElement(screen.getByRole('region', { name: 'Create account' }));
  });
});
