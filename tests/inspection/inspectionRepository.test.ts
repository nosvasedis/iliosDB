import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../lib/supabase', () => ({ isLocalMode: false, api: { callSbz: vi.fn() },
  supabase: { auth: { getSession: vi.fn().mockResolvedValue({ data: { session: { user: { id: 'owner' } } }, error: null }) } } }));
vi.mock('../../lib/offlineDb', () => ({ offlineDb: { saveValue: vi.fn(), getValue: vi.fn() } }));
import { api, supabase } from '../../lib/supabase';
import { offlineDb } from '../../lib/offlineDb';
import { loadInspectionSnapshot, validateInspectionSnapshot } from '../../features/inspection/repository';

const filters = { environment: 'prod' as const, dateFrom: '', dateTo: '' };
const snapshot = () => ({ version: 1, fetchedAt: '2026-10-13T12:00:00Z', filters: { dateTo: '', dateFrom: '', environment: 'prod' },
  status: { state: 'complete', source: 'database', error: null }, tableStatus: { legal_documents: 'complete', legal_document_lines: 'complete' }, tables: { legal_documents: [], legal_document_lines: [] } });
describe('inspection snapshot provenance', () => {
  beforeEach(() => { vi.clearAllMocks(); vi.mocked(offlineDb.getValue).mockResolvedValue(null); });
  it('accepts JSONB key ordering and stores a complete empty snapshot in its own namespace', async () => {
    vi.mocked(api.callSbz).mockResolvedValue(snapshot());
    const result = await loadInspectionSnapshot(filters);
    expect(result.status.state).toBe('complete');
    expect(offlineDb.saveValue).toHaveBeenCalledWith(expect.stringContaining('inspection:v1:owner:snapshot:'), result);
  });
  it('raises a failed request when no exact saved snapshot exists instead of inventing an empty list', async () => {
    vi.mocked(api.callSbz).mockRejectedValue(new Error('Network unavailable'));
    await expect(loadInspectionSnapshot(filters)).rejects.toThrow('Network unavailable');
    expect(offlineDb.saveValue).not.toHaveBeenCalled();
  });
  it('marks a saved snapshot with its original timestamp and the failed refresh reason', async () => {
    vi.mocked(api.callSbz).mockRejectedValue(new Error('Network unavailable'));
    vi.mocked(offlineDb.getValue).mockResolvedValue(snapshot());
    const result = await loadInspectionSnapshot(filters);
    expect(result.status).toMatchObject({ state: 'saved', source: 'saved', error: 'Network unavailable' });
    expect(result.fetchedAt).toBe('2026-10-13T12:00:00Z');
  });
  it('does not accept snapshots belonging to another filter or another user namespace', async () => {
    expect(() => validateInspectionSnapshot({ ...snapshot(), filters: { ...filters, environment: 'dev' } }, filters)).toThrow();
    vi.mocked(supabase.auth.getSession).mockResolvedValueOnce({ data: { session: { user: { id: 'other' } } }, error: null } as any);
    vi.mocked(api.callSbz).mockRejectedValue(new Error('No network'));
    await expect(loadInspectionSnapshot(filters)).rejects.toThrow();
    expect(offlineDb.getValue).toHaveBeenCalledWith(expect.stringContaining('inspection:v1:other:snapshot:'));
  });
  it('does not replace a cancelled request with stale cached evidence', async () => {
    const controller = new AbortController(); controller.abort();
    vi.mocked(api.callSbz).mockRejectedValue(new Error('Aborted'));
    await expect(loadInspectionSnapshot(filters, controller.signal)).rejects.toThrow('Aborted');
    expect(offlineDb.getValue).not.toHaveBeenCalled();
  });
});
