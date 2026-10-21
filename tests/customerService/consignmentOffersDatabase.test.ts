import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { consignmentSaleTotal } from '../../features/customerService/consignmentPricing';

const read = (name: string) => readFileSync(new URL(`../../supabase/migrations/${name}.sql`, import.meta.url), 'utf8');
const core = read('20260811090000_customer_service_core');
const workflow = read('20260811091500_customer_service_workflows');
function definition(source: string, name: string) {
  const start = source.indexOf(`CREATE OR REPLACE FUNCTION ${name}(`);
  if (start < 0) throw new Error(`Missing SQL function ${name}`);
  return source.slice(start, source.indexOf('\n$$;', start) + 4);
}
const actor = '10000000-0000-0000-0000-000000000001';
const customer = '20000000-0000-0000-0000-000000000001';
const parent = '30000000-0000-0000-0000-000000000001';
const line = '40000000-0000-0000-0000-000000000001';
const central = '00000000-0000-0000-0000-000000000001';
const custody = '00000000-0000-0000-0000-000000000003';
let db: PGlite;
const offer = (total: number | null, reason = 'Συμφωνία πελάτη') => db.query('select set_consignment_offer_v1($1,$2,$3)', [parent,total,reason]);
const sale = async (qty: number, key = crypto.randomUUID()) => (await db.query<any>('select settle_consignment_sale_v1($1,$2,50,null,$3) data',[line,qty,key])).rows[0].data;
const remove = (returned = false, key = crypto.randomUUID()) => db.query('select delete_consignment_v1($1,$2,$3,$4)',[parent,'Διόρθωση καταχώρισης',returned,key]);
const totalSales = async () => Number((await db.query<any>("select coalesce(sum(total_amount),0) total from consignment_settlements where status <> 'reversed'")).rows[0].total);

