import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../../worker/worker.js';

const env = { SUPABASE_URL: 'https://db.example', SUPABASE_SERVICE_ROLE_KEY: 'service' };
const quotePath = '/market/silver/quote';
const historyPath = '/market/silver/history';
const ounce = 31.1034768;
const now = Date.parse('2026-11-22T11:00:00Z');

function fetchStub(options: { approved?: boolean; locked?: boolean; upstream?: (url: URL) => Response } = {}) {
  const fetchMock = vi.fn(async (input: string) => {
    const url = new URL(input);
    if (url.pathname === '/auth/v1/user') return Response.json({ id: 'user-1' });
    if (url.pathname === '/rest/v1/profiles') return Response.json([{ role: 'admin', is_approved: options.approved ?? true }]);
    if (url.pathname === '/rest/v1/rpc/inspection_session_state') return Response.json(options.locked ?? false);
    if (options.upstream) return options.upstream(url);
    throw new Error(`Unexpected URL ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const request = (path: string, method = 'GET', authorized = true) => worker.fetch(
  new Request(`https://worker.example${path}`, { method, headers: authorized ? { Authorization: 'Bearer user-token' } : {} }),
  env,
  { waitUntil: vi.fn() },
);

beforeEach(() => vi.spyOn(Date, 'now').mockReturnValue(now));
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('read-only silver market Worker', () => {
  it('requires an approved, unlocked session before requesting market data', async () => {
    const noSession = fetchStub();
    expect((await request(quotePath, 'GET', false)).status).toBe(401);
    expect(noSession).not.toHaveBeenCalled();
    const unapproved = fetchStub({ approved: false });
    expect((await request(quotePath)).status).toBe(403);
    expect(unapproved).toHaveBeenCalledTimes(2);
    const locked = fetchStub({ locked: true });
    expect((await request(`${historyPath}?range=7d`)).status).toBe(403);
    expect(locked).toHaveBeenCalledTimes(3);
  });

  it('validates requests before they reach the providers', async () => {
    const fetchMock = fetchStub();
    expect((await request(quotePath, 'POST')).status).toBe(405);
    expect((await request(`${historyPath}?range=__proto__`)).status).toBe(400);
    expect(fetchMock.mock.calls.every(([url]) => new URL(url).host === 'db.example')).toBe(true);
  });

  it('normalizes an EUR quote and serves its timestamp during a provider outage', async () => {
    const cached = new Map<string, Response>();
    vi.stubGlobal('caches', { default: {
      match: async (key: Request) => cached.get(key.url)?.clone(),
      put: async (key: Request, response: Response) => { cached.set(key.url, response); },
    } });
    fetchStub({ upstream: (url) => {
      expect(url.href).toBe('https://api.gold-api.com/price/XAG/EUR');
      return Response.json({ symbol: 'XAG', currency: 'EUR', price: 1.17 * ounce, updatedAt: '2026-11-22T10:59:31Z' });
    } });
    const first = await request(quotePath);
    expect(first.headers.get('Cache-Control')).toBe('private, no-store');
    const quote = await first.json();
    expect(quote).toEqual({ quotedAt: '2026-11-22T10:59:31.000Z', priceEurPerGram: 1.17, stale: false });

    const failed = fetchStub({ upstream: () => new Response(null, { status: 503 }) });
    expect(await (await request(quotePath)).json()).toEqual(quote);
    expect(failed).toHaveBeenCalledTimes(3);
    vi.mocked(Date.now).mockReturnValue(now + 30_000);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const stale = await request(quotePath);
    expect(stale.status).toBe(200);
    expect(await stale.json()).toEqual({ ...quote, stale: true });
    expect(failed).toHaveBeenCalledTimes(7);
    expect(warn).toHaveBeenCalledOnce();
  });

  it.each([
    ['24h', '24h', 'tick', '15m'], ['7d', '7d', 'tick', '1h'],
    ['30d', '1m', 'tick', '4h'], ['90d', '3m', 'daily', '1d'],
  ])('normalizes %s history using the date-specific ECB rates', async (range, providerRange, grain, interval) => {
    const sunday = range === '90d' ? '2026-11-22T00:00:00Z' : '2026-11-22T10:00:00Z';
    const saturday = range === '90d' ? '2026-11-21T00:00:00Z' : '2026-11-21T11:30:00Z';
    fetchStub({ upstream: (url) => {
      if (url.host === 'api.frankfurter.dev') {
        expect(url.pathname).toBe('/v2/providers/ecb/rates');
        expect(url.searchParams.get('base')).toBe('EUR');
        expect(url.searchParams.get('quotes')).toBe('USD');
        return Response.json([{ date: '2026-11-20', base: 'EUR', quote: 'USD', rate: 1.1 }]);
      }
      expect(url.searchParams.get('metal')).toBe('XAG');
      expect(url.searchParams.get('range')).toBe(providerRange);
      return Response.json({ metal: 'XAG', unit: 'USD per troy ounce', range: providerRange, grain, points: [
        { t: sunday, price: 30 }, { t: '2026-11-22T16:30:00Z', price: 34 },
        { t: '2026-08-01T00:00:00Z', price: 42 }, { t: saturday, price: 30 },
        { t: sunday, price: 32 }, { t: 'invalid', price: 52 }, { t: '2026-11-22T09:30:00Z', price: -1 },
      ] });
    } });
    const response = await request(`${historyPath}?range=${range}`);
    expect(response.status).toBe(200);
    const history = await response.json();
    expect(history).toMatchObject({ range, interval, stale: false });
    expect(history.points).toEqual([
      { quotedAt: new Date(saturday).toISOString(), priceEurPerGram: 30 / 1.1 / ounce },
      { quotedAt: new Date(sunday).toISOString(), priceEurPerGram: 32 / 1.1 / ounce },
    ]);
  });

  it.each([['6m', 180], ['1y', 365]] as const)('includes the full %s window and uses historical FX at both ends', async (range, days) => {
    const dateAt = (daysAgo: number) => new Date(now - daysAgo * 86_400_000).toISOString().slice(0, 10);
    const first = dateAt(days);
    const tooEarly = dateAt(days + 1);
    const last = dateAt(0);
    fetchStub({ upstream: (url) => {
      if (url.host === 'api.frankfurter.dev') {
        expect(url.searchParams.get('from')).toBe(dateAt(days + 7));
        expect(url.searchParams.get('to')).toBe(last);
        return Response.json([
          { date: tooEarly, base: 'EUR', quote: 'USD', rate: 1.15 },
          { date: first, base: 'EUR', quote: 'USD', rate: 1.25 },
          { date: last, base: 'EUR', quote: 'USD', rate: 1.10 },
        ]);
      }
      expect(url.searchParams.get('range')).toBe(range);
      return Response.json({ metal: 'XAG', unit: 'USD per troy ounce', range, grain: 'daily', points: [
        { t: `${tooEarly}T00:00:00Z`, price: 32 }, { t: `${first}T00:00:00Z`, price: 32 }, { t: `${last}T00:00:00Z`, price: 32 },
      ] });
    } });
    const response = await request(`${historyPath}?range=${range}`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ range, interval: '1d', stale: false, points: [
      { quotedAt: `${first}T00:00:00.000Z`, priceEurPerGram: 32 / 1.25 / ounce },
      { quotedAt: `${last}T00:00:00.000Z`, priceEurPerGram: 32 / 1.10 / ounce },
    ] });
  });
});
