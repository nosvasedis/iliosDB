import { describe, it, expect, vi } from 'vitest';
vi.mock('../../lib/supabase',()=>({api:{}}));
vi.mock('../../lib/offlineDb',()=>({offlineDb:{}}));
import { transformVault } from '../../lib/inspectionLocalVault';
const key=btoa(String.fromCharCode(...new Uint8Array(32).fill(10)));
describe('local encrypted inspection records',()=>{
  it('conceals cached costs and queued payloads and restores every record and queue identity',async()=>{
    const original={tables:[['products',[{sku:'R1',supplier_cost:999}]],['settings',{silver_price:999}]] as [string,any][],queue:[{id:7,table:'products',data:{sku:'R1',supplier_cost:999},method:'UPDATE'}]};
    const sealed=await transformVault(original,key,'vault');
    expect(JSON.stringify(sealed)).not.toContain('supplier_cost');
    expect(JSON.stringify(sealed)).not.toContain('silver_price');
    expect(sealed.queue[0].id).toBe(7);
    expect(await transformVault(sealed,key,'vault',true)).toEqual(original);
  });
  it('rejects altered ciphertext, swapped rows, wrong keys and partial restoration',async()=>{
    const original={tables:[['products',[{cost:1}]],['settings',{secret:2}]] as [string,any][],queue:[]};
    const sealed=await transformVault(original,key,'vault');
    const tampered=structuredClone(sealed); tampered.tables[0][1].data='AAAA';
    await expect(transformVault(tampered,key,'vault',true)).rejects.toThrow();
    const swapped=structuredClone(sealed); swapped.tables.reverse(); swapped.tables[0][0]='products';
    await expect(transformVault(swapped,key,'vault',true)).rejects.toThrow();
    await expect(transformVault(sealed,btoa(String.fromCharCode(...new Uint8Array(32).fill(11))),'vault',true)).rejects.toThrow();
    await expect(transformVault(original,key,'vault',true)).rejects.toThrow();
  });
});
