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
    const finalSku = variant ? `${product.sku}${variant.suffix}` : product.sku;

    // --- Smart Stone Detection Logic ---
    const stoneName = useMemo(() => {
        // 1. Try to extract from variant description (most reliable if populated correctly)
        if (variant?.description) {
            let desc = variant.description;
            // Remove known finishes from description to isolate the stone name
            const finishes = Object.values(FINISH_CODES);
            finishes.forEach(finish => {
                // Regex to remove "Finish", "Finish -", "- Finish" case insensitively
                if (finish) {
                    desc = desc.replace(new RegExp(`^${finish}\\s*-\\s*`, 'i'), '')
                               .replace(new RegExp(`\\s*-\\s*${finish}$`, 'i'), '')
                               .replace(new RegExp(`^${finish}$`, 'i'), '');
                }
            });
            desc = desc.trim();
            // If anything is left and it's not empty, it's likely the stone/color name
            if (desc) return desc; 
        }
        
        // 2. Fallback: Analyze suffix against known stone codes
        const suffix = variant?.suffix || '';
        if (suffix) {
             const allStones = { ...STONE_CODES_MEN, ...STONE_CODES_WOMEN };
             // Sort by length desc to match longest code first (e.g. match PCO before CO)
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
        if (canvasRef.current) {
            try {
                // If stone exists, make barcode slightly shorter to accommodate the text below
                // This ensures the label never looks cramped
                const barcodeHeightRatio = stoneName ? 0.35 : 0.45;
                
                JsBarcode(canvasRef.current, finalSku, {
                    format: 'CODE128',
                    displayValue: false, // We render SKU manually to control positioning
                    height: Math.max(10, height * 10), // Render high-res, CSS scales it down
                    width: 2, // Width factor
                    margin: 0,
                    background: '#ffffff'
                });
            } catch (e) {
                console.error("JsBarcode error:", e);
            }
        }
    }, [finalSku, width, height, stoneName]);

    // --- Smart Dynamic Sizing (based on Label Height) ---
    // We use 'mm' for fonts to ensure print consistency relative to label size settings.
    
    // SKU: Large and bold. Scale down if SKU is very long to prevent clipping.
    const skuCharCount = finalSku.length;
    const baseSkuSize = height * 0.18; // approx 5.4mm for a 30mm label
    const skuFontSize = Math.min(baseSkuSize, width / (skuCharCount * 0.65)); 

    const priceFontSize = height * 0.18;
    const brandFontSize = height * 0.11; // approx 3.3mm
    const stoneFontSize = height * 0.09; // approx 2.7mm (Small)
    const detailsFontSize = height * 0.09; 

    return (
        <div
            className="bg-white text-black flex flex-col items-center justify-between overflow-hidden relative break-inside-avoid page-break-inside-avoid"
            style={{
                width: `${width}mm`,
                height: `${height}mm`,
                padding: '1mm',
                fontFamily: `'Inter', 'Segoe UI', sans-serif`,
                boxSizing: 'border-box',
                border: '1px solid #eee' // Light border for screen preview visibility
            }}
        >
            {/* TOP ROW: SKU & Price */}
            <div className="w-full flex justify-between items-end leading-none">
                <span className="font-bold whitespace-nowrap" style={{ fontSize: `${skuFontSize}mm` }}>
                    {finalSku}
                </span>
                <span className="font-bold whitespace-nowrap" style={{ fontSize: `${priceFontSize}mm` }}>
                    {product.selling_price > 0 ? `${product.selling_price.toFixed(0)}€` : ''}
                </span>
            </div>

            {/* MIDDLE: Barcode */}
            <div className="flex-1 w-full flex items-center justify-center overflow-hidden my-[0.5mm]">
                <canvas ref={canvasRef} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
            </div>

            {/* BRAND & STONE */}
            <div className="w-full flex flex-col items-center justify-center leading-none">
                <span className="font-bold tracking-widest text-slate-900" style={{ fontSize: `${brandFontSize}mm` }}>
                    ILIOS
                </span>
                {stoneName && (
                    <span className="font-semibold text-slate-600 truncate max-w-full mt-[0.5mm]" style={{ fontSize: `${stoneFontSize}mm` }}>
                        {stoneName}
                    </span>
                )}
            </div>

            {/* BOTTOM: Metal & Weight */}
            <div className="w-full text-center mt-[0.5mm] leading-none border-t border-black/10 pt-[0.5mm]" style={{ fontSize: `${detailsFontSize}mm` }}>
                 <span>925° {product.weight_g}g</span>
            </div>
        </div>
    );
};

export default BarcodeView;