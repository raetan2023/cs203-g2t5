import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { AppShell } from './AppShell';

function shell(path = '/purchase-plans') {
  return render(<AppShell path={path} scenarioDate="2026-11-11" onSignOut={vi.fn()} marketAvailable><p>Page</p></AppShell>);
}

it('opens the phone menu, moves focus into it, and Escape closes it back to the button', async () => {
  const user = userEvent.setup();
  shell();
  const toggle = screen.getByRole('button', { name: 'Menu' });
  expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await user.click(toggle);
  expect(toggle).toHaveAttribute('aria-expanded', 'true');
  expect(document.getElementById('bb-header-menu')).toHaveAttribute('data-open');
  expect(screen.getByRole('link', { name: 'Purchase plans' })).toHaveFocus();
  expect(document.documentElement.style.overflow).toBe('hidden');
  await user.keyboard('{Escape}');
  expect(toggle).toHaveAttribute('aria-expanded', 'false');
  expect(toggle).toHaveFocus();
  expect(document.documentElement.style.overflow).toBe('');
});

it('closes the menu when a link in it is tapped', async () => {
  const user = userEvent.setup();
  shell();
  await user.click(screen.getByRole('button', { name: 'Menu' }));
  await user.click(screen.getByRole('link', { name: 'Market dashboard' }));
  expect(screen.getByRole('button', { name: 'Menu' })).toHaveAttribute('aria-expanded', 'false');
});

it('closes the menu when the route changes', async () => {
  const user = userEvent.setup();
  const view = shell('/home');
  await user.click(screen.getByRole('button', { name: 'Menu' }));
  view.rerender(<AppShell path="/purchase-plans" scenarioDate="2026-11-11" onSignOut={vi.fn()} marketAvailable><p>Page</p></AppShell>);
  expect(screen.getByRole('button', { name: 'Menu' })).toHaveAttribute('aria-expanded', 'false');
});
