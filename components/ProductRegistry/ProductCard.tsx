import React, { useMemo, useState } from 'react';
import { BookOpen, ChevronLeft, ChevronRight, Factory, Globe, ImageIcon, Layers, Tag, TrendingUp, Weight } from 'lucide-react';
import { GlobalSettings, Material, Product, ProductVariant, ProductionType } from '../../types';
import { calculateProductCost, estimateVariantCost, formatCurrency } from '../../utils/pricingEngine';
import { resolveInvoiceTotalWeight } from '../../utils/invoiceTotalWeight';
import SkuColorizedText from '../SkuColorizedText';
import {
    PRODUCTION_TYPE_LABELS,
    SKIP_CASTING_LABEL,
    buildProductCardWeightPresentation,
    formatRegistryWeight,
    shouldShowCardInvoiceTotal,
    type ProductCardWeightPresentation,
} from '../../features/products/productCardPresentation';

interface Props {
    product: Product;
    settings: GlobalSettings;
    materials: Material[];
    allProducts: Product[];
    productsMap?: Map<string, Product>;
    materialsMap?: Map<string, Material>;
    onSelectProduct: (product: Product) => void;
    isSelected: boolean;
}

const imageBadgeClass = 'inline-flex h-7 min-w-7 items-center justify-center gap-1 rounded-full border border-white/15 bg-[#060b00]/80 px-2 text-[10px] font-bold text-white shadow-sm backdrop-blur-md';

const MetalWeightFigures: React.FC<{
    weightView: ProductCardWeightPresentation;
    muted?: boolean;
}> = ({ weightView, muted }) => {
    const figuresClass = `flex min-w-0 flex-wrap items-baseline justify-end gap-x-1 font-mono font-bold tabular-nums ${muted ? 'text-slate-500' : 'text-slate-600'}`;
    const totalClass = muted ? 'text-slate-600' : 'text-slate-800';

    if (weightView.primaryMode === 'skip_casting') {
        return (
            <div className={figuresClass} title={SKIP_CASTING_LABEL}>
                <span className="font-sans text-[10px] font-black uppercase tracking-wide text-purple-700">{SKIP_CASTING_LABEL}</span>
                {weightView.hasWeightBreakdown && (
                    <>
                        <span className="text-slate-300">·</span>
                        {weightView.stxWeight > 0 && (
                            <span className="text-blue-500" title="Βάρος STX">{formatRegistryWeight(weightView.stxWeight)}g</span>
                        )}
                        <span className={totalClass}>{formatRegistryWeight(weightView.totalWeight)}g</span>
                    </>
                )}
            </div>
        );
    }

    if (weightView.primaryMode === 'breakdown') {
        return (
            <div className={figuresClass} title="Βασικό + δευτερεύον + βάρος STX">
                <span title="Βασικό βάρος">{formatRegistryWeight(weightView.baseWeight)}</span>
                {weightView.secondaryWeight > 0 ? (
                    <><span className="text-slate-300">+</span><span title="Δευτερεύον βάρος">{formatRegistryWeight(weightView.secondaryWeight)}</span></>
                ) : null}
                {weightView.stxWeight > 0 ? (
                    <><span className="text-slate-300">+</span><span className="text-blue-500" title="Βάρος STX">{formatRegistryWeight(weightView.stxWeight)}</span></>
                ) : null}
                <span className="text-slate-300">=</span>
                <span className={totalClass}>{formatRegistryWeight(weightView.totalWeight)}g</span>
            </div>
        );
    }

    return (
        <div className={figuresClass} title="Βάρος">
            <span className={totalClass}>{formatRegistryWeight(weightView.baseWeight)}g</span>
        </div>
    );
};

