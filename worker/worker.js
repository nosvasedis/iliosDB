/**
 * Ilios Cloudflare Worker: image handler, silver price, VAT lookup, Orthodox calendar.
 * GET /orthodox-calendar?year=YYYY → { events: CalendarDayEvent[] }
 * Events are fetched from online sources (greek-namedays) + computed major holidays; no hardcoded nameday list.
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};

// External data: Greek Orthodox namedays (fixed + moving) from GitHub. Cache 24h.
const FIXED_NAMEDAYS_URL = 'https://raw.githubusercontent.com/stavros-melidoniotis/greek-namedays/master/fixed_namedays.json';
const MOVING_NAMEDAYS_URL = 'https://raw.githubusercontent.com/stavros-melidoniotis/greek-namedays/master/moving_namedays.json';
const GITHUB_FETCH_OPTS = { cf: { cacheTtl: 86400 } }; // 24h

// Major Orthodox holidays (computed from Easter / fixed dates; no API for these)
const ORTHODOX_RULES = [
  { id: 'new-year', title: 'Πρωτοχρονιά', month: 1, day: 1, priority: 100 },
  { id: 'theophany', title: 'Θεοφάνεια', month: 1, day: 6, priority: 90 },
  { id: 'clean-monday', title: 'Καθαρά Δευτέρα', easterOffsetDays: -48, priority: 95 },
  { id: 'annunciation', title: 'Ευαγγελισμός της Θεοτόκου', month: 3, day: 25, priority: 100 },
  { id: 'palm-sunday', title: 'Κυριακή των Βαΐων', easterOffsetDays: -7, priority: 80 },
  { id: 'holy-monday', title: 'Μεγάλη Δευτέρα', easterOffsetDays: -6, priority: 70 },
  { id: 'holy-tuesday', title: 'Μεγάλη Τρίτη', easterOffsetDays: -5, priority: 70 },
  { id: 'holy-wednesday', title: 'Μεγάλη Τετάρτη', easterOffsetDays: -4, priority: 70 },
  { id: 'holy-thursday', title: 'Μεγάλη Πέμπτη', easterOffsetDays: -3, priority: 85 },
  { id: 'good-friday', title: 'Μεγάλη Παρασκευή', easterOffsetDays: -2, priority: 100 },
  { id: 'holy-saturday', title: 'Μεγάλο Σάββατο', easterOffsetDays: -1, priority: 95 },
  { id: 'easter', title: 'Κυριακή του Πάσχα', easterOffsetDays: 0, priority: 110 },
  { id: 'easter-monday', title: 'Δευτέρα του Πάσχα', easterOffsetDays: 1, priority: 95 },
  { id: 'thomas-sunday', title: 'Κυριακή του Θωμά', easterOffsetDays: 7, priority: 75 },
  { id: 'ascension', title: 'Ανάληψη', easterOffsetDays: 39, priority: 85 },
  { id: 'pentecost', title: 'Πεντηκοστή', easterOffsetDays: 49, priority: 95 },
  { id: 'holy-spirit', title: 'Αγίου Πνεύματος', easterOffsetDays: 50, priority: 90 },
  { id: 'transfiguration', title: 'Μεταμόρφωση του Σωτήρος', month: 8, day: 6, priority: 90 },
  { id: 'assumption', title: 'Κοίμηση της Θεοτόκου', month: 8, day: 15, priority: 100 },
  { id: 'elevation-cross', title: 'Ύψωση του Τιμίου Σταυρού', month: 9, day: 14, priority: 95 },
  { id: 'demetrios', title: 'Αγίου Δημητρίου', month: 10, day: 26, priority: 90 },
  { id: 'introduction-theotokos', title: 'Εισόδια της Θεοτόκου', month: 11, day: 21, priority: 85 },
  { id: 'christmas-eve', title: 'Παραμονή Χριστουγέννων', month: 12, day: 24, priority: 85 },
  { id: 'christmas', title: 'Χριστούγεννα', month: 12, day: 25, priority: 110 },
  { id: 'synaxis-theotokos', title: 'Σύναξη Υπεραγίας Θεοτόκου', month: 12, day: 26, priority: 80 },
  { id: 'new-years-eve', title: 'Παραμονή Πρωτοχρονιάς', month: 12, day: 31, priority: 80 },
];

/**
 * Orthodox Easter: Julian calendar algorithm then Gregorian correction.
 * See e.g. https://dateofeaster.org/julian.php — 2026 → April 12.
 */
