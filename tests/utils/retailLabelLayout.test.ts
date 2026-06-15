import { describe, expect, it } from 'vitest';
import {
    RETAIL_LEFT_PANE_START_MM,
    RETAIL_RIGHT_PANE_START_MM,
    fitRetailStoneLabelText,
    getRetailLabelMetrics,
} from '../../utils/retailLabelLayout';

describe('getRetailLabelMetrics', () => {
    it('uses fixed pane start positions for a 77×10.5 mm label', () => {
        const metrics = getRetailLabelMetrics({
            labelWidthMm: 77,
            labelHeightMm: 10.5,
            hasStone: true,
            showPrice: true,
            hasSize: false,
        });

        expect(metrics.leftPaneStartMm).toBe(RETAIL_LEFT_PANE_START_MM);
        expect(metrics.rightPaneStartMm).toBe(RETAIL_RIGHT_PANE_START_MM);
        expect(metrics.leftPaneStartMm).toBe(36.5);
        expect(metrics.rightPaneStartMm).toBe(57);
        expect(metrics.leftPaneWidthMm).toBe(20.5);
        expect(metrics.rightPaneWidthMm).toBe(20);
        expect(metrics.rightColumnMaxWidthMm).toBeGreaterThan(0);
    });
});

describe('fitRetailStoneLabelText', () => {
    it('fits long Greek stone names within the right pane', () => {
        const metrics = getRetailLabelMetrics({
            labelWidthMm: 77,
            labelHeightMm: 10.5,
            hasStone: true,
            showPrice: true,
            hasSize: false,
        });

        const samples = ['Λευκά Ζιργκόν', 'Κόκκινα Ζιργκόν', 'Πράσινος Αχάτης'];

        for (const text of samples) {
            const fit = fitRetailStoneLabelText(text, metrics.rightColumnMaxWidthMm, metrics.stoneMaxHeightMm);
            expect(fit.fontSize).toBeGreaterThanOrEqual(1.2);
        }
    });
});
