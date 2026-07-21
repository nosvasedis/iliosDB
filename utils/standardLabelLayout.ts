export const STANDARD_LABEL_PRICE_MIN_FONT_MM = 2.4;
export const STANDARD_LABEL_PRICE_MAX_FONT_MM = 3.8;
export const STANDARD_LABEL_PRICE_EMERGENCY_MIN_FONT_MM = 1.8;
export const STANDARD_LABEL_SIZE_FONT_RATIO = 0.72;
export const STANDARD_LABEL_SEPARATOR_FONT_RATIO = 0.78;
export const STANDARD_LABEL_SKU_MAX_LETTER_SPACING_EM = 0.12;

const STANDARD_LABEL_HORIZONTAL_PADDING_MM = 0.8;
const STANDARD_LABEL_FOOTER_COLUMN_GAP_MM = 0.6;
const STANDARD_LABEL_PRICE_COLUMN_RATIO = 3 / 5;
const STANDARD_LABEL_SKU_WIDTH_SAFETY_MM = 1;

function estimateTextWidthMm(text: string, fontSizeMm: number): number {
  return [...text].reduce((width, character) => {
    if (character === ' ') return width + fontSizeMm * 0.32;
    if (/[.,/:]/.test(character)) return width + fontSizeMm * 0.3;
    if (/[1Il]/.test(character)) return width + fontSizeMm * 0.36;
    return width + fontSizeMm * 0.6;
  }, 0);
}

export function getStandardLabelPriceMaxWidthMm(labelWidthMm: number): number {
  const contentWidthMm = Math.max(
    0,
    labelWidthMm
      - (STANDARD_LABEL_HORIZONTAL_PADDING_MM * 2)
      - (STANDARD_LABEL_FOOTER_COLUMN_GAP_MM * 2),
  );
  return contentWidthMm * STANDARD_LABEL_PRICE_COLUMN_RATIO;
}

export function getStandardLabelSkuLetterSpacingEm(
  sku: string,
  labelWidthMm: number,
  fontSizeMm: number,
): number {
  const characterCount = [...sku].length;
  if (characterCount < 2 || fontSizeMm <= 0) return 0;

  const availableWidthMm = Math.max(
    0,
    labelWidthMm - (STANDARD_LABEL_HORIZONTAL_PADDING_MM * 2) - STANDARD_LABEL_SKU_WIDTH_SAFETY_MM,
  );
  const estimatedGlyphWidthMm = characterCount * fontSizeMm * 0.62;
  const availableTrackingMm = Math.max(0, availableWidthMm - estimatedGlyphWidthMm);
  const spacingEm = availableTrackingMm / (characterCount - 1) / fontSizeMm;

  return Number(Math.min(STANDARD_LABEL_SKU_MAX_LETTER_SPACING_EM, spacingEm).toFixed(3));
}

export function fitStandardLabelPriceFontMm(
  price: string,
  size: string,
  maxWidthMm: number,
  labelHeightMm: number,
): number {
  const heightAwareMaximum = Math.min(
    STANDARD_LABEL_PRICE_MAX_FONT_MM,
    Math.max(STANDARD_LABEL_PRICE_MIN_FONT_MM, labelHeightMm * 0.14),
  );

  if ((!price && !size) || maxWidthMm <= 0) return heightAwareMaximum;

  const estimatePriceLineWidthMm = (fontSizeMm: number) => {
    const priceWidthMm = estimateTextWidthMm(price, fontSizeMm);
    const sizeWidthMm = estimateTextWidthMm(size, fontSizeMm * STANDARD_LABEL_SIZE_FONT_RATIO);
    const separatorWidthMm = price && size
      ? estimateTextWidthMm(' / ', fontSizeMm * STANDARD_LABEL_SEPARATOR_FONT_RATIO)
      : 0;
    return priceWidthMm + separatorWidthMm + sizeWidthMm;
  };

  for (
    let fontSize = heightAwareMaximum;
    fontSize >= STANDARD_LABEL_PRICE_MIN_FONT_MM;
    fontSize -= 0.1
  ) {
    if (estimatePriceLineWidthMm(fontSize) <= maxWidthMm) {
      return Number(fontSize.toFixed(1));
    }
  }

  const widthAtOneMm = estimatePriceLineWidthMm(1);
  const emergencyFit = widthAtOneMm > 0
    ? maxWidthMm / widthAtOneMm
    : STANDARD_LABEL_PRICE_MIN_FONT_MM;

  return Number(Math.max(
    STANDARD_LABEL_PRICE_EMERGENCY_MIN_FONT_MM,
    Math.min(STANDARD_LABEL_PRICE_MIN_FONT_MM, emergencyFit),
  ).toFixed(1));
}
