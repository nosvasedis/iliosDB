import React, { useState, useMemo } from 'react';
import { Product, Material, MaterialType } from '../../types';
import { Search, Plus, X, Gem, Puzzle } from 'lucide-react';
import { MAT_TYPE_LABELS } from './constants';

interface RecipeItemSelectorModalProps {
    type: 'raw' | 'component';
    productCategory: string;
    allMaterials: Material[];
    allProducts: Product[];
    onClose: () => void;
    onSelect: (item: { type: 'raw', id: string } | { type: 'component', sku: string }) => void;
}

export const RecipeItemSelectorModal: React.FC<RecipeItemSelectorModalProps> = React.memo(({
    type, productCategory, allMaterials, allProducts, onClose, onSelect
}) => {
    const [searchTerm, setSearchTerm] = useState('');

    const suggestionKeywords: Record<string, { types: MaterialType[], names: string[] }> = {
        'Δαχτυλίδι': { types: [MaterialType.Stone], names: ['ζιργκόν'] },
        'Σκουλαρίκια': { types: [MaterialType.Stone], names: ['ζιργκόν', 'πεταλούδα', 'καρφωτάκι'] },
        'Βραχιόλι': { types: [MaterialType.Cord, MaterialType.Leather], names: ['κούμπωμα', 'δέρμα'] },
        'Μενταγιόν': { types: [MaterialType.Leather], names: ['κρίκος', 'κρικάκι', 'κορδόνι'] },
        'Σταυρός': { types: [], names: ['κρίκος', 'κρικάκι'] }
    };

    const { suggestions, others } = useMemo(() => {
        const keywords = Object.entries(suggestionKeywords).find(([catKey]) => productCategory.includes(catKey))?.[1] || { types: [], names: [] };

        let allItems: any[] = [];
        if (type === 'raw') {
            allItems = [...allMaterials];
        } else {
            allItems = allProducts.filter(p => p.is_component);
        }

        const suggestedItems: any[] = [];
        const otherItems: any[] = [];

        allItems.forEach(item => {
            const name = type === 'raw' ? item.name.toLowerCase() : item.sku.toLowerCase();

            const isSuggested = keywords.types.includes(item.type) || keywords.names.some(kw => name.includes(kw));
            if (isSuggested) {
                suggestedItems.push(item);
            } else {
                otherItems.push(item);
            }
        });

        const filterFn = (item: any) => {
            const name = type === 'raw' ? item.name.toLowerCase() : item.sku.toLowerCase();
            const description = (item.description || '').toLowerCase();
            const category = type === 'component' ? (item.category || '').toLowerCase() : '';
            const search = searchTerm.toLowerCase();

            return name.includes(search) || description.includes(search) || category.includes(search);
        };

        return {
            suggestions: suggestedItems.filter(filterFn).sort((a, b) => a.name?.localeCompare(b.name) || a.sku?.localeCompare(b.sku)),
            others: otherItems.filter(filterFn).sort((a, b) => a.name?.localeCompare(b.name) || a.sku?.localeCompare(b.sku))
        };
    }, [type, productCategory, allMaterials, allProducts, searchTerm]);

    const handleSelect = (item: any) => {
        if (type === 'raw') {
            onSelect({ type: 'raw', id: item.id });
        } else {
            onSelect({ type: 'component', sku: item.sku });
        }
    };

    const renderListItem = (item: any) => {
        const isComponent = type === 'component';
        const name = isComponent ? item.sku : item.name;
        const description = item.description;
        const imageUrl = isComponent ? item.image_url : null;
        const cost = isComponent
            ? `${(item.active_price || 0).toFixed(2)}€`
            : `${(item.cost_per_unit || 0).toFixed(2)}€ / ${item.unit}`;

        // Icon fallback
        const icon = isComponent ? <Puzzle size={16} className="text-blue-500" /> : <Gem size={16} className="text-emerald-500" />;

        return (
            <div
                key={item.id || item.sku}
                onClick={() => handleSelect(item)}
                className="flex items-center gap-4 p-3 rounded-xl hover:bg-emerald-50 cursor-pointer transition-colors border border-transparent hover:border-emerald-100 group"
            >
                {/* Image / Icon Container */}
                <div className="w-12 h-12 shrink-0 bg-slate-100 rounded-lg overflow-hidden border border-slate-200 flex items-center justify-center relative">
                    {imageUrl ? (
                        <img src={imageUrl} alt={name} className="w-full h-full object-cover" />
                    ) : (
                        <div className="text-slate-400">{icon}</div>
                    )}
                </div>

                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <div className="font-bold text-slate-800 text-sm truncate">{name}</div>
                        {isComponent && item.category && (
                            <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded border border-slate-200 truncate max-w-[100px]">{item.category}</span>
                        )}
                        {!isComponent && item.stones_per_strand && (
                            <span className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded border border-blue-100 font-bold whitespace-nowrap">
                                {item.stones_per_strand} πέτρες/σειρά
                            </span>
                        )}
                    </div>

                    {description ? (
                        <div className="text-xs text-slate-600 truncate font-medium">{description}</div>
                    ) : (
                        <div className="text-xs text-slate-400 truncate italic">{isComponent ? 'Χωρίς περιγραφή' : (MAT_TYPE_LABELS[item.type] || item.type)}</div>
                    )}

                    <div className="text-[10px] text-slate-400 font-mono mt-0.5">{cost}</div>
                </div>

                <div className="p-2 bg-white rounded-full shadow-sm border border-slate-100 text-slate-300 group-hover:text-emerald-500 group-hover:border-emerald-200 transition-all shrink-0">
                    <Plus size={16} />
                </div>
            </div>
        );
    };

    return (
        <div className="fixed inset-0 z-[150] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl flex flex-col h-[70vh] animate-in zoom-in-95">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                    <h3 className="text-lg font-bold text-slate-800">Επιλογή {type === 'raw' ? 'Υλικού' : 'Εξαρτήματος'}</h3>
                    <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-colors"><X size={20} /></button>
                </div>
                <div className="p-4 border-b border-slate-100">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                        <input
                            type="text"
                            placeholder={type === 'component' ? "Αναζήτηση SKU ή Περιγραφής..." : "Αναζήτηση..."}
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            autoFocus
                            className="w-full pl-10 p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500/20"
                        />
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                    {suggestions.length > 0 && (
                        <div className="mb-6">
                            <h4 className="text-xs font-bold text-amber-600 uppercase tracking-wide mb-2 ml-2">Προτεινόμενα</h4>
                            <div className="space-y-1">
                                {suggestions.map(renderListItem)}
                            </div>
                        </div>
                    )}
                    {(suggestions.length > 0 || searchTerm) && (
                        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2 ml-2">Όλα</h4>
                    )}
                    <div className="space-y-1">
                        {others.map(renderListItem)}
                    </div>
                    {suggestions.length === 0 && others.length === 0 && (
                        <div className="text-center text-slate-400 py-10">
                            <p>Δεν βρέθηκαν αποτελέσματα.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
});
