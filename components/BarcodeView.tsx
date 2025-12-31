
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
                
                // Calculate optimized barcode parameters
                // width: 1.5 - 3 is usually safe for 50mm labels. 
                // We calculate a multiplier based on width to fill space.
                const barcodeWidthMultiplier = Math.max(1, Math.floor(width / (encodedSku.length * 1.5)));
                
                JsBarcode(svgRef.current, encodedSku, {
                    format: 'CODE128',
                    displayValue: false, 
                    height: height * 2.5, // Draw larger for better clarity
                    width: barcodeWidthMultiplier, 
                    margin: 0,
                    background: 'transparent'
                });
            } catch (e) {
                console.error("JsBarcode error:", e);
            }
        }
    }, [finalSku, format, width, height]);

    // FONT CALCULATIONS (in mm)
    const skuFontSize = Math.min(height * 0.16, width * 0.15, 4);
    const detailsFontSize = Math.min(height * 0.12, width * 0.12, 3);
    const brandFontSize = Math.min(height * 0.14, width * 0.18, 3.5);
    const stoneFontSize = Math.min(height * 0.11, width * 0.14, 2.5);
    
    const priceDisplay = wholesalePrice > 0 ? `${wholesalePrice.toFixed(2).replace('.', ',')}€` : '';

    const containerStyle: React.CSSProperties = {
        width: `${width}mm`,
        height: `${height}mm`,
        padding: '1.5mm',
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
                <div className="flex-1 w-full flex items-center justify-center overflow-hidden">
                    <svg ref={svgRef} style={{ width: '100%', height: '80%' }} />
                </div>
                <div className="w-full text-center leading-none mt-1">
                    <span className="font-bold block uppercase" style={{ fontSize: `${skuFontSize}mm` }}>
                        {finalSku}
                    </span>
                </div>
            </div>
        );
    }

    return (
        <div className="label-container" style={containerStyle}>
            {/* SKU HEADER */}
            <div className="w-full text-center leading-none">
                <span className="font-black block uppercase tracking-tight" style={{ fontSize: `${skuFontSize}mm` }}>
                    {finalSku}
                </span>
            </div>

            {/* BARCODE CENTER */}
            <div className="flex-1 w-full flex items-center justify-center overflow-hidden py-1">
                <svg ref={svgRef} style={{ maxWidth: '100%', maxHeight: '100%' }} />
            </div>

            {/* BRAND & STONE */}
            <div className="w-full text-center leading-tight mb-1">
                <span className="font-black tracking-[0.2em] text-slate-900 block uppercase" style={{ fontSize: `${brandFontSize}mm` }}>
                    ILIOS
                </span>
                {stoneName && (
                    <span className="font-bold text-slate-700 block truncate" style={{ fontSize: `${stoneFontSize}mm` }}>
                        {stoneName}
                    </span>
                )}
            </div>

            {/* PRICE & HALLMARK FOOTER */}
            <div className="w-full flex justify-between items-end border-t border-black/20 pt-1 leading-none">
                 <span className="font-black" style={{ fontSize: `${detailsFontSize}mm` }}>{priceDisplay}</span>
                 <div className="flex items-center">
                    <span className="font-bold text-slate-800" style={{ fontSize: `${detailsFontSize * 0.9}mm` }}>925°</span>
                 </div>
            </div>
        </div>
    );
};

export default BarcodeView;
