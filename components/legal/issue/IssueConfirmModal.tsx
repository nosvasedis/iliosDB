import React from 'react';
import { AlertTriangle, ArrowRight, Building2, FlaskConical, MapPin, Package, Send, ShieldCheck, Truck, UserRound } from 'lucide-react';
import type { LegalDocument, LegalDocumentLine, LegalEnvironment } from '../../../types';
import {
  documentIncludesDeliveryNote,
  formatSbzDispatchPlace,
  getLegalDocumentKindLabel,
  PAYMENT_METHOD_LABELS,
  resolveLegalCarrierLabel,
  resolveLegalVehicleLabel,
  resolveSbzDispatchMethod,
} from '../../../utils/legalDocuments';
import { SBZ_MOVE_PURPOSES } from '../../../features/legal/sbz';
import { summarizeLegalQuantities } from '../../../utils/legalUnits';
import { PickerModal } from './PickerModal';

const money = (value: number) => (Number(value) || 0).toLocaleString('el-GR', { style: 'currency', currency: 'EUR' });
const formatDate = (iso?: string | null) => {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return d && m && y ? `${d}/${m}/${y}` : iso;
};

const Row = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="flex items-start justify-between gap-3 py-1.5">
    <dt className="shrink-0 text-xs font-bold text-slate-500">{label}</dt>
    <dd className="min-w-0 text-right text-sm font-bold text-slate-800">{value}</dd>
  </div>
);

const Section = ({ icon: Icon, title, children }: { icon: typeof Truck; title: string; children: React.ReactNode }) => (
  <section className="rounded-xl border border-slate-200 bg-white p-3.5">
    <h3 className="mb-1 flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.12em] text-slate-500"><Icon size={13} /> {title}</h3>
    <dl className="divide-y divide-slate-100">{children}</dl>
  </section>
);

/**
 * Final check before an irreversible send. Shows what this document type actually carries:
 * a 9.3 has no payment or values, an invoice has no movement unless it is a Τιμολόγιο-ΔΑ.
 */
