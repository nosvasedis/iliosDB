

import React, { useState } from 'react';
import { Product, GlobalSettings, Material } from '../types';
import { RefreshCw, CheckCircle, AlertCircle, Loader2, DollarSign, ArrowRight, TrendingUp, Percent } from 'lucide-react';
import { calculateProductCost } from '../utils/pricingEngine';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useUI } from './UIProvider';

interface Props {
  products: Product[];
  settings: GlobalSettings;
  materials: Material[];
}

type Mode = 'cost' | 'selling';

export default function PricingManager({ products, settings, materials }: Props) {
  const [mode, setMode] = useState<Mode>('cost');
  const [markupPercent, setMarkupPercent] = useState<number>(0);
  
  const [isCalculated, setIsCalculated] = useState(false);
  const [previewProducts, setPreviewProducts] = useState<Product[]>([]);
  const [isCommitting, setIsCommitting] = useState(false);
  
  const queryClient = useQueryClient();
  const { showToast, confirm } = useUI();

  // Reset when switching modes
  const switchMode = (newMode: Mode) => {
    setMode(newMode);
    setIsCalculated(false);
    setPreviewProducts([]);
    setMarkupPercent(0);
  };

  const handleRecalculate = () => {
    let updatedProducts: Product[] = [];

    if (mode === 'cost') {
        // Recalculate COST based on Silver Price
        updatedProducts = products.map(p => {
            const cost = calculateProductCost(p, settings, materials, products);
            return { ...p, draft_price: cost.total };
        });
        showToast("Το νέο κόστος υπολογίστηκε βάσει τιμής ασημιού.", 'info');
    } else {
        // Recalculate SELLING PRICE based on Markup %
        // We use draft_price to store the NEW TARGET selling price
        const multiplier = 1 + (markupPercent / 100);
        updatedProducts = products.map(p => {
             // Calculate new selling price based on CURRENT selling price
             const newSelling = p.selling_price * multiplier;
             return { ...p, draft_price: parseFloat(newSelling.toFixed(2)) }; 
        });
        showToast(`Υπολογίστηκε νέα τιμή χονδρικής (${markupPercent > 0 ? '+' : ''}${markupPercent}%).`, 'info');
    }

    setPreviewProducts(updatedProducts);
    setIsCalculated(true);
  };

  const commitPrices = async () => {
    const yes = await confirm({
        title: mode === 'cost' ? 'Ενημέρωση Κόστους' : 'Ενημέρωση Τιμών Χονδρικής',
        message: mode === 'cost' 
            ? 'Θα ενημερωθεί η Τιμή Κόστους (Active Price) για όλα τα προϊόντα.' 
            : `Θα αλλάξει η Τιμή Χονδρικής για ${previewProducts.length} προϊόντα. Είστε σίγουροι;`,
        confirmText: 'Ενημέρωση',
        isDestructive: false
    });

    if (!yes) return;

    setIsCommitting(true);
    
    try {
        // BATCH UPDATE using Promise.all
        // We use UPDATE instead of UPSERT to avoid "null value in column prefix" errors.
        // We are strictly modifying existing rows.
        const promises = previewProducts.map(p => {
            const updates: any = {};
            
            if (mode === 'cost') {
                updates.active_price = p.draft_price;
                updates.draft_price = p.draft_price; // Sync draft
            } else {
                // In selling mode, 'draft_price' holds our calculated Selling Price
                updates.selling_price = p.draft_price;
            }
            
            return supabase.from('products').update(updates).eq('sku', p.sku);
        });

        await Promise.all(promises);
        
        queryClient.invalidateQueries({ queryKey: ['products'] });
        setIsCalculated(false);
        setPreviewProducts([]);
        showToast("Οι τιμές ενημερώθηκαν επιτυχώς!", 'success');
    } catch(err) {
        console.error(err);
        showToast("Σφάλμα κατά την ενημέρωση.", 'error');
    } finally {
        setIsCommitting(false);
    }
  };

  // If we haven't calculated yet, we show the original products list
  // IMPORTANT: For the table, if not calculated, we map draft_price to current price so diff is 0
  const productsToList = (isCalculated ? previewProducts : products.map(p => ({
      ...p,
      draft_price: mode === 'cost' ? p.active_price : p.selling_price
  }))).sort((a, b) => {
    const regex = /^([A-Z-]+)(\d+)$/i;
    const matchA = a.sku.match(regex);
    const matchB = b.sku.match(regex);
    if (!matchA || !matchB) return a.sku.localeCompare(b.sku);
    const [, prefixA, numStrA] = matchA;
    const [, prefixB, numStrB] = matchB;
    const numA = parseInt(numStrA, 10);
    const numB = parseInt(numStrB, 10);
    if (prefixA !== prefixB) return prefixA.localeCompare(prefixB);
    return numA - numB;
  });

  return (
    <div className="space-y-8 max-w-5xl mx-auto h-[calc(100vh-100px)] flex flex-col">
      <div>
        <h1 className="text-3xl font-bold text-slate-800 tracking-tight flex items-center gap-3">
            <div className="p-2 bg-emerald-100 text-emerald-600 rounded-xl">
                <DollarSign size={24} />
            </div>
            Διαχείριση Τιμών
        </h1>
        <p className="text-slate-500 mt-2 ml-14">Εργαλεία μαζικής κοστολόγησης και εμπορικής πολιτικής.</p>
      </div>

      <div className="bg-white p-2 rounded-2xl border border-slate-100 shadow-sm flex w-fit">
          <button 
            onClick={() => switchMode('cost')} 
            className={`px-6 py-3 rounded-xl font-bold text-sm transition-all flex items-center gap-2 ${mode === 'cost' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}
          >
             <RefreshCw size={16} /> Ενημέρωση Κόστους (Silver)
          </button>
          <button 
            onClick={() => switchMode('selling')} 
            className={`px-6 py-3 rounded-xl font-bold text-sm transition-all flex items-center gap-2 ${mode === 'selling' ? 'bg-amber-500 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}
          >
             <TrendingUp size={16} /> Εμπορική Πολιτική (Markup)
          </button>
      </div>

      <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100 flex flex-col md:flex-row items-center justify-between gap-8 animate-in fade-in">
        <div className="w-full md:w-1/3">
          {mode === 'cost' ? (
              <>
                <label className="block text-sm font-bold text-slate-600 mb-2 uppercase tracking-wide">Τιμή Βάσης (Ασήμι)</label>
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-between">
                    <span className="font-mono text-2xl font-black text-slate-800">{settings.silver_price_gram} €/g</span>
                    <span className="text-xs font-medium text-slate-400 bg-white px-2 py-1 rounded border border-slate-100">Ζωντανά</span>
                </div>
              </>
          ) : (
              <>
                <label className="block text-sm font-bold text-amber-800 mb-2 uppercase tracking-wide">Ποσοστό Αναπροσαρμογής (%)</label>
                <div className="relative">
                    <input 
                        type="number" 
                        value={markupPercent} 
                        onChange={(e) => setMarkupPercent(parseFloat(e.target.value))}
                        className="w-full p-4 border border-amber-200 rounded-2xl bg-white text-slate-900 font-mono text-2xl font-black focus:ring-4 focus:ring-amber-500/20 focus:border-amber-500 outline-none"
                        placeholder="0"
                    />
                    <Percent className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                </div>
                <p className="text-xs text-slate-400 mt-2">Θετικό για αύξηση, αρνητικό για μείωση (π.χ. 12 ή -5).</p>
              </>
          )}
        </div>

        <div className="flex gap-4">
          {!isCalculated ? (
             <button onClick={handleRecalculate} className={`px-8 py-4 rounded-xl font-bold flex items-center gap-3 text-white shadow-lg transition-all hover:-translate-y-0.5 ${mode === 'cost' ? 'bg-slate-900 shadow-slate-200 hover:bg-slate-800' : 'bg-amber-500 shadow-amber-200 hover:bg-amber-600'}`}>
                {mode === 'cost' ? <RefreshCw size={20} /> : <TrendingUp size={20} />} 
                {mode === 'cost' ? 'Υπολογισμός Κόστους' : 'Υπολογισμός Τιμών'}
             </button>
          ) : (
            <div className="flex gap-3">
                <button onClick={() => { setIsCalculated(false); setPreviewProducts([]); }} className="px-6 py-3 rounded-xl font-bold text-slate-500 hover:bg-slate-100 transition-colors">
                    Ακύρωση
                </button>
                <button onClick={commitPrices} disabled={isCommitting} className="px-8 py-3 rounded-xl font-bold flex items-center gap-2 bg-emerald-600 text-white shadow-lg shadow-emerald-200 hover:bg-emerald-700 transition-all hover:-translate-y-0.5 disabled:opacity-70 disabled:translate-y-0">
                    {isCommitting ? <Loader2 size={20} className="animate-spin" /> : <CheckCircle size={20} />}
                    {isCommitting ? 'Ενημέρωση...' : 'Εφαρμογή Τιμών'}
                </button>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-hidden bg-white rounded-3xl shadow-lg border border-slate-100 flex flex-col">
        {isCalculated && (
            <div className="p-4 bg-amber-50 border-b border-amber-100 flex items-center gap-3 text-amber-800 shrink-0">
                <AlertCircle size={20} />
                <span className="font-bold">Προεπισκόπηση Αλλαγών</span>
                <span className="text-sm opacity-70 ml-auto">Οι τιμές δεν έχουν αποθηκευτεί ακόμα.</span>
            </div>
        )}
        
        <div className="flex-1 overflow-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-xs sticky top-0 shadow-sm z-10">
                <tr>
                   <th className="p-4 pl-6">SKU</th>
                   {mode === 'cost' ? (
                       <>
                        <th className="p-4 text-right">Παλιό Κόστος</th>
                        <th className="p-4 w-10"></th>
                        <th className="p-4 text-right">Νέο Κόστος</th>
                       </>
                   ) : (
                       <>
                        <th className="p-4 text-right">Παλιά Χονδρική</th>
                        <th className="p-4 w-10"></th>
                        <th className="p-4 text-right">Νέα Χονδρική</th>
                       </>
                   )}
                   <th className="p-4 text-right">Διαφορά</th>
                   {mode === 'cost' && <th className="p-4 text-right">Τιμή Χονδρικής</th>}
                   <th className="p-4 pr-6 text-right">Νέο Περιθώριο</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {productsToList.filter(p => !p.is_component).map(p => {
                  let oldVal = 0;
                  let newVal = 0;
                  let margin = 0;

                  if (mode === 'cost') {
                      oldVal = p.active_price;
                      newVal = p.draft_price; // draft_price is either active (if not calc) or new calc
                      
                      const profit = p.selling_price - newVal;
                      margin = p.selling_price > 0 ? (profit / p.selling_price) * 100 : 0;
                  } else {
                      oldVal = p.selling_price;
                      newVal = p.draft_price; // draft_price is either selling (if not calc) or new calc
                      
                      const profit = newVal - p.active_price;
                      margin = newVal > 0 ? (profit / newVal) * 100 : 0;
                  }

                  const diff = newVal - oldVal;
                  
                  return (
                    <tr key={p.sku} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-4 pl-6 font-bold text-slate-800">{p.sku}</td>
                      <td className="p-4 text-right text-slate-500 font-mono">{oldVal.toFixed(2)}€</td>
                      <td className="p-4 text-center text-slate-300"><ArrowRight size={14}/></td>
                      <td className="p-4 text-right font-black font-mono text-slate-800">{newVal.toFixed(2)}€</td>
                      <td className={`p-4 text-right font-bold ${Math.abs(diff) > 0.001 ? (diff > 0 ? (mode === 'cost' ? 'text-rose-500' : 'text-emerald-500') : (mode === 'cost' ? 'text-emerald-500' : 'text-rose-500')) : 'text-slate-300'}`}>
                          {Math.abs(diff) > 0.001 ? `${diff > 0 ? '+' : ''}${diff.toFixed(2)}€` : '-'}
                      </td>
                      {mode === 'cost' && <td className="p-4 text-right text-slate-800 font-bold">{p.selling_price.toFixed(2)}€</td>}
                      <td className={`p-4 pr-6 text-right font-black ${margin < 30 ? 'text-rose-500' : 'text-emerald-600'}`}>{margin.toFixed(1)}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
        </div>
      </div>
    </div>
  );
}
