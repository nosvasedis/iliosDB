
import React, { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';
import { Product, ProductVariant } from '../types';

interface Props {
    product: Product;
    variant?: ProductVariant;
    width: number;
    height: number;
}

export default function BarcodeView({ product, variant, width, height }: Props) {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    const finalSku = variant ? `${product.sku}${variant.suffix}` : product.sku;

    useEffect(() => {
        if (canvasRef.current) {
            try {
                JsBarcode(canvasRef.current, finalSku, {
                    format: 'CODE128',
                    displayValue: false, // The SKU is rendered separately and is more prominent
                    height: Math.max(10, height * 1.5), // Shorter barcode height
                    width: 1, // Use thin bars for compact barcodes
                    margin: 0,
                });
            } catch (e) {
                console.error("JsBarcode error:", e);
                // Fallback text if barcode generation fails
                const ctx = canvasRef.current.getContext('2d');
                if (ctx) {
                    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
                    ctx.fillStyle = 'red';
                    ctx.font = '10px Arial';
                    ctx.fillText('Error', 5, 10);
                }
            }
        }
    }, [finalSku, width, height]);

    // Dynamic font size calculation based on label height for optimal readability on small tags
    const skuFontSize = Math.max(2.2, height / 3.8);
    const priceFontSize = Math.max(2, height / 4.5);
    const iliosFontSize = Math.max(1.3, height / 7);
    const detailsFontSize = Math.max(1.2, height / 8);

    return (
        <div
            className="bg-white text-black flex flex-col items-center justify-between p-1 box-border overflow-hidden"
            style={{
                width: `${width}mm`,
                height: `${height}mm`,
                fontFamily: `'Segoe UI', 'Arial', sans-serif`,
            }}
        >
            {/* Top Row: SKU and Price are the most important elements */}
            <div className="w-full flex justify-between items-baseline" style={{ padding: '0 0.5mm' }}>
                <span className="font-bold" style={{ fontSize: `${skuFontSize}mm`, lineHeight: '1' }}>
                    {finalSku}
                </span>
                <span className="font-bold" style={{ fontSize: `${priceFontSize}mm`, lineHeight: '1' }}>
                    {product.selling_price > 0 ? `${product.selling_price.toFixed(0)}€` : ''}
                </span>
            </div>

            {/* Middle: A smaller, cleaner barcode */}
            <div className="w-full flex-shrink-0" style={{ minHeight: `${height * 0.2}mm`, padding: '0.5mm 0' }}>
                <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />
            </div>

            {/* Brand Name */}
            <div className="w-full text-center" style={{ fontSize: `${iliosFontSize}mm`, fontWeight: 'bold', lineHeight: '1', color: '#333', letterSpacing: '0.05em' }}>
                ILIOS
            </div>
            
            {/* Bottom Row: Minimalist details */}
            <div className="w-full text-center" style={{ fontSize: `${detailsFontSize}mm`, lineHeight: '1', color: '#333' }}>
                <span>Ag925 - {product.weight_g}g</span>
            </div>
        </div>
    );
}
