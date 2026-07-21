import React, { useEffect, useState, useMemo } from 'react';
import QRCode from 'qrcode';
import { Product, ProductVariant } from '../types';
import { INITIAL_SETTINGS } from '../constants';
import { transliterateForBarcode } from '../utils/pricingEngine';
import { fitRetailStoneLabelText, getRetailLabelMetrics, RETAIL_TAIL_GUIDE_WIDTH_MM } from '../utils/retailLabelLayout';
import { getSizingInfo } from '../utils/sizing';
import {
    getStandardLabelPriceMaxWidthMm,
    fitStandardLabelPriceFontMm,
    STANDARD_LABEL_SEPARATOR_FONT_RATIO,
    STANDARD_LABEL_SIZE_FONT_RATIO,
} from '../utils/standardLabelLayout';
import {
    buildLabelText,
    composeStandardLabelPriceLine,
    formatStandardLabelSize,
    LabelTextOverrides,
} from '../features/printing/labelText';

interface Props {
    product: Product;
    variant?: ProductVariant;
    width: number;
    height: number;
    format?: 'standard' | 'simple' | 'retail';
    size?: string;
    showPrice?: boolean;
    priceTier?: 'wholesale' | 'retail';
    labelOverrides?: LabelTextOverrides;
}

const BarcodeView: React.FC<Props> = ({
    product,
    variant,
    width,
    height,
    format = 'standard',
    size,
    showPrice: showPriceProp,
    priceTier: priceTierProp,
    labelOverrides,
}) => {
    const [qrDataUrl, setQrDataUrl] = useState<string>('');

    const activeWidth = width > 0
        ? width
        : (format === 'retail' ? INITIAL_SETTINGS.retail_barcode_width_mm : INITIAL_SETTINGS.barcode_width_mm);
    const activeHeight = height > 0
        ? height
        : (format === 'retail' ? INITIAL_SETTINGS.retail_barcode_height_mm : INITIAL_SETTINGS.barcode_height_mm);

    const showPrice = showPriceProp ?? format !== 'retail';
    const priceTier = priceTierProp ?? 'wholesale';
    const labelText = useMemo(() => buildLabelText({
        product,
        variant,
        format,
        size,
        showPrice,
        priceTier,
        overrides: labelOverrides,
    }), [product, variant, format, size, showPrice, priceTier, labelOverrides]);

    useEffect(() => {
        if (labelText.sourceSku) {
            const valueToEncode = transliterateForBarcode(labelText.sourceSku);
            
            // Generate QR code with high error correction (Level H)
            QRCode.toDataURL(valueToEncode, {
                errorCorrectionLevel: 'H',
                margin: 0,
                scale: 12, 
                color: {
                    dark: '#000000',
                    light: '#ffffff'
                }
            })
            .then(url => {
                setQrDataUrl(url);
            })
            .catch(err => {
                console.error("QR Code generation failed:", err);
            });
        }
    }, [labelText.sourceSku]);

    // FONT CALCULATIONS (in mm)
    // Sku font size slightly increased from 0.15/0.14/3.8 to 0.16/0.15/4.0
    const skuFontSize = Math.min(activeHeight * 0.16, activeWidth * 0.15, 4.0);
    const brandFontSize = Math.min(activeHeight * 0.11, activeWidth * 0.16, 2.4);
    // Stone font size slightly increased from 0.10/0.13/2.2 to 0.13/0.15/2.5
    const stoneFontSize = Math.min(activeHeight * 0.13, activeWidth * 0.15, 2.5);
    
    // Keep label rendering aligned with the app-wide sizing rules.
    const sizingInfo = useMemo(() => getSizingInfo(product), [product]);
    const standardFormattedSize = useMemo(() => formatStandardLabelSize(
        labelText.size,
        sizingInfo?.type,
    ), [labelText.size, sizingInfo]);
    const standardPriceLine = useMemo(() => composeStandardLabelPriceLine(
        labelText.price,
        labelText.size,
        sizingInfo?.type,
    ), [labelText.price, labelText.size, sizingInfo]);
    const standardPriceFontSize = useMemo(() => fitStandardLabelPriceFontMm(
        labelText.price,
        standardFormattedSize,
        getStandardLabelPriceMaxWidthMm(activeWidth),
        activeHeight,
    ), [labelText.price, standardFormattedSize, activeWidth, activeHeight]);
    
    const containerStyle: React.CSSProperties = {
        width: `${activeWidth}mm`,
        height: `${activeHeight}mm`,
        boxSizing: 'border-box',
        backgroundColor: 'white',
        color: 'black',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'space-between',
        overflow: 'hidden',
        position: 'relative',
        pageBreakAfter: 'always',
        fontFamily: "'Inter', sans-serif"
    };

    if (format === 'simple') {
        return (
            <div className="label-container" style={{ ...containerStyle, padding: '1mm' }}>
                <div className="w-full text-center leading-none mb-0.5">
                    <span className="font-black block uppercase" style={{ fontSize: `${skuFontSize}mm` }}>
                        {labelText.displaySku}
                    </span>
                </div>
                <div className="flex-1 w-full flex items-center justify-center overflow-hidden min-h-0 py-0.5">
                    {qrDataUrl && <img src={qrDataUrl} style={{ height: '100%', width: 'auto', display: 'block', imageRendering: 'pixelated' }} alt="QR" />}
                </div>
            </div>
        );
    }

    if (format === 'retail') {
        const retailMetrics = getRetailLabelMetrics({
            labelWidthMm: activeWidth,
            labelHeightMm: activeHeight,
            hasStone: Boolean(labelText.stone),
            showPrice: Boolean(labelText.price),
            hasSize: Boolean(labelText.size),
        });
        const stoneFit = labelText.stone
            ? fitRetailStoneLabelText(labelText.stone, retailMetrics.rightColumnMaxWidthMm, retailMetrics.stoneMaxHeightMm)
            : null;

        const isCustomDisplaySku = Boolean(labelOverrides?.displaySku && labelOverrides.displaySku !== labelText.sourceSku);
        const skuMaster = isCustomDisplaySku ? labelText.displaySku : labelText.skuMaster;
        const suffixStr = isCustomDisplaySku ? '' : labelText.suffix;
        
        return (
            <div className="label-container" style={{ ...containerStyle, position: 'relative', padding: 0 }}>
                {/* Screen-only guide for the non-printable tail (0–35 mm) */}
                <div
                    className="print:hidden border-r border-dashed border-slate-300 bg-slate-50 flex items-center justify-center"
                    style={{ position: 'absolute', left: 0, top: 0, width: `${RETAIL_TAIL_GUIDE_WIDTH_MM}mm`, height: '100%', pointerEvents: 'none' }}
                >
                    <span className="text-[8px] text-slate-300 font-bold uppercase -rotate-90">Tail</span>
                </div>

                {/* Left pane: QR + SKU — always starts at 36.5 mm */}
                <div style={{
                    position: 'absolute',
                    left: `${retailMetrics.leftPaneStartMm}mm`,
                    top: 0,
                    width: `${retailMetrics.leftPaneWidthMm}mm`,
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'flex-start',
                    boxSizing: 'border-box',
                    overflow: 'hidden',
                }}>
                    <div style={{ flexShrink: 0, marginRight: '0.5mm', height: '100%', display: 'flex', alignItems: 'center' }}>
                        {qrDataUrl && (
                            <img
                                src={qrDataUrl}
                                style={{
                                    height: `${retailMetrics.qrSizeMm}mm`,
                                    width: `${retailMetrics.qrSizeMm}mm`,
                                    display: 'block',
                                    imageRendering: 'pixelated',
                                    marginTop: `${retailMetrics.qrMarginTopMm}mm`,
                                }}
                                alt="QR"
                            />
                        )}
                    </div>
                    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'flex-start' }}>
                        <span className="font-black block uppercase leading-none" style={{ fontSize: `${retailMetrics.skuFontMm}mm` }}>
                            {skuMaster}
                        </span>
                        {suffixStr && (
                            <span className="font-black block uppercase leading-none mt-[0.5mm]" style={{ fontSize: `${retailMetrics.suffixFontMm}mm` }}>
                                {suffixStr}
                            </span>
                        )}
                    </div>
                </div>

                {/* Right pane: stone + ILIOS + price — always starts at 57 mm */}
                <div style={{
                    position: 'absolute',
                    left: `${retailMetrics.rightPaneStartMm}mm`,
                    top: 0,
                    width: `${retailMetrics.rightPaneWidthMm}mm`,
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    justifyContent: 'center',
                    boxSizing: 'border-box',
                    overflow: 'visible',
                }}>
                    <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'flex-start',
                        width: `${retailMetrics.rightColumnMaxWidthMm}mm`,
                        maxWidth: `${retailMetrics.rightColumnMaxWidthMm}mm`,
                    }}>
                        {labelText.stone && stoneFit && (
                            <div
                                style={{
                                    fontWeight: 'bold',
                                    lineHeight: stoneFit.lineHeight,
                                    fontSize: `${stoneFit.fontSize}mm`,
                                    whiteSpace: stoneFit.allowWrap ? 'normal' : 'nowrap',
                                    wordBreak: 'normal',
                                    width: `${retailMetrics.rightColumnMaxWidthMm}mm`,
                                    maxWidth: `${retailMetrics.rightColumnMaxWidthMm}mm`,
                                    marginTop: `${retailMetrics.blockGapMm}mm`,
                                    boxSizing: 'border-box',
                                }}
                            >
                                {labelText.stone}
                            </div>
                        )}
                        {labelText.brand && (
                            <div className="font-black tracking-[0.05em] text-black uppercase leading-none" style={{ fontSize: `${retailMetrics.brandFontMm}mm`, marginTop: `${retailMetrics.blockGapMm}mm` }}>
                                {labelText.brand}
                            </div>
                        )}
                        {labelText.price && (
                            <div className="font-black text-black leading-none" style={{ fontSize: `${retailMetrics.priceFontMm}mm`, marginTop: `${retailMetrics.blockGapMm}mm`, whiteSpace: 'nowrap' }}>
                                {labelText.price}
                            </div>
                        )}
                        {labelText.size && (
                            <div className="px-1 rounded-[1px] text-[1.8mm] font-bold leading-none border border-black text-black" style={{ marginTop: `${retailMetrics.blockGapMm}mm` }}>
                                {labelText.size}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    // Standard Wholesale Format
    return (
        <div className="label-container" style={{ ...containerStyle, padding: '0.6mm 0.8mm' }}>
            <div className="w-full text-center leading-none">
                <span className="font-black block uppercase tracking-tighter text-black" style={{ fontSize: `${skuFontSize}mm` }}>
                    {labelText.displaySku}
                </span>
            </div>
            <div className="flex-1 w-full flex items-center justify-center overflow-hidden min-h-0 py-0.5">
                {qrDataUrl && <img src={qrDataUrl} style={{ height: '100%', maxWidth: '100%', objectFit: 'contain', display: 'block' }} alt="QR" />}
            </div>
            <div className="w-full text-center leading-[1.1] mb-0.5">
                {labelText.stone && (
                    <span className="font-bold text-black block truncate leading-none" style={{ fontSize: `${stoneFontSize}mm` }}>
                        {labelText.stone}
                    </span>
                )}
            </div>
            <div
                className="w-full grid items-center border-t border-black pt-0.5 leading-none"
                style={{ gridTemplateColumns: 'auto minmax(0, 1fr) auto', columnGap: '0.6mm' }}
            >
                 <span className="font-black tracking-[0.1em] text-black uppercase text-left whitespace-nowrap" style={{ fontSize: `${brandFontSize * 0.85}mm` }}>
                    {labelText.brand}
                </span>
                <span
                    data-label-price-line="wholesale"
                    aria-label={standardPriceLine}
                    className="font-black text-black text-center min-w-0 overflow-hidden whitespace-nowrap flex items-baseline justify-center"
                    style={{ fontSize: `${standardPriceFontSize}mm` }}
                >
                    {labelText.price && <span>{labelText.price}</span>}
                    {labelText.price && standardFormattedSize && (
                        <span
                            aria-hidden="true"
                            style={{
                                fontSize: `${STANDARD_LABEL_SEPARATOR_FONT_RATIO}em`,
                                marginLeft: '0.35mm',
                                marginRight: '0.35mm',
                            }}
                        >
                            /
                        </span>
                    )}
                    {standardFormattedSize && (
                        <span
                            style={{
                                fontSize: `${STANDARD_LABEL_SIZE_FONT_RATIO}em`,
                                fontStyle: 'italic',
                                fontWeight: 800,
                                letterSpacing: '-0.02em',
                                paddingRight: '0.15mm',
                            }}
                        >
                            {standardFormattedSize}
                        </span>
                    )}
                </span>
                 <span className="font-black text-black text-right whitespace-nowrap" style={{ fontSize: `${brandFontSize * 0.85}mm` }}>{labelText.metal}</span>
            </div>
        </div>
    );
};

export default BarcodeView;
