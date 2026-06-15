/**
 * Fixed physical layout for λιανική labels (positions from the label's left edge).
 * Left pane (QR + SKU) starts at 36.5 mm; right pane starts at 57 mm.
 */
export const RETAIL_LEFT_PANE_START_MM = 36.5;
export const RETAIL_RIGHT_PANE_START_MM = 57;
/** Screen preview only — non-printable tail region on physical stock. */
export const RETAIL_TAIL_GUIDE_WIDTH_MM = 35;
/** Safety margin so fitted stone text is not clipped at print time. */
export const RETAIL_STONE_WIDTH_SAFETY_MM = 0.8;

export interface RetailStoneTextFit {
    fontSize: number;
    lineHeight: number;
    allowWrap: boolean;
}

export interface RetailLabelMetrics {
    labelWidthMm: number;
    labelHeightMm: number;
    leftPaneStartMm: number;
    rightPaneStartMm: number;
    leftPaneWidthMm: number;
    rightPaneWidthMm: number;
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
    const charWidthFactor = 0.62;
    const spaceWidthFactor = 0.32;

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

    const buildWrappedLines = (words: string[], fontSize: number): string[] => {
        if (words.length === 0) return [''];
        const lines: string[] = [];
        let currentLine: string[] = [];
        let currentWidth = 0;

        for (const word of words) {
            const wordWidth = estimateTextWidth(word, fontSize);
            const nextWidth = currentLine.length > 0
                ? currentWidth + fontSize * spaceWidthFactor + wordWidth
                : wordWidth;

            if (currentLine.length > 0 && nextWidth > maxWidthMm) {
                lines.push(currentLine.join(' '));
                currentLine = [word];
                currentWidth = wordWidth;
            } else {
                currentLine.push(word);
                currentWidth = nextWidth;
            }
        }

        if (currentLine.length > 0) lines.push(currentLine.join(' '));
        return lines;
    };

    const wrappedLinesFit = (words: string[], fontSize: number) => {
        const lines = buildWrappedLines(words, fontSize);
        return lines.every((line) => estimateTextWidth(line, fontSize) <= maxWidthMm);
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
        if (!wrappedLinesFit(words, fontSize)) continue;

        const lineCount = countWrappedLines(words, fontSize);
        const totalHeight = lineCount * fontSize * 0.95;
        if (totalHeight <= maxHeightMm) {
            return { fontSize: parseFloat(fontSize.toFixed(1)), lineHeight: 0.95, allowWrap: true };
        }
    }

    return { fontSize: minFont, lineHeight: 0.95, allowWrap: true };
}

/** Derive pane geometry and font sizes from configured retail label dimensions. */
export function getRetailLabelMetrics({
    labelWidthMm,
    labelHeightMm,
    hasStone,
    showPrice,
    hasSize,
}: RetailLabelMetricsInput): RetailLabelMetrics {
    const leftPaneStartMm = RETAIL_LEFT_PANE_START_MM;
    const rightPaneStartMm = RETAIL_RIGHT_PANE_START_MM;
    const leftPaneWidthMm = rightPaneStartMm - leftPaneStartMm;
    const rightPaneWidthMm = Math.max(8, labelWidthMm - rightPaneStartMm);
    const rightColumnPaddingMm = 0.5;
    const rightColumnMaxWidthMm = Math.max(
        6,
        rightPaneWidthMm - rightColumnPaddingMm - RETAIL_STONE_WIDTH_SAFETY_MM,
    );
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
        labelWidthMm,
        labelHeightMm,
        leftPaneStartMm,
        rightPaneStartMm,
        leftPaneWidthMm,
        rightPaneWidthMm,
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
