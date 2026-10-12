import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { formatCurrency, formatDecimal, formatNumber } from '../../utils/numberFormat';
import { formatCurrency as legacyFormatCurrency, formatDecimal as legacyFormatDecimal } from '../../utils/pricingEngine';
import AnalyticsPrintReport from '../../components/AnalyticsPrintReport';
import { CustomerPrintSummaryFooter } from '../../components/customerPrintShared';

describe('Greek number presentation', () => {
    it.each([
        [100000.76, '100.000,76'],
        [1234, '1.234,00'],
        [-1234567.89, '-1.234.567,89'],
        [0, '0,00'],
    ])('formats %s with Greek thousands and decimals', (value, expected) => {
        expect(formatDecimal(value)).toBe(expected);
        expect(formatCurrency(value)).toBe(`${expected}\u00a0€`);
        expect(legacyFormatCurrency(value)).toBe(formatCurrency(value));
        expect(legacyFormatDecimal(value)).toBe(expected);
    });

    it('preserves measurement and percentage precision while grouping counts', () => {
        expect(formatNumber(100000)).toBe('100.000');
        expect(formatNumber(1234.56789)).toBe('1.234,56789');
        expect(formatDecimal(1234.5678, 3)).toBe('1.234,568');
        expect(formatDecimal(12.36, 1)).toBe('12,4');
        expect(formatDecimal(1234.4, 0)).toBe('1.234');
    });

    it.each([null, undefined, NaN, Infinity])('handles unavailable or invalid figures: %s', value => {
        expect(formatDecimal(value)).toBe('0,00');
        expect(formatNumber(value)).toBe('0');
    });

    it('renders large financial totals and quantities in the printed analytics card and table', () => {
        const html = renderToStaticMarkup(<AnalyticsPrintReport stats={{
            isSingleOrder: true,
            totals: { realizedNet: 100000.76, shippedPieces: 12345, realizedOrderCount: 1234, margin: 12.3 },
            itemsBreakdown: [{ sku: 'SKU100000', quantity: 12345, net: 100000.76, margin: 12.3 }],
        }} />);
        expect(html).toContain('100.000,76');
        expect(html).toContain('12.345');
        expect(html).toContain('1.234 παραγγελίες');
        expect(html).toContain('12,3%');
        expect(html).toContain('SKU100000');
        expect(html).not.toContain('100000,76');
    });

    it('renders grouped currency in the shared invoice summary', () => {
        const html = renderToStaticMarkup(<CustomerPrintSummaryFooter
            subtotal={100000.76} totalPieces={12345} vatRate={0.24}
            vatAmount={24000.1824} grandTotal={124000.9424}
        />);
        expect(html).toContain('100.000,76');
        expect(html).toContain('24.000,18');
        expect(html).toContain('124.000,94');
        expect(html).toContain('12.345');
    });
});
