import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';

let db: PGlite;
describe('inspection snapshot database contracts', () => {
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`
      CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
      CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('test.uid',true),'')::uuid $$;
      CREATE TABLE profiles(id uuid primary key,role text,is_approved boolean,full_name text);
      INSERT INTO profiles VALUES('30000000-0000-4000-8000-000000000001','admin',true,'Admin');
      CREATE FUNCTION public.is_legal_module_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER AS $$
        SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role='admin' AND is_approved) $$;
      CREATE TABLE legal_settings(id uuid primary key,inspection_exit_pin_hash text);
      INSERT INTO legal_settings VALUES('00000000-0000-0000-0000-000000000091','DO-NOT-EXPOSE');
      CREATE TABLE legal_documents(id uuid primary key,environment text,issue_date date);
      CREATE TABLE legal_document_lines(id uuid primary key,document_id uuid);
      CREATE TABLE products(sku text primary key,prefix text,category text,description text,image_url text,gender text,plating_type text,
        production_type text,is_component boolean,skip_casting boolean,weight_g numeric,secondary_weight_g numeric,
        invoice_total_weight_g numeric,active_price numeric,selling_price numeric,selling_price_manual_override boolean,legal_only boolean,supplier_cost numeric);
      CREATE TABLE product_variants(product_sku text,suffix text,description text,active_price numeric,selling_price numeric,selling_price_manual_override boolean);
      CREATE TABLE recipes(id uuid,parent_sku text,type text,material_id text,component_sku text,quantity numeric);
      CREATE TABLE materials(id text,name text,unit_weight_g numeric);
      CREATE TABLE customers(id uuid PRIMARY KEY,full_name text,vat_number text,address text,phone text,email text,profession text,tax_office text,customer_code text,vat_rate numeric,vat_exemption_category integer,vat_exemption_legal_note text,created_at timestamptz,internal_cost numeric DEFAULT 777);
      CREATE TABLE orders(id text,customer_id uuid,customer_name text,status text,created_at timestamptz,is_archived boolean,vat_rate numeric,discount_percent numeric,total_price numeric,items jsonb);
      CREATE TABLE order_shipments(id uuid); CREATE TABLE order_shipment_items(id uuid);
      GRANT USAGE ON SCHEMA public,auth TO authenticated,service_role,anon;
      GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated,service_role;
      GRANT INSERT,UPDATE ON customers TO service_role;
      INSERT INTO legal_documents SELECT md5(n::text)::uuid,'prod','2026-01-01' FROM generate_series(1,1205) n;
      INSERT INTO legal_document_lines SELECT md5(('line'||n)::text)::uuid,md5(n::text)::uuid FROM generate_series(1,1205) n;
      INSERT INTO legal_documents VALUES('20000000-0000-4000-8000-000000000001','dev','2026-01-01'),('20000000-0000-4000-8000-000000000002',null,'2026-01-01');
      INSERT INTO orders(id,items) VALUES('order','[{"sku":"R1","quantity":2,"price_at_order":20,"product_details":{"supplier_cost":999},"hidden_cost":888}]');
    `);
    await db.exec(readFileSync('supabase/migrations/20261013075005_inspection_evidence_snapshot.sql','utf8'));
  }, 60000);
  afterAll(async () => { await db?.close(); });
  it('returns all matching documents and lines without a REST page limit, and preserves unknown environments', async () => {
    await db.exec('SET ROLE service_role');
    try {
      const result = await db.query<any>("SELECT get_inspection_snapshot('prod',null,null) AS snapshot");
      const s = result.rows[0].snapshot;
      expect(s.tables.legal_documents).toHaveLength(1206);
      expect(s.tables.legal_document_lines).toHaveLength(1205);
      expect(s.tables.legal_documents.some((row: any) => row.environment === 'dev')).toBe(false);
      expect(s.tableStatus.inventory_balances).toBe('unavailable');
      expect(s.status.state).toBe('partial');
      expect(JSON.stringify(s.tables.legal_settings)).not.toContain('DO-NOT-EXPOSE');
      expect(JSON.stringify(s.tables.products)).not.toContain('supplier_cost');
    } finally { await db.exec('RESET ROLE'); }
  });
  it('distinguishes successful empty core data from missing auxiliary tables', async () => {
    const result = await db.query<any>("SELECT get_inspection_snapshot('prod','2025-01-01','2025-12-31') AS snapshot");
    expect(result.rows[0].snapshot.tables.legal_documents).toEqual([]);
    expect(result.rows[0].snapshot.tableStatus.legal_documents).toBe('complete');
    expect(result.rows[0].snapshot.tableStatus.inventory_balances).toBe('unavailable');
  });
  it('denies anonymous and unapproved users and keeps the catalogue context server-only', async () => {
    await db.exec('SET ROLE anon');
    try { await expect(db.query("SELECT get_inspection_snapshot('prod',null,null)")).rejects.toThrow(); }
    finally { await db.exec('RESET ROLE'); }
    await db.exec('SET ROLE authenticated');
    try {
      await expect(db.query("SELECT get_inspection_snapshot('prod',null,null)")).rejects.toThrow('administrator');
      await expect(db.query('SELECT get_legal_catalog_context()')).rejects.toThrow();
      await expect(db.query('SELECT get_inspection_support()')).rejects.toThrow();
      await db.exec("SELECT set_config('test.uid','30000000-0000-4000-8000-000000000001',false)");
      const result = await db.query<any>("SELECT get_inspection_snapshot('prod',null,null) AS snapshot");
      expect(result.rows[0].snapshot.tables.legal_documents).toHaveLength(1206);
    } finally { await db.exec('RESET ROLE'); }
  });
  it('whitelists order item fields and excludes hashes from supporting data', async () => {
    await db.exec('SET ROLE service_role');
    try {
      const result = await db.query<any>('SELECT get_inspection_support() AS support');
      expect(result.rows[0].support.orders[0].items[0]).toMatchObject({ sku: 'R1', quantity: 2, price_at_order: 20 });
      expect(JSON.stringify(result.rows[0].support)).not.toContain('supplier_cost');
      expect(JSON.stringify(result.rows[0].support)).not.toContain('hidden_cost');
      expect(JSON.stringify(result.rows[0].support)).not.toContain('DO-NOT-EXPOSE');
      const context = await db.query<any>('SELECT get_legal_catalog_context() AS context');
      expect(context.rows[0].context.products).toEqual([]);
    } finally { await db.exec('RESET ROLE'); }
    const result = await db.query<any>("SELECT provolatile,prosecdef FROM pg_proc WHERE proname='get_inspection_snapshot'");
    expect(result.rows[0]).toEqual({ provolatile: 's', prosecdef: false });
  });
  it('retains the fiscal customer editor without exposing or changing unrelated fields', async () => {
    await db.exec('SET ROLE service_role');
    try {
      const saved=await db.query<any>("SELECT save_inspection_customer($1::jsonb) AS customer",[JSON.stringify({id:'60000000-0000-4000-8000-000000000001',full_name:'Wholesale',vat_number:'000000000',internal_cost:999})]);
      expect(saved.rows[0].customer.full_name).toBe('Wholesale');
      expect(saved.rows[0].customer.internal_cost).toBeUndefined();
      const cost=await db.query<any>("SELECT internal_cost FROM customers WHERE id='60000000-0000-4000-8000-000000000001'");
      expect(Number(cost.rows[0].internal_cost)).toBe(777);
    } finally { await db.exec('RESET ROLE'); }
    await db.exec('SET ROLE authenticated');
    try { await expect(db.query("SELECT save_inspection_customer('{}')")).rejects.toThrow(); }
    finally { await db.exec('RESET ROLE'); }
  });
});
