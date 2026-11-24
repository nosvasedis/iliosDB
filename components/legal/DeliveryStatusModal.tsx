import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, ArrowLeft, Ban, CheckCircle2, CircleDot, Loader2, PackageCheck, PackageMinus, PackageX, Play, Plus, RefreshCw, RotateCcw, ThumbsUp, Trash2, Truck,
} from 'lucide-react';
import type { LegalDocument } from '../../types';
import { api } from '../../lib/supabase';
import { getLegalDocumentDisplayNumber, resolveSbzDispatchMethod, SBZ_OWN_MEANS_DISPATCH_METHOD } from '../../utils/legalDocuments';
import type { DeliveryStatusResult } from '../../features/legal/deliveryStatus';
import { PACKAGING_TYPES, TRANSPORT_TYPES, type DeliveryOutcome } from '../../features/legal/deliveryActions';
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
type PendingAction =
  | { kind: 'start'; vehicleNumber: string; transportType: number; isReturn?: boolean }
  | { kind: 'deliver'; outcome: DeliveryOutcome; withoutRecipient: boolean; packaging: Array<{ type: number; quantity: number; title?: string }> }
  | { kind: 'return' }
  | { kind: 'receive' }
  | { kind: 'reject'; reason: string };

const inputClass = 'h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 outline-hidden transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100';

const ActionCard = ({ icon: Icon, title, detail, tone = 'emerald', onClick, disabled }: { icon: typeof Play; title: string; detail: string; tone?: 'emerald' | 'amber' | 'red' | 'sky'; onClick: () => void; disabled?: boolean }) => {
  const tones = {
    emerald: 'border-emerald-200 hover:border-emerald-400 hover:bg-emerald-50/60 [&_.icon]:bg-emerald-600',
    sky: 'border-sky-200 hover:border-sky-400 hover:bg-sky-50/60 [&_.icon]:bg-sky-600',
    amber: 'border-amber-200 hover:border-amber-400 hover:bg-amber-50/60 [&_.icon]:bg-amber-500',
    red: 'border-red-200 hover:border-red-400 hover:bg-red-50/60 [&_.icon]:bg-red-600',
  };
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={`flex w-full items-center gap-3 rounded-xl border-2 bg-white p-3 text-left transition disabled:opacity-50 ${tones[tone]}`}>
      <span className="icon grid h-10 w-10 shrink-0 place-items-center rounded-xl text-white"><Icon size={18} /></span>
      <span className="min-w-0">
        <span className="block text-sm font-black text-slate-900">{title}</span>
        <span className="block text-[11px] font-medium leading-snug text-slate-500">{detail}</span>
      </span>
    </button>
  );
};

/**
 * Live lifecycle of a Ψηφιακό Δελτίο Αποστολής (myDATA GetDeliveryNoteStatus) and the next step
 * for it: our own vehicle starts / delivers / returns; a scanned note of a supplier is received or
 * rejected. Every step asks for a last confirmation, because myDATA events cannot be undone.
 */
