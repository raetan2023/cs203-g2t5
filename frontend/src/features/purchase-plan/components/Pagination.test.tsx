import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { Pagination, pageNumbers } from './Pagination';

it('shows page numbers five at a time', () => {
  expect(pageNumbers(1, 3)).toEqual([1, 2, 3]);
  expect(pageNumbers(5, 12)).toEqual([1, 2, 3, 4, 5]);
  expect(pageNumbers(6, 12)).toEqual([6, 7, 8, 9, 10]);
  expect(pageNumbers(12, 12)).toEqual([11, 12]);
});

it('is hidden when everything fits on one page', () => {
  const { container } = render(<Pagination page={1} pageCount={1} onChange={() => {}} label="Pages" />);
  expect(container).toBeEmptyDOMElement();
});

it('moves between pages and blocks of pages', async () => {
  const onChange = vi.fn();
  const view = render(<Pagination page={5} pageCount={12} onChange={onChange} label="Pages" />);
  expect(screen.getByRole('button', { name: 'Page 5' })).toHaveAttribute('aria-current', 'page');
  expect(screen.queryByRole('button', { name: 'Page 6' })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Next page' }));
  expect(onChange).toHaveBeenLastCalledWith(6);
  await userEvent.click(screen.getByRole('button', { name: 'Pages 6 to 10' }));
  expect(onChange).toHaveBeenLastCalledWith(6);
  await userEvent.click(screen.getByRole('button', { name: 'Last page' }));
  expect(onChange).toHaveBeenLastCalledWith(12);

  view.rerender(<Pagination page={6} pageCount={12} onChange={onChange} label="Pages" />);
  expect(screen.getByRole('button', { name: 'Page 10' })).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: 'Pages 1 to 5' }));
  expect(onChange).toHaveBeenLastCalledWith(5);
  expect(screen.getByRole('button', { name: 'Pages 11 to 12' })).toBeVisible();

  view.rerender(<Pagination page={1} pageCount={12} onChange={onChange} label="Pages" />);
  expect(screen.getByRole('button', { name: 'First page' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled();
});
