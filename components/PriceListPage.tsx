
import React, { useState, useMemo } from 'react';
import { Product, Gender } from '../types';
import { ScrollText, Filter, CheckSquare, Square, Printer, Search, Layers, User, Users } from 'lucide-react';
import { PriceListPrintData } from './PriceListPrintView';

interface Props {
    products: Product[];
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

export default function PriceListPage({ products, onPrint }: Props) {
    const [selectedGenders, setSelectedGenders] = useState<string[]>([Gender.Women, Gender.Men, Gender.Unisex]);
    const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
    const [searchTerm, setSearchTerm] = useState('');

    // Extract all unique categories
    const allCategories = useMemo(() => {
        const cats = new Set(products.map(p => p.category).filter(Boolean));
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
            
            // 1. Filter by Gender
            if (!selectedGenders.includes(p.gender)) return;
            
            // 2. Filter by Category
            if (!selectedCategories.includes(p.category)) return;

            // 3. Search Filter
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
        });

        return items.sort((a, b) => a.skuBase.localeCompare(b.skuBase, undefined, { numeric: true }));
    }, [products, selectedGenders, selectedCategories, searchTerm]);

    const handlePrint = () => {
        // 1. Generate Localized Gender String
        const genderStr = selectedGenders.length === 3 
            ? 'Πλήρης Κατάλογος' 
            : selectedGenders.map(g => genderLabels[g]).join(' & ');

        // 2. Generate Category String
        let catStr = '';
        if (selectedCategories.length === allCategories.length) {
            catStr = ''; // Implied in "Full Catalog" or appended if specific genders
        } else if (selectedCategories.length <= 3) {
            catStr = selectedCategories.join(', ');
        } else {
            catStr = 'Επιλεγμένα Είδη';
        }

        // 3. Construct Precise Title
        let title = '';
        if (selectedGenders.length === 3 && selectedCategories.length === allCategories.length) {
            title = 'Γενικός Τιμοκατάλογος Χονδρικής';
        } else {
            title = `Τιμοκατάλογος: ${genderStr}`;
            if (catStr) title += ` - ${catStr}`;
        }

        // 4. Subtitle Details
        const localizedGenders = selectedGenders.map(g => genderLabels[g]).join(', ');
        let filtersDesc = `Φύλο: ${localizedGenders}`;
        
        if (selectedCategories.length > 1 && selectedCategories.length < allCategories.length) {
             filtersDesc = `Κατηγορίες: ${selectedCategories.length} επιλεγμένες • ` + filtersDesc;
        } else if (selectedCategories.length === allCategories.length) {
             filtersDesc = `Κατηγορίες: Όλες • ` + filtersDesc;
        }
        
        onPrint({
            title,
            subtitle: filtersDesc,
            items: filteredItems,
            date: new Date().toLocaleDateString('el-GR')
        });
    };

    return (
        <div className="h-[calc(100vh-120px)] flex flex-col gap-6">
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 shrink-0">
                <h1 className="text-3xl font-bold text-slate-800 tracking-tight flex items-center gap-3">
                    <div className="p-2 bg-indigo-100 text-indigo-700 rounded-xl">
                        <ScrollText size={24} />
                    </div>
                    Τιμοκατάλογος
                </h1>
                <p className="text-slate-500 mt-2 ml-14">Δημιουργία και εκτύπωση λίστας τιμών χονδρικής (Συμπτυγμένη).</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-0">
                {/* FILTERS PANEL */}
                <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6 flex flex-col gap-6 overflow-hidden">
                    <div className="flex items-center gap-2 font-bold text-slate-700 border-b border-slate-100 pb-2">
                        <Filter size={18} /> Φίλτρα Εκτύπωσης
                    </div>

                    <div className="space-y-3">
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wide">Φύλο</label>
                        <div className="flex flex-wrap gap-2">
                            {genderOptions.map(opt => (
                                <button
                                    key={opt.value}
                                    onClick={() => toggleGender(opt.value)}
                                    className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-bold border transition-all ${selectedGenders.includes(opt.value) ? 'bg-indigo-50 border-indigo-200 text-indigo-700 shadow-sm' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}
                                >
                                    {selectedGenders.includes(opt.value) ? <CheckSquare size={16}/> : <Square size={16}/>}
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="space-y-3 flex-1 flex flex-col min-h-0">
                        <div className="flex justify-between items-center">
                            <label className="text-xs font-bold text-slate-400 uppercase tracking-wide">Κατηγορίες</label>
                            <button onClick={toggleAllCategories} className="text-xs font-bold text-indigo-600 hover:text-indigo-800">
                                {selectedCategories.length === allCategories.length ? 'Αποεπιλογή Όλων' : 'Επιλογή Όλων'}
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar border border-slate-100 rounded-xl p-2">
                            {allCategories.map(cat => (
                                <button
                                    key={cat}
                                    onClick={() => toggleCategory(cat)}
                                    className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 mb-1 ${selectedCategories.includes(cat) ? 'bg-indigo-50 text-indigo-800' : 'text-slate-600 hover:bg-slate-50'}`}
                                >
                                    <div className={`w-4 h-4 rounded border flex items-center justify-center ${selectedCategories.includes(cat) ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300'}`}>
                                        {selectedCategories.includes(cat) && <div className="w-2 h-2 bg-white rounded-sm" />}
                                    </div>
                                    {cat}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="space-y-3 pt-4 border-t border-slate-100">
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wide">Ειδική Αναζήτηση</label>
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16}/>
                            <input 
                                type="text" 
                                placeholder="Π.χ. DA100..." 
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                className="w-full pl-9 p-3 border border-slate-200 rounded-xl bg-slate-50 text-sm focus:ring-2 focus:ring-indigo-500/20 outline-none"
                            />
                        </div>
                    </div>
                </div>

                {/* PREVIEW PANEL */}
                <div className="lg:col-span-2 bg-white rounded-3xl shadow-sm border border-slate-100 flex flex-col overflow-hidden">
                    <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                        <h2 className="font-bold text-slate-800 flex items-center gap-2">
                            <Layers size={18} className="text-indigo-500"/> Προεπισκόπηση
                        </h2>
                        <span className="bg-indigo-100 text-indigo-800 px-3 py-1 rounded-full text-xs font-bold">
                            {filteredItems.length} Κωδικοί
                        </span>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto p-6 bg-slate-50/30">
                        {filteredItems.length > 0 ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                                {filteredItems.slice(0, 60).map((item, idx) => (
                                    <div key={idx} className="flex flex-col justify-between bg-white p-3 rounded-lg border border-slate-100 shadow-sm text-sm min-h-[60px]">
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="font-black text-slate-700">{item.skuBase}</span>
                                        </div>
                                        <div className="space-y-1">
                                            {item.priceGroups.map((pg, pgIdx) => (
                                                <div key={pgIdx} className="flex justify-between items-center text-xs">
                                                    <span className="font-bold text-slate-400 truncate max-w-[80px]">
                                                        {pg.suffixes.includes('') && <span className="mr-1">•</span>}
                                                        {pg.suffixes.filter(s => s !== '').join('/')}
                                                    </span>
                                                    <span className="font-mono text-slate-600 font-medium">{pg.price.toFixed(2)}€</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                                {filteredItems.length > 60 && (
                                    <div className="col-span-full text-center py-4 text-slate-400 text-xs italic">
                                        ...και {filteredItems.length - 60} ακόμη κωδικοί
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center text-slate-400">
                                <Search size={48} className="mb-4 opacity-20"/>
                                <p>Δεν βρέθηκαν προϊόντα με τα επιλεγμένα φίλτρα.</p>
                            </div>
                        )}
                    </div>

                    <div className="p-6 border-t border-slate-100 bg-white">
                        <button 
                            onClick={handlePrint}
                            disabled={filteredItems.length === 0}
                            className="w-full bg-indigo-600 text-white py-4 rounded-xl font-bold flex items-center justify-center gap-3 hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 disabled:opacity-50 disabled:cursor-not-allowed hover:-translate-y-1 active:translate-y-0"
                        >
                            <Printer size={20}/> Δημιουργία & Εκτύπωση PDF
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
