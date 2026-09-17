import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { LegalDocument, LegalDocumentLine } from '../types';
import {
  formatAadeIncomeCategoryLabel,
  formatAadeIncomeTypeLabel,
  isOfficialLegalDocumentPrint,
  LEGAL_DOCUMENT_KIND_LABELS,
  PAYMENT_METHOD_LABELS,
  documentIncludesDeliveryNote,
} from '../utils/legalDocuments';
import {
  LegalPrintAadePanel,
  LegalPrintHeader,
  LegalPrintInfoGrid,
  LegalPrintLinesTable,
  LegalPrintPhysicalPage,
  LegalPrintTotalsSection,
  LEGAL_PRINT_CSS,
  formatPrintMoney,
  paginateLegalPrintRows,
  type LegalPrintRowSlice,
} from './legal/legalPrintShared';
import { getLegalDocumentDisplayNumber } from '../utils/legalDocuments';

interface LegalDocumentPrintViewProps {
  document: LegalDocument;
  lines: LegalDocumentLine[];
}

const slicesAreEqual = (left: LegalPrintRowSlice[], right: LegalPrintRowSlice[]) => (
  left.length === right.length
  && left.every((slice, index) => (
    slice.startIndex === right[index]?.startIndex
    && slice.endIndex === right[index]?.endIndex
  ))
);

const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

const slicesCoverEveryLine = (slices: LegalPrintRowSlice[], lineCount: number) => {
  if (slices.length === 0 || slices[0].startIndex !== 0) return false;
  if (slices[slices.length - 1].endIndex !== lineCount) return false;
  return slices.every((slice, index) => (
    slice.startIndex <= slice.endIndex
    && (index === 0 || slice.startIndex === slices[index - 1].endIndex)
  ));
};

