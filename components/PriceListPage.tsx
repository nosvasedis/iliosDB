
import React, { useState, useMemo } from 'react';
import { Product, Gender, Collection } from '../types';
import { ScrollText, Filter, CheckSquare, Square, Printer, Search, Layers, User, Users, FolderKanban, Check, X, Plus, Trash2, Info, Zap } from 'lucide-react';
import { PriceListPrintData } from './PriceListPrintView';
import { useUI } from './UIProvider';

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
    const { showToast } = useUI();
    const [selectedGenders, setSelectedGenders] = useState<string[]>([Gender.Women, Gender.Men, Gender.Unisex]);
    const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
    const [selectedCollectionId, setSelectedCollectionId] = useState<number | 'none'>('none');
    const [searchTerm, setSearchTerm] = useState('');

    // MANUAL OVERRIDES STATE
    const [manualSkus, setManualSkus] = useState<string[]>([]);
    const [excludedSkus, setExcludedSkus] = useState<Set<string>>(new Set());
    const [manualInput, setManualInput] = useState('');

    // Extract all unique categories
    const allCategories = useMemo(() => {
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

    const handleAddManualSku = () => {
        if (!manualInput.trim()) return;
        const upper = manualInput.trim().toUpperCase();
        
        // Range expansion support
        const rangeRegex = /^([A-Z-]+)(\d+)-([A-Z-]+)(\d+)$/i;
        const match = upper.match(rangeRegex);

        if (match) {
            const [, prefix1, num1Str, prefix2, num2Str] = match;
            if (prefix1 === prefix2) {
                const start = parseInt(num1Str, 10);
                const end = parseInt(num2Str, 10);
                if (!isNaN(start) && !isNaN(end) && end >= start && (end - start) < 500) {
                    const expanded: string[] = [];
                    const padding = num1Str.length;
                    for (let i = start; i <= end; i++) {
                        expanded.push(`${prefix1}${i.toString().padStart(padding, '0')}`);
                    }
                    setManualSkus(prev => Array.from(new Set([...prev, ...expanded])));
                    setManualInput('');
                    showToast(`Προστέθηκαν ${expanded.length} κωδικοί.`, 'success');
                    return;
                }
            }
        }

        setManualSkus(prev => Array.from(new Set([...prev, upper])));
        setManualInput('');
    };

    const toggleExclusion = (sku: string) => {
        setExcludedSkus(prev => {
            const next = new Set(prev);
            if (next.has(sku)) next.delete(sku);
            else next.add(sku);
            return next;
        });
    };

    const filteredItems = useMemo(() => {
        const productMap = new Map<string, { 
            skuBase: string, 
            category: string, 
            variantMap: Record<string, number>,
            isManual: boolean
        }>();
        
        products.forEach(p => {
            if (p.is_component) return;
            
            const isManuallyInList = manualSkus.includes(p.sku);
            const isExcluded = excludedSkus.has(p.sku);

            let shouldInclude = false;

            if (isManuallyInList) {
                shouldInclude = true;
            } else if (!isExcluded) {
                if (selectedCollectionId !== 'none') {
                    shouldInclude = p.collections?.includes(selectedCollectionId) || false;
                } else {
                    shouldInclude = selectedGenders.includes(p.gender) && selectedCategories.includes(p.category);
                }
            }

            if (searchTerm && !p.sku.includes(searchTerm.toUpperCase())) {
                shouldInclude = false;
            }

            if (shouldInclude) {
                const variantMap: Record<string, number> = {};
                let hasValidPrice = false;

                if (p.variants && p.variants.length > 0) {
                    p.variants.forEach(v => {
                        const price = v.selling_price || p.selling_price || 0;
                        if (price > 0) {
                            variantMap[v.suffix] = price;
                            hasValidPrice = true;
                        }
                    });
                } else {
                    const price = p.selling_price || 0;
                    if (price > 0) {
                        variantMap[''] = price;
                        hasValidPrice = true;
                    }
                }

                if (hasValidPrice) {
                    productMap.set(p.sku, {
                        skuBase: p.sku,
                        category: p.category,
                        variantMap,
                        isManual: isManuallyInList
                    });
                }
            }
        });

        return Array.from(productMap.values()).map(item => {
            const priceToSuffixes: Record<number, string[]> = {};
            Object.entries(item.variantMap).forEach(([suffix, price]) => {
                if (!priceToSuffixes[price]) priceToSuffixes[price] = [];
                priceToSuffixes[price].push(suffix);
            });

            const priceGroups = Object.entries(priceToSuffixes).map(([priceStr, suffixes]) => ({
                price: parseFloat(priceStr),
                suffixes: suffixes.sort()
            })).sort((a, b) => a.price - b.price);

            return {
                skuBase: item.skuBase,
                category: item.category,
                isManual: item.isManual,
                priceGroups
            };
        }).sort((a, b) => a.skuBase.localeCompare(b.skuBase, undefined, { numeric: true }));

    }, [products, selectedGenders, selectedCategories, searchTerm, selectedCollectionId, manualSkus, excludedSkus]);

    const handlePrint = () => {
        const dateStr = new Date().toLocaleDateString('el-GR');
        let title = '';
        let subtitle = `${filteredItems.length} Κωδικοί`;

        if (selectedCollectionId !== 'none') {
            const collectionName = collections.find(c => c.id === selectedCollectionId)?.name || 'Collection';
            title = `${collectionName} - ${dateStr}`;
            subtitle = `Συλλογή • ` + subtitle;
        } else {
            let catStr = selectedCategories.length === allCategories.length ? 'Πλήρης Κατάλογος' : 'Επιλεγμένα Είδη';
            title = `${catStr} - ${dateStr}`;
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
                    <p className="text-slate-500 mt-2 ml-14">Διαχειριστείτε τους κωδικούς που θα εμφανίζονται στην εκτύπωση.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 flex-1 min-h-0">
                {/* FILTERS PANEL */}
                <div className="lg:col-span-4 flex flex-col gap-4 min-h-0">
                    
                    {/* Manual Override Section */}
                    <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 space-y-4">
                        <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wider flex items-center gap-2">
                            <Zap size={16} className="text-amber-500"/> Χειροκίνητη Προσθήκη
                        </h3>
                        <div className="flex gap-2">
                            <input 
                                type="text" 
                                value={manualInput} 
                                onChange={e => setManualInput(e.target.value)} 
                                onKeyDown={e => e.key === 'Enter' && handleAddManualSku()}
                                placeholder="SKU ή Εύρος (π.χ. DA100-DA110)" 
                                className="flex-1 p-2.5 border border-slate-200 rounded-xl bg-slate-50 text-sm focus:ring-2 focus:ring-amber-500/20 outline-none"
                            />
                            <button onClick={handleAddManualSku} className="bg-amber-500 text-white p-2.5 rounded-xl hover:bg-amber-600 transition-colors">
                                <Plus size={20}/>
                            </button>
                        </div>
                        
                        {(manualSkus.length > 0 || excludedSkus.size > 0) && (
                            <div className="pt-3 border-t border-slate-100 flex flex-wrap gap-2">
                                {manualSkus.length > 0 && (
                                    <button onClick={() => setManualSkus([])} className="text-[10px] font-bold bg-blue-50 text-blue-600 px-2 py-1 rounded flex items-center gap-1 hover:bg-blue-100">
                                        Καθαρισμός Added ({manualSkus.length}) <X size={10}/>
                                    </button>
                                )}
                                {excludedSkus.size > 0 && (
                                    <button onClick={() => setExcludedSkus(new Set())} className="text-[10px] font-bold bg-rose-50 text-rose-600 px-2 py-1 rounded flex items-center gap-1 hover:bg-rose-100">
                                        Καθαρισμός Excluded ({excludedSkus.size}) <X size={10}/>
                                    </button>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="bg-white rounded-3xl shadow-sm border border-slate-100 flex-1 flex flex-col overflow-hidden">
                        <div className="p-6 border-b border-slate-100 bg-white">
                            <div className="flex items-center gap-2 font-bold text-slate-800 text-lg">
                                <Filter size={20} className="text-indigo-600" /> Φίλτρα
                            </div>
                        </div>

                        <div className={`flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar transition-opacity duration-300 ${selectedCollectionId !== 'none' ? 'opacity-40 pointer-events-none grayscale' : 'opacity-100'}`}>
                            <div className="space-y-3">
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-wide block">Φύλο</label>
                                <div className="flex gap-2">
                                    {genderOptions.map(opt => (
                                        <button
                                            key={opt.value}
                                            onClick={() => toggleGender(opt.value)}
                                            className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold border transition-all ${selectedGenders.includes(opt.value) ? 'bg-indigo-50 border-indigo-200 text-indigo-700 shadow-sm' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}
                                        >
                                            {selectedGenders.includes(opt.value) ? <CheckSquare size={14}/> : <Square size={14}/>}
                                            {opt.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="space-y-3">
                                <div className="flex justify-between items-center">
                                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wide block">Κατηγορίες</label>
                                    <button onClick={toggleAllCategories} className="text-[10px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-600 px-3 py-1.5 rounded-lg transition-colors">
                                        {selectedCategories.length === allCategories.length ? 'Αποεπιλογή Όλων' : 'Επιλογή Όλων'}
                                    </button>
                                </div>
                                <div className="space-y-1.5">
                                    {allCategories.map(cat => (
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
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="p-6 border-t border-slate-100 bg-slate-50/50 space-y-4">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16}/>
                                <input 
                                    type="text" 
                                    placeholder="Αναζήτηση κωδικού..." 
                                    value={searchTerm}
                                    onChange={e => setSearchTerm(e.target.value)}
                                    className="w-full pl-10 p-3 border border-slate-200 rounded-xl bg-white text-sm focus:ring-2 focus:ring-indigo-500/20 outline-none"
                                />
                            </div>
                            <div>
                                <div className="flex items-center gap-2 mb-2 opacity-60">
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
                </div>

                {/* PREVIEW PANEL */}
                <div className="lg:col-span-8 bg-white rounded-3xl shadow-sm border border-slate-100 flex flex-col overflow-hidden h-full">
                    <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                        <h2 className="font-bold text-slate-800 flex items-center gap-2 text-lg">
                            <Layers size={20} className="text-indigo-500"/> Προεπισκόπηση Εκτύπωσης
                        </h2>
                        <span className="bg-indigo-100 text-indigo-800 px-4 py-1.5 rounded-full text-xs font-bold">
                            {filteredItems.length} Κωδικοί
                        </span>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto p-8 bg-slate-50/30 custom-scrollbar">
                        {filteredItems.length > 0 ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                                {filteredItems.map((item, idx) => (
                                    <div key={idx} className="group relative flex flex-col justify-between bg-white p-4 rounded-xl border border-slate-100 shadow-sm text-sm min-h-[80px] hover:border-indigo-200 transition-all">
                                        {/* Remove Button Overlay */}
                                        <button 
                                            onClick={() => toggleExclusion(item.skuBase)}
                                            className="absolute -top-2 -right-2 bg-white text-slate-400 hover:text-red-500 p-1.5 rounded-full shadow-md border border-slate-100 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                                            title="Αφαίρεση από τη λίστα"
                                        >
                                            <X size={14}/>
                                        </button>

                                        <div className="flex items-center justify-between mb-2 pb-2 border-b border-slate-50">
                                            <div className="flex items-center gap-2">
                                                <span className="font-black text-slate-700 text-base">{item.skuBase}</span>
                                                {item.isManual && (
                                                    <span className="text-[8px] font-black bg-blue-100 text-blue-600 px-1 rounded uppercase">Manual</span>
                                                )}
                                            </div>
                                            <span className="text-[10px] text-slate-400 font-medium truncate max-w-[80px]">{item.category}</span>
                                        </div>
                                        <div className="space-y-1.5">
                                            {item.priceGroups.map((pg, pgIdx) => (
                                                <div key={pgIdx} className="flex justify-between items-center text-xs">
                                                    <span className="font-bold text-slate-500 truncate max-w-[120px]">
                                                        {pg.suffixes.filter(s => s !== '').join(' / ') || 'Lustre'}
                                                    </span>
                                                    <span className="font-mono text-slate-700 font-bold">{pg.price.toFixed(2)}€</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center text-slate-400">
                                <div className="bg-slate-50 p-6 rounded-full mb-4">
                                    <Search size={48} className="text-slate-300"/>
                                </div>
                                <p className="font-medium text-lg">Η λίστα είναι κενή.</p>
                                <p className="text-sm opacity-70">Χρησιμοποιήστε τα φίλτρα ή την "Χειροκίνητη Προσθήκη".</p>
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
