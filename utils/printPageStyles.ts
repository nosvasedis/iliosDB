/**
 * Extra top margin on printed pages 2+ to compensate for physical printer
 * non-printable areas. Mirrors setting ~1.5cm top margin in Chrome's print dialog.
 * Page 1 is unchanged. Does not alter document layout — only @page margins.
 */
export const PRINT_PRINTER_TOP_SAFE_INSET = '1.5cm';

/**
 * Injected last in the print iframe, immediately before window.print().
 * Uses @page + @page :first (well supported in Chrome); :left/:right as fallback.
 * No !important so views with their own @page top margin can override via calc().
 * Do NOT use for barcode labels — use PRINT_LABEL_PAGE_MARGIN_CSS instead.
 */
export const PRINT_IFRAME_PAGE_MARGIN_RULES = `
  @page {
    margin-top: ${PRINT_PRINTER_TOP_SAFE_INSET};
  }
  @page :left {
    margin-top: ${PRINT_PRINTER_TOP_SAFE_INSET};
  }
  @page :right {
    margin-top: ${PRINT_PRINTER_TOP_SAFE_INSET};
  }
  @page :first {
    margin-top: 0;
  }
`;

export const PRINT_IFRAME_PAGE_MARGIN_CSS = `@media print {
  ${PRINT_IFRAME_PAGE_MARGIN_RULES}
}`;

/** Zero margins on every page — wholesale (standard) and retail barcode labels only. */
export const PRINT_LABEL_PAGE_MARGIN_CSS = `@media print {
  @page {
    size: auto;
    margin: 0 !important;
  }
}`;

/** Raw zero-margin @page rule for embedding in an existing `@media print` block. */
export const PRINT_LABEL_PAGE_MARGIN_RULES = `
  @page {
    size: auto;
    margin: 0 !important;
  }
`;

export const isLabelPrintJob = (
    printItems: ReadonlyArray<{ format?: 'standard' | 'simple' | 'retail' }>,
): boolean => printItems.length > 0;

/** For views that already define a non-zero @page top margin on every page. */
export const printPageMarginWithBaseTop = (baseTopMargin: string) => `@media print {
  @page {
    margin-top: calc(${baseTopMargin} + ${PRINT_PRINTER_TOP_SAFE_INSET}) !important;
  }
  @page :left {
    margin-top: calc(${baseTopMargin} + ${PRINT_PRINTER_TOP_SAFE_INSET}) !important;
  }
  @page :right {
    margin-top: calc(${baseTopMargin} + ${PRINT_PRINTER_TOP_SAFE_INSET}) !important;
  }
  @page :first {
    margin-top: ${baseTopMargin} !important;
  }
}`;

/** Photo catalog uses fixed-height pages — inset inside the page box instead of @page. */
export const PRINT_CATALOG_CONTINUATION_CSS = `@media print {
  .catalog-page + .catalog-page {
    padding-top: ${PRINT_PRINTER_TOP_SAFE_INSET};
    height: calc(277mm - ${PRINT_PRINTER_TOP_SAFE_INSET});
    box-sizing: border-box;
  }
}`;

export const buildPrintIframeOnloadScript = (marginCss?: string) => `
window.onload = function() {
  ${marginCss ? `var style = document.createElement('style');
  style.id = 'ilios-print-page-margin';
  style.textContent = ${JSON.stringify(marginCss)};
  document.head.appendChild(style);` : ''}
  setTimeout(function() {
    window.focus();
    window.print();
  }, 500);
};
`;