const ProductCard: React.FC<Props> = React.memo(({
    product,
    settings,
    materials,
    allProducts,
    productsMap,
    materialsMap,
    onSelectProduct,
    isSelected,
}) => {
    const [viewIndex, setViewIndex] = useState(0);

    const variants = product.variants || [];
    const hasVariants = variants.length > 0;
    const variantCount = variants.length;

    const sortedVariants = useMemo(() => {
        if (!hasVariants) return [];
        return [...variants].sort((a, b) => {
            const priority = (suffix: string) => {
                if (suffix === '' || !['P', 'D', 'X', 'H'].some(c => suffix.startsWith(c))) return 0;
                if (suffix.startsWith('P')) return 1;
                if (suffix.startsWith('D')) return 2;
                if (suffix.startsWith('X')) return 3;
                if (suffix.startsWith('H')) return 4;
                return 5;
            };
            return priority(a.suffix) - priority(b.suffix);
        });
    }, [hasVariants, variants]);

    let currentVariant: ProductVariant | null = null;
    if (hasVariants) {
        currentVariant = sortedVariants[viewIndex % variantCount];
    }

    const masterCostCalc = useMemo(
        () => calculateProductCost(product, settings, materials, allProducts, 0, new Set(), undefined, productsMap, materialsMap),
        [product, settings, materials, allProducts, productsMap, materialsMap],
    );
    const masterCost = masterCostCalc.total;

    let displayPrice = product.selling_price;
    let displayCost = masterCost;
    let displaySku = product.sku;
    let displayLabel = 'Βασικό';

    if (currentVariant) {
        displaySku = `${product.sku}${currentVariant.suffix}`;
        displayLabel = currentVariant.description || currentVariant.suffix;
        if (currentVariant.selling_price) displayPrice = currentVariant.selling_price;
        const variantEst = estimateVariantCost(product, currentVariant.suffix, settings, materials, allProducts, undefined, productsMap, materialsMap);
        displayCost = variantEst.total;
    }

    const profit = displayPrice - displayCost;
    const margin = displayPrice > 0 ? (profit / displayPrice) * 100 : 0;

    const resolvedProductsMap = useMemo(() => {
        if (productsMap) return productsMap;
        return new Map(allProducts.map((item) => [item.sku, item]));
    }, [allProducts, productsMap]);

    const weightView = useMemo(
        () => buildProductCardWeightPresentation(product, resolvedProductsMap),
        [product, resolvedProductsMap],
    );

    const invoiceTotalWeight = useMemo(
        () => resolveInvoiceTotalWeight(product, allProducts, materials),
        [product, allProducts, materials],
    );
    const showInvoiceTotal = shouldShowCardInvoiceTotal(
        weightView.recipeItemCount,
        weightView.totalWeight,
        invoiceTotalWeight,
    );
    const compactSingleRow = !showInvoiceTotal && !weightView.hasWeightBreakdown;
    const invoiceMissing = invoiceTotalWeight.source === 'missing';

    const originLabel = PRODUCTION_TYPE_LABELS[product.production_type];
    const OriginIcon = product.production_type === ProductionType.Imported ? Globe : Factory;

    const nextView = (event: React.MouseEvent) => {
        event.stopPropagation();
        if (hasVariants) setViewIndex((prev) => (prev + 1) % variantCount);
    };

    const prevView = (event: React.MouseEvent) => {
        event.stopPropagation();
        if (hasVariants) setViewIndex((prev) => (prev - 1 + variantCount) % variantCount);
    };

    return (
        <div
            onClick={() => onSelectProduct(product)}
            className={`group relative flex h-full cursor-pointer flex-col overflow-hidden rounded-3xl border bg-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl ${isSelected ? 'border-emerald-500 ring-2 ring-emerald-500/20' : 'border-slate-100'}`}
        >
            <div className="relative aspect-square shrink-0 overflow-hidden bg-slate-50">
                {product.image_url ? (
                    <img
                        src={product.image_url}
                        alt={product.sku}
                        loading="lazy"
                        decoding="async"
                        className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
                    />
                ) : (
                    <div className="flex h-full w-full items-center justify-center text-slate-300">
                        <ImageIcon size={40} />
                    </div>
                )}

                {hasVariants && (
                    <span
                        title={variantCount === 1 ? '1 παραλλαγή' : `${variantCount} παραλλαγές`}
                        className={`absolute left-3 top-3 z-10 ${imageBadgeClass}`}
                    >
                        <Layers size={11} className="text-amber-300" />
                        <span>{variantCount}</span>
                    </span>
                )}

                <span
                    title={originLabel}
                    className={`absolute right-3 top-3 z-10 ${imageBadgeClass}`}
                >
                    <OriginIcon size={12} />
                </span>

                <div className="absolute bottom-3 left-3 z-10 max-w-[calc(100%-1.5rem)] truncate rounded-lg border border-slate-100 bg-white/90 px-2 py-1 text-[10px] font-bold text-slate-600 shadow-sm backdrop-blur-md">
                    {product.category}
                </div>
            </div>

            <div className="relative flex min-h-0 flex-1 flex-col p-5">
                <div className="mb-3 flex items-start justify-between">
                    <div className="min-w-0 pr-2">
                        <h3 className="break-all text-[16px] leading-[1.05]">
                            <SkuColorizedText
                                sku={displaySku}
                                gender={product.gender}
                                masterClassName="text-slate-800 transition-colors group-hover:text-emerald-700"
                            />
                        </h3>
                        <div className="mt-1 flex items-center gap-1 truncate text-xs font-bold text-slate-400">
                            {hasVariants && <Tag size={10} />} {displayLabel}
                        </div>
                    </div>

                    {hasVariants && variantCount > 1 && (
                        <div className="flex shrink-0 items-center rounded-lg bg-slate-100 p-0.5" onClick={(event) => event.stopPropagation()}>
                            <button onClick={prevView} className="rounded-md p-1 text-slate-400 transition-all hover:bg-white hover:text-emerald-600 hover:shadow-sm">
                                <ChevronLeft size={16} />
                            </button>
                            <div className="mx-0.5 h-3 w-px bg-slate-200"></div>
                            <button onClick={nextView} className="rounded-md p-1 text-slate-400 transition-all hover:bg-white hover:text-emerald-600 hover:shadow-sm">
                                <ChevronRight size={16} />
                            </button>
                        </div>
                    )}
                </div>

                <div className="mb-4 rounded-xl border border-slate-100 bg-slate-50/70 px-2.5 py-2 text-[10px]">
                    <div className="flex min-w-0 items-center gap-2">
                        <div className="flex shrink-0 items-center gap-1 font-medium text-slate-400">
                            <BookOpen size={10} />
                            <span>{weightView.recipeItemCountLabel}</span>
                        </div>
                        {showInvoiceTotal ? (
                            <div
                                className={`ml-auto min-w-0 truncate text-[10px] font-semibold ${invoiceMissing ? 'text-amber-600' : 'text-slate-500'}`}
                                title="Συνολικό βάρος"
                            >
                                <span className={invoiceMissing ? 'text-amber-600' : 'text-slate-400'}>Σύνολο</span>{' '}
                                <span className={`font-mono font-bold tabular-nums ${invoiceMissing ? 'text-amber-600' : 'text-slate-800'}`}>
                                    {invoiceTotalWeight.value === null ? '—' : `${formatRegistryWeight(invoiceTotalWeight.value)}g`}
                                </span>
                            </div>
                        ) : compactSingleRow ? (
                            <div className="ml-auto min-w-0">
                                <MetalWeightFigures weightView={weightView} />
                            </div>
                        ) : null}
                    </div>
                    {!compactSingleRow && (
                        <div className={`flex min-w-0 items-center gap-2 ${showInvoiceTotal ? 'mt-1.5 border-t border-slate-200/70 pt-1.5' : 'mt-1'}`}>
                            {showInvoiceTotal && (
                                <div className="flex shrink-0 items-center gap-1 font-bold uppercase tracking-wide text-slate-400">
                                    <Weight size={10} />
                                    <span>Βάρος</span>
                                </div>
                            )}
                            <div className="ml-auto min-w-0">
                                <MetalWeightFigures weightView={weightView} muted={showInvoiceTotal} />
                            </div>
                        </div>
                    )}
                </div>

                <div className="mt-auto grid shrink-0 grid-cols-2 items-end gap-4 border-t border-slate-100 pt-3">
                    <div>
                        <div className="mb-0.5 text-[9px] font-bold uppercase text-slate-400">Χονδρική</div>
                        <div className={`text-xl font-black leading-none ${displayPrice > 0 ? 'text-[#060b00]' : 'text-slate-300'}`}>
                            {displayPrice > 0 ? formatCurrency(displayPrice) : '-'}
                        </div>
                    </div>
                    <div className="text-right">
                        <div className="mb-0.5 text-[9px] font-bold uppercase text-slate-400">Περιθώριο</div>
                        <div className={`flex items-center justify-end gap-1 text-sm font-bold ${margin < 30 ? 'text-red-500' : 'text-emerald-600'}`}>
                            {displayPrice > 0 ? (
                                <>
                                    <TrendingUp size={12} />
                                    {margin.toFixed(0)}%
                                </>
                            ) : '-'}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
});

ProductCard.displayName = 'ProductCard';

export default ProductCard;
