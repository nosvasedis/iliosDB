/** Optional application restarts are owned here, never by network/SW events. */
export interface RestartBlocker { label: string; dirty?: boolean; busy?: boolean }
export interface UpdateSnapshot {
  availableBuildId: string | null;
  reason: string | null;
  downloadFailed: boolean;
  expanded: boolean;
  restarting: boolean;
  error: string | null;
  blockers: RestartBlocker[];
}
export interface UpdateDependencies {
  buildId: string;
  fetch: typeof fetch;
  online: () => boolean;
  now: () => number;
  navigate: () => void;
}

export function createUpdateCoordinator(deps: UpdateDependencies) {
  const listeners = new Set<() => void>();
  const blockers = new Map<object, RestartBlocker>();
  let snapshot: UpdateSnapshot = {
    availableBuildId: null, reason: null, downloadFailed: false, expanded: true,
    restarting: false, error: null, blockers: [],
  };
  let lastCheck = -Infinity;
  let checking: Promise<boolean> | null = null;
  let navigating = false;
  const publish = (patch: Partial<UpdateSnapshot>) => {
    snapshot = { ...snapshot, ...patch };
    listeners.forEach(listener => listener());
  };
  async function fetchVersion(): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await deps.fetch(`/version.json?check=${deps.now()}`, {
        cache: 'no-store', signal: controller.signal, headers: { 'Cache-Control': 'no-cache' },
      });
      if (!response.ok) throw new Error('Version check failed');
      const data = await response.json();
      if (!data || typeof data.buildId !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(data.buildId)) {
        throw new Error('Invalid version response');
      }
      return data.buildId;
    } finally { clearTimeout(timeout); }
  }
  async function check(force = false): Promise<boolean> {
    if (checking) return checking;
    if (!deps.online() || (!force && deps.now() - lastCheck < 60000)) return false;
    lastCheck = deps.now();
    checking = (async () => {
      try {
        const buildId = await fetchVersion();
        if (buildId !== deps.buildId) {
          publish({ availableBuildId: buildId, expanded: buildId !== snapshot.availableBuildId || snapshot.expanded });
        } else if (snapshot.availableBuildId) publish({ availableBuildId: null });
        return true;
      } catch { return false; }
      finally { checking = null; }
    })();
    return checking;
  }
  const setBlocker = (id: object, blocker?: RestartBlocker) => {
    const previous = blockers.get(id);
    if (!blocker?.dirty && !blocker?.busy) {
      if (!blockers.delete(id)) return;
    } else {
      if (previous?.dirty === blocker.dirty && previous?.busy === blocker.busy && previous?.label === blocker.label) return;
      blockers.set(id, blocker);
    }
    publish({ blockers: [...blockers.values()] });
  };
  return {
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    getSnapshot: () => snapshot,
    check,
    setBlocker,
    requestRestart(reason = 'Οι αλλαγές θα εφαρμοστούν μετά την επανεκκίνηση.') {
      publish({ reason, expanded: true, error: null });
    },
    reportDownloadFailure() {
      publish({ downloadFailed: true });
      void check();
    },
    expand() { publish({ expanded: true }); },
    defer() { publish({ expanded: false }); },
    shouldWarnBeforeUnload: () => !navigating && blockers.size > 0,
    async restart() {
      if (snapshot.restarting || navigating || blockers.size) return false;
      if (!deps.online()) {
        publish({ error: 'Συνδεθείτε στο διαδίκτυο πριν από την επανεκκίνηση.', expanded: true });
        return false;
      }
      publish({ restarting: true, error: null });
      try {
        await fetchVersion();
        // A save can have started between the click and the network response.
        if (blockers.size) throw new Error('Ολοκληρώστε την αποθήκευση πριν από την επανεκκίνηση.');
        navigating = true;
        deps.navigate();
        return true;
      } catch {
        navigating = false;
        publish({ restarting: false, error: 'Δεν έγινε επανεκκίνηση. Ελέγξτε τη σύνδεση και δοκιμάστε ξανά.', expanded: true });
        return false;
      }
    },
    beginOperation(label = 'Αποθήκευση σε εξέλιξη') {
      if (snapshot.restarting) throw new Error('Περιμένετε να ολοκληρωθεί η επανεκκίνηση.');
      const id = {};
      setBlocker(id, { label, busy: true });
      return () => setBlocker(id);
    },
  };
}

declare const __ILIOS_BUILD_ID__: string;
export const APP_BUILD_ID = typeof __ILIOS_BUILD_ID__ === 'string' ? __ILIOS_BUILD_ID__ : 'dev';
export const appUpdates = createUpdateCoordinator({
  buildId: APP_BUILD_ID,
  fetch: (input, init) => fetch(input, init),
  online: () => typeof navigator === 'undefined' || navigator.onLine,
  now: () => Date.now(),
  navigate: () => {
    const url = new URL(window.location.href);
    url.searchParams.set('__app_restart', Date.now().toString());
    window.location.replace(url.toString());
  },
});

export function requestAppRestart(reason?: string) { appUpdates.requestRestart(reason); }

/** Wrap direct API writes too; React Query is not the only mutation path. */
export async function protectOperation<T>(operation: () => Promise<T>, label?: string): Promise<T> {
  const finish = appUpdates.beginOperation(label);
  try { return await operation(); } finally { finish(); }
}

export function withProtectedWrites<T extends object>(methods: T): T {
  const wrappers = new Map<PropertyKey, Function>();
  return new Proxy(methods, {
    get(target, key, receiver) {
      const value = Reflect.get(target, key, receiver);
      if (typeof value !== 'function' || /^(get|fetch|list|search|find|check|has|preview|calculate|read|is(?=[A-Z]))/.test(String(key))) return value;
      if (!wrappers.has(key)) wrappers.set(key, (...args: unknown[]) => protectOperation(() => value.apply(target, args)));
      return wrappers.get(key);
    },
    set(target, key, value) {
      wrappers.delete(key);
      return Reflect.set(target, key, value);
    },
  });
}

export function startUpdateRuntime(production: boolean): () => void {
  const unload = (event: BeforeUnloadEvent) => {
    if (!appUpdates.shouldWarnBeforeUnload()) return;
    event.preventDefault();
    event.returnValue = '';
  };
  window.addEventListener('beforeunload', unload);
  if (!production) return () => window.removeEventListener('beforeunload', unload);
  const check = () => { if (document.visibilityState !== 'hidden') void appUpdates.check(); };
  const register = () => {
    if ('serviceWorker' in navigator) {
      void navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' })
        .catch(error => console.warn('SW registration failed', error));
    }
    check();
  };
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
  window.addEventListener('focus', check);
  window.addEventListener('online', check);
  document.addEventListener('visibilitychange', check);
  const interval = window.setInterval(check, 5 * 60 * 1000);
  return () => {
    window.removeEventListener('beforeunload', unload);
    window.removeEventListener('load', register);
    window.removeEventListener('focus', check);
    window.removeEventListener('online', check);
    document.removeEventListener('visibilitychange', check);
    clearInterval(interval);
  };
}
