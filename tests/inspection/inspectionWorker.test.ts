import { describe, expect, it, vi } from 'vitest';
import { handleInspectionRoute } from '../../worker/inspection';
import { isInspectionWorkerRouteAllowed, isInspectionRpcAllowed } from '../../lib/inspectionAllowedTables';
const env = { SUPABASE_URL: 'https://db.example', SUPABASE_SERVICE_ROLE_KEY: 'server-only' };
describe('inspection worker projections', () => {
  it('returns weights and only the allowed catalogue fields', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ fetchedAt: '2026-10-13',
      products: [{ sku: 'R1', prefix: 'R', category: 'Ring', weight_g: 2, supplier_cost: 999, stock_qty: 888 }], variants: [],
      recipes: [{ parent_sku: 'R1', type: 'raw', material_id: 'm', quantity: 1 }], materials: [{ id: 'm', name: 'Stone', unit_weight_g: 3 }] })));
    const response = await handleInspectionRoute(new Request('https://worker.example/legal/catalog'), env, {}, fetcher);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    const result = await response.json() as any;
    expect(result.items[0].resolved_invoice_weight.value).toBe(5);
    for (const key of ['recipes','recipe','materials','stock_qty','supplier_cost']) expect(JSON.stringify(result.items)).not.toContain(`"${key}"`);
  });
  it('streams the exact database snapshot without sequential table fetching', async () => {
    const body = JSON.stringify({ version: 1, tables: { legal_documents: Array.from({ length: 1205 }, (_, i) => ({ id: i })) } });
    const fetcher = vi.fn().mockResolvedValue(new Response(body));
    const response = await handleInspectionRoute(new Request('https://worker.example/inspection/snapshot', { method: 'POST', body: JSON.stringify({ environment: 'prod', dateFrom: '', dateTo: '' }) }), env, {}, fetcher);
    expect(await response.text()).toBe(body);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ p_environment: 'prod', p_date_from: null, p_date_to: null });
  });
  it('fails visibly on database errors and rejects unsupported methods', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('internal details', { status: 404 }));
    const response = await handleInspectionRoute(new Request('https://worker.example/legal/catalog'), env, {}, fetcher);
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain('internal details');
    expect((await handleInspectionRoute(new Request('https://worker.example/inspection/snapshot'), env, {}, fetcher)).status).toBe(405);
  });
  it('rejects credential changes, archive rebuilds and deprecated AADE routes', () => {
    for (const path of ['/sbz/configure','/sbz/activate','/sbz/legacy-environment','/sbz/new-unknown-action','/aade/send-invoices','/aade/register-transfer','/aade/configure-registry-credentials']) expect(isInspectionWorkerRouteAllowed(path)).toBe(false);
    expect(isInspectionWorkerRouteAllowed('/sbz/submit')).toBe(true);
    expect(isInspectionWorkerRouteAllowed('/sbz/reconcile')).toBe(true);
    expect(isInspectionRpcAllowed('apply_legal_archive_reindex_batch')).toBe(false);
    expect(isInspectionRpcAllowed('set_inspection_exit_pin')).toBe(false);
  });
});
