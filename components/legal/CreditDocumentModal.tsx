import { useRestartDraft } from '../../hooks/useRestartBlocker';
import { formatNumber } from '../../utils/numberFormat';
import React, { useState, useEffect, useRef } from 'react';
import { X, Undo2, Info, Loader2 } from 'lucide-react';
import type { LegalDocument, LegalDocumentLine } from '../../types';
import { buildCreditDraft } from '../../features/legal/sbz';
import { getLegalDocumentDisplayNumber } from '../../utils/legalDocuments';

export default function CreditDocumentModal({original,lines,available,reservedLines,onClose,onCreate}:{original:LegalDocument;lines:LegalDocumentLine[];available:Record<string,number>;reservedLines:LegalDocumentLine[];onClose:()=>void;onCreate:(bundle:ReturnType<typeof buildCreditDraft>)=>Promise<void>}) {
  const [quantities,setQuantities]=useState(available),[busy,setBusy]=useState(false),[error,setError]=useState('');
    useRestartDraft('Πιστωτικό παραστατικό', quantities, { busy });

  const dialog = useRef<HTMLElement>(null);
  useEffect(() => { const previous = document.activeElement as HTMLElement | null; dialog.current?.focus(); return () => previous?.focus(); }, []);
  const create=async()=>{setBusy(true);try{if (Object.entries(quantities).some(([id,qty]) => !Number.isFinite(qty) || qty < 0 || qty > (available[id] || 0))) throw new Error('Επιλέξτε ποσότητες μέχρι το διαθέσιμο υπόλοιπο.');await onCreate(buildCreditDraft(original,lines,quantities,reservedLines));}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
  const selectedQuantity = lines.reduce((sum, line) => sum + (Number(quantities[line.id]) || 0), 0);
  const availableQuantity = lines.reduce((sum, line) => sum + (available[line.id] || 0), 0);
  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 p-3 backdrop-blur-sm sm:p-6"><section ref={dialog} tabIndex={-1} onKeyDown={e=>{if(e.key==='Escape'&&!busy){e.preventDefault();onClose();} if(e.key==='Tab'){const items=dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled)');if(!items?.length)return;const first=items[0],last=items[items.length-1];if(e.shiftKey&&(document.activeElement===first||document.activeElement===dialog.current)){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}}} role="dialog" aria-modal="true" aria-labelledby="credit-title" className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl outline-none">
    <header className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4 sm:px-6">
      <div className="flex min-w-0 items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100"><Undo2 size={19}/></span>
        <div className="min-w-0">
          <h2 id="credit-title" className="text-lg font-black tracking-tight text-slate-950">Έκδοση πιστωτικού</h2>
          <p className="mt-0.5 truncate text-sm font-medium text-slate-500">Για το τιμολόγιο <span className="font-black text-slate-700">{getLegalDocumentDisplayNumber(original)}</span> · {original.counterpart.name}</p>
        </div>
      </div>
      <button type="button" onClick={onClose} disabled={busy} aria-label="Κλείσιμο" className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40"><X size={20}/></button>
    </header>
    <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6">
      <p className="mb-4 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-sm font-medium text-emerald-950"><Info size={16} className="mt-0.5 shrink-0 text-emerald-700"/><span>Έχουν επιλεγεί όλες οι διαθέσιμες ποσότητες. Μειώστε τις για μερική πίστωση. Οι αρχικές τιμές, εκπτώσεις και φόροι διατηρούνται.</span></p>
      <div className="overflow-hidden rounded-xl border border-slate-200">
        <div className="flex items-center justify-between bg-slate-50 px-4 py-2 text-[10px] font-black uppercase tracking-wide text-slate-500"><span>Είδος</span><span>Ποσότητα πίστωσης</span></div>
        <div className="divide-y divide-slate-100">{lines.map(l=><label key={l.id} className="flex items-center justify-between gap-4 px-4 py-3 transition hover:bg-slate-50/70"><span className="min-w-0"><span className="block truncate text-sm font-bold text-slate-800">{l.description}</span><span className="text-xs font-medium text-slate-500">Διαθέσιμα για πίστωση: {formatNumber(available[l.id] || 0)}</span></span><input aria-label={`Ποσότητα πίστωσης ${l.description}`} type="number" min={0} max={available[l.id]||0} step="any" value={quantities[l.id]??0} onChange={e=>setQuantities(q=>({...q,[l.id]:Number(e.target.value)}))} className="h-10 w-24 shrink-0 rounded-lg border border-slate-200 bg-white px-2 text-right text-sm font-bold tabular-nums text-slate-800 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"/></label>)}</div>
      </div>
      {error&&<p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p>}
    </div>
    <footer className="flex flex-col gap-3 border-t border-slate-100 bg-slate-50/70 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
      <div className="text-xs font-bold text-slate-500">Επιλογή: <span className="font-black tabular-nums text-slate-800">{formatNumber(selectedQuantity)}</span> από {formatNumber(availableQuantity)} τεμ.</div>
      <div className="flex justify-end gap-2"><button type="button" onClick={onClose} disabled={busy} className="min-h-10 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-700 transition hover:bg-slate-50 disabled:opacity-50">Πίσω</button><button type="button" disabled={busy} onClick={()=>void create()} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-black text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50">{busy&&<Loader2 size={16} className="animate-spin"/>}{busy?'Αποθηκεύεται…':'Δημιουργία προσχεδίου'}</button></div>
    </footer>
  </section></div>;
}
