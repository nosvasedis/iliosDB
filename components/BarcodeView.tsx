import React, { useEffect, useRef, useMemo } from 'react';
import JsBarcode from 'jsbarcode';
import { Product, ProductVariant } from '../types';
import { STONE_CODES_MEN, STONE_CODES_WOMEN, FINISH_CODES } from '../constants';

interface Props {
    product: Product;
    variant?: ProductVariant;
    width: number;
    height: number;
}

const BarcodeView: React.FC<Props> = ({ product, variant, width, height }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    // Construct SKU cleanly
    // Ensure we handle potential null/undefined gracefully although strict typing helps
    const baseSku = product?.sku || '';
    const suffix = variant?.suffix || '';
    const finalSku = `${baseSku}${suffix}`;

    // --- Smart Stone Detection Logic ---
    const stoneName = useMemo(() => {
        // 1. Try to extract from variant description (most reliable if populated correctly)
        if (variant?.description) {
            let desc = variant.description;
            
            // Remove known finishes from description to isolate the stone name
            // Example: "Gold Plated - Onyx" -> "Onyx"
            const finishes = Object.values(FINISH_CODES);
            finishes.forEach(finish => {
                if (finish) {
                    // Remove "Finish -", "- Finish", or just "Finish"
                    const regex = new RegExp(`(^|\\s*-\\s*)${finish}(\\s*-\\s*|$)`, 'i');
                    desc = desc.replace(regex, '').trim();
                }
            });
            
            // Cleanup common words
            desc = desc.replace(/Λουστρέ/gi, '').replace(/Πατίνα/gi, '').trim();
            // Remove leading/trailing hyphens/spaces
            desc = desc.replace(/^-+\s*/, '').replace(/\s*-+$/, '').trim();

            // If anything is left and it's not empty, it's likely the stone/color name
            if (desc && desc.length > 2) return desc; 
        }
        
        // 2. Fallback: Analyze suffix against known stone codes
        if (suffix) {
             const allStones = { ...STONE_CODES_MEN, ...STONE_CODES_WOMEN };
             // Sort by length desc to match longest code first
             const sortedCodes = Object.keys(allStones).sort((a,b) => b.length - a.length);
             
             for (const code of sortedCodes) {
                 if (suffix.includes(code)) {
                     return allStones[code];
                 }
             }
        }
        
        return null;
    }, [variant]);

    useEffect(() => {
        if (canvasRef.current && finalSku) {
            try {
                JsBarcode(canvasRef.current, finalSku, {
                    format: 'CODE128',
                    displayValue: false, // We render SKU manually to control positioning
                    height: 50, // Base height, CSS will scale it to fit container
                    width: 2, 
                    margin: 0,
                    background: '#ffffff'
                });
            } catch (e) {
                console.error("JsBarcode error:", e);
            }
        }
    }, [finalSku]);

    // --- DYNAMIC SIZING ENGINE ---
    // Calculate font sizes in 'mm' relative to the label dimensions to ensure perfect fit.
    
    // 1. SKU (Top): Priority #1. Must be legible.
    const skuLength = finalSku.length;
    // Estimate width consumption. 
    const maxSkuWidthFont = width / (Math.max(skuLength, 1) * 0.6); 
    const maxSkuHeightFont = height * 0.18; 
    const skuFontSize = Math.min(maxSkuWidthFont, maxSkuHeightFont);

    // 2. Details (Bottom)
    const detailsFontSize = Math.min(height * 0.11, width * 0.14); 

    // 3. Brand
    const brandFontSize = Math.min(height * 0.14, width * 0.22);

    // 4. Stone
    const stoneFontSize = Math.min(height * 0.09, width * 0.16);
    
    // Formatted Price
    const priceDisplay = product.selling_price > 0 ? `${product.selling_price.toFixed(0)}€` : '';

    return (
        <div
            className="bg-white text-black flex flex-col items-center justify-between overflow-hidden relative break-inside-avoid page-break-inside-avoid"
            style={{
                width: `${width}mm`,
                height: `${height}mm`,
                padding: '1mm', 
                fontFamily: `'Inter', sans-serif`,
                boxSizing: 'border-box',
                border: '1px solid #eee' // Light border for screen preview, normally hidden by @media print in global styles if set
            }}
        >
            {/* ROW 1: SKU */}
            <div className="w-full text-center leading-none mb-[0.5mm]" style={{ flex: '0 0 auto' }}>
                <span className="font-bold block uppercase" style={{ fontSize: `${skuFontSize}mm` }}>
                    {finalSku}
                </span>
            </div>

            {/* ROW 2: BARCODE (Flexible Height) */}
            <div className="flex-1 w-full flex items-center justify-center overflow-hidden" style={{ minHeight: 0 }}>
                {/* The canvas scales to fit the flex container without overflowing */}
                <canvas ref={canvasRef} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
            </div>

            {/* ROW 3: BRAND & STONE */}
            <div className="w-full text-center leading-none mt-[0.5mm]" style={{ flex: '0 0 auto' }}>
                <span className="font-bold tracking-widest text-slate-900 block" style={{ fontSize: `${brandFontSize}mm` }}>
                    ILIOS
                </span>
                {stoneName && (
                    <span className="font-semibold text-slate-700 block truncate leading-tight mt-[0.2mm]" style={{ fontSize: `${stoneFontSize}mm` }}>
                        {stoneName}
                    </span>
                )}
            </div>

            {/* ROW 4: DETAILS (Price Left | 925 & Weight Right) */}
            <div 
                className="w-full flex justify-between items-end border-t border-black/10 pt-[0.5mm] mt-[0.5mm] leading-none" 
                style={{ fontSize: `${detailsFontSize}mm`, flex: '0 0 auto' }}
            >
                 <span className="font-bold">{priceDisplay}</span>
                 
                 <div className="flex items-center gap-[0.5mm]">
                    <span className="font-medium text-slate-800">925°</span>
                    {product.weight_g > 0 && <span className="font-medium text-slate-600">{product.weight_g}g</span>}
                 </div>
            </div>
        </div>
    );
};

export default BarcodeView;