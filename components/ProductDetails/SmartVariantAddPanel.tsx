import { formatNumber } from '../../utils/numberFormat';
import React, { useCallback, useMemo } from 'react';
import { Wand2 } from 'lucide-react';
import { Product, ProductVariant } from '../../types';
import { analyzeSuffix, estimateVariantCost } from '../../utils/pricingEngine';
import {
  buildVariantSuffixFromFinishAndStone,
  createVariantsFromSmartAdd,
  getSmartAddVariantSellingPrice,
  sortFinishCodes,
} from '../../features/products/variantSmartAdd';
import SmartVariantBuilder, { SmartVariantPlanEntry } from '../variants/SmartVariantBuilder';

interface Props {
  product: Product;
  settings: any;
  allMaterials: any[];
  allProducts: Product[];
  existingVariants: ProductVariant[];
  onAddVariants: (variants: ProductVariant[]) => void;
  showToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

export default function SmartVariantAddPanel({
  product,
  settings,
  allMaterials,
  allProducts,
  existingVariants,
  onAddVariants,
  showToast,
}: Props) {
  const existingSuffixSet = useMemo(
    () => new Set((existingVariants || []).map((variant) => variant.suffix)),
    [existingVariants],
  );

  const plan = useCallback((finishCodes: string[], stoneCodes: string[]): SmartVariantPlanEntry[] => {
    const stones = stoneCodes.length > 0 ? stoneCodes : [''];
    const seen = new Set<string>();
    const entries: SmartVariantPlanEntry[] = [];
    stones.forEach((stoneCode) => {
      sortFinishCodes(finishCodes).forEach((finishCode) => {
        const suffix = buildVariantSuffixFromFinishAndStone(finishCode, stoneCode);
        if (seen.has(suffix)) return;
        seen.add(suffix);
        entries.push({ suffix, finishCode, stoneCode, status: existingSuffixSet.has(suffix) ? 'exists' : 'new' });
      });
    });
    return entries;
  }, [existingSuffixSet]);

  const estimateCost = useCallback(
    (suffix: string) => estimateVariantCost(product, suffix, settings, allMaterials, allProducts).total,
    [product, settings, allMaterials, allProducts],
  );

  const handleCreate = (finishCodes: string[], stoneCodes: string[]) => {
    if (finishCodes.length === 0) {
      showToast('Επιλέξτε τουλάχιστον ένα φινίρισμα.', 'error');
      return 0;
    }

    const existing = [...existingSuffixSet];
    const created: ProductVariant[] = [];
    (stoneCodes.length > 0 ? stoneCodes : ['']).forEach((stoneSuffix) => {
      const result = createVariantsFromSmartAdd({
        product,
        selectedFinishes: finishCodes,
        stoneSuffix,
        settings,
        allMaterials,
        allProducts,
        existingSuffixes: existing,
      });
      result.variants.forEach((variant) => {
        created.push(variant);
        existing.push(variant.suffix);
      });
    });

    if (created.length > 0) {
      onAddVariants(created);
      showToast(
        created.length === 1 ? 'Προστέθηκε 1 παραλλαγή' : `Προστέθηκαν ${formatNumber(created.length)} παραλλαγές`,
        'success',
      );
    } else {
      showToast('Δεν προστέθηκαν νέες παραλλαγές (ίσως υπάρχουν ήδη).', 'info');
    }
    return created.length;
  };

  const handleManualAdd = (rawSuffix: string, description: string) => {
    if (existingSuffixSet.has(rawSuffix)) {
      showToast('Αυτή η παραλλαγή υπάρχει ήδη.', 'info');
      return false;
    }
    onAddVariants([
      {
        suffix: rawSuffix,
        description: description || analyzeSuffix(rawSuffix, product.gender, product.plating_type) || rawSuffix || 'Λουστρέ',
        stock_qty: 0,
        active_price: estimateCost(rawSuffix),
        selling_price: getSmartAddVariantSellingPrice(product, rawSuffix, settings, allMaterials, allProducts),
        selling_price_manual_override: false,
      },
    ]);
    showToast(`Παραλλαγή ${rawSuffix || 'Λουστρέ'} προστέθηκε!`, 'success');
    return true;
  };

  return (
    <section data-tone="molds" className="sku-section rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
      <div className="sku-section-heading mb-5 flex items-center gap-2.5 border-b border-slate-100 pb-3">
        <span className="shrink-0 rounded-lg bg-amber-50 p-1.5 ring-1 ring-amber-100">
          <Wand2 size={15} className="text-amber-700" />
        </span>
        <div className="min-w-0">
          <h4 className="text-[13px] font-bold uppercase tracking-wide">Έξυπνη προσθήκη</h4>
          <p className="truncate text-[11px] font-medium normal-case text-slate-500">Κάντε κλικ για επιλογή — πολλαπλές πέτρες μαζί, μόνο οι συνδυασμοί που λείπουν</p>
        </div>
      </div>

      <SmartVariantBuilder
        masterSku={product.sku}
        gender={product.gender}
        plan={plan}
        onCreate={handleCreate}
        onManualAdd={handleManualAdd}
        estimateCost={estimateCost}
        draft={{ label: 'Νέα παραλλαγή SKU', identity: product.sku }}
      />
    </section>
  );
}
