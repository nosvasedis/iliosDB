import React, { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { LegalDocument, LegalDocumentLine } from '../types';
import {
  getLegalDocumentDisplayNumber,
  LEGAL_DOCUMENT_KIND_LABELS,
  PAYMENT_METHOD_LABELS,
} from '../utils/legalDocuments';

interface LegalDocumentPrintViewProps {
  document: LegalDocument;
  lines: LegalDocumentLine[];
}

const money = (value: number | null | undefined) =>
  `${Number(value || 0).toLocaleString('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR`;

const date = (value?: string | null) => {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('el-GR');
};

const partyAddress = (party: LegalDocument['issuer'] | LegalDocument['counterpart']) => {
  const address = party.address;
  if (!address) return '-';
  return [address.street, address.number, address.postal_code, address.city].filter(Boolean).join(' ') || '-';
};

const partyName = (party: LegalDocument['issuer'] | LegalDocument['counterpart']) =>
  ('business_name' in party ? party.business_name : undefined) || party.name || '-';

const LegalDocumentPrintView: React.FC<LegalDocumentPrintViewProps> = ({ document, lines }) => {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const displayNumber = getLegalDocumentDisplayNumber(document);
  const kindLabel = LEGAL_DOCUMENT_KIND_LABELS[document.document_kind];

  useEffect(() => {
    let active = true;
    if (!document.qr_url) {
      setQrDataUrl(null);
      return;
    }
    QRCode.toDataURL(document.qr_url, {
      margin: 1,
      width: 160,
      color: { dark: '#060b00', light: '#ffffff' },
    }).then((value) => {
      if (active) setQrDataUrl(value);
    }).catch(() => {
      if (active) setQrDataUrl(null);
    });
    return () => { active = false; };
  }, [document.qr_url]);

  const vatGroups = useMemo(() => {
    const groups = new Map<number, { net: number; vat: number }>();
    lines.forEach((line) => {
      const current = groups.get(line.vat_category) || { net: 0, vat: 0 };
      current.net += line.net_value;
      current.vat += line.vat_amount;
      groups.set(line.vat_category, current);
    });
    return Array.from(groups.entries());
  }, [lines]);

  return (
    <div className="legal-print-page bg-white text-[#060b00] px-10 py-8 print:px-8 print:py-6" style={{ fontFamily: 'Arial, sans-serif', width: '210mm', minHeight: '297mm' }}>
      <style>{`
        @media print {
          .legal-print-page { width: 210mm !important; min-height: 297mm !important; }
          .legal-print-break-inside { break-inside: avoid; page-break-inside: avoid; }
        }
      `}</style>

      <header className="flex items-start justify-between gap-8 border-b-2 border-slate-900 pb-5">
        <div>
          <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500 font-bold">Νόμιμο παραστατικό IliosERP</div>
          <h1 className="text-3xl font-black mt-2">{kindLabel}</h1>
          <div className="mt-2 text-xl font-black">{displayNumber}</div>
          <div className="mt-1 text-sm text-slate-600">Ημερομηνία έκδοσης: {date(document.issue_date)}</div>
          {document.status === 'cancelled' && (
            <div className="mt-3 inline-flex px-3 py-1 rounded border border-red-300 text-red-700 bg-red-50 text-sm font-bold">
              ΑΚΥΡΩΜΕΝΟ - MARK Ακύρωσης {document.cancellation_mark || '-'}
            </div>
          )}
        </div>
        <div className="text-right text-sm">
          <div className="font-black text-lg">{partyName(document.issuer)}</div>
          <div>ΑΦΜ: {document.issuer.vat_number || '-'}</div>
          <div>Υποκ.: {document.issuer.branch ?? 0}</div>
          <div>{partyAddress(document.issuer)}</div>
          {document.issuer.phone && <div>Τηλ. {document.issuer.phone}</div>}
          {document.issuer.email && <div>{document.issuer.email}</div>}
        </div>
      </header>

      <section className="grid grid-cols-2 gap-5 mt-6 legal-print-break-inside">
        <div className="border border-slate-200 rounded-lg p-4">
          <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500 font-bold">Λήπτης</div>
          <div className="mt-2 text-lg font-black">{partyName(document.counterpart)}</div>
          <div className="text-sm">ΑΦΜ: {document.counterpart.vat_number || '-'}</div>
          <div className="text-sm">Χώρα: {document.counterpart.country || 'GR'} | Υποκ.: {document.counterpart.branch ?? 0}</div>
          <div className="text-sm">{partyAddress(document.counterpart)}</div>
          {document.counterpart.phone && <div className="text-sm">Τηλ. {document.counterpart.phone}</div>}
          {document.counterpart.email && <div className="text-sm">{document.counterpart.email}</div>}
        </div>
        <div className="border border-slate-200 rounded-lg p-4">
          <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500 font-bold">AADE myDATA</div>
          <div className="grid grid-cols-[1fr_auto] gap-4 mt-2 items-start">
            <div className="text-sm space-y-1">
              <div><span className="font-bold">MARK:</span> {document.aade_mark || '-'}</div>
              <div><span className="font-bold">UID:</span> {document.aade_uid || '-'}</div>
              <div><span className="font-bold">Authentication:</span> {document.authentication_code || '-'}</div>
              <div><span className="font-bold">Τύπος:</span> {document.aade_document_type}</div>
            </div>
            <div className="w-32 h-32 border border-slate-200 rounded flex items-center justify-center bg-white">
              {qrDataUrl ? <img src={qrDataUrl} alt="AADE QR" className="w-28 h-28" /> : <span className="text-xs text-slate-400 text-center px-2">QR διαθέσιμο μετά την αποδοχή</span>}
            </div>
          </div>
        </div>
      </section>

      {document.delivery && (
        <section className="mt-5 border border-slate-200 rounded-lg p-4 legal-print-break-inside">
          <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500 font-bold">Διακίνηση</div>
          <div className="grid grid-cols-3 gap-4 mt-2 text-sm">
            <div><span className="font-bold">Έναρξη:</span> {date(document.delivery.dispatch_date)} {document.delivery.dispatch_time || ''}</div>
            <div><span className="font-bold">Σκοπός:</span> {document.delivery.move_purpose || '-'}</div>
            <div><span className="font-bold">Όχημα:</span> {document.delivery.vehicle_number || document.delivery.carrier_vehicle_number || '-'}</div>
            <div><span className="font-bold">Φόρτωση:</span> {[document.delivery.loading_address?.street, document.delivery.loading_address?.number, document.delivery.loading_address?.postal_code, document.delivery.loading_address?.city].filter(Boolean).join(' ') || '-'}</div>
            <div><span className="font-bold">Παράδοση:</span> {[document.delivery.delivery_address?.street, document.delivery.delivery_address?.number, document.delivery.delivery_address?.postal_code, document.delivery.delivery_address?.city].filter(Boolean).join(' ') || '-'}</div>
            <div><span className="font-bold">Μεταφορέας:</span> {document.delivery.carrier_name || 'Ίδια μέσα'}</div>
          </div>
        </section>
      )}

      <section className="mt-6">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-slate-100 border-y border-slate-300 text-left">
              <th className="py-2 px-2 w-10">#</th>
              <th className="py-2 px-2">Κωδικός</th>
              <th className="py-2 px-2">Περιγραφή</th>
              <th className="py-2 px-2 text-right">Ποσ.</th>
              <th className="py-2 px-2 text-right">Τιμή</th>
              <th className="py-2 px-2 text-right">Καθαρή</th>
              <th className="py-2 px-2 text-right">ΦΠΑ</th>
              <th className="py-2 px-2 text-right">Σύνολο</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.id} className="border-b border-slate-200 legal-print-break-inside">
                <td className="py-2 px-2 align-top">{line.line_number}</td>
                <td className="py-2 px-2 align-top font-bold">{line.item_code || `${line.sku}${line.variant_suffix || ''}`}</td>
                <td className="py-2 px-2 align-top">{line.description}</td>
                <td className="py-2 px-2 align-top text-right">{line.quantity}</td>
                <td className="py-2 px-2 align-top text-right">{money(line.unit_price)}</td>
                <td className="py-2 px-2 align-top text-right">{money(line.net_value)}</td>
                <td className="py-2 px-2 align-top text-right">{money(line.vat_amount)}</td>
                <td className="py-2 px-2 align-top text-right font-bold">{money(line.gross_value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="mt-6 flex justify-between gap-8 legal-print-break-inside">
        <div className="text-sm text-slate-700 space-y-2 max-w-xl">
          <div><span className="font-bold">Τρόπος πληρωμής:</span> {PAYMENT_METHOD_LABELS[document.payment_method_code] || document.payment_method_code}</div>
          {document.vat_exemption_category && <div><span className="font-bold">Απαλλαγή ΦΠΑ:</span> {document.vat_exemption_category}</div>}
          <div><span className="font-bold">Χαρακτηρισμοί εσόδων:</span> {document.revenue_classification.map((item) => `${item.classification_category}/${item.classification_type || '-'} ${money(item.amount)}`).join(', ')}</div>
        </div>
        <div className="w-80 text-sm">
          {vatGroups.map(([category, totals]) => (
            <div key={category} className="flex justify-between border-b border-slate-200 py-1">
              <span>ΦΠΑ κατηγορία {category}</span>
              <span>{money(totals.vat)}</span>
            </div>
          ))}
          <div className="flex justify-between py-2">
            <span>Καθαρή αξία</span>
            <span>{money(document.totals.net)}</span>
          </div>
          <div className="flex justify-between py-2">
            <span>Σύνολο ΦΠΑ</span>
            <span>{money(document.totals.vat)}</span>
          </div>
          <div className="flex justify-between py-3 border-t-2 border-slate-900 text-lg font-black">
            <span>Πληρωτέο</span>
            <span>{money(document.totals.gross)}</span>
          </div>
        </div>
      </section>

      <footer className="mt-10 pt-4 border-t border-slate-200 text-[11px] text-slate-500">
        Η εκτύπωση επιτρέπεται μόνο μετά από επιτυχή διαβίβαση στη myDATA και αποθήκευση MARK/UID/QR στο IliosERP.
      </footer>
    </div>
  );
};

export default LegalDocumentPrintView;
