/**
 * Ilios Cloudflare Worker: image handler, silver price, VAT lookup, Orthodox calendar.
 * GET /orthodox-calendar?year=YYYY → { events: CalendarDayEvent[] }
 * Events are fetched from online sources (greek-namedays) + computed major holidays; no hardcoded nameday list.
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};

// External data: Greek Orthodox namedays (fixed + moving) from GitHub. Cache 24h.
const FIXED_NAMEDAYS_URL = 'https://raw.githubusercontent.com/stavros-melidoniotis/greek-namedays/master/fixed_namedays.json';
const MOVING_NAMEDAYS_URL = 'https://raw.githubusercontent.com/stavros-melidoniotis/greek-namedays/master/moving_namedays.json';
const GITHUB_FETCH_OPTS = { cf: { cacheTtl: 86400 } }; // 24h

const AADE_BASE_URLS = {
  dev: 'https://mydataapidev.aade.gr',
  prod: 'https://mydatapi.aade.gr/myDATA',
};

function jsonResponse(data, status, corsHeaders = CORS_HEADERS) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function xmlEscape(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function findXmlValue(xml, tag) {
  const match = String(xml || '').match(new RegExp(`<(?:\\w+:)?${tag}>([\\s\\S]*?)</(?:\\w+:)?${tag}>`, 'i'));
  return match?.[1]?.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').trim();
}

function parseAadeResponseXml(xml) {
  const text = String(xml || '');
  const errorMatches = Array.from(text.matchAll(/<(?:\w+:)?message>([\s\S]*?)<\/(?:\w+:)?message>/gi));
  return {
    statusCode: findXmlValue(text, 'statusCode'),
    invoiceUid: findXmlValue(text, 'invoiceUid'),
    invoiceMark: findXmlValue(text, 'invoiceMark'),
    classificationMark: findXmlValue(text, 'classificationMark'),
    cancellationMark: findXmlValue(text, 'cancellationMark'),
    authenticationCode: findXmlValue(text, 'authenticationCode'),
    qrUrl: findXmlValue(text, 'qrUrl'),
    errors: errorMatches.map((m) => m[1].trim()).filter(Boolean),
  };
}

function getAadeCredentials(env, environment) {
  const suffix = environment === 'prod' ? '_PROD' : '_DEV';
  return {
    userId: env[`AADE_USER_ID${suffix}`] || env.AADE_USER_ID,
    subscriptionKey: env[`AADE_SUBSCRIPTION_KEY${suffix}`] || env.AADE_SUBSCRIPTION_KEY,
  };
}

const AADE_SECRET_NAMES = {
  dev: { userId: 'AADE_USER_ID_DEV', subscriptionKey: 'AADE_SUBSCRIPTION_KEY_DEV' },
  prod: { userId: 'AADE_USER_ID_PROD', subscriptionKey: 'AADE_SUBSCRIPTION_KEY_PROD' },
};

function getCloudflareSecretManager(env) {
  const apiToken = env.CLOUDFLARE_API_TOKEN;
  const accountId = env.CLOUDFLARE_ACCOUNT_ID;
  const scriptName = env.CLOUDFLARE_SCRIPT_NAME || 'ilios-image-handler';
  const missing = [];
  if (!apiToken) missing.push('CLOUDFLARE_API_TOKEN');
  if (!accountId) missing.push('CLOUDFLARE_ACCOUNT_ID');
  return { apiToken, accountId, scriptName, missing };
}

function getCredentialPresence(env, environment) {
  const credentials = getAadeCredentials(env, environment);
  const userId = !!String(credentials.userId || '').trim();
  const subscriptionKey = !!String(credentials.subscriptionKey || '').trim();
  return { userId, subscriptionKey, ready: userId && subscriptionKey };
}

function getAadeCredentialStatus(env, optimisticEnvironment) {
  const manager = getCloudflareSecretManager(env);
  const status = {
    dev: getCredentialPresence(env, 'dev'),
    prod: getCredentialPresence(env, 'prod'),
    workerCanStoreSecrets: manager.missing.length === 0,
    missingWorkerSecretManager: manager.missing,
    checkedAt: new Date().toISOString(),
  };
  if (optimisticEnvironment === 'dev' || optimisticEnvironment === 'prod') {
    status[optimisticEnvironment] = { userId: true, subscriptionKey: true, ready: true };
  }
  return status;
}

async function putWorkerSecret(env, name, text) {
  const manager = getCloudflareSecretManager(env);
  if (manager.missing.length > 0) {
    throw new Error(`Missing Cloudflare secret manager configuration: ${manager.missing.join(', ')}`);
  }

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(manager.accountId)}/workers/scripts/${encodeURIComponent(manager.scriptName)}/secrets`,
    {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${manager.apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name, text, type: 'secret_text' }),
    },
  );
  const body = await response.json().catch(async () => ({ success: false, errors: [{ message: await response.text() }] }));
  if (!response.ok || body.success === false) {
    const message = body?.errors?.map((error) => error.message).filter(Boolean).join('; ') || `Cloudflare secret update failed (${response.status})`;
    throw new Error(message);
  }
  return body;
}

function buildEndpoint(environment, method, query) {
  const base = AADE_BASE_URLS[environment] || AADE_BASE_URLS.dev;
  const endpoint = new URL(`${base}/${method}`);
  if (query) {
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') endpoint.searchParams.set(key, String(value));
    });
  }
  return endpoint;
}

function buildDeliveryXml(rootName, payload) {
  const mark = payload.mark || payload.invoiceMark || '';
  const outcome = payload.failed ? 'FAILED' : 'DELIVERED';
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<${rootName}>`,
    `<invoiceMark>${xmlEscape(mark)}</invoiceMark>`,
    payload.outcome ? `<outcome>${xmlEscape(payload.outcome)}</outcome>` : '',
    rootName === 'ConfirmDeliveryOutcomeRequest' ? `<deliveryOutcome>${outcome}</deliveryOutcome>` : '',
    payload.groupId ? `<groupId>${xmlEscape(payload.groupId)}</groupId>` : '',
    `</${rootName}>`,
  ].join('');
}

function buildMockAadeResult(method) {
  const now = Date.now();
  const mark = String(now).slice(-12);
  const uid = `MOCK-${mark}`;
  if (method === 'CancelInvoice') {
    return `<?xml version="1.0" encoding="UTF-8"?><ResponseDoc><response><index>1</index><cancellationMark>${mark}</cancellationMark><statusCode>Success</statusCode></response></ResponseDoc>`;
  }
  if (method === 'GetDeliveryNoteStatus') {
    return `<?xml version="1.0" encoding="UTF-8"?><ResponseDoc><response><index>1</index><invoiceMark>${mark}</invoiceMark><statusCode>Success</statusCode><message>Delivery note status is available.</message></response></ResponseDoc>`;
  }
  return `<?xml version="1.0" encoding="UTF-8"?><ResponseDoc><response><index>1</index><invoiceUid>${uid}</invoiceUid><invoiceMark>${mark}</invoiceMark><authenticationCode>AUTH-${mark}</authenticationCode><qrUrl>https://www1.aade.gr/timologio/qr/${uid}</qrUrl><statusCode>Success</statusCode></response></ResponseDoc>`;
}

async function postAadeXml(env, environment, method, xml, query) {
  const credentials = getAadeCredentials(env, environment);
  const endpoint = buildEndpoint(environment, method, query);

  if (env.AADE_MOCK_MODE === 'true') {
    const responseText = buildMockAadeResult(method);
    return {
      ok: true,
      status: 200,
      endpoint: endpoint.toString(),
      responseText,
      parsed: parseAadeResponseXml(responseText),
    };
  }

  if (!credentials.userId || !credentials.subscriptionKey) {
    const responseText = '<ResponseDoc><response><statusCode>WorkerConfigError</statusCode><errors><error><message>AADE credentials are not configured on the Cloudflare Worker.</message></error></errors></response></ResponseDoc>';
    return {
      ok: false,
      status: 500,
      endpoint: endpoint.toString(),
      responseText,
      parsed: parseAadeResponseXml(responseText),
    };
  }

  const response = await fetch(endpoint.toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Accept': 'application/xml',
      'aade-user-id': credentials.userId,
      'Ocp-Apim-Subscription-Key': credentials.subscriptionKey,
    },
    body: xml || '',
  });
  const responseText = await response.text();
  return {
    ok: response.ok,
    status: response.status,
    endpoint: endpoint.toString(),
    responseText,
    parsed: parseAadeResponseXml(responseText),
  };
}

async function handleAadeRoute(request, env, corsHeaders, url) {
  if (url.pathname === '/aade/credential-status') {
    if (!['GET', 'POST'].includes(request.method)) {
      return jsonResponse({ error: 'Credential status requires GET or POST.' }, 405, corsHeaders);
    }
    return jsonResponse({ ok: true, status: getAadeCredentialStatus(env) }, 200, corsHeaders);
  }

  if (url.pathname === '/aade/configure-credentials') {
    if (request.method !== 'POST') {
      return jsonResponse({ error: 'Credential configuration requires POST.' }, 405, corsHeaders);
    }
    const payload = await request.json().catch(() => ({}));
    const environment = payload.environment === 'prod' ? 'prod' : 'dev';
    const userId = String(payload.userId || '').trim();
    const subscriptionKey = String(payload.subscriptionKey || '').trim();
    if (!userId || !subscriptionKey) {
      return jsonResponse({ error: 'AADE user ID and subscription key are required.' }, 400, corsHeaders);
    }

    try {
      const secretNames = AADE_SECRET_NAMES[environment];
      await putWorkerSecret(env, secretNames.userId, userId);
      await putWorkerSecret(env, secretNames.subscriptionKey, subscriptionKey);
      return jsonResponse({ ok: true, status: getAadeCredentialStatus(env, environment) }, 200, corsHeaders);
    } catch (error) {
      return jsonResponse({ error: error?.message || 'AADE credential configuration failed.' }, 500, corsHeaders);
    }
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'AADE proxy routes require POST.' }, 405, corsHeaders);
  }

  const payload = await request.json().catch(() => ({}));
  const environment = payload.environment === 'prod' ? 'prod' : 'dev';
  const routeMap = {
    '/aade/send-invoices': { method: 'SendInvoices', xml: payload.xml },
    '/aade/cancel-invoice': { method: 'CancelInvoice', xml: '', query: { mark: payload.mark } },
    '/aade/send-payments-method': { method: 'SendPaymentsMethod', xml: payload.xml },
    '/aade/request-transmitted-docs': { method: 'RequestTransmittedDocs', xml: payload.xml || '', query: payload.query },
    '/aade/register-transfer': { method: 'RegisterTransfer', xml: payload.xml || buildDeliveryXml('RegisterTransferRequest', payload) },
    '/aade/confirm-delivery-outcome': { method: 'ConfirmDeliveryOutcome', xml: payload.xml || buildDeliveryXml('ConfirmDeliveryOutcomeRequest', payload) },
    '/aade/get-delivery-note-status': { method: 'GetDeliveryNoteStatus', xml: payload.xml || buildDeliveryXml('GetDeliveryNoteStatusRequest', payload) },
    '/aade/generate-group-qrcode': { method: 'GenerateGroupQRCode', xml: payload.xml || buildDeliveryXml('GenerateGroupQRCodeRequest', payload) },
  };

  const route = routeMap[url.pathname];
  if (!route) return jsonResponse({ error: 'Unknown AADE proxy route.' }, 404, corsHeaders);

  try {
    const result = await postAadeXml(env, environment, route.method, route.xml, route.query);
    return jsonResponse(result, result.ok ? 200 : 502, corsHeaders);
  } catch (error) {
    return jsonResponse({
      ok: false,
      status: 500,
      endpoint: route.method,
      responseText: '',
      parsed: { statusCode: 'WorkerException', errors: [error?.message || 'AADE proxy failed.'] },
    }, 500, corsHeaders);
  }
}

async function handleAdminRoute(request, env, corsHeaders, url) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ error: 'Missing Supabase admin configuration on worker.' }, 500, corsHeaders);
  }

  const supabaseAdmin = async (path, options = {}) => {
    const response = await fetch(`${env.SUPABASE_URL}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        ...(options.headers || {}),
      },
    });
    const text = await response.text();
    let data;
    try { data = JSON.parse(text); } catch { data = text; }
    return { ok: response.ok, status: response.status, data };
  };

  if (url.pathname === '/admin/create-seller' && request.method === 'POST') {
    const body = await request.json();
    const { email, password, full_name, commission_percent } = body;
    if (!email || !password || !full_name) {
      return jsonResponse({ error: 'Απαιτούνται email, password και full_name.' }, 400, corsHeaders);
    }

    const authRes = await supabaseAdmin('/auth/v1/admin/users', {
      method: 'POST',
      body: JSON.stringify({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name },
      }),
    });
    if (!authRes.ok) {
      const msg = authRes.data?.msg || authRes.data?.message || JSON.stringify(authRes.data);
      return jsonResponse({ error: `Σφάλμα δημιουργίας χρήστη: ${msg}` }, authRes.status, corsHeaders);
    }

    const userId = authRes.data.id;
    const profileRes = await supabaseAdmin('/rest/v1/profiles', {
      method: 'POST',
      headers: { 'Prefer': 'resolution=merge-duplicates' },
      body: JSON.stringify({
        id: userId,
        email,
        full_name,
        role: 'seller',
        is_approved: true,
        commission_percent: commission_percent ?? null,
      }),
    });
    if (!profileRes.ok) {
      return jsonResponse({ error: 'Ο χρήστης δημιουργήθηκε αλλά το προφίλ απέτυχε.', details: profileRes.data }, 500, corsHeaders);
    }
    return jsonResponse({ id: userId, email, full_name, commission_percent: commission_percent ?? null }, 201, corsHeaders);
  }

  if (url.pathname === '/admin/update-seller' && request.method === 'POST') {
    const body = await request.json();
    const { id, full_name, commission_percent, is_approved, new_password } = body;
    if (!id) return jsonResponse({ error: 'Απαιτείται id.' }, 400, corsHeaders);

    const profilePayload = {};
    if (full_name !== undefined) profilePayload.full_name = full_name;
    if (commission_percent !== undefined) profilePayload.commission_percent = commission_percent;
    if (is_approved !== undefined) profilePayload.is_approved = is_approved;

    if (Object.keys(profilePayload).length > 0) {
      const profileRes = await supabaseAdmin(`/rest/v1/profiles?id=eq.${id}`, {
        method: 'PATCH',
        headers: { 'Prefer': 'return=minimal' },
        body: JSON.stringify(profilePayload),
      });
      if (!profileRes.ok) {
        return jsonResponse({ error: 'Σφάλμα ενημέρωσης προφίλ.', details: profileRes.data }, 500, corsHeaders);
      }
    }

    if (new_password) {
      const passwordRes = await supabaseAdmin(`/auth/v1/admin/users/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ password: new_password }),
      });
      if (!passwordRes.ok) {
        return jsonResponse({ error: 'Το προφίλ ενημερώθηκε αλλά η αλλαγή κωδικού απέτυχε.', details: passwordRes.data }, 500, corsHeaders);
      }
    }

    return jsonResponse({ success: true }, 200, corsHeaders);
  }

  if (url.pathname === '/admin/delete-seller' && request.method === 'POST') {
    const body = await request.json();
    const { id } = body;
    if (!id) return jsonResponse({ error: 'Απαιτείται id.' }, 400, corsHeaders);

    const profileRes = await supabaseAdmin(`/rest/v1/profiles?id=eq.${id}`, {
      method: 'PATCH',
      headers: { 'Prefer': 'return=minimal' },
      body: JSON.stringify({ is_approved: false }),
    });
    if (!profileRes.ok) {
      return jsonResponse({ error: 'Σφάλμα απενεργοποίησης πλασιέ.', details: profileRes.data }, 500, corsHeaders);
    }

    return jsonResponse({ success: true }, 200, corsHeaders);
  }

  return jsonResponse({ error: 'Unknown admin route' }, 404, corsHeaders);
}

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
      const authHeader = request.headers.get('Authorization');
      const url = new URL(request.url);

      if (!env.R2_BUCKET && !url.pathname.startsWith('/aade/')) {
        throw new Error('Server Configuration Error: R2_BUCKET binding is missing.');
      }

      const isSilverRoute = url.pathname === '/price/silver';
      const isAdminRoute = url.pathname.startsWith('/admin/');
      const isAadeRoute = url.pathname.startsWith('/aade/');
      const isMutation = ['POST', 'DELETE', 'PUT', 'PATCH'].includes(request.method);
      const isProtected = isMutation || isSilverRoute || isAdminRoute || isAadeRoute;

      if (isProtected && (!authHeader || authHeader !== env.AUTH_KEY_SECRET)) {
        return new Response('Unauthorized', { status: 403, headers: CORS_HEADERS });
      }

      if (url.pathname.startsWith('/aade/')) {
        return handleAadeRoute(request, env, CORS_HEADERS, url);
      }

      if (isAdminRoute) {
        return handleAdminRoute(request, env, CORS_HEADERS, url);
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
