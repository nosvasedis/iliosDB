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

    // Construct SKU cleanly
    const baseSku = product?.sku || '';
    const suffix = variant?.suffix || '';
    const finalSku = `${baseSku}${suffix}`;

    // --- PRICE DISPLAY: WHOLESALE ONLY ---
    const wholesalePrice = variant?.selling_price ?? product.selling_price;

    // --- Smart Stone Detection Logic ---
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
                 if (suffix.includes(code)) {
                     return allStones[code];
                 }
             }
        }
        return null;
    }, [product, variant, suffix]);

    useEffect(() => {
        if (svgRef.current && finalSku) {
            try {
                const encodedSku = transliterateForBarcode(finalSku);
                const isSimple = format === 'simple';
                
                // Using SVG instead of Canvas for Iframe printing compatibility
                JsBarcode(svgRef.current, encodedSku, {
                    format: 'CODE128',
                    displayValue: false, 
                    height: isSimple ? 60 : 40,
                    width: 2, 
                    margin: 0,
                    background: 'transparent'
                });
            } catch (e) {
                console.error("JsBarcode error:", e);
            }
        }
    }, [finalSku, format]);

    // --- DYNAMIC SIZING ENGINE ---
    const skuLength = finalSku.length;
    const maxSkuWidthFont = width / (Math.max(skuLength, 1) * 0.85); 
    const maxSkuHeightFont = height * 0.18; 
    const skuFontSize = Math.min(maxSkuWidthFont, maxSkuHeightFont);
    const detailsFontSize = Math.min(height * 0.11, width * 0.14); 
    const brandFontSize = Math.min(height * 0.14, width * 0.22);
    const stoneFontSize = Math.min(height * 0.12, width * 0.17);
    
    const priceDisplay = wholesalePrice > 0 ? `${wholesalePrice.toFixed(2).replace('.', ',')}€` : '';

    if (format === 'simple') {
        return (
            <div
                className="bg-white text-black flex flex-col items-center justify-center overflow-hidden relative break-inside-avoid"
                style={{
                    width: `${width}mm`,
                    height: `${height}mm`,
                    padding: '2mm', 
                    fontFamily: `'Inter', sans-serif`,
                    boxSizing: 'border-box'
                }}
            >
                <div className="flex-1 w-full flex items-center justify-center overflow-hidden">
                    <svg ref={svgRef} style={{ maxWidth: '100%', maxHeight: '100%' }} />
                </div>
                <div className="w-full text-center leading-none mt-[1mm]">
                    <span className="font-bold block uppercase" style={{ fontSize: '10px' }}>
                        {finalSku}
                    </span>
                </div>
            </div>
        );
    }

    return (
        <div
            className="bg-white text-black flex flex-col items-center justify-between overflow-hidden relative break-inside-avoid"
            style={{
                width: `${width}mm`,
                height: `${height}mm`,
                padding: '1mm', 
                fontFamily: `'Inter', sans-serif`,
                boxSizing: 'border-box'
            }}
        >
            <div className="w-full text-center leading-none mb-[0.5mm]">
                <span className="font-bold block uppercase" style={{ fontSize: `${skuFontSize}mm` }}>
                    {finalSku}
                </span>
            </div>

            <div className="flex-1 w-full flex items-center justify-center overflow-hidden">
                <svg ref={svgRef} style={{ maxWidth: '100%', maxHeight: '100%' }} />
            </div>

            <div className="w-full text-center leading-none mt-[0.5mm]">
                <span className="font-bold tracking-widest text-slate-900 block" style={{ fontSize: `${brandFontSize}mm` }}>
                    ILIOS
                </span>
                {stoneName && (
                    <span className="font-semibold text-slate-700 block truncate leading-tight mt-[0.2mm]" style={{ fontSize: `${stoneFontSize}mm` }}>
                        {stoneName}
                    </span>
                )}
            </div>

            <div 
                className="w-full flex justify-between items-end border-t border-black/10 pt-[0.5mm] mt-[0.5mm] leading-none" 
                style={{ fontSize: `${detailsFontSize}mm` }}
            >
                 <span className="font-bold">{priceDisplay}</span>
                 <div className="flex items-center">
                    <span className="font-medium text-slate-800">925°</span>
                 </div>
            </div>
        </div>
    );
};

export default BarcodeView;