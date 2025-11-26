import React from 'react';
import { Product, ProductVariant } from '../types';

interface Props {
    product: Product;
    variant?: ProductVariant;
    width: number;
    height: number;
}

export default function BarcodeView({ product, variant, width, height }: Props) {
  
  // Appends suffix if variant exists
  const finalSku = variant ? `${product.sku}${variant.suffix}` : product.sku;
  // If variant description is present, use it (e.g. Stone Name). Otherwise fall back to category.
  const description = variant ? variant.description : product.category;

  const generateBars = (str: string) => {
    return str.split('').map((char, i) => (
      <div 
        key={i} 
        style={{ 
          width: char.charCodeAt(0) % 2 === 0 ? '0.5mm' : '1mm', 
          height: '100%', 
          backgroundColor: 'black',
          marginRight: '0.5mm'
        }} 
      />
    ));
  };
  
  // Dynamic font size calculation based on label height
  const baseFontSize = height / 7; // Adjust this ratio as needed

  return (
    <div 
      className="flex flex-col items-center justify-between p-1 bg-white box-border"
      style={{
        width: `${width}mm`,
        height: `${height}mm`,
        fontFamily: 'Arial, sans-serif'
      }}
    >
        {/* Brand Name */}
        <h2 
          className="font-bold tracking-widest text-black uppercase w-full text-center border-b border-black"
          style={{ fontSize: `${baseFontSize * 0.9}px`, paddingBottom: '0.5mm', marginBottom: '0.5mm' }}
        >
          ILIOS KOSMIMA
        </h2>
        
        <div className="flex justify-between items-end w-full px-1">
            <span className="font-black" style={{ fontSize: `${baseFontSize * 1.5}px`, lineHeight: 1 }}>{finalSku}</span>
            <span className="font-bold" style={{ fontSize: `${baseFontSize * 1.3}px`, lineHeight: 1 }}>{product.selling_price > 0 ? product.selling_price.toFixed(2) : '-'}€</span>
        </div>
        
        {/* Simulated Barcode */}
        <div className="flex justify-center items-end w-full overflow-hidden" style={{ height: `${height * 0.25}mm`, marginBottom: '0.5mm' }}>
           {generateBars(finalSku + "925")} 
        </div>
        <p className="uppercase" style={{ fontSize: `${baseFontSize * 0.6}px`, letterSpacing: '0.2em' }}>{finalSku}</p>
        
        <div className="flex justify-between items-center text-black font-bold w-full border-t border-black" style={{ paddingTop: '0.5mm', fontSize: `${baseFontSize * 0.75}px`}}>
            <span>Ag925</span>
            <span className="uppercase text-center truncate px-1">{description}</span>
            <span>{product.weight_g}g</span>
        </div>
    </div>
  );
}