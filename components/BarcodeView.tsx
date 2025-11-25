import React from 'react';
import { Product, ProductVariant } from '../types';

export default function BarcodeView({ product, variant }: { product: Product, variant?: ProductVariant }) {
  
  // Appends suffix if variant exists
  const finalSku = variant ? `${product.sku}${variant.suffix}` : product.sku;
  // If variant description is present, use it (e.g. Stone Name). Otherwise fall back to category.
  const description = variant ? variant.description : product.category;

  const generateBars = (str: string) => {
    return str.split('').map((char, i) => (
      <div 
        key={i} 
        style={{ 
          width: char.charCodeAt(0) % 2 === 0 ? '2px' : '4px', 
          height: '100%', 
          backgroundColor: 'black',
          marginRight: '2px'
        }} 
      />
    ));
  };

  return (
    <div className="flex flex-col items-center justify-center p-6 bg-white border-2 border-slate-200 rounded-lg w-[320px] h-[220px] mx-auto print:border-none print:w-full print:h-auto print:mx-0 print:p-0">
      <div className="text-center w-full">
        {/* Brand Name in Latin */}
        <h2 className="text-lg font-bold tracking-widest text-slate-900 mb-2 uppercase border-b border-slate-300 pb-1">ILIOS KOSMIMA</h2>
        
        <div className="flex justify-between items-end mb-2 px-2">
            <span className="text-2xl font-black tracking-tight">{finalSku}</span>
            <span className="text-xl font-bold">{product.selling_price > 0 ? product.selling_price.toFixed(2) : '-'}€</span>
        </div>
        
        {/* Simulated Barcode */}
        <div className="h-14 flex justify-center items-end w-full overflow-hidden mb-1 px-4">
           {generateBars(finalSku + "925")} 
        </div>
        <p className="text-[10px] tracking-[0.4em] text-slate-500 uppercase mb-2">{finalSku}</p>
        
        <div className="flex justify-between items-center text-xs text-slate-800 font-bold border-t border-slate-300 pt-1 px-1">
            <span>Ag925</span>
            {/* Description (Stone) takes priority space */}
            <span className="uppercase truncate max-w-[140px] text-center px-2">{description}</span>
            <span>{product.weight_g}g</span>
        </div>
      </div>
    </div>
  );
}