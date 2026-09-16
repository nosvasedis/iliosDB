import React from 'react';
import { ProformaDocument, ProformaDocumentLine } from '../types';
import { isInspectionModeActive } from '../lib/inspectionMode';
import { getLegalDocumentDisplayNumber, PAYMENT_METHOD_LABELS } from '../utils/legalDocuments';
import {
  LegalPrintHeader,
  LegalPrintInfoGrid,
  LegalPrintLinesTable,
  LegalPrintPage,
  LegalPrintFooter,
  LegalPrintTotalsSection,
  formatPrintDate,
} from './legal/legalPrintShared';

interface ProformaPrintViewProps {
  document: ProformaDocument;
  lines: ProformaDocumentLine[];
}

const ProformaPrintView: React.FC<ProformaPrintViewProps> = ({ document, lines }) => {
  const displayNumber = getLegalDocumentDisplayNumber(document);
  const footerText = isInspectionModeActive()
    ? 'Προτιμολόγιο εσωτερικής χρήσης Συστήματος Παραστατικών. Για φορολογική ισχύ απαιτείται έκδοση τιμολογίου και διαβίβαση στη myDATA.'
    : 'Προτιμολόγιο εσωτερικής χρήσης IliosERP. Για φορολογική ισχύ απαιτείται έκδοση τιμολογίου και διαβίβαση στη myDATA.';

  return (
    <LegalPrintPage>
      <LegalPrintHeader
        title="ΠΡΟΤΙΜΟΛΟΓΙΟ"
        documentNumber={displayNumber}
        issuer={document.issuer}
        series={document.series}
        aa={document.aa}
        issueDate={document.issue_date}
        issueTime={document.created_at}
        statusBadge={(
          <span className="inline-flex rounded border border-sky-300 bg-sky-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-sky-900">
            Δεν είναι νόμιμο παραστατικό
          </span>
        )}
      />

      <section className="legal-print-break-inside mb-3 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-center text-[10px] font-bold leading-snug text-amber-950">
        Δεν έχει διαβιβαστεί στη myDATA · χωρίς MARK, UID ή QR ΑΑΔΕ · δεν αντικαθιστά τιμολόγιο
      </section>

      <LegalPrintInfoGrid
        counterpart={document.counterpart}
        counterpartTitle="Πελάτης"
        paymentMethodLabel={PAYMENT_METHOD_LABELS[document.payment_method_code] || String(document.payment_method_code)}
        validUntil={document.valid_until}
        extraMeta={(
          <div className="mt-1 text-[9.5px] text-slate-600">
            <span className="font-bold text-slate-500">Κατάσταση: </span>
            {document.status === 'void' ? 'Ακυρωμένο' : document.status === 'converted' ? 'Μετατράπηκε' : 'Πρόχειρο'}
          </div>
        )}
      />

      <LegalPrintLinesTable lines={lines} currency={document.currency} />

      <LegalPrintTotalsSection
        lines={lines}
        net={document.totals.net}
        vat={document.totals.vat}
        gross={document.totals.gross}
        currency={document.currency}
        vatExemptionCategory={document.vat_exemption_category}
        vatExemptionLegalNote={document.vat_exemption_legal_note}
        notes={document.notes ? (
          <div><span className="font-bold text-slate-900">Σημειώσεις:</span> {document.notes}</div>
        ) : (
          <div className="text-slate-500">Μπορεί να μετατραπεί σε κανονικό πρόχειρο παραστατικό πριν την έκδοση.</div>
        )}
        footerText={footerText}
      />

      <LegalPrintFooter>Προτιμολόγιο - όχι φορολογικό παραστατικό</LegalPrintFooter>
    </LegalPrintPage>
  );
};

export default ProformaPrintView;
