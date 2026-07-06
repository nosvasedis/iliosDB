import { describe, expect, it } from 'vitest';
import {
  PRINT_IFRAME_PAGE_MARGIN_CSS,
  PRINT_LABEL_PAGE_MARGIN_CSS,
  PRINT_PRINTER_TOP_SAFE_INSET,
  isLabelPrintJob,
  printPageMarginWithBaseTop,
} from '../../utils/printPageStyles';

describe('printPageStyles', () => {
  it('defines a 1.5cm printer-safe inset using the :first page pattern', () => {
    expect(PRINT_PRINTER_TOP_SAFE_INSET).toBe('1.5cm');
    expect(PRINT_IFRAME_PAGE_MARGIN_CSS).toContain('@page :first');
    expect(PRINT_IFRAME_PAGE_MARGIN_CSS).toContain('margin-top: 0');
    expect(PRINT_IFRAME_PAGE_MARGIN_CSS).toContain('margin-top: 1.5cm');
    expect(PRINT_IFRAME_PAGE_MARGIN_CSS).not.toContain(':not(:first)');
  });

  it('keeps barcode label jobs on zero @page margins', () => {
    expect(isLabelPrintJob([{ format: 'standard' }])).toBe(true);
    expect(isLabelPrintJob([{ format: 'retail' }])).toBe(true);
    expect(isLabelPrintJob([])).toBe(false);
    expect(PRINT_LABEL_PAGE_MARGIN_CSS).toContain('margin: 0 !important');
    expect(PRINT_LABEL_PAGE_MARGIN_CSS).not.toContain('margin-top: 1.5cm');
  });

  it('adds the inset on top of an existing @page top margin', () => {
    const css = printPageMarginWithBaseTop('10mm');
    expect(css).toContain('calc(10mm + 1.5cm)');
    expect(css).toContain('@page :first');
    expect(css).toContain('margin-top: 10mm !important');
  });
});
