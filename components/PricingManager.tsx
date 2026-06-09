
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Product, GlobalSettings, Material, PriceSnapshot, PriceSnapshotItem } from '../types';
import { RefreshCw, CheckCircle, AlertCircle, Loader2, DollarSign, ArrowRight, TrendingUp, Percent, History, Save, X, RotateCcw, Eye, Trash2, ArrowUpRight, ArrowDownRight, Anchor, Info, Calculator, Tag, Layers, Search, AlertTriangle, Play, Lock, ChevronDown, ChevronUp, Wand2 } from 'lucide-react';
import { formatCurrency, formatDecimal, getIliosSuggestedPriceForProduct } from '../utils/pricingEngine';
import {
  buildBulkPricingPreview,
  BulkPricingItem,
  countManualSellingPrices,
  detectLegacyManualPriceCandidates,
  filterPricingList,
  flattenInventoryForPricing,
  getCommitCandidates,
  getPricingItemMargin,
  PricingListFilter,
  PricingSortBy,
  sortPricingList,
  summarizePricingPreview,
} from '../utils/bulkPricingPreview';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, supabase } from '../lib/supabase';
import { invalidateProductsAndCatalog } from '../lib/queryInvalidation';
import { useUI } from './UIProvider';
import DesktopPageHeader from './DesktopPageHeader';
import { useVirtualizer } from '@tanstack/react-virtual';

interface Props {
  products: Product[];
  settings: GlobalSettings;
  materials: Material[];
}

type Mode = 'cost' | 'selling' | 'history';
type MarkupMode = 'adjust' | 'target' | 'formula';

interface SnapshotComparisonItem extends PriceSnapshotItem {
    currentPrice: number;
    diff: number;
}

const LEGACY_BACKFILL_KEY = 'ilios_pricing_legacy_backfill_v1';

