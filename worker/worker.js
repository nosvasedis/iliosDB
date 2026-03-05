/**
 * Ilios Cloudflare Worker: image handler, silver price, VAT lookup, Orthodox calendar.
 * Frontend expects GET /orthodox-calendar?year=YYYY → { events: CalendarDayEvent[] }
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};

// --- Orthodox calendar (same logic as app utils/orthodoxHoliday.ts) ---
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

function getOrthodoxEaster(year) {
  const a = year % 4;
  const b = year % 7;
  const c = year % 19;
  const d = (19 * c + 15) % 30;
  const e = (2 * a + 4 * b - d + 34) % 7;
  const month = Math.floor((d + e + 114) / 31);
  const day = ((d + e + 114) % 31) + 1;
  const julian = new Date(Date.UTC(year, month - 1, day));
  julian.setUTCDate(julian.getUTCDate() + 13);
  julian.setUTCDate(julian.getUTCDate() + 7);
  return julian;
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

function getOrthodoxCelebrationsForYear(year) {
  return ORTHODOX_RULES.map((rule) => {
    const date = getDateFromRule(rule, year);
    return {
      id: `${rule.id}-${year}`,
      date: localDateKey(date),
      type: 'major_event',
      title: rule.title,
      priority: rule.priority,
    };
  }).sort((a, b) => a.date.localeCompare(b.date) || b.priority - a.priority || a.title.localeCompare(b.title, 'el'));
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
        const events = getOrthodoxCelebrationsForYear(year);
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
