import { describe, expect, it } from 'vitest';
import {
  PRINT_SUBSEQUENT_PAGE_TOP_INSET,
  PRINT_SUBSEQUENT_PAGE_TOP_MARGIN_STYLES,
  PRINT_INVOICE_DOCUMENT_STYLES,
  buildPrintIframeOnloadScript,
  printExplicitPageInsetStyles,
  printSubsequentPageTopMarginWithBase,
} from '../../utils/printPageStyles';

describe('printPageStyles', () => {
  it('defines a 2cm inset for pages after the first', () => {
    expect(PRINT_SUBSEQUENT_PAGE_TOP_INSET).toBe('2cm');
    expect(PRINT_SUBSEQUENT_PAGE_TOP_MARGIN_STYLES).toContain('@page :first');
    expect(PRINT_SUBSEQUENT_PAGE_TOP_MARGIN_STYLES).toContain('margin-top: 2cm');
    expect(PRINT_SUBSEQUENT_PAGE_TOP_MARGIN_STYLES).not.toContain(':not(:first)');
  });

  it('uses A4 and first-page reset for invoice documents', () => {
    expect(PRINT_INVOICE_DOCUMENT_STYLES).toContain('size: A4 portrait');
    expect(PRINT_INVOICE_DOCUMENT_STYLES).toContain('@page :first');
  });

  it('adds the inset on top of an existing @page top margin', () => {
    const css = printSubsequentPageTopMarginWithBase('10mm');
    expect(css).toContain('calc(10mm + 2cm)');
    expect(css).toContain('@page :first');
    expect(css).toContain('margin-top: 10mm !important');
  });

  it('insets explicit fixed-height print pages via padding', () => {
    const css = printExplicitPageInsetStyles('.catalog-page', '277mm');
    expect(css).toContain('.catalog-page + .catalog-page');
    expect(css).toContain('padding-top: 2cm');
    expect(css).toContain('calc(277mm - 2cm)');
  });

  it('builds a print iframe onload script that injects styles before printing', () => {
    const script = buildPrintIframeOnloadScript('@media print { @page { margin-top: 2cm; } }');
    expect(script).toContain("document.createElement('style')");
    expect(script).toContain('window.print');
    expect(script).toContain('@media print { @page { margin-top: 2cm; } }');
  });
});
