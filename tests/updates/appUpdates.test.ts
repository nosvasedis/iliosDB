import { afterEach, describe, expect, it, vi } from 'vitest';
import { createUpdateCoordinator, startUpdateRuntime, withProtectedWrites, appUpdates } from '../../lib/appUpdates';

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
function setup() {
  const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ buildId: 'build-B' }) });
  const navigate = vi.fn();
  const online = vi.fn(() => true);
  const now = vi.fn(() => 100000);
  return { fetch, navigate, online, now, updates: createUpdateCoordinator({ buildId: 'build-A', fetch, navigate, online, now }) };
}
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('user-controlled application updates', () => {
  it('detects a new deployment without navigating, even after repeated checks', async () => {
    const { updates, navigate, fetch } = setup();
    await updates.check();
    await updates.check(true);
    expect(updates.getSnapshot().availableBuildId).toBe('build-B');
    expect(navigate).not.toHaveBeenCalled();
    expect(fetch.mock.calls[0][1].cache).toBe('no-store');
  });
  it.each([null, {}, { buildId: 42 }, { buildId: '<html>' }])('ignores invalid version metadata %j', async data => {
    const { updates, fetch, navigate } = setup();
    fetch.mockResolvedValue({ ok: true, json: async () => data });
    expect(await updates.check()).toBe(false);
    expect(updates.getSnapshot().availableBuildId).toBeNull();
    expect(navigate).not.toHaveBeenCalled();
  });
  it('does not label an offline screen download as an update', async () => {
    const { updates, online } = setup();
    online.mockReturnValue(false);
    updates.reportDownloadFailure();
    expect(updates.getSnapshot().downloadFailed).toBe(true);
    expect(updates.getSnapshot().availableBuildId).toBeNull();
  });
  it('throttles checks and shares simultaneous requests', async () => {
    const { updates, fetch, now } = setup();
    const response = deferred<any>(); fetch.mockReturnValue(response.promise);
    const first = updates.check(); const second = updates.check();
    response.resolve({ ok: true, json: async () => ({ buildId: 'build-B' }) });
    await Promise.all([first, second]);
    await updates.check(); expect(fetch).toHaveBeenCalledTimes(1);
    now.mockReturnValue(160001); await updates.check(); expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('keeps Later collapsed for the same build and reopens for a newer deployment', async () => {
    const { updates, fetch } = setup();
    await updates.check(); updates.defer(); await updates.check(true);
    expect(updates.getSnapshot().expanded).toBe(false);
    fetch.mockResolvedValue({ ok: true, json: async () => ({ buildId: 'build-C' }) });
    await updates.check(true); expect(updates.getSnapshot().expanded).toBe(true);
  });
  it.each([{ dirty: true }, { busy: true }])('refuses restart with %j and never resumes it automatically', async blocker => {
    const { updates, navigate } = setup(); const id = {};
    updates.setBlocker(id, { label: 'Παραγγελία', ...blocker });
    expect(await updates.restart()).toBe(false);
    updates.setBlocker(id);
    expect(navigate).not.toHaveBeenCalled();
    expect(updates.shouldWarnBeforeUnload()).toBe(false);
  });
  it('does not remove another nested editor blocker', () => {
    const { updates } = setup(); const main = {}; const nested = {};
    updates.setBlocker(main, { label: 'Παραγγελία', dirty: true });
    updates.setBlocker(nested, { label: 'Πελάτης', dirty: true });
    updates.setBlocker(nested);
    expect(updates.getSnapshot().blockers).toEqual([{ label: 'Παραγγελία', dirty: true }]);
    expect(updates.shouldWarnBeforeUnload()).toBe(true);
  });
  it('performs one navigation after explicit restart and prevents new writes during preflight', async () => {
    const { updates, fetch, navigate } = setup(); const response = deferred<any>();
    fetch.mockReturnValue(response.promise);
    const first = updates.restart();
    expect(updates.getSnapshot().restarting).toBe(true);
    expect(() => updates.beginOperation()).toThrow();
    expect(await updates.restart()).toBe(false);
    response.resolve({ ok: true, json: async () => ({ buildId: 'build-B' }) });
    expect(await first).toBe(true); expect(navigate).toHaveBeenCalledTimes(1);
  });
  it('rechecks blockers after the network preflight', async () => {
    const { updates, fetch, navigate } = setup(); const response = deferred<any>();
    fetch.mockReturnValue(response.promise);
    const restarting = updates.restart();
    updates.setBlocker({}, { label: 'Νέα εργασία', dirty: true });
    response.resolve({ ok: true, json: async () => ({ buildId: 'build-B' }) });
    expect(await restarting).toBe(false);
    expect(navigate).not.toHaveBeenCalled(); expect(updates.getSnapshot().restarting).toBe(false);
  });
  it('unlocks the workspace after a failed preflight and leaves update state available', async () => {
    const { updates, fetch, navigate } = setup(); await updates.check();
    fetch.mockRejectedValue(new Error('offline'));
    expect(await updates.restart()).toBe(false);
    expect(updates.getSnapshot()).toMatchObject({ restarting: false, availableBuildId: 'build-B' });
    expect(updates.getSnapshot().error).toBeTruthy(); expect(navigate).not.toHaveBeenCalled();
  });
  it('does not start restart preparation while offline', async () => {
    const { updates, online, fetch } = setup(); online.mockReturnValue(false);
    expect(await updates.restart()).toBe(false); expect(fetch).not.toHaveBeenCalled();
  });
  it('tracks direct writes, including issue/resolve operations, without blocking on ordinary reads', async () => {
    const operation = deferred<void>();
    const repository = withProtectedWrites({ getRows: async () => [], issueDocument: () => operation.promise, resolveIssue: async () => { throw Error('save failed'); } });
    await repository.getRows(); expect(appUpdates.getSnapshot().blockers).toHaveLength(0);
    const writing = repository.issueDocument(); expect(appUpdates.getSnapshot().blockers.some(item => item.busy)).toBe(true);
    operation.resolve(); await writing;
    await expect(repository.resolveIssue()).rejects.toThrow('save failed');
    expect(appUpdates.getSnapshot().blockers).toHaveLength(0);
  });
  it('registers a worker without reacting to install/controller events with navigation', async () => {
    const win = Object.assign(new EventTarget(), { location: { replace: vi.fn(), reload: vi.fn() }, setInterval, clearInterval });
    const doc = Object.assign(new EventTarget(), { readyState: 'complete', visibilityState: 'visible' });
    const worker = Object.assign(new EventTarget(), { register: vi.fn().mockResolvedValue({ waiting: {} }) });
    vi.stubGlobal('window', win); vi.stubGlobal('document', doc);
    vi.stubGlobal('navigator', { onLine: true, serviceWorker: worker });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const stop = startUpdateRuntime(true);
    worker.dispatchEvent(new Event('controllerchange')); worker.dispatchEvent(new Event('updatefound'));
    win.dispatchEvent(new Event('online')); win.dispatchEvent(new Event('focus'));
    await Promise.resolve(); stop();
    expect(worker.register).toHaveBeenCalledWith('/sw.js', { updateViaCache: 'none' });
    expect(win.location.replace).not.toHaveBeenCalled(); expect(win.location.reload).not.toHaveBeenCalled();
  });
});
