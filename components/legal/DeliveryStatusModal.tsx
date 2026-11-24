import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, CircleDot, Loader2, RefreshCw, Truck } from 'lucide-react';
import type { LegalDocument } from '../../types';
import { api } from '../../lib/supabase';
import { getLegalDocumentDisplayNumber } from '../../utils/legalDocuments';
import type { DeliveryStatusResult } from '../../features/legal/deliveryStatus';
import { PickerModal } from './issue/PickerModal';

const toneClass: Record<DeliveryStatusResult['tone'], string> = {
  slate: 'border-slate-200 bg-slate-50 text-slate-800',
  sky: 'border-sky-200 bg-sky-50 text-sky-900',
  emerald: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  amber: 'border-amber-200 bg-amber-50 text-amber-900',
  red: 'border-red-200 bg-red-50 text-red-800',
};

const formatTimestamp = (value?: string | null) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('el-GR', { timeZone: 'Europe/Athens', dateStyle: 'short', timeStyle: 'short' });
};

type StatusResponse = DeliveryStatusResult & { environment?: 'dev' | 'prod'; checkedAt?: string };

/** Live lifecycle of a Ψηφιακό Δελτίο Αποστολής, read from myDATA (GetDeliveryNoteStatus). */
export default function DeliveryStatusModal({ document, onClose }: { document: LegalDocument; onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<StatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setResult(await api.getLegalDeliveryStatus(document.id));
    } catch (loadError: any) {
      setResult(null);
      setError(loadError?.message || 'Η ανάκτηση κατάστασης απέτυχε.');
    } finally {
      setLoading(false);
    }
  }, [document.id]);

  useEffect(() => { void load(); }, [load]);

  return (
    <PickerModal
      title="Κατάσταση διακίνησης"
      subtitle={`${getLegalDocumentDisplayNumber(document)} · ΜΑΡΚ ${document.aade_mark || '—'} · ${document.environment === 'dev' ? 'Δοκιμές' : 'Παραγωγή'}`}
      onClose={onClose}
      footer={(
        <div className="flex items-center justify-between gap-2 text-[11px] font-medium text-slate-500">
          <span>Απευθείας από τη myDATA{result?.checkedAt ? ` · ${formatTimestamp(result.checkedAt)}` : ''}</span>
          <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-black text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-50 disabled:opacity-60">
            {loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Ανανέωση
          </button>
        </div>
      )}
    >
      {loading && !result ? (
        <div className="flex items-center justify-center gap-2 py-10 text-sm font-semibold text-slate-500"><Loader2 size={16} className="animate-spin" /> Ερώτηση στη myDATA…</div>
      ) : error ? (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">{error}</div>
      ) : result ? (
        <div className="space-y-4">
          <div className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${toneClass[result.tone]}`}>
            <Truck size={20} className="shrink-0" />
            <div className="min-w-0">
              <div className="text-base font-black">{result.statusLabel}</div>
              {result.dispatchTimestamp ? <div className="text-xs font-semibold opacity-80">Έναρξη διακίνησης: {formatTimestamp(result.dispatchTimestamp)}</div> : null}
            </div>
          </div>
          <div>
            <h3 className="mb-2 text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">Ιστορικό</h3>
            {result.events.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-200 px-4 py-5 text-center text-sm font-medium text-slate-500">
                Δεν έχει καταγραφεί ακόμα γεγονός (π.χ. σκανάρισμα από μεταφορέα).
              </p>
            ) : (
              <ol className="space-y-2">
                {result.events.map((event, index) => (
                  <li key={`${event.type}-${event.at}-${index}`} className="flex gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
                    {index === result.events.length - 1 ? <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-600" /> : <CircleDot size={16} className="mt-0.5 shrink-0 text-slate-400" />}
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-black text-slate-900">{event.label}</div>
                      <div className="text-[11px] font-medium text-slate-500">
                        {[formatTimestamp(event.at), event.actorVat ? `από ΑΦΜ ${event.actorVat}` : null, event.detail].filter(Boolean).join(' · ')}
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>
          {result.errors.length > 0 ? <p className="text-xs font-semibold text-amber-800">{result.errors.join(' · ')}</p> : null}
        </div>
      ) : null}
    </PickerModal>
  );
}
