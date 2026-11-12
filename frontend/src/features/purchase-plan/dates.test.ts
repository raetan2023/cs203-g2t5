import { expect, it } from 'vitest';
import { formatDate, formatDateTime } from './dates';

it('formats dates and moments the same way across manager sections', () => {
  expect(formatDate('2026-11-25')).toBe('25 Nov 2026');
  expect(formatDateTime('2026-11-09T15:54:04Z')).toBe('09 Nov 2026, 23:54:04');
  expect(formatDateTime(new Date('2026-11-11T15:56:36Z'))).toBe('11 Nov 2026, 23:56:36');
});
