
import React, { useEffect, useRef, useMemo } from 'react';
import JsBarcode from 'jsbarcode';
import { Product, ProductVariant } from '../types';
import { STONE_CODES_MEN, STONE_CODES_WOMEN, FINISH_CODES, INITIAL_SETTINGS } from '../constants';
import { transliterateForBarcode, codifyPrice } from '../utils/pricingEngine';

interface Props {
    product: Product;
    variant?: ProductVariant;
    width: number;
    height: number;
    format?: 'standard' | 'simple' | 'retail';
}

const BarcodeView: React.FC<Props> = ({ product, variant, width, height, format = 'standard' }) => {
    const svgRef = useRef<SVGSVGElement>(null);

    const baseSku = product?.sku || '';
    const suffix = variant?.suffix || '';
    const finalSku = `${baseSku}${suffix}`;
    const wholesalePrice = variant?.selling_price ?? product.selling_price;

    // Safety fallback for retail width if settings are missing/old
    const activeWidth = format === 'retail' && width < 50 ? INITIAL_SETTINGS.retail_barcode_width_mm : width;
    const activeHeight = format === 'retail' && height > 15 ? INITIAL_SETTINGS.retail_barcode_height_mm : height;

    // Smart Stone Detection Logic
    const stoneName = useMemo(() => {
        if (product.sku.startsWith('ST') && (variant?.suffix === '' || !variant)) {
            return null;
        }
        if (variant?.description) {
            let desc = variant.description;
            const finishes = Object.values(FINISH_CODES);
            finishes.forEach(finish => {
                if (finish) {
                    const regex = new RegExp(`(^|\\s*-\\s*)${finish}(\\s*-\\s*|$)`, 'i');
                    desc = desc.replace(regex, '').trim();
                }
            });
            desc = desc.replace(/Λουστρέ/gi, '').replace(/Πατίνα/gi, '').trim();
            desc = desc.replace(/^-+\s*/, '').replace(/\s*-+$/, '').trim();
            if (desc && desc.length > 2) return desc; 
        }
        if (suffix) {
             const allStones = { ...STONE_CODES_MEN, ...STONE_CODES_WOMEN };
             const sortedCodes = Object.keys(allStones).sort((a,b) => b.length - a.length);
             for (const code of sortedCodes) {
                 if (suffix.includes(code)) return (allStones as any)[code];
             }
        }
        return null;
    }, [product, variant, suffix]);

    useEffect(() => {
        if (svgRef.current && finalSku) {
            try {
                // SIMPLIFICATION STRATEGY:
                // For 'retail', we encode only the BASE SKU (e.g. DA100) instead of the full variant (DA100X).
                // This reduces the number of bars significantly, making the barcode less dense and readable
                // by phones in the tiny 1.8cm space provided.
                const valueToEncode = format === 'retail' ? baseSku : finalSku;
                const encodedSku = transliterateForBarcode(valueToEncode);
                
                // Optimization: 
                // Retail: Use narrower bars (1.3) to ensure it fits in 18mm width without overflowing or scaling down too much.
                const barWidth = format === 'retail' ? 1.3 : (activeWidth < 45 ? 1.6 : 1.9);
                const barHeight = format === 'retail' ? 25 : 100;
                
                JsBarcode(svgRef.current, encodedSku, {
                    format: 'CODE128',
                    displayValue: false, 
                    height: barHeight, 
                    width: barWidth, 
                    margin: 0,
                    background: 'transparent',
                    valid: (valid) => {
                        if (!valid) console.warn("Invalid SKU for barcode:", encodedSku);
                    }
                });
            } catch (e) {
                console.error("JsBarcode error:", e);
            }
        }
    }, [finalSku, baseSku, format, activeWidth, activeHeight]);

    // FONT CALCULATIONS (in mm)
    const skuFontSize = Math.min(activeHeight * 0.15, activeWidth * 0.14, 4.2);
    const detailsFontSize = Math.min(activeHeight * 0.12, activeWidth * 0.12, 3.2);
    const brandFontSize = Math.min(activeHeight * 0.11, activeWidth * 0.16, 2.8);
    const stoneFontSize = Math.min(activeHeight * 0.10, activeWidth * 0.13, 2.4);
    
    const priceDisplay = wholesalePrice > 0 ? `${wholesalePrice.toFixed(2).replace('.', ',')}€` : '';
    const codifiedPrice = wholesalePrice > 0 ? codifyPrice(wholesalePrice) : '';

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
            <div className="label-container" style={{ ...containerStyle, padding: '0.8mm 1.2mm' }}>
                <div className="w-full text-center leading-none mb-1">
                    <span className="font-black block uppercase" style={{ fontSize: `${skuFontSize}mm` }}>
                        {finalSku}
                    </span>
                </div>
                <div className="flex-1 w-full flex items-center justify-center overflow-hidden px-1">
                    <svg ref={svgRef} style={{ width: '100%', height: '100%', display: 'block' }} />
                </div>
            </div>
        );
    }

    if (format === 'retail') {
        return (
            <div className="label-container" style={{ ...containerStyle, flexDirection: 'row', justifyContent: 'flex-start', padding: 0 }}>
                {/* 3.5cm Useless Tail (Left) */}
                <div className="print:hidden border-r border-dashed border-slate-300 bg-slate-50 flex items-center justify-center" style={{ width: '35mm', height: '100%', flexShrink: 0 }}>
                    <span className="text-[8px] text-slate-300 font-bold uppercase -rotate-90">Tail</span>
                </div>
                <div className="hidden print:block" style={{ width: '35mm', height: '100%', flexShrink: 0 }}></div>

                {/* Printable Area Wrapper (Remaining ~3.7cm split into 2) */}
                <div style={{ flex: 1, minWidth: 0, height: '100%', display: 'flex' }}>
                    
                    {/* Part 1 (Left of content): SKU & Barcode */}
                    <div style={{ width: '50%', minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 0.5mm', overflow: 'hidden' }}>
                        <span className="font-black block uppercase leading-none truncate w-full text-center" style={{ fontSize: '2.2mm' }}>
                            {finalSku}
                        </span>
                        {/* Smaller container for the barcode to ensure it fits */}
                        <div style={{ width: '100%', height: '4mm', display: 'flex', justifyContent: 'center', alignItems: 'center', overflow: 'hidden', marginTop: '0.5mm' }}>
                             <svg ref={svgRef} style={{ width: '100%', height: '100%' }} />
                        </div>
                    </div>

                    {/* Part 2 (Right of content): Codified Price & Stone */}
                    <div style={{ width: '50%', minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 0.5mm', overflow: 'hidden' }}>
                        <span className="font-black leading-none truncate w-full text-center" style={{ fontSize: '2.4mm' }}>
                            {codifiedPrice}
                        </span>
                        {stoneName && (
                            <span className="font-bold block text-center leading-none" style={{ fontSize: '1.6mm', marginTop: '0.5mm', width: '100%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {stoneName}
                            </span>
                        )}
                    </div>

                </div>
            </div>
        );
    }

    // Standard Wholesale Format
    return (
        <div className="label-container" style={{ ...containerStyle, padding: '0.8mm 1.2mm' }}>
            {/* SKU HEADER */}
            <div className="w-full text-center leading-none mb-1">
                <span className="font-black block uppercase tracking-tight text-black" style={{ fontSize: `${skuFontSize}mm` }}>
                    {finalSku}
                </span>
            </div>

            {/* BARCODE CENTER */}
            <div className="flex-1 w-full flex items-center justify-center overflow-hidden px-2">
                <svg ref={svgRef} style={{ maxWidth: '100%', height: '100%', display: 'block' }} />
            </div>

            {/* BRAND & STONE */}
            <div className="w-full text-center leading-tight mt-1">
                {stoneName && (
                    <span className="font-bold text-black block truncate leading-none mb-0.5" style={{ fontSize: `${stoneFontSize}mm` }}>
                        {stoneName}
                    </span>
                )}
                <span className="font-black tracking-[0.15em] text-black block uppercase leading-none" style={{ fontSize: `${brandFontSize}mm` }}>
                    ILIOS
                </span>
            </div>

            {/* PRICE & HALLMARK FOOTER */}
            <div className="w-full flex justify-between items-end border-t border-black pt-1 leading-none mt-1">
                 <span className="font-black text-black" style={{ fontSize: `${detailsFontSize}mm` }}>{priceDisplay}</span>
                 <div className="flex items-center">
                    <span className="font-black text-black" style={{ fontSize: `${detailsFontSize * 0.9}mm` }}>925°</span>
                 </div>
            </div>
        </div>
    );
};

export default BarcodeView;
