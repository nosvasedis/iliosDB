import React, { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';
import { Product, ProductVariant } from '../types';

interface Props {
    product: Product;
    variant?: ProductVariant;
    width: number;
    height: number;
}

const BarcodeView: React.FC<Props> = ({ product, variant, width, height }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    const finalSku = variant ? `${product.sku}${variant.suffix}` : product.sku;

    useEffect(() => {
        if (canvasRef.current) {
            try {
                JsBarcode(canvasRef.current, finalSku, {
                    format: 'CODE128',
                    displayValue: false, 
                    height: Math.max(10, height * 1.5), 
                    width: 1.2, // Slightly wider bars for better scanning
                    margin: 0,
                    background: '#ffffff'
                });
            } catch (e) {
                console.error("JsBarcode error:", e);
            }
        }
    }, [finalSku, width, height]);

    // Dynamic font size calculation to prevent clipping for long SKUs
    // Base size is relative to height, but scales down if string is long
    const baseSkuSize = Math.max(2.2, height / 3.8);
    const charCount = finalSku.length;
    // Reduce font size if SKU is longer than 8 characters
    const skuFontSize = charCount > 8 ? baseSkuSize * (8 / charCount) : baseSkuSize;

    const priceFontSize = Math.max(2, height / 4.5);
    const iliosFontSize = Math.max(1.3, height / 7);
    const detailsFontSize = Math.max(1.2, height / 8);

    return (
        <div
            className="bg-white text-black flex flex-col items-center justify-between p-0.5 box-border overflow-hidden"
            style={{
                width: `${width}mm`,
                height: `${height}mm`,
                fontFamily: `'Segoe UI', 'Arial', sans-serif`,
                border: '1px solid #eee' // Light border to visualize limits during preview
            }}
        >
            {/* Top Row: SKU and Price */}
            <div className="w-full flex justify-between items-baseline whitespace-nowrap" style={{ padding: '0 1mm' }}>
                <span className="font-bold tracking-tight" style={{ fontSize: `${skuFontSize}mm`, lineHeight: '1.1' }}>
                    {finalSku}
                </span>
                <span className="font-bold" style={{ fontSize: `${priceFontSize}mm`, lineHeight: '1.1' }}>
                    {product.selling_price > 0 ? `${product.selling_price.toFixed(0)}€` : ''}
                </span>
            </div>

            {/* Middle: Barcode */}
            <div className="w-full flex-shrink-0 flex items-center justify-center overflow-hidden" style={{ height: '40%', padding: '0.5mm 0' }}>
                <canvas ref={canvasRef} style={{ maxWidth: '100%', maxHeight: '100%' }} />
            </div>

            {/* Brand Name */}
            <div className="w-full text-center truncate" style={{ fontSize: `${iliosFontSize}mm`, fontWeight: 'bold', lineHeight: '1', color: '#333', letterSpacing: '0.05em' }}>
                ILIOS KOSMIMA
            </div>
            
            {/* Bottom Row: Details */}
            <div className="w-full text-center whitespace-nowrap" style={{ fontSize: `${detailsFontSize}mm`, lineHeight: '1', color: '#333' }}>
                <span>Ag925 - {product.weight_g}g</span>
            </div>
        </div>
    );
};

export default BarcodeView;