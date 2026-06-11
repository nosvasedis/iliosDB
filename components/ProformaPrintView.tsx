import React, { useMemo } from 'react';
import { ProformaDocument, ProformaDocumentLine } from '../types';
import { getLegalDocumentDisplayNumber, PAYMENT_METHOD_LABELS } from '../utils/legalDocuments';

interface ProformaPrintViewProps {
  document: ProformaDocument;
  lines: ProformaDocumentLine[];
}

const money = (value: number | null | undefined) =>
  `${Number(value || 0).toLocaleString('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR`;

const date = (value?: string | null) => {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('el-GR');
};

const partyAddress = (party: ProformaDocument['issuer'] | ProformaDocument['counterpart']) => {
  const address = party.address;
  if (!address) return '-';
  return [address.street, address.number, address.postal_code, address.city].filter(Boolean).join(' ') || '-';
};

const partyName = (party: ProformaDocument['issuer'] | ProformaDocument['counterpart']) =>
  ('business_name' in party ? party.business_name : undefined) || party.name || '-';

const ProformaPrintView: React.FC<ProformaPrintViewProps> = ({ document, lines }) => {
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
          <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500 font-bold">IliosERP</div>
          <h1 className="text-3xl font-black mt-2">Προτιμολόγιο</h1>
          <div className="mt-2 text-xl font-black">{getLegalDocumentDisplayNumber(document)}</div>
          <div className="mt-1 text-sm text-slate-600">Ημερομηνία: {date(document.issue_date)}</div>
          {document.valid_until && <div className="mt-1 text-sm text-slate-600">Ισχύει έως: {date(document.valid_until)}</div>}
        </div>
        <div className="text-right text-sm">
          <div className="font-black text-lg">{partyName(document.issuer)}</div>
          <div>ΑΦΜ: {document.issuer.vat_number || '-'}</div>
          <div>{partyAddress(document.issuer)}</div>
          {document.issuer.phone && <div>Τηλ. {document.issuer.phone}</div>}
          {document.issuer.email && <div>{document.issuer.email}</div>}
        </div>
      </header>

      <section className="mt-5 rounded-lg border-2 border-sky-300 bg-sky-50 p-4 text-center text-sm font-black text-sky-900 legal-print-break-inside">
        ΔΕΝ ΕΙΝΑΙ ΝΟΜΙΜΟ ΦΟΡΟΛΟΓΙΚΟ ΠΑΡΑΣΤΑΤΙΚΟ. Δεν έχει διαβιβαστεί στη myDATA και δεν φέρει MARK ή QR ΑΑΔΕ.
      </section>

      <section className="grid grid-cols-2 gap-5 mt-6 legal-print-break-inside">
        <div className="border border-slate-200 rounded-lg p-4">
          <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500 font-bold">Πελάτης</div>
          <div className="mt-2 text-lg font-black">{partyName(document.counterpart)}</div>
          <div className="text-sm">ΑΦΜ: {document.counterpart.vat_number || '-'}</div>
          <div className="text-sm">Χώρα: {document.counterpart.country || 'GR'} | Υποκ.: {document.counterpart.branch ?? 0}</div>
          <div className="text-sm">{partyAddress(document.counterpart)}</div>
          {document.counterpart.phone && <div className="text-sm">Τηλ. {document.counterpart.phone}</div>}
          {document.counterpart.email && <div className="text-sm">{document.counterpart.email}</div>}
        </div>
        <div className="border border-slate-200 rounded-lg p-4">
          <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500 font-bold">Στοιχεία</div>
          <div className="mt-2 text-sm"><span className="font-bold">Κατάσταση:</span> {document.status === 'void' ? 'Ακυρωμένο' : document.status === 'converted' ? 'Μετατράπηκε σε παραστατικό' : 'Πρόχειρο'}</div>
          <div className="text-sm"><span className="font-bold">Πληρωμή:</span> {PAYMENT_METHOD_LABELS[document.payment_method_code] || document.payment_method_code}</div>
          {document.notes && <div className="mt-2 text-sm"><span className="font-bold">Σημειώσεις:</span> {document.notes}</div>}
        </div>
      </section>

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
          {document.vat_exemption_category && <div><span className="font-bold">Απαλλαγή ΦΠΑ:</span> {document.vat_exemption_category}</div>}
          <div>Το προτιμολόγιο μπορεί να μετατραπεί σε κανονικό πρόχειρο παραστατικό πριν από έκδοση.</div>
        </div>
        <div className="w-80 text-sm">
          {vatGroups.map(([category, totals]) => (
            <div key={category} className="flex justify-between border-b border-slate-200 py-1">
              <span>ΦΠΑ κατηγορία {category}</span>
              <span>{money(totals.vat)}</span>
            </div>
          ))}
          <div className="flex justify-between py-2"><span>Καθαρή αξία</span><span>{money(document.totals.net)}</span></div>
          <div className="flex justify-between py-2"><span>Σύνολο ΦΠΑ</span><span>{money(document.totals.vat)}</span></div>
          <div className="flex justify-between py-3 border-t-2 border-slate-900 text-lg font-black">
            <span>Σύνολο</span>
            <span>{money(document.totals.gross)}</span>
          </div>
        </div>
      </section>
    </div>
  );
};

export default ProformaPrintView;
