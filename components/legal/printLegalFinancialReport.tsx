import React from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import type { LegalFinancialReportData } from '../../features/legal/financialReport';
import { buildPrintIframeOnloadScript, printPageMarginWithBaseTop } from '../../utils/printPageStyles';
import LegalFinancialReportPrint from './LegalFinancialReportPrint';

const IFRAME_ID = 'legal-financial-report-print';
/** Releases the button if the browser never reports the dialog closing. */
const PRINT_SETTLE_TIMEOUT_MS = 15000;

const REPORT_PRINT_CSS = `
  html, body { background: white !important; margin: 0; padding: 0; }
  .print-view { display: block !important; }
  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  table { border-collapse: collapse; }
  .report-table thead { display: table-header-group; }
  .report-table tr, .report-keep { break-inside: avoid; }
  @media print {
    @page {
      size: A4;
      margin: 12mm 12mm 14mm;
      @bottom-right {
        content: "Σελίδα " counter(page) " / " counter(pages);
        font-family: sans-serif;
        font-size: 8pt;
        color: #64748b;
      }
    }
  }
`;

function renderReportHtml(data: LegalFinancialReportData): string {
  const host = document.createElement('div');
  const root = createRoot(host);
  flushSync(() => root.render(<LegalFinancialReportPrint data={data} />));
  const html = host.innerHTML;
  root.unmount();
  return html;
}

/**
 * Opens the browser print dialog, where the report is saved as a PDF.
 * It owns its iframe, so all three shells (desktop, mobile, inspection) get it
 * through the archive without any print-manager wiring.
 */
export function printLegalFinancialReport(data: LegalFinancialReportData): Promise<void> {
  document.getElementById(IFRAME_ID)?.remove();

  const iframe = document.createElement('iframe');
  iframe.id = IFRAME_ID;
  iframe.title = data.title;
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText = 'position:absolute;width:0;height:0;border:0;visibility:hidden;';
  document.body.appendChild(iframe);

  const printWindow = iframe.contentWindow;
  const printDocument = printWindow?.document;
  if (!printWindow || !printDocument) {
    iframe.remove();
    return Promise.reject(new Error('Η εκτύπωση δεν είναι διαθέσιμη σε αυτό το περιβάλλον.'));
  }

  const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
    .map((element) => element.outerHTML)
    .join('');
  const previousTitle = document.title;
  document.title = data.fileName;

  printDocument.open();
  printDocument.write(`
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${data.fileName}</title>
        ${styles}
        <style>${REPORT_PRINT_CSS}</style>
      </head>
      <body>
        <div class="print-view">${renderReportHtml(data)}</div>
        <script>${buildPrintIframeOnloadScript(printPageMarginWithBaseTop('12mm'))}</script>
      </body>
    </html>
  `);
  printDocument.close();

  return new Promise((resolve) => {
    let settled = false;
    const settle = () => {
      if (settled) return;
      settled = true;
      document.title = previousTitle;
      resolve();
    };
    // The iframe stays until the dialog closes: removing it earlier would blank the preview.
    printWindow.addEventListener('afterprint', () => {
      settle();
      iframe.remove();
    }, { once: true });
    setTimeout(settle, PRINT_SETTLE_TIMEOUT_MS);
  });
}
