
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
                
                // BARCODE OPTIMIZATION:
                // height: Use approx 40-50% of label height for the bars themselves
                // width: 1.5 - 2.0 is the "Golden Ratio" for small thermal jewelry labels
                const barWidth = width < 45 ? 1.4 : 1.8;
                
                JsBarcode(svgRef.current, encodedSku, {
                    format: 'CODE128',
                    displayValue: false, 
                    height: height * 1.5, // Relative height for rendering
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
    // Scaled for high readability and separation
    const skuFontSize = Math.min(height * 0.14, width * 0.14, 3.8);
    const detailsFontSize = Math.min(height * 0.11, width * 0.11, 2.8);
    const brandFontSize = Math.min(height * 0.10, width * 0.15, 2.5); // Smaller as requested
    const stoneFontSize = Math.min(height * 0.10, width * 0.13, 2.2);
    
    const priceDisplay = wholesalePrice > 0 ? `${wholesalePrice.toFixed(2).replace('.', ',')}€` : '';

    const containerStyle: React.CSSProperties = {
        width: `${width}mm`,
        height: `${height}mm`,
        padding: '1mm 1.5mm', // Slightly less top/bottom padding to gain space
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
            <div className="label-container" style={containerStyle}>
                <div className="w-full text-center leading-none">
                    <span className="font-bold block uppercase" style={{ fontSize: `${skuFontSize}mm` }}>
                        {finalSku}
                    </span>
                </div>
                <div className="flex-1 w-full flex items-center justify-center overflow-hidden py-1">
                    <svg ref={svgRef} style={{ maxWidth: '100%', maxHeight: '100%' }} />
                </div>
            </div>
        );
    }

    return (
        <div className="label-container" style={containerStyle}>
            {/* SKU HEADER - Pushed to the top */}
            <div className="w-full text-center leading-none mb-0.5">
                <span className="font-black block uppercase tracking-tight" style={{ fontSize: `${skuFontSize}mm` }}>
                    {finalSku}
                </span>
            </div>

            {/* BARCODE CENTER - Maximized vertical space */}
            <div className="flex-1 w-full flex items-center justify-center overflow-hidden py-1">
                <svg ref={svgRef} style={{ maxWidth: '100%', maxHeight: '100%', display: 'block' }} />
            </div>

            {/* BRAND & STONE - Slightly smaller and lower */}
            <div className="w-full text-center leading-tight mt-0.5">
                {stoneName && (
                    <span className="font-bold text-slate-700 block truncate leading-none mb-0.5" style={{ fontSize: `${stoneFontSize}mm` }}>
                        {stoneName}
                    </span>
                )}
                <span className="font-black tracking-[0.25em] text-slate-500 block uppercase leading-none" style={{ fontSize: `${brandFontSize}mm` }}>
                    ILIOS
                </span>
            </div>

            {/* PRICE & HALLMARK FOOTER */}
            <div className="w-full flex justify-between items-end border-t border-black/10 pt-0.5 leading-none mt-0.5">
                 <span className="font-black" style={{ fontSize: `${detailsFontSize}mm` }}>{priceDisplay}</span>
                 <div className="flex items-center">
                    <span className="font-bold text-slate-400" style={{ fontSize: `${detailsFontSize * 0.8}mm` }}>925°</span>
                 </div>
            </div>
        </div>
    );
};

export default BarcodeView;
