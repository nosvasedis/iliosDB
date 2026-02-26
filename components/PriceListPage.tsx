
import React, { useState, useMemo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Product, Gender, Collection } from '../types';
import { ScrollText, Filter, CheckSquare, Square, Printer, Search, Layers, User, Users, FolderKanban, Check, X, Plus, Zap, PenTool, ListFilter, Trash2, Minus, FolderX } from 'lucide-react';
import { PriceListPrintData } from './PriceListPrintView';
import { useUI } from './UIProvider';
import { getVariantComponents, splitSkuComponents } from '../utils/pricingEngine';

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

type SidebarTab = 'filters' | 'collections' | 'manual';

// Helper to get initials (e.g. "Aegean Tales" -> "AT")
const getCollectionInitials = (name: string) => {
    return name
        .split(' ')
        .map(n => n[0])
        .join('')
        .substring(0, 2)
        .toUpperCase();
};

const pluralizeCategory = (cat: string) => {
    const map: Record<string, string> = {
        'Δαχτυλίδι': 'Δαχτυλίδια',
        'Βραχιόλι': 'Βραχιόλια',
        'Σταυρός': 'Σταυροί',
        'Μενταγιόν': 'Μενταγιόν',
        'Σκουλαρίκια': 'Σκουλαρίκια',
        'Αλυσίδα': 'Αλυσίδες',
        'Κολιέ': 'Κολιέ'
    };
    // Basic heuristic for unknown words:
    if (map[cat]) return map[cat];
    return cat;
};

// Helper to get stone chip colors
const getStoneChipStyle = (code: string) => {
    const stoneStyles: Record<string, string> = {
        // Women — Zircon family
        'LE': 'bg-slate-100 text-slate-700',
        'MP': 'bg-blue-100 text-blue-800',
        'PR': 'bg-green-100 text-green-800',
        'KO': 'bg-red-100 text-red-800',
        'MV': 'bg-purple-100 text-purple-800',
        'RZ': 'bg-pink-100 text-pink-800',
        'AK': 'bg-cyan-100 text-cyan-800',
        // Women — Agate family
        'PAX': 'bg-green-100 text-green-700',
        'MAX': 'bg-blue-100 text-blue-700',
        'KAX': 'bg-red-100 text-red-700',
        // Women — Copper family
        'CO': 'bg-teal-100 text-teal-800',
        'PCO': 'bg-emerald-100 text-emerald-800',
        'MCO': 'bg-purple-100 text-purple-700',
        // Women — Triplets
        'TPR': 'bg-emerald-100 text-emerald-700',
        'TKO': 'bg-red-100 text-red-700',
        'TMP': 'bg-indigo-100 text-indigo-700',
        // Women — Other
        'AI': 'bg-zinc-100 text-zinc-700',
        'AP': 'bg-teal-100 text-teal-700',
        'AM': 'bg-teal-100 text-teal-800',
        'LR': 'bg-blue-100 text-blue-700',
        'LA': 'bg-blue-200 text-blue-900',
        'FI': 'bg-amber-100 text-amber-700',
        'BST': 'bg-sky-100 text-sky-700',
        'XAL': 'bg-blue-50 text-blue-600',
        // Men
        'KR': 'bg-orange-100 text-orange-800',
        'AX': 'bg-green-100 text-green-700',
        'TG': 'bg-amber-100 text-amber-800',
        'QN': 'bg-zinc-100 text-zinc-800',
        'TY': 'bg-teal-100 text-teal-800',
        'IA': 'bg-rose-100 text-rose-800',
        'BSU': 'bg-zinc-100 text-zinc-700',
        'GSU': 'bg-green-100 text-green-700',
        'RSU': 'bg-red-100 text-red-700',
        'MA': 'bg-emerald-100 text-emerald-800',
        'OP': 'bg-stone-100 text-stone-600',
        'NF': 'bg-green-100 text-green-800',
        'SD': 'bg-indigo-100 text-indigo-900',
    };
    return stoneStyles[code] || 'bg-slate-50 text-slate-600';
};

// Helper to get finish code color
const getFinishChipStyle = (code: string) => {
    const finishStyles: Record<string, string> = {
        '': 'bg-slate-100 text-slate-700',  // Λουστρέ (Lustre) - gray/slate
        'P': 'bg-slate-200 text-slate-800',  // Πατίνα (Patina) - darker slate/gray
        'X': 'bg-amber-100 text-amber-800',  // Επίχρυσο (Gold) - amber/yellow
        'D': 'bg-orange-100 text-orange-800', // Δίχρωμο (Two-tone) - orange
        'H': 'bg-cyan-100 text-cyan-800',    // Επιπλατινωμένο (Platinum) - cyan/light blue
    };
    return finishStyles[code] || 'bg-slate-50 text-slate-600';
};

