import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Collection, Product } from '../types';
import {
    FolderKanban, Plus, Trash2, X, Search, Loader2, Printer, ScanBarcode,
    PackagePlus, Sparkles, Save, Wand2, Quote, PenTool, FileText, ChevronDown,
    ArrowLeft, ArrowRight, FolderPlus, Package, Layers, ImageOff, Info,
} from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/supabase';
import { invalidateProductsAndCatalog } from '../lib/queryInvalidation';
import { useUI } from './UIProvider';
import { PriceListPrintData } from './PriceListPrintView';
import { generateCollectionDescription } from '../lib/gemini';
import { formatCurrency } from '../utils/pricingEngine';
import ProductDetails from './ProductDetails';
import DesktopPageHeader from './DesktopPageHeader';
import IliosLoader from './ui/IliosLoader';
import { useEscapeToClose } from '../hooks/useEscapeToClose';

interface Props {
    products?: Product[];
    onPrint?: (data: PriceListPrintData) => void;
}

export default function CollectionsPage({ products: allProducts, onPrint }: Props) {
    const queryClient = useQueryClient();
    const { showToast, confirm } = useUI();
    const { data: collections, isLoading: loadingCollections, isError, error } = useQuery<Collection[]>({ queryKey: ['collections'], queryFn: api.getCollections });
    const { data: materials } = useQuery({ queryKey: ['materials'], queryFn: api.getMaterials });
    const { data: molds } = useQuery({ queryKey: ['molds'], queryFn: api.getMolds });
    const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: api.getSettings });

    const [newCollectionName, setNewCollectionName] = useState('');
    const [selectedCollection, setSelectedCollection] = useState<Collection | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [collectionSearch, setCollectionSearch] = useState('');

    // Collapsible header panels
    const [collectionsPanelOpen, setCollectionsPanelOpen] = useState(false);
    const [addPanelOpen, setAddPanelOpen] = useState(false);

    // Description & AI State
    const [isDescModalOpen, setIsDescModalOpen] = useState(false);
    const [collectionDesc, setCollectionDesc] = useState('');
    const [aiGuidance, setAiGuidance] = useState('');
    const [isGeneratingDesc, setIsGeneratingDesc] = useState(false);

    // Bulk Add State
    const [bulkSkus, setBulkSkus] = useState('');
    const [isBulkAdding, setIsBulkAdding] = useState(false);

    // Product View State
    const [viewProduct, setViewProduct] = useState<Product | null>(null);

    const newCollectionInputRef = useRef<HTMLInputElement>(null);
    const workspaceScrollRef = useRef<HTMLDivElement>(null);

    // Sync local desc state with selected collection when opening modal or selecting
    useEffect(() => {
        if (selectedCollection) {
            setCollectionDesc(selectedCollection.description || '');
            setAiGuidance('');
        }
    }, [selectedCollection]);

    // Reset searches when switching collections / closing panels
    useEffect(() => {
        setSearchTerm('');
        setCollectionSearch('');
    }, [selectedCollection]);

    // Auto-focus the create input when the collections panel opens
    useEffect(() => {
        if (collectionsPanelOpen) {
            const t = setTimeout(() => newCollectionInputRef.current?.focus(), 120);
            return () => clearTimeout(t);
        }
    }, [collectionsPanelOpen]);

    // Scroll the workspace back to top when a collection changes
    useEffect(() => {
        workspaceScrollRef.current?.scrollTo({ top: 0 });
    }, [selectedCollection]);

    // Close panels with Escape
    const closePanels = useCallback(() => {
        setCollectionsPanelOpen(false);
        setAddPanelOpen(false);
    }, []);
    useEscapeToClose(closePanels, !collectionsPanelOpen && !addPanelOpen);

    // ── Derived data ──────────────────────────────────────────────────────

    const collectionProductCounts = useMemo(() => {
        const map = new Map<number, number>();
        (allProducts || []).forEach((p) => {
            (p.collections || []).forEach((id) => map.set(id, (map.get(id) || 0) + 1));
        });
        return map;
    }, [allProducts]);

    const productsInAnyCollection = useMemo(
        () => (allProducts || []).filter((p) => (p.collections || []).length > 0).length,
        [allProducts],
    );

    const productsInSelectedCollection = useMemo(() => {
        if (!selectedCollection || !allProducts) return [];
        return allProducts
            .filter((p) => p.collections?.includes(selectedCollection.id))
            .sort((a, b) => a.sku.localeCompare(b.sku, undefined, { numeric: true }));
    }, [selectedCollection, allProducts]);

    const visibleCollectionProducts = useMemo(() => {
        if (!collectionSearch.trim()) return productsInSelectedCollection;
        const q = collectionSearch.toLowerCase();
        return productsInSelectedCollection.filter((p) =>
            p.sku.toLowerCase().includes(q)
            || (p.category || '').toLowerCase().includes(q)
            || (p.description || '').toLowerCase().includes(q)
        );
    }, [productsInSelectedCollection, collectionSearch]);

    const filteredAvailableProducts = useMemo(() => {
        if (!allProducts || !selectedCollection) return [];
        const searchLower = searchTerm.toLowerCase();
        return allProducts.filter((p) =>
            !p.collections?.includes(selectedCollection.id) &&
            (p.sku.toLowerCase().includes(searchLower) || (p.category || '').toLowerCase().includes(searchLower))
        ).sort((a, b) => a.sku.localeCompare(b.sku, undefined, { numeric: true }));
    }, [allProducts, selectedCollection, searchTerm]);

    // Up to 3 preview images + total count per collection (for the gallery cards)
    const collectionPreviewImages = useMemo(() => {
        const map = new Map<number, { images: string[]; total: number }>();
        (allProducts || []).forEach((p) => {
            (p.collections || []).forEach((id) => {
                const entry = map.get(id) || { images: [], total: 0 };
                entry.total += 1;
                if (entry.images.length < 3 && p.image_url) entry.images.push(p.image_url);
                map.set(id, entry);
            });
        });
        return map;
    }, [allProducts]);

    // ── Actions ───────────────────────────────────────────────────────────

    const openCollectionsPanel = () => {
        setCollectionsPanelOpen(true);
        setAddPanelOpen(false);
    };

    const openAddPanel = () => {
        setAddPanelOpen(true);
        setCollectionsPanelOpen(false);
    };

    const handleCreateCollection = async () => {
        const name = newCollectionName.trim();
        if (!name) return;
        try {
            await api.saveCollection(name);
            await queryClient.invalidateQueries({ queryKey: ['collections'] });
            const list = queryClient.getQueryData<Collection[]>(['collections']) || [];
            const created = [...list].reverse().find((c) => c.name === name) || list[list.length - 1];
            if (created) setSelectedCollection(created);
            setNewCollectionName('');
            setCollectionsPanelOpen(false);
            showToast("Η συλλογή δημιουργήθηκε.", "success");
        } catch (e) {
            console.error(e);
            showToast("Σφάλμα δημιουργίας.", "error");
        }
    };

    const handleDeleteCollection = async (id: number) => {
        const yes = await confirm({
            title: 'Διαγραφή Συλλογής',
            message: 'Είστε σίγουροι ότι θέλετε να διαγράψετε αυτή τη συλλογή; Τα προϊόντα δεν θα διαγραφούν.',
            isDestructive: true,
            confirmText: 'Διαγραφή'
        });

        if (yes) {
            try {
                await api.deleteCollection(id);
                queryClient.invalidateQueries({ queryKey: ['collections'] });
                if (selectedCollection?.id === id) {
                    setSelectedCollection(null);
                }
                showToast("Η συλλογή διαγράφηκε.", "info");
            } catch (e) {
                console.error(e);
                showToast("Σφάλμα διαγραφής.", "error");
            }
        }
    };

    const handleToggleProduct = async (sku: string, collectionId: number) => {
        const product = allProducts?.find(p => p.sku === sku);
        if (!product) return;

        const currentCollections = product.collections || [];
        const isInCollection = currentCollections.includes(collectionId);
        const newCollections = isInCollection
            ? currentCollections.filter(id => id !== collectionId)
            : [...currentCollections, collectionId];

        await api.setProductCollections(sku, newCollections);
        invalidateProductsAndCatalog(queryClient);
    };

    const expandSkuRange = (token: string): string[] => {
        const rangeRegex = /^([A-Z-]+)(\d+)([A-Z]*)-([A-Z-]+)(\d+)([A-Z]*)$/i;
        const match = token.match(rangeRegex);

        if (!match) return [token];

        const [, prefix1, num1Str, suffix1, prefix2, num2Str, suffix2] = match;

        if (prefix1.toUpperCase() !== prefix2.toUpperCase() || suffix1.toUpperCase() !== suffix2.toUpperCase()) {
            return [token];
        }

        const start = parseInt(num1Str, 10);
        const end = parseInt(num2Str, 10);

        if (start > end) return [token];

        if (end - start > 1000) return [token];

        const expanded: string[] = [];
        const paddingLength = num1Str.length;
        const shouldPad = num1Str.startsWith('0') || num1Str.length > 1;

        for (let i = start; i <= end; i++) {
            let numPart = i.toString();
            if (shouldPad) {
                numPart = numPart.padStart(paddingLength, '0');
            }
            expanded.push(`${prefix1.toUpperCase()}${numPart}${suffix1.toUpperCase()}`);
        }

        return expanded;
    };

    const handleBulkAdd = async () => {
        if (!selectedCollection || !allProducts || !bulkSkus.trim()) return;

        setIsBulkAdding(true);
        const lines = bulkSkus.split(/[\n, ]+/).filter(x => x.trim().length > 0);

        const expandedSkus: string[] = [];
        lines.forEach(token => {
            const result = expandSkuRange(token.trim().toUpperCase());
            expandedSkus.push(...result);
        });

        let foundCount = 0;
        let notFoundCount = 0;
        const newAssociations: { product_sku: string, collection_id: number }[] = [];

        try {
            const uniqueSkus = Array.from(new Set(expandedSkus));

            for (const sku of uniqueSkus) {
                const product = allProducts.find(p => p.sku === sku);

                if (product) {
                    foundCount++;
                    if (!product.collections?.includes(selectedCollection.id)) {
                        newAssociations.push({ product_sku: sku, collection_id: selectedCollection.id });
                    }
                } else {
                    notFoundCount++;
                }
            }

            if (newAssociations.length > 0) {
                await api.addProductsToCollection(newAssociations);
                await invalidateProductsAndCatalog(queryClient);
                setBulkSkus('');
                showToast(`Προστέθηκαν ${foundCount} κωδικοί.`, 'success');
            } else if (foundCount > 0) {
                showToast(`Οι ${foundCount} κωδικοί βρίσκονται ήδη στη συλλογή.`, 'info');
            }

            if (notFoundCount > 0) {
                showToast(`${notFoundCount} κωδικοί δεν βρέθηκαν.`, 'warning');
            }

        } catch (e) {
            console.error(e);
            showToast("Σφάλμα κατά την μαζική προσθήκη.", "error");
        } finally {
            setIsBulkAdding(false);
        }
    };

    const handlePrintCollection = () => {
        if (!selectedCollection || !onPrint || !productsInSelectedCollection.length) return;

        const dateStr = new Date().toLocaleDateString('el-GR');

        const items = productsInSelectedCollection.map(p => {
            const variantMap: Record<string, number> = {};
            if (p.variants && p.variants.length > 0) {
                p.variants.forEach(v => {
                    const price = v.selling_price || p.selling_price || 0;
                    if (price > 0) variantMap[v.suffix] = price;
                });
            } else if ((p.selling_price || 0) > 0) {
                variantMap[''] = p.selling_price;
            }

            const priceToSuffixes: Record<number, string[]> = {};
            Object.entries(variantMap).forEach(([suffix, price]) => {
                if (!priceToSuffixes[price]) priceToSuffixes[price] = [];
                priceToSuffixes[price].push(suffix);
            });

            const priceGroups = Object.entries(priceToSuffixes).map(([priceStr, suffixes]) => ({
                price: parseFloat(priceStr),
                suffixes: suffixes.sort()
            })).sort((a, b) => a.price - b.price);

            return {
                skuBase: p.sku,
                category: p.category,
                priceGroups
            };
        }).sort((a, b) => a.skuBase.localeCompare(b.skuBase, undefined, { numeric: true }));

        onPrint({
            title: `Collection: ${selectedCollection.name}`,
            subtitle: `${items.length} Κωδικοί`,
            date: dateStr,
            items: items
        });
    };

    const handleGenerateDescription = async () => {
        if (!selectedCollection || !productsInSelectedCollection.length) {
            showToast("Προσθέστε προϊόντα στη συλλογή πρώτα.", "info");
            return;
        }

        setIsGeneratingDesc(true);
        try {
            const text = await generateCollectionDescription(
                selectedCollection.name,
                productsInSelectedCollection,
                aiGuidance
            );
            setCollectionDesc(text);
            showToast("Η περιγραφή δημιουργήθηκε!", "success");
        } catch (e: any) {
            showToast(`Σφάλμα: ${e.message}`, "error");
        } finally {
            setIsGeneratingDesc(false);
        }
    };

    const handleSaveDescription = async () => {
        if (!selectedCollection) return;
        try {
            await api.updateCollection(selectedCollection.id, { description: collectionDesc });
            queryClient.invalidateQueries({ queryKey: ['collections'] });

            // Update local selected collection to reflect change immediately in UI
            setSelectedCollection(prev => prev ? ({ ...prev, description: collectionDesc }) : null);

            showToast("Η περιγραφή αποθηκεύτηκε.", "success");
            setIsDescModalOpen(false);
        } catch (e) {
            showToast("Σφάλμα αποθήκευσης.", "error");
        }
    };

    // ── Loading / Error ────────────────────────────────────────────────────

    if (loadingCollections) {
        return <IliosLoader variant="section" detail="Συλλογές" />;
    }

    if (isError) {
        return (
            <div className="max-w-7xl mx-auto space-y-6">
                <DesktopPageHeader
                    icon={FolderKanban}
                    title="Συλλογές"
                    subtitle="Οργανώστε τα προϊόντα σε ομάδες για εύκολη εκτύπωση και οργάνωση."
                />
                <div className="bg-red-50 border-l-4 border-red-500 text-red-700 p-6 rounded-r-xl" role="alert">
                    <p className="font-bold mb-2">Σφάλμα!</p>
                    <p>Δεν ήταν δυνατή η φόρτωση των συλλογών.</p>
                    <p className="text-sm mt-4 font-mono bg-red-100/50 p-2 rounded">{(error as Error).message}</p>
                </div>
            </div>
        );
    }

    const collectionList = collections || [];
    const panelToggleBase = 'flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-all duration-200 active:scale-95';

    return (
        <div className="max-w-7xl mx-auto space-y-5 h-[calc(100vh-120px)] flex flex-col">
            {/* ── PAGE HEADER ─────────────────────────────────────────────── */}
            <DesktopPageHeader
                icon={FolderKanban}
                title="Συλλογές"
                subtitle="Οργανώστε τον κατάλογο σε ομάδες για παρουσίαση και εκτύπωση."
                tailClassName="flex w-full min-w-0 flex-1 flex-wrap items-center gap-2.5 lg:ml-auto lg:max-w-none lg:justify-end"
                tail={
                    <div className="flex flex-wrap items-center gap-2.5">
                        {/* Live stats */}
                        <div className="hidden md:flex items-center gap-2.5 rounded-2xl bg-slate-50 border border-slate-200/70 px-4 py-2">
                            <div className="flex items-center gap-1.5">
                                <FolderKanban size={15} className="text-slate-400" />
                                <span className="text-sm font-black text-slate-700 tabular-nums">{collectionList.length}</span>
                                <span className="text-xs font-bold text-slate-400">συλλογές</span>
                            </div>
                            <div className="h-5 w-px bg-slate-200" />
                            <div className="flex items-center gap-1.5">
                                <Package size={15} className="text-slate-400" />
                                <span className="text-sm font-black text-slate-700 tabular-nums">{productsInAnyCollection}</span>
                                <span className="text-xs font-bold text-slate-400">προϊόντα</span>
                            </div>
                        </div>

                        {/* Collections toggle */}
                        <button
                            type="button"
                            aria-expanded={collectionsPanelOpen}
                            aria-controls="collections-panel"
                            onClick={() => collectionsPanelOpen ? setCollectionsPanelOpen(false) : openCollectionsPanel()}
                            className={`${panelToggleBase} ${collectionsPanelOpen
                                ? 'bg-[#060b00] text-white shadow-lg ring-1 ring-slate-900/10'
                                : 'bg-white border border-slate-200 text-slate-700 hover:border-slate-300 hover:shadow-sm'
                            }`}
                        >
                            <FolderKanban size={16} className={collectionsPanelOpen ? 'text-white' : 'text-slate-400'} />
                            <span className="hidden sm:inline">Συλλογές</span>
                            <span className={`min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-black flex items-center justify-center ${collectionsPanelOpen ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'}`}>
                                {collectionList.length}
                            </span>
                            <ChevronDown size={15} className={`transition-transform duration-200 ${collectionsPanelOpen ? 'rotate-180' : ''}`} />
                        </button>

                        {/* Add products toggle */}
                        <button
                            type="button"
                            aria-expanded={addPanelOpen}
                            aria-controls="add-products-panel"
                            onClick={() => addPanelOpen ? setAddPanelOpen(false) : openAddPanel()}
                            className={`${panelToggleBase} ${addPanelOpen
                                ? 'bg-emerald-600 text-white shadow-lg ring-1 ring-emerald-700/20'
                                : 'bg-white border border-emerald-200 text-emerald-700 hover:border-emerald-300 hover:bg-emerald-50/60 hover:shadow-sm'
                            }`}
                        >
                            <PackagePlus size={16} className={addPanelOpen ? 'text-white' : 'text-emerald-600'} />
                            <span className="hidden sm:inline">Προσθήκη Προϊόντων</span>
                            <span className="sm:hidden">Προσθήκη</span>
                            <ChevronDown size={15} className={`transition-transform duration-200 ${addPanelOpen ? 'rotate-180' : ''}`} />
                        </button>

                        {/* Print */}
                        {selectedCollection && onPrint && productsInSelectedCollection.length > 0 && (
                            <button
                                onClick={handlePrintCollection}
                                className="flex items-center gap-2 rounded-xl bg-[#060b00] text-white px-4 py-2.5 text-sm font-bold shadow-lg hover:bg-slate-800 hover:-translate-y-0.5 transition-all active:scale-95"
                            >
                                <Printer size={16} /> Εκτύπωση
                            </button>
                        )}
                    </div>
                }
            />

            {/* ── COLLECTIONS PANEL (Νέα Συλλογή / Λίστα Συλλογών) ─────────── */}
            {collectionsPanelOpen && (
                <div id="collections-panel" className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden animate-in fade-in slide-in-from-top-3 duration-300">
                    <div className="flex items-center justify-between gap-3 px-5 sm:px-6 pt-5 pb-1">
                        <div className="flex items-center gap-2 text-slate-700">
                            <FolderKanban size={16} className="text-slate-400" />
                            <h3 className="text-sm font-black uppercase tracking-wider">Διαχείριση Συλλογών</h3>
                        </div>
                        <button
                            type="button"
                            aria-label="Κλείσιμο πίνακα συλλογών"
                            onClick={() => setCollectionsPanelOpen(false)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                        >
                            <X size={16} />
                        </button>
                    </div>
                    <div className="p-5 sm:p-6 pt-4 grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* New collection */}
                        <div className="flex flex-col">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 flex items-center gap-1.5">
                                <Plus size={12} /> Νέα Συλλογή
                            </label>
                            <form
                                onSubmit={(e) => { e.preventDefault(); handleCreateCollection(); }}
                                className="flex gap-2"
                            >
                                <input
                                    ref={newCollectionInputRef}
                                    type="text"
                                    value={newCollectionName}
                                    onChange={e => setNewCollectionName(e.target.value)}
                                    placeholder="Όνομα συλλογής..."
                                    className="flex-1 min-w-0 p-3 border border-slate-200 rounded-xl bg-slate-50 text-slate-900 focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all font-medium"
                                />
                                <button
                                    type="submit"
                                    disabled={!newCollectionName.trim()}
                                    className="bg-[#060b00] text-white px-4 rounded-xl hover:bg-slate-800 transition-colors shadow-md active:scale-95 flex items-center gap-1.5 text-sm font-bold disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                    <Plus size={16} /> <span className="hidden sm:inline">Δημιουργία</span>
                                </button>
                            </form>
                            <p className="mt-2 text-[11px] font-medium text-slate-400">
                                Δημιουργήστε μια νέα ομάδα προϊόντων — θα ανοίξει αυτόματα για να προσθέσετε κωδικούς.
                            </p>
                        </div>

                        {/* Collection list */}
                        <div className="flex flex-col min-h-0">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 flex items-center gap-1.5">
                                <Layers size={12} /> Λίστα Συλλογών
                                <span className="ml-1 bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full text-[9px]">{collectionList.length}</span>
                            </label>
                            <div className="flex-1 max-h-56 overflow-y-auto custom-scrollbar -mr-1.5 pr-1.5 space-y-1">
                                {collectionList.map(c => {
                                    const count = collectionProductCounts.get(c.id) || 0;
                                    const isSelected = selectedCollection?.id === c.id;
                                    return (
                                        <div
                                            key={c.id}
                                            onClick={() => { setSelectedCollection(c); setCollectionsPanelOpen(false); }}
                                            className={`group flex items-center gap-3 w-full p-2.5 rounded-xl cursor-pointer transition-all border ${
                                                isSelected
                                                    ? 'bg-blue-50 border-blue-200 ring-1 ring-blue-100'
                                                    : 'border-transparent hover:bg-slate-50 hover:border-slate-100'
                                            }`}
                                        >
                                            <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 transition-colors ${isSelected ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400 group-hover:text-slate-600'}`}>
                                                <FolderKanban size={16} />
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <div className={`text-sm font-bold truncate ${isSelected ? 'text-blue-900' : 'text-slate-700'}`}>{c.name}</div>
                                                {c.description && <div className="text-[10px] text-slate-400 truncate">{c.description}</div>}
                                            </div>
                                            <span className={`shrink-0 text-[10px] font-black px-1.5 py-0.5 rounded-full ${count > 0 ? 'bg-slate-100 text-slate-500' : 'text-slate-300'}`}>
                                                {count}
                                            </span>
                                            <button
                                                type="button"
                                                onClick={(e) => { e.stopPropagation(); handleDeleteCollection(c.id); }}
                                                className="shrink-0 p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                                                title="Διαγραφή συλλογής"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    );
                                })}
                                {collectionList.length === 0 && (
                                    <div className="text-center py-8 text-slate-400 text-sm italic">
                                        Δεν υπάρχουν συλλογές ακόμα — δημιουργήστε την πρώτη.
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── ADD PRODUCTS PANEL (Επιλογή από Μητρώο / Μαζική εισαγωγή) ─── */}
            {addPanelOpen && (
                <div id="add-products-panel" className="bg-white rounded-3xl border border-emerald-100 shadow-sm overflow-hidden animate-in fade-in slide-in-from-top-3 duration-300">
                    <div className="flex items-center justify-between gap-3 px-5 sm:px-6 pt-5 pb-1">
                        <div className="flex items-center gap-2 text-emerald-800">
                            <PackagePlus size={16} className="text-emerald-600" />
                            <h3 className="text-sm font-black uppercase tracking-wider">Προσθήκη Προϊόντων</h3>
                            {selectedCollection && (
                                <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-100 px-2.5 py-0.5 text-[10px] font-black text-emerald-700">
                                    <FolderKanban size={10} /> {selectedCollection.name}
                                </span>
                            )}
                        </div>
                        <button
                            type="button"
                            aria-label="Κλείσιμο πίνακα προσθήκης προϊόντων"
                            onClick={() => setAddPanelOpen(false)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                        >
                            <X size={16} />
                        </button>
                    </div>

                    {!selectedCollection ? (
                        <div className="p-6 pt-4 flex flex-col sm:flex-row sm:items-center gap-3 bg-emerald-50/40">
                            <p className="text-sm font-bold text-slate-600 flex items-center gap-2">
                                <Info size={16} className="text-emerald-600 shrink-0" />
                                Επιλέξτε πρώτα μια συλλογή για να προσθέσετε προϊόντα.
                            </p>
                            <button
                                type="button"
                                onClick={openCollectionsPanel}
                                className="shrink-0 bg-[#060b00] text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-slate-800 transition-colors shadow-md"
                            >
                                Άνοιγμα Συλλογών
                            </button>
                        </div>
                    ) : (
                        <div className="p-5 sm:p-6 pt-4 grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {/* Registry picker */}
                            <div className="space-y-3">
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
                                    <Search size={12} /> Επιλογή από Μητρώο
                                </label>
                                <div className="relative">
                                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                    <input
                                        type="text"
                                        placeholder="Αναζήτηση με κωδικό ή κατηγορία..."
                                        value={searchTerm}
                                        onChange={e => setSearchTerm(e.target.value)}
                                        className="w-full pl-11 pr-9 p-3 border border-slate-200 rounded-xl bg-white text-sm font-medium outline-none transition-all focus:ring-2 focus:ring-emerald-500/15 focus:border-emerald-400"
                                    />
                                    {searchTerm && (
                                        <button
                                            type="button"
                                            onClick={() => setSearchTerm('')}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                                        >
                                            <X size={14} />
                                        </button>
                                    )}
                                </div>
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 max-h-56 overflow-y-auto custom-scrollbar p-0.5">
                                    {filteredAvailableProducts.map(p => (
                                        <button
                                            key={p.sku}
                                            type="button"
                                            onClick={() => handleToggleProduct(p.sku, selectedCollection.id)}
                                            className="group flex items-center gap-2.5 p-2 bg-white border border-slate-100 rounded-xl hover:border-emerald-300 hover:shadow-md transition-all text-left"
                                        >
                                            <div className="w-9 h-9 bg-slate-50 rounded-lg overflow-hidden shrink-0 border border-slate-100 flex items-center justify-center">
                                                {p.image_url
                                                    ? <img src={p.image_url} alt={p.sku} className="w-full h-full object-cover" />
                                                    : <ImageOff size={14} className="text-slate-300" />}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <div className="text-xs font-black text-slate-800 truncate font-mono">{p.sku}</div>
                                                <div className="relative h-[14px] overflow-hidden">
                                                    <div className={`absolute inset-0 text-[9px] text-slate-400 truncate transition-transform duration-200 ${searchTerm ? '' : 'group-hover:-translate-y-[14px]'}`}>
                                                        {p.category || '—'}
                                                    </div>
                                                    <div className={`absolute inset-0 text-[9px] font-bold text-emerald-600 truncate transition-transform duration-200 ${searchTerm ? 'opacity-0' : 'translate-y-[14px] group-hover:translate-y-0'}`}>
                                                        ΠΡΟΣΘΗΚΗ +
                                                    </div>
                                                </div>
                                            </div>
                                        </button>
                                    ))}
                                    {filteredAvailableProducts.length === 0 && (
                                        <div className="col-span-full text-center text-xs text-slate-400 py-6">
                                            {searchTerm ? 'Δεν βρέθηκαν αποτελέσματα.' : 'Όλα τα προϊόντα του μητρώου βρίσκονται ήδη στη συλλογή.'}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Bulk import */}
                            <div className="bg-blue-50/60 p-4 rounded-2xl border border-blue-100 space-y-3 h-fit">
                                <label className="text-[10px] font-black uppercase tracking-widest text-blue-900 flex items-center gap-1.5">
                                    <ScanBarcode size={13} /> Μαζική Εισαγωγή
                                </label>
                                <textarea
                                    value={bulkSkus}
                                    onChange={e => setBulkSkus(e.target.value)}
                                    placeholder={`Επικολλήστε κωδικούς (π.χ. από Excel)...\nDA100\nXR2020\nMN050S-MN063S`}
                                    className="w-full p-4 text-xs font-mono border border-blue-200 rounded-xl bg-white focus:ring-4 focus:ring-blue-500/10 focus:border-blue-400 outline-none transition-all h-32 resize-none"
                                />
                                <button
                                    type="button"
                                    onClick={handleBulkAdd}
                                    disabled={isBulkAdding || !bulkSkus.trim()}
                                    className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-blue-700 transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.99]"
                                >
                                    {isBulkAdding ? <Loader2 size={16} className="animate-spin" /> : <PackagePlus size={16} />}
                                    {isBulkAdding ? 'Προσθήκη...' : 'Μαζική Προσθήκη'}
                                </button>
                                <p className="text-[10px] text-blue-600/80 italic font-medium">
                                    Υποστηρίζονται διαστήματα κωδικών (π.χ. <span className="font-mono font-bold">MN050S-MN063S</span>) και διαχωρισμός με κόμμα, κενό ή νέα γραμμή.
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ── MAIN CONTENT ────────────────────────────────────────────── */}
            <div className="flex-1 min-h-0">
                {!selectedCollection ? (
                    /* GALLERY LANDING — compact, no hero: pick a collection card or create one */
                    <div className="h-full overflow-y-auto custom-scrollbar pr-1">
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                            {/* New collection card (single create affordance) */}
                            <button
                                type="button"
                                onClick={openCollectionsPanel}
                                className={`group flex flex-col items-center justify-center gap-3 rounded-3xl border-2 border-dashed border-slate-200 bg-white/60 text-slate-400 hover:text-[#060b00] hover:border-slate-300 hover:bg-white hover:shadow-md transition-all ${collectionList.length === 0 ? 'sm:col-span-2 lg:col-span-3 xl:col-span-4 min-h-[240px]' : 'min-h-[200px]'}`}
                            >
                                <div className="w-12 h-12 rounded-2xl bg-slate-100 group-hover:bg-[#060b00] group-hover:text-white flex items-center justify-center transition-colors">
                                    <FolderPlus size={22} />
                                </div>
                                <span className="text-sm font-black">Νέα Συλλογή</span>
                                <span className="text-[11px] font-medium text-slate-400">
                                    {collectionList.length === 0 ? 'Ξεκινήστε με την πρώτη σας συλλογή' : 'Δημιουργήστε και ξεκινήστε'}
                                </span>
                            </button>

                            {collectionList.map(c => {
                                const count = collectionProductCounts.get(c.id) || 0;
                                const preview = collectionPreviewImages.get(c.id) || { images: [], total: 0 };
                                return (
                                    <button
                                        key={c.id}
                                        type="button"
                                        onClick={() => setSelectedCollection(c)}
                                        className="group text-left bg-white rounded-3xl border border-slate-100 shadow-sm p-6 hover:shadow-xl hover:-translate-y-1 hover:border-slate-200 transition-all"
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="p-3.5 rounded-2xl bg-slate-50 text-slate-400 group-hover:bg-[#060b00] group-hover:text-white transition-colors">
                                                <FolderKanban size={22} />
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className={`shrink-0 text-[10px] font-black px-2 py-1 rounded-full ${count > 0 ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-slate-50 text-slate-400 border border-slate-100'}`}>
                                                    {count} {count === 1 ? 'προϊόν' : 'προϊόντα'}
                                                </span>
                                                <ArrowRight size={15} className="text-slate-200 group-hover:text-[#060b00] group-hover:translate-x-1 opacity-0 group-hover:opacity-100 transition-all" />
                                            </div>
                                        </div>
                                        <h3 className="mt-4 text-lg font-black text-slate-900 tracking-tight truncate">{c.name}</h3>
                                        <p className="mt-1 text-xs font-medium text-slate-500 line-clamp-2">
                                            {c.description || 'Χωρίς περιγραφή.'}
                                        </p>
                                        <div className="mt-4 flex items-center gap-1.5">
                                            {preview.images.map((src, i) => (
                                                <div key={i} className="w-10 h-10 rounded-lg border border-slate-100 overflow-hidden bg-slate-50 shadow-sm">
                                                    <img src={src} alt="" loading="lazy" className="w-full h-full object-cover" />
                                                </div>
                                            ))}
                                            {preview.total > 3 && (
                                                <div className="w-10 h-10 rounded-lg border border-slate-100 bg-slate-50 flex items-center justify-center text-[10px] font-black text-slate-500 shadow-sm">
                                                    +{preview.total - 3}
                                                </div>
                                            )}
                                            {preview.images.length === 0 && (
                                                <div className="h-10 flex items-center text-[10px] font-bold text-slate-300 italic">
                                                    {preview.total === 0 ? 'Κενή συλλογή' : 'Χωρίς φωτογραφίες'}
                                                </div>
                                            )}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                ) : (
                    /* COLLECTION WORKSPACE */
                    <div ref={workspaceScrollRef} className="h-full overflow-y-auto custom-scrollbar pr-1 space-y-5">
                        {/* Toolbar */}
                        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5 sm:p-6 sticky top-0 z-10">
                            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                                <div className="flex min-w-0 items-center gap-3.5">
                                    <button
                                        type="button"
                                        onClick={() => setSelectedCollection(null)}
                                        title="Πίσω στις συλλογές"
                                        aria-label="Πίσω στις συλλογές"
                                        className="shrink-0 w-10 h-10 rounded-xl border border-slate-200 bg-slate-50 text-slate-500 hover:text-[#060b00] hover:border-slate-300 hover:bg-white flex items-center justify-center transition-all"
                                    >
                                        <ArrowLeft size={18} />
                                    </button>
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                                            <span className="bg-blue-100 text-blue-700 text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-wide">Συλλογή</span>
                                            <span className="text-xs font-bold text-slate-400">
                                                {productsInSelectedCollection.length} {productsInSelectedCollection.length === 1 ? 'προϊόν' : 'προϊόντα'}
                                            </span>
                                        </div>
                                        <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight truncate">{selectedCollection.name}</h2>
                                    </div>
                                </div>

                                <div className="flex flex-wrap items-center gap-2.5">
                                    <div className="relative min-w-[180px] flex-1 lg:flex-none lg:w-64">
                                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                                        <input
                                            type="text"
                                            placeholder="Αναζήτηση στη συλλογή..."
                                            value={collectionSearch}
                                            onChange={e => setCollectionSearch(e.target.value)}
                                            className="w-full pl-10 pr-9 p-2.5 border border-slate-200 rounded-xl bg-slate-50 text-sm font-medium outline-none transition-all focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 focus:bg-white"
                                        />
                                        {collectionSearch && (
                                            <button
                                                type="button"
                                                onClick={() => setCollectionSearch('')}
                                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                                            >
                                                <X size={14} />
                                            </button>
                                        )}
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setIsDescModalOpen(true)}
                                        className="flex items-center gap-2 bg-white border border-slate-200 text-slate-600 px-4 py-2.5 rounded-xl text-sm font-bold hover:border-purple-300 hover:text-purple-600 hover:shadow-md transition-all"
                                    >
                                        <Sparkles size={15} className="text-purple-500" />
                                        <span className="hidden sm:inline">{selectedCollection.description ? 'Επεξεργασία / AI' : 'Περιγραφή / AI'}</span>
                                        <span className="sm:hidden">AI</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={openAddPanel}
                                        className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2.5 rounded-xl text-sm font-bold shadow-md hover:bg-emerald-700 hover:-translate-y-0.5 transition-all active:scale-95"
                                    >
                                        <PackagePlus size={16} /> <span className="hidden sm:inline">Προσθήκη Προϊόντων</span>
                                        <span className="sm:hidden">Προσθήκη</span>
                                    </button>
                                    {onPrint && productsInSelectedCollection.length > 0 && (
                                        <button
                                            type="button"
                                            onClick={handlePrintCollection}
                                            className="flex items-center gap-2 bg-[#060b00] text-white px-4 py-2.5 rounded-xl text-sm font-bold shadow-lg hover:bg-slate-800 hover:-translate-y-0.5 transition-all active:scale-95"
                                        >
                                            <Printer size={16} /> <span className="hidden sm:inline">Εκτύπωση</span>
                                            <span className="sm:hidden">Εκτύπ.</span>
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Description hero */}
                        <div className="bg-gradient-to-br from-slate-50 to-white p-8 rounded-[2rem] border border-slate-100 relative overflow-hidden group hover:border-slate-200 transition-colors">
                            <div className="absolute top-0 right-0 p-6 opacity-5 pointer-events-none group-hover:opacity-10 transition-opacity">
                                <Quote size={120} className="text-slate-900" />
                            </div>
                            <div className="relative z-10 flex flex-col items-center text-center max-w-2xl mx-auto">
                                {selectedCollection.description ? (
                                    <p className="text-lg text-slate-700 font-serif italic leading-relaxed mb-6">
                                        "{selectedCollection.description}"
                                    </p>
                                ) : (
                                    <p className="text-slate-400 text-sm italic mb-6">Δεν έχει οριστεί περιγραφή για αυτή τη συλλογή.</p>
                                )}
                                <button
                                    type="button"
                                    onClick={() => setIsDescModalOpen(true)}
                                    className="flex items-center gap-2 bg-white border border-slate-200 text-slate-600 px-5 py-2.5 rounded-full text-xs font-bold hover:border-purple-300 hover:text-purple-600 hover:shadow-md transition-all shadow-sm"
                                >
                                    <Sparkles size={14} /> {selectedCollection.description ? 'Επεξεργασία / AI' : 'Δημιουργία Περιεχομένου'}
                                </button>
                            </div>
                        </div>

                        {/* Products */}
                        <div>
                            <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
                                <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wide flex items-center gap-2">
                                    <FileText size={16} className="text-slate-400" /> Περιεχόμενα
                                    <span
                                        title={collectionSearch ? 'Αποτελέσματα τρέχουσας αναζήτησης' : 'Σύνολο προϊόντων στη συλλογή'}
                                        className="bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full text-[10px] font-black"
                                    >
                                        {visibleCollectionProducts.length}
                                    </span>
                                </h3>
                                {collectionSearch && (
                                    <span className="text-[11px] font-bold text-slate-400">
                                        Αποτελέσματα για «{collectionSearch}»
                                    </span>
                                )}
                            </div>

                            {visibleCollectionProducts.length > 0 ? (
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                                    {visibleCollectionProducts.map(p => (
                                        <div
                                            key={p.sku}
                                            onClick={() => setViewProduct(p)}
                                            className="relative group bg-white border border-slate-100 rounded-2xl p-3 shadow-sm hover:shadow-lg transition-all text-center hover:-translate-y-1 cursor-pointer"
                                        >
                                            <button
                                                type="button"
                                                onClick={(e) => { e.stopPropagation(); handleToggleProduct(p.sku, selectedCollection.id); }}
                                                className="absolute top-2 right-2 z-10 bg-white/90 text-slate-400 hover:text-red-500 p-1 rounded-full shadow-sm border border-slate-100 opacity-0 group-hover:opacity-100 transition-all hover:bg-red-50"
                                                title="Αφαίρεση από τη συλλογή"
                                            >
                                                <X size={14} />
                                            </button>

                                            <div className="aspect-square bg-slate-50 rounded-xl mb-3 overflow-hidden border border-slate-50 relative flex items-center justify-center">
                                                {p.image_url ? (
                                                    <img src={p.image_url} alt={p.sku} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                                                ) : (
                                                    <ImageOff size={22} className="text-slate-300" />
                                                )}
                                            </div>
                                            <p className="text-xs font-black text-slate-800 truncate font-mono">{p.sku}</p>
                                            <p className="text-[10px] text-slate-500 truncate">{p.category}</p>
                                            <div className="mt-1.5 flex items-center justify-center gap-1.5">
                                                {(p.selling_price || 0) > 0 && (
                                                    <span className="text-[11px] font-black text-emerald-600">{formatCurrency(p.selling_price)}</span>
                                                )}
                                                {(p.variants?.length || 0) > 0 && (
                                                    <span className="text-[9px] font-bold text-slate-300">· {p.variants!.length} παραλ.</span>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-center py-14 border-2 border-dashed border-slate-200 rounded-3xl bg-slate-50/50">
                                    <div className="mx-auto w-14 h-14 rounded-2xl bg-white border border-slate-100 shadow-sm flex items-center justify-center mb-4">
                                        {collectionSearch ? <Search size={22} className="text-slate-300" /> : <FolderKanban size={22} className="text-slate-300" />}
                                    </div>
                                    <p className="text-slate-500 text-sm font-black">
                                        {collectionSearch ? 'Δεν βρέθηκαν προϊόντα.' : 'Η συλλογή είναι άδεια.'}
                                    </p>
                                    <p className="text-xs text-slate-400 font-medium mt-1">
                                        {collectionSearch
                                            ? 'Δοκιμάστε άλλη αναζήτηση.'
                                            : 'Προσθέστε προϊόντα από το μητρώο ή με μαζική εισαγωγή.'}
                                    </p>
                                    {!collectionSearch && (
                                        <button
                                            type="button"
                                            onClick={openAddPanel}
                                            className="mt-5 inline-flex items-center gap-2 bg-[#060b00] text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-lg hover:bg-slate-800 hover:-translate-y-0.5 transition-all"
                                        >
                                            <PackagePlus size={16} /> Προσθήκη Προϊόντων
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* DESCRIPTION AI MODAL */}
            {isDescModalOpen && selectedCollection && (
                <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
                    <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                            <div>
                                <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
                                    <Sparkles className="text-purple-500" size={20} /> Διαχείριση Περιεχομένου
                                </h3>
                                <p className="text-xs text-slate-500 font-medium">Storytelling & Marketing Copy</p>
                            </div>
                            <button onClick={() => setIsDescModalOpen(false)} className="p-2 hover:bg-slate-200 rounded-full text-slate-500 transition-colors"><X size={20} /></button>
                        </div>

                        <div className="p-8 space-y-6 flex-1 overflow-y-auto">
                            {/* AI Control */}
                            <div className="bg-purple-50 p-5 rounded-2xl border border-purple-100 space-y-3">
                                <label className="text-xs font-bold text-purple-800 uppercase tracking-wide flex items-center gap-2">
                                    <Wand2 size={14} /> AI Generator
                                </label>
                                <div className="flex gap-3">
                                    <input
                                        type="text"
                                        value={aiGuidance}
                                        onChange={e => setAiGuidance(e.target.value)}
                                        placeholder="Π.χ. 'Καλοκαιρινή διάθεση', 'Πολυτέλεια', 'Minimal'..."
                                        className="flex-1 p-3 border border-purple-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-purple-500/20 outline-none"
                                    />
                                    <button
                                        onClick={handleGenerateDescription}
                                        disabled={isGeneratingDesc || productsInSelectedCollection.length === 0}
                                        className="bg-purple-600 text-white px-5 rounded-xl font-bold text-xs shadow-md hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                    >
                                        {isGeneratingDesc ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                                        {isGeneratingDesc ? 'Δημιουργία...' : 'Δημιουργία'}
                                    </button>
                                </div>
                                <p className="text-[10px] text-purple-600/70 italic ml-1">
                                    Το AI θα αναλύσει τα {productsInSelectedCollection.length} προϊόντα της συλλογής για να γράψει το κείμενο.
                                </p>
                            </div>

                            {/* Editor */}
                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2 block flex items-center gap-2">
                                    <PenTool size={14} /> Κείμενο Περιγραφής
                                </label>
                                <textarea
                                    value={collectionDesc}
                                    onChange={e => setCollectionDesc(e.target.value)}
                                    className="w-full p-5 border border-slate-200 rounded-2xl bg-white focus:ring-4 focus:ring-slate-100 outline-none text-slate-700 leading-relaxed font-serif text-base h-48 resize-none shadow-inner"
                                    placeholder="Γράψτε εδώ ή χρησιμοποιήστε το AI..."
                                />
                            </div>
                        </div>

                        <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
                            <button onClick={() => setIsDescModalOpen(false)} className="px-6 py-3 rounded-xl font-bold text-slate-600 hover:bg-slate-200 transition-colors">
                                Ακύρωση
                            </button>
                            <button onClick={handleSaveDescription} className="px-8 py-3 rounded-xl bg-slate-900 text-white font-bold hover:bg-black transition-colors shadow-lg flex items-center gap-2">
                                <Save size={18} /> Αποθήκευση
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* PRODUCT DETAILS MODAL */}
            {viewProduct && settings && materials && molds && (
                <ProductDetails
                    product={viewProduct}
                    allProducts={allProducts || []}
                    allMaterials={materials}
                    onClose={() => setViewProduct(null)}
                    setPrintItems={() => {}}
                    settings={settings}
                    collections={collections || []}
                    allMolds={molds}
                />
            )}

        </div>
    );
}
