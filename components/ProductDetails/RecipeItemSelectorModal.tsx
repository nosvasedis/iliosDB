import { ComponentFamilyBadge, ComponentFamilyFilter } from '../catalog/ProductClassificationFilters';
import { componentFamilyLabel, getComponentFamily } from '../../features/resources/componentFamilies';
import React, { useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Check, Gem, Package, Plus, Puzzle, Search, X } from 'lucide-react';
import { Material, MaterialType, Product } from '../../types';
import { formatDecimal } from '../../utils/pricingEngine';
import { getMaterialTypeLabel, getRecipeMaterialSubtitle } from '../../features/products';
import { getStoneFamily, stoneFamilyLabel } from '../../features/resources/stoneFamilies';
import { normalizeGreekForSearch } from '../../utils/greekSearch';
import { StoneFamilyBadge } from '../resources/StoneFamily';

export type RecipeSelection = { type: 'raw', id: string } | { type: 'component', sku: string };
type PickerItem = Material | Product;

const SUGGESTION_KEYWORDS: Record<string, { types: MaterialType[], names: string[] }> = {
    'Δαχτυλίδι': { types: [MaterialType.Stone], names: ['ζιργκόν'] },
    'Σκουλαρίκια': { types: [MaterialType.Stone], names: ['ζιργκόν', 'πεταλούδα', 'καρφωτάκι'] },
    'Βραχιόλι': { types: [MaterialType.Cord, MaterialType.Leather], names: ['κούμπωμα', 'δέρμα'] },
    'Μενταγιόν': { types: [MaterialType.Leather], names: ['κρίκος', 'κρικάκι', 'κορδόνι'] },
    'Σταυρός': { types: [], names: ['κρίκος', 'κρικάκι'] }
};

