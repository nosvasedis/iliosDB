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
    const description = variant ? variant.description : product.category;

    useEffect(() => {
        if (canvasRef.current) {
            try {
                JsBarcode(canvasRef.current, finalSku, {
                    format: 'CODE128',
                    displayValue: false, // We will render the value ourselves for better styling
                    height: Math.max(10, height * 1.5), // Heuristic for pixel height
                    width: Math.max(0.5, width / 40), // Heuristic for bar width
                    margin: 0,
                });
            } catch (e) {
                console.error("JsBarcode error:", e);
                // Fallback text if barcode generation fails (e.g., invalid characters)
                const ctx = canvasRef.current.getContext('2d');
                if (ctx) {
                    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
                    ctx.fillStyle = 'red';
                    ctx.font = '12px Arial';
                    ctx.fillText('Invalid Barcode', 10, 20);
                }
            }
        }
    }, [finalSku, width, height]);

    // Dynamic font size calculation based on label height for optimal readability
    const baseFontSize = height / 8;

    return (
        <div
            className="bg-white text-black flex flex-col items-center justify-between p-1 box-border"
            style={{
                width: `${width}mm`,
                height: `${height}mm`,
                fontFamily: 'Arial, sans-serif',
                marginBottom: '1mm',
                marginRight: '1mm',
            }}
        >
            {/* Top row: Brand and Price */}
            <div className="w-full flex justify-between items-center px-1">
                <span className="font-bold tracking-wider" style={{ fontSize: `${Math.max(4, baseFontSize * 0.9)}px` }}>ILIOS KOSMIMA</span>
                <span className="font-extrabold" style={{ fontSize: `${Math.max(6, baseFontSize * 1.5)}px` }}>
                    {product.selling_price > 0 ? `${product.selling_price.toFixed(2)}€` : ''}
                </span>
            </div>

            {/* Middle: Barcode and SKU Text */}
            <div className="w-full flex-grow flex flex-col items-center justify-center py-1">
                <canvas ref={canvasRef} style={{ width: '95%', height: 'auto', maxHeight: `${height * 0.4}mm` }} />
                <p className="font-mono font-bold tracking-widest" style={{ fontSize: `${Math.max(5, baseFontSize * 1.1)}px`, marginTop: '0.5mm' }}>
                    {finalSku}
                </p>
            </div>

            {/* Bottom Row: Details */}
            <div className="w-full flex justify-between items-center px-1 border-t border-black pt-1" style={{ fontSize: `${Math.max(4, baseFontSize * 0.8)}px` }}>
                <span className="font-medium">Ag925</span>
                <span className="uppercase font-medium text-center truncate px-1">{description}</span>
                <span className="font-medium">{product.weight_g}g</span>
            </div>
        </div>
    );
}