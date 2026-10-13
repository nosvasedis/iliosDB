import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
vi.mock('../../lib/supabase',()=>({api:{enterInspectionSession:vi.fn()}}));
import { api } from '../../lib/supabase';
import { offlineDb } from '../../lib/offlineDb';
import { sealInspectionLocalData, restoreInspectionLocalData, transformVault } from '../../lib/inspectionLocalVault';
import { isInspectionModeActive } from '../../lib/inspectionMode';
class StorageMock { values=new Map<string,string>();get length(){return this.values.size;}key(n:number){return [...this.values.keys()][n]||null;}getItem(k:string){return this.values.get(k)||null;}setItem(k:string,v:string){this.values.set(k,v);}removeItem(k:string){this.values.delete(k);}clear(){this.values.clear();} }
describe('atomic encrypted IndexedDB transitions',()=>{
  beforeEach(()=>{vi.stubGlobal('indexedDB',new IDBFactory());vi.stubGlobal('localStorage',new StorageMock());vi.stubGlobal('sessionStorage',new StorageMock());vi.mocked(api.enterInspectionSession).mockReset().mockResolvedValue(undefined);});
  afterEach(()=>{vi.unstubAllGlobals();});
  const seed=async()=>{
    await offlineDb.saveTable('products',[{sku:'R1',supplier_cost:999}]);
    await offlineDb.saveValue('erp-catalog',{products:[{sku:'R1',labor:777}]});
    await offlineDb.saveValue('inspection:v1:owner:snapshot:test',{tables:{legal_documents:[]}});
    await offlineDb.enqueue({type:'fixture',table:'products',method:'UPDATE',data:{sku:'R1',supplier_cost:888}});
    return offlineDb.readInspectionLocalSnapshot();
  };
  it('seals every business record and queue payload, preserves count and restores exactly',async()=>{
    const original=await seed();
    localStorage.setItem('ilios-order-draft',JSON.stringify({supplier_cost:1234}));
    await sealInspectionLocalData();
    const descriptor=vi.mocked(api.enterInspectionSession).mock.calls[0][0]!;
    const encrypted=await offlineDb.readInspectionLocalSnapshot();
    expect(isInspectionModeActive()).toBe(true);
    expect(JSON.stringify(encrypted)).not.toContain('supplier_cost');
    expect(JSON.stringify(encrypted)).not.toContain('labor');
    expect(JSON.stringify([...((localStorage as any).values)])).not.toContain(descriptor.key);
    expect(localStorage.getItem('ilios-order-draft')).toBeNull();
    expect(await offlineDb.getQueueCount()).toBe(1);
    expect(await offlineDb.getValue('inspection:v1:owner:snapshot:test')).toEqual({tables:{legal_documents:[]}});
    await expect(offlineDb.getQueue()).rejects.toThrow('κλειδωμένες');
    await expect(offlineDb.saveTable('products',[])).rejects.toThrow('κλειδωμένα');
    await expect(offlineDb.clearSyncQueue()).rejects.toThrow('κλειδωμένα');
    // Browser reload: tab state disappears, durable metadata and lock remain.
    sessionStorage.clear?.();
    expect(await offlineDb.getInspectionVault()).toMatchObject({id:descriptor.id});
    await sealInspectionLocalData();
    expect(vi.mocked(api.enterInspectionSession).mock.calls[1][0]).toBeUndefined();
    await expect(restoreInspectionLocalData(undefined,descriptor.id)).rejects.toThrow();
    expect(await offlineDb.readInspectionLocalSnapshot()).toEqual(encrypted);
    await restoreInspectionLocalData(descriptor.key,descriptor.id);
    expect(await offlineDb.readInspectionLocalSnapshot()).toEqual(original);
    expect(await offlineDb.getInspectionVault()).toBeNull();
    expect(localStorage.getItem('ilios-order-draft')).toBe(JSON.stringify({supplier_cost:1234}));
  });
  it('does not change any local data if registering the recovery key fails',async()=>{
    const original=await seed();vi.mocked(api.enterInspectionSession).mockRejectedValueOnce(new Error('server unavailable'));
    await expect(sealInspectionLocalData()).rejects.toThrow('server unavailable');
    expect(await offlineDb.readInspectionLocalSnapshot()).toEqual(original);
    expect(isInspectionModeActive()).toBe(false);
  });
  it('aborts the whole replacement when another tab writes after the snapshot',async()=>{
    const original=await seed();
    const key=btoa(String.fromCharCode(...new Uint8Array(32).fill(10)));
    const encrypted=await transformVault(original,key,'fixture');
    await offlineDb.saveTable('products',[{sku:'R1',supplier_cost:1000}]);
    await expect(offlineDb.replaceInspectionLocalSnapshot(original,encrypted,{id:'fixture'})).rejects.toThrow('άλλαξαν');
    expect((await offlineDb.getTable('products'))?.[0].supplier_cost).toBe(1000);
    expect((await offlineDb.getQueue())[0].data.supplier_cost).toBe(888);
    expect(await offlineDb.getInspectionVault()).toBeNull();
  });
  it('preserves a newer localStorage draft if the transition fails, including PIN restoration',async()=>{
    await seed();localStorage.setItem('draft','original');
    vi.mocked(api.enterInspectionSession).mockImplementationOnce(async()=>{localStorage.setItem('draft','newer');});
    await expect(sealInspectionLocalData()).rejects.toThrow('διατηρήθηκε');
    expect(localStorage.getItem('draft')).toBe('newer');
    expect(isInspectionModeActive()).toBe(true);
    const vault=vi.mocked(api.enterInspectionSession).mock.calls[0][0]!;
    await restoreInspectionLocalData(vault.key,vault.id);
    expect(localStorage.getItem('draft')).toBe('newer');
    expect(await offlineDb.getInspectionVault()).toBeNull();
  });
});
