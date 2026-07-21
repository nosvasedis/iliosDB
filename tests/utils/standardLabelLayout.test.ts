import { describe, expect, it } from 'vitest';
import {
  fitStandardLabelPriceFontMm,
  getStandardLabelPriceMaxWidthMm,
  STANDARD_LABEL_PRICE_EMERGENCY_MIN_FONT_MM,
  STANDARD_LABEL_PRICE_MAX_FONT_MM,
} from '../../utils/standardLabelLayout';

describe('standard label layout', () => {
  it('uses the maximum price font for a normal price on a default label', () => {
    const maxWidth = getStandardLabelPriceMaxWidthMm(50);
    expect(fitStandardLabelPriceFontMm('20,00€', maxWidth, 30)).toBe(STANDARD_LABEL_PRICE_MAX_FONT_MM);
  });

  it('shrinks an inline ring price only enough to fit its center column', () => {
    const maxWidth = getStandardLabelPriceMaxWidthMm(50);
    const fontSize = fitStandardLabelPriceFontMm('1.234,56€ / No123', maxWidth, 30);

    expect(fontSize).toBeLessThan(STANDARD_LABEL_PRICE_MAX_FONT_MM);
    expect(fontSize).toBeGreaterThanOrEqual(STANDARD_LABEL_PRICE_EMERGENCY_MIN_FONT_MM);
  });

  it('adapts to a smaller configured label without exceeding the maximum', () => {
    const maxWidth = getStandardLabelPriceMaxWidthMm(35);
    const fontSize = fitStandardLabelPriceFontMm('120,00€ / 19cm', maxWidth, 20);

    expect(fontSize).toBeGreaterThanOrEqual(STANDARD_LABEL_PRICE_EMERGENCY_MIN_FONT_MM);
    expect(fontSize).toBeLessThanOrEqual(STANDARD_LABEL_PRICE_MAX_FONT_MM);
  });
});
