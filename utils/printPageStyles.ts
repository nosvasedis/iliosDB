/**
 * Extra top space on printed pages 2+ so physical printers do not clip content.
 * Page 1 is unchanged.
 *
 * Uses `@page` + `@page :first` (not `:not(:first)`) for broad Chrome / PDF support.
 */
export const PRINT_SUBSEQUENT_PAGE_TOP_INSET = '2cm';

/**
 * Core @page rules. Injected as the last stylesheet immediately before `window.print()`.
 * `:left` / `:right` are fallbacks for engines that ignore the bare `@page` top margin on later sheets.
 */
export const PRINT_SUBSEQUENT_PAGE_TOP_MARGIN_RULE = `
  @page {
    margin-top: ${PRINT_SUBSEQUENT_PAGE_TOP_INSET} !important;
  }
  @page :left {
    margin-top: ${PRINT_SUBSEQUENT_PAGE_TOP_INSET} !important;
  }
  @page :right {
    margin-top: ${PRINT_SUBSEQUENT_PAGE_TOP_INSET} !important;
  }
  @page :first {
    margin-top: 0 !important;
  }
`;

/** Standalone stylesheet fragment — embed inside `@media print { ... }`. */
export const PRINT_SUBSEQUENT_PAGE_TOP_MARGIN_STYLES = `
@media print {
  ${PRINT_SUBSEQUENT_PAGE_TOP_MARGIN_RULE}
}
`;

/** A4 offer / invoice documents (multi-page column layouts). */
export const PRINT_INVOICE_DOCUMENT_STYLES = `
.ilios-print-continuation-page {
  padding-top: ${PRINT_SUBSEQUENT_PAGE_TOP_INSET} !important;
  break-before: page;
  page-break-before: always;
}
@media print {
  @page {
    size: A4 portrait;
    margin-left: 0 !important;
    margin-right: 0 !important;
    margin-bottom: 0 !important;
    margin-top: ${PRINT_SUBSEQUENT_PAGE_TOP_INSET} !important;
  }
  @page :left {
    margin-top: ${PRINT_SUBSEQUENT_PAGE_TOP_INSET} !important;
  }
  @page :right {
    margin-top: ${PRINT_SUBSEQUENT_PAGE_TOP_INSET} !important;
  }
  @page :first {
    margin-top: 0 !important;
  }
}
`;

/** Use when every page already shares a non-zero @page top margin (e.g. 10mm). */
export const printSubsequentPageTopMarginWithBase = (baseTopMargin: string) => `
@media print {
  @page {
    margin-top: calc(${baseTopMargin} + ${PRINT_SUBSEQUENT_PAGE_TOP_INSET}) !important;
  }
  @page :left {
    margin-top: calc(${baseTopMargin} + ${PRINT_SUBSEQUENT_PAGE_TOP_INSET}) !important;
  }
  @page :right {
    margin-top: calc(${baseTopMargin} + ${PRINT_SUBSEQUENT_PAGE_TOP_INSET}) !important;
  }
  @page :first {
    margin-top: ${baseTopMargin} !important;
  }
}
`;

/**
 * Fixed-height explicit print pages (e.g. photo catalog). Insets content inside the
 * page box instead of changing @page margins, so layout height stays consistent.
 */
export const printExplicitPageInsetStyles = (pageSelector: string, pageHeight: string) => `
@media print {
  ${pageSelector} + ${pageSelector} {
    padding-top: ${PRINT_SUBSEQUENT_PAGE_TOP_INSET};
    height: calc(${pageHeight} - ${PRINT_SUBSEQUENT_PAGE_TOP_INSET});
    box-sizing: border-box;
  }
}
`;

/** Inline script body: append print margin CSS to head, then print. */
export const buildPrintIframeOnloadScript = (marginStyles: string) => `
window.onload = function() {
  var style = document.createElement('style');
  style.id = 'ilios-print-page-inset';
  style.textContent = ${JSON.stringify(marginStyles)};
  document.head.appendChild(style);
  setTimeout(function() {
    window.focus();
    window.print();
  }, 500);
};
`;
