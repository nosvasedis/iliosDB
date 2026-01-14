
import React, { useState, useMemo } from 'react';
import { Product, GlobalSettings, Material, PriceSnapshot, PriceSnapshotItem, ProductVariant } from '../types';
import { RefreshCw, CheckCircle, AlertCircle, Loader2, DollarSign, ArrowRight, TrendingUp, Percent, History, Save, X, RotateCcw, Eye, Trash2, ArrowUpRight, ArrowDownRight, Anchor, Info, Calculator, Tag, Layers, Search, AlertTriangle } from 'lucide-react';
import { calculateProductCost, formatCurrency, formatDecimal, roundPrice, calculateSuggestedWholesalePrice, estimateVariantCost } from '../utils/pricingEngine';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, supabase } from '../lib/supabase';
import { useUI } from './UIProvider';
import { useVirtualizer } from '@tanstack/react-virtual';

interface Props {
  products: Product[];
  settings: GlobalSettings;
  materials: Material[];
}

type Mode = 'cost' | 'selling' | 'history';
type MarkupMode = 'adjust' | 'target' | 'formula';

// Flattened Item for Table Display
interface PricingItem {
    id: string; // Unique key (SKU + Suffix)
    sku: string; // Display SKU
    masterSku: string;
    variantSuffix: string | null;
    name: string; // Description or Category
    
    currentPrice: number; // Current value in DB (Cost or Selling based on Mode)
    newPrice: number; // Calculated value
    
    costBasis: number; // The active cost (for margin calc)
    isVariant: boolean;
    
    // Metadata for identifying changes
    hasChange: boolean;
}

interface SnapshotComparisonItem extends PriceSnapshotItem {
    currentPrice: number;
    diff: number;
}

