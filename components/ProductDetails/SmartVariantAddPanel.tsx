import React, { useEffect, useMemo, useState } from 'react';
import { Gem, Info, Plus, Wand2 } from 'lucide-react';
import { Gender, Product, ProductVariant } from '../../types';
import { FINISH_CODES } from '../../constants';
import { analyzeSuffix, estimateVariantCost, formatCurrency } from '../../utils/pricingEngine';
import { availableFinishes } from '../ProductRegistry/constants';
import { getStoneChipStyle } from '../../features/products/registryStoneChipStyles';
import {
  buildSmartAddSuffixPlan,
  createVariantsFromSmartAdd,
  getStoneCatalogForGender,
} from '../../features/products/variantSmartAdd';
import { getSmartVariantPreview } from '../../features/products/productDetailsViewModels';
import SkuColorizedText from '../SkuColorizedText';

interface Props {
  product: Product;
  settings: any;
  allMaterials: any[];
  allProducts: Product[];
  existingVariants: ProductVariant[];
  onAddVariants: (variants: ProductVariant[]) => void;
  showToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

const FINISH_CHIP_COLORS: Record<string, string> = {
  '': 'bg-emerald-100 text-emerald-700 border-emerald-200',
  P: 'bg-stone-100 text-stone-700 border-stone-200',
  D: 'bg-orange-100 text-orange-700 border-orange-200',
  X: 'bg-amber-100 text-amber-700 border-amber-200',
  H: 'bg-cyan-100 text-cyan-700 border-cyan-200',
};

export default function SmartVariantAddPanel({
  product,
  settings,
  allMaterials,
  allProducts,
  existingVariants,
  onAddVariants,
  showToast,
}: Props) {
  const [selectedFinishes, setSelectedFinishes] = useState<string[]>(['']);
  const [stoneSuffix, setStoneSuffix] = useState('');
  const [descriptionOverride, setDescriptionOverride] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [advancedSuffix, setAdvancedSuffix] = useState('');

  const existingSuffixSet = useMemo(
    () => new Set((existingVariants || []).map((variant) => variant.suffix)),
    [existingVariants],
  );

  const stoneCatalog = useMemo(
    () => getStoneCatalogForGender(product.gender),
    [product.gender],
  );

  const filteredStones = useMemo(() => {
    const term = stoneSuffix.trim().toUpperCase();
    if (!term) return stoneCatalog;
    return stoneCatalog.filter(
      (stone) =>
        stone.code.includes(term) ||
        stone.name.toUpperCase().includes(term),
    );
  }, [stoneCatalog, stoneSuffix]);

  const addPlan = useMemo(
    () => buildSmartAddSuffixPlan(selectedFinishes, stoneSuffix, existingSuffixSet),
    [selectedFinishes, stoneSuffix, existingSuffixSet],
  );

  const pendingSuffixes = addPlan
    .filter((entry) => !entry.skippedDuplicate)
    .map((entry) => entry.suffix);

  const singlePendingSuffix = pendingSuffixes.length === 1 ? pendingSuffixes[0] : null;

  const smartPreview = useMemo(() => {
    if (showAdvanced && advancedSuffix.trim()) {
      return getSmartVariantPreview(product, advancedSuffix, settings, allMaterials, allProducts);
    }
    if (singlePendingSuffix === null) return null;
    return getSmartVariantPreview(
      product,
      singlePendingSuffix,
      settings,
      allMaterials,
      allProducts,
      { allowEmpty: singlePendingSuffix === '' },
    );
  }, [showAdvanced, advancedSuffix, singlePendingSuffix, product, settings, allMaterials, allProducts]);

  useEffect(() => {
    if (showAdvanced && advancedSuffix.trim()) {
      const clean = advancedSuffix.trim().toUpperCase();
      setDescriptionOverride(analyzeSuffix(clean, product.gender, product.plating_type) || clean);
      return;
    }
    if (singlePendingSuffix === null) {
      setDescriptionOverride('');
      return;
    }
    setDescriptionOverride(
      analyzeSuffix(singlePendingSuffix, product.gender, product.plating_type) ||
        singlePendingSuffix ||
        'Λουστρέ',
    );
  }, [showAdvanced, advancedSuffix, singlePendingSuffix, product.gender, product.plating_type]);

  const toggleFinish = (code: string) => {
    setSelectedFinishes((prev) =>
      prev.includes(code) ? prev.filter((item) => item !== code) : [...prev, code],
    );
  };

  const handleStoneSelect = (code: string) => {
    setStoneSuffix(code);
  };

  const handleCreate = () => {
    if (selectedFinishes.length === 0) {
      showToast('Επιλέξτε τουλάχιστον ένα φινίρισμα.', 'error');
      return;
    }

    if (showAdvanced && advancedSuffix.trim()) {
      const rawSuffix = advancedSuffix.trim().toUpperCase();
      if (existingSuffixSet.has(rawSuffix)) {
        showToast('Αυτή η παραλλαγή υπάρχει ήδη.', 'info');
        return;
      }

      const { total: estimatedCost } = estimateVariantCost(
        product,
        rawSuffix,
        settings,
        allMaterials,
        allProducts,
      );

      const description =
        descriptionOverride.trim() ||
        analyzeSuffix(rawSuffix, product.gender, product.plating_type) ||
        rawSuffix;

      onAddVariants([
        {
          suffix: rawSuffix,
          description,
          stock_qty: 0,
          active_price: estimatedCost,
          selling_price: product.is_component ? 0 : product.selling_price,
        },
      ]);
      setAdvancedSuffix('');
      setDescriptionOverride('');
      showToast(`Παραλλαγή ${rawSuffix || 'Λουστρέ'} προστέθηκε!`, 'success');
      return;
    }

    const result = createVariantsFromSmartAdd({
      product,
      selectedFinishes,
      stoneSuffix,
      descriptionOverride: singlePendingSuffix !== null ? descriptionOverride : undefined,
      settings,
      allMaterials,
      allProducts,
      existingSuffixes: [...existingSuffixSet],
    });

    if (result.addedCount > 0) {
      onAddVariants(result.variants);
      setStoneSuffix('');
      setDescriptionOverride('');
      showToast(
        result.addedCount === 1
          ? 'Προστέθηκε 1 παραλλαγή'
          : `Προστέθηκαν ${result.addedCount} παραλλαγές`,
        'success',
      );
    } else {
      showToast('Δεν προστέθηκαν νέες παραλλαγές (ίσως υπάρχουν ήδη).', 'info');
    }
  };

  const genderLabel =
    product.gender === Gender.Men
      ? 'Ανδρικές'
      : product.gender === Gender.Women
        ? 'Γυναικείες'
        : 'Όλες';

  return (
    <div className="bg-slate-50/50 p-5 rounded-2xl border border-slate-200/80 shadow-sm relative overflow-hidden">
      <div className="absolute top-0 right-0 p-10 opacity-[0.03] pointer-events-none">
        <Wand2 size={120} />
      </div>

      <h4 className="font-bold text-slate-700 flex items-center gap-2 uppercase text-xs tracking-wider border-b border-slate-200 pb-3 mb-4 relative z-10">
        <div className="p-1.5 bg-amber-100 rounded-lg">
          <Wand2 size={13} className="text-amber-600" />
        </div>
        Έξυπνη Προσθήκη
      </h4>

      <div className="space-y-4 relative z-10">
        <div>
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-2 block">
            Φινίρισμα
          </label>
          <div className="flex flex-wrap gap-2">
            {availableFinishes.map((finish) => {
              const isSelected = selectedFinishes.includes(finish.code);
              const colorCls = FINISH_CHIP_COLORS[finish.code] || FINISH_CHIP_COLORS[''];
              return (
                <button
                  key={finish.code || 'lustre'}
                  type="button"
                  onClick={() => toggleFinish(finish.code)}
                  className={`px-3 py-2 rounded-xl text-xs font-bold transition-all border ${
                    isSelected
                      ? `${colorCls} shadow-sm ring-2 ring-offset-1 ring-slate-200`
                      : 'bg-white border-slate-200 text-slate-400 hover:border-slate-300'
                  }`}
                >
                  {finish.label}
                </button>
              );
            })}
          </div>
          <p className="text-[10px] text-slate-400 mt-2 flex items-center gap-1">
            <Info size={10} />
            Θα δημιουργηθούν:{' '}
            <strong>
              {selectedFinishes.map((code) => FINISH_CODES[code] || 'Λουστρέ').join(', ') || '—'}
            </strong>
          </p>
        </div>

        <div>
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-2 flex items-center gap-1">
            <Gem size={11} /> Πέτρα <span className="font-normal normal-case">({genderLabel})</span>
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_140px] gap-2 mb-2">
            <input
              type="text"
              placeholder="Κωδικός πέτρας (π.χ. PR, TG) ή κενό για σκέτο μέταλλο"
              value={stoneSuffix}
              onChange={(e) => setStoneSuffix(e.target.value.toUpperCase())}
              className="w-full p-3 border border-slate-200 rounded-xl font-mono text-sm font-black uppercase bg-white shadow-sm focus:ring-2 focus:ring-amber-400/20 focus:border-amber-300 outline-none transition-all"
            />
            <select
              value={stoneCatalog.some((s) => s.code === stoneSuffix) ? stoneSuffix : ''}
              onChange={(e) => handleStoneSelect(e.target.value)}
              className="w-full p-3 border border-slate-200 rounded-xl text-sm font-bold bg-white text-slate-700 outline-none focus:ring-2 focus:ring-amber-400/20 focus:border-amber-300"
            >
              <option value="">— Επιλογή —</option>
              {stoneCatalog.map((stone) => (
                <option key={stone.code} value={stone.code}>
                  {stone.name} ({stone.code})
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto custom-scrollbar p-1 -mx-1">
            {filteredStones.map((stone) => {
              const style = getStoneChipStyle(stone.code);
              const isActive = stoneSuffix === stone.code;
              return (
                <button
                  key={stone.code}
                  type="button"
                  onClick={() => handleStoneSelect(stone.code)}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[11px] font-bold border transition-all ${
                    isActive
                      ? `${style.bg} ${style.text} border-current ring-2 ring-offset-1 ring-current/30 shadow`
                      : `${style.bg} ${style.text} border-transparent hover:border-current/40 opacity-85 hover:opacity-100`
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${style.dot} shrink-0`} />
                  {stone.name}
                  <span className="opacity-50 text-[10px] font-mono">{stone.code}</span>
                </button>
              );
            })}
          </div>
        </div>

        {pendingSuffixes.length > 0 && !showAdvanced && (
          <div className="flex flex-wrap gap-2">
            {pendingSuffixes.map((suffix) => (
              <div
                key={suffix || 'lustre'}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 shadow-sm"
              >
                <SkuColorizedText sku={product.sku} suffix={suffix} gender={product.gender} className="text-xs" />
              </div>
            ))}
          </div>
        )}

        {smartPreview && (
          <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm animate-in slide-in-from-top-2 fade-in">
            <div className="flex justify-between items-start mb-2 gap-4">
              <div className="flex-1 min-w-0">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-0.5">
                  Περιγραφή
                </div>
                <input
                  type="text"
                  value={descriptionOverride}
                  onChange={(e) => setDescriptionOverride(e.target.value)}
                  placeholder={smartPreview.description}
                  className="w-full font-bold text-slate-800 text-sm bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 outline-none focus:ring-2 focus:ring-amber-400/20 focus:border-amber-300"
                />
              </div>
              <div className="text-right shrink-0">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-0.5">
                  Εκτίμηση Κόστους
                </div>
                <div className="font-black text-lg text-emerald-600">{formatCurrency(smartPreview.cost)}</div>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs font-mono">
              <span className="text-slate-500">Διαφορά από Master:</span>
              <span
                className={`font-bold ${smartPreview.diff > 0 ? 'text-rose-500' : 'text-emerald-500'}`}
              >
                {smartPreview.diff > 0 ? '+' : ''}
                {formatCurrency(smartPreview.diff)}
              </span>
            </div>

            <div className="flex gap-1.5 mt-2 flex-wrap">
              {smartPreview.breakdown.details.plating_cost === 0 && (
                <span className="text-[9px] bg-slate-50 text-slate-500 px-2 py-0.5 rounded-md border border-slate-200 font-bold">
                  No Plating
                </span>
              )}
              {smartPreview.breakdown.details.plating_cost > 0 && (
                <span className="text-[9px] bg-amber-50 text-amber-700 px-2 py-0.5 rounded-md border border-amber-100 font-bold">
                  +{formatCurrency(smartPreview.breakdown.details.plating_cost)} Plating
                </span>
              )}
              {Math.abs(smartPreview.breakdown.details.stone_diff || 0) > 0.01 && (
                <span className="text-[9px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-md border border-emerald-100 font-bold">
                  {smartPreview.breakdown.details.stone_diff > 0 ? '+' : ''}
                  {formatCurrency(smartPreview.breakdown.details.stone_diff)} Stone Diff
                </span>
              )}
            </div>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
          <button
            type="button"
            onClick={handleCreate}
            disabled={selectedFinishes.length === 0}
            className="bg-slate-900 text-white px-6 py-3 rounded-xl font-bold hover:bg-black transition-all shadow-lg active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <Plus size={20} />
            Δημιουργία
            {pendingSuffixes.length > 1 ? ` (${pendingSuffixes.length})` : ''}
          </button>
          <button
            type="button"
            onClick={() => setShowAdvanced((prev) => !prev)}
            className="text-[11px] font-bold text-slate-500 hover:text-slate-700 px-3 py-2 rounded-lg hover:bg-white border border-transparent hover:border-slate-200 transition-all"
          >
            {showAdvanced ? 'Απόκρυψη προχωρημένου' : 'Προχωρημένο: πλήρες suffix'}
          </button>
        </div>

        {showAdvanced && (
          <div className="pt-2 border-t border-slate-200/80">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1.5 block">
              Πλήρες Suffix (πληκτρολόγηση)
            </label>
            <input
              type="text"
              placeholder="π.χ. P, X, BSU, ή κενό για Λουστρέ"
              value={advancedSuffix}
              onChange={(e) => setAdvancedSuffix(e.target.value.toUpperCase())}
              className="w-full p-3 border border-slate-200 rounded-xl font-mono text-sm font-black uppercase bg-white shadow-sm focus:ring-2 focus:ring-slate-400/20 outline-none"
            />
          </div>
        )}
      </div>
    </div>
  );
}
