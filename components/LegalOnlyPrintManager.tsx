import React, { useEffect, useRef } from 'react';
import { usePrint } from './PrintContext';
import LegalDocumentPrintView from './LegalDocumentPrintView';
import ProformaPrintView from './ProformaPrintView';
import {
  buildPrintIframeOnloadScript,
  PRINT_IFRAME_PAGE_MARGIN_CSS,
} from '../utils/printPageStyles';

const sanitizeFilename = (name: string) => name.replace(/[<>:"/\\|?*]+/g, '_').replace(/\s+/g, '_');

const LegalOnlyPrintManager: React.FC = () => {
  const {
    legalDocumentToPrint,
    proformaToPrint,
    setLegalDocumentToPrint,
    setProformaToPrint,
  } = usePrint();
  const printContainerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const shouldPrint = legalDocumentToPrint || proformaToPrint;
    if (!shouldPrint) return;

    const timer = setTimeout(() => {
      const printContent = printContainerRef.current;
      const iframe = iframeRef.current;
      if (!printContent || !iframe) return;

      const iframeDoc = iframe.contentWindow?.document;
      if (!iframeDoc) return;

      const dateStr = new Date().toISOString().split('T')[0];
      let docTitle = 'Parastatiko_Print';
      if (legalDocumentToPrint) {
        const legalNumber = legalDocumentToPrint.document.series && legalDocumentToPrint.document.aa
          ? `${legalDocumentToPrint.document.series}_${legalDocumentToPrint.document.aa}`
          : legalDocumentToPrint.document.id.slice(0, 8);
        docTitle = `Legal_${legalNumber}_${dateStr}`;
      } else if (proformaToPrint) {
        const proformaNumber = proformaToPrint.document.series && proformaToPrint.document.aa
          ? `${proformaToPrint.document.series}_${proformaToPrint.document.aa}`
          : proformaToPrint.document.id.slice(0, 8);
        docTitle = `Proforma_${proformaNumber}_${dateStr}`;
      }

      const previousWindowTitle = document.title;
      let titleRestored = false;
      const restoreWindowTitle = () => {
        if (!titleRestored) {
          document.title = previousWindowTitle;
          titleRestored = true;
        }
      };

      document.title = sanitizeFilename(docTitle);

      const cleanup = () => {
        setLegalDocumentToPrint(null);
        setProformaToPrint(null);
        restoreWindowTitle();
      };

      iframeDoc.open();

      let styles = '';
      document.querySelectorAll('style, link[rel="stylesheet"]').forEach((el) => {
        styles += el.outerHTML;
      });

      iframeDoc.write(`
        <html>
          <head>
            <title>${docTitle}</title>
            ${styles}
            <style>
              body { background: white !important; margin: 0; padding: 0; }
              .print-view { display: block !important; }
              @media print {
                @page { size: auto; margin-left: 0; margin-right: 0; margin-bottom: 0; }
                html, body { height: 100%; margin: 0 !important; padding: 0 !important; }
              }
              * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
            </style>
          </head>
          <body>
            <div class="print-view">
              ${printContent.innerHTML}
            </div>
            <script>
              ${buildPrintIframeOnloadScript(PRINT_IFRAME_PAGE_MARGIN_CSS)}
            </script>
          </body>
        </html>
      `);
      iframeDoc.close();

      const handleAfterPrint = () => {
        cleanup();
        window.removeEventListener('focus', handleAfterPrint);
      };
      window.addEventListener('focus', handleAfterPrint, { once: true });
      setTimeout(cleanup, 30000);
    }, 800);

    return () => clearTimeout(timer);
  }, [legalDocumentToPrint, proformaToPrint, setLegalDocumentToPrint, setProformaToPrint]);

  return (
    <>
      <div ref={printContainerRef} className="print-view">
        {legalDocumentToPrint && (
          <LegalDocumentPrintView
            document={legalDocumentToPrint.document}
            lines={legalDocumentToPrint.lines}
          />
        )}
        {proformaToPrint && (
          <ProformaPrintView
            document={proformaToPrint.document}
            lines={proformaToPrint.lines}
          />
        )}
      </div>
      <iframe
        ref={iframeRef}
        id="print-iframe"
        style={{ position: 'absolute', width: 0, height: 0, border: 'none', visibility: 'hidden' }}
        title="Print Bridge"
      />
    </>
  );
};

export default LegalOnlyPrintManager;
