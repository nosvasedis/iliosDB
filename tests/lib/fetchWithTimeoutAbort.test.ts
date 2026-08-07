import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithTimeoutAndAbort } from '../../lib/supabase';

describe('fetchWithTimeoutAndAbort', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('aborts the in-flight request when the timeout fires', async () => {
    let sawAbort = false;
    const pending = fetchWithTimeoutAndAbort((signal) => {
      signal.addEventListener('abort', () => {
        sawAbort = true;
      });
      return new Promise((resolve) => {
        setTimeout(() => resolve({ data: [], error: null }), 10_000);
      });
    }, 50);

    const expectation = expect(pending).rejects.toThrow('TIMEOUT');
    await vi.advanceTimersByTimeAsync(50);
    await expectation;
    expect(sawAbort).toBe(true);
  });

  it('resolves when the request finishes before the timeout', async () => {
    const pending = fetchWithTimeoutAndAbort(async () => ({ data: [1], error: null }), 5_000);
    await vi.advanceTimersByTimeAsync(0);
    await expect(pending).resolves.toEqual({ data: [1], error: null });
  });
});