// Parse suffix into finish and stone parts
const parseSuffixForDisplay = (suffix: string, gender?: Gender) => {
    if (!suffix || suffix === '') return { parts: [], basePrice: true };
    
    const { finish, stone } = getVariantComponents(suffix, gender);
    const parts: Array<{ code: string; type: 'finish' | 'stone'; style: string }> = [];
    
    if (finish.code && finish.code !== '') {
        parts.push({ code: finish.code, type: 'finish', style: getFinishChipStyle(finish.code) });
    }
    
    if (stone.code && stone.code !== '') {
        parts.push({ code: stone.code, type: 'stone', style: getStoneChipStyle(stone.code) });
    }
    
    return { parts, basePrice: false };
};

export default function PriceListPage({ products, collections, onPrint }: Props) {
    const { showToast } = useUI();
    const [activeTab, setActiveTab] = useState<SidebarTab>('filters');

    const [selectedGenders, setSelectedGenders] = useState<string[]>([Gender.Women, Gender.Men, Gender.Unisex]);
    const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
    const [selectedCollectionIds, setSelectedCollectionIds] = useState<number[]>([]);
    
    // New: Category filtering within selected collections
    const [selectedCategoriesInCollections, setSelectedCategoriesInCollections] = useState<string[]>([]);
    
    // New Toggle State
    const [excludeCollections, setExcludeCollections] = useState(false);
    
    const [searchTerm, setSearchTerm] = useState('');

    // MANUAL OVERRIDES STATE
    const [manualSkus, setManualSkus] = useState<string[]>([]);
    const [excludedSkus, setExcludedSkus] = useState<Set<string>>(new Set());
    const [manualInput, setManualInput] = useState('');
    const [excludeInput, setExcludeInput] = useState('');
    const [customPdfTitle, setCustomPdfTitle] = useState('');

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

    // Initialize collection categories when collections are selected
    React.useEffect(() => {
        if (selectedCollectionIds.length > 0) {
            // Get all unique categories from selected collections
            const catsInCollections = new Set<string>();
            products.forEach(p => {
                if (p.collections?.some(id => selectedCollectionIds.includes(id))) {
                    catsInCollections.add(p.category);
                }
            });
            
            // Initialize or update selected categories in collections
            setSelectedCategoriesInCollections(prev => {
                const catsArray = Array.from(catsInCollections);
                // If prev is empty or has changed, reset to all
                if (prev.length === 0 || !catsArray.every(c => prev.includes(c))) {
                    return catsArray;
                }
                // Otherwise keep previous selection but filter out non-existent ones
                return prev.filter(c => catsArray.includes(c));
            });
        }
    }, [selectedCollectionIds, products]);

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

    const toggleCollection = (id: number) => {
        setSelectedCollectionIds(prev => 
            prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
        );
    };

    const toggleCategoryInCollection = (category: string) => {
        setSelectedCategoriesInCollections(prev => 
            prev.includes(category) ? prev.filter(x => x !== category) : [...prev, category]
        );
    };

    const toggleAllCategoriesInCollections = () => {
        if (selectedCollectionIds.length === 0) return;
        
        const catsInCollections = new Set<string>();
        products.forEach(p => {
            if (p.collections?.some(id => selectedCollectionIds.includes(id))) {
                catsInCollections.add(p.category);
            }
        });
        
        const catsArray = Array.from(catsInCollections);
        if (selectedCategoriesInCollections.length === catsArray.length) {
            setSelectedCategoriesInCollections([]);
        } else {
            setSelectedCategoriesInCollections(catsArray);
        }
    };

    const handleAddManualSku = () => {
        if (!manualInput.trim()) return;
        const upper = manualInput.trim().toUpperCase();
        
        // Only consider non-component products for manual addition
        const existingSkus = new Set(products.filter(p => !p.is_component).map(p => p.sku));

        // Robust Range expansion support: [PREFIX][NUMBER][SUFFIX] - [PREFIX][NUMBER][SUFFIX]
        const rangeRegex = /^([A-Z-]*)([0-9]+)([A-Z]*)-([A-Z-]*)([0-9]+)([A-Z]*)$/i;
        const match = upper.match(rangeRegex);

        if (match) {
            const [, prefix1, num1Str, suffix1, prefix2, num2Str, suffix2] = match;
            
            // Validation: Prefixes and Suffixes must match
            if (prefix1 === prefix2 && suffix1 === suffix2) {
                const start = parseInt(num1Str, 10);
                const end = parseInt(num2Str, 10);
                if (!isNaN(start) && !isNaN(end) && end >= start && (end - start) < 500) {
                    const found: string[] = [];
                    const padding = num1Str.length;
                    for (let i = start; i <= end; i++) {
                        const sku = `${prefix1}${i.toString().padStart(padding, '0')}${suffix1}`;
                        if (existingSkus.has(sku)) {
                            found.push(sku);
                        }
                    }

                    if (found.length === 0) {
                        showToast('Δεν βρέθηκαν κωδικοί σε αυτό το εύρος.', 'error');
                        return;
                    }

                    setManualSkus(prev => Array.from(new Set([...prev, ...found])));
                    setManualInput('');
                    showToast(`Προστέθηκαν ${found.length} κωδικοί.`, 'success');
                    return;
                }
            }
        }

        if (existingSkus.has(upper)) {
            setManualSkus(prev => Array.from(new Set([...prev, upper])));
            setManualInput('');
            showToast(`Ο κωδικός ${upper} προστέθηκε.`, 'success');
        } else {
            showToast(`Ο κωδικός ${upper} δεν βρέθηκε ή είναι εξάρτημα.`, 'error');
        }
    };

    const handleExcludeManualSku = () => {
        if (!excludeInput.trim()) return;
        const upper = excludeInput.trim().toUpperCase();
        
        const existingSkus = new Set(products.filter(p => !p.is_component).map(p => p.sku));

        // Range Logic
        const rangeRegex = /^([A-Z-]*)([0-9]+)([A-Z]*)-([A-Z-]*)([0-9]+)([A-Z]*)$/i;
        const match = upper.match(rangeRegex);

        if (match) {
            const [, prefix1, num1Str, suffix1, prefix2, num2Str, suffix2] = match;
            
            if (prefix1 === prefix2 && suffix1 === suffix2) {
                const start = parseInt(num1Str, 10);
                const end = parseInt(num2Str, 10);
                if (!isNaN(start) && !isNaN(end) && end >= start && (end - start) < 500) {
                    const found: string[] = [];
                    const padding = num1Str.length;
                    for (let i = start; i <= end; i++) {
                        const sku = `${prefix1}${i.toString().padStart(padding, '0')}${suffix1}`;
                        if (existingSkus.has(sku)) {
                            found.push(sku);
                        }
                    }

                    if (found.length === 0) {
                        showToast('Δεν βρέθηκαν κωδικοί για εξαίρεση σε αυτό το εύρος.', 'error');
                        return;
                    }

                    setExcludedSkus(prev => {
                        const next = new Set(prev);
                        found.forEach(s => next.add(s));
                        return next;
                    });
                    setExcludeInput('');
                    showToast(`Εξαιρέθηκαν ${found.length} κωδικοί.`, 'success');
                    return;
                }
            }
        }

        if (existingSkus.has(upper)) {
            setExcludedSkus(prev => {
                const next = new Set(prev);
                next.add(upper);
                return next;
            });
            setExcludeInput('');
            showToast(`Ο κωδικός ${upper} εξαιρέθηκε.`, 'success');
        } else {
            showToast(`Ο κωδικός ${upper} δεν βρέθηκε.`, 'error');
        }
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
            isManual: boolean,
            collectionTag?: string
        }>();
        
        // Map collection IDs to Initials if multiple collections are selected
        const multiCollectionMode = selectedCollectionIds.length > 1;
        const collectionInitialsMap = new Map<number, string>();
        if (multiCollectionMode) {
            collections.forEach(c => {
                if (selectedCollectionIds.includes(c.id)) {
                    collectionInitialsMap.set(c.id, getCollectionInitials(c.name));
                }
            });
        }

        products.forEach(p => {
            // Strictly exclude components
            if (p.is_component) return;

            const isManuallyInList = manualSkus.includes(p.sku);
            const isExcluded = excludedSkus.has(p.sku);
            
            let shouldInclude = false;
            let tag: string | undefined = undefined;

            // Exclusion takes precedence
            if (isExcluded) {
                shouldInclude = false;
            } else if (isManuallyInList) {
                shouldInclude = true;
            } else {
                // Modified Logic: Check if product is in ANY of the selected collections
                if (selectedCollectionIds.length > 0) {
                    // Check if it belongs to one of the selected collections
                    const matchedCollectionId = p.collections?.find(id => selectedCollectionIds.includes(id));
                    if (matchedCollectionId) {
                        shouldInclude = true;
                        // If multiple collections selected, assign the tag
                        if (multiCollectionMode) {
                            tag = collectionInitialsMap.get(matchedCollectionId);
                        }
                        
                        // NEW: Also check if product's category is selected in collection filters
                        if (selectedCategoriesInCollections.length > 0 && !selectedCategoriesInCollections.includes(p.category)) {
                            shouldInclude = false;
                        }
                    }
                } else {
                    // Fallback to standard filters if no collection is selected
                    shouldInclude = selectedGenders.includes(p.gender) && selectedCategories.includes(p.category);
                }

                // EXCLUDE COLLECTIONS LOGIC
                // Only applies if NOT manually added
                if (shouldInclude && excludeCollections && p.collections && p.collections.length > 0) {
                    shouldInclude = false;
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
                        const price = v.selling_price ?? p.selling_price ?? 0;
                        // Include all variants in the map
                        variantMap[v.suffix] = price;
                        // Mark as valid if at least one variant has a non-negative price
                        if (price >= 0) {
                            hasValidPrice = true;
                        }
                    });
                } else {
                    const price = p.selling_price ?? 0;
                    variantMap[''] = price;
                    if (price >= 0) {
                        hasValidPrice = true;
                    }
                }

                // Allow manual items even if price is 0 or invalid
                if (hasValidPrice || isManuallyInList) {
                    productMap.set(p.sku, {
                        skuBase: p.sku,
                        category: p.category,
                        variantMap,
                        isManual: isManuallyInList,
                        collectionTag: tag
                    });
                }
            }
        });

        return Array.from(productMap.values()).map(item => {
            // Group variants by price to reduce row count
            const priceMap = new Map<number, string[]>();
            Object.entries(item.variantMap).forEach(([suffix, price]) => {
                const existing = priceMap.get(price) || [];
                existing.push(suffix);
                priceMap.set(price, existing);
            });

            const priceGroups = Array.from(priceMap.entries()).map(([price, suffixes]) => ({
                suffixes,
                price
            })).sort((a, b) => {
                // Sort by suffix priority: '' (Lustre) first, then P, D, X, H, then stone codes
                const getPriority = (s: string) => {
                    if (s === '') return 0;
                    if (s === 'P') return 1;
                    if (s === 'D') return 2;
                    if (s === 'X') return 3;
                    if (s === 'H') return 4;
                    return 5; // Stone codes and other variants
                };
                // Get the minimum priority from all suffixes in the group
                const minPriorityA = Math.min(...a.suffixes.map(getPriority));
                const minPriorityB = Math.min(...b.suffixes.map(getPriority));
                if (minPriorityA !== minPriorityB) return minPriorityA - minPriorityB;
                return a.price - b.price;
            });

            return {
                skuBase: item.skuBase,
                category: item.category,
                isManual: item.isManual,
                collectionTag: item.collectionTag,
                priceGroups
            };
        }).sort((a, b) => a.skuBase.localeCompare(b.skuBase, undefined, { numeric: true }));

    }, [products, selectedGenders, selectedCategories, searchTerm, selectedCollectionIds, manualSkus, excludedSkus, collections, excludeCollections, selectedCategoriesInCollections]);

    const listParentRef = useRef<HTMLDivElement>(null);
    const rowCount = Math.ceil(filteredItems.length / 3) || 0;
    const rowVirtualizer = useVirtualizer({
        count: rowCount,
        getScrollElement: () => listParentRef.current,
        estimateSize: () => 100,
        overscan: 5
    });

    const handlePrint = () => {
        const dateStr = new Date().toLocaleDateString('el-GR');
        let title = '';
        let subtitle = `${filteredItems.length} Κωδικοί`;
        let collectionNames: string | undefined = undefined;
        let filtersInfo: string | undefined = undefined;

        if (selectedCollectionIds.length > 0) {
            // Join all selected collection names for the main title
            title = collections
                .filter(c => selectedCollectionIds.includes(c.id))
                .map(c => c.name)
                .join(', ');
            
            // Add category info if not all categories are selected
            if (selectedCategoriesInCollections.length > 0) {
                const catsInCollections = new Set<string>();
                products.forEach(p => {
                    if (p.collections?.some(id => selectedCollectionIds.includes(id))) {
                        catsInCollections.add(p.category);
                    }
                });
                
                if (selectedCategoriesInCollections.length < catsInCollections.size) {
                    const formattedCats = selectedCategoriesInCollections.map(c => pluralizeCategory(c));
                    if (formattedCats.length <= 3) {
                        title += ` - ${formattedCats.join(' & ')}`;
                    } else {
                        title += ` - ${formattedCats.slice(0, 2).join(', ')} & ${formattedCats.length - 2} ακόμα`;
                    }
                }
            }
            
            // Explicitly undefined so the View does not render the secondary subtitle line
            collectionNames = undefined; 
        } else {
            // Gender Logic
            const isAllGenders = selectedGenders.length === 3 || selectedGenders.length === 0;
            let genderPrefix = '';
            
            if (!isAllGenders) {
                const labels: string[] = [];
                if (selectedGenders.includes(Gender.Men)) labels.push('Αντρικά');
                if (selectedGenders.includes(Gender.Women)) labels.push('Γυναικεία');
                if (selectedGenders.includes(Gender.Unisex)) labels.push('Unisex');
                
                if (labels.length === 2) genderPrefix = labels.join(' & ');
                else genderPrefix = labels[0];
            }

            // Category Logic
            let catStr = '';
            const areAllCats = selectedCategories.length === allCategories.length && allCategories.length > 0;
            
            if (areAllCats) {
                catStr = genderPrefix ? `${genderPrefix} Είδη` : 'Πλήρης Κατάλογος';
            } else if (selectedCategories.length > 0) {
                const formattedCats = selectedCategories.map(c => pluralizeCategory(c));
                let catsList = '';
                
                if (formattedCats.length <= 3) {
                    catsList = formattedCats.join(' & ');
                } else {
                    catsList = `${formattedCats.slice(0, 2).join(', ')} & ${formattedCats.length - 2} ακόμα`;
                }

                catStr = genderPrefix ? `${genderPrefix} ${catsList}` : catsList;
            } else {
                catStr = 'Επιλεγμένα Είδη';
            }

            title = catStr;
            if (excludeCollections) filtersInfo = 'ΕΚΤΟΣ ΣΥΛΛΟΓΩΝ';
        }
        
        const finalTitle = customPdfTitle.trim() || title;

        onPrint({
            title: finalTitle,
            subtitle,
            collectionNames,
            filtersInfo,
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
                {/* CONTROLS PANEL (LEFT) */}
                <div className="lg:col-span-4 flex flex-col bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
                    {/* TABS HEADER */}
                    <div className="flex border-b border-slate-100 p-2 gap-2 bg-slate-50/50">
                        <button 
                            onClick={() => setActiveTab('filters')} 
                            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold transition-all ${activeTab === 'filters' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:bg-slate-100'}`}
                        >
                            <ListFilter size={16}/> Φίλτρα
                        </button>
                        <button 
                            onClick={() => setActiveTab('collections')} 
                            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold transition-all ${activeTab === 'collections' ? 'bg-white shadow-sm text-pink-600' : 'text-slate-500 hover:bg-slate-100'}`}
                        >
                            <FolderKanban size={16}/> Συλλογές
                            {selectedCollectionIds.length > 0 && <span className="w-2 h-2 bg-pink-500 rounded-full"/>}
                        </button>
                        <button 
                            onClick={() => setActiveTab('manual')} 
                            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold transition-all ${activeTab === 'manual' ? 'bg-white shadow-sm text-amber-600' : 'text-slate-500 hover:bg-slate-100'}`}
                        >
                            <PenTool size={16}/> Εισαγωγή
                            {(manualSkus.length > 0 || excludedSkus.size > 0) && <span className="w-2 h-2 bg-amber-500 rounded-full"/>}
                        </button>
                    </div>

                    {/* TAB CONTENT */}
                    <div className="flex-1 overflow-y-auto custom-scrollbar p-6 relative">
                        
                        {/* TAB 1: FILTERS */}
                        {activeTab === 'filters' && (
                            <div className={`space-y-8 transition-opacity duration-300 ${selectedCollectionIds.length > 0 ? 'opacity-40 pointer-events-none grayscale' : ''}`}>
                                {selectedCollectionIds.length > 0 && (
                                    <div className="bg-pink-50 text-pink-700 text-xs font-bold p-3 rounded-xl border border-pink-100 text-center">
                                        Έχετε επιλέξει συλλογές. Χρησιμοποιήστε την καρτέλα "Συλλογές" για φίλτρα.
                                    </div>
                                )}
                                
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

                                {/* EXCLUDE COLLECTIONS TOGGLE */}
                                <div className="pt-4 border-t border-slate-100">
                                    <button
                                        onClick={() => setExcludeCollections(!excludeCollections)}
                                        className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-bold transition-all border ${excludeCollections ? 'bg-rose-50 border-rose-200 text-rose-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                                    >
                                        <div className="flex items-center gap-2">
                                            <FolderX size={16} />
                                            <span>Εξαίρεση Συλλογών</span>
                                        </div>
                                        <div className={`w-4 h-4 rounded border flex items-center justify-center ${excludeCollections ? 'bg-rose-500 border-rose-500' : 'border-slate-300'}`}>
                                            {excludeCollections && <Check size={10} className="text-white" />}
                                        </div>
                                    </button>
                                    <p className="text-[10px] text-slate-400 mt-2 px-1">
                                        Απόκρυψη κωδικών που ανήκουν σε οποιαδήποτε συλλογή.
                                    </p>
                                </div>
                            </div>
                        )}

                        {/* TAB 2: COLLECTIONS */}
                        {activeTab === 'collections' && (
                            <div className="space-y-4">
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-2 opacity-60">
                                        <FolderKanban size={14} className="text-slate-500"/>
                                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Επιλογή Συλλογών</span>
                                    </div>
                                    {selectedCollectionIds.length > 0 && (
                                        <button onClick={() => setSelectedCollectionIds([])} className="text-[9px] text-pink-500 font-bold hover:underline">
                                            Καθαρισμός
                                        </button>
                                    )}
                                </div>
                                <div className="space-y-2">
                                    {collections.length > 0 ? collections.map(c => {
                                        const isSelected = selectedCollectionIds.includes(c.id);
                                        return (
                                            <button 
                                                key={c.id} 
                                                onClick={() => toggleCollection(c.id)}
                                                className={`w-full text-left p-3 rounded-xl text-sm font-bold transition-all flex items-center justify-between border ${isSelected ? 'bg-pink-50 border-pink-200 text-pink-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                                            >
                                                <span>{c.name}</span>
                                                {isSelected && <Check size={16} className="text-pink-600"/>}
                                            </button>
                                        );
                                    }) : (
                                        <div className="text-xs text-slate-400 italic text-center py-10">Δεν υπάρχουν συλλογές.</div>
                                    )}
                                </div>
                                
                                {/* Category Filter within Selected Collections */}
                                {selectedCollectionIds.length > 0 && (
                                    <div className="mt-6 pt-6 border-t border-slate-200">
                                        <div className="flex items-center justify-between mb-3">
                                            <div className="flex items-center gap-2">
                                                <ListFilter size={14} className="text-pink-500"/>
                                                <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wide">
                                                    Φίλτρα Κατηγοριών ({selectedCategoriesInCollections.length})
                                                </span>
                                            </div>
                                            <button 
                                                onClick={toggleAllCategoriesInCollections}
                                                className="text-[9px] font-bold bg-pink-100 hover:bg-pink-200 text-pink-700 px-3 py-1.5 rounded-lg transition-colors"
                                            >
                                                {selectedCategoriesInCollections.length === Array.from(new Set(products.filter(p => p.collections?.some(id => selectedCollectionIds.includes(id))).map(p => p.category))).length 
                                                    ? 'Αποεπιλογή Όλων' 
                                                    : 'Επιλογή Όλων'}
                                            </button>
                                        </div>
                                        <div className="space-y-1.5 max-h-64 overflow-y-auto custom-scrollbar">
                                            {(() => {
                                                const catsInCollections = new Set<string>();
                                                products.forEach(p => {
                                                    if (p.collections?.some(id => selectedCollectionIds.includes(id))) {
                                                        catsInCollections.add(p.category);
                                                    }
                                                });
                                                
                                                return Array.from(catsInCollections).sort().map(cat => (
                                                    <button
                                                        key={cat}
                                                        onClick={() => toggleCategoryInCollection(cat)}
                                                        className={`w-full text-left px-3 py-2.5 rounded-lg text-xs font-medium transition-all flex items-center gap-2 border ${
                                                            selectedCategoriesInCollections.includes(cat) 
                                                                ? 'bg-pink-50 border-pink-200 text-pink-700' 
                                                                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                                                        }`}
                                                    >
                                                        <div className={`w-4 h-4 rounded flex items-center justify-center transition-all shrink-0 ${
                                                            selectedCategoriesInCollections.includes(cat) 
                                                                ? 'bg-pink-500 text-white' 
                                                                : 'border-2 border-slate-300 bg-white'
                                                        }`}>
                                                            {selectedCategoriesInCollections.includes(cat) && <Check size={12} strokeWidth={3} />}
                                                        </div>
                                                        <span className="flex-1">{pluralizeCategory(cat)}</span>
                                                    </button>
                                                ));
                                            })()}
                                        </div>
                                        {selectedCategoriesInCollections.length === 0 && (
                                            <p className="text-[9px] text-pink-600 mt-2 px-1 italic">
                                                Καμία κατηγορία δεν είναι επιλεγμένη. Επιλέξτε τουλάχιστον μία για εμφάνιση προϊόντων.
                                            </p>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* TAB 3: MANUAL */}
                        {activeTab === 'manual' && (
                            <div className="space-y-6">
                                {/* Quick Add Section */}
                                <div className="bg-gradient-to-br from-amber-50 to-orange-50 p-4 rounded-2xl border border-amber-200">
                                    <h3 className="font-bold text-amber-800 text-xs uppercase tracking-wider flex items-center gap-2 mb-3">
                                        <Zap size={14}/> Γρήγορη Προσθήκη
                                    </h3>
                                    <div className="flex gap-2 mb-2">
                                        <input 
                                            type="text" 
                                            value={manualInput} 
                                            onChange={e => setManualInput(e.target.value)} 
                                            onKeyDown={e => e.key === 'Enter' && handleAddManualSku()}
                                            placeholder="SKU ή Εύρος (π.χ. MN050-MN063)" 
                                            className="flex-1 p-2.5 border border-amber-200 rounded-xl bg-white text-sm focus:ring-2 focus:ring-amber-500/20 outline-none"
                                        />
                                        <button onClick={handleAddManualSku} className="bg-amber-500 text-white p-2.5 rounded-xl hover:bg-amber-600 transition-colors shadow-sm">
                                            <Plus size={20}/>
                                        </button>
                                    </div>
                                    <p className="text-[9px] text-amber-700/80">
                                        Πληκτρολογήστε ένα SKU ή εύρος και πατήστε Enter για προσθήκη.
                                    </p>
                                </div>

                                {/* Quick Remove Section */}
                                <div className="bg-gradient-to-br from-red-50 to-rose-50 p-4 rounded-2xl border border-red-200">
                                    <h3 className="font-bold text-red-800 text-xs uppercase tracking-wider flex items-center gap-2 mb-3">
                                        <Minus size={14}/> Αφαίρεση
                                    </h3>
                                    <div className="flex gap-2 mb-2">
                                        <input 
                                            type="text" 
                                            value={excludeInput} 
                                            onChange={e => setExcludeInput(e.target.value)} 
                                            onKeyDown={e => e.key === 'Enter' && handleExcludeManualSku()}
                                            placeholder="SKU ή Εύρος (π.χ. MN050-MN063)" 
                                            className="flex-1 p-2.5 border border-red-200 rounded-xl bg-white text-sm focus:ring-2 focus:ring-red-500/20 outline-none"
                                        />
                                        <button onClick={handleExcludeManualSku} className="bg-red-500 text-white p-2.5 rounded-xl hover:bg-red-600 transition-colors shadow-sm">
                                            <Minus size={20}/>
                                        </button>
                                    </div>
                                    <p className="text-[9px] text-red-700/80">
                                        Αφαιρέστε συγκεκριμένα SKUs από τη λίστα εκτύπωσης.
                                    </p>
                                </div>

                                {/* Current Selections Summary */}
                                {(manualSkus.length > 0 || excludedSkus.size > 0) && (
                                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
                                        <div className="flex items-center justify-between mb-3">
                                            <span className="text-xs font-bold text-slate-600 uppercase tracking-wide">
                                                Διαχείριση Επιλογών
                                            </span>
                                            <div className="flex gap-2">
                                                {manualSkus.length > 0 && (
                                                    <button 
                                                        onClick={() => setManualSkus([])}
                                                        className="text-[9px] text-blue-600 font-bold hover:bg-blue-50 px-2 py-1 rounded transition-colors"
                                                    >
                                                        Καθαρισμός Προσθηκών
                                                    </button>
                                                )}
                                                {excludedSkus.size > 0 && (
                                                    <button 
                                                        onClick={() => setExcludedSkus(new Set())}
                                                        className="text-[9px] text-red-600 font-bold hover:bg-red-50 px-2 py-1 rounded transition-colors"
                                                    >
                                                        Καθαρισμός Εξαιρέσεων
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                        
                                        <div className="space-y-3 max-h-48 overflow-y-auto custom-scrollbar">
                                            {manualSkus.length > 0 && (
                                                <div>
                                                    <div className="flex items-center justify-between mb-1.5">
                                                        <span className="text-[10px] font-bold text-blue-600 uppercase flex items-center gap-1">
                                                            <Check size={10}/> Προστέθηκαν ({manualSkus.length})
                                                        </span>
                                                    </div>
                                                    <div className="flex flex-wrap gap-1">
                                                        {manualSkus.map(sku => (
                                                            <span key={sku} className="text-[10px] font-mono font-bold bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded border border-blue-100">
                                                                {sku}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                            
                                            {excludedSkus.size > 0 && (
                                                <div>
                                                    <div className="flex items-center justify-between mb-1.5">
                                                        <span className="text-[10px] font-bold text-red-600 uppercase flex items-center gap-1">
                                                            <X size={10}/> Αφαιρέθηκαν ({excludedSkus.size})
                                                        </span>
                                                    </div>
                                                    <div className="flex flex-wrap gap-1">
                                                        {Array.from(excludedSkus).map(sku => (
                                                            <span key={sku} className="text-[10px] font-mono font-bold bg-red-50 text-red-700 px-1.5 py-0.5 rounded border border-red-100 line-through decoration-red-400">
                                                                {sku}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                                
                                <div className="bg-gradient-to-br from-indigo-50 to-violet-50 p-4 rounded-2xl border border-indigo-200">
                                    <h3 className="font-bold text-indigo-800 text-xs uppercase tracking-wider mb-3">
                                        Τίτλος PDF
                                    </h3>
                                    <input
                                        type="text"
                                        value={customPdfTitle}
                                        onChange={e => setCustomPdfTitle(e.target.value)}
                                        placeholder="Πληκτρολογήστε προσαρμοσμένο τίτλο..."
                                        className="w-full p-2.5 border border-indigo-200 rounded-xl bg-white text-sm focus:ring-2 focus:ring-indigo-500/20 outline-none"
                                    />
                                    <p className="text-[9px] text-indigo-700/80 mt-2">
                                        Αν το αφήσετε κενό, χρησιμοποιείται ο αυτόματος τίτλος.
                                    </p>
                                </div>

                                {/* Info Box */}
                                <div className="bg-indigo-50 p-3 rounded-xl border border-indigo-100">
                                    <p className="text-[9px] text-indigo-700 leading-relaxed">
                                        💡 <strong>Συμβουλή:</strong> Οι χειροκίνητες επιλογές παρακάμπτουν τα φίλτρα. 
                                        Χρησιμοποιήστε τες για να προσθέσετε εξαιρέσεις ή ειδικές περιπτώσεις.
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* PREVIEW PANEL (RIGHT) */}
                <div className="lg:col-span-8 bg-white rounded-3xl shadow-sm border border-slate-100 flex flex-col overflow-hidden h-full">
                    <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 gap-4">
                        <div className="flex items-center gap-2">
                            <Layers size={20} className="text-indigo-500"/> 
                            <span className="font-bold text-slate-800 text-lg hidden sm:inline">Προεπισκόπηση</span>
                            <span className="bg-indigo-100 text-indigo-800 px-3 py-1 rounded-full text-xs font-bold">
                                {filteredItems.length}
                            </span>
                        </div>
                        
                        {/* SEARCH IN PREVIEW HEADER */}
                        <div className="relative flex-1 max-w-xs">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14}/>
                            <input 
                                type="text" 
                                placeholder="Αναζήτηση στη λίστα..." 
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                className="w-full pl-9 p-2 border border-slate-200 rounded-xl bg-white text-sm focus:ring-2 focus:ring-indigo-500/20 outline-none"
                            />
                        </div>
                    </div>
                    
                    <div ref={listParentRef} className="flex-1 overflow-y-auto p-8 bg-slate-50/30 custom-scrollbar">
                        {filteredItems.length > 0 ? (
                            <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: 'relative', width: '100%' }}>
                                {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                                    const startIdx = virtualRow.index * 3;
                                    const rowItems = filteredItems.slice(startIdx, startIdx + 3);
                                    return (
                                        <div
                                            key={virtualRow.key}
                                            className="absolute top-0 left-0 w-full grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4"
                                            style={{ height: `${virtualRow.size}px`, transform: `translateY(${virtualRow.start}px)` }}
                                        >
                                            {rowItems.map((item, idx) => (
                                                <div key={startIdx + idx} className="group relative flex flex-col justify-between bg-white p-4 rounded-xl border border-slate-100 shadow-sm text-sm min-h-[80px] hover:border-indigo-200 transition-all">
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
                                                            {item.collectionTag && (
                                                                <span className="text-[8px] font-black text-slate-400 border border-slate-200 px-1 rounded">
                                                                    {item.collectionTag}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <span className="text-[10px] text-slate-400 font-medium truncate max-w-[80px]">{item.category}</span>
                                                    </div>
                                                    <div className="space-y-1">
                                                        {item.priceGroups.map((pg, pgIdx) => {
                                                            const hasBase = pg.suffixes.includes('');
                                                            const visibleSuffixes = pg.suffixes.filter(s => s !== '');
                                                            
                                                            return (
                                                                <div key={pgIdx} className="flex justify-between items-center text-xs gap-2">
                                                                    <div className="flex flex-wrap gap-[3px] max-w-[140px]">
                                                                        {hasBase && (
                                                                            <span className="font-bold text-slate-700 bg-slate-100 px-1 rounded text-[10px]">
                                                                                •
                                                                            </span>
                                                                        )}
                                                                        {visibleSuffixes.map((s, i) => {
                                                                            // Parse suffix to get color-coded finish and stone parts
                                                                            const { parts } = parseSuffixForDisplay(s);
                                                                            
                                                                            if (parts.length > 0) {
                                                                                // Display each part with its own color
                                                                                return (
                                                                                    <span key={i} className="inline-flex items-center gap-[1px]">
                                                                                        {parts.map((part, partIdx) => (
                                                                                            <span 
                                                                                                key={partIdx}
                                                                                                className={`font-bold px-1 rounded text-[10px] whitespace-nowrap ${part.style}`}
                                                                                            >
                                                                                                {part.code}
                                                                                            </span>
                                                                                        ))}
                                                                                    </span>
                                                                                );
                                                                            }
                                                                            
                                                                            // Fallback for unknown codes
                                                                            return (
                                                                                <span key={i} className="font-bold text-slate-600 bg-slate-50 px-1 rounded text-[10px] whitespace-nowrap">
                                                                                    {s}
                                                                                </span>
                                                                            );
                                                                        })}
                                                                    </div>
                                                                    <span className="font-mono text-slate-700 font-bold shrink-0">{pg.price.toFixed(2)}€</span>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    );
                                })}
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
