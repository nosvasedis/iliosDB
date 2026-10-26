import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

function worker() {
  const handlers = new Map<string, Function>();
  const stores = new Map<string, Map<string, Response>>();
  const key = (request: Request | string) => typeof request === 'string' ? request : request.url;
  const open = vi.fn(async (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const store = stores.get(name)!;
    return { match: async (request: Request | string) => store.get(key(request))?.clone(), put: async (request: Request | string, response: Response) => { store.set(key(request), response); }, addAll: vi.fn(), keys: async () => [], delete: vi.fn() };
  });
  const caches = { open, delete: vi.fn(), keys: async () => [...stores.keys()], match: vi.fn(async (request: Request | string) => {
    for (const store of stores.values()) if (store.has(key(request))) return store.get(key(request))!.clone();
  }) };
  const fetch = vi.fn().mockResolvedValue(new Response('not found', { status: 404 }));
  const self = { location: new URL('https://ilios.test/sw.js'), skipWaiting: vi.fn(), clients: { claim: vi.fn() }, addEventListener: (event: string, fn: Function) => handlers.set(event, fn) };
  runInNewContext(readFileSync('public/sw.js', 'utf8'), { self, caches, fetch, URL, Request, Response, Headers });
  async function dispatch(request: Request | { method: string; mode: string; url: string }) {
    let result!: Promise<Response>; const work: Promise<unknown>[] = [];
    handlers.get('fetch')!({ request, respondWith: (promise: Promise<Response>) => { result = promise; }, waitUntil: (promise: Promise<unknown>) => work.push(promise) });
    const response = await result; await Promise.all(work); return response;
  }
  return { handlers, stores, self, caches, fetch, dispatch };
}
describe('service worker live-build compatibility', () => {
  it('never forces activation, claims live clients, or deletes caches during installation', async () => {
    const w = worker(); const promises: Promise<unknown>[] = [];
    w.handlers.get('install')!({ waitUntil: (p: Promise<unknown>) => promises.push(p) });
    w.handlers.get('activate')?.({ waitUntil: (p: Promise<unknown>) => promises.push(p) });
    await Promise.all(promises);
    expect(w.self.skipWaiting).not.toHaveBeenCalled(); expect(w.self.clients.claim).not.toHaveBeenCalled(); expect(w.caches.delete).not.toHaveBeenCalled();
  });
  it('keeps an old build usable from its cache after the server removes its chunk', async () => {
    const w = worker(); const url = 'https://ilios.test/assets/old-screen-123.js';
    w.stores.set('ilios-runtime-legacy-build', new Map([[url, new Response('export default 42', { headers: { 'Content-Type': 'text/javascript' } })]]));
    const response = await w.dispatch(new Request(url));
    expect(response.status).toBe(200); expect(await response.text()).toBe('export default 42');
    expect(w.stores.has('ilios-runtime-legacy-build')).toBe(true); expect(w.caches.delete).not.toHaveBeenCalled();
  });
  it('does not serve or store HTML as an application module', async () => {
    const w = worker(); w.fetch.mockResolvedValue(new Response('<html>oops</html>', { headers: { 'Content-Type': 'text/html' } }));
    const response = await w.dispatch(new Request('https://ilios.test/assets/missing.js'));
    expect(response.status).toBe(503); expect(w.stores.size).toBe(0);
  });
  it('bypasses every cache for version checks', async () => {
    const w = worker(); w.fetch.mockResolvedValue(new Response('{"buildId":"new"}'));
    await w.dispatch(new Request('https://ilios.test/version.json?check=1'));
    expect(w.caches.match).not.toHaveBeenCalled(); expect(w.fetch.mock.calls[0][0].cache).toBe('no-store');
  });
  it('preserves the last valid application shell when navigation receives a server error', async () => {
    const w = worker();
    w.stores.set('ilios-runtime-safe-v1', new Map([['/index.html', new Response('last valid app')]]));
    // Node's Request constructor cannot construct mode:navigate; the worker
    // only reads these standard fields before cloning the request for fetch.
    const request = new Request('https://ilios.test/');
    Object.defineProperty(request, 'mode', { value: 'navigate' });
    const response = await w.dispatch(request);
    expect(await response.text()).toBe('last valid app');
  });
});
