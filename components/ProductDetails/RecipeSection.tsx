import React from 'react';
import { Box, Coins, Gem, Plus, Puzzle, Trash2 } from 'lucide-react';
import { GlobalSettings, Material, Product, RecipeItem } from '../../types';
import { formatCurrency, formatDecimal, getVariantComponents } from '../../utils/pricingEngine';
import { getRecipeMaterialSubtitle } from '../../features/products';
import { SmartQuantityInput } from './detailsInputs';
import { DetailsButton, DetailsIconButton, DetailsSection } from './detailsUi';

function getRecipeItemCost(item: RecipeItem, product: Product, allMaterials: Material[], allProducts: Product[], variantSuffix?: string | null) {
    if (item.type === 'raw') {
        const mat = allMaterials.find(m => m.id === item.id);
        if (!mat) return 0;
        let unitCost = mat.cost_per_unit;
        if (variantSuffix) {
            const { stone } = getVariantComponents(variantSuffix, product.gender);
            if (stone.code && mat.variant_prices && mat.variant_prices[stone.code] != null) {
                unitCost = mat.variant_prices[stone.code];
            }
        }
        return unitCost * item.quantity;
    }
    const subProduct = allProducts.find(p => p.sku === item.sku);
    return (subProduct?.active_price || 0) * item.quantity;
}

