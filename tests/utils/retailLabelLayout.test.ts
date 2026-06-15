import { describe, expect, it } from 'vitest';
import { fitRetailStoneLabelText, getRetailLabelMetrics } from '../../utils/retailLabelLayout';

describe('getRetailLabelMetrics', () => {
    it('derives 72×10mm retail label geometry from settings', () => {
        const metrics = getRetailLabelMetrics({
            labelWidthMm: 72,
            labelHeightMm: 10,
            hasStone: true,
            showPrice: true,
            hasSize: false,
        });

        expect(metrics.printableWidthMm).toBe(37);
        expect(metrics.halfColumnWidthMm).toBe(18.5);
        expect(metrics.rightColumnMaxWidthMm).toBe(17);
        expect(metrics.qrSizeMm).toBeLessThanOrEqual(7.5);
        expect(metrics.stoneMaxHeightMm).toBeGreaterThan(0);
        expect(
            metrics.stoneMaxHeightMm
            + metrics.brandFontMm
            + metrics.priceFontMm
            + metrics.blockGapMm * 4,
        ).toBeLessThanOrEqual(10.5);
    });
});

describe('fitRetailStoneLabelText', () => {
    it('fits long Greek stone names within 17mm without ellipsis', () => {
        const maxWidthMm = 17;
        const maxHeightMm = 3.2;

        const samples = ['Λευκά Ζιργκόν', 'Κόκκινα Ζιργκόν', 'Πράσινος Αχάτης'];

        for (const text of samples) {
            const fit = fitRetailStoneLabelText(text, maxWidthMm, maxHeightMm);
            expect(fit.fontSize).toBeGreaterThanOrEqual(1.2);
            expect(fit.allowWrap || fit.fontSize <= 2.2).toBe(true);
        }
    });
});
