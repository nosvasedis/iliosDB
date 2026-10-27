import { useRestartDraft } from '../../hooks/useRestartBlocker';
import StoneCodeText from '../StoneCodeText';
import { formatNumber } from '../../utils/numberFormat';
import React, { useEffect, useMemo, useState } from 'react';
import { Check, Gem, Info, Plus, Wand2 } from 'lucide-react';
import { DetailsButton, detailsInputClass, detailsMonoInputClass } from './detailsUi';
import { Gender, Product, ProductVariant } from '../../types';
import { FINISH_CODES } from '../../constants';
import { analyzeSuffix, estimateVariantCost, formatCurrency } from '../../utils/pricingEngine';
import { availableFinishes } from '../ProductRegistry/constants';
import { getStoneChipStyle } from '../../features/products/registryStoneChipStyles';
import {
  buildSmartAddSuffixPlan,
  buildVariantSuffixFromFinishAndStone,
  createVariantsFromSmartAdd,
  getSmartAddVariantSellingPrice,
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
  const [selectedFinishes, setSelectedFinishes] = useState<string[]>([]);
  const [stoneSuffix, setStoneSuffix] = useState('');
  const [descriptionOverride, setDescriptionOverride] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [advancedSuffix, setAdvancedSuffix] = useState('');

  useRestartDraft('Νέα παραλλαγή SKU', { selectedFinishes, stoneSuffix, descriptionOverride, advancedSuffix }, { identity: product.sku });

  const existingSuffixSet = useMemo(
    () => new Set((existingVariants || []).map((variant) => variant.suffix)),
    [existingVariants],
  );

  const stoneCatalog = useMemo(
    () => getStoneCatalogForGender(product.gender),
    [product.gender],
  );

  const visibleFinishes = useMemo(
    () => availableFinishes.filter((finish) =>
      !existingSuffixSet.has(buildVariantSuffixFromFinishAndStone(finish.code, stoneSuffix)),
    ),
    [existingSuffixSet, stoneSuffix],
  );

  const availableStones = useMemo(() => {
    const finishes = selectedFinishes.length > 0
      ? selectedFinishes
      : availableFinishes.map((finish) => finish.code);
    return stoneCatalog.filter((stone) => finishes.some((finish) =>
      !existingSuffixSet.has(buildVariantSuffixFromFinishAndStone(finish, stone.code)),
    ));
  }, [stoneCatalog, selectedFinishes, existingSuffixSet]);

  useEffect(() => {
    setSelectedFinishes((previous) => {
      const next = previous.filter((code) => visibleFinishes.some((finish) => finish.code === code));
      return next.length === previous.length ? previous : next;
    });
  }, [visibleFinishes]);

  const filteredStones = useMemo(() => {
    const term = stoneSuffix.trim().toUpperCase();
    if (!term) return availableStones;
    return availableStones.filter(
      (stone) =>
        stone.code.includes(term) ||
        stone.name.toUpperCase().includes(term),
    );
  }, [availableStones, stoneSuffix]);

  const addPlan = useMemo(
    () => buildSmartAddSuffixPlan(selectedFinishes, stoneSuffix, existingSuffixSet),
    [selectedFinishes, stoneSuffix, existingSuffixSet],
  );

  const pendingSuffixes = addPlan
    .filter((entry) => !entry.skippedDuplicate)
    .map((entry) => entry.suffix);

  const singlePendingSuffix = pendingSuffixes.length === 1 ? pendingSuffixes[0] : null;
  const canCreate = showAdvanced && advancedSuffix.trim()
    ? !existingSuffixSet.has(advancedSuffix.trim().toUpperCase())
    : pendingSuffixes.length > 0;

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
          selling_price: getSmartAddVariantSellingPrice(
            product,
            rawSuffix,
            settings,
            allMaterials,
            allProducts,
          ),
          selling_price_manual_override: false,
        },
      ]);
      setAdvancedSuffix('');
      setDescriptionOverride('');
      showToast(`Παραλλαγή ${rawSuffix || 'Λουστρέ'} προστέθηκε!`, 'success');
      return;
    }

    if (selectedFinishes.length === 0) {
      showToast('Επιλέξτε τουλάχιστον ένα φινίρισμα.', 'error');
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
          : `Προστέθηκαν ${formatNumber(result.addedCount)} παραλλαγές`,
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
    <section data-tone="molds" className="sku-section rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
      <div className="sku-section-heading mb-4 flex items-center gap-2.5 border-b border-slate-100 pb-3">
        <span className="shrink-0 rounded-lg bg-amber-50 p-1.5 ring-1 ring-amber-100">
          <Wand2 size={15} className="text-amber-700" />
        </span>
        <div className="min-w-0">
          <h4 className="text-[13px] font-bold uppercase tracking-wide">Έξυπνη προσθήκη</h4>
          <p className="truncate text-[11px] font-medium normal-case text-slate-500">Επιλέξτε φινιρίσματα και πέτρα — δημιουργούνται μόνο οι συνδυασμοί που λείπουν</p>
        </div>
      </div>

      <div className="space-y-5">
        <div>
          <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Φινίρισμα
          </label>
          <div className="flex flex-wrap gap-2">
            {visibleFinishes.map((finish) => {
              const isSelected = selectedFinishes.includes(finish.code);
              const colorCls = FINISH_CHIP_COLORS[finish.code] || FINISH_CHIP_COLORS[''];
              return (
                <button
                  key={finish.code || 'lustre'}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => toggleFinish(finish.code)}
                  className={`inline-flex h-8 select-none items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition-all duration-150 ${
                    isSelected
                      ? `${colorCls} shadow-sm`
                      : 'border-slate-200 bg-white text-slate-600 shadow-sm shadow-slate-200/60 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  {isSelected ? <Check size={13} strokeWidth={2.5} /> : null}
                  {finish.label}
                </button>
              );
            })}
            {visibleFinishes.length === 0 && (
              <p className="text-xs text-slate-500">Όλοι οι συνδυασμοί φινιρίσματος υπάρχουν ήδη.</p>
            )}
          </div>
          <p className="mt-2 flex items-center gap-1 text-[11px] text-slate-500">
            <Info size={11} />
            Θα δημιουργηθούν:{' '}
            <strong>
              {selectedFinishes.map((code) => FINISH_CODES[code] || 'Λουστρέ').join(', ') || '—'}
            </strong>
          </p>
        </div>

        <div>
          <label className="mb-2 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            <Gem size={11} /> Πέτρα <span className="font-normal normal-case">({genderLabel})</span>
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_140px] gap-2 mb-2">
            <input
              type="text"
              placeholder="Κωδικός πέτρας (π.χ. PR, TG) ή κενό για σκέτο μέταλλο"
              value={stoneSuffix}
              onChange={(e) => setStoneSuffix(e.target.value.toUpperCase())}
              className={`${detailsMonoInputClass} uppercase`}
            />
            <select
              value={availableStones.some((s) => s.code === stoneSuffix) ? stoneSuffix : ''}
              onChange={(e) => handleStoneSelect(e.target.value)}
              className={detailsInputClass}
            >
              <option value="">— Επιλογή —</option>
              {availableStones.map((stone) => (
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
                  aria-label={`Πέτρα ${stone.name}`}
                  className={`inline-flex h-7 select-none items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-semibold transition-all duration-150 ${
                    isActive
                      ? `${style.bg} ${style.text} border-current shadow-sm`
                      : `${style.bg} ${style.text} border-transparent opacity-80 hover:border-current/30 hover:opacity-100`
                  }`}
                >
                  {isActive ? <Check size={12} strokeWidth={2.5} className="shrink-0" /> : <span className={`w-2 h-2 rounded-full ${style.dot} shrink-0`} />}
                  {stone.name}
                  <span className="opacity-50 text-[10px] font-mono"><StoneCodeText code={stone.code} /></span>
                </button>
              );
            })}
            {filteredStones.length === 0 && (
              <p className="text-xs text-slate-500">Δεν υπάρχουν νέοι συνδυασμοί πέτρας.</p>
            )}
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
          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 animate-in slide-in-from-top-2 fade-in">
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
                  className={detailsInputClass}
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

        <div className="flex flex-col items-stretch gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <DetailsButton variant="ghost" size="sm" onClick={() => setShowAdvanced((prev) => !prev)} className="text-slate-500">
            {showAdvanced ? 'Απόκρυψη προχωρημένου' : 'Προχωρημένο: πλήρες suffix'}
          </DetailsButton>
          <DetailsButton variant="primary" size="md" icon={Plus} onClick={handleCreate} disabled={!canCreate} className="min-w-[10rem]">
            Δημιουργία
            {pendingSuffixes.length > 1 ? ` (${pendingSuffixes.length})` : ''}
          </DetailsButton>
        </div>

        {showAdvanced && (
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Πλήρες Suffix (πληκτρολόγηση)
            </label>
            <input
              type="text"
              placeholder="π.χ. P, X, BSU, ή κενό για Λουστρέ"
              value={advancedSuffix}
              onChange={(e) => setAdvancedSuffix(e.target.value.toUpperCase())}
              className={`${detailsMonoInputClass} uppercase`}
            />
          </div>
        )}
      </div>
    </section>
  );
}
