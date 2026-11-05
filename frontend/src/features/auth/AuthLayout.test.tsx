import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthLayout } from './AuthLayout';

function mockReducedMotion(reduce: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduce && query.includes('reduce'), media: query,
    addEventListener: () => {}, removeEventListener: () => {},
  }));
}

const hero = (container: HTMLElement) => container.querySelector('[data-auth-hero]');

describe('AuthLayout ship video', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('plays the muted, looping ship video with its poster', () => {
    mockReducedMotion(false);
    const { container } = render(<AuthLayout label="Sign in"><p>form</p></AuthLayout>);
    const video = hero(container) as HTMLVideoElement;
    expect(video.tagName).toBe('VIDEO');
    expect(video.muted).toBe(true);
    expect(video).toHaveAttribute('loop');
    expect(video).toHaveAttribute('src', expect.stringContaining('signin-ship'));
    expect(video.closest('[aria-hidden="true"]')).not.toBeNull();
  });

  it('shows only the still poster when reduced motion is on', () => {
    mockReducedMotion(true);
    const { container } = render(<AuthLayout label="Sign in"><p>form</p></AuthLayout>);
    expect(container.querySelector('video')).toBeNull();
    expect(hero(container)).toHaveAttribute('src', expect.stringContaining('signin-ship-poster'));
  });

  it('keeps the headline and puts the form inside the main landmark', () => {
    render(<AuthLayout label="Create account"><p>form</p></AuthLayout>);
    expect(screen.getByRole('heading', { level: 1, name: /A clearer course/ })).toBeInTheDocument();
    expect(screen.getByRole('main')).toContainElement(screen.getByRole('region', { name: 'Create account' }));
  });
});
