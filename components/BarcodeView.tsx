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
    const canvasRef = useRef<HTMLCanvasElement>(null);

    // Construct SKU cleanly
    const baseSku = product?.sku || '';
    const suffix = variant?.suffix || '';
    const finalSku = `${baseSku}${suffix}`;

    // --- PRICE DISPLAY: WHOLESALE ONLY ---
    const wholesalePrice = variant?.selling_price ?? product.selling_price;

    // --- Smart Stone Detection Logic ---
    const stoneName = useMemo(() => {
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
    }, [variant]);

    useEffect(() => {
        if (canvasRef.current && finalSku) {
            try {
                // Transliterate SKU to handle Greek characters which are invalid for CODE128
                const encodedSku = transliterateForBarcode(finalSku);
                
                // Adjust barcode settings based on format
                const isSimple = format === 'simple';
                JsBarcode(canvasRef.current, encodedSku, {
                    format: 'CODE128',
                    displayValue: false, 
                    height: isSimple ? 80 : 50, // Taller barcode for simple mode
                    width: 2, 
                    margin: 0,
                    background: '#ffffff'
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
    const stoneFontSize = Math.min(height * 0.12, width * 0.17); // Slightly increased
    
    const priceDisplay = wholesalePrice > 0 ? `${wholesalePrice.toFixed(2).replace('.', ',')}€` : '';

    // --- RENDER SIMPLE FORMAT (Requested for individual print) ---
    if (format === 'simple') {
        return (
            <div
                className="bg-white text-black flex flex-col items-center justify-center overflow-hidden relative break-inside-avoid page-break-inside-avoid"
                style={{
                    width: `${width}mm`,
                    height: `${height}mm`,
                    padding: '2mm', 
                    fontFamily: `'Inter', sans-serif`,
                    boxSizing: 'border-box',
                    border: '1px solid #eee' 
                }}
            >
                <div className="flex-1 w-full flex items-center justify-center overflow-hidden" style={{ minHeight: 0 }}>
                    <canvas ref={canvasRef} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                </div>
                <div className="w-full text-center leading-none mt-[2px]" style={{ flex: '0 0 auto' }}>
                    <span className="font-bold block uppercase" style={{ fontSize: '10px' }}>
                        {finalSku}
                    </span>
                </div>
            </div>
        );
    }

    // --- RENDER STANDARD FORMAT (Default for mass print) ---
    return (
        <div
            className="bg-white text-black flex flex-col items-center justify-between overflow-hidden relative break-inside-avoid page-break-inside-avoid"
            style={{
                width: `${width}mm`,
                height: `${height}mm`,
                padding: '1mm', 
                fontFamily: `'Inter', sans-serif`,
                boxSizing: 'border-box',
                border: '1px solid #eee'
            }}
        >
            {/* ROW 1: SKU */}
            <div className="w-full text-center leading-none mb-[0.5mm]" style={{ flex: '0 0 auto' }}>
                <span className="font-bold block uppercase" style={{ fontSize: `${skuFontSize}mm` }}>
                    {finalSku}
                </span>
            </div>

            {/* ROW 2: BARCODE */}
            <div className="flex-1 w-full flex items-center justify-center overflow-hidden" style={{ minHeight: 0 }}>
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

            {/* ROW 4: DETAILS */}
            <div 
                className="w-full flex justify-between items-end border-t border-black/10 pt-[0.5mm] mt-[0.5mm] leading-none" 
                style={{ fontSize: `${detailsFontSize}mm`, flex: '0 0 auto' }}
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
