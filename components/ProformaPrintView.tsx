import React from 'react';
import { ProformaDocument, ProformaDocumentLine } from '../types';
import { getLegalDocumentDisplayNumber, PAYMENT_METHOD_LABELS } from '../utils/legalDocuments';
import {
  LegalPrintFooter,
  LegalPrintHeader,
  LegalPrintLinesTable,
  LegalPrintPage,
  LegalPrintPartyGrid,
  LegalPrintTotalsSection,
  formatPrintDate,
} from './legal/legalPrintShared';

interface ProformaPrintViewProps {
  document: ProformaDocument;
  lines: ProformaDocumentLine[];
}

const ProformaPrintView: React.FC<ProformaPrintViewProps> = ({ document, lines }) => {
  const displayNumber = getLegalDocumentDisplayNumber(document);

  return (
    <LegalPrintPage>
      <LegalPrintHeader
        title="Προτιμολόγιο"
        subtitle={displayNumber}
        issuer={document.issuer}
        series={document.series}
        aa={document.aa}
        issueDate={document.issue_date}
        statusBadge={(
          <span className="inline-flex rounded border border-sky-300 bg-sky-50 px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-sky-900">
            Δεν είναι νόμιμο παραστατικό
          </span>
        )}
      />

      <section className="legal-print-break-inside mb-4 rounded-lg border-2 border-amber-300 bg-amber-50 px-3 py-2 text-center text-[10px] font-bold leading-snug text-amber-950">
        Δεν έχει διαβιβαστεί στη myDATA · χωρίς MARK, UID ή QR ΑΑΔΕ · δεν αντικαθιστά τιμολόγιο
      </section>

      <LegalPrintPartyGrid
        issuer={document.issuer}
        counterpart={document.counterpart}
        counterpartTitle="Πελάτης"
      />

      <section className="legal-print-break-inside mb-4 grid grid-cols-3 gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-[10px]">
        <div>
          <span className="font-bold uppercase tracking-wide text-slate-500">Κατάσταση</span>
          <div className="mt-0.5 font-semibold text-slate-900">
            {document.status === 'void' ? 'Ακυρωμένο' : document.status === 'converted' ? 'Μετατράπηκε σε παραστατικό' : 'Πρόχειρο'}
          </div>
        </div>
        <div>
          <span className="font-bold uppercase tracking-wide text-slate-500">Πληρωμή</span>
          <div className="mt-0.5 font-semibold text-slate-900">
            {PAYMENT_METHOD_LABELS[document.payment_method_code] || document.payment_method_code}
          </div>
        </div>
        <div>
          <span className="font-bold uppercase tracking-wide text-slate-500">Ισχύει έως</span>
          <div className="mt-0.5 font-semibold text-slate-900">{formatPrintDate(document.valid_until)}</div>
        </div>
      </section>

      <LegalPrintLinesTable lines={lines} currency={document.currency} />

      <LegalPrintTotalsSection
        lines={lines}
        net={document.totals.net}
        vat={document.totals.vat}
        gross={document.totals.gross}
        currency={document.currency}
        vatExemptionCategory={document.vat_exemption_category}
        notes={document.notes ? (
          <div><span className="font-bold text-slate-900">Σημειώσεις:</span> {document.notes}</div>
        ) : (
          <div className="text-slate-500">Μπορεί να μετατραπεί σε κανονικό πρόχειρο παραστατικό πριν την έκδοση.</div>
        )}
      />

      <LegalPrintFooter>
        Προτιμολόγιο εσωτερικής χρήσης IliosERP. Για φορολογική ισχύ απαιτείται έκδοση τιμολογίου και διαβίβαση στη myDATA.
      </LegalPrintFooter>
    </LegalPrintPage>
  );
};

export default ProformaPrintView;
