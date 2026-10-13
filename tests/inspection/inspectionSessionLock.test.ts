import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';

let db: PGlite;
const user='30000000-0000-4000-8000-000000000001';
const session='40000000-0000-4000-8000-000000000001';
const vault='50000000-0000-4000-8000-000000000001';
const key='AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
async function asUser(s=session) {
  await db.exec(`RESET ROLE; SELECT set_config('test.uid','${user}',false); SELECT set_config('request.jwt.claims','{"session_id":"${s}"}',false); SET ROLE authenticated`);
}
describe('server inspection lock',()=>{
  beforeAll(async()=>{
    db=new PGlite();
    await db.exec(`CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role; CREATE ROLE authenticator;
      CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('test.uid',true),'')::uuid $$;
      CREATE TABLE profiles(id uuid PRIMARY KEY,email text,full_name text,role text,is_approved boolean);
      INSERT INTO profiles VALUES('${user}','a@example.test','Admin','admin',true);
      ALTER TABLE profiles ENABLE ROW LEVEL SECURITY; CREATE POLICY normal_read ON profiles FOR SELECT TO authenticated USING(true);
      CREATE FUNCTION is_legal_module_admin() RETURNS boolean LANGUAGE sql STABLE SET search_path=public AS $$ SELECT EXISTS(SELECT 1 FROM profiles WHERE id=auth.uid() AND role='admin' AND is_approved) $$;
      CREATE FUNCTION has_inspection_exit_pin() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
      CREATE FUNCTION verify_inspection_exit_pin(p_pin text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT p_pin='1234' $$;
      CREATE TABLE products(id int,cost int); INSERT INTO products VALUES(1,999);
      ALTER TABLE products ENABLE ROW LEVEL SECURITY; CREATE POLICY normal_read ON products FOR SELECT TO authenticated USING(true);
      GRANT USAGE ON SCHEMA public,auth TO authenticated,anon,service_role;
      GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;
    `);
    await db.exec(readFileSync('supabase/migrations/20261013094742_inspection_session_lock.sql','utf8'));
  },60000);
  afterAll(async()=>{await db?.close();});
  it('locks only the signed session and hides unrelated table reads',async()=>{
    await asUser();
    await db.query('SELECT enter_inspection_session($1,$2)',[vault,key]);
    expect((await db.query<any>('SELECT inspection_session_state() AS locked')).rows[0].locked).toBe(true);
    expect((await db.query('SELECT * FROM products')).rows).toEqual([]);
    expect((await db.query('SELECT * FROM profiles')).rows).toEqual([]);
    expect((await db.query<any>('SELECT is_legal_module_admin() AS admin')).rows[0].admin).toBe(true);
    await expect(db.query('SELECT * FROM private.inspection_local_vaults')).rejects.toThrow('permission');
    await asUser('40000000-0000-4000-8000-000000000002');
    expect((await db.query<any>('SELECT inspection_session_state() AS locked')).rows[0].locked).toBe(false);
    expect((await db.query('SELECT * FROM products')).rows).toHaveLength(1);
  });
  it('blocks alternate RPCs and configuration but permits fiscal operations and safe bootstrap',async()=>{
    await asUser();
    for(const [path,method] of [['/products','GET'],['/rpc/verify_inspection_exit_pin','POST'],['/rpc/backup_schema_inventory','POST'],['/legal_settings','PATCH'],['/profiles','GET'],['/legal_sync_runs','DELETE']]) {
      await db.query("SELECT set_config('request.path',$1,false),set_config('request.method',$2,false)",[path,method]);
      await expect(db.query('SELECT enforce_inspection_request()')).rejects.toThrow('PIN');
    }
    for(const path of ['/rpc/inspection_current_profile','/rpc/inspection_session_state','/rpc/save_sbz_draft','/rpc/exit_inspection_session']) {
      await db.query("SELECT set_config('request.path',$1,false),set_config('request.method','POST',false)",[path]);
      await db.query('SELECT enforce_inspection_request()');
    }
    const profile=(await db.query<any>('SELECT inspection_current_profile() AS profile')).rows[0].profile;
    expect(Object.keys(profile).sort()).toEqual(['email','full_name','id','is_approved','role']);
  });
  it('rate limits the PIN and repeated entry does not reset attempts',async()=>{
    await asUser();
    for(let n=0;n<5;n++) expect((await db.query<any>("SELECT exit_inspection_session('wrong',$1) AS result",[vault])).rows[0].result).toEqual({unlocked:false});
    await db.query('SELECT enter_inspection_session()');
    expect((await db.query<any>("SELECT exit_inspection_session('1234',$1) AS result",[vault])).rows[0].result).toEqual({unlocked:false});
    expect((await db.query<any>('SELECT inspection_session_state() AS locked')).rows[0].locked).toBe(true);
  });
  it('releases the local key only with a valid PIN and preserves other sessions',async()=>{
    await db.exec("RESET ROLE; UPDATE private.inspection_sessions SET last_attempt_at=now()-interval '2 minutes'");
    await asUser();
    const result=(await db.query<any>("SELECT exit_inspection_session('1234',$1) AS result",[vault])).rows[0].result;
    expect(result).toEqual({unlocked:true,vaultKey:key});
    expect((await db.query('SELECT * FROM products')).rows).toHaveLength(1);
    expect((await db.query<any>("SELECT exit_inspection_session('1234',$1) AS result",[vault])).rows[0].result).toEqual({unlocked:false});
  });
  it('rejects anonymous entry and refuses to overwrite an existing pre-request hook',async()=>{
    await db.exec('RESET ROLE; SET ROLE anon');
    await expect(db.query('SELECT enter_inspection_session()')).rejects.toThrow();
    await db.exec("RESET ROLE; ALTER ROLE authenticator SET pgrst.db_pre_request='public.other_hook'");
    await expect(db.exec(readFileSync('supabase/migrations/20261013094742_inspection_session_lock.sql','utf8'))).rejects.toThrow('chained explicitly');
  });
});
