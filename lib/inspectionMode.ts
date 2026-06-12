import type { QueryClient } from '@tanstack/react-query';
import { getRegisteredQueryClient } from './queryClientRegistry';
import { offlineDb } from './offlineDb';
import {
  INSPECTION_ALLOWED_TABLES,
  isInspectionQueryKeyAllowed,
  isInspectionRpcAllowed,
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
  if (typeof sessionStorage === 'undefined') return false;
  return sessionStorage.getItem(INSPECTION_SESSION_KEY) === '1';
}

export function assertInspectionTableAllowed(tableName: string): void {
  if (!isInspectionModeActive()) return;
  if (!INSPECTION_ALLOWED_TABLES.has(tableName)) {
    throw new InspectionAccessError(tableName);
  }
}

export function assertInspectionWorkerRouteAllowed(route: string): void {
  if (!isInspectionModeActive()) return;
  if (!route.startsWith('/aade/')) {
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
  await offlineDb.clearSyncQueue();
  await offlineDb.purgeTablesExcept(INSPECTION_ALLOWED_TABLES);
}

export async function purgeInspectionSensitiveState(queryClient?: QueryClient | null): Promise<void> {
  const client = queryClient ?? getRegisteredQueryClient();
  if (client) {
    const queries = client.getQueryCache().getAll();
    for (const query of queries) {
      if (!isInspectionQueryKeyAllowed(query.queryKey)) {
        client.removeQueries({ queryKey: query.queryKey, exact: true });
      }
    }
  }

  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(INSPECTION_PERSIST_CACHE_KEY);
  }

  await purgeOfflineInspectionStores();
}

export function clearInspectionModeFlag(): void {
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.removeItem(INSPECTION_SESSION_KEY);
  }
}

export async function enterInspectionMode(): Promise<void> {
  await purgeInspectionSensitiveState();
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.setItem(INSPECTION_SESSION_KEY, '1');
  }
  window.location.reload();
}

export async function exitInspectionMode(): Promise<void> {
  clearInspectionModeFlag();
  await purgeInspectionSensitiveState();
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

let consoleSilenced = false;

export function silenceInspectionConsole(): void {
  if (!isInspectionModeActive() || consoleSilenced) return;
  consoleSilenced = true;
  const noop = () => undefined;
  console.log = noop;
  console.debug = noop;
  console.info = noop;
}