function getOrthodoxEaster(year) {
  const remainder = (year + Math.floor(year / 4) + 4) % 7;
  const L = remainder === 0 ? 7 : 7 - remainder;
  const G = (year % 19) + 1;
  const E = (11 * G - 11) % 30;
  const D = E > 16 ? 66 - E : 36 - E;
  const pfmMarch = D < 32;
  const pfmDay = pfmMarch ? D : D - 31;
  const pfmMonth = pfmMarch ? 3 : 4;
  const dow = ((D + 3 - L) % 7) + 1;
  const daysToSunday = dow === 1 ? 7 : 8 - dow;
  const easterJulianDay = pfmDay + daysToSunday;
  let month, day;
  if (pfmMarch) {
    if (easterJulianDay <= 31) {
      month = 3;
      day = easterJulianDay;
    } else {
      month = 4;
      day = easterJulianDay - 31;
    }
  } else {
    if (easterJulianDay <= 30) {
      month = 4;
      day = easterJulianDay;
    } else {
      month = 5;
      day = easterJulianDay - 30;
    }
  }
  const C = Math.floor(year / 100);
  const Q = Math.floor(((C - 15) * 3) / 4) + 10;
  const gregorian = new Date(Date.UTC(year, month - 1, day));
  gregorian.setUTCDate(gregorian.getUTCDate() + Q);
  return gregorian;
}

function localDateKey(d) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getDateFromRule(rule, year) {
  if (typeof rule.easterOffsetDays === 'number') {
    const easter = getOrthodoxEaster(year);
    easter.setUTCDate(easter.getUTCDate() + rule.easterOffsetDays);
    return new Date(easter);
  }
  return new Date(Date.UTC(year, (rule.month || 1) - 1, rule.day || 1, 9, 0, 0));
}

function getMajorEventsForYear(year) {
  return ORTHODOX_RULES.map((rule) => {
    const date = getDateFromRule(rule, year);
    return {
      id: `${rule.id}-${year}`,
      date: localDateKey(date),
      type: 'major_event',
      title: rule.title,
      priority: rule.priority,
    };
  });
}

/** Parse "X ημέρες πριν το Πάσχα" / "X ημέρες μετά το Πάσχα" / "ημέρα του Πάσχα" → offset number or null */
function parseEasterOffsetFromCelebration(celebration) {
  if (!celebration || typeof celebration !== 'string') return null;
  const text = celebration.trim();
  // "την ημέρα του Πάσχα" → 0
  if (/ημέρα\s+του\s+Πάσχα/i.test(text) && !/πριν|μετά/.test(text)) return 0;
  // "43 ημέρες πριν το Πάσχα" or "1 ημέρα πριν"
  const before = text.match(/(\d+)\s*ημέρες?\s*πριν\s*το\s*Πάσχα/i);
  if (before) return -parseInt(before[1], 10);
  // "7 ημέρες μετά το Πάσχα" or "1 ημέρα μετά"
  const after = text.match(/(\d+)\s*ημέρες?\s*μετά\s*το\s*Πάσχα/i);
  if (after) return parseInt(after[1], 10);
  return null;
}

