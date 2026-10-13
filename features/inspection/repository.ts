import { api, supabase, isLocalMode } from '../../lib/supabase';
import { offlineDb } from '../../lib/offlineDb';
import type { InspectionFilters, InspectionSnapshot, LegalCatalogItem } from './types';

async function owner(): Promise<string> {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.user?.id) throw new Error('Απαιτείται ενεργή συνεδρία διαχειριστή.');
  return data.session.user.id;
}

export function validateInspectionSnapshot(value: any, filters: InspectionFilters): asserts value is InspectionSnapshot {
  if (value?.version !== 1 || !value.tables || !value.fetchedAt || !['complete', 'partial'].includes(value.status?.state)
    || value.filters?.environment !== filters.environment || value.filters?.dateFrom !== filters.dateFrom || value.filters?.dateTo !== filters.dateTo
    || !Array.isArray(value.tables.legal_documents) || !Array.isArray(value.tables.legal_document_lines)) {
    throw new Error('Το στιγμιότυπο δεν έχει έγκυρη δομή ή αντιστοιχεί σε διαφορετικά φίλτρα.');
  }
  for (const [table, rows] of Object.entries(value.tables)) {
    if (!Array.isArray(rows) || rows.some((row) => !row || typeof row !== 'object' || Array.isArray(row))) throw new Error(`Μη έγκυρη ενότητα: ${table}`);
  }
}

export async function loadInspectionSnapshot(filters: InspectionFilters, signal?: AbortSignal): Promise<InspectionSnapshot> {
  if (isLocalMode) throw new Error('Η λειτουργία ελέγχου χρειάζεται τα πραγματικά στοιχεία της συνδεδεμένης βάσης.');
  const key = `inspection:v1:${await owner()}:snapshot:${JSON.stringify(filters)}`;
  try {
    const snapshot = await api.callSbz('/inspection/snapshot', filters, signal);
    validateInspectionSnapshot(snapshot, filters);
    await offlineDb.saveValue(key, snapshot);
    return snapshot;
  } catch (error) {
    if (signal?.aborted) throw error;
    const saved = await offlineDb.getValue<InspectionSnapshot>(key);
    if (!saved) throw error;
    validateInspectionSnapshot(saved, filters);
    return { ...saved, status: { ...saved.status, source: 'saved', state: 'saved', error: error instanceof Error ? error.message : 'Η ενημέρωση απέτυχε.' } };
  }
}

export async function loadLegalCatalog(signal?: AbortSignal): Promise<{ items: LegalCatalogItem[]; fetchedAt: string; saved: boolean }> {
  const key = `inspection:v1:${await owner()}:legal-catalog`;
  try {
    const result = await api.callSbz('/legal/catalog', undefined, signal);
    if (result?.version !== 1 || !Array.isArray(result.items) || !result.fetchedAt) throw new Error('Μη έγκυρη απάντηση καταλόγου.');
    await offlineDb.saveValue(key, result);
    return { ...result, saved: false };
  } catch (error) {
    if (signal?.aborted) throw error;
    const saved = await offlineDb.getValue<{ version: number; items: LegalCatalogItem[]; fetchedAt: string }>(key);
    if (!saved || saved.version !== 1 || !Array.isArray(saved.items)) throw error;
    return { ...saved, saved: true };
  }
}

let supportInFlight: Promise<Record<string, any[]>> | null = null;
export async function loadInspectionSupport(): Promise<Record<string, any[]>> {
  // Only coalesce concurrent requests; never reuse another login's data.
  if (supportInFlight) return supportInFlight;
  supportInFlight = (async () => {
    const key = `inspection:v1:${await owner()}:support`;
    try {
      const result = await api.callSbz('/inspection/support');
      if (!Array.isArray(result?.legal_settings) || !Array.isArray(result?.orders)) throw new Error('Μη έγκυρα υποστηρικτικά στοιχεία.');
      await offlineDb.saveValue(key, result);
      return result;
    } catch (error) {
      if (typeof navigator === 'undefined' || navigator.onLine) throw error;
      const saved = await offlineDb.getValue<Record<string, any[]>>(key);
      if (!saved) throw error;
      return saved;
    }
  })();
  try { return await supportInFlight; }
  finally { supportInFlight = null; }
}