export default function IssueConfirmModal({
  document,
  lines,
  environment,
  onConfirm,
  onCancel,
}: {
  document: LegalDocument;
  lines: LegalDocumentLine[];
  environment: LegalEnvironment;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const kindLabel = getLegalDocumentKindLabel(document.document_kind, document.aade_document_type);
  const deliveryNoteOnly = document.document_kind === 'delivery_note';
  const movement = documentIncludesDeliveryNote(document);
  const delivery = document.delivery || null;
  const partner = Boolean(document.counterpart.supplier_id);
  const dev = environment === 'dev';
  const method = resolveSbzDispatchMethod(delivery);
  const carrier = resolveLegalCarrierLabel(delivery);
  const purpose = delivery?.move_purpose === 19 && delivery?.move_purpose_title
    ? delivery.move_purpose_title
    : SBZ_MOVE_PURPOSES[Number(delivery?.move_purpose || 1)] || '—';
  const hasValues = lines.some((line) => Number(line.net_value) > 0);

  return (
    <PickerModal
      title={`Οριστική έκδοση · ${kindLabel}`}
      subtitle="Ελέγξτε τα βασικά στοιχεία. Μετά την αποστολή στη myDATA το παραστατικό δεν αλλάζει."
      onClose={onCancel}
      footer={(
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-black ${dev ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-emerald-300 bg-emerald-50 text-emerald-900'}`}>
            {dev ? <FlaskConical size={13} /> : <ShieldCheck size={13} />} {dev ? 'Δοκιμές · χωρίς φορολογική ισχύ' : 'Παραγωγή · πραγματικό παραστατικό'}
          </span>
          <div className="flex gap-2">
            <button type="button" onClick={onCancel} className="min-h-10 rounded-xl bg-white px-4 text-sm font-black text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-50">Πίσω</button>
            <button type="button" onClick={onConfirm} autoFocus className={`inline-flex min-h-10 items-center gap-2 rounded-xl px-4 text-sm font-black text-white shadow-xs transition ${dev ? 'bg-amber-600 hover:bg-amber-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}>
              <Send size={15} /> {dev ? 'Έκδοση στις Δοκιμές' : 'Έκδοση'}
            </button>
          </div>
        </div>
      )}
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[11px] font-black text-slate-600">ΑΑΔΕ {document.aade_document_type}</span>
          <span className="text-xs font-semibold text-slate-500">Ημερομηνία έκδοσης {formatDate(document.issue_date)}</span>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <Section icon={partner ? Building2 : UserRound} title={partner ? 'Συνεργάτης' : 'Πελάτης'}>
            <Row label="Επωνυμία" value={document.counterpart.name || '—'} />
            <Row label="ΑΦΜ" value={document.counterpart.vat_number || '—'} />
            {document.counterpart.tax_office ? <Row label="ΔΟΥ" value={document.counterpart.tax_office} /> : null}
          </Section>

          {deliveryNoteOnly ? (
            <Section icon={Package} title="Είδη">
              <Row label="Γραμμές" value={lines.length.toLocaleString('el-GR')} />
              <Row label="Ποσότητα" value={summarizeLegalQuantities(lines) || '—'} />
              {hasValues ? <Row label="Αξία (ενημερωτικά)" value={money(document.totals.net)} /> : <Row label="Αξίες" value={<span className="text-slate-500">Χωρίς αξίες · χωρίς ΦΠΑ</span>} />}
            </Section>
          ) : (
            <Section icon={Package} title="Αξίες">
              <Row label="Καθαρή αξία" value={money(document.totals.net)} />
              <Row label="ΦΠΑ" value={money(document.totals.vat)} />
              <Row label="Σύνολο" value={<span className="text-base font-black text-slate-900">{money(document.totals.gross)}</span>} />
              <Row label="Τρόπος πληρωμής" value={PAYMENT_METHOD_LABELS[document.payment_method_code] || '—'} />
            </Section>
          )}
        </div>

        {movement ? (
          <Section icon={Truck} title="Διακίνηση">
            <Row label="Σκοπός" value={purpose} />
            <Row
              label="Διαδρομή"
              value={(
                <span className="inline-flex flex-wrap items-center justify-end gap-1">
                  <MapPin size={12} className="text-slate-400" /> {formatSbzDispatchPlace(delivery?.loading_address || null) || '—'}
                  <ArrowRight size={12} className="text-slate-400" /> {formatSbzDispatchPlace(delivery?.delivery_address || null, document.counterpart.country) || '—'}
                </span>
              )}
            />
            <Row label="Τρόπος αποστολής" value={carrier && carrier !== method ? `${method} · ${carrier}` : method} />
            <Row label="Όχημα" value={resolveLegalVehicleLabel(delivery) || <span className="text-amber-700">Δεν έχει δηλωθεί</span>} />
            <Row label="Έναρξη" value={`${formatDate(delivery?.dispatch_date)} · ${(delivery?.dispatch_time || '').slice(0, 5) || '—'}`} />
          </Section>
        ) : (
          <p className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs font-semibold text-slate-600">Χωρίς δελτίο διακίνησης: δεν συνοδεύει μεταφορά αγαθών.</p>
        )}

        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50/70 px-3.5 py-2.5 text-xs font-semibold leading-5 text-amber-900">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          <span>
            {deliveryNoteOnly
              ? 'Μετά την έκδοση το δελτίο δεν αλλάζει. Ακυρώνεται μόνο πριν ξεκινήσει η διακίνηση (πριν σκαναριστεί το QR «Διακίνηση»).'
              : movement
                ? 'Μετά την έκδοση δεν αλλάζει. Διόρθωση αξιών μόνο με πιστωτικό. Το QR «Διακίνηση» τυπώνεται στο έντυπο για τον μεταφορέα.'
                : 'Μετά την έκδοση το παραστατικό δεν αλλάζει. Διόρθωση γίνεται μόνο με πιστωτικό.'}
          </span>
        </div>
      </div>
    </PickerModal>
  );
}
