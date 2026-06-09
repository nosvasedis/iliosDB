import { describe, expect, it } from 'vitest';
import {
  PRINT_SUBSEQUENT_PAGE_TOP_INSET,
  PRINT_SUBSEQUENT_PAGE_TOP_MARGIN_STYLES,
  printExplicitPageInsetStyles,
  printSubsequentPageTopMarginWithBase,
} from '../../utils/printPageStyles';

describe('printPageStyles', () => {
  it('defines a 2cm inset for pages after the first', () => {
    expect(PRINT_SUBSEQUENT_PAGE_TOP_INSET).toBe('2cm');
    expect(PRINT_SUBSEQUENT_PAGE_TOP_MARGIN_STYLES).toContain('@page :not(:first)');
    expect(PRINT_SUBSEQUENT_PAGE_TOP_MARGIN_STYLES).toContain('margin-top: 2cm');
  });

  it('adds the inset on top of an existing @page top margin', () => {
    const css = printSubsequentPageTopMarginWithBase('10mm');
    expect(css).toContain('calc(10mm + 2cm)');
    expect(css).toContain('!important');
  });

  it('insets explicit fixed-height print pages via padding', () => {
    const css = printExplicitPageInsetStyles('.catalog-page', '277mm');
    expect(css).toContain('.catalog-page + .catalog-page');
    expect(css).toContain('padding-top: 2cm');
    expect(css).toContain('calc(277mm - 2cm)');
  });
});
