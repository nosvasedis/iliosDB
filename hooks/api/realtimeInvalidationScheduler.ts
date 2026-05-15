import type { RealtimeInvalidationDomain } from '../../lib/queryInvalidation';

const DEFAULT_DEBOUNCE_MS = 400;

type InvalidateDomain = (
  domain: RealtimeInvalidationDomain,
  sourceTables?: string[],
) => Promise<void> | void;

export function createRealtimeInvalidationScheduler(
  invalidateDomain: InvalidateDomain,
  delayMs = DEFAULT_DEBOUNCE_MS,
) {
  const timers = new Map<RealtimeInvalidationDomain, ReturnType<typeof setTimeout>>();
  const pendingTables = new Map<RealtimeInvalidationDomain, Set<string>>();
  let disposed = false;

  const schedule = (domain: RealtimeInvalidationDomain, sourceTable?: string) => {
    if (disposed) return;

    if (sourceTable) {
      if (!pendingTables.has(domain)) {
        pendingTables.set(domain, new Set());
      }
      pendingTables.get(domain)!.add(sourceTable);
    }

    if (timers.has(domain)) return;

    const timer = setTimeout(() => {
      timers.delete(domain);
      const tables = pendingTables.get(domain);
      pendingTables.delete(domain);
      void invalidateDomain(domain, tables ? [...tables] : undefined);
    }, delayMs);
    timers.set(domain, timer);
  };

  const dispose = () => {
    disposed = true;
    timers.forEach((timer) => clearTimeout(timer));
    timers.clear();
    pendingTables.clear();
  };

  return { schedule, dispose };
}
