// Synthetic development fixture. No provider, authentication or database writes.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import InspectionWorkspace, { InspectionStatusPanel, type InspectionExtraTab } from '../../components/inspection/InspectionWorkspace';
import { offlineDb } from '../../lib/offlineDb';
import { transformVault, sealInspectionLocalData, restoreInspectionLocalData } from '../../lib/inspectionLocalVault';
import { api } from '../../lib/supabase';
import { isInspectionModeActive } from '../../lib/inspectionMode';
import type { InspectionSnapshot } from '../../features/inspection/types';
const key=btoa(String.fromCharCode(...new Uint8Array(32).fill(10)));
const snapshot: InspectionSnapshot={version:1,fetchedAt:'2026-10-13T09:00:00Z',filters:{environment:'prod',dateFrom:'',dateTo:''},
 status:{state:'partial',source:'database',fetchedAt:'2026-10-13T09:00:00Z',period:{from:null,to:null},error:'Δοκιμαστικό στιγμιότυπο · χωρίς πραγματικά επιχειρηματικά δεδομένα'},
 tableStatus:{products:'complete',product_variants:'complete',legal_documents:'complete',legal_document_lines:'complete',inventory_balances:'complete',consignment_lines:'complete',repair_items:'complete'},
 tables:{products:Array.from({length:205},(_,i)=>({sku:`R${i}`,description:`Δαχτυλίδι δοκιμής ${i}`,category:'Δαχτυλίδι',prefix:'R'})),product_variants:[],legal_documents:[],legal_document_lines:[{document_id:'history',sku:'OLD',item_code:'OLD-X',description:'Ιστορικός κωδικός',measurement_unit:2}],legal_settings:[{settings:{inspection_evidence_sources:[]}}],inventory_balances:[{product_sku:'R1',warehouse_id:'main',on_hand:null,reserved:2}],warehouses:[{id:'main',name:'Κεντρική'}],customers:[{id:'c1',full_name:'Δοκιμή πελάτη',vat_number:'000000000',address:'Δοκιμαστική διεύθυνση'}],consignments:[{id:'c',code:'PK1',customer_id:'c1',status:'active'}],consignment_lines:[{id:'l',consignment_id:'c',product_sku:'R1',quantity:2,pending_quantity:2}],repair_items:[{id:'repair',code:'EP1',customer_id:'c1',description:'Επισκευή δοκιμής',status:'received'}]}};
function Fixture(){
 const [tab,setTab]=useState<InspectionExtraTab>('registry');const [result,setResult]=useState('Δεν εκτελέστηκε ο έλεγχος');
 const check=async()=>{
   try{
     if(await offlineDb.getInspectionVault())throw new Error('Υπάρχει προηγούμενος δοκιμαστικός θόλος.');
     if(isInspectionModeActive())throw new Error('Υπάρχει ενεργό κλείδωμα σε αυτή την προέλευση.');
     await offlineDb.saveTable('fixture_records',[{supplier_cost:999,sku:'R1'}]);
     await offlineDb.enqueue({type:'fixture',table:'fixture_records',method:'UPDATE',data:{supplier_cost:888}});
     const before=await offlineDb.readInspectionLocalSnapshot();const sealed=await transformVault(before,key,'fixture');
     await offlineDb.saveTable('fixture_records',[{supplier_cost:1000,sku:'R1'}]);
     let conflict=false;try{await offlineDb.replaceInspectionLocalSnapshot(before,sealed,{id:'fixture'});}catch{conflict=true;}
     if(!conflict || (await offlineDb.getTable('fixture_records'))?.[0].supplier_cost!==1000)throw new Error('Η προστασία ταυτόχρονης εγγραφής απέτυχε');
     const current=await offlineDb.readInspectionLocalSnapshot();
     localStorage.setItem('fixture-local-draft','{"supplier_cost":999}');
     let recovery: {id:string;key:string}|undefined;
     const originalEnter=api.enterInspectionSession;
     api.enterInspectionSession=async(vault)=>{if(vault)recovery=vault;};
     try { await sealInspectionLocalData(); } finally { api.enterInspectionSession=originalEnter; }
     if(!recovery || localStorage.getItem('fixture-local-draft')!==null)throw new Error('Το τοπικό πρόχειρο δεν κρυπτογραφήθηκε');
     const stored=await offlineDb.readInspectionLocalSnapshot();
     if(JSON.stringify(stored).includes('supplier_cost') || await offlineDb.getQueueCount()!==current.queue.length)throw new Error('Η απόκρυψη ή η διατήρηση ουράς απέτυχε');
     let blocked=false;try{await offlineDb.saveTable('fixture_records',[]);}catch{blocked=true;}if(!blocked)throw new Error('Η προστασία μεταβολής απέτυχε');
     await restoreInspectionLocalData(recovery.key,recovery.id);localStorage.removeItem('_ilm');
     if(localStorage.getItem('fixture-local-draft')!=='{"supplier_cost":999}')throw new Error('Το τοπικό πρόχειρο δεν επαναφέρθηκε');
     const after=await offlineDb.readInspectionLocalSnapshot();if(JSON.stringify(after)!==JSON.stringify(current))throw new Error('Δεν επαναφέρθηκαν ακριβώς οι αρχικές εγγραφές');
     setResult(`PASS · Atomic conflict protection, ciphertext, localStorage drafts, locked writes, ${current.queue.length} queued records and exact restoration`);
   }catch(e){setResult(`FAIL · ${e instanceof Error?e.message:String(e)}`);}
 };
 return <main className="mx-auto max-w-7xl space-y-4 p-4"><h1 className="text-xl font-bold">Έλεγχος με συνθετικά στοιχεία</h1><button onClick={()=>void check()} className="rounded-xl bg-slate-900 p-3 text-white">Έλεγχος IndexedDB</button><p role="status">{result}</p>
 <InspectionStatusPanel snapshot={snapshot} loading={false} pendingCount={3} filters={snapshot.filters} onFilters={()=>{}} onRefresh={()=>{}}/>
 <nav className="flex flex-wrap gap-3">{(['registry','readiness','inventory','third_parties'] as InspectionExtraTab[]).map(t=><button key={t} onClick={()=>setTab(t)} className="rounded-xl border bg-white p-3">{t}</button>)}</nav>
 <InspectionWorkspace tab={tab} snapshot={snapshot} onOpenDocument={()=>{}}/></main>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