/** Build full Orthodox calendar for year: major events + fixed namedays + moving namedays from online JSON */
async function getOrthodoxCalendarEventsForYear(year) {
  const events = [...getMajorEventsForYear(year)];

  try {
    const [fixedRes, movingRes] = await Promise.all([
      fetch(FIXED_NAMEDAYS_URL, GITHUB_FETCH_OPTS),
      fetch(MOVING_NAMEDAYS_URL, GITHUB_FETCH_OPTS),
    ]);

    // Fixed namedays: keys "day/month" (e.g. "7/1" = 7 Jan) → { names: string[] }
    if (fixedRes.ok) {
      const fixed = await fixedRes.json();
      if (fixed && typeof fixed === 'object') {
        for (const key of Object.keys(fixed)) {
          const match = key.match(/^(\d{1,2})\/(\d{1,2})$/);
          if (!match) continue;
          const day = match[1].padStart(2, '0');
          const month = match[2].padStart(2, '0');
          const names = fixed[key]?.names;
          if (!Array.isArray(names) || names.length === 0) continue;
          const dateStr = `${year}-${month}-${day}`;
          const namesStr = names.slice(0, 10).join(', ') + (names.length > 10 ? '…' : '');
          events.push({
            id: `nameday-${dateStr}`,
            date: dateStr,
            type: 'nameday',
            title: namesStr,
            subtitle: 'Ονομαστικές Εορτές',
            priority: 60,
          });
        }
      }
    }

    // Moving namedays: { namedays: [ { names, celebration } ] } → compute date from Easter + parsed offset
    if (movingRes.ok) {
      const moving = await movingRes.json();
      const list = moving?.namedays;
      if (Array.isArray(list)) {
        const easter = getOrthodoxEaster(year);
        list.forEach((item, idx) => {
          const offset = parseEasterOffsetFromCelebration(item.celebration);
          if (offset === null) return;
          const names = item.names;
          if (!Array.isArray(names) || names.length === 0) return;
          const d = new Date(easter);
          d.setUTCDate(d.getUTCDate() + offset);
          const dateStr = localDateKey(d);
          const namesStr = names.slice(0, 10).join(', ') + (names.length > 10 ? '…' : '');
          events.push({
            id: `nameday-mov-${dateStr}-${idx}`,
            date: dateStr,
            type: 'nameday',
            title: namesStr,
            subtitle: 'Ονομαστικές Εορτές',
            priority: 60,
          });
        });
      }
    }
  } catch (e) {
    console.warn('Orthodox namedays fetch failed, using major events only:', e.message);
  }

  events.sort((a, b) => a.date.localeCompare(b.date) || b.priority - a.priority || (a.title || '').localeCompare(b.title || '', 'el'));
  return events;
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    try {
      if (!env.R2_BUCKET) {
        throw new Error('Server Configuration Error: R2_BUCKET binding is missing.');
      }

      const authHeader = request.headers.get('Authorization');
      const url = new URL(request.url);

      const isSilverRoute = url.pathname === '/price/silver';
      const isMutation = ['POST', 'DELETE', 'PUT'].includes(request.method);
      const isProtected = isMutation || isSilverRoute;

      if (isProtected && (!authHeader || authHeader !== env.AUTH_KEY_SECRET)) {
        return new Response('Unauthorized', { status: 403, headers: CORS_HEADERS });
      }

      // --- SPECIAL ROUTE: ORTHODOX CALENDAR (public GET) ---
      if (url.pathname === '/orthodox-calendar' && request.method === 'GET') {
        const yearParam = url.searchParams.get('year');
        const year = Math.min(2100, Math.max(2000, parseInt(yearParam, 10) || new Date().getFullYear()));
        const events = await getOrthodoxCalendarEventsForYear(year);
        return new Response(JSON.stringify({ events }), {
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          cf: { cacheTtl: 43200 }, // 12h cache
        });
      }

      // --- SPECIAL ROUTE: SILVER PRICE ---
      if (isSilverRoute) {
        try {
          try {
            const response = await fetch('https://data-asg.goldprice.org/dbXRates/EUR', {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                'Referer': 'https://goldprice.org/',
                'Accept': 'application/json'
              },
              cf: { cacheTtl: 300 }
            });

            if (response.ok) {
              const data = await response.json();
              if (data.items && data.items[0] && data.items[0].xagPrice) {
                const silverOunceEur = data.items[0].xagPrice;
                const silverGramEur = silverOunceEur / 31.1034768;
                return new Response(JSON.stringify({ price: silverGramEur, source: 'goldprice.org' }), {
                  headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
                });
              }
            }
          } catch (e1) {
            console.error('GoldPrice.org failed:', e1.message);
          }

          const [priceRes, rateRes] = await Promise.all([
            fetch('https://api.gold-api.com/price/XAG'),
            fetch('https://open.er-api.com/v6/latest/USD')
          ]);

          if (priceRes.ok && rateRes.ok) {
            const priceData = await priceRes.json();
            const rateData = await rateRes.json();

            const silverOunceUsd = priceData.price;
            const usdEurRate = rateData.rates.EUR;

            if (silverOunceUsd && usdEurRate) {
              const silverOunceEur = silverOunceUsd * usdEurRate;
              const silverGramEur = silverOunceEur / 31.1034768;

              return new Response(JSON.stringify({ price: silverGramEur, source: 'gold-api+er-api' }), {
                headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
              });
            }
          }

          throw new Error('All silver price sources failed');
        } catch (e) {
          return new Response(JSON.stringify({ error: e.message }), { status: 502, headers: CORS_HEADERS });
        }
      }

      // --- SPECIAL ROUTE: VAT / AFM LOOKUP (CORS Proxy) ---
      if (url.pathname === '/vat-lookup') {
        const afm = url.searchParams.get('afm');
        if (!afm || !/^\d{9}$/.test(afm)) {
          return new Response(JSON.stringify({ error: 'Invalid AFM: must be exactly 9 digits' }), {
            status: 400,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          });
        }

        const cleanField = (val) => (val && val.trim() && val.trim() !== '---' ? val.trim() : null);

        try {
          const viesRes = await fetch('https://ec.europa.eu/taxation_customs/vies/rest-api/check-vat-number', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ countryCode: 'EL', vatNumber: afm }),
          });
          if (viesRes.ok) {
            const d = await viesRes.json();
            if (d.valid && d.name) {
              return new Response(JSON.stringify({
                source: 'VIES',
                name: cleanField(d.name),
                address: cleanField(d.address),
                phone: null,
                email: null,
              }), { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
            }
          }
        } catch (e) {
          console.warn('VIES lookup failed:', e.message);
        }

        try {
          const vatRes = await fetch(`https://api.vatcomply.com/vat?vat_number=EL${afm}`, {
            headers: { 'Accept': 'application/json' },
          });
          if (vatRes.ok) {
            const d = await vatRes.json();
            if (d.valid && d.name) {
              return new Response(JSON.stringify({
                source: 'VATComply',
                name: cleanField(d.name),
                address: cleanField(d.address),
                phone: cleanField(d.phone),
                email: cleanField(d.email),
              }), { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
            }
          }
        } catch (e) {
          console.warn('VATComply lookup failed:', e.message);
        }

        return new Response(JSON.stringify({ error: 'Δεν βρέθηκαν στοιχεία για το ΑΦΜ αυτό.' }), {
          status: 404,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      }

      // --- Default: file path (root check) ---
      if (url.pathname === '/' || url.pathname === '') {
        return new Response('Ilios Image Handler Active', { status: 200, headers: CORS_HEADERS });
      }

      const key = decodeURIComponent(url.pathname.slice(1));

      if (!key || key.trim() === '') {
        return new Response('Missing filename', { status: 400, headers: CORS_HEADERS });
      }

      if (request.method === 'GET' || request.method === 'HEAD') {
        const object = await env.R2_BUCKET.get(key);

        if (object === null) {
          return new Response('Object Not Found', { status: 404, headers: CORS_HEADERS });
        }

        const headers = new Headers(CORS_HEADERS);
        object.writeHttpMetadata(headers);
        headers.set('etag', object.httpEtag);

        if (!headers.has('Content-Type')) {
          headers.set('Content-Type', 'image/jpeg');
        }

        const body = request.method === 'HEAD' ? null : object.body;

        return new Response(body, {
          headers,
        });
      }

      if (request.method === 'POST') {
        await env.R2_BUCKET.put(key, request.body, {
          httpMetadata: {
            contentType: request.headers.get('Content-Type') || 'image/jpeg',
            cacheControl: 'public, max-age=31536000',
          },
        });
        return new Response('Upload Successful', { status: 200, headers: CORS_HEADERS });
      }

      if (request.method === 'DELETE') {
        try {
          await env.R2_BUCKET.delete(key);
          return new Response('File deleted successfully', { status: 200, headers: CORS_HEADERS });
        } catch (err) {
          console.error('Delete error:', err);
          return new Response('Delete failed: ' + err.message, { status: 500, headers: CORS_HEADERS });
        }
      }

      return new Response('Method Not Allowed', { status: 405, headers: CORS_HEADERS });

    } catch (err) {
      return new Response(`Worker Error: ${err.message}`, { status: 500, headers: CORS_HEADERS });
    }
  },
};
