import React, { useEffect, useState, useMemo } from 'react';
import QRCode from 'qrcode';
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
    const [qrDataUrl, setQrDataUrl] = useState<string>('');

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
        if (finalSku) {
            // QR codes support Greek characters, but we transliterate to ensure compatibility 
            // with scanners in "Keyboard Emulation" mode set to US/International layout.
            const valueToEncode = transliterateForBarcode(finalSku);
            
            // Generate QR code with high error correction (Level H)
            // This ensures it remains scannable even if part of the tiny label is damaged.
            QRCode.toDataURL(valueToEncode, {
                errorCorrectionLevel: 'H',
                margin: 0,
                scale: 10, // High res for sharp print
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
    }, [finalSku]);

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
            <div className="label-container" style={{ ...containerStyle, padding: '1mm 1.5mm' }}>
                <div className="w-full text-center leading-none mb-1">
                    <span className="font-black block uppercase" style={{ fontSize: `${skuFontSize}mm` }}>
                        {finalSku}
                    </span>
                </div>
                <div className="flex-1 w-full flex items-center justify-center overflow-hidden">
                    {qrDataUrl && <img src={qrDataUrl} style={{ height: '100%', width: 'auto', display: 'block' }} alt="QR" />}
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

                {/* Printable Area Wrapper (~3.7cm total width) */}
                <div style={{ flex: 1, minWidth: 0, height: '100%', display: 'flex', alignItems: 'center' }}>
                    
                    {/* Part 1 (Left of content): QR Code - Nice and Small but High Contrast */}
                    <div style={{ width: '30%', minWidth: 0, height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1mm' }}>
                        {qrDataUrl && <img src={qrDataUrl} style={{ height: '7mm', width: '7mm', display: 'block' }} alt="QR" />}
                    </div>

                    {/* Part 2 (Middle of content): SKU Header */}
                    <div style={{ width: '35%', minWidth: 0, height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 0.5mm', overflow: 'hidden' }}>
                        <span className="font-black block uppercase leading-none truncate w-full text-center" style={{ fontSize: '2.4mm' }}>
                            {finalSku}
                        </span>
                    </div>

                    {/* Part 3 (Right of content): Codified Price & Stone */}
                    <div style={{ width: '35%', minWidth: 0, height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 0.5mm', overflow: 'hidden' }}>
                        <span className="font-black leading-none truncate w-full text-center" style={{ fontSize: '2.6mm' }}>
                            {codifiedPrice}
                        </span>
                        {stoneName && (
                            <span className="font-bold block text-center leading-none" style={{ fontSize: '1.8mm', marginTop: '0.8mm', width: '100%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
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
        <div className="label-container" style={{ ...containerStyle, padding: '1.2mm 1.5mm' }}>
            {/* SKU HEADER */}
            <div className="w-full text-center leading-none mb-1">
                <span className="font-black block uppercase tracking-tight text-black" style={{ fontSize: `${skuFontSize}mm` }}>
                    {finalSku}
                </span>
            </div>

            {/* QR CODE CENTER - Square and Compact */}
            <div className="flex-1 w-full flex items-center justify-center overflow-hidden py-1">
                {qrDataUrl && <img src={qrDataUrl} style={{ height: '100%', width: 'auto', display: 'block' }} alt="QR" />}
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