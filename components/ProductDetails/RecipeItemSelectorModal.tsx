import React, { useMemo, useState } from 'react';
import { Gem, Plus, Puzzle, Search, X } from 'lucide-react';
import { Material, MaterialType, Product } from '../../types';
import { formatDecimal } from '../../utils/pricingEngine';
import { getMaterialTypeLabel } from '../../features/products';

export type RecipeSelection = { type: 'raw', id: string } | { type: 'component', sku: string };

const SUGGESTION_KEYWORDS: Record<string, { types: MaterialType[], names: string[] }> = {
    'Δαχτυλίδι': { types: [MaterialType.Stone], names: ['ζιργκόν'] },
    'Σκουλαρίκια': { types: [MaterialType.Stone], names: ['ζιργκόν', 'πεταλούδα', 'καρφωτάκι'] },
    'Βραχιόλι': { types: [MaterialType.Cord, MaterialType.Leather], names: ['κούμπωμα', 'δέρμα'] },
    'Μενταγιόν': { types: [MaterialType.Leather], names: ['κρίκος', 'κρικάκι', 'κορδόνι'] },
    'Σταυρός': { types: [], names: ['κρίκος', 'κρικάκι'] }
};

const RecipeItemSelectorModal = React.memo(({
    type, productCategory, allMaterials, allProducts, onClose, onSelect
}: {
    type: 'raw' | 'component',
    productCategory: string,
    allMaterials: Material[],
    allProducts: Product[],
    onClose: () => void,
    onSelect: (item: RecipeSelection) => void
}) => {
    const [searchTerm, setSearchTerm] = useState('');

    const { suggestions, others } = useMemo(() => {
        const keywords = Object.entries(SUGGESTION_KEYWORDS).find(([catKey]) => productCategory.includes(catKey))?.[1] || { types: [], names: [] };
        const allItems: any[] = type === 'raw' ? [...allMaterials] : allProducts.filter(p => p.is_component);

        const suggestedItems: any[] = [];
        const otherItems: any[] = [];
        allItems.forEach(item => {
            const name = type === 'raw' ? item.name.toLowerCase() : item.sku.toLowerCase();
            const isSuggested = keywords.types.includes(item.type) || keywords.names.some(kw => name.includes(kw));
            (isSuggested ? suggestedItems : otherItems).push(item);
        });

        const filterFn = (item: any) => {
            const name = type === 'raw' ? item.name.toLowerCase() : item.sku.toLowerCase();
            const description = (item.description || '').toLowerCase();
            const search = searchTerm.toLowerCase();
            return name.includes(search) || description.includes(search);
        };
        const sortFn = (a: any, b: any) => a.name?.localeCompare(b.name) || a.sku?.localeCompare(b.sku);

        return {
            suggestions: suggestedItems.filter(filterFn).sort(sortFn),
            others: otherItems.filter(filterFn).sort(sortFn)
        };
    }, [type, productCategory, allMaterials, allProducts, searchTerm]);

    const handleSelect = (item: any) => {
        onSelect(type === 'raw' ? { type: 'raw', id: item.id } : { type: 'component', sku: item.sku });
    };

    const renderListItem = (item: any) => {
        const isComponent = type === 'component';
        const name = isComponent ? item.sku : item.name;
        const description = item.description;
        const imageUrl = isComponent ? item.image_url : null;
        const cost = isComponent
            ? `${formatDecimal((item.active_price || 0), 2)}€`
            : `${formatDecimal(item.cost_per_unit, 2)}€ / ${item.unit}`;
        const icon = isComponent ? <Puzzle size={16} className="text-blue-500" /> : <Gem size={16} className="text-emerald-500" />;

        return (
            <div
                key={item.id || item.sku}
                onClick={() => handleSelect(item)}
                className="group flex cursor-pointer items-center gap-4 rounded-xl border border-transparent p-3 transition-colors hover:border-emerald-100 hover:bg-emerald-50"
            >
                <div className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
                    {imageUrl ? <img src={imageUrl} alt={name} className="h-full w-full object-cover" /> : <div className="text-slate-400">{icon}</div>}
                </div>
                <div className="min-w-0 flex-1">
                    <div className="flex shrink-0 items-center gap-2 self-start">
                        <div className="truncate text-sm font-bold text-slate-800">{name}</div>
                        {isComponent && item.category && (
                            <span className="max-w-[100px] truncate rounded border border-slate-200 bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">{item.category}</span>
                        )}
                        {!isComponent && item.stones_per_strand && (
                            <span className="whitespace-nowrap rounded border border-blue-100 bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-blue-600">
                                {item.stones_per_strand} πέτρες/σειρά
                            </span>
                        )}
                    </div>
                    {description ? (
                        <div className="truncate text-xs font-medium text-slate-600">{description}</div>
                    ) : (
                        <div className="truncate text-xs italic text-slate-400">{isComponent ? 'Χωρίς περιγραφή' : getMaterialTypeLabel(item.type)}</div>
                    )}
                    <div className="mt-0.5 font-mono text-[10px] text-slate-400">{cost}</div>
                </div>
                <div className="shrink-0 rounded-full border border-slate-100 bg-white p-2 text-slate-300 shadow-sm transition-all group-hover:border-emerald-200 group-hover:text-emerald-500">
                    <Plus size={16} />
                </div>
            </div>
        );
    };

    return (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
            <div className="flex h-[70vh] w-full max-w-lg flex-col rounded-3xl bg-white shadow-2xl animate-in zoom-in-95">
                <div className="flex items-center justify-between border-b border-slate-100 p-6">
                    <h3 className="text-lg font-bold text-slate-800">Επιλογή {type === 'raw' ? 'Υλικού' : 'Εξαρτήματος'}</h3>
                    <button type="button" onClick={onClose} className="rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"><X size={20} /></button>
                </div>
                <div className="border-b border-slate-100 p-4">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                        <input
                            type="text"
                            placeholder={type === 'component' ? "Αναζήτηση SKU ή Περιγραφής..." : "Αναζήτηση..."}
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            autoFocus
                            className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 pl-10 outline-none focus:ring-2 focus:ring-emerald-500/20"
                        />
                    </div>
                </div>
                <div className="custom-scrollbar flex-1 overflow-y-auto p-4">
                    {suggestions.length > 0 && (
                        <div className="mb-6">
                            <h4 className="mb-2 ml-2 text-xs font-bold uppercase tracking-wide text-amber-600">Προτεινόμενα</h4>
                            <div className="space-y-1">{suggestions.map(renderListItem)}</div>
                        </div>
                    )}
                    {(suggestions.length > 0 || searchTerm) && (
                        <h4 className="mb-2 ml-2 text-xs font-bold uppercase tracking-wide text-slate-400">Όλα</h4>
                    )}
                    <div className="space-y-1">{others.map(renderListItem)}</div>
                    {suggestions.length === 0 && others.length === 0 && (
                        <div className="py-10 text-center text-slate-400"><p>Δεν βρέθηκαν αποτελέσματα.</p></div>
                    )}
                </div>
            </div>
        </div>
    );
});

export default RecipeItemSelectorModal;
