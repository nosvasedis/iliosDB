import { beforeEach, describe, expect, it, vi } from 'vitest';
import { INITIAL_SETTINGS } from '../../constants';

const mocks = vi.hoisted(() => ({
  getTable: vi.fn(), saveTable: vi.fn(), from: vi.fn(),
  update: vi.fn(), eq: vi.fn(), select: vi.fn(), single: vi.fn(),
}));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: mocks.from }) }));
vi.mock('../../lib/offlineDb', () => ({ offlineDb: { getTable: mocks.getTable, saveTable: mocks.saveTable } }));
import { api } from '../../lib/supabase';

describe('pricing policy persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('navigator', { onLine: true });
    const builder = { update: mocks.update, eq: mocks.eq, select: mocks.select, single: mocks.single };
    mocks.from.mockReturnValue(builder); mocks.update.mockReturnValue(builder); mocks.eq.mockReturnValue(builder); mocks.select.mockReturnValue(builder);
    mocks.getTable.mockResolvedValue([{ ...INITIAL_SETTINGS, pricing_rules: { casting_rate: 0.2 } }]);
    mocks.saveTable.mockResolvedValue(undefined);
  });
  it('writes a changed policy with a JSON equality guard and caches only after successful read-back', async () => {
    mocks.single.mockResolvedValue({ data: { pricing_rules: { plating_rate: 0.4, casting_rate: 0.3 } }, error: null });
    const settings = { ...INITIAL_SETTINGS, pricing_rules: { casting_rate: 0.3, plating_rate: 0.4 } };
    await api.updateSettings(settings);
    expect(mocks.eq).toHaveBeenCalledWith('pricing_rules', '{"casting_rate":0.2}');
    expect(mocks.saveTable).toHaveBeenCalledWith('global_settings', [settings]);
    expect(mocks.single.mock.invocationCallOrder[0]).toBeLessThan(mocks.saveTable.mock.invocationCallOrder[0]);
  });
  it('does not queue or locally activate a rejected or stale policy', async () => {
    mocks.single.mockResolvedValue({ data: null, error: new Error('stale') });
    await expect(api.updateSettings({ ...INITIAL_SETTINGS, pricing_rules: { casting_rate: 0.3 } })).rejects.toThrow('stale');
    expect(mocks.saveTable).not.toHaveBeenCalled();
  });
  it('rejects invalid and offline policy edits before any mutation', async () => {
    await expect(api.updateSettings({ ...INITIAL_SETTINGS, pricing_rules: { casting_rate: NaN } })).rejects.toThrow();
    vi.stubGlobal('navigator', { onLine: false });
    await expect(api.updateSettings({ ...INITIAL_SETTINGS, pricing_rules: { casting_rate: 0.3 } })).rejects.toThrow('σύνδεση');
    expect(mocks.from).not.toHaveBeenCalled(); expect(mocks.saveTable).not.toHaveBeenCalled();
  });
});
