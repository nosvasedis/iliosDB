
import React, { useState, useMemo } from 'react';
import { Product, Gender, Collection } from '../types';
import { ScrollText, Filter, CheckSquare, Square, Printer, Search, Layers, User, Users, FolderKanban, Check } from 'lucide-react';
import { PriceListPrintData } from './PriceListPrintView';

interface Props {
    products: Product[];
    collections: Collection[];
    onPrint: (data: PriceListPrintData) => void;
}

const genderOptions = [
    { label: 'Αντρικά', value: Gender.Men, icon: <User size={16}/> },
    { label: 'Γυναικεία', value: Gender.Women, icon: <User size={16}/> },
    { label: 'Unisex', value: Gender.Unisex, icon: <Users size={16}/> }
];

const genderLabels: Record<string, string> = {
    [Gender.Men]: 'Αντρικά',
    [Gender.Women]: 'Γυναικεία',
    [Gender.Unisex]: 'Unisex'
};

export default function PriceListPage({ products, collections, onPrint }: Props) {
    const [selectedGenders, setSelectedGenders] = useState<string[]>([Gender.Women, Gender.Men, Gender.Unisex]);
    const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
    const [selectedCollectionId, setSelectedCollectionId] = useState<number | 'none'>('none');
    const [searchTerm, setSearchTerm] = useState('');

    // Extract all unique categories
    const allCategories = useMemo(() => {
        // Exclude STX/Components from the category list options
        const cats = new Set(products.filter(p => !p.is_component).map(p => p.category).filter(Boolean));
        return Array.from(cats).sort();
    }, [products]);

    // Initialize all categories as selected by default
    React.useEffect(() => {
        if (allCategories.length > 0 && selectedCategories.length === 0) {
            setSelectedCategories(allCategories);
        }
    }, [allCategories]);

    const toggleGender = (g: string) => {
        setSelectedGenders(prev => 
            prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g]
        );
    };

    const toggleCategory = (c: string) => {
        setSelectedCategories(prev => 
            prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c]
        );
    };

    const toggleAllCategories = () => {
        if (selectedCategories.length === allCategories.length) {
            setSelectedCategories([]);
        } else {
            setSelectedCategories(allCategories);
        }
    };

    const filteredItems = useMemo(() => {
        // Map to store aggregated data: SKU -> { category, variantPrices }
        const productMap = new Map<string, { 
            skuBase: string, 
            category: string, 
            variantMap: Record<string, number> 
        }>();
        
        products.forEach(p => {
            if (p.is_component) return; // Skip STX/Components for pricelist usually
            
            // PRIORITY FILTER: Collection
            if (selectedCollectionId !== 'none') {
                if (!p.collections?.includes(selectedCollectionId)) return;
                // If collection is active, we IGNORE gender/category filters to show everything in collection
            } else {
                // STANDARD FILTERS
                // 1. Filter by Gender
                if (!selectedGenders.includes(p.gender)) return;
                // 2. Filter by Category
                if (!selectedCategories.includes(p.category)) return;
            }

            // 3. Search Filter (always active)
            if (searchTerm && !p.sku.includes(searchTerm.toUpperCase())) return;

            const variantMap: Record<string, number> = {};
            let hasValidPrice = false;

            // Collect all variants with prices
            if (p.variants && p.variants.length > 0) {
                p.variants.forEach(v => {
                    const price = v.selling_price || p.selling_price || 0;
                    if (price > 0) {
                        variantMap[v.suffix] = price;
                        hasValidPrice = true;
                    }
                });
            } else {
                // If no variants, check base price
                const price = p.selling_price || 0;
                if (price > 0) {
                    variantMap[''] = price; // Empty suffix for base
                    hasValidPrice = true;
                }
            }

            if (hasValidPrice) {
                productMap.set(p.sku, {
                    skuBase: p.sku,
                    category: p.category,
                    variantMap
                });
            }
        });

        // Convert map to final array structure
        const items = Array.from(productMap.values()).map(item => {
            // Invert variantMap to group by price: { 10: ['P', 'X'], 15: ['D'] }
            const priceToSuffixes: Record<number, string[]> = {};
            
            Object.entries(item.variantMap).forEach(([suffix, price]) => {
                if (!priceToSuffixes[price]) priceToSuffixes[price] = [];
                priceToSuffixes[price].push(suffix);
            });

            // Convert to array of price groups sorted by price
            const priceGroups = Object.entries(priceToSuffixes).map(([priceStr, suffixes]) => ({
                price: parseFloat(priceStr),
                suffixes: suffixes.sort() // Sort suffixes alphabetically
            })).sort((a, b) => a.price - b.price);

            return {
                skuBase: item.skuBase,
                category: item.category,
                priceGroups
            };
        }).sort((a, b) => a.skuBase.localeCompare(b.skuBase, undefined, { numeric: true }));

        return items;
    }, [products, selectedGenders, selectedCategories, searchTerm, selectedCollectionId]);

    const handlePrint = () => {
        const dateStr = new Date().toLocaleDateString('el-GR');
        let title = '';
        let subtitle = `${filteredItems.length} Κωδικοί`;

        if (selectedCollectionId !== 'none') {
            const collectionName = collections.find(c => c.id === selectedCollectionId)?.name || 'Collection';
            title = `${collectionName} - ${dateStr}`;
            subtitle = `Συλλογή • ` + subtitle;
        } else {
            // Standard Logic
            let genderStr = '';
            if (selectedGenders.length !== 3) {
                genderStr = selectedGenders.map(g => genderLabels[g]).join(' & ');
            }

            let catStr = '';
            if (selectedCategories.length === allCategories.length) {
                catStr = 'Πλήρης Κατάλογος';
            } else if (selectedCategories.length <= 4) {
                catStr = selectedCategories.join(', ');
            } else {
                catStr = 'Επιλεγμένα Είδη';
            }

            const suffix = genderStr ? ` (${genderStr})` : '';
            title = `${catStr}${suffix} - ${dateStr}`;
            
            if (selectedCategories.length > 4 && selectedCategories.length < allCategories.length) {
                 subtitle = `Κατηγορίες: ${selectedCategories.length} επιλεγμένες • ` + subtitle;
            }
        }
        
        onPrint({
            title,
            subtitle,
            items: filteredItems,
            date: dateStr
        });
    };

    return (
        <div className="h-[calc(100vh-120px)] flex flex-col gap-8">
            <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100 shrink-0 flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold text-slate-800 tracking-tight flex items-center gap-3">
                        <div className="p-2 bg-indigo-100 text-indigo-700 rounded-xl">
                            <ScrollText size={24} />
                        </div>
                        Τιμοκατάλογος
                    </h1>
                    <p className="text-slate-500 mt-2 ml-14">Δημιουργία και εκτύπωση λίστας τιμών χονδρικής (Συμπτυγμένη).</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 flex-1 min-h-0">
                {/* FILTERS PANEL */}
                <div className="lg:col-span-4 bg-white rounded-3xl shadow-sm border border-slate-100 flex flex-col overflow-hidden h-full">
                    <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-white z-10">
                        <div className="flex items-center gap-2 font-bold text-slate-800 text-lg">
                            <Filter size={20} className="text-indigo-600" /> Φίλτρα
                        </div>
                    </div>

                    <div className={`flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar transition-opacity duration-300 ${selectedCollectionId !== 'none' ? 'opacity-40 pointer-events-none grayscale' : 'opacity-100'}`}>
                        
                        {/* Gender Section */}
                        <div className="space-y-3">
                            <label className="text-xs font-bold text-slate-400 uppercase tracking-wide block">Φύλο</label>
                            <div className="flex gap-2">
                                {genderOptions.map(opt => (
                                    <button
                                        key={opt.value}
                                        onClick={() => toggleGender(opt.value)}
                                        className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-bold border transition-all ${selectedGenders.includes(opt.value) ? 'bg-indigo-50 border-indigo-200 text-indigo-700 shadow-sm' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}
                                    >
                                        {selectedGenders.includes(opt.value) ? <CheckSquare size={16}/> : <Square size={16}/>}
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Category Section */}
                        <div className="space-y-3">
                            <div className="flex justify-between items-center">
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-wide block">Κατηγορίες</label>
                                <button onClick={toggleAllCategories} className="text-[10px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-600 px-3 py-1.5 rounded-lg transition-colors">
                                    {selectedCategories.length === allCategories.length ? 'Αποεπιλογή Όλων' : 'Επιλογή Όλων'}
                                </button>
                            </div>
                            
                            <div className="space-y-1.5">
                                {allCategories.length > 0 ? (
                                    allCategories.map(cat => (
                                        <button
                                            key={cat}
                                            onClick={() => toggleCategory(cat)}
                                            className={`w-full text-left px-4 py-3 rounded-xl text-sm font-medium transition-all flex items-center gap-3 ${selectedCategories.includes(cat) ? 'bg-indigo-50 text-indigo-900 ring-1 ring-indigo-200' : 'text-slate-600 hover:bg-slate-50 border border-transparent'}`}
                                        >
                                            <div className={`w-5 h-5 rounded flex items-center justify-center transition-all shrink-0 ${selectedCategories.includes(cat) ? 'bg-indigo-600 text-white' : 'border-2 border-slate-200 bg-white'}`}>
                                                {selectedCategories.includes(cat) && <Check size={14} strokeWidth={3} />}
                                            </div>
                                            {cat}
                                        </button>
                                    ))
                                ) : (
                                    <div className="text-xs text-slate-400 p-2 italic">Δεν βρέθηκαν κατηγορίες.</div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Footer Actions */}
                    <div className="p-6 border-t border-slate-100 bg-slate-50/50 space-y-5">
                        {/* Search */}
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16}/>
                            <input 
                                type="text" 
                                placeholder="Αναζήτηση κωδικού..." 
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                className="w-full pl-10 p-3 border border-slate-200 rounded-xl bg-white text-sm focus:ring-2 focus:ring-indigo-500/20 outline-none shadow-sm"
                            />
                        </div>

                        {/* Collection Override - Secondary */}
                        <div className="pt-2 border-t border-slate-200/60">
                            <div className="flex items-center gap-2 mb-2 opacity-60 hover:opacity-100 transition-opacity">
                                <FolderKanban size={14} className="text-slate-500"/>
                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Προβολή Συλλογής (Override)</span>
                            </div>
                            <select 
                                value={selectedCollectionId} 
                                onChange={(e) => setSelectedCollectionId(e.target.value === 'none' ? 'none' : Number(e.target.value))}
                                className={`w-full p-2.5 rounded-lg border outline-none font-medium text-xs transition-all cursor-pointer ${selectedCollectionId !== 'none' ? 'bg-indigo-50 border-indigo-300 text-indigo-800 ring-2 ring-indigo-200' : 'bg-white border-slate-200 text-slate-500'}`}
                            >
                                <option value="none">-- Καμία --</option>
                                {collections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                        </div>
                    </div>
                </div>

                {/* PREVIEW PANEL */}
                <div className="lg:col-span-8 bg-white rounded-3xl shadow-sm border border-slate-100 flex flex-col overflow-hidden h-full">
                    <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                        <h2 className="font-bold text-slate-800 flex items-center gap-2 text-lg">
                            <Layers size={20} className="text-indigo-500"/> Προεπισκόπηση
                        </h2>
                        <span className="bg-indigo-100 text-indigo-800 px-4 py-1.5 rounded-full text-xs font-bold">
                            {filteredItems.length} Κωδικοί
                        </span>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto p-8 bg-slate-50/30 custom-scrollbar">
                        {filteredItems.length > 0 ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                                {filteredItems.slice(0, 100).map((item, idx) => (
                                    <div key={idx} className="flex flex-col justify-between bg-white p-4 rounded-xl border border-slate-100 shadow-sm text-sm min-h-[80px] hover:border-indigo-200 transition-colors">
                                        <div className="flex items-center justify-between mb-2 pb-2 border-b border-slate-50">
                                            <span className="font-black text-slate-700 text-base">{item.skuBase}</span>
                                            <span className="text-[10px] text-slate-400 font-medium truncate max-w-[100px]">{item.category}</span>
                                        </div>
                                        <div className="space-y-1.5">
                                            {item.priceGroups.map((pg, pgIdx) => (
                                                <div key={pgIdx} className="flex justify-between items-center text-xs">
                                                    <span className="font-bold text-slate-500 truncate max-w-[120px] flex items-center gap-1">
                                                        {pg.suffixes.includes('') && <span className="w-1.5 h-1.5 bg-slate-300 rounded-full mr-1"></span>}
                                                        {pg.suffixes.filter(s => s !== '').join(' / ')}
                                                    </span>
                                                    <span className="font-mono text-slate-700 font-bold bg-slate-50 px-1.5 py-0.5 rounded">{pg.price.toFixed(2)}€</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                                {filteredItems.length > 100 && (
                                    <div className="col-span-full text-center py-8 text-slate-400 text-sm font-medium bg-slate-50 rounded-xl border border-dashed border-slate-200">
                                        ...και {filteredItems.length - 100} ακόμη κωδικοί
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center text-slate-400">
                                <div className="bg-slate-50 p-6 rounded-full mb-4">
                                    <Search size={48} className="text-slate-300"/>
                                </div>
                                <p className="font-medium text-lg">Δεν βρέθηκαν προϊόντα.</p>
                                <p className="text-sm opacity-70">Δοκιμάστε να αλλάξετε τα φίλτρα.</p>
                            </div>
                        )}
                    </div>

                    <div className="p-6 border-t border-slate-100 bg-white">
                        <button 
                            onClick={handlePrint}
                            disabled={filteredItems.length === 0}
                            className="w-full bg-indigo-600 text-white py-4 rounded-xl font-bold flex items-center justify-center gap-3 hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 disabled:opacity-50 disabled:cursor-not-allowed hover:-translate-y-1 active:translate-y-0"
                        >
                            <Printer size={20}/> Δημιουργία PDF Καταλόγου
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
