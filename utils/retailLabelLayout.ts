/** Non-printable tail width on retail (λιανική) labels. */
export const RETAIL_LABEL_TAIL_WIDTH_MM = 35;

export interface RetailStoneTextFit {
    fontSize: number;
    lineHeight: number;
    allowWrap: boolean;
}

export interface RetailLabelMetrics {
    printableWidthMm: number;
    halfColumnWidthMm: number;
    rightColumnMaxWidthMm: number;
    brandFontMm: number;
    priceFontMm: number;
    skuFontMm: number;
    suffixFontMm: number;
    qrSizeMm: number;
    qrMarginTopMm: number;
    blockGapMm: number;
    stoneMaxHeightMm: number;
}

interface RetailLabelMetricsInput {
    labelWidthMm: number;
    labelHeightMm: number;
    hasStone: boolean;
    showPrice: boolean;
    hasSize: boolean;
}

/** Scale retail-label stone description to fit without ellipsis truncation. */
export function fitRetailStoneLabelText(
    text: string,
    maxWidthMm: number,
    maxHeightMm: number,
): RetailStoneTextFit {
    const minFont = 1.2;
    const maxFont = 2.2;
    const charWidthFactor = 0.56;
    const spaceWidthFactor = 0.3;

    const estimateTextWidth = (value: string, fontSize: number) =>
        [...value].reduce((width, char) => (
            width + (char === ' ' ? fontSize * spaceWidthFactor : fontSize * charWidthFactor)
        ), 0);

    const countWrappedLines = (words: string[], fontSize: number) => {
        if (words.length === 0) return 1;
        let lines = 1;
        let currentWidth = 0;
        for (const word of words) {
            const wordWidth = estimateTextWidth(word, fontSize);
            if (currentWidth > 0 && currentWidth + fontSize * spaceWidthFactor + wordWidth > maxWidthMm) {
                lines += 1;
                currentWidth = wordWidth;
            } else {
                currentWidth = currentWidth > 0
                    ? currentWidth + fontSize * spaceWidthFactor + wordWidth
                    : wordWidth;
            }
        }
        return lines;
    };

    for (let fontSize = maxFont; fontSize >= minFont; fontSize -= 0.1) {
        if (estimateTextWidth(text, fontSize) <= maxWidthMm) {
            return { fontSize: parseFloat(fontSize.toFixed(1)), lineHeight: 0.9, allowWrap: false };
        }
    }

    const words = text.split(/\s+/).filter(Boolean);
    const longestWord = words.reduce((max, word) => Math.max(max, word.length), 0);

    for (let fontSize = maxFont; fontSize >= minFont; fontSize -= 0.1) {
        const longestWordWidth = longestWord * fontSize * charWidthFactor;
        if (longestWordWidth > maxWidthMm) continue;

        const lineCount = countWrappedLines(words, fontSize);
        const totalHeight = lineCount * fontSize * 0.95;
        if (totalHeight <= maxHeightMm) {
            return { fontSize: parseFloat(fontSize.toFixed(1)), lineHeight: 0.95, allowWrap: true };
        }
    }

    return { fontSize: minFont, lineHeight: 0.95, allowWrap: true };
}

/** Derive printable regions and font sizes from configured retail label dimensions. */
export function getRetailLabelMetrics({
    labelWidthMm,
    labelHeightMm,
    hasStone,
    showPrice,
    hasSize,
}: RetailLabelMetricsInput): RetailLabelMetrics {
    const printableWidthMm = Math.max(20, labelWidthMm - RETAIL_LABEL_TAIL_WIDTH_MM);
    const halfColumnWidthMm = printableWidthMm / 2;
    const rightColumnPaddingMm = 1.5;
    const rightColumnMaxWidthMm = Math.max(8, halfColumnWidthMm - rightColumnPaddingMm);
    const blockGapMm = 0.5;

    let brandFontMm = Math.min(2.5, Math.max(1.8, labelHeightMm * 0.25));
    let priceFontMm = Math.min(2.3, brandFontMm * 0.92);

    if (hasStone && labelHeightMm <= 11) {
        brandFontMm = Math.min(brandFontMm, 2.2);
        priceFontMm = Math.min(priceFontMm, 2.0);
    }

    const skuFontMm = Math.min(2.2, Math.max(1.6, labelHeightMm * 0.22));
    const suffixFontMm = Math.min(2.0, skuFontMm * 0.9);
    const qrSizeMm = Math.min(7.5, Math.max(5, labelHeightMm * 0.72));
    const qrMarginTopMm = Math.max(0, (labelHeightMm - qrSizeMm) * 0.25);

    let reservedHeightMm = blockGapMm;
    if (hasStone) reservedHeightMm += blockGapMm;
    reservedHeightMm += brandFontMm + blockGapMm;
    if (showPrice) reservedHeightMm += priceFontMm + blockGapMm;
    if (hasSize) reservedHeightMm += 1.8 + blockGapMm;

    const stoneMaxHeightMm = hasStone
        ? Math.max(1.2, labelHeightMm - reservedHeightMm)
        : 0;

    return {
        printableWidthMm,
        halfColumnWidthMm,
        rightColumnMaxWidthMm,
        brandFontMm,
        priceFontMm,
        skuFontMm,
        suffixFontMm,
        qrSizeMm,
        qrMarginTopMm,
        blockGapMm,
        stoneMaxHeightMm,
    };
}
