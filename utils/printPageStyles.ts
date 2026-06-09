/**
 * Extra top space on printed pages 2+ so physical printers do not clip content.
 * Page 1 is unchanged.
 */
export const PRINT_SUBSEQUENT_PAGE_TOP_INSET = '2cm';

/** Raw @page rule — embed inside an existing `@media print` block. */
export const PRINT_SUBSEQUENT_PAGE_TOP_MARGIN_RULE = `
  @page :not(:first) {
    margin-top: ${PRINT_SUBSEQUENT_PAGE_TOP_INSET};
  }
`;

/** Standalone stylesheet fragment for the print iframe (appended last in `<body>`). */
export const PRINT_SUBSEQUENT_PAGE_TOP_MARGIN_STYLES = `
@media print {
  ${PRINT_SUBSEQUENT_PAGE_TOP_MARGIN_RULE}
}
`;

/** Use when every page already shares a non-zero @page top margin (e.g. 10mm). */
export const printSubsequentPageTopMarginWithBase = (baseTopMargin: string) => `
@media print {
  @page :not(:first) {
    margin-top: calc(${baseTopMargin} + ${PRINT_SUBSEQUENT_PAGE_TOP_INSET}) !important;
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