export default function DeliveryStatusModal({
  document,
  qrUrl,
  onClose,
}: {
  document?: LegalDocument | null;
  qrUrl?: string | null;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<StatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'emerald' | 'red'; text: string } | null>(null);

  const own = Boolean(document);
  const ownMeans = own && resolveSbzDispatchMethod(document!.delivery) === SBZ_OWN_MEANS_DISPATCH_METHOD;
  const defaultVehicle = String(document?.delivery?.vehicle_number || document?.delivery?.carrier_vehicle_number || '').trim();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setResult(await api.getLegalDeliveryStatus(document ? { documentId: document.id } : { qrUrl: qrUrl || '' }));
    } catch (loadError: any) {
      setResult(null);
      setError(loadError?.message || 'Η ανάκτηση κατάστασης απέτυχε.');
    } finally {
      setLoading(false);
    }
  }, [document, qrUrl]);

  useEffect(() => { void load(); }, [load]);

  const status = result?.statusCode || null;
  const hadPartial = useMemo(() => (result?.events || []).some((event) => /μερική/.test(event.detail || '')), [result]);
  const environment = result?.environment || (document?.environment === 'dev' ? 'dev' : 'prod');
  const envLabel = environment === 'dev' ? 'Δοκιμές' : 'Παραγωγή';

  const send = async () => {
    if (!pending) return;
    setSending(true);
    setNotice(null);
    try {
      const base = document ? { documentId: document.id } : { qrUrl };
      const payload = pending.kind === 'start'
        ? { ...base, action: 'start', vehicleNumber: pending.vehicleNumber, transportType: pending.transportType }
        : pending.kind === 'deliver'
          ? { ...base, action: 'deliver', outcome: pending.outcome, deliveredWithoutRecipient: pending.withoutRecipient, packaging: pending.packaging }
          : pending.kind === 'reject'
            ? { ...base, action: 'reject', reason: pending.reason }
            : { ...base, action: pending.kind };
      const response = await api.sendLegalDeliveryAction(payload);
      setNotice({ tone: 'emerald', text: `Καταχωρήθηκε στη myDATA${response.eventMark ? ` · ΜΑΡΚ γεγονότος ${response.eventMark}` : ''}.` });
      setPending(null);
      if (response.status?.ok) setResult({ ...response.status, environment: response.environment, checkedAt: new Date().toISOString() });
      else void load();
    } catch (sendError: any) {
      setNotice({ tone: 'red', text: sendError?.message || 'Η ενέργεια δεν ολοκληρώθηκε.' });
    } finally {
      setSending(false);
    }
  };

  const pendingSummary = (action: PendingAction): string => {
    if (action.kind === 'start') return `${action.isReturn ? 'Έναρξη επιστροφής' : 'Έναρξη διακίνησης'} με όχημα ${action.vehicleNumber || '—'} (${TRANSPORT_TYPES.find((type) => type.value === action.transportType)?.label || ''}).`;
    if (action.kind === 'deliver') {
      const what = action.outcome === 'FULL' ? 'Πλήρης παράδοση' : action.outcome === 'PARTIAL' ? 'Μερική παράδοση' : 'Αποτυχία παράδοσης';
      return `${what}${action.withoutRecipient ? ' χωρίς παρουσία παραλήπτη' : ''}.`;
    }
    if (action.kind === 'return') return 'Επιβεβαίωση ότι το εμπόρευμα επέστρεψε σε εμάς. Η διακίνηση ολοκληρώνεται.';
    if (action.kind === 'receive') return 'Επιβεβαίωση ότι παραλάβαμε το εμπόρευμα πλήρως.';
    return `Ολική απόρριψη του δελτίου${action.reason ? ` · αιτία: ${action.reason}` : ''}.`;
  };

  const renderActions = () => {
    if (!result?.ok) return null;
    const cards: React.ReactNode[] = [];
    if (own) {
      if (status === '1' && ownMeans) {
        cards.push(<ActionCard key="start" icon={Play} title="Έναρξη διακίνησης" detail="Πριν φύγει το όχημα. Δηλώνει τη φόρτωση στη myDATA." onClick={() => setPending({ kind: 'start', vehicleNumber: defaultVehicle, transportType: 2 })} />);
      }
      if (status === '3' && ownMeans) {
        cards.push(<ActionCard key="full" icon={PackageCheck} title="Παραδόθηκε όλο" detail="Το εμπόρευμα παραδόθηκε πλήρως στον παραλήπτη." onClick={() => setPending({ kind: 'deliver', outcome: 'FULL', withoutRecipient: false, packaging: [] })} />);
        cards.push(<ActionCard key="partial" icon={PackageMinus} tone="amber" title="Μερική παράδοση" detail="Παραδόθηκε μέρος· δηλώστε τις συσκευασίες." onClick={() => setPending({ kind: 'deliver', outcome: 'PARTIAL', withoutRecipient: false, packaging: [{ type: 2, quantity: 1 }] })} />);
        cards.push(<ActionCard key="none" icon={PackageX} tone="red" title="Δεν παραδόθηκε" detail="Αποτυχία παράδοσης· το εμπόρευμα επιστρέφει." onClick={() => setPending({ kind: 'deliver', outcome: 'NONE', withoutRecipient: false, packaging: [] })} />);
      }
      const returnable = status === '4' || status === '7' || status === '9' || (status === '5' && hadPartial);
      if (returnable && ownMeans && status !== '9') {
        cards.push(<ActionCard key="return-start" icon={Truck} tone="sky" title="Έναρξη επιστροφής" detail="Το όχημά μας φέρνει πίσω το εμπόρευμα." onClick={() => setPending({ kind: 'start', vehicleNumber: defaultVehicle, transportType: 2, isReturn: true })} />);
      }
      if (returnable) {
        cards.push(<ActionCard key="return" icon={RotateCcw} tone="sky" title="Επιβεβαίωση επιστροφής" detail="Το εμπόρευμα γύρισε σε εμάς· ολοκληρώνει τη διακίνηση." onClick={() => setPending({ kind: 'return' })} />);
      }
    } else if (['1', '3', '5'].includes(status || '')) {
      if (status !== '1') cards.push(<ActionCard key="receive" icon={ThumbsUp} title="Επιβεβαίωση παραλαβής" detail="Παραλάβαμε όλο το εμπόρευμα." onClick={() => setPending({ kind: 'receive' })} />);
      cards.push(<ActionCard key="reject" icon={Ban} tone="red" title="Απόρριψη" detail="Ολική απόρριψη (π.χ. λάθος παραλήπτης ή εμπόρευμα)." onClick={() => setPending({ kind: 'reject', reason: '' })} />);
    }

    if (cards.length === 0) {
      const info = own && !ownMeans && status === '1'
        ? 'Την έναρξη τη δηλώνει ο μεταφορέας όταν σκανάρει το QR «Διακίνηση». Εδώ θα φαίνεται η πρόοδος.'
        : own && !ownMeans && (status === '3' || status === '5')
          ? 'Ο μεταφορέας δηλώνει την παράδοση και ο παραλήπτης την επιβεβαιώνει.'
          : status === '8' ? 'Η διακίνηση ολοκληρώθηκε. Δεν απαιτείται άλλη ενέργεια.'
            : status === '2' ? 'Το δελτίο έχει ακυρωθεί.'
              : 'Δεν υπάρχει διαθέσιμη ενέργεια σε αυτή την κατάσταση.';
      return <p className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-xs font-semibold leading-5 text-slate-600">{info}</p>;
    }
    return <div className="grid gap-2 sm:grid-cols-2">{cards}</div>;
  };

  const renderPending = (action: PendingAction) => (
    <div className="space-y-3 rounded-xl border-2 border-emerald-200 bg-emerald-50/40 p-4">
      <button type="button" onClick={() => setPending(null)} className="inline-flex items-center gap-1 text-xs font-black text-slate-500 hover:text-slate-800"><ArrowLeft size={13} /> Πίσω</button>
      {action.kind === 'start' && (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-[11px] font-black uppercase tracking-wide text-slate-500">Αρ. κυκλοφορίας</span>
            <input value={action.vehicleNumber} onChange={(event) => setPending({ ...action, vehicleNumber: event.target.value.toLocaleUpperCase('el-GR') })} placeholder="π.χ. ΙΚΑ 1234" className={inputClass} autoFocus />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-black uppercase tracking-wide text-slate-500">Μεταφορικό μέσο</span>
            <select value={action.transportType} onChange={(event) => setPending({ ...action, transportType: Number(event.target.value) })} className={inputClass}>
              {TRANSPORT_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
            </select>
          </label>
        </div>
      )}
      {action.kind === 'deliver' && (
        <div className="space-y-3">
          {action.outcome === 'PARTIAL' && (
            <div className="space-y-2">
              <span className="block text-[11px] font-black uppercase tracking-wide text-slate-500">Συσκευασίες που παραδόθηκαν</span>
              {action.packaging.map((item, index) => (
                <div key={index} className="flex items-center gap-2">
                  <select value={item.type} onChange={(event) => setPending({ ...action, packaging: action.packaging.map((row, i) => i === index ? { ...row, type: Number(event.target.value) } : row) })} className={inputClass}>
                    {PACKAGING_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
                  </select>
                  <input type="number" min={1} value={item.quantity} onChange={(event) => setPending({ ...action, packaging: action.packaging.map((row, i) => i === index ? { ...row, quantity: Number(event.target.value) || 0 } : row) })} className={`${inputClass} w-24`} aria-label="Πλήθος" />
                  {action.packaging.length > 1 && <button type="button" onClick={() => setPending({ ...action, packaging: action.packaging.filter((_, i) => i !== index) })} className="rounded-lg p-2 text-slate-400 hover:bg-white hover:text-red-600" aria-label="Αφαίρεση"><Trash2 size={14} /></button>}
                </div>
              ))}
              <button type="button" onClick={() => setPending({ ...action, packaging: [...action.packaging, { type: 2, quantity: 1 }] })} className="inline-flex items-center gap-1 text-xs font-black text-emerald-700 hover:text-emerald-900"><Plus size={13} /> Προσθήκη συσκευασίας</button>
            </div>
          )}
          {action.outcome !== 'NONE' && (
            <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-bold text-slate-600">
              <input type="checkbox" className="h-4 w-4 accent-emerald-600" checked={action.withoutRecipient} onChange={(event) => setPending({ ...action, withoutRecipient: event.target.checked })} />
              Παράδοση χωρίς την παρουσία του παραλήπτη
            </label>
          )}
        </div>
      )}
      {action.kind === 'reject' && (
        <label className="block">
          <span className="mb-1 block text-[11px] font-black uppercase tracking-wide text-slate-500">Αιτία (προαιρετικά)</span>
          <input value={action.reason} onChange={(event) => setPending({ ...action, reason: event.target.value })} placeholder="π.χ. λάθος εμπόρευμα" className={inputClass} autoFocus />
        </label>
      )}
      <div className="flex items-start gap-2 rounded-lg bg-white/80 px-3 py-2 text-xs font-semibold leading-5 text-slate-700 ring-1 ring-slate-200">
        <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-600" />
        <span>{pendingSummary(action)} Θα δηλωθεί στη myDATA ({envLabel}) και δεν αναιρείται.</span>
      </div>
      <button
        type="button"
        onClick={() => void send()}
        disabled={sending || (action.kind === 'start' && !action.vehicleNumber.trim() && action.transportType !== 7)}
        className={`inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-black text-white shadow-xs transition disabled:cursor-not-allowed disabled:bg-slate-300 ${action.kind === 'reject' || (action.kind === 'deliver' && action.outcome === 'NONE') ? 'bg-red-600 hover:bg-red-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}
      >
        {sending ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />} Επιβεβαίωση και αποστολή
      </button>
    </div>
  );

  return (
    <PickerModal
      title={own ? 'Διακίνηση' : 'Παραλαβή εμπορεύματος'}
      subtitle={own
        ? `${getLegalDocumentDisplayNumber(document!)} · ΜΑΡΚ ${document!.aade_mark || '—'} · ${envLabel}`
        : `Δελτίο τρίτου από σκανάρισμα QR · ${envLabel}`}
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

          {notice ? (
            <div role="status" className={`rounded-xl border px-3.5 py-2.5 text-sm font-semibold ${notice.tone === 'emerald' ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-red-200 bg-red-50 text-red-800'}`}>{notice.text}</div>
          ) : null}

          <section>
            <h3 className="mb-2 text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">Επόμενο βήμα</h3>
            {pending ? renderPending(pending) : renderActions()}
          </section>

          <section>
            <h3 className="mb-2 text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">Ιστορικό</h3>
            {result.events.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-200 px-4 py-4 text-center text-sm font-medium text-slate-500">Δεν έχει καταγραφεί ακόμα γεγονός.</p>
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
          </section>
          {result.errors.length > 0 ? <p className="text-xs font-semibold text-amber-800">{result.errors.join(' · ')}</p> : null}
        </div>
      ) : null}
    </PickerModal>
  );
}