export default function PricingManager({ products, settings, materials }: Props) {
  const [mode, setMode] = useState<Mode>('cost');
  const [markupMode, setMarkupMode] = useState<MarkupMode>('adjust');
  const [markupPercent, setMarkupPercent] = useState<number>(0);
  
  const [isCalculated, setIsCalculated] = useState(false);
  const [calculatedData, setCalculatedData] = useState<PricingItem[]>([]);
  
  // Update state for batching
  const [isCommitting, setIsCommitting] = useState(false);
  const [progress, setProgress] = useState<{ current: number, total: number, failed: number } | null>(null);
  
  const [searchTerm, setSearchTerm] = useState('');
  
  const [isSnapshotting, setIsSnapshotting] = useState(false);
  const [snapshotNote, setSnapshotNote] = useState('');
  const [selectedSnapshot, setSelectedSnapshot] = useState<PriceSnapshot | null>(null);
  const [comparisonItems, setComparisonItems] = useState<SnapshotComparisonItem[]>([]);
  const [isLoadingSnapshotItems, setIsLoadingSnapshotItems] = useState(false);

  const queryClient = useQueryClient();
  const { showToast, confirm } = useUI();
  const parentRef = React.useRef<HTMLDivElement>(null);

  const { data: snapshots, isLoading: loadingSnapshots } = useQuery({ 
      queryKey: ['price_snapshots'], 
      queryFn: api.getPriceSnapshots,
      enabled: mode === 'history'
  });

  const switchMode = (newMode: Mode) => {
    setMode(newMode);
    setIsCalculated(false);
    setCalculatedData([]);
    setMarkupPercent(0);
    setMarkupMode('adjust');
    setSelectedSnapshot(null);
  };

  // 1. Flatten Inventory Memo
  // This creates the "Default" list of all sellable items (Masters & Variants)
  const flattenedInventory = useMemo(() => {
      return products.flatMap(p => {
          if (p.variants && p.variants.length > 0) {
              return p.variants.map(v => ({
                  id: `${p.sku}-${v.suffix}`,
                  sku: `${p.sku}${v.suffix}`,
                  masterSku: p.sku,
                  variantSuffix: v.suffix,
                  name: v.description || p.category,
                  currentPrice: mode === 'cost' ? (v.active_price || 0) : (v.selling_price || 0),
                  newPrice: mode === 'cost' ? (v.active_price || 0) : (v.selling_price || 0),
                  costBasis: v.active_price || 0,
                  isVariant: true,
                  hasChange: false
              }));
          } else {
              return [{
                  id: p.sku,
                  sku: p.sku,
                  masterSku: p.sku,
                  variantSuffix: null,
                  name: p.category,
                  currentPrice: mode === 'cost' ? (p.active_price || 0) : (p.selling_price || 0),
                  newPrice: mode === 'cost' ? (p.active_price || 0) : (p.selling_price || 0),
                  costBasis: p.active_price || 0,
                  isVariant: false,
                  hasChange: false
              }];
          }
      }).sort((a,b) => a.sku.localeCompare(b.sku, undefined, { numeric: true }));
  }, [products, mode]);

  const handleRecalculate = () => {
    // Perform calculation on the flattened list directly
    const items: PricingItem[] = products.flatMap(product => {
        const productItems: PricingItem[] = [];
        
        // Helper to process a specific item (Variant or Master)
        // BUG FIX: Added isVariantRow explicit flag to handle empty suffix variants correctly
        const processItem = (variantSuffix: string | null, currentVal: number, name: string, isVariantRow: boolean): PricingItem => {
            let newVal = 0;
            let costBasis = 0;
            
            // Recalculate cost FRESH
            const costCalc = isVariantRow && variantSuffix !== null
                ? estimateVariantCost(product, variantSuffix, settings, materials, products)
                : calculateProductCost(product, settings, materials, products);
            
            const freshCost = costCalc.total;
            const weight = (costCalc.breakdown.details?.total_weight || product.weight_g + (product.secondary_weight_g || 0));
            costBasis = freshCost;

            if (mode === 'cost') {
                // Cost Mode: New Price = Fresh Calculated Cost
                newVal = freshCost;
            } else {
                // Selling Mode: Apply markup logic
                const basePrice = currentVal; // Current selling price
                
                if (markupMode === 'adjust') {
                    newVal = roundPrice(basePrice * (1 + markupPercent / 100));
                } else if (markupMode === 'target') {
                    const margin = markupPercent / 100;
                    if (margin >= 1) newVal = 0; 
                    else newVal = roundPrice(freshCost / (1 - margin));
                } else if (markupMode === 'formula') {
                    newVal = calculateSuggestedWholesalePrice(weight, costCalc.breakdown.silver, costCalc.breakdown.labor, costCalc.breakdown.materials);
                }
            }

            // Determine if there is a "change" worth highlighting
            const hasChange = Math.abs(newVal - currentVal) > 0.01;

            return {
                id: variantSuffix ? `${product.sku}-${variantSuffix}` : product.sku,
                sku: variantSuffix ? `${product.sku}${variantSuffix}` : product.sku,
                masterSku: product.sku,
                variantSuffix: variantSuffix,
                name: name,
                currentPrice: currentVal, // Old/Current Value
                newPrice: newVal,         // New/Proposed Value
                costBasis: freshCost,
                isVariant: isVariantRow, // Correctly identifies if this targets product_variants or products table
                hasChange
            };
        };

        if (product.variants && product.variants.length > 0) {
            product.variants.forEach(v => {
                // Pass TRUE for isVariantRow, even if suffix is empty
                productItems.push(processItem(v.suffix, mode === 'cost' ? (v.active_price || 0) : (v.selling_price || 0), v.description || product.category, true));
            });
        } else {
            // Pass FALSE for Master (Simple Product)
            productItems.push(processItem(null, mode === 'cost' ? (product.active_price || 0) : (product.selling_price || 0), product.category, false));
        }
        
        return productItems;
    });

    const sortedItems = items.sort((a,b) => a.sku.localeCompare(b.sku, undefined, { numeric: true }));
    setCalculatedData(sortedItems);
    setIsCalculated(true);
    
    if (mode === 'cost') {
        showToast(`Υπολογίστηκε νέο κόστος για ${items.length} κωδικούς (Βάση: ${formatDecimal(settings.last_calc_silver_price, 2)}€/g).`, 'info');
    } else {
        const msg = markupMode === 'formula' ? 'Υπολογίστηκαν τιμές Formula (Ilios).' : `Υπολογίστηκαν νέες τιμές (${markupPercent}%).`;
        showToast(msg, 'info');
    }
  };

  const activeList = isCalculated ? calculatedData : flattenedInventory;
  const filteredList = useMemo(() => {
      if (!searchTerm) return activeList;
      const lower = searchTerm.toLowerCase();
      return activeList.filter(i => i.sku.toLowerCase().includes(lower) || i.name.toLowerCase().includes(lower));
  }, [activeList, searchTerm]);

  // Virtualizer for the massive list
  const rowVirtualizer = useVirtualizer({
    count: filteredList.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 64, // Height of row
    overscan: 20
  });

  const commitPrices = async () => {
    // 1. Identify ONLY items that genuinely need an update
    const updatesToApply = isCalculated ? calculatedData.filter(i => i.hasChange) : [];
    const count = updatesToApply.length;

    if (count === 0) {
        showToast("Δεν υπάρχουν αλλαγές προς ενημέρωση.", 'info');
        return;
    }

    const yes = await confirm({
        title: mode === 'cost' ? 'Ενημέρωση Κόστους' : 'Ενημέρωση Τιμών Χονδρικής',
        message: mode === 'cost' 
            ? `Θα ενημερωθεί η Τιμή Κόστους για ${count} κωδικούς.` 
            : `Θα αλλάξει η Τιμή Χονδρικής για ${count} κωδικούς. Είστε σίγουροι;`,
        confirmText: 'Ενημέρωση',
    });

    if (!yes) return;

    setIsCommitting(true);
    let successCount = 0;
    let failCount = 0;
    
    try {
        setProgress({ current: 0, total: count, failed: 0 });
        
        // 2. Reduced Batch Size for Stability
        const BATCH_SIZE = 10; 
        
        for (let i = 0; i < updatesToApply.length; i += BATCH_SIZE) {
            const batch = updatesToApply.slice(i, i + BATCH_SIZE);
            
            // 3. Map Promises
            const promises = batch.map(item => {
                const updates: any = {};
                if (mode === 'cost') {
                    updates.active_price = item.newPrice;
                    if (!item.isVariant) updates.draft_price = item.newPrice;
                } else {
                    updates.selling_price = item.newPrice;
                }

                // FIXED: Use .match() for robust composite key updating (product_sku + suffix).
                // Ensure empty suffixes are passed as empty strings, not nulls/undefined.
                if (item.isVariant) {
                    return supabase.from('product_variants')
                        .update(updates)
                        .match({ 
                            product_sku: item.masterSku, 
                            suffix: item.variantSuffix || "" 
                        });
                } else {
                    return supabase.from('products')
                        .update(updates)
                        .eq('sku', item.masterSku);
                }
            });

            // 4. Use allSettled to ensure 1 failure doesn't kill the batch
            const results = await Promise.allSettled(promises);
            
            results.forEach(res => {
                if (res.status === 'fulfilled' && !res.value.error) {
                    successCount++;
                } else {
                    failCount++;
                    console.error("Batch item failed:", res);
                }
            });
            
            // 5. Update progress UI
            setProgress({ 
                current: Math.min(i + BATCH_SIZE, count), 
                total: count, 
                failed: failCount 
            });

            // 6. Throttle slightly to breathe
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        // Update global settings if cost mode
        if (mode === 'cost') {
            await supabase.from('global_settings').update({ 
                last_calc_silver_price: settings.silver_price_gram 
            }).eq('id', 1);
            await queryClient.invalidateQueries({ queryKey: ['settings'] });
        }

        // Wait a beat to ensure DB is consistent before refetch
        await new Promise(resolve => setTimeout(resolve, 500));
        await queryClient.invalidateQueries({ queryKey: ['products'] });
        
        setIsCalculated(false);
        setCalculatedData([]);
        setProgress(null);
        
        if (failCount > 0) {
            showToast(`Ενημερώθηκαν ${successCount}, απέτυχαν ${failCount}.`, 'warning');
        } else {
            showToast(`Επιτυχής ενημέρωση ${successCount} κωδικών!`, 'success');
        }

    } catch(err) {
        console.error(err);
        showToast("Κρίσιμο σφάλμα κατά την ενημέρωση.", 'error');
    } finally {
        setIsCommitting(false);
        setProgress(null);
    }
  };

  const handleCreateSnapshot = async () => {
      setIsSnapshotting(true);
      try {
          await api.createPriceSnapshot(snapshotNote || `Manual Backup - ${new Date().toLocaleDateString('el-GR')}`, products);
          queryClient.invalidateQueries({ queryKey: ['price_snapshots'] });
          setSnapshotNote('');
          showToast("Το αντίγραφο ασφαλείας δημιουργήθηκε!", "success");
      } catch (err) {
          showToast("Σφάλμα κατά τη δημιουργία αντιγράφου.", "error");
      } finally {
          setIsSnapshotting(false);
      }
  };

  const viewSnapshotDetails = async (snap: PriceSnapshot) => {
    setIsLoadingSnapshotItems(true);
    setSelectedSnapshot(snap);
    try {
        const items = await api.getPriceSnapshotItems(snap.id);
        
        // Smart Filter: Identify SKUs that have variants in this snapshot
        const skuHasVariantsInSnapshot = new Set<string>();
        items.forEach(i => {
            if (i.variant_suffix) skuHasVariantsInSnapshot.add(i.product_sku);
        });

        // Filter out "Ghost" masters (null suffix) if variants exist for that SKU
        const filteredItems = items.filter(i => {
            return i.variant_suffix !== null || !skuHasVariantsInSnapshot.has(i.product_sku);
        });

        const comparison: SnapshotComparisonItem[] = filteredItems.map(item => {
            let currentPrice = 0;
            const p = products.find(prod => prod.sku === item.product_sku);
            if (item.variant_suffix) {
                const v = p?.variants?.find(varnt => varnt.suffix === item.variant_suffix);
                currentPrice = v?.selling_price || 0;
            } else {
                currentPrice = p?.selling_price || 0;
            }
            return {
                ...item,
                currentPrice,
                diff: currentPrice - item.price
            };
        });
        setComparisonItems(comparison);
    } catch (err) {
        showToast("Σφάλμα κατά τη φόρτωση του αντιγράφου.", "error");
    } finally {
        setIsLoadingSnapshotItems(false);
    }
  };

  const handleDeleteSnapshot = async (snap: PriceSnapshot) => {
      const yes = await confirm({
          title: 'Διαγραφή Snapshot',
          message: 'Θέλετε να διαγράψετε οριστικά αυτό το αντίγραφο τιμών;',
          isDestructive: true
      });
      if (!yes) return;
      try {
          await api.deletePriceSnapshot(snap.id);
          queryClient.invalidateQueries({ queryKey: ['price_snapshots'] });
          if (selectedSnapshot?.id === snap.id) setSelectedSnapshot(null);
          showToast("Το snapshot διαγράφηκε.", "info");
      } catch (err) {
          showToast("Σφάλμα διαγραφής.", "error");
      }
  };

  const handleRevert = async (snap: PriceSnapshot) => {
      const yes = await confirm({
          title: 'Επαναφορά Τιμών',
          message: `Θέλετε να επαναφέρετε ΟΛΕΣ τις τιμές χονδρικής σε αυτές που ίσχυαν στις ${new Date(snap.created_at).toLocaleDateString('el-GR')};`,
          isDestructive: true,
          confirmText: 'Επαναφορά'
      });
      if (!yes) return;
      setIsCommitting(true);
      try {
          await api.revertToPriceSnapshot(snap.id);
          queryClient.invalidateQueries({ queryKey: ['products'] });
          showToast("Οι τιμές επανήλθαν επιτυχώς!", "success");
      } catch (err) {
          showToast("Σφάλμα κατά την επαναφορά.", "error");
      } finally {
          setIsCommitting(false);
      }
  };

  return (
    <div className="space-y-8 max-w-6xl mx-auto h-[calc(100vh-100px)] flex flex-col">
      <div className="flex justify-between items-center">
        <div>
            <h1 className="text-3xl font-bold text-slate-800 tracking-tight flex items-center gap-3">
                <div className="p-2 bg-emerald-100 text-emerald-600 rounded-xl">
                    <DollarSign size={24} />
                </div>
                Διαχείριση Τιμών
            </h1>
            <p className="text-slate-500 mt-2 ml-14">Εργαλεία μαζικής κοστολόγησης και εμπορικής πολιτικής.</p>
        </div>

        {mode !== 'history' && (
            <button 
                onClick={handleCreateSnapshot}
                disabled={isSnapshotting}
                className="flex items-center gap-2 bg-white border-2 border-dashed border-slate-300 text-slate-600 px-5 py-3 rounded-2xl hover:border-blue-400 hover:text-blue-600 transition-all font-bold text-sm"
            >
                {isSnapshotting ? <Loader2 size={18} className="animate-spin" /> : <Save size={18}/>}
                Backup Τρεχουσών Τιμών
            </button>
        )}
      </div>

      <div className="bg-white p-2 rounded-2xl border border-slate-100 shadow-sm flex w-fit">
          <button 
            onClick={() => switchMode('cost')} 
            className={`px-6 py-3 rounded-xl font-bold text-sm transition-all flex items-center gap-2 ${mode === 'cost' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}
          >
             <RefreshCw size={16} /> Κόστος (Silver)
          </button>
          <button 
            onClick={() => switchMode('selling')} 
            className={`px-6 py-3 rounded-xl font-bold text-sm transition-all flex items-center gap-2 ${mode === 'selling' ? 'bg-amber-50 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}
          >
             <TrendingUp size={16} /> Markup
          </button>
          <button 
            onClick={() => switchMode('history')} 
            className={`px-6 py-3 rounded-xl font-bold text-sm transition-all flex items-center gap-2 ${mode === 'history' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}
          >
             <History size={16} /> Snapshots
          </button>
      </div>

      {mode !== 'history' && (
          <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100 flex flex-col md:flex-row items-start justify-between gap-8 animate-in fade-in">
                <div className="w-full md:w-2/3">
                {mode === 'cost' ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1">
                                    <Anchor size={12}/> Ιστορικό Baseline
                                </label>
                                <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-between">
                                    <span className="font-mono text-xl font-bold text-slate-500">{formatDecimal(settings.last_calc_silver_price, 3)} €/g</span>
                                    <span className="text-[10px] font-black text-slate-400 bg-white px-2 py-1 rounded border border-slate-100 uppercase">Last Saved</span>
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-emerald-600 mb-2 uppercase tracking-widest flex items-center gap-1">
                                    <TrendingUp size={12}/> Τρέχουσα Τιμή
                                </label>
                                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center justify-between ring-2 ring-emerald-500/10">
                                    <span className="font-mono text-2xl font-black text-emerald-800">{formatDecimal(settings.silver_price_gram, 3)} €/g</span>
                                    <span className="text-[10px] font-black text-emerald-600 bg-white px-2 py-1 rounded border border-slate-100 uppercase animate-pulse">Live Now</span>
                                </div>
                            </div>
                        </div>
                        <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 text-xs text-slate-600 space-y-3 leading-relaxed">
                            <h4 className="font-black text-slate-800 uppercase text-[10px] flex items-center gap-2 mb-2"><Info size={14} className="text-blue-500"/> Forensic Pricing</h4>
                            <p>Το σύστημα εντοπίζει ότι οι τρέχουσες τιμές σας υπολογίστηκαν με ασήμι στα <strong>{formatDecimal(settings.last_calc_silver_price, 2)}€/g</strong>.</p>
                            <p>Η σύγκριση στον πίνακα θα δείξει την επίδραση της μεταβολής της τιμής του ασημιού στα περιθώρια κέρδους σας.</p>
                        </div>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                        <div>
                            <div className="flex bg-slate-100 p-1 rounded-lg mb-4">
                                <button
                                    onClick={() => { setMarkupMode('adjust'); setMarkupPercent(0); }}
                                    className={`flex-1 px-2 py-2 rounded-md text-[10px] font-bold transition-all ${markupMode === 'adjust' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
                                >
                                    Αναπροσαρμογή
                                </button>
                                <button
                                    onClick={() => { setMarkupMode('target'); setMarkupPercent(60); }}
                                    className={`flex-1 px-2 py-2 rounded-md text-[10px] font-bold transition-all ${markupMode === 'target' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
                                >
                                    Στόχος
                                </button>
                                <button
                                    onClick={() => { setMarkupMode('formula'); setMarkupPercent(0); }}
                                    className={`flex-1 px-2 py-2 rounded-md text-[10px] font-bold transition-all ${markupMode === 'formula' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
                                >
                                    Τύπος Ilios
                                </button>
                            </div>

                            {markupMode !== 'formula' && (
                                <>
                                <label className="block text-sm font-bold text-amber-800 mb-2 uppercase tracking-wide">
                                    {markupMode === 'adjust' ? 'Ποσοστό Αναπροσαρμογής (%)' : 'Επιθυμητό Περιθώριο Κέρδους (%)'}
                                </label>
                                <div className="relative">
                                    <input 
                                        type="number" 
                                        value={markupPercent} 
                                        onChange={(e) => setMarkupPercent(parseFloat(e.target.value) || 0)}
                                        className="w-full p-4 border border-amber-200 rounded-2xl bg-white text-slate-900 font-mono text-2xl font-black focus:ring-4 focus:ring-amber-500/20 focus:border-amber-500 outline-none"
                                        placeholder="0"
                                    />
                                    <Percent className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                                </div>
                                </>
                            )}
                            
                            {markupMode === 'formula' && (
                                <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-2xl flex flex-col items-center justify-center text-center">
                                    <Calculator className="text-emerald-500 mb-2" size={24}/>
                                    <p className="font-bold text-emerald-800">Αυτόματος Υπολογισμός</p>
                                    <p className="text-xs text-emerald-600 mt-1">(NonMetal x 2) + Silver + (Weight x 2)</p>
                                </div>
                            )}
                        </div>
                        <div>
                            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Οδηγίες</h4>
                            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs text-slate-600 leading-relaxed">
                                {markupMode === 'adjust' && "Αλλάζει τις τρέχουσες τιμές χονδρικής κατά το ποσοστό που θα ορίσετε (π.χ. +5% για πληθωρισμό)."}
                                {markupMode === 'target' && "Υπολογίζει νέες τιμές χονδρικής ώστε κάθε SKU να έχει το ίδιο περιθώριο κέρδους βάσει του τρέχοντος κόστους."}
                                {markupMode === 'formula' && "Εφαρμόζει τον τυπικό μαθηματικό τύπο του Ilios για υπολογισμό προτεινόμενης χονδρικής βάσει κόστους εργατικών/υλικών (x2) και βάρους."}
                            </div>
                        </div>
                    </div>
                )}
                </div>

                <div className="flex-1 flex flex-col items-center justify-center border-l border-slate-100 pl-8">
                {!isCalculated ? (
                    <button onClick={handleRecalculate} className={`px-8 py-4 rounded-xl font-bold flex items-center gap-3 text-white shadow-lg transition-all hover:-translate-y-0.5 ${mode === 'cost' ? 'bg-slate-900 shadow-slate-200 hover:bg-slate-800' : 'bg-amber-500 shadow-amber-200 hover:bg-amber-600'}`}>
                        {mode === 'cost' ? <RefreshCw size={20} /> : <TrendingUp size={20} />} 
                        {mode === 'cost' ? 'Υπολογισμός Κόστους' : 'Υπολογισμός Τιμών'}
                    </button>
                ) : (
                    <div className="flex flex-col gap-3 w-full">
                        {isCommitting && progress && (
                            <div className="w-full bg-slate-100 rounded-full h-3 mb-2 overflow-hidden relative">
                                <div className="bg-emerald-500 h-full transition-all duration-300" style={{ width: `${(progress.current / progress.total) * 100}%` }}></div>
                                {progress.failed > 0 && <div className="absolute top-0 right-0 h-full bg-red-500" style={{ width: `${(progress.failed / progress.total) * 100}%` }}></div>}
                            </div>
                        )}
                        <div className="flex gap-3 justify-center">
                            <button onClick={() => { setIsCalculated(false); setCalculatedData([]); }} disabled={isCommitting} className="px-6 py-3 rounded-xl font-bold text-slate-500 hover:bg-slate-100 transition-colors disabled:opacity-50">
                                Ακύρωση
                            </button>
                            <button onClick={commitPrices} disabled={isCommitting} className="px-8 py-3 rounded-xl font-bold flex items-center gap-2 bg-emerald-600 text-white shadow-lg shadow-emerald-200 hover:bg-emerald-700 transition-all hover:-translate-y-0.5 disabled:opacity-70 disabled:translate-y-0">
                                {isCommitting ? <Loader2 size={20} className="animate-spin" /> : <CheckCircle size={20} />}
                                {isCommitting 
                                    ? `Ενημέρωση (${progress ? Math.round((progress.current/progress.total)*100) : 0}%)...` 
                                    : `Εφαρμογή σε ${calculatedData.filter(i => i.hasChange).length}`}
                            </button>
                        </div>
                        {progress?.failed ? <p className="text-[10px] text-red-500 text-center font-bold">{progress.failed} απέτυχαν (θα αγνοηθούν)</p> : null}
                    </div>
                )}
                </div>
            </div>
      )}

      {mode !== 'history' && (
            <div className="flex-1 overflow-hidden bg-white rounded-3xl shadow-lg border border-slate-100 flex flex-col">
                <div className="p-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-2 text-slate-600 font-bold">
                        {isCalculated ? <Layers size={18} className="text-emerald-500"/> : <AlertCircle size={18}/>}
                        {isCalculated ? 'Ανάλυση & Προεπισκόπηση' : 'Όλοι οι Κωδικοί & Παραλλαγές'}
                        <span className="bg-white px-2 py-0.5 rounded text-xs border border-slate-200">{filteredList.length} items</span>
                        {isCalculated && (
                            <span className="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded text-xs border border-emerald-200 ml-2">
                                {filteredList.filter(i => i.hasChange).length} με αλλαγές
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-4">
                        {isCalculated && mode === 'cost' && <span className="text-xs bg-amber-50 px-2 py-1 rounded text-amber-700 font-bold border border-amber-100">Νέα Βάση: {settings.silver_price_gram}€/g</span>}
                        <div className="relative w-48">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={14}/>
                            <input 
                                type="text" 
                                placeholder="Αναζήτηση..." 
                                value={searchTerm} 
                                onChange={e => setSearchTerm(e.target.value)} 
                                className="w-full pl-8 py-1.5 text-xs bg-white border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500/20"
                            />
                        </div>
                    </div>
                </div>
                
                <div className="flex-1 overflow-auto custom-scrollbar" ref={parentRef}>
                    <div 
                        style={{ height: `${rowVirtualizer.getTotalSize()}px`, width: '100%', position: 'relative' }}
                    >
                        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                            const item = filteredList[virtualRow.index];
                            const diff = item.newPrice - item.currentPrice;
                            
                            // Calculate margin dynamically based on updated values
                            let margin = 0;
                            if (mode === 'cost') {
                                margin = 0;
                            } else {
                                // Selling Mode: New Selling - Current Cost
                                const profit = item.newPrice - item.costBasis;
                                margin = item.newPrice > 0 ? (profit / item.newPrice) * 100 : 0;
                            }

                            return (
                                <div 
                                    key={virtualRow.key}
                                    className="absolute top-0 left-0 w-full flex items-center border-b border-slate-50 hover:bg-slate-50/80 transition-colors"
                                    style={{ 
                                        height: `${virtualRow.size}px`, 
                                        transform: `translateY(${virtualRow.start}px)`
                                    }}
                                >
                                    <div className="w-1/3 px-4 pl-8 flex flex-col justify-center">
                                        <div className="font-mono font-bold text-slate-700 flex items-center gap-2">
                                            {item.sku}
                                            {item.isVariant && <span className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded border border-blue-100 font-bold">VAR</span>}
                                        </div>
                                        <div className="text-[10px] text-slate-400 truncate">{item.name}</div>
                                    </div>
                                    <div className="w-1/6 px-4 text-right flex flex-col justify-center">
                                        <span className="text-slate-500 font-mono text-xs">{formatCurrency(item.currentPrice)}</span>
                                        <span className="text-[9px] text-slate-300 uppercase font-bold">{mode === 'cost' ? 'COST' : 'PRICE'}</span>
                                    </div>
                                    <div className="w-10 flex items-center justify-center text-slate-300"><ArrowRight size={14}/></div>
                                    <div className="w-1/6 px-4 text-right flex flex-col justify-center">
                                        <span className={`font-black font-mono text-sm ${item.hasChange ? 'text-slate-800' : 'text-slate-400'}`}>{formatCurrency(item.newPrice)}</span>
                                    </div>
                                    <div className="w-1/6 px-4 text-right flex flex-col justify-center">
                                        {Math.abs(diff) > 0.01 && (
                                            <div className={`text-xs font-bold flex items-center justify-end gap-1 ${diff > 0 ? (mode === 'cost' ? 'text-rose-500' : 'text-emerald-500') : (mode === 'cost' ? 'text-emerald-500' : 'text-rose-500')}`}>
                                                {diff > 0 ? <ArrowUpRight size={12}/> : <ArrowDownRight size={12}/>}
                                                {formatDecimal(Math.abs(diff), 2)}€
                                            </div>
                                        )}
                                    </div>
                                    <div className="w-1/6 px-4 pr-8 text-right flex flex-col justify-center">
                                        {mode === 'selling' && (
                                            <span className={`font-black text-xs ${margin < 30 ? 'text-rose-500' : 'text-emerald-600'}`}>{formatDecimal(margin, 1)}%</span>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
                {filteredList.length === 0 && (
                    <div className="p-12 text-center text-slate-400">Δεν βρέθηκαν αποτελέσματα.</div>
                )}
            </div>
      )}

      {mode === 'history' && (
          <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-3 gap-8 animate-in fade-in">
              <div className="lg:col-span-1 bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden flex flex-col">
                  <div className="p-6 border-b border-slate-100 bg-slate-50/50">
                      <h3 className="font-bold text-slate-800 flex items-center gap-2"><History size={18} className="text-blue-500"/> Λίστα Snapshots</h3>
                  </div>
                  <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                      {loadingSnapshots ? <Loader2 className="animate-spin mx-auto mt-10 text-slate-300"/> : snapshots?.map(snap => (
                          <div 
                            key={snap.id} 
                            onClick={() => viewSnapshotDetails(snap)}
                            className={`p-4 rounded-2xl border cursor-pointer transition-all relative group ${selectedSnapshot?.id === snap.id ? 'bg-blue-50 border-blue-200' : 'bg-white border-slate-100 hover:border-slate-200 shadow-sm'}`}
                          >
                              <button 
                                onClick={(e) => { e.stopPropagation(); handleDeleteSnapshot(snap); }}
                                className="absolute top-4 right-4 p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                              >
                                  <Trash2 size={16}/>
                              </button>

                              <div className="flex justify-between items-start mb-2 mr-6">
                                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{new Date(snap.created_at).toLocaleDateString('el-GR')}</span>
                                  <span className="text-[10px] bg-slate-100 px-2 py-0.5 rounded font-black text-slate-500">{snap.item_count} είδη</span>
                              </div>
                              <p className="font-bold text-slate-800 text-sm mb-3">{snap.notes}</p>
                              <div className="flex gap-2">
                                  <button onClick={(e) => { e.stopPropagation(); handleRevert(snap); }} className="flex-1 flex items-center justify-center gap-1.5 py-1.5 bg-rose-50 text-rose-600 rounded-lg text-xs font-bold hover:bg-rose-100 transition-colors">
                                      <RotateCcw size={12}/> Revert
                                  </button>
                                  <button onClick={(e) => { e.stopPropagation(); viewSnapshotDetails(snap); }} className="flex-1 flex items-center justify-center gap-1.5 py-1.5 bg-blue-50 text-blue-600 rounded-lg text-xs font-bold hover:bg-blue-100 transition-colors">
                                      <Eye size={12}/> View
                                  </button>
                              </div>
                          </div>
                      ))}
                      {snapshots?.length === 0 && <div className="text-center py-20 text-slate-400 italic">Δεν υπάρχουν αντίγραφα.</div>}
                  </div>
              </div>

              <div className="lg:col-span-2 bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden flex flex-col">
                  {selectedSnapshot ? (
                      <>
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                            <div>
                                <h3 className="font-bold text-slate-800">Σύγκριση Backup με Τρέχουσες Τιμές</h3>
                                <p className="text-xs text-slate-500">{new Date(selectedSnapshot.created_at).toLocaleString('el-GR')} • {selectedSnapshot.notes}</p>
                            </div>
                            <button onClick={() => setSelectedSnapshot(null)} className="p-2 hover:bg-slate-200 rounded-full"><X size={20}/></button>
                        </div>
                        <div className="flex-1 overflow-auto custom-scrollbar">
                            {isLoadingSnapshotItems ? <div className="flex justify-center p-20"><Loader2 className="animate-spin text-blue-500"/></div> : (
                                <table className="w-full text-left text-sm">
                                    <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] sticky top-0 shadow-sm">
                                        <tr>
                                            <th className="p-4 pl-8">Κωδικός (SKU/Var)</th>
                                            <th className="p-4 text-right">Τιμή Backup</th>
                                            <th className="p-4 text-right">Τρέχουσα Τιμή</th>
                                            <th className="p-4 text-right pr-8">Διαφορά</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50">
                                        {comparisonItems.map(item => {
                                            const hasDiff = Math.abs(item.diff) > 0.01;
                                            return (
                                                <tr key={item.id} className="hover:bg-slate-50/50 transition-colors group">
                                                    <td className="p-4 pl-8 font-mono text-slate-700 font-bold">{item.product_sku}{item.variant_suffix || ''}</td>
                                                    <td className="p-4 text-right font-bold text-slate-500">{item.price.toFixed(2)}€</td>
                                                    <td className="p-4 text-right font-black text-slate-800">{item.currentPrice.toFixed(2)}€</td>
                                                    <td className={`p-4 text-right pr-8 font-bold ${hasDiff ? (item.diff > 0 ? 'text-emerald-600' : 'text-rose-500') : 'text-slate-300'}`}>
                                                        {hasDiff ? (
                                                            <div className="flex items-center justify-end gap-1">
                                                                {item.diff > 0 ? <ArrowUpRight size={14}/> : <ArrowDownRight size={14}/>}
                                                                {Math.abs(item.diff).toFixed(2)}€
                                                            </div>
                                                        ) : '-'}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            )}
                        </div>
                      </>
                  ) : (
                      <div className="flex-1 flex flex-col items-center justify-center text-slate-300 p-20 text-center">
                          <History size={64} className="mb-4 opacity-20"/>
                          <p className="font-bold text-lg">Επιλέξτε ένα Snapshot</p>
                          <p className="text-sm">Για να δείτε πώς έχουν αλλάξει οι τιμές από τότε μέχρι σήμερα.</p>
                      </div>
                  )}
              </div>
          </div>
      )}
    </div>
  );
}
