
import React, { useEffect, useRef, useMemo } from 'react';
import JsBarcode from 'jsbarcode';
import { Product, ProductVariant } from '../types';
import { STONE_CODES_MEN, STONE_CODES_WOMEN, FINISH_CODES } from '../constants';
import { transliterateForBarcode } from '../utils/pricingEngine';

interface Props {
    product: Product;
    variant?: ProductVariant;
    width: number;
    height: number;
    format?: 'standard' | 'simple';
}

const BarcodeView: React.FC<Props> = ({ product, variant, width, height, format = 'standard' }) => {
    const svgRef = useRef<SVGSVGElement>(null);

    const baseSku = product?.sku || '';
    const suffix = variant?.suffix || '';
    const finalSku = `${baseSku}${suffix}`;
    const wholesalePrice = variant?.selling_price ?? product.selling_price;

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
                const encodedSku = transliterateForBarcode(finalSku);
                
                // BARCODE OPTIMIZATION FOR OLD PRINTERS:
                // height: Use a larger multiplier to ensure bars are physically tall.
                // width: Increase to 1.6+ for better "bar contrast" on low DPI heads.
                const barWidth = width < 45 ? 1.6 : 1.9;
                
                JsBarcode(svgRef.current, encodedSku, {
                    format: 'CODE128',
                    displayValue: false, 
                    height: 100, // Fixed high resolution for the SVG render buffer
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
    }, [finalSku, format, width, height]);

    // FONT CALCULATIONS (in mm)
    // Adjusted upward for "Old Printer" legibility
    const skuFontSize = Math.min(height * 0.15, width * 0.14, 4.2);
    const detailsFontSize = Math.min(height * 0.12, width * 0.12, 3.2); // Bigger
    const brandFontSize = Math.min(height * 0.11, width * 0.16, 2.8);  // Bigger
    const stoneFontSize = Math.min(height * 0.10, width * 0.13, 2.4);
    
    const priceDisplay = wholesalePrice > 0 ? `${wholesalePrice.toFixed(2).replace('.', ',')}€` : '';

    const containerStyle: React.CSSProperties = {
        width: `${width}mm`,
        height: `${height}mm`,
        padding: '0.8mm 1.2mm', // Tighter side padding to allow bigger barcode
        boxSizing: 'border-box',
        backgroundColor: 'white',
        color: 'black', // Forced absolute black
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
            <div className="label-container" style={containerStyle}>
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

    return (
        <div className="label-container" style={containerStyle}>
            {/* SKU HEADER - Pure black and slightly larger */}
            <div className="w-full text-center leading-none mb-1">
                <span className="font-black block uppercase tracking-tight text-black" style={{ fontSize: `${skuFontSize}mm` }}>
                    {finalSku}
                </span>
            </div>

            {/* BARCODE CENTER - Tallest possible bars with quiet zones */}
            <div className="flex-1 w-full flex items-center justify-center overflow-hidden px-2">
                <svg ref={svgRef} style={{ maxWidth: '100%', height: '100%', display: 'block' }} />
            </div>

            {/* BRAND & STONE - Pushed together to save height for the barcode */}
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

            {/* PRICE & HALLMARK FOOTER - Higher contrast border */}
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
