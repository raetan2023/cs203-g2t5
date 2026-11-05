import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { AdminPage } from './AdminPage';
it('opens organisation management and explains the available roles', async () => {
  const manage = vi.fn();
  render(<AdminPage onManageOrganisation={manage} />);
  await userEvent.click(screen.getByRole('button', { name: 'Manage organisation' }));
  expect(manage).toHaveBeenCalledOnce();
  await userEvent.click(screen.getByText('Which role should I assign?'));
  for (const role of ['Admin', 'Procurement Officer', 'Procurement Manager']) expect(screen.getByText(role, { exact: true })).toBeVisible();
  expect(screen.queryByText('Model registry')).not.toBeInTheDocument();
  expect(screen.queryByText('System and data freshness')).not.toBeInTheDocument();
});
it('shows an unavailable state when organisation management is not connected', () => {
  render(<AdminPage />);
  expect(screen.getByRole('status')).toHaveTextContent('Organisation management is unavailable');
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});

it('shows the active company and embedded management without a redundant launch button', () => {
  render(<AdminPage organisationName="Acme Shipping" management={<div>Live member controls</div>} />);
  expect(screen.getByRole('heading', { level: 1, name: 'Acme Shipping' })).toBeVisible();
  expect(screen.getByText('Live member controls')).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Manage organisation' })).not.toBeInTheDocument();
});
