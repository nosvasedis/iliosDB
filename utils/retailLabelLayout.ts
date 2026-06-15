/** Non-printable tail width on retail (λιανική) labels. */
export const RETAIL_LABEL_TAIL_WIDTH_MM = 35;
/** Shift QR/SKU block right within the printable area (~1–1.5 cm). */
export const RETAIL_LEFT_PANE_OFFSET_MM = 12;
/** Safety margin so fitted stone text is not clipped at print time. */
export const RETAIL_STONE_WIDTH_SAFETY_MM = 1.2;

export interface RetailStoneTextFit {
    fontSize: number;
    lineHeight: number;
    allowWrap: boolean;
}

export interface RetailLabelMetrics {
    printableWidthMm: number;
    halfColumnWidthMm: number;
    leftPaneOffsetMm: number;
    leftColumnWidthMm: number;
    rightColumnWidthMm: number;
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
    // Greek bold text prints wider than Latin — use a conservative estimate.
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
    const rightColumnWidthMm = halfColumnWidthMm;
    const rightColumnPaddingMm = 1.5;
    const rightColumnMaxWidthMm = Math.max(
        8,
        rightColumnWidthMm - rightColumnPaddingMm - RETAIL_STONE_WIDTH_SAFETY_MM,
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
    const minLeftColumnMm = qrSizeMm + 2.5;
    const leftPaneOffsetMm = Math.min(
        RETAIL_LEFT_PANE_OFFSET_MM,
        Math.max(0, printableWidthMm - rightColumnWidthMm - minLeftColumnMm),
    );
    const leftColumnWidthMm = Math.max(
        minLeftColumnMm,
        printableWidthMm - leftPaneOffsetMm - rightColumnWidthMm,
    );

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
        leftPaneOffsetMm,
        leftColumnWidthMm,
        rightColumnWidthMm,
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