export default function RecipeSection({
    product,
    setProduct,
    allMaterials,
    allProducts,
    settings,
    silverCost,
    variantSuffix,
    onOpenSelector,
}: {
    product: Product;
    setProduct: React.Dispatch<React.SetStateAction<Product>>;
    allMaterials: Material[];
    allProducts: Product[];
    settings: GlobalSettings;
    silverCost: number;
    variantSuffix?: string | null;
    onOpenSelector: (type: 'raw' | 'component') => void;
}) {
    const totalWeightForSilver = product.weight_g + (product.secondary_weight_g || 0);
    const components = allProducts.filter(p => p.is_component);
    const itemCosts = product.recipe.map(item => getRecipeItemCost(item, product, allMaterials, allProducts, variantSuffix));
    const recipeTotal = itemCosts.reduce((sum, c) => sum + c, 0);

    const updateItem = (index: number, patch: Partial<{ quantity: number; id: string; sku: string }>) => {
        setProduct(prev => ({
            ...prev,
            recipe: prev.recipe.map((item, i) => {
                if (i !== index) return item;
                if (patch.quantity !== undefined) return { ...item, quantity: patch.quantity || 0 };
                if (patch.id !== undefined && item.type === 'raw') return { ...item, id: patch.id };
                if (patch.sku !== undefined && item.type === 'component') return { ...item, sku: patch.sku };
                return item;
            }),
        }));
    };
    const removeItem = (index: number) => {
        setProduct(prev => ({ ...prev, recipe: prev.recipe.filter((_, i) => i !== index) }));
    };

    return (
        <DetailsSection
            tone="recipe"
            icon={Box}
            title="Συνταγή"
            subtitle={variantSuffix ? `Τιμές υλικών για την παραλλαγή ${variantSuffix}` : 'Υλικά & εξαρτήματα ανά τεμάχιο'}
            actions={(
                <div className="flex gap-1.5">
                    <DetailsButton icon={Plus} onClick={() => onOpenSelector('raw')}>Υλικό</DetailsButton>
                    <DetailsButton icon={Plus} onClick={() => onOpenSelector('component')}>Εξάρτημα</DetailsButton>
                </div>
            )}
        >
            <div className="overflow-hidden rounded-xl border border-slate-200">
                <div className="grid grid-cols-[2.5rem_1fr_auto_6rem_2.25rem] items-center gap-3 bg-slate-50 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    <span />
                    <span>Είδος</span>
                    <span className="text-center">Ποσότητα</span>
                    <span className="text-right">Κόστος</span>
                    <span />
                </div>

                <div className="divide-y divide-slate-100">
                    <div className="grid grid-cols-[2.5rem_1fr_auto_6rem_2.25rem] items-center gap-3 bg-slate-50/40 px-3 py-2.5">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500"><Coins size={16} /></div>
                        <div className="min-w-0">
                            <div className="text-sm font-bold text-slate-800">Ασήμι 925 (Βάση)</div>
                            <div className="truncate font-mono text-xs text-slate-400">
                                {totalWeightForSilver > product.weight_g
                                    ? `${formatDecimal(product.weight_g)}g + ${formatDecimal(product.secondary_weight_g || 0)}g`
                                    : 'Κύριο βάρος'} @ {formatDecimal(settings.silver_price_gram, 3)}€/g
                            </div>
                        </div>
                        <div className="text-center font-mono text-sm font-bold text-slate-700">{formatDecimal(totalWeightForSilver)} g</div>
                        <div className="text-right font-mono text-sm font-bold text-slate-800">{formatCurrency(silverCost)}</div>
                        <span />
                    </div>

                    {product.recipe.map((item, idx) => {
                        const isRaw = item.type === 'raw';
                        const material = isRaw ? allMaterials.find(m => m.id === item.id) : undefined;
                        const component = !isRaw ? allProducts.find(p => p.sku === item.sku) : undefined;
                        const subtitle = isRaw ? getRecipeMaterialSubtitle(material) : component?.description;

                        return (
                            <div key={idx} className="group grid grid-cols-[2.5rem_1fr_auto_6rem_2.25rem] items-center gap-3 px-3 py-2.5 transition-colors hover:bg-slate-50/70">
                                <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-lg border border-slate-100 bg-slate-50">
                                    {isRaw ? (
                                        <Gem size={16} className="text-emerald-500" />
                                    ) : component?.image_url ? (
                                        <img src={component.image_url} alt={item.type === 'component' ? item.sku : ''} className="h-full w-full object-cover" />
                                    ) : (
                                        <Puzzle size={16} className="text-blue-500" />
                                    )}
                                </div>
                                <div className="min-w-0">
                                    {item.type === 'raw' ? (
                                        <select className="w-full bg-transparent text-sm font-bold text-slate-800 outline-none" value={item.id} onChange={(e) => updateItem(idx, { id: e.target.value })}>
                                            {allMaterials.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                                        </select>
                                    ) : (
                                        <select className="w-full bg-transparent text-sm font-bold text-slate-800 outline-none" value={item.sku} onChange={(e) => updateItem(idx, { sku: e.target.value })}>
                                            {components.map(p => <option key={p.sku} value={p.sku}>{p.sku} - {p.category}</option>)}
                                        </select>
                                    )}
                                    {subtitle ? <div className="mt-0.5 truncate text-xs font-medium text-slate-500">{subtitle}</div> : null}
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <SmartQuantityInput
                                        value={item.quantity}
                                        onChange={(val) => updateItem(idx, { quantity: val })}
                                        stonesPerStrand={material?.stones_per_strand}
                                    />
                                    <span className="w-8 text-xs font-bold text-slate-400">{isRaw ? material?.unit : 'τεμ'}</span>
                                </div>
                                <div className="text-right font-mono text-sm font-bold text-slate-700">{formatCurrency(itemCosts[idx])}</div>
                                <DetailsIconButton icon={Trash2} label="Αφαίρεση από τη συνταγή" variant="danger" onClick={() => removeItem(idx)} />
                            </div>
                        );
                    })}

                    {product.recipe.length === 0 && (
                        <div className="px-3 py-4 text-center text-xs italic text-slate-400">Χωρίς επιπλέον υλικά ή εξαρτήματα.</div>
                    )}
                </div>

                <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-3 py-2.5 text-sm">
                    <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Σύνολο υλικών (με ασήμι)</span>
                    <span className="font-mono font-black text-slate-900">{formatCurrency(silverCost + recipeTotal)}</span>
                </div>
            </div>
        </DetailsSection>
    );
}