export default function PricingManager({ products, settings, materials }: Props) {
  const [mode, setMode] = useState<Mode>('cost');
  const [markupMode, setMarkupMode] = useState<MarkupMode>('adjust');
  const [markupPercent, setMarkupPercent] = useState<number>(0);
  
  const [isCalculated, setIsCalculated] = useState(false);
  const [calculatedData, setCalculatedData] = useState<BulkPricingItem[]>([]);
  
  // Update state for batching
  const [isCommitting, setIsCommitting] = useState(false);
  const [progress, setProgress] = useState<{ current: number, total: number, failed: number } | null>(null);
  const [processingSingleId, setProcessingSingleId] = useState<string | null>(null);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [listFilter, setListFilter] = useState<PricingListFilter>('all');
  const [sortBy, setSortBy] = useState<PricingSortBy>('sku');
  const [forceApplyFormula, setForceApplyFormula] = useState(false);
  const [includeManualPrices, setIncludeManualPrices] = useState(false);
  const [manualPanelOpen, setManualPanelOpen] = useState(true);
  const legacyBackfillStartedRef = useRef(false);

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
    setForceApplyFormula(false);
    setIncludeManualPrices(false);
    setListFilter('all');
    setSearchTerm('');
    setSelectedSnapshot(null);
  };

  const manualPriceCount = useMemo(() => countManualSellingPrices(products), [products]);

  useEffect(() => {
    if (mode !== 'selling' || legacyBackfillStartedRef.current) return;
    if (typeof window !== 'undefined' && window.localStorage.getItem(LEGACY_BACKFILL_KEY) === 'done') return;

    legacyBackfillStartedRef.current = true;
    const candidates = detectLegacyManualPriceCandidates(products, settings, materials);
    if (candidates.length === 0) {
      window.localStorage.setItem(LEGACY_BACKFILL_KEY, 'done');
      return;
    }

    (async () => {
      try {
        for (const candidate of candidates) {
          if (candidate.isVariant && candidate.variantSuffix !== null) {
            await supabase
              .from('product_variants')
              .update({ selling_price_manual_override: true })
              .match({ product_sku: candidate.masterSku, suffix: candidate.variantSuffix || '' });
          } else {
            await supabase
              .from('products')
              .update({ selling_price_manual_override: true })
              .eq('sku', candidate.masterSku);
          }
        }
        window.localStorage.setItem(LEGACY_BACKFILL_KEY, 'done');
        await invalidateProductsAndCatalog(queryClient);
        showToast(
          `Εντοπίστηκαν ${candidates.length} κωδικοί με τιμή που διαφέρει από τον τύπο Ilios — σημειώθηκαν ως χειροκίνητοι.`,
          'info',
        );
      } catch (error) {
        console.error(error);
      }
    })();
  }, [mode, products, settings, materials, queryClient, showToast]);

  const flattenedInventory = useMemo(
    () => flattenInventoryForPricing(products, mode),
    [products, mode],
  );

  const handleRecalculate = () => {
    const items = buildBulkPricingPreview(products, settings, materials, {
      mode,
      markupMode,
      markupPercent,
    });

    setCalculatedData(items);
    setIsCalculated(true);
    setListFilter('all');

    const summary = summarizePricingPreview(items);
    if (mode === 'cost') {
      showToast(
        `Υπολογίστηκε νέο κόστος για ${summary.total} κωδικούς (Βάση: ${formatDecimal(settings.last_calc_silver_price, 2)}€/g).`,
        'info',
      );
    } else {
      const modeLabel =
        markupMode === 'formula'
          ? 'Τύπος Ilios'
          : markupMode === 'adjust'
            ? `Αναπροσαρμογή ${markupPercent}%`
            : `Στόχος ${markupPercent}%`;
      showToast(
        `Υπολογίστηκαν τιμές (${modeLabel}) για ${summary.total} κωδικούς. ${summary.willUpdate} θα ενημερωθούν, ${summary.manualProtected} προστατεύονται (χειροκίνητες).`,
        'info',
      );
      if (summary.willUpdate === 0 && summary.manualProtected === 0) {
        showToast('Όλες οι τιμές είναι ήδη ενημερωμένες.', 'info');
      }
    }
  };

  const commitItemUpdate = async (item: BulkPricingItem, newVal: number, clearManualFlag: boolean) => {
    const updates: Record<string, number | boolean> = {};
    if (mode === 'cost') {
      updates.active_price = newVal;
      if (!item.isVariant) updates.draft_price = newVal;
    } else {
      updates.selling_price = newVal;
      if (clearManualFlag) updates.selling_price_manual_override = false;
    }

    if (item.isVariant) {
      const { error } = await supabase
        .from('product_variants')
        .update(updates)
        .match({
          product_sku: item.masterSku,
          suffix: item.variantSuffix || '',
        });
      if (error) throw error;
    } else {
      const { error } = await supabase.from('products').update(updates).eq('sku', item.masterSku);
      if (error) throw error;
    }
  };

  const handleSingleUpdate = async (item: BulkPricingItem, options?: { forceManual?: boolean; applyFormula?: boolean }) => {
    const product = products.find((p) => p.sku === item.masterSku);
    if (!product) return;

    if (item.isManualPrice && !options?.forceManual && !options?.applyFormula) {
      const yes = await confirm({
        title: 'Χειροκίνητη Τιμή',
        message: `Ο κωδικός ${item.sku} έχει χειροκίνητη τιμή. Θέλετε να την αντικαταστήσετε;`,
        confirmText: 'Ναι, Αντικατάσταση',
      });
      if (!yes) return;
    }

    setProcessingSingleId(item.id);

    try {
      let newVal = item.newPrice;
      let clearManualFlag = false;

      if (options?.applyFormula) {
        newVal = getIliosSuggestedPriceForProduct(
          product,
          item.variantSuffix,
          settings,
          materials,
          products,
        );
        clearManualFlag = true;
      } else {
        const previewItem = buildBulkPricingPreview([product], settings, materials, {
          mode,
          markupMode,
          markupPercent,
        }).find((row) => row.id === item.id);

        if (previewItem) {
          newVal = previewItem.newPrice;
        }
        clearManualFlag = mode === 'selling';
      }

      if (Math.abs(newVal - item.currentPrice) < 0.01 && !options?.applyFormula) {
        const yes = await confirm({
          title: 'Καμία Αλλαγή',
          message: 'Η νέα τιμή είναι ίδια με την τρέχουσα. Θέλετε να την ενημερώσετε ούτως ή άλλως;',
          confirmText: 'Ναι, Ενημέρωση',
        });
        if (!yes) {
          setProcessingSingleId(null);
          return;
        }
      }

      await commitItemUpdate(item, newVal, clearManualFlag);
      await invalidateProductsAndCatalog(queryClient);
      showToast(`${item.sku}: Ενημερώθηκε σε ${formatCurrency(newVal)}`, 'success');
      setIsCalculated(false);
      setCalculatedData([]);
    } catch (error) {
      console.error(error);
      showToast('Σφάλμα ενημέρωσης.', 'error');
    } finally {
      setProcessingSingleId(null);
    }
  };

  const activeList = isCalculated ? calculatedData : flattenedInventory;
  const previewSummary = useMemo(
    () => (isCalculated ? summarizePricingPreview(calculatedData) : null),
    [isCalculated, calculatedData],
  );
  const manualProtectedItems = useMemo(
    () => (isCalculated ? calculatedData.filter((item) => item.status === 'manual_protected') : []),
    [isCalculated, calculatedData],
  );

  const filteredList = useMemo(() => {
    const filtered = filterPricingList(activeList, isCalculated ? listFilter : 'all', searchTerm);
    return sortPricingList(filtered, sortBy);
  }, [activeList, isCalculated, listFilter, searchTerm, sortBy]);

  // Virtualizer for the massive list
  const rowVirtualizer = useVirtualizer({
    count: filteredList.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 64, // Height of row
    overscan: 20
  });

  const commitPrices = async () => {
    const updatesToApply = isCalculated
      ? getCommitCandidates(calculatedData, {
          mode,
          markupMode,
          forceApplyFormula,
          includeManualPrices,
        })
      : [];
    const count = updatesToApply.length;

    if (count === 0) {
      showToast('Δεν υπάρχουν αλλαγές προς ενημέρωση.', 'info');
      return;
    }

    const manualIncluded = updatesToApply.filter((item) => item.isManualPrice).length;
    const yes = await confirm({
      title: mode === 'cost' ? 'Ενημέρωση Κόστους' : 'Ενημέρωση Τιμών Χονδρικής',
      message:
        mode === 'cost'
          ? `Θα ενημερωθεί η Τιμή Κόστους για ${count} κωδικούς.`
          : manualIncluded > 0
            ? `Θα αλλάξει η Τιμή Χονδρικής για ${count} κωδικούς (συμπεριλαμβανομένων ${manualIncluded} χειροκίνητων). Είστε σίγουροι;`
            : `Θα αλλάξει η Τιμή Χονδρικής για ${count} κωδικούς. ${manualProtectedItems.length} χειροκίνητοι κωδικοί θα παραμείνουν ως έχουν.`,
      confirmText: 'Ενημέρωση',
    });

    if (!yes) return;

    setIsCommitting(true);
    let successCount = 0;
    let failCount = 0;

    try {
      setProgress({ current: 0, total: count, failed: 0 });
      const BATCH_SIZE = 10;

      for (let i = 0; i < updatesToApply.length; i += BATCH_SIZE) {
        const batch = updatesToApply.slice(i, i + BATCH_SIZE);

        const promises = batch.map((item) =>
          commitItemUpdate(item, item.newPrice, mode === 'selling'),
        );

        const results = await Promise.allSettled(promises);

        results.forEach((res) => {
          if (res.status === 'fulfilled') successCount++;
          else {
            failCount++;
            console.error('Batch item failed:', res);
          }
        });

        setProgress({
          current: Math.min(i + BATCH_SIZE, count),
          total: count,
          failed: failCount,
        });

        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      if (mode === 'cost') {
        await supabase
          .from('global_settings')
          .update({ last_calc_silver_price: settings.silver_price_gram })
          .eq('id', 1);
        await queryClient.invalidateQueries({ queryKey: ['settings'] });
      }

      await new Promise((resolve) => setTimeout(resolve, 500));
      await invalidateProductsAndCatalog(queryClient);

      setIsCalculated(false);
      setCalculatedData([]);
      setIncludeManualPrices(false);
      setProgress(null);

      if (failCount > 0) {
        showToast(`Ενημερώθηκαν ${successCount}, απέτυχαν ${failCount}.`, 'warning');
      } else {
        showToast(`Επιτυχής ενημέρωση ${successCount} κωδικών!`, 'success');
      }
    } catch (err) {
      console.error(err);
      showToast('Κρίσιμο σφάλμα κατά την ενημέρωση.', 'error');
    } finally {
      setIsCommitting(false);
      setProgress(null);
    }
  };

  const pendingCommitCount = useMemo(() => {
    if (!isCalculated) return 0;
    return getCommitCandidates(calculatedData, {
      mode,
      markupMode,
      forceApplyFormula,
      includeManualPrices,
    }).length;
  }, [isCalculated, calculatedData, mode, markupMode, forceApplyFormula, includeManualPrices]);

  const handleCreateSnapshot = async () => {
      setIsSnapshotting(true);
      try {
          await api.createPriceSnapshot(snapshotNote || `Χειροκίνητο αντίγραφο - ${new Date().toLocaleDateString('el-GR')}`, products);
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
          title: 'Διαγραφή Αντιγράφου',
          message: 'Θέλετε να διαγράψετε οριστικά αυτό το αντίγραφο τιμών;',
          isDestructive: true
      });
      if (!yes) return;
      try {
          await api.deletePriceSnapshot(snap.id);
          queryClient.invalidateQueries({ queryKey: ['price_snapshots'] });
          if (selectedSnapshot?.id === snap.id) setSelectedSnapshot(null);
          showToast('Το αντίγραφο διαγράφηκε.', 'info');
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
          await invalidateProductsAndCatalog(queryClient);
          showToast("Οι τιμές επανήλθαν επιτυχώς!", "success");
      } catch (err) {
          showToast("Σφάλμα κατά την επαναφορά.", "error");
      } finally {
          setIsCommitting(false);
      }
  };

  return (
    <div className="space-y-8 max-w-6xl mx-auto h-[calc(100vh-100px)] flex flex-col">
      <DesktopPageHeader
        icon={DollarSign}
        title="Διαχείριση Τιμών"
        subtitle="Εργαλεία μαζικής κοστολόγησης και εμπορικής πολιτικής."
        tail={mode !== 'history' ? (
            <button
                type="button"
                onClick={handleCreateSnapshot}
                disabled={isSnapshotting}
                className="flex items-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 bg-white px-5 py-3 text-sm font-bold text-slate-600 transition-all hover:border-blue-400 hover:text-blue-600"
            >
                {isSnapshotting ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                Αντίγραφο Τρεχουσών Τιμών
            </button>
        ) : undefined}
        below={(
            <div className="flex w-fit rounded-2xl border border-slate-100 bg-white p-2 shadow-sm">
                <button
                    type="button"
                    onClick={() => switchMode('cost')}
                    className={`flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-bold transition-all ${mode === 'cost' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}
                >
                    <RefreshCw size={16} /> Κόστος (Silver)
                </button>
                <button
                    type="button"
                    onClick={() => switchMode('selling')}
                    className={`flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-bold transition-all ${mode === 'selling' ? 'bg-amber-500 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}
                >
                    <TrendingUp size={16} /> Χονδρική
                </button>
                <button
                    type="button"
                    onClick={() => switchMode('history')}
                    className={`flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-bold transition-all ${mode === 'history' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}
                >
                    <History size={16} /> Ιστορικό
                </button>
            </div>
        )}
      />

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
                                    <span className="text-[10px] font-black text-slate-400 bg-white px-2 py-1 rounded border border-slate-100 uppercase">Τελευταία</span>
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-emerald-600 mb-2 uppercase tracking-widest flex items-center gap-1">
                                    <TrendingUp size={12}/> Τρέχουσα Τιμή
                                </label>
                                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center justify-between ring-2 ring-emerald-500/10">
                                    <span className="font-mono text-2xl font-black text-emerald-800">{formatDecimal(settings.silver_price_gram, 3)} €/g</span>
                                    <span className="text-[10px] font-black text-emerald-600 bg-white px-2 py-1 rounded border border-slate-100 uppercase animate-pulse">Τρέχουσα</span>
                                </div>
                            </div>
                        </div>
                        <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 text-xs text-slate-600 space-y-3 leading-relaxed">
                            <h4 className="font-black text-slate-800 uppercase text-[10px] flex items-center gap-2 mb-2"><Info size={14} className="text-blue-500"/> Ανάλυση Κόστους</h4>
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
                            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs text-slate-600 leading-relaxed space-y-2">
                                {markupMode === 'adjust' && <p>Αλλάζει τις τρέχουσες τιμές χονδρικής κατά το ποσοστό που θα ορίσετε (π.χ. +5% για πληθωρισμό).</p>}
                                {markupMode === 'target' && <p>Υπολογίζει νέες τιμές χονδρικής ώστε κάθε SKU να έχει το ίδιο περιθώριο κέρδους βάσει του τρέχοντος κόστους.</p>}
                                {markupMode === 'formula' && <p>Εφαρμόζει τον τυπικό μαθηματικό τύπο του Ilios για υπολογισμό προτεινόμενης χονδρικής βάσει κόστους εργατικών/υλικών (x2) και βάρους.</p>}
                                <p className="text-amber-700 font-medium flex items-start gap-1.5 pt-1 border-t border-slate-200">
                                    <Lock size={12} className="shrink-0 mt-0.5" />
                                    Κωδικοί με χειροκίνητη τιμή στο Μητρώο δεν θα τροποποιηθούν αυτόματα.
                                </p>
                                {manualPriceCount > 0 && (
                                    <p className="text-slate-500">{manualPriceCount} κωδικοί με χειροκίνητη τιμή στο σύστημα.</p>
                                )}
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
                        {mode === 'selling' && (
                            <>
                                {markupMode === 'formula' && (
                                    <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                                        <input type="checkbox" checked={forceApplyFormula} onChange={e => setForceApplyFormula(e.target.checked)} className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500" />
                                        <span>Εφαρμογή σε όλους (ακόμα και χωρίς αλλαγή)</span>
                                    </label>
                                )}
                                <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                                    <input type="checkbox" checked={includeManualPrices} onChange={e => setIncludeManualPrices(e.target.checked)} className="rounded border-slate-300 text-amber-600 focus:ring-amber-500" />
                                    <span>Συμπερίληψη χειροκίνητων τιμών</span>
                                </label>
                            </>
                        )}
                        <div className="flex gap-3 justify-center">
                            <button onClick={() => { setIsCalculated(false); setCalculatedData([]); setForceApplyFormula(false); setIncludeManualPrices(false); setListFilter('all'); }} disabled={isCommitting} className="px-6 py-3 rounded-xl font-bold text-slate-500 hover:bg-slate-100 transition-colors disabled:opacity-50">
                                Ακύρωση
                            </button>
                            <button onClick={commitPrices} disabled={isCommitting || pendingCommitCount === 0} className="px-8 py-3 rounded-xl font-bold flex items-center gap-2 bg-emerald-600 text-white shadow-lg shadow-emerald-200 hover:bg-emerald-700 transition-all hover:-translate-y-0.5 disabled:opacity-70 disabled:translate-y-0">
                                {isCommitting ? <Loader2 size={20} className="animate-spin" /> : <CheckCircle size={20} />}
                                {isCommitting
                                    ? `Ενημέρωση (${progress ? Math.round((progress.current / progress.total) * 100) : 0}%)...`
                                    : `Εφαρμογή σε ${pendingCommitCount}`}
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
                {isCalculated && previewSummary && (
                    <div className="px-4 pt-4 grid grid-cols-1 md:grid-cols-3 gap-3 shrink-0">
                        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4">
                            <div className="text-[10px] font-black uppercase tracking-widest text-emerald-700">Προς Ενημέρωση</div>
                            <div className="text-2xl font-black text-emerald-700 mt-1">{previewSummary.willUpdate}</div>
                        </div>
                        <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
                            <div className="text-[10px] font-black uppercase tracking-widest text-amber-700 flex items-center gap-1"><Lock size={12}/> Προστατευόμενες</div>
                            <div className="text-2xl font-black text-amber-700 mt-1">{previewSummary.manualProtected}</div>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                            <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Χωρίς Αλλαγή</div>
                            <div className="text-2xl font-black text-slate-600 mt-1">{previewSummary.unchanged}</div>
                        </div>
                    </div>
                )}

                {isCalculated && manualProtectedItems.length > 0 && (
                    <div className="mx-4 mt-3 rounded-2xl border border-amber-200 bg-amber-50/40 shrink-0 overflow-hidden">
                        <button
                            type="button"
                            onClick={() => setManualPanelOpen((open) => !open)}
                            className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-amber-50 transition-colors"
                        >
                            <span className="text-sm font-black text-amber-800 flex items-center gap-2">
                                <Lock size={16} />
                                Προστατευόμενες Χειροκίνητες Τιμές ({manualProtectedItems.length})
                            </span>
                            {manualPanelOpen ? <ChevronUp size={16} className="text-amber-700" /> : <ChevronDown size={16} className="text-amber-700" />}
                        </button>
                        {manualPanelOpen && (
                            <div className="px-4 pb-4 space-y-2 max-h-48 overflow-y-auto custom-scrollbar">
                                {manualProtectedItems.map((item) => (
                                    <div key={item.id} className="flex items-center justify-between gap-3 p-3 bg-white rounded-xl border border-amber-100">
                                        <div className="min-w-0">
                                            <div className="font-mono font-bold text-slate-800 text-sm">{item.sku}</div>
                                            <div className="text-[10px] text-slate-500 truncate">{item.name}</div>
                                        </div>
                                        <div className="text-right shrink-0">
                                            <div className="text-xs text-slate-500">Τρέχουσα: {formatCurrency(item.currentPrice)}</div>
                                            {item.suggestedPrice != null && (
                                                <div className="text-xs text-emerald-700 font-bold">Τύπος: {formatCurrency(item.suggestedPrice)}</div>
                                            )}
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => handleSingleUpdate(item, { applyFormula: true })}
                                            disabled={processingSingleId === item.id}
                                            className="shrink-0 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-[10px] font-bold hover:bg-emerald-700 flex items-center gap-1 disabled:opacity-60"
                                        >
                                            {processingSingleId === item.id ? <Loader2 size={12} className="animate-spin" /> : <Wand2 size={12} />}
                                            Εφαρμογή τύπου
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                <div className="p-4 bg-slate-50 border-b border-slate-100 flex flex-col lg:flex-row lg:items-center justify-between gap-3 shrink-0">
                    <div className="flex flex-wrap items-center gap-2 text-slate-600 font-bold">
                        {isCalculated ? <Layers size={18} className="text-emerald-500"/> : <AlertCircle size={18}/>}
                        {isCalculated ? 'Ανάλυση & Προεπισκόπηση' : 'Όλοι οι Κωδικοί & Παραλλαγές'}
                        <span className="bg-white px-2 py-0.5 rounded text-xs border border-slate-200">{filteredList.length} εγγραφές</span>
                        {!isCalculated && mode === 'selling' && manualPriceCount > 0 && (
                            <span className="bg-amber-100 text-amber-800 px-2 py-0.5 rounded text-xs border border-amber-200 flex items-center gap-1">
                                <Lock size={10} /> {manualPriceCount} χειροκίνητες
                            </span>
                        )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        {isCalculated && (
                            <div className="flex flex-wrap gap-1">
                                {([
                                    ['all', 'Όλα'],
                                    ['changes', 'Με αλλαγές'],
                                    ['manual', 'Χειροκίνητες'],
                                    ['unchanged', 'Χωρίς αλλαγές'],
                                ] as const).map(([value, label]) => (
                                    <button
                                        key={value}
                                        type="button"
                                        onClick={() => setListFilter(value)}
                                        className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${listFilter === value ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-500 hover:bg-slate-100'}`}
                                    >
                                        {label}
                                    </button>
                                ))}
                            </div>
                        )}
                        <select
                            value={sortBy}
                            onChange={(e) => setSortBy(e.target.value as PricingSortBy)}
                            className="text-[10px] font-bold bg-white border border-slate-200 rounded-lg px-2 py-1.5 outline-none"
                        >
                            <option value="sku">Κωδικός (Α-Ω)</option>
                            <option value="diff_desc">Μεγαλύτερη διαφορά</option>
                            <option value="margin_asc">Μικρότερο περιθώριο</option>
                        </select>
                        {isCalculated && mode === 'cost' && (
                            <span className="text-xs bg-amber-50 px-2 py-1 rounded text-amber-700 font-bold border border-amber-100">Νέα Βάση: {settings.silver_price_gram}€/g</span>
                        )}
                        <div className="relative w-56">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={14}/>
                            <input
                                type="text"
                                placeholder="Αναζήτηση κωδικού, περιγραφής..."
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                className="w-full pl-8 py-1.5 text-xs bg-white border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500/20"
                            />
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)_24px_minmax(0,0.8fr)_minmax(0,0.7fr)_minmax(0,0.6fr)_88px] gap-2 px-4 py-2 bg-white border-b border-slate-100 text-[10px] font-black uppercase tracking-widest text-slate-400 shrink-0 sticky top-0 z-10">
                    <div className="pl-4">Κωδικός</div>
                    <div className="text-right">Τρέχουσα</div>
                    <div />
                    <div className="text-right">Νέα</div>
                    <div className="text-right">Διαφορά</div>
                    <div className="text-right">{mode === 'selling' ? 'Περιθώριο' : ''}</div>
                    <div className="text-right pr-2">Ενέργειες</div>
                </div>
                
                <div className="flex-1 overflow-auto custom-scrollbar" ref={parentRef}>
                    <div 
                        style={{ height: `${rowVirtualizer.getTotalSize()}px`, width: '100%', position: 'relative' }}
                    >
                        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                            const item = filteredList[virtualRow.index];
                            const diff = item.newPrice - item.currentPrice;
                            const isProcessing = processingSingleId === item.id;
                            
                            const margin = mode === 'selling' ? getPricingItemMargin(item) : 0;
                            const rowClass = item.status === 'manual_protected'
                                ? 'bg-amber-50/80 hover:bg-amber-100/80'
                                : item.hasChange
                                    ? 'bg-emerald-50/60 hover:bg-emerald-100/60'
                                    : 'hover:bg-slate-50/80';

                            return (
                                <div 
                                    key={virtualRow.key}
                                    className={`absolute top-0 left-0 w-full grid grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)_24px_minmax(0,0.8fr)_minmax(0,0.7fr)_minmax(0,0.6fr)_88px] gap-2 items-center border-b border-slate-50 transition-colors ${rowClass}`}
                                    style={{ 
                                        height: `${virtualRow.size}px`, 
                                        transform: `translateY(${virtualRow.start}px)`
                                    }}
                                >
                                    <div className="px-4 pl-8 flex flex-col justify-center min-w-0">
                                        <div className="font-mono font-bold text-slate-700 flex items-center gap-2 flex-wrap">
                                            {item.sku}
                                            {item.isVariant && <span className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded border border-blue-100 font-bold">Παρ.</span>}
                                            {item.isManualPrice && (
                                                <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded border border-amber-200 font-bold flex items-center gap-1">
                                                    <Lock size={10} /> Χειροκίνητη
                                                </span>
                                            )}
                                        </div>
                                        <div className="text-[10px] text-slate-400 truncate">{item.name}</div>
                                        <div className="text-[9px] text-slate-300 truncate">{item.category}</div>
                                    </div>
                                    <div className="px-2 text-right flex flex-col justify-center">
                                        <span className="text-slate-500 font-mono text-xs">{formatCurrency(item.currentPrice)}</span>
                                        <span className="text-[9px] text-slate-300 uppercase font-bold">{mode === 'cost' ? 'Κόστος' : 'Τιμή'}</span>
                                    </div>
                                    <div className="flex items-center justify-center text-slate-300"><ArrowRight size={14}/></div>
                                    <div className="px-2 text-right flex flex-col justify-center">
                                        <span className={`font-black font-mono text-sm ${item.hasChange || item.status === 'manual_protected' ? 'text-slate-800' : 'text-slate-400'}`}>{formatCurrency(item.newPrice)}</span>
                                    </div>
                                    <div className="px-2 text-right flex flex-col justify-center">
                                        {Math.abs(diff) > 0.01 && (
                                            <div className={`text-xs font-bold flex items-center justify-end gap-1 ${diff > 0 ? (mode === 'cost' ? 'text-rose-500' : 'text-emerald-500') : (mode === 'cost' ? 'text-emerald-500' : 'text-rose-500')}`}>
                                                {diff > 0 ? <ArrowUpRight size={12}/> : <ArrowDownRight size={12}/>}
                                                {formatDecimal(Math.abs(diff), 2)}€
                                            </div>
                                        )}
                                        {item.status === 'manual_protected' && item.suggestedPrice != null && Math.abs(item.suggestedPrice - item.currentPrice) > 0.01 && (
                                            <div className="text-[9px] text-amber-600 font-bold">Τύπος: {formatCurrency(item.suggestedPrice)}</div>
                                        )}
                                    </div>
                                    <div className="px-2 text-right flex flex-col justify-center">
                                        {mode === 'selling' && (
                                            <span className={`font-black text-xs ${margin < 30 ? 'text-rose-500' : 'text-emerald-600'}`}>{formatDecimal(margin, 1)}%</span>
                                        )}
                                    </div>
                                    <div className="px-2 pr-4 text-right flex items-center justify-end gap-1">
                                        {item.isManualPrice && isCalculated && (
                                            <button
                                                onClick={() => handleSingleUpdate(item, { applyFormula: true })}
                                                disabled={isProcessing}
                                                className="p-1.5 rounded-lg text-amber-500 hover:text-emerald-600 hover:bg-emerald-50 transition-colors"
                                                title="Εφαρμογή τύπου"
                                            >
                                                {isProcessing ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14}/>}
                                            </button>
                                        )}
                                        <button 
                                            onClick={() => handleSingleUpdate(item, { forceManual: true })}
                                            disabled={isProcessing || (item.isManualPrice && !isCalculated)}
                                            className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors disabled:opacity-40"
                                            title="Ενημέρωση"
                                        >
                                            {isProcessing ? <Loader2 size={16} className="animate-spin text-emerald-500"/> : <RefreshCw size={16}/>}
                                        </button>
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
                      <h3 className="font-bold text-slate-800 flex items-center gap-2"><History size={18} className="text-blue-500"/> Λίστα Αντιγράφων</h3>
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
                                      <RotateCcw size={12}/> Επαναφορά
                                  </button>
                                  <button onClick={(e) => { e.stopPropagation(); viewSnapshotDetails(snap); }} className="flex-1 flex items-center justify-center gap-1.5 py-1.5 bg-blue-50 text-blue-600 rounded-lg text-xs font-bold hover:bg-blue-100 transition-colors">
                                      <Eye size={12}/> Προβολή
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
                                <h3 className="font-bold text-slate-800">Σύγκριση Αντιγράφου με Τρέχουσες Τιμές</h3>
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
                                            <th className="p-4 text-right">Τιμή Αντιγράφου</th>
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
                          <p className="font-bold text-lg">Επιλέξτε ένα Αντίγραφο</p>
                          <p className="text-sm">Για να δείτε πώς έχουν αλλάξει οι τιμές από τότε μέχρι σήμερα.</p>
                      </div>
                  )}
              </div>
          </div>
      )}
    </div>
  );
}
