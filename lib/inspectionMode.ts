import type { QueryClient } from '@tanstack/react-query';
import { getRegisteredQueryClient } from './queryClientRegistry';
import {
  INSPECTION_ALLOWED_TABLES,
  isInspectionRpcAllowed,
  isInspectionWorkerRouteAllowed,
} from './inspectionAllowedTables';

export const INSPECTION_SESSION_KEY = '_ilm';
export const INSPECTION_PERSIST_CACHE_KEY = 'ilios-react-query-cache';
export const INSPECTION_DOCUMENT_TITLE = 'Σύστημα Παραστατικών';

class InspectionAccessError extends Error {
  constructor(tableName: string) {
    super(`Inspection mode blocked access to ${tableName}`);
    this.name = 'InspectionAccessError';
  }
}

export function isInspectionModeActive(): boolean {
  if (typeof localStorage !== 'undefined' && localStorage.getItem(INSPECTION_SESSION_KEY) === '1') return true;
  // Upgrade the old tab-only lock without losing it during a reload.
  if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem(INSPECTION_SESSION_KEY) === '1') {
    if (typeof localStorage !== 'undefined') localStorage.setItem(INSPECTION_SESSION_KEY, '1');
    return true;
  }
  return false;
}

export function assertInspectionTableAllowed(tableName: string): void {
  if (!isInspectionModeActive()) return;
  if (!INSPECTION_ALLOWED_TABLES.has(tableName)) {
    throw new InspectionAccessError(tableName);
  }
}

export function assertInspectionMutationAllowed(tableName: string, method: string): void {
  if (!isInspectionModeActive()) return;
  if (['legal_settings', 'legal_numbering_sequences', 'legal_carriers', 'legal_sync_runs', 'products', 'product_variants', 'profiles'].includes(tableName)
    || (method === 'DELETE' && tableName !== 'legal_document_lines' && tableName !== 'proforma_document_lines')) {
    throw new Error('Αυτή η μεταβολή γίνεται από την κανονική λειτουργία, μετά από έξοδο με PIN.');
  }
}

export function assertInspectionWorkerRouteAllowed(route: string): void {
  if (!isInspectionModeActive()) return;
  if (!isInspectionWorkerRouteAllowed(route)) {
    throw new Error(`Inspection mode blocked worker route ${route}`);
  }
}

export function assertInspectionRpcAllowed(rpcName: string): void {
  if (!isInspectionModeActive()) return;
  if (!isInspectionRpcAllowed(rpcName)) {
    throw new Error(`Inspection mode blocked RPC ${rpcName}`);
  }
}

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  return !!target.closest('[contenteditable="true"]');
}

export function matchesInspectionEnterCombo(event: KeyboardEvent): boolean {
  return event.ctrlKey && event.shiftKey && event.altKey && event.code === 'KeyL';
}

export function matchesInspectionExitCombo(event: KeyboardEvent): boolean {
  return event.ctrlKey && event.shiftKey && event.altKey && event.code === 'KeyU';
}

export async function purgeOfflineInspectionStores(): Promise<void> {
  // Business mirrors and queued writes are records, not disposable UI state.
  // Inspection loaders use their own namespace and never merge this queue.
  // Deliberately preserve both stores, including unsynced local-mode changes.
}

export async function purgeInspectionSensitiveState(queryClient?: QueryClient | null): Promise<void> {
  const client = queryClient ?? getRegisteredQueryClient();
  if (client) {
    await client.cancelQueries();
    client.clear();
  }

  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(INSPECTION_PERSIST_CACHE_KEY);
  }

  await purgeOfflineInspectionStores();
}

function clearInspectionModeFlag(): void {
  if (typeof localStorage !== 'undefined') localStorage.removeItem(INSPECTION_SESSION_KEY);
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.removeItem(INSPECTION_SESSION_KEY);
  }
}

export async function enterInspectionMode(): Promise<void> {
  const client = getRegisteredQueryClient();
  if (client?.isMutating()) {
    throw new Error('Ολοκληρώστε τις ενεργές εργασίες πριν αλλάξετε προβολή.');
  }
  const { api } = await import('./supabase');
  if (!(await api.hasInspectionExitPin())) throw new Error('Ορίστε πρώτα PIN εξόδου στις ρυθμίσεις παραστατικών.');
  const { sealInspectionLocalData } = await import('./inspectionLocalVault');
  await client?.cancelQueries();
  try { await sealInspectionLocalData(); }
  catch (error) {
    if (isInspectionModeActive()) {
      await purgeInspectionSensitiveState();
      window.location.reload();
    }
    throw error;
  }
  localStorage.setItem(INSPECTION_SESSION_KEY, '1');
  if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(INSPECTION_SESSION_KEY);
  await purgeInspectionSensitiveState();
  window.location.reload();
}

export async function exitInspectionMode(pin: string): Promise<void> {
  const { api } = await import('./supabase');
  if (getRegisteredQueryClient()?.isMutating()) throw new Error('Ολοκληρώστε τις ενεργές εργασίες πριν από την έξοδο.');
  if (!pin) throw new Error('Απαιτείται κωδικός εξόδου.');
  const { offlineDb } = await import('./offlineDb');
  const vault = await offlineDb.getInspectionVault();
  const result = await api.exitInspectionSession(pin, vault?.id);
  if (!result.unlocked) throw new Error('Λανθασμένος κωδικός εξόδου ή πολλές προσπάθειες. Περιμένετε ένα λεπτό και δοκιμάστε ξανά.');
  if (vault) {
    try {
      const { restoreInspectionLocalData } = await import('./inspectionLocalVault');
      await restoreInspectionLocalData(result.vaultKey, vault.id);
    } catch (error) {
      await api.enterInspectionSession();
      throw error;
    }
  }
  await purgeInspectionSensitiveState();
  clearInspectionModeFlag();
  window.location.reload();
}

export function applyInspectionDocumentMetadata(): void {
  if (!isInspectionModeActive()) return;
  document.title = INSPECTION_DOCUMENT_TITLE;
  const description = document.querySelector('meta[name="description"]');
  if (description) {
    description.setAttribute('content', 'Σύστημα διαχείρισης παραστατικών');
  }
}

