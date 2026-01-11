
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
            const valueToEncode = transliterateForBarcode(finalSku);
            
            // Generate QR code with high error correction (Level H)
            QRCode.toDataURL(valueToEncode, {
                errorCorrectionLevel: 'H',
                margin: 0,
                scale: 12, // Even higher scale for crispness
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
    const skuFontSize = Math.min(activeHeight * 0.15, activeWidth * 0.14, 3.8);
    const detailsFontSize = Math.min(activeHeight * 0.12, activeWidth * 0.12, 3.0);
    const brandFontSize = Math.min(activeHeight * 0.11, activeWidth * 0.16, 2.4);
    const stoneFontSize = Math.min(activeHeight * 0.10, activeWidth * 0.13, 2.2);
    
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
            <div className="label-container" style={{ ...containerStyle, padding: '1mm' }}>
                <div className="w-full text-center leading-none mb-0.5">
                    <span className="font-black block uppercase" style={{ fontSize: `${skuFontSize}mm` }}>
                        {finalSku}
                    </span>
                </div>
                <div className="flex-1 w-full flex items-center justify-center overflow-hidden min-h-0">
                    {qrDataUrl && <img src={qrDataUrl} style={{ height: '100%', width: 'auto', display: 'block', imageRendering: 'pixelated' }} alt="QR" />}
                </div>
            </div>
        );
    }

    if (format === 'retail') {
        // Smart Stone Font Sizing & Wrapping
        const stoneNameLen = stoneName ? stoneName.length : 0;
        let stoneStyle: React.CSSProperties = {
            width: '100%',
            textAlign: 'center',
            fontWeight: 'bold',
            lineHeight: '0.9',
            overflow: 'hidden',
            marginTop: '0.5mm',
        };

        // Logic: Short text = Large & Single Line. Long text = Small & Multiline.
        if (stoneNameLen > 15) {
             stoneStyle = { 
                 ...stoneStyle, 
                 fontSize: '1.8mm', 
                 display: '-webkit-box', 
                 WebkitLineClamp: 2, 
                 WebkitBoxOrient: 'vertical', 
                 whiteSpace: 'normal', 
                 wordBreak: 'break-word' 
             };
        } else if (stoneNameLen > 8) {
             stoneStyle = { 
                 ...stoneStyle, 
                 fontSize: '2.0mm', 
                 whiteSpace: 'nowrap', 
                 textOverflow: 'ellipsis' 
             };
        } else {
             stoneStyle = { 
                 ...stoneStyle, 
                 fontSize: '2.2mm', 
                 whiteSpace: 'nowrap' 
             };
        }

        return (
            <div className="label-container" style={{ ...containerStyle, flexDirection: 'row', justifyContent: 'flex-start', padding: 0 }}>
                {/* 3.5cm Tail (Left) */}
                <div className="print:hidden border-r border-dashed border-slate-300 bg-slate-50 flex items-center justify-center" style={{ width: '35mm', height: '100%', flexShrink: 0 }}>
                    <span className="text-[8px] text-slate-300 font-bold uppercase -rotate-90">Tail</span>
                </div>
                <div className="hidden print:block" style={{ width: '35mm', height: '100%', flexShrink: 0 }}></div>

                {/* Printable Area (~3.7cm remaining) */}
                <div style={{ flex: 1, height: '100%', display: 'flex' }}>
                    
                    {/* Left Section (QR + SKU) ~1.85cm */}
                    <div style={{ width: '50%', height: '100%', display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingLeft: '1mm', paddingRight: '0.5mm', overflow: 'hidden' }}>
                         <div style={{ flexShrink: 0, marginRight: '0.5mm' }}>
                            {qrDataUrl && <img src={qrDataUrl} style={{ height: '6mm', width: '6mm', display: 'block', imageRendering: 'pixelated' }} alt="QR" />}
                         </div>
                         <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'flex-start' }}>
                             <span className="font-black block uppercase leading-none" style={{ fontSize: '2.2mm', wordBreak: 'break-all' }}>
                                {finalSku}
                            </span>
                         </div>
                    </div>

                    {/* Right Section (Codified Price + Stone) ~1.85cm */}
                    <div style={{ width: '50%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', paddingLeft: '0.5mm', paddingRight: '1mm' }}>
                        <span className="font-black leading-none truncate w-full text-center" style={{ fontSize: '2.6mm' }}>
                            {codifiedPrice}
                        </span>
                        {stoneName && (
                            <div style={stoneStyle}>
                                {stoneName}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    // Standard Wholesale Format (Optimized for 15mm height)
    return (
        <div className="label-container" style={{ ...containerStyle, padding: '0.6mm 0.8mm' }}>
            {/* SKU HEADER - Minimal Margin */}
            <div className="w-full text-center leading-none">
                <span className="font-black block uppercase tracking-tighter text-black" style={{ fontSize: `${skuFontSize}mm` }}>
                    {finalSku}
                </span>
            </div>

            {/* QR CODE CENTER - Maximize flexible area by using min-h-0 */}
            <div className="flex-1 w-full flex items-center justify-center overflow-hidden min-h-0 py-0.5">
                {qrDataUrl && <img src={qrDataUrl} style={{ height: '100%', maxWidth: '100%', objectFit: 'contain', display: 'block' }} alt="QR" />}
            </div>

            {/* BRAND & STONE - Condensed vertical space */}
            <div className="w-full text-center leading-[1.1] mb-0.5">
                {stoneName && (
                    <span className="font-bold text-black block truncate leading-none" style={{ fontSize: `${stoneFontSize}mm` }}>
                        {stoneName}
                    </span>
                )}
                <span className="font-black tracking-[0.1em] text-black block uppercase leading-none" style={{ fontSize: `${brandFontSize}mm`, marginTop: '0.2mm' }}>
                    ILIOS
                </span>
            </div>

            {/* PRICE & HALLMARK FOOTER - Border integrated with price */}
            <div className="w-full flex justify-between items-center border-t border-black pt-0.5 leading-none">
                 <span className="font-black text-black" style={{ fontSize: `${detailsFontSize}mm` }}>{priceDisplay}</span>
                 <span className="font-black text-black" style={{ fontSize: `${detailsFontSize * 0.9}mm` }}>925°</span>
            </div>
        </div>
    );
};

export default BarcodeView;
