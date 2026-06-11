import React from 'react';
import { LegalDocument, LegalDocumentLine } from '../types';
import {
  formatAadeIncomeCategoryLabel,
  formatAadeIncomeTypeLabel,
  LEGAL_DOCUMENT_KIND_LABELS,
  PAYMENT_METHOD_LABELS,
} from '../utils/legalDocuments';
import {
  LegalPrintAadePanel,
  LegalPrintDeliverySection,
  LegalPrintFooter,
  LegalPrintHeader,
  LegalPrintLinesTable,
  LegalPrintPage,
  LegalPrintPartyGrid,
  LegalPrintTotalsSection,
  formatPrintMoney,
} from './legal/legalPrintShared';

interface LegalDocumentPrintViewProps {
  document: LegalDocument;
  lines: LegalDocumentLine[];
}

const LegalDocumentPrintView: React.FC<LegalDocumentPrintViewProps> = ({ document, lines }) => {
  const kindLabel = LEGAL_DOCUMENT_KIND_LABELS[document.document_kind];
  const revenueClassificationText = document.revenue_classification
    .map((item) => `${formatAadeIncomeCategoryLabel(item.classification_category)} · ${formatAadeIncomeTypeLabel(item.classification_type)} ${formatPrintMoney(item.amount, document.currency)}`)
    .join(', ');

  return (
    <LegalPrintPage>
      <LegalPrintHeader
        title={kindLabel}
        subtitle="Νόμιμο φορολογικό παραστατικό · myDATA"
        issuer={document.issuer}
        series={document.series}
        aa={document.aa}
        issueDate={document.issue_date}
        documentTypeCode={document.aade_document_type}
        statusBadge={document.status === 'cancelled' ? (
          <span className="inline-flex rounded border border-red-300 bg-red-50 px-2 py-1 text-[10px] font-bold text-red-700">
            ΑΚΥΡΩΜΕΝΟ · MARK {document.cancellation_mark || '-'}
          </span>
        ) : undefined}
      />

      <LegalPrintPartyGrid issuer={document.issuer} counterpart={document.counterpart} />

      <LegalPrintAadePanel
        qrUrl={document.qr_url}
        mark={document.aade_mark}
        uid={document.aade_uid}
        authenticationCode={document.authentication_code}
        documentType={document.aade_document_type}
      />

      {document.delivery && <LegalPrintDeliverySection delivery={document.delivery} />}

      <LegalPrintLinesTable lines={lines} currency={document.currency} />

      <LegalPrintTotalsSection
        lines={lines}
        net={document.totals.net}
        vat={document.totals.vat}
        gross={document.totals.gross}
        currency={document.currency}
        paymentMethodLabel={PAYMENT_METHOD_LABELS[document.payment_method_code] || String(document.payment_method_code)}
        vatExemptionCategory={document.vat_exemption_category}
        revenueClassificationText={revenueClassificationText}
      />

      <LegalPrintFooter>
        Το παρόν εκτυπώνεται από το IliosERP μετά από επιτυχή διαβίβαση στη myDATA.
        Το QR, το MARK και ο κωδικός authentication επιβεβαιώνουν την καταχώρηση στην ΑΑΔΕ.
      </LegalPrintFooter>
    </LegalPrintPage>
  );
};

export default LegalDocumentPrintView;