const RecipeItemSelectorModal = React.memo(({
    type, productCategory, allMaterials, allProducts, currentMaterialId, stoneCode, onClose, onSelect
}: {
    type: 'raw' | 'component',
    productCategory: string,
    allMaterials: Material[],
    allProducts: Product[],
    currentMaterialId?: string,
    stoneCode?: string | null,
    onClose: () => void,
    onSelect: (item: RecipeSelection) => void
}) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [componentFamily, setComponentFamily] = useState('all');
    const dialogRef = useRef<HTMLDialogElement>(null);
    const searchRef = useRef<HTMLInputElement>(null);
    const titleId = useId();
    const isReplacing = currentMaterialId !== undefined;
    const currentMaterial = isReplacing ? allMaterials.find(item => item.id === currentMaterialId) : undefined;
    const title = isReplacing ? 'Αλλαγή υλικού' : type === 'raw' ? 'Επιλογή υλικού' : 'Επιλογή εξαρτήματος';

    useLayoutEffect(() => {
        const dialog = dialogRef.current;
        if (!dialog) return;
        dialog.showModal();
        searchRef.current?.focus();
        return () => dialog.close();
    }, []);

    const { suggestions, others } = useMemo(() => {
        const keywords = Object.entries(SUGGESTION_KEYWORDS).find(([catKey]) => productCategory.includes(catKey))?.[1] || { types: [], names: [] };
        const allItems: PickerItem[] = type === 'raw' ? allMaterials : allProducts.filter(p => p.is_component);
        const tokens = normalizeGreekForSearch(searchTerm.trim()).split(/\s+/).filter(Boolean);
        const suggestions: PickerItem[] = [];
        const others: PickerItem[] = [];
        const nameOf = (item: PickerItem) => 'sku' in item ? item.sku : item.name;

        for (const item of allItems) {
            const name = nameOf(item);
            const family = 'sku' in item ? getComponentFamily(item) : null;
            if (componentFamily !== 'all' && family !== componentFamily) continue;

            const classification = 'sku' in item
                ? componentFamilyLabel(family)
                : `${getMaterialTypeLabel(item.type)} ${stoneFamilyLabel(getStoneFamily(item))}`;
            const searchText = normalizeGreekForSearch(`${name} ${item.description || ''} ${classification}`);
            if (!tokens.every(token => searchText.includes(token))) continue;

            const isSuggested = ('type' in item && keywords.types.includes(item.type)) || keywords.names.some(keyword => name.toLowerCase().includes(keyword));
            (isSuggested ? suggestions : others).push(item);
        }

        const sortByName = (a: PickerItem, b: PickerItem) => nameOf(a).localeCompare(nameOf(b), 'el');
        return { suggestions: suggestions.sort(sortByName), others: others.sort(sortByName) };
    }, [type, productCategory, allMaterials, allProducts, searchTerm, componentFamily]);

    const renderListItem = (item: PickerItem) => {
        const isComponent = 'sku' in item;
        const name = isComponent ? item.sku : item.name;
        const description = isComponent ? item.description : getRecipeMaterialSubtitle(item);
        const imageUrl = isComponent ? item.image_url : null;
        const isCurrent = !isComponent && item.id === currentMaterialId;
        const materialCost = isComponent ? 0 : (stoneCode ? item.variant_prices?.[stoneCode] : undefined) ?? item.cost_per_unit;
        const cost = isComponent
            ? `${formatDecimal((item.active_price || 0), 2)}€`
            : `${formatDecimal(materialCost, 2)}€ / ${item.unit}`;
        const ItemIcon = isComponent ? Puzzle : getStoneFamily(item) ? Gem : Package;
        const ActionIcon = isCurrent ? Check : isReplacing ? ArrowRight : Plus;

        return (
            <button
                key={isComponent ? item.sku : item.id}
                type="button"
                aria-current={isCurrent || undefined}
                onClick={() => onSelect(isComponent ? { type: 'component', sku: item.sku } : { type: 'raw', id: item.id })}
                className={`group flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-emerald-600 sm:gap-4 ${isCurrent ? 'border-emerald-200 bg-emerald-50' : 'border-slate-100 bg-white hover:border-emerald-200 hover:bg-emerald-50/60'}`}
            >
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border sm:h-12 sm:w-12 ${isComponent ? 'border-blue-100 bg-blue-50 text-blue-600' : 'border-emerald-100 bg-emerald-50 text-emerald-700'}`}>
                    {imageUrl ? <img src={imageUrl} alt="" loading="lazy" className="h-full w-full object-cover" /> : <ItemIcon size={18} />}
                </span>
                <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold wrap-break-word text-slate-900">{name}</span>
                    <span className="block text-xs wrap-break-word text-slate-600">{description || 'Χωρίς περιγραφή'}</span>
                    <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        {!isComponent && <StoneFamilyBadge material={item} />}
                        {isComponent && <ComponentFamilyBadge product={item} />}
                        {isComponent && item.category && (
                            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600">{item.category}</span>
                        )}
                        {!isComponent && item.stones_per_strand && (
                            <span className="whitespace-nowrap rounded-sm border border-blue-100 bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-blue-600">
                                {item.stones_per_strand} πέτρες/σειρά
                            </span>
                        )}
                    </span>
                    <span className="mt-1 block font-mono text-xs font-semibold text-slate-600">{cost}</span>
                </span>
                <span className={`flex shrink-0 items-center gap-1.5 rounded-full border bg-white p-2 ${isCurrent ? 'border-emerald-200 text-emerald-700' : 'border-slate-200 text-slate-500 group-hover:border-emerald-200 group-hover:text-emerald-700'}`}>
                    {isCurrent && <span className="text-[10px] font-bold">Τρέχον</span>}
                    <ActionIcon size={15} />
                </span>
            </button>
        );
    };

    return (
        <dialog
            ref={dialogRef}
            aria-labelledby={titleId}
            className="fixed inset-0 m-auto h-[82dvh] max-h-176 w-[calc(100%-1.5rem)] max-w-xl overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 shadow-2xl backdrop:bg-slate-950/50 backdrop:backdrop-blur-xs sm:rounded-3xl"
            onCancel={event => { event.preventDefault(); onClose(); }}
            onClick={event => { if (event.target === event.currentTarget) onClose(); }}
        >
            <div className="flex h-full min-h-0 flex-col">
                <div className="flex shrink-0 items-start gap-3 border-b border-slate-100 p-4 sm:p-5">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
                        {type === 'raw' ? <Gem size={20} /> : <Puzzle size={20} />}
                    </span>
                    <div className="min-w-0 flex-1">
                        <h3 id={titleId} className="text-lg font-bold text-slate-900">{title}</h3>
                        {isReplacing && (
                            <p className="truncate text-xs text-slate-600" title={currentMaterial?.name ?? currentMaterialId}>
                                Τρέχον υλικό <span className="font-bold text-slate-800">{currentMaterial?.name ?? currentMaterialId}</span>
                            </p>
                        )}
                    </div>
                    <button type="button" aria-label="Κλείσιμο επιλογής" onClick={onClose} className="rounded-full p-2 text-slate-500 transition-colors hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-emerald-600"><X size={20} /></button>
                </div>
                <div className="shrink-0 border-b border-slate-100 px-4 py-3 sm:px-5">
                    <div className="relative">
                        <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                        <input
                            ref={searchRef}
                            type="text"
                            aria-label={type === 'raw' ? 'Αναζήτηση υλικών' : 'Αναζήτηση εξαρτημάτων'}
                            placeholder={type === 'raw' ? 'Όνομα, περιγραφή ή ομάδα υλικού…' : 'SKU, περιγραφή ή ομάδα…'}
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-3 text-base text-slate-900 outline-hidden focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 sm:text-sm"
                        />
                    </div>
                    {type === 'component' && <div className="mt-3"><ComponentFamilyFilter value={componentFamily} onChange={setComponentFamily} /></div>}
                </div>
                <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain bg-slate-50/70 p-4 sm:px-5">
                    {suggestions.length > 0 && (
                        <div>
                            <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-emerald-700">Προτεινόμενα</h4>
                            <div className="space-y-2">{suggestions.map(renderListItem)}</div>
                        </div>
                    )}
                    {others.length > 0 && (
                        <div className={suggestions.length > 0 ? 'mt-4' : undefined}>
                            <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-600">{type === 'raw' ? 'Υλικά' : 'Εξαρτήματα'}</h4>
                            <div className="space-y-2">{others.map(renderListItem)}</div>
                        </div>
                    )}
                    {suggestions.length === 0 && others.length === 0 && (
                        <p role="status" className="py-10 text-center text-sm text-slate-600">Δεν βρέθηκαν αποτελέσματα.</p>
                    )}
                </div>
                <div className="flex shrink-0 justify-end border-t border-slate-100 px-4 py-3 sm:px-5">
                    <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-emerald-600">Ακύρωση</button>
                </div>
            </div>
        </dialog>
    );
});

export default RecipeItemSelectorModal;