const LegalDocumentPrintView: React.FC<LegalDocumentPrintViewProps> = ({ document, lines }) => {
  const printRootRef = useRef<HTMLDivElement>(null);
  const [pageSlices, setPageSlices] = useState<LegalPrintRowSlice[]>([
    { startIndex: 0, endIndex: lines.length },
  ]);
  const [paginationReady, setPaginationReady] = useState(false);
  const renderedSlices = slicesCoverEveryLine(pageSlices, lines.length)
    ? pageSlices
    : [{ startIndex: 0, endIndex: lines.length }];
  const kindLabel = LEGAL_DOCUMENT_KIND_LABELS[document.document_kind];
  const revenueClassificationText = document.revenue_classification
    .map((item) => `${formatAadeIncomeCategoryLabel(item.classification_category)} · ${formatAadeIncomeTypeLabel(item.classification_type)} ${formatPrintMoney(item.amount, document.currency)}`)
    .join(', ');

  const isOfficialPrint = isOfficialLegalDocumentPrint(document, lines);
  const footerText = isOfficialPrint
    ? document.status === 'cancelled'
      ? `Το παραστατικό είχε διαβιβαστεί επιτυχώς στη myDATA και στη συνέχεια ακυρώθηκε. MARK ακύρωσης: ${document.cancellation_mark || '-'}`
      : null
    : 'Πρόχειρη εκτύπωση εσωτερικής χρήσης IliosERP. Για φορολογική ισχύ απαιτείται υποβολή και αποδοχή στη myDATA.';

  const readPagination = useCallback((): LegalPrintRowSlice[] | null => {
    const root = printRootRef.current;
    if (!root || typeof window === 'undefined') return null;

    const firstPage = root.querySelector<HTMLElement>('.legal-print-physical-page');
    const firstPageContent = root.querySelector<HTMLElement>('[data-legal-print-first-content]');
    const firstLinesSection = root.querySelector<HTMLElement>('.legal-print-lines-table');
    const finalSection = root.querySelector<HTMLElement>('[data-legal-print-final-section]');
    if (!firstPage || !firstPageContent || !firstLinesSection || !finalSection) return null;

    const pageStyle = window.getComputedStyle(firstPage);
    const paddingTop = Number.parseFloat(pageStyle.paddingTop) || 0;
    const paddingBottom = Number.parseFloat(pageStyle.paddingBottom) || 0;
    const pageContentHeight = firstPage.getBoundingClientRect().height - paddingTop - paddingBottom;

    const indexedRows = Array.from(root.querySelectorAll<HTMLElement>('[data-legal-print-line-index]'))
      .map((row) => ({
        index: Number(row.dataset.legalPrintLineIndex),
        height: row.getBoundingClientRect().height,
      }))
      .filter((row) => Number.isInteger(row.index))
      .sort((left, right) => left.index - right.index);
    if (indexedRows.length !== lines.length) return null;

    const firstTableRowsHeight = Array.from(firstLinesSection.querySelectorAll<HTMLElement>('tbody tr'))
      .reduce((total, row) => total + row.getBoundingClientRect().height, 0);
    const tableOverhead = Math.max(
      0,
      firstLinesSection.getBoundingClientRect().height - firstTableRowsHeight,
    );

    return paginateLegalPrintRows({
      rowHeights: indexedRows.map((row) => row.height),
      pageContentHeight,
      firstPageFixedHeight: firstPageContent.getBoundingClientRect().height + tableOverhead,
      continuationPageFixedHeight: tableOverhead,
      finalSectionHeight: finalSection.getBoundingClientRect().height,
      safetyGap: 4,
    });
  }, [lines.length]);

  useIsomorphicLayoutEffect(() => {
    if (typeof window === 'undefined') return undefined;
    let frame = 0;
    setPaginationReady(false);

    const commitMeasuredPagination = () => {
      const nextSlices = readPagination();
      if (!nextSlices) return;
      setPageSlices((currentSlices) => (
        slicesAreEqual(currentSlices, nextSlices) ? currentSlices : nextSlices
      ));
      setPaginationReady(true);
    };
    const scheduleMeasurement = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(commitMeasuredPagination);
    };
    const handleBeforePrint = () => {
      const nextSlices = readPagination();
      if (!nextSlices) return;
      flushSync(() => {
        setPageSlices((currentSlices) => (
          slicesAreEqual(currentSlices, nextSlices) ? currentSlices : nextSlices
        ));
        setPaginationReady(true);
      });
    };

    scheduleMeasurement();
    window.addEventListener('beforeprint', handleBeforePrint);

    const observer = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(scheduleMeasurement);
    const root = printRootRef.current;
    root?.querySelectorAll<HTMLElement>(
      '[data-legal-print-first-content], .legal-print-lines-table, [data-legal-print-final-section]',
    ).forEach((element) => observer?.observe(element));

    const fontsReady = window.document.fonts?.ready;
    if (fontsReady) void fontsReady.then(scheduleMeasurement);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('beforeprint', handleBeforePrint);
      observer?.disconnect();
    };
  }, [document, lines, pageSlices, readPagination]);

  return (
    <div
      ref={printRootRef}
      className="legal-print-document"
      data-legal-print-page-count={renderedSlices.length}
      data-legal-print-pagination-ready={paginationReady ? 'true' : 'false'}
    >
      <style>{LEGAL_PRINT_CSS}</style>
      {renderedSlices.map((slice, pageIndex) => {
        const isFirstPage = pageIndex === 0;
        const isLastPage = pageIndex === renderedSlices.length - 1;
        const pageLines = lines.slice(slice.startIndex, slice.endIndex);
        const shouldRenderLinesTable = pageLines.length > 0 || (lines.length === 0 && isFirstPage);

        return (
          <LegalPrintPhysicalPage
            key={`${slice.startIndex}-${slice.endIndex}-${pageIndex}`}
            pageNumber={pageIndex + 1}
            isLastPage={isLastPage}
          >
            {isFirstPage && (
              <div className="legal-print-first-page-content" data-legal-print-first-content>
                {document.environment === 'dev' && <div className="mb-3 border-2 border-amber-500 p-3 text-center font-black text-amber-900">ΔΟΚΙΜΑΣΤΙΚΟ ΠΕΡΙΒΑΛΛΟΝ · ΧΩΡΙΣ ΦΟΡΟΛΟΓΙΚΗ ΙΣΧΥ</div>}
                <LegalPrintHeader
                  title={kindLabel.toLocaleUpperCase('el-GR')}
                  documentNumber={getLegalDocumentDisplayNumber(document)}
                  issuer={document.issuer}
                  series={document.series}
                  aa={document.aa}
                  issueDate={document.issue_date}
                  issueTime={document.submitted_at || document.created_at}
                  pageNumber={1}
                  totalPages={renderedSlices.length}
                  documentTypeDetail={document.document_kind === 'credit' && document.correlated_mark
                    ? `MARK αρχικού: ${document.correlated_mark}`
                    : undefined}
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
                  includesDeliveryNote={documentIncludesDeliveryNote(document)}
                  paymentMethodLabel={PAYMENT_METHOD_LABELS[document.payment_method_code] || String(document.payment_method_code)}
                />
              </div>
            )}

            {shouldRenderLinesTable && (
              <LegalPrintLinesTable
                lines={pageLines}
                currency={document.currency}
                startIndex={slice.startIndex}
              />
            )}

            {isLastPage && (
              <div className="legal-print-final-anchor mt-auto shrink-0 pt-0.5" data-legal-print-final-section>
                <table className="legal-print-final-section w-full table-fixed border-collapse">
                  <tbody>
                    <tr>
                      <td className="p-0 align-top">
                        <LegalPrintTotalsSection
                          lines={lines}
                          net={document.totals.net}
                          vat={document.totals.vat}
                          gross={document.totals.gross}
                          currency={document.currency}
                          paymentMethodLabel={PAYMENT_METHOD_LABELS[document.payment_method_code] || String(document.payment_method_code)}
                          vatExemptionCategory={document.vat_exemption_category}
                          vatExemptionLegalNote={document.vat_exemption_legal_note}
                          delivery={document.delivery}
                          footerText={footerText}
                        />

                        <LegalPrintAadePanel
                          qrUrl={document.qr_url}
                          mark={document.aade_mark}
                          uid={document.aade_uid}
                          authenticationCode={document.authentication_code}
                          provider={document.provider}
                          documentTypeCode={document.aade_document_type}
                          revenueClassificationText={revenueClassificationText}
                        />
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </LegalPrintPhysicalPage>
        );
      })}
    </div>
  );
};

export default LegalDocumentPrintView;
