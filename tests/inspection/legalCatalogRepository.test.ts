import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ callSbz: vi.fn(), getValue: vi.fn(), saveValue: vi.fn() }));
vi.mock('../../lib/supabase', () => ({
  api: { callSbz: mocks.callSbz },
  supabase: { auth: { getSession: async () => ({ data: { session: { user: { id: 'inspector' } } } }) } },
  isLocalMode: false,
}));
vi.mock('../../lib/offlineDb', () => ({ offlineDb: { getValue: mocks.getValue, saveValue: mocks.saveValue } }));

import { loadLegalCatalog } from '../../features/inspection/repository';

describe('legal catalog cache', () => {
  afterEach(() => vi.restoreAllMocks());

  it('uses a successful server response even when IndexedDB cannot save it', async () => {
    const snapshot = { version: 1, items: [], fetchedAt: '2026-11-19T09:00:00Z' };
    mocks.callSbz.mockResolvedValue(snapshot);
    mocks.saveValue.mockRejectedValue(new Error('IndexedDB quota exceeded'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(loadLegalCatalog()).resolves.toEqual({ ...snapshot, saved: false });
    expect(mocks.saveValue).toHaveBeenCalledWith('inspection:v1:inspector:legal-catalog', snapshot);
    expect(mocks.getValue).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledOnce();
  });
});
