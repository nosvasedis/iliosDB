import React, { useState } from 'react';
import { Product, GlobalSettings, Material } from '../types';
import { RefreshCw, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { calculateProductCost } from '../utils/pricingEngine';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

interface Props {
  products: Product[];
  settings: GlobalSettings;
  materials: Material[];
}

export default function PricingManager({ products, settings, materials }: Props) {
  const [isCalculated, setIsCalculated] = useState(false);
  const [previewProducts, setPreviewProducts] = useState<Product[]>([]);
  const [isCommitting, setIsCommitting] = useState(false);
  const queryClient = useQueryClient();

  const handleRecalculate = () => {
    // Pass 'products' as the 4th argument for recursion
    // Use the CURRENT Global Settings directly
    const updatedProducts = products.map(p => {
      const cost = calculateProductCost(p, settings, materials, products);
      return { ...p, draft_price: cost.total };
    });

    setPreviewProducts(updatedProducts);
    setIsCalculated(true);
  };

  const commitPrices = async () => {
    setIsCommitting(true);
    const updates = previewProducts.map(p => ({
        sku: p.sku,
        active_price: p.draft_price,
        draft_price: p.draft_price
    }));

    try {
        const { error } = await supabase.from('products').upsert(updates);
        if (error) throw error;
        
        queryClient.invalidateQueries({ queryKey: ['products'] });
        setIsCalculated(false);
        setPreviewProducts([]);
        alert("Οι νέες τιμές ενημερώθηκαν επιτυχώς!");
    } catch(err) {
        console.error(err);
        alert("Σφάλμα κατά την ενημέρωση των τιμών.");
    } finally {
        setIsCommitting(false);
    }
  };

  const productsToList = isCalculated ? previewProducts : products;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">Διαχείριση Τιμών</h1>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="w-full md:w-1/3">
            <label className="block text-sm font-medium text-slate-600 mb-2">Τιμή Ασημιού (Από Ρυθμίσεις)</label>
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                <span className="font-mono text-xl font-bold text-slate-900">{settings.silver_price_gram} €/g</span>
            </div>
            <p className="text-xs text-slate-400 mt-1">Για αλλαγή τιμής, μεταβείτε στις Ρυθμίσεις.</p>
          </div>

          <div className="flex gap-4">
            <button onClick={handleRecalculate} className={`px-6 py-3 rounded-lg font-medium flex items-center gap-2 transition-colors ${isCalculated ? 'bg-slate-100 text-slate-500' : 'bg-slate-900 text-white'}`}>
              <RefreshCw size={18} /> Υπολογισμός
            </button>
            {isCalculated && (
              <button onClick={commitPrices} disabled={isCommitting} className="px-6 py-3 rounded-lg font-medium flex items-center gap-2 bg-green-600 text-white shadow-lg shadow-green-200 disabled:opacity-50">
                {isCommitting ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle size={18} />}
                {isCommitting ? 'Ενημέρωση...' : 'Ενημέρωση'}
              </button>
            )}
          </div>
        </div>
      </div>

      {isCalculated && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="p-4 border-b bg-amber-50 flex items-center gap-2 text-amber-800">
            <AlertCircle size={20} />
            <span className="font-medium">Προεπισκόπηση Αλλαγών</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 text-slate-500 font-medium">
                <tr>
                   <th className="p-3">SKU</th>
                   <th className="p-3">Κόστος (Old)</th>
                   <th className="p-3">Κόστος (New)</th>
                   <th className="p-3">Διαφορά</th>
                   <th className="p-3">Πώληση</th>
                   <th className="p-3">Νέο Margin</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {productsToList.filter(p => !p.is_component).map(p => {
                  const diff = p.draft_price - p.active_price;
                  const profit = p.selling_price - p.draft_price;
                  const margin = p.selling_price > 0 ? (profit / p.selling_price) * 100 : 0;
                  
                  return (
                    <tr key={p.sku} className="hover:bg-slate-50">
                      <td className="p-3 font-medium">{p.sku}</td>
                      <td className="p-3 text-slate-500">{p.active_price.toFixed(2)}€</td>
                      <td className="p-3 font-bold">{p.draft_price.toFixed(2)}€</td>
                      <td className={`p-3 font-medium ${diff > 0 ? 'text-red-500' : 'text-green-500'}`}>{diff > 0 ? '+' : ''}{diff.toFixed(2)}€</td>
                      <td className="p-3 text-slate-800 font-bold">{p.selling_price.toFixed(2)}€</td>
                      <td className={`p-3 font-bold ${margin < 30 ? 'text-red-500' : 'text-green-600'}`}>{margin.toFixed(1)}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}