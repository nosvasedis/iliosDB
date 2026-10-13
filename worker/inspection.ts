import { boundedText } from './sbz';
import { buildLegalCatalog } from '../features/inspection/catalog';

type InspectionEnv = { SUPABASE_URL: string; SUPABASE_SERVICE_ROLE_KEY: string };

/** Called only after verifyAdminAccess in the main router. No service key reaches the client. */
export async function handleInspectionRoute(request: Request, env: InspectionEnv, cors: Record<string, string>, fetchFn: typeof fetch = fetch) {
  const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
    status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
  const path = new URL(request.url).pathname;
  if (!['/legal/catalog', '/inspection/snapshot', '/inspection/support','/inspection/customer'].includes(path)) return json({ error: 'Η διαδρομή δεν υποστηρίζεται.' }, 404);
  const post = ['/inspection/snapshot','/inspection/customer'].includes(path);
  if (request.method !== (post ? 'POST' : 'GET')) {
    return json({ error: 'Μη επιτρεπόμενη ενέργεια.' }, 405);
  }
  try {
    const payload = !post ? {} : JSON.parse(await boundedText(new Response(request.body), path === '/inspection/customer' ? 16384 : 4096));
    const rpc = path === '/legal/catalog' ? 'get_legal_catalog_context' : path === '/inspection/support' ? 'get_inspection_support' : path === '/inspection/customer' ? 'save_inspection_customer' : 'get_inspection_snapshot';
    const response = await fetchFn(`${env.SUPABASE_URL}/rest/v1/rpc/${rpc}`, {
      method: 'POST', headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(path === '/inspection/customer' ? { p_customer: payload } : path !== '/inspection/snapshot' ? {} : {
        p_environment: payload.environment, p_date_from: payload.dateFrom || null, p_date_to: payload.dateTo || null,
      }), signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) {
      // Do not expose database internals; absence of the migration must fail visibly.
      console.error(JSON.stringify({ event: 'inspection_rpc_failed', rpc, status: response.status }));
      return json({ error: 'Η ανάκτηση δεν ολοκληρώθηκε. Ελέγξτε τη σύνδεση και την εγκατάσταση του migration ελέγχου.' }, 502);
    }
    if (path !== '/legal/catalog') {
      // Stream the single MVCC snapshot. There is no client pagination/truncation.
      return new Response(response.body, { headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
    }
    const context = JSON.parse(await boundedText(response, 12 * 1024 * 1024));
    return json({ version: 1, fetchedAt: context.fetchedAt, items: buildLegalCatalog(context) });
  } catch (error) {
    console.error(JSON.stringify({ event: 'inspection_request_failed', path, message: error instanceof Error ? error.message : 'unknown' }));
    return json({ error: 'Η ανάκτηση απέτυχε. Δεν έχει επιβεβαιωθεί η πληρότητα των δεδομένων.' }, 502);
  }
}
