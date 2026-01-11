
import React, { useMemo } from 'react';
import { Product, ProductVariant, Warehouse } from '../../types';
import { X, MapPin, Tag, Weight, Coins, Layers, DollarSign, Globe } from 'lucide-react';
import { formatCurrency } from '../../utils/pricingEngine';
import { SYSTEM_IDS } from '../../lib/supabase';

interface Props {
  product: Product;
  onClose: () => void;
  warehouses: Warehouse[];
}

export default function MobileProductDetails({ product, onClose, warehouses }: Props) {
  const masterSku = product.sku;
  
  // Calculate aggregate stock for this specific product/variant context
  // Note: For simplicity in mobile, we show the location stock of the *Master* product 
  // unless a specific variant logic is selected (future enhancement). 
  // For now, we list all variants and their total stock.

  const variants = product.variants || [];

  return (
    <div className="fixed inset-0 z-[100] bg-slate-50 flex flex-col animate-in slide-in-from-bottom-full duration-300">
      {/* Header / Image Area */}
      <div className="relative h-72 bg-slate-200 shrink-0">
        {product.image_url ? (
            <img src={product.image_url} className="w-full h-full object-cover" alt={product.sku} />
        ) : (
            <div className="w-full h-full flex items-center justify-center text-slate-400">No Image</div>
        )}
        
        {/* Actions Overlay */}
        <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-start bg-gradient-to-b from-black/60 to-transparent">
            <button onClick={onClose} className="p-2 bg-white/20 backdrop-blur-md rounded-full text-white hover:bg-white/30 transition-colors">
                <X size={20} />
            </button>
            <div className="bg-black/40 backdrop-blur-md px-3 py-1 rounded-full text-white text-xs font-bold border border-white/10">
                {product.category}
            </div>
        </div>

        <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-slate-900 to-transparent pt-12">
            <h1 className="text-3xl font-black text-white tracking-tight">{product.sku}</h1>
            <div className="flex items-center gap-2 text-slate-300 text-sm font-medium mt-1">
                {product.is_component && <span className="bg-blue-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">STX</span>}
                {product.production_type === 'Imported' && <span className="bg-purple-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1"><Globe size={10}/> IMP</span>}
            </div>
        </div>
      </div>

      {/* Content Scrollable */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {/* Main Stats Grid */}
          <div className="grid grid-cols-2 gap-4">
              <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
                  <div className="text-slate-400 text-xs font-bold uppercase mb-1 flex items-center gap-1"><DollarSign size={12}/> Τιμή</div>
                  <div className="text-xl font-black text-slate-900">
                      {product.selling_price > 0 ? formatCurrency(product.selling_price) : '-'}
                  </div>
              </div>
              <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
                  <div className="text-slate-400 text-xs font-bold uppercase mb-1 flex items-center gap-1"><Weight size={12}/> Βάρος</div>
                  <div className="text-xl font-black text-slate-900">{product.weight_g}g</div>
              </div>
          </div>

          {/* Stock by Location (Master) */}
          <div className="space-y-3">
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-wide flex items-center gap-2">
                  <MapPin size={16} className="text-emerald-500"/> Απόθεμα (Master)
              </h3>
              <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
                  <div className="flex justify-between items-center p-4 border-b border-slate-50 last:border-0">
                      <span className="text-sm font-bold text-slate-600">Κεντρική</span>
                      <span className="text-base font-black text-slate-900">{product.stock_qty}</span>
                  </div>
                  <div className="flex justify-between items-center p-4 border-b border-slate-50 last:border-0">
                      <span className="text-sm font-bold text-slate-600">Δειγματολόγιο</span>
                      <span className="text-base font-black text-slate-900">{product.sample_qty}</span>
                  </div>
                  {/* Show other locations if any exist in location_stock */}
                  {product.location_stock && Object.entries(product.location_stock).map(([whId, qty]) => {
                      if (whId === SYSTEM_IDS.CENTRAL || whId === SYSTEM_IDS.SHOWROOM) return null;
                      const whName = warehouses.find(w => w.id === whId)?.name || 'Unknown';
                      return (
                        <div key={whId} className="flex justify-between items-center p-4 border-b border-slate-50 last:border-0">
                            <span className="text-sm font-bold text-slate-600 truncate max-w-[200px]">{whName}</span>
                            <span className="text-base font-black text-slate-900">{qty}</span>
                        </div>
                      );
                  })}
              </div>
          </div>

          {/* Variants List */}
          {variants.length > 0 && (
              <div className="space-y-3">
                  <h3 className="text-sm font-black text-slate-800 uppercase tracking-wide flex items-center gap-2">
                      <Layers size={16} className="text-blue-500"/> Παραλλαγές ({variants.length})
                  </h3>
                  <div className="space-y-2">
                      {variants.map((v, idx) => (
                          <div key={idx} className="bg-white p-3 rounded-xl border border-slate-100 flex justify-between items-center shadow-sm">
                              <div>
                                  <div className="font-bold text-slate-800 text-sm"><span className="text-slate-400 font-mono mr-1">{product.sku}</span>{v.suffix}</div>
                                  <div className="text-[10px] text-slate-500">{v.description || 'No description'}</div>
                              </div>
                              <div className="text-right">
                                  <div className="font-black text-slate-900">{v.stock_qty} <span className="text-[10px] font-normal text-slate-400">τεμ</span></div>
                                  {v.selling_price && v.selling_price > 0 && (
                                      <div className="text-[10px] text-emerald-600 font-bold">{formatCurrency(v.selling_price)}</div>
                                  )}
                              </div>
                          </div>
                      ))}
                  </div>
              </div>
          )}
          
          {/* Tech Specs */}
          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 text-xs text-slate-600 space-y-2">
              <div className="flex justify-between">
                  <span>Επιμετάλλωση:</span>
                  <span className="font-bold text-slate-800">{product.plating_type}</span>
              </div>
              <div className="flex justify-between">
                  <span>Φύλο:</span>
                  <span className="font-bold text-slate-800">{product.gender}</span>
              </div>
              {product.secondary_weight_g ? (
                  <div className="flex justify-between">
                      <span>Β' Βάρος:</span>
                      <span className="font-bold text-slate-800">{product.secondary_weight_g}g</span>
                  </div>
              ) : null}
          </div>
          
          {/* Spacer for bottom safe area */}
          <div className="h-12"></div>
      </div>
    </div>
  );
}
