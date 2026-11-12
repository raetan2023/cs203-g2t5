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

it('has only bought and still-to-buy parts, since every purchase is the whole plan', () => {
  const { container } = render(<PurchaseProgress purchased={690} remaining={580} />);
  expect(screen.getByText('54%')).toBeVisible();
  expect(screen.getByRole('img', { name: '54% purchased: 690 MT bought, 580 MT remaining to buy.' })).toBeVisible();
  expect(container.querySelectorAll('.pp-progress-part')).toHaveLength(2);
  expect(container.querySelector('.pp-progress-legend')).not.toHaveTextContent('Not bought');
});