describe('consignment offers and deletion in PostgreSQL', () => {
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE SCHEMA private; CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS 'SELECT nullif(current_setting(''test.actor'',true),'''')::uuid';
      CREATE TABLE profiles(id uuid primary key,role text,is_approved boolean,full_name text);
      CREATE TABLE customers(id uuid primary key,full_name text,vat_rate numeric,vat_number text,address text,phone text,email text);
      CREATE TABLE warehouses(id uuid primary key);
      CREATE TABLE products(sku text primary key);
      CREATE TABLE legal_documents(id uuid primary key,source_kind text,document_kind text,aade_document_type text,status text,counterpart jsonb,payment_method_code int,currency text,vat_rate numeric,totals jsonb,created_by text);
      CREATE TABLE legal_document_lines(document_id uuid,line_number int,sku text,variant_suffix text,description text,quantity int,unit_price numeric,net_value numeric,vat_category int,vat_amount numeric,gross_value numeric,measurement_unit int,item_code text,income_classification jsonb,line_id text);
      CREATE TABLE production_batches(id text primary key,consignment_line_id uuid,updated_at timestamptz);
      CREATE TABLE customer_service_command_results(idempotency_key text primary key,command_type text,result jsonb,actor_user_id uuid,created_at timestamptz);
      CREATE TABLE inventory_balances(product_sku text,variant_suffix text default '',size_info text default '',warehouse_id uuid,on_hand int default 0,reserved int default 0,version int default 0,updated_at timestamptz,primary key(product_sku,variant_suffix,size_info,warehouse_id));
      CREATE TABLE inventory_events(id uuid primary key,sequence_no int,operation_type text,product_sku text,variant_suffix text,size_info text,warehouse_id uuid,on_hand_delta int,reserved_delta int,on_hand_after int,reserved_after int,reference_type text,reference_id text,reference_line_id text,transfer_group_id uuid,actor_user_id uuid,reason text,idempotency_key text,unique(idempotency_key,sequence_no));
      CREATE FUNCTION private.assert_inventory_item_ready(text) RETURNS void LANGUAGE plpgsql AS 'BEGIN RETURN; END';
      CREATE FUNCTION private.sync_legacy_inventory_projection(text) RETURNS void LANGUAGE plpgsql AS 'BEGIN RETURN; END';
    `);
    await db.exec(core.slice(core.indexOf('CREATE TABLE IF NOT EXISTS public.consignments'),core.indexOf('CREATE TABLE IF NOT EXISTS public.repair_intakes')));
    await db.exec(definition(core,'private.assert_customer_service_role'));
    await db.exec(definition(core,'private.block_customer_service_event_changes'));
    await db.exec('CREATE TRIGGER immutable_events BEFORE UPDATE OR DELETE ON consignment_events FOR EACH ROW EXECUTE FUNCTION private.block_customer_service_event_changes()');
    for (const name of ['private.refresh_consignment_status','private.customer_service_move_stock','private.customer_service_issue_stock','private.customer_service_receive_stock','public.reverse_consignment_settlement_v1','public.receive_consignment_return_v1','public.reverse_consignment_return_v1','public.record_consignment_payment_v1','public.override_consignment_line_price_v1','public.create_consignment_legal_draft_v1']) {
      await db.exec(definition(workflow,name));
    }
    await db.exec(read('20261021075409_consignment_offers_and_deletion'));
    await db.exec(`INSERT INTO profiles VALUES('${actor}','admin',true,'Διαχειριστής');
      INSERT INTO customers(id,full_name,vat_rate) VALUES('${customer}','Πελάτης',0.24);
      INSERT INTO warehouses VALUES('${central}'),('${custody}'),('00000000-0000-0000-0000-000000000004');
      INSERT INTO products VALUES('SKU1'),('SKU2');`);
  },60000);
  beforeEach(async () => {
    await db.exec(`RESET ROLE; SELECT set_config('test.actor','${actor}',false);
      TRUNCATE consignments,consignment_lines,consignment_settlements,consignment_payments,consignment_returns,consignment_allocations,consignment_events,inventory_balances,inventory_events,customer_service_command_results,production_batches,legal_documents,legal_document_lines CASCADE;
      UPDATE profiles SET role='admin',is_approved=true;
      INSERT INTO consignments(id,code,customer_id,source_warehouse_id,status,handed_off_at) VALUES('${parent}','ΠΑΡ-1','${customer}','${central}','active',now());
      INSERT INTO consignment_lines(id,consignment_id,product_sku,quantity,locked_unit_price,locked_unit_cost) VALUES('${line}','${parent}','SKU1',3,50,10);
      INSERT INTO inventory_balances(product_sku,warehouse_id,on_hand) VALUES('SKU1','${custody}',3);`);
  });
  afterAll(async () => { await db?.close(); });

  it('allocates exactly €300 across differently priced lines and retains original prices and costs', async () => {
    await db.exec(`INSERT INTO consignment_lines(consignment_id,product_sku,quantity,locked_unit_price) VALUES('${parent}','SKU2',2,125)`);
    await offer(300);
    const lines = (await db.query<any>('select * from consignment_lines order by product_sku')).rows;
    expect(lines.map(l => Number(l.offer_line_total))).toEqual([112.5,187.5]);
    expect(lines.map(l => Number(l.locked_unit_price))).toEqual([50,125]);
    expect(Number(lines[0].locked_unit_cost)).toBe(10);
    expect(lines.reduce((sum,l) => sum + Number(l.offer_line_total),0)).toBe(300);
    await offer(null);
    expect((await db.query<any>('select * from consignment_lines')).rows.every(l => l.offer_line_total === null)).toBe(true);
  });
  it('settles a non-divisible offer exactly, with valid per-cent prices and legal drafts', async () => {
    await offer(100);
    const result = await sale(3,'sale-all');
    expect(result.total_amount).toBe(100);
    expect(result.settlement_ids).toHaveLength(2);
    expect(await totalSales()).toBe(100);
    const settlements = (await db.query<any>('select * from consignment_settlements')).rows;
    expect(settlements.reduce((sum,s) => sum + s.quantity,0)).toBe(3);
    for (const s of settlements) await db.query('select create_consignment_legal_draft_v1($1)',[s.id]);
    const legal = (await db.query<any>('select * from legal_document_lines')).rows;
    expect(legal.every(l => Number(l.unit_price) * l.quantity === Number(l.net_value))).toBe(true);
    expect(legal.reduce((sum,l) => sum + Number(l.net_value),0)).toBe(100);
    await sale(3,'sale-all');
    expect(await totalSales()).toBe(100);
  });
  it('matches preview, partial sales, out-of-order reversal and final cent remainder', async () => {
    await offer(100);
    const first = await sale(1);
    await sale(1);
    await db.query('select reverse_consignment_settlement_v1($1,$2,$3)',[first.settlement_id,'Διόρθωση','reverse-one']);
    const l = (await db.query<any>('select * from consignment_lines')).rows[0];
    const settlements = (await db.query<any>('select * from consignment_settlements')).rows;
    expect(consignmentSaleTotal(l,2,settlements)).toBe(66.66);
    expect((await sale(2)).total_amount).toBe(66.66);
    expect(await totalSales()).toBe(100);
  });
  it('prorates returns without charging returned pieces', async () => {
    await offer(300);
    await db.query('select receive_consignment_return_v1($1,1,null,$2)',[line,'return-one']);
    expect((await sale(2)).total_amount).toBe(200);
    expect(await totalSales()).toBe(200);
  });
  it('agrees an offer for only the pieces remaining after earlier returns', async () => {
    await db.query('select receive_consignment_return_v1($1,1,null,$2)',[line,'earlier-return']);
    await offer(300);
    const l = (await db.query<any>('select * from consignment_lines')).rows[0];
    expect(l.offer_quantity).toBe(2);
    expect(consignmentSaleTotal(l,2)).toBe(300);
    expect((await sale(2)).total_amount).toBe(300);
  });
  it('requires removing an offer before restoring pieces excluded by an earlier return', async () => {
    const result = (await db.query<any>('select receive_consignment_return_v1($1,1,null,$2) data',[line,'earlier-return'])).rows[0].data;
    await offer(300);
    await expect(db.query('select reverse_consignment_return_v1($1,$2,$3)',[result.return_id,'Διόρθωση','reverse-before-offer'])).rejects.toThrow(/προηγήθηκε/);
    expect((await db.query<any>('select pending_quantity from consignment_lines')).rows[0].pending_quantity).toBe(2);
    await offer(null);
    await db.query('select reverse_consignment_return_v1($1,$2,$3)',[result.return_id,'Διόρθωση','reverse-before-offer']);
    expect((await db.query<any>('select pending_quantity from consignment_lines')).rows[0].pending_quantity).toBe(3);
  });
  it('can reverse a later return without changing the original offer', async () => {
    await offer(300);
    const result = (await db.query<any>('select receive_consignment_return_v1($1,1,null,$2) data',[line,'later-return'])).rows[0].data;
    await db.query('select reverse_consignment_return_v1($1,$2,$3)',[result.return_id,'Διόρθωση','reverse-after-offer']);
    expect((await sale(3)).total_amount).toBe(300);
  });
  it('handles zero catalogue prices and a free offer', async () => {
    await db.exec('update consignment_lines set locked_unit_price=0');
    await offer(0);
    await sale(3);
    expect(await totalSales()).toBe(0);
    expect((await db.query<any>('select status from consignment_settlements')).rows[0].status).toBe('paid');
  });
  it.each([-1,1.001,Number.NaN,Number.POSITIVE_INFINITY])('rejects invalid offer %s', async total => {
    await expect(offer(total)).rejects.toThrow();
    expect((await db.query<any>('select offer_total from consignments')).rows[0].offer_total).toBeNull();
  });
  it('requires a reason and locks offers after sales', async () => {
    await expect(offer(300,' ')).rejects.toThrow();
    await offer(300);
    await expect(db.query('select override_consignment_line_price_v1($1,20,$2)',[line,'Αλλαγή'])).rejects.toThrow(/προσφορά/);
    await expect(db.exec('update consignment_lines set quantity=4')).rejects.toThrow(/προσφορά/);
    await sale(1);
    await expect(offer(200)).rejects.toThrow(/πωλήσεις/);
    await expect(offer(null)).rejects.toThrow(/πωλήσεις/);
  });
  it('deletes pending consignments without moving stock and releases production allocations', async () => {
    await db.exec(`update consignments set handed_off_at=null,status='pending_handoff';
      update consignment_lines set order_line_id='original-order-line';
      insert into production_batches values('B1','${line}',now());
      insert into consignment_allocations(consignment_line_id,production_batch_id,quantity) values('${line}','B1',3)`);
    await remove();
    expect((await db.query<any>('select deleted_at from consignments')).rows[0].deleted_at).toBeTruthy();
    expect((await db.query<any>('select consignment_line_id from production_batches')).rows[0].consignment_line_id).toBeNull();
    expect((await db.query('select * from inventory_events')).rows).toHaveLength(0);
    expect((await db.query('select * from consignment_allocations')).rows).toHaveLength(0);
    expect((await db.query<any>('select order_line_id from consignment_lines')).rows[0].order_line_id).toBeNull();
    expect((await db.query<any>("select payload from consignment_events where event_type='deleted'")).rows[0].payload.released_order_links).toEqual([{ line_id: line, order_line_id: 'original-order-line' }]);
  });
  it('requires explicit stock confirmation, restores inventory once and retains audit history', async () => {
    await expect(remove()).rejects.toThrow(/Επιβεβαιώστε/);
    await remove(true,'delete-once');
    await remove(true,'delete-once');
    const balances = (await db.query<any>('select warehouse_id,on_hand from inventory_balances order by warehouse_id')).rows;
    expect(balances.map(b => b.on_hand)).toEqual([3,0]);
    expect((await db.query('select * from inventory_events')).rows).toHaveLength(2);
    expect((await db.query("select * from consignment_events where event_type='deleted'")).rows).toHaveLength(1);
    expect((await db.query<any>('select pending_quantity from consignment_lines')).rows[0].pending_quantity).toBe(0);
  });
  it('blocks deletion with debt or unprocessed returns', async () => {
    await sale(1);
    await expect(remove(true)).rejects.toThrow(/ανεξόφλητες/);
    expect((await db.query<any>('select deleted_at from consignments')).rows[0].deleted_at).toBeNull();
    await db.exec("update consignment_settlements set paid_amount=total_amount,status='paid'");
    await db.query('select receive_consignment_return_v1($1,1,null,$2)',[line,'return-one']);
    await expect(remove(true)).rejects.toThrow(/έλεγχο/);
  });
  it('retains paid sales, payments and linked legal documents when deleting a completed consignment', async () => {
    const result = await sale(3);
    await db.query("select record_consignment_payment_v1($1,150,'Μετρητά',null,'payment')",[result.settlement_id]);
    await db.query('select create_consignment_legal_draft_v1($1)',[result.settlement_id]);
    await remove();
    expect((await db.query('select * from consignment_payments')).rows).toHaveLength(1);
    expect((await db.query('select * from legal_documents')).rows).toHaveLength(1);
    await expect(db.query('select override_consignment_line_price_v1($1,1,$2)',[line,'Αλλαγή'])).rejects.toThrow(/διαγραφεί/);
    await expect(db.exec("update consignments set status='active'")).rejects.toThrow(/διαγραφεί/);
  });
  it('rolls back all stock movements if any line cannot be restored', async () => {
    await db.exec(`insert into consignment_lines(consignment_id,product_sku,quantity,locked_unit_price) values('${parent}','SKU2',2,1)`);
    await expect(remove(true)).rejects.toThrow(/Διαθέσιμα/);
    expect((await db.query('select * from inventory_events')).rows).toHaveLength(0);
    expect((await db.query<any>('select on_hand from inventory_balances')).rows[0].on_hand).toBe(3);
  });
  it('checks role and seller ownership on the server', async () => {
    await db.exec("update profiles set role='seller'");
    await expect(offer(300)).rejects.toThrow(/δικών σας/);
    await db.exec(`update consignments set seller_id='${actor}'`);
    await offer(300);
    await expect(remove(true)).rejects.toThrow(/δικαίωμα/);
    await db.exec("update profiles set is_approved=false");
    await expect(offer(200)).rejects.toThrow(/δικαίωμα/);
    expect((await db.query<any>("select has_function_privilege('anon','public.delete_consignment_v1(uuid,text,boolean,text)','EXECUTE') allowed")).rows[0].allowed).toBe(false);
  });
  it('allows the existing service-role restore path without allowing authenticated callers to unfreeze records', async () => {
    await remove(true);
    await db.exec("select set_config('ilios.sbz_restore','on',false); set role authenticated");
    await expect(db.query('select override_consignment_line_price_v1($1,1,$2)',[line,'Αλλαγή'])).rejects.toThrow(/διαγραφεί/);
    await db.exec('reset role; grant usage on schema public to service_role; grant select,update on consignments to service_role; set role service_role');
    await db.exec("update consignments set deletion_reason='Ανάκτηση από αντίγραφο'");
    await db.exec("reset role; select set_config('ilios.sbz_restore','off',false)");
    expect((await db.query<any>('select deletion_reason from consignments')).rows[0].deletion_reason).toBe('Ανάκτηση από αντίγραφο');
  });
});
