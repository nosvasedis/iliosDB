import React from 'react';
import { ProformaDocument, ProformaDocumentLine } from '../types';
import { getLegalDocumentDisplayNumber, PAYMENT_METHOD_LABELS } from '../utils/legalDocuments';
import {
  LegalPrintCustomerBar,
  LegalPrintFooter,
  LegalPrintHeader,
  LegalPrintLinesTable,
  LegalPrintPage,
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
        title="ΠΡΟΤΙΜΟΛΟΓΙΟ"
        documentNumber={displayNumber}
        issueDate={document.issue_date}
        statusBadge={(
          <span className="inline-flex rounded border border-sky-300 bg-sky-50 px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-sky-900">
            Δεν είναι νόμιμο παραστατικό
          </span>
        )}
      />

      <section className="legal-print-break-inside mb-3 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-center text-[9px] font-bold leading-snug text-amber-950">
        Δεν έχει διαβιβαστεί στη myDATA · χωρίς MARK, UID ή QR ΑΑΔΕ · δεν αντικαθιστά τιμολόγιο
      </section>

      <LegalPrintCustomerBar
        issuer={document.issuer}
        counterpart={document.counterpart}
        counterpartTitle="Πελάτης"
        gross={document.totals.gross}
        currency={document.currency}
        extraMeta={(
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[9px] text-slate-600">
            <span>
              <span className="font-bold text-slate-500">Κατάσταση: </span>
              {document.status === 'void' ? 'Ακυρωμένο' : document.status === 'converted' ? 'Μετατράπηκε' : 'Πρόχειρο'}
            </span>
            <span>
              <span className="font-bold text-slate-500">Πληρωμή: </span>
              {PAYMENT_METHOD_LABELS[document.payment_method_code] || document.payment_method_code}
            </span>
            {document.valid_until && (
              <span>
                <span className="font-bold text-slate-500">Ισχύει έως: </span>
                {formatPrintDate(document.valid_until)}
              </span>
            )}
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
