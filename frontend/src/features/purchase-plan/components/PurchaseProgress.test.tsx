import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { PurchaseProgress } from './PurchaseProgress';

it('splits approved volume into purchased and remaining, sized by share', () => {
  const { container } = render(<PurchaseProgress purchased={690} remaining={580} />);
  expect(screen.getByRole('img', { name: '54% purchased: 690 MT bought, 580 MT remaining to buy.' })).toBeVisible();
  expect(screen.getByText('54%')).toBeVisible();
  const [bought, left] = container.querySelectorAll<HTMLElement>('.pp-progress-part');
  expect(parseFloat(bought.style.width)).toBeCloseTo(54.33, 1);
  expect(parseFloat(left.style.width)).toBeCloseTo(45.67, 1);
  expect(bought).toHaveAccessibleName('Purchased: 690 MT, 54%');
});

it('leaves out labels that do not fit and explains an empty team', () => {
  const { container, rerender } = render(<PurchaseProgress purchased={5} remaining={95} />);
  expect(container.querySelectorAll('.pp-progress-label')).toHaveLength(1);
  rerender(<PurchaseProgress purchased={0} remaining={0} />);
  expect(screen.getByText(/No approved volume yet/)).toBeVisible();
});

it('shows approved volume that was never bought as a striped part, without changing the headline', () => {
  const { container } = render(<PurchaseProgress purchased={690} remaining={580} shortfall={10} />);
  expect(screen.getByText('54%')).toBeVisible();
  expect(screen.getByRole('img', { name: '54% purchased: 690 MT bought, 580 MT remaining to buy, 10 MT approved but not bought.' })).toBeVisible();
  const parts = container.querySelectorAll<HTMLElement>('.pp-progress-part');
  expect(parts).toHaveLength(3);
  expect(parts[2]).toHaveClass('pp-progress-part--shortfall');
  expect(parseFloat(parts[2].style.width)).toBeCloseTo(10 / 1280 * 100, 2);
  expect(container.querySelector('.pp-progress-legend')).toHaveTextContent('Not bought');
});
