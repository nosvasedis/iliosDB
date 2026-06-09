import { describe, expect, it } from 'vitest';
import {
  PRINT_IFRAME_PAGE_MARGIN_CSS,
  PRINT_PRINTER_TOP_SAFE_INSET,
  printPageMarginWithBaseTop,
} from '../../utils/printPageStyles';

describe('printPageStyles', () => {
  it('defines a 2cm printer-safe inset using the :first page pattern', () => {
    expect(PRINT_PRINTER_TOP_SAFE_INSET).toBe('2cm');
    expect(PRINT_IFRAME_PAGE_MARGIN_CSS).toContain('@page :first');
    expect(PRINT_IFRAME_PAGE_MARGIN_CSS).toContain('margin-top: 0');
    expect(PRINT_IFRAME_PAGE_MARGIN_CSS).toContain('margin-top: 2cm');
    expect(PRINT_IFRAME_PAGE_MARGIN_CSS).not.toContain(':not(:first)');
  });

  it('adds the inset on top of an existing @page top margin', () => {
    const css = printPageMarginWithBaseTop('10mm');
    expect(css).toContain('calc(10mm + 2cm)');
    expect(css).toContain('@page :first');
    expect(css).toContain('margin-top: 10mm !important');
  });
});
