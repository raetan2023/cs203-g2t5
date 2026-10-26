import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useDateRollover } from './useDateRollover';

afterEach(() => vi.useRealTimers());

describe('Singapore date rollover', () => {
  it('refreshes at Singapore midnight, not UTC midnight', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-26T15:59:59Z'));
    const refresh = vi.fn(async () => {});
    const hook = renderHook(() => useDateRollover(true, refresh));
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(refresh).toHaveBeenCalledTimes(1);
    hook.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('refreshes after resume across a date boundary and retries failures', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-26T12:00:00Z'));
    const refresh = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined);
    const hook = renderHook(() => useDateRollover(true, refresh));
    vi.setSystemTime(new Date('2026-10-27T02:00:00Z'));
    await act(async () => { window.dispatchEvent(new Event('focus')); });
    expect(refresh).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(refresh).toHaveBeenCalledTimes(2);
    await act(async () => { window.dispatchEvent(new Event('focus')); });
    expect(refresh).toHaveBeenCalledTimes(2);
    hook.unmount();
  });

  it('does not refresh a signed-out session', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-26T15:59:59Z'));
    const refresh = vi.fn(async () => {});
    const hook = renderHook(() => useDateRollover(false, refresh));
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); window.dispatchEvent(new Event('focus')); });
    expect(refresh).not.toHaveBeenCalled();
    hook.unmount();
  });
});
