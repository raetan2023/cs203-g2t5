import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { NewsDataNotice } from './NewsDataNotice';

describe('News data limitations', () => {
  it('combines older and estimated news into one notice without losing either limitation', () => {
    render(<NewsDataNotice sourceDates={{ gdelt_fallback: '2026-11-01', gdelt_estimated: '2026-11-01' }} />);
    const notice = screen.getByRole('note', { name: 'News data limitations' });
    expect(screen.getAllByRole('note')).toHaveLength(1);
    expect(notice).toHaveTextContent('Using older, estimated news data');
    expect(notice).toHaveTextContent('01 Nov 2026, including API-supplied estimates');
    expect(notice).toHaveTextContent('not the Ridge central estimate');
    expect(notice).toHaveTextContent('News older than seven days is excluded');
  });

  it('preserves distinct dates when older and estimated inputs differ', () => {
    render(<NewsDataNotice sourceDates={{ gdelt_fallback: '2026-11-02', gdelt_estimated: '2026-11-01' }} />);
    expect(screen.getByRole('note')).toHaveTextContent('from 02 Nov 2026. Inputs for 01 Nov 2026 include API-supplied estimates');
  });

  it('does not show a warning for current observed news', () => {
    render(<NewsDataNotice sourceDates={{ gdelt: '2026-11-03', gdelt_estimated: null }} />);
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });
});
