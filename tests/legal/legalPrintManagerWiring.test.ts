import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const readSource = (relativePath: string) => readFileSync(resolve(__dirname, '../..', relativePath), 'utf8');

describe('legal print manager wiring', () => {
  it('ships the National Bank logo as a valid WebP print asset', () => {
    const logo = readFileSync(resolve(__dirname, '../../public/nbg-logo-black.webp'));

    expect(logo.subarray(0, 4).toString('ascii')).toBe('RIFF');
    expect(logo.subarray(8, 12).toString('ascii')).toBe('WEBP');
  });

  it.each([
    'components/LegalOnlyPrintManager.tsx',
    'components/PrintManager.tsx',
  ])('measures legal pages off-screen and waits for pagination before cloning %s', (relativePath) => {
    const source = readSource(relativePath);

    expect(source).toContain("left: '-100000px'");
    expect(source).toContain("visibility: 'hidden'");
    expect(source).toContain("[data-legal-print-pagination-ready]");
    expect(source).toContain("legalPrintPaginationReady !== 'true'");
    expect(source).not.toContain("className=\"print-view\" aria-hidden=\"true\" style={{ display: 'none' }}");
  });

  it.each([
    'components/LegalOnlyPrintManager.tsx',
    'components/PrintManager.tsx',
  ])('keeps explicit legal sheets at zero-margin A4 without injecting the generic continuation margin in %s', (relativePath) => {
    const source = readSource(relativePath);

    expect(source).toContain('size: A4; margin: 0 !important;');
    expect(source).toMatch(/legalDocumentToPrint[^\n]+undefined[^\n]+PRINT_IFRAME_PAGE_MARGIN_CSS/s);
  });
});
