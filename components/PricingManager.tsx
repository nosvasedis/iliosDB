
import React, { useState } from 'react';
import { Product, GlobalSettings, Material, PriceSnapshot, PriceSnapshotItem } from '../types';
import { RefreshCw, CheckCircle, AlertCircle, Loader2, DollarSign, ArrowRight, TrendingUp, Percent, History, Save, ChevronRight, X, RotateCcw, Eye, Trash2, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { calculateProductCost, formatCurrency, formatDecimal, roundPrice } from '../utils/pricingEngine';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, supabase } from '../lib/supabase';
import { useUI } from './UIProvider';

interface Props {
  products: Product[];
  settings: GlobalSettings;
  materials: Material[];
}

type Mode = 'cost' | 'selling' | 'history';
type MarkupMode = 'adjust' | 'target';

interface SnapshotComparisonItem extends PriceSnapshotItem {
    currentPrice: number;
    diff: number;
}

export default function PricingManager({ products, settings, materials }: Props) {
  const [mode, setMode] = useState<Mode>('cost');
  const [markupMode, setMarkupMode] = useState<MarkupMode>('adjust');
  const [markupPercent, setMarkupPercent] = useState<number>(0);
  
  const [isCalculated, setIsCalculated] = useState(false);
  const [previewProducts, setPreviewProducts] = useState<Product[]>([]);
  const [isCommitting, setIsCommitting] = useState(false);
  
  const [isSnapshotting, setIsSnapshotting] = useState(false);
  const [snapshotNote, setSnapshotNote] = useState('');
  const [selectedSnapshot, setSelectedSnapshot] = useState<PriceSnapshot | null>(null);
  const [comparisonItems, setComparisonItems] = useState<SnapshotComparisonItem[]>([]);
  const [isLoadingSnapshotItems, setIsLoadingSnapshotItems] = useState(false);

  const queryClient = useQueryClient();
  const { showToast, confirm } = useUI();

  const { data: snapshots, isLoading: loadingSnapshots } = useQuery({ 
      queryKey: ['price_snapshots'], 
      queryFn: api.getPriceSnapshots,
      enabled: mode === 'history'
  });

  // Reset when switching modes
  const switchMode = (newMode: Mode) => {
    setMode(newMode);
    setIsCalculated(false);
    setPreviewProducts([]);
    setMarkupPercent(0);
    setMarkupMode('adjust');
    setSelectedSnapshot(null);
  };

  const handleRecalculate = () => {
    let updatedProducts: Product[] = [];

    if (mode === 'cost') {
        updatedProducts = products.map(p => {
            const cost = calculateProductCost(p, settings, materials, products);
            return { ...p, draft_price: cost.total };
        });
        showToast("Το νέο κόστος υπολογίστηκε βάσει τιμής ασημιού.", 'info');
    } else { // mode === 'selling'
        if (markupMode === 'adjust') {
            const multiplier = 1 + (markupPercent / 100);
            updatedProducts = products.map(p => {
                 const newSelling = p.selling_price * multiplier;
                 return { ...p, draft_price: parseFloat(newSelling.toFixed(2)) }; 
            });
            showToast(`Υπολογίστηκε νέα τιμή χονδρικής (${markupPercent > 0 ? '+' : ''}${markupPercent}%).`, 'info');
        } else { // markupMode === 'target'
             if (markupPercent >= 100 || markupPercent <= 0) {
                showToast("Το περιθώριο πρέπει να είναι μεταξύ 1 και 99.", "error");
                return;
            }
            const marginDecimal = markupPercent / 100;
            updatedProducts = products.map(p => {
                 const newSelling = p.active_price / (1 - marginDecimal);
                 return { ...p, draft_price: roundPrice(newSelling) };
            });
            showToast(`Υπολογίστηκε νέα τιμή για στόχο περιθωρίου ${markupPercent}%.`, 'info');
        }
    }

    setPreviewProducts(updatedProducts);
    setIsCalculated(true);
  };

  const handleCreateSnapshot = async () => {
      setIsSnapshotting(true);
      try {
          await api.createPriceSnapshot(snapshotNote || `Manual Backup - ${new Date().toLocaleDateString('el-GR')}`);
          queryClient.invalidateQueries({ queryKey: ['price_snapshots'] });
          setSnapshotNote('');
          showToast("Το αντίγραφο ασφαλείας δημιουργήθηκε!", "success");
      } catch (err) {
          showToast("Σφάλμα κατά τη δημιουργία αντιγράφου.", "error");
      } finally {
          setIsSnapshotting(false);
      }
  };

  const handleDeleteSnapshot = async (snapshot: PriceSnapshot) => {
      const yes = await confirm({
          title: 'Διαγραφή Snapshot',
          message: `Θέλετε να διαγράψετε το αντίγραφο από τις ${new Date(snapshot.created_at).toLocaleString('el-GR')};`,
          confirmText: 'Διαγραφή',
          isDestructive: true
      });
      if (yes) {
          try {
              await api.deletePriceSnapshot(snapshot.id);
              queryClient.invalidateQueries({ queryKey: ['price_snapshots'] });
              if (selectedSnapshot?.id === snapshot.id) setSelectedSnapshot(null);
              showToast("Το snapshot διαγράφηκε.", "info");
          } catch (err) {
              showToast("Σφάλμα διαγραφής.", "error");
          }
      }
  };

  const handleRevert = async (snapshot: PriceSnapshot) => {
      const yes = await confirm({
          title: 'Επαναφορά Τιμών',
          message: `Θέλετε να επαναφέρετε ΟΛΕΣ τις τιμές χονδρικής στο αντίγραφο από τις ${new Date(snapshot.created_at).toLocaleString('el-GR')}; Αυτή η ενέργεια δεν αναιρείται.`,
          confirmText: 'Επαναφορά Τώρα',
          isDestructive: true
      });

      if (yes) {
          setIsCommitting(true);
          try {
              await api.revertToPriceSnapshot(snapshot.id);
              queryClient.invalidateQueries({ queryKey: ['products'] });
              showToast("Οι τιμές επαναφέρθηκαν επιτυχώς!", "success");
          } catch (err) {
              showToast("Σφάλμα κατά την επαναφορά.", "error");
          } finally {
              setIsCommitting(false);
          }
      }
  };

  const viewSnapshotDetails = async (snapshot: PriceSnapshot) => {
      setSelectedSnapshot(snapshot);
      setIsLoadingSnapshotItems(true);
      try {
          const items = await api.getPriceSnapshotItems(snapshot.id);
          
          // Map to current live prices
          const comparedItems: SnapshotComparisonItem[] = items.map(item => {
              const product = products.find(p => p.sku === item.product_sku);
              let currentPrice = 0;
              if (product) {
                  if (item.variant_suffix) {
                      const v = product.variants?.find(v => v.suffix === item.variant_suffix);
                      currentPrice = v?.selling_price || product.selling_price;
                  } else {
                      currentPrice = product.selling_price;
                  }
              }
              return {
                  ...item,
                  currentPrice,
                  diff: currentPrice - item.price
              };
          });
          setComparisonItems(comparedItems);
      } catch (err) {
          showToast("Σφάλμα φόρτωσης λεπτομερειών.", "error");
      } finally {
          setIsLoadingSnapshotItems(false);
      }
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
        const promises = previewProducts.map(p => {
            const updates: any = {};
            
            if (mode === 'cost') {
                updates.active_price = p.draft_price;
                updates.draft_price = p.draft_price; // Sync draft
            } else {
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
            className={`px-6 py-3 rounded-xl font-bold text-sm transition-all flex items-center gap-2 ${mode === 'selling' ? 'bg-amber-500 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}
          >
             <TrendingUp size={16} /> Markup
          </button>
          <button 
            onClick={() => switchMode('history')} 
            className={`px-6 py-3 rounded-xl font-bold text-sm transition-all flex items-center gap-2 ${mode === 'history' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}
          >
             <History size={16} /> Ιστορικό & Snapshots
          </button>
      </div>

      {mode === 'history' ? (
          <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-3 gap-8 animate-in fade-in">
              <div className="lg:col-span-1 bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden flex flex-col">
                  <div className="p-6 border-b border-slate-100 bg-slate-50/50">
                      <h3 className="font-bold text-slate-800 flex items-center gap-2"><History size={18} className="text-blue-500"/> Λίστα Snapshots</h3>
                  </div>
                  <div className="flex-1 overflow-y-auto p-4 space-y-3">
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
                        <div className="flex-1 overflow-auto">
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
      ) : (
          <>
            <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100 flex flex-col md:flex-row items-start justify-between gap-8 animate-in fade-in">
                <div className="w-full md:w-2/3">
                {mode === 'cost' ? (
                    <div className="max-w-xs">
                        <label className="block text-sm font-bold text-slate-600 mb-2 uppercase tracking-wide">Τιμή Βάσης (Ασήμι)</label>
                        <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-between">
                            <span className="font-mono text-2xl font-black text-slate-800">{formatDecimal(settings.silver_price_gram, 3)} €/g</span>
                            <span className="text-xs font-medium text-slate-400 bg-white px-2 py-1 rounded border border-slate-100">Ζωντανά</span>
                        </div>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                        <div>
                            <div className="flex bg-slate-100 p-1 rounded-lg mb-4">
                                <button
                                    onClick={() => { setMarkupMode('adjust'); setMarkupPercent(0); }}
                                    className={`flex-1 px-3 py-2 rounded-md text-xs font-bold transition-all ${markupMode === 'adjust' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
                                >
                                    Αναπροσαρμογή
                                </button>
                                <button
                                    onClick={() => { setMarkupMode('target'); setMarkupPercent(60); }}
                                    className={`flex-1 px-3 py-2 rounded-md text-xs font-bold transition-all ${markupMode === 'target' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
                                >
                                    Στόχος Περιθωρίου
                                </button>
                            </div>

                            {markupMode === 'adjust' ? (
                                <>
                                    <label className="block text-sm font-bold text-amber-800 mb-2 uppercase tracking-wide">Ποσοστό Αναπροσαρμογής (%)</label>
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
                            ) : (
                                <>
                                    <label className="block text-sm font-bold text-amber-800 mb-2 uppercase tracking-wide">Επιθυμητό Περιθώριο Κέρδους (%)</label>
                                    <div className="relative">
                                        <input 
                                            type="number" 
                                            value={markupPercent} 
                                            onChange={(e) => setMarkupPercent(parseFloat(e.target.value) || 0)}
                                            className="w-full p-4 border border-amber-200 rounded-2xl bg-white text-slate-900 font-mono text-2xl font-black focus:ring-4 focus:ring-amber-500/20 focus:border-amber-500 outline-none"
                                            placeholder="60"
                                        />
                                        <Percent className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                                    </div>
                                </>
                            )}
                        </div>
                        <div>
                            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Επεξήγηση</h4>
                            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs text-slate-600 space-y-3 leading-relaxed">
                                {markupMode === 'adjust' ? (
                                    <p><strong>Αναπροσαρμογή:</strong> Αυξομειώνει τις <strong>τρέχουσες τιμές χονδρικής</strong> κατά το ποσοστό που θα ορίσετε. Ιδανικό για γρήγορες, γενικές προσαρμογές (π.χ. +10% σε όλα).</p>
                                ) : (
                                    <p><strong>Στόχος Περιθωρίου:</strong> Υπολογίζει μια εντελώς <strong>νέα τιμή χονδρικής</strong> για κάθε προϊόν, ώστε να επιτευχθεί το επιθυμητό περιθώριο κέρδους βάσει του <strong>τρέχοντος κόστους</strong> του. Ιδανικό για πλήρη ανατιμολόγηση.</p>
                                )}
                            </div>
                        </div>
                    </div>
                )}
                </div>

                <div className="flex-1 flex flex-col items-center justify-center">
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
                            newVal = p.draft_price; 
                            
                            const profit = p.selling_price - newVal;
                            margin = p.selling_price > 0 ? (profit / p.selling_price) * 100 : 0;
                        } else {
                            oldVal = p.selling_price;
                            newVal = p.draft_price; 
                            
                            const profit = newVal - p.active_price;
                            margin = newVal > 0 ? (profit / newVal) * 100 : 0;
                        }

                        const diff = newVal - oldVal;
                        
                        return (
                            <tr key={p.sku} className="hover:bg-slate-50/80 transition-colors">
                            <td className="p-4 pl-6 font-bold text-slate-800">{p.sku}</td>
                            <td className="p-4 text-right text-slate-500 font-mono">{formatCurrency(oldVal)}</td>
                            <td className="p-4 text-center text-slate-300"><ArrowRight size={14}/></td>
                            <td className="p-4 text-right font-black font-mono text-slate-800">{formatCurrency(newVal)}</td>
                            <td className={`p-4 text-right font-bold ${Math.abs(diff) > 0.001 ? (diff > 0 ? (mode === 'cost' ? 'text-rose-500' : 'text-emerald-500') : (mode === 'cost' ? 'text-emerald-500' : 'text-rose-500')) : 'text-slate-300'}`}>
                                {Math.abs(diff) > 0.001 ? `${diff > 0 ? '+' : ''}${formatDecimal(diff, 2)}€` : '-'}
                            </td>
                            {mode === 'cost' && <td className="p-4 text-right text-slate-800 font-bold">{formatCurrency(p.selling_price)}</td>}
                            <td className={`p-4 pr-6 text-right font-black ${margin < 30 ? 'text-rose-500' : 'text-emerald-600'}`}>{formatDecimal(margin, 1)}%</td>
                            </tr>
                        );
                        })}
                    </tbody>
                    </table>
                </div>
            </div>
          </>
      )}
    </div>
  );
}
