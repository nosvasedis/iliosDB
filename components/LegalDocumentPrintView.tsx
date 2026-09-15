import React from 'react';
import { LegalDocument, LegalDocumentLine } from '../types';
import {
  formatAadeIncomeCategoryLabel,
  formatAadeIncomeTypeLabel,
  isOfficialLegalDocumentPrint,
  LEGAL_DOCUMENT_KIND_LABELS,
  PAYMENT_METHOD_LABELS,
} from '../utils/legalDocuments';
import {
  LegalPrintAadePanel,
  LegalPrintHeader,
  LegalPrintInfoGrid,
  LegalPrintLinesTable,
  LegalPrintPage,
  LegalPrintTotalsSection,
  formatPrintMoney,
} from './legal/legalPrintShared';
import { getLegalDocumentDisplayNumber } from '../utils/legalDocuments';

interface LegalDocumentPrintViewProps {
  document: LegalDocument;
  lines: LegalDocumentLine[];
}

const LegalDocumentPrintView: React.FC<LegalDocumentPrintViewProps> = ({ document, lines }) => {
  const kindLabel = LEGAL_DOCUMENT_KIND_LABELS[document.document_kind];
  const revenueClassificationText = document.revenue_classification
    .map((item) => `${formatAadeIncomeCategoryLabel(item.classification_category)} · ${formatAadeIncomeTypeLabel(item.classification_type)} ${formatPrintMoney(item.amount, document.currency)}`)
    .join(', ');

  const isOfficialPrint = isOfficialLegalDocumentPrint(document, lines);
  const footerText = isOfficialPrint
    ? document.status === 'cancelled'
      ? `Το παραστατικό είχε διαβιβαστεί επιτυχώς στη myDATA και στη συνέχεια ακυρώθηκε. MARK ακύρωσης: ${document.cancellation_mark || '-'}`
      : 'Το παρόν εκτυπώνεται από το αποθηκευμένο παραστατικό του IliosERP. Τα στοιχεία επαλήθευσης επιβεβαιώνουν την ηλεκτρονική έκδοση.'
    : 'Πρόχειρη εκτύπωση εσωτερικής χρήσης IliosERP. Για φορολογική ισχύ απαιτείται υποβολή και αποδοχή στη myDATA.';

  return (
    <LegalPrintPage>
      {document.environment === 'dev' && <div className="mb-3 border-2 border-amber-500 p-3 text-center font-black text-amber-900">ΔΟΚΙΜΑΣΤΙΚΟ ΠΕΡΙΒΑΛΛΟΝ · ΧΩΡΙΣ ΦΟΡΟΛΟΓΙΚΗ ΙΣΧΥ</div>}
      {document.credited_document_id && <div className="mb-2 text-sm">Πιστωτικό για το αρχικό παραστατικό με MARK {document.correlated_mark}</div>}
      <LegalPrintHeader
        title={kindLabel.toUpperCase()}
        documentNumber={getLegalDocumentDisplayNumber(document)}
        issuer={document.issuer}
        series={document.series}
        aa={document.aa}
        issueDate={document.issue_date}
        issueTime={document.submitted_at || document.created_at}
        statusBadge={document.status === 'cancelled' ? (
          <span className="inline-flex rounded border border-red-300 bg-red-50 px-2 py-1 text-[11px] font-bold text-red-700">
            ΑΚΥΡΩΜΕΝΟ · MARK {document.cancellation_mark || '-'}
          </span>
        ) : !isOfficialPrint ? (
          <span className="inline-flex rounded border border-amber-300 bg-amber-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-950">
            Πρόχειρο — όχι νόμιμο παραστατικό
          </span>
        ) : undefined}
      />

      {!isOfficialPrint && (
        <section className="legal-print-break-inside mb-3 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-center text-[10px] font-bold leading-snug text-amber-950">
          Δεν έχει διαβιβαστεί στη myDATA · χωρίς MARK, UID ή QR ΑΑΔΕ · δεν αντικαθιστά εκδοθέν τιμολόγιο
        </section>
      )}

      <LegalPrintInfoGrid
        counterpart={document.counterpart}
        delivery={document.delivery}
        paymentMethodLabel={PAYMENT_METHOD_LABELS[document.payment_method_code] || String(document.payment_method_code)}
      />

      <LegalPrintLinesTable lines={lines} currency={document.currency} />

      <LegalPrintTotalsSection
        lines={lines}
        net={document.totals.net}
        vat={document.totals.vat}
        gross={document.totals.gross}
        currency={document.currency}
        paymentMethodLabel={PAYMENT_METHOD_LABELS[document.payment_method_code] || String(document.payment_method_code)}
        vatExemptionCategory={document.vat_exemption_category}
        vatExemptionLegalNote={document.vat_exemption_legal_note}
        documentTypeCode={document.aade_document_type}
        revenueClassificationText={revenueClassificationText}
        delivery={document.delivery}
        footerText={footerText}
      />

      <LegalPrintAadePanel
        qrUrl={document.qr_url}
        mark={document.aade_mark}
        uid={document.aade_uid}
        authenticationCode={document.authentication_code}
        provider={document.provider}
      />
    </LegalPrintPage>
  );
};

export default LegalDocumentPrintView;
