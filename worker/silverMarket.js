import { SILVER_HISTORY_PATH, SILVER_QUOTE_PATH } from '../lib/silverMarketContract.ts';

const TROY_OUNCE_GRAMS = 31.1034768;
const DAY_MS = 86_400_000;
const RANGES = {
  '24h': { providerRange: '24h', days: 1, interval: '15m' },
  '7d': { providerRange: '7d', days: 7, interval: '1h' },
  '30d': { providerRange: '1m', days: 30, interval: '4h' },
  '90d': { providerRange: '3m', days: 90, interval: '1d' },
};

const positiveNumber = (value) => Number.isFinite(value) && value > 0;
const utcDate = (time) => new Date(time).toISOString().slice(0, 10);

async function getJson(url) {
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error(`Upstream HTTP ${response.status}`);
  return response.json();
}

async function getQuote(now) {
  const quote = await getJson('https://api.gold-api.com/price/XAG/EUR');
  const time = Date.parse(quote?.updatedAt);
  const priceEurPerGram = quote?.price / TROY_OUNCE_GRAMS;
  if (quote?.symbol !== 'XAG' || quote.currency !== 'EUR' || !positiveNumber(quote.price)
    || !positiveNumber(priceEurPerGram) || !Number.isFinite(time) || time > now + 60_000) {
    throw new Error('Invalid XAG/EUR quote');
  }
  return { quotedAt: new Date(time).toISOString(), priceEurPerGram };
}

async function getHistory(range, now) {
  const { providerRange, days, interval } = RANGES[range];
  const from = now - days * DAY_MS;
  const chartStart = interval === '1d' ? Date.parse(utcDate(from)) : from;
  const fxParams = new URLSearchParams({
    base: 'EUR', quotes: 'USD', from: utcDate(from - 7 * DAY_MS), to: utcDate(now),
  });
  const [history, rates] = await Promise.all([
    getJson(`https://standardbullion.com/api/v1/market/history?metal=XAG&range=${providerRange}`),
    getJson(`https://api.frankfurter.dev/v2/providers/ecb/rates?${fxParams}`),
  ]);
  const expectedGrain = interval === '1d' ? 'daily' : 'tick';
  if (history?.metal !== 'XAG' || history.unit !== 'USD per troy ounce'
    || history.range !== providerRange || history.grain !== expectedGrain || !Array.isArray(history.points) || !Array.isArray(rates)) {
    throw new Error('Invalid XAG history or ECB rates');
  }

  // ECB rates are USD per EUR. Carry the latest available daily rate through non-publication days.
  const fxByDate = new Map(rates
    .filter((row) => row?.base === 'EUR' && row.quote === 'USD' && /^\d{4}-\d{2}-\d{2}$/.test(row.date) && positiveNumber(row.rate))
    .map((row) => [row.date, row.rate]));
  const pointsByTime = new Map();
  for (const point of history.points) {
    const time = Date.parse(point?.t);
    if (!Number.isFinite(time) || time < chartStart || time > now || !positiveNumber(point.price)) continue;
    for (let daysBack = 0; daysBack <= 7; daysBack += 1) {
      const rate = fxByDate.get(utcDate(time - daysBack * DAY_MS));
      if (rate === undefined) continue;
      const priceEurPerGram = point.price / rate / TROY_OUNCE_GRAMS;
      if (positiveNumber(priceEurPerGram)) pointsByTime.set(time, { quotedAt: new Date(time).toISOString(), priceEurPerGram });
      break;
    }
  }

  const points = [...pointsByTime.keys()].sort((a, b) => a - b).map((time) => pointsByTime.get(time));
  if (history.points.length && !points.length) throw new Error('No usable XAG history and ECB rates');
  return { range, interval, points };
}

async function readCache(key) {
  try {
    const response = await globalThis.caches?.default?.match(key);
    return response ? await response.json() : undefined;
  } catch {
    return undefined;
  }
}

export async function handleSilverMarket(request, url, ctx, corsHeaders) {
  const headers = { ...corsHeaders, 'Cache-Control': 'private, no-store' };
  if (request.method !== 'GET') {
    return Response.json({ error: 'Method Not Allowed' }, { status: 405, headers: { ...headers, Allow: 'GET, OPTIONS' } });
  }

  const isHistory = url.pathname === SILVER_HISTORY_PATH;
  const range = url.searchParams.get('range');
  if (isHistory && !Object.hasOwn(RANGES, range)) {
    return Response.json({ error: 'Invalid silver history range' }, { status: 400, headers });
  }

  const now = Date.now();
  const cacheKey = new Request(new URL(isHistory ? `${SILVER_HISTORY_PATH}?range=${range}` : SILVER_QUOTE_PATH, url.origin));
  const cached = await readCache(cacheKey);
  const freshFor = isHistory ? 300_000 : 30_000;
  if (cached && now - cached.fetchedAt < freshFor) {
    return Response.json({ ...cached.data, stale: false }, { headers });
  }

  try {
    const data = isHistory ? await getHistory(range, now) : await getQuote(now);
    if (!isHistory && cached && Date.parse(data.quotedAt) < Date.parse(cached.data.quotedAt)) {
      return Response.json({ ...cached.data, stale: true }, { headers });
    }

    const cache = globalThis.caches?.default;
    if (cache && ctx) {
      ctx.waitUntil(cache.put(cacheKey, Response.json({ data, fetchedAt: now }, {
        headers: { 'Cache-Control': 'max-age=86400' },
      })).catch(() => {}));
    }
    return Response.json({ ...data, stale: false }, { headers });
  } catch (error) {
    console.warn('Silver market provider unavailable', { route: url.pathname, range: isHistory ? range : undefined, error: error?.message });
    return cached
      ? Response.json({ ...cached.data, stale: true }, { headers })
      : Response.json({ error: 'Silver market data is temporarily unavailable' }, { status: 502, headers });
  }
}
