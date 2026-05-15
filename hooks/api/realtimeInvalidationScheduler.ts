import type { RealtimeInvalidationDomain } from '../../lib/queryInvalidation';

const DEFAULT_DEBOUNCE_MS = 400;

type InvalidateDomain = (domain: RealtimeInvalidationDomain) => Promise<void> | void;

export function createRealtimeInvalidationScheduler(
  invalidateDomain: InvalidateDomain,
  delayMs = DEFAULT_DEBOUNCE_MS,
) {
  const timers = new Map<RealtimeInvalidationDomain, ReturnType<typeof setTimeout>>();
  let disposed = false;

  const schedule = (domain: RealtimeInvalidationDomain) => {
    if (disposed || timers.has(domain)) return;

    const timer = setTimeout(() => {
      timers.delete(domain);
      void invalidateDomain(domain);
    }, delayMs);
    timers.set(domain, timer);
  };

  const dispose = () => {
    disposed = true;
    timers.forEach((timer) => clearTimeout(timer));
    timers.clear();
  };

  return { schedule, dispose };
}
