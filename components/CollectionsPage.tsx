import { useRestartDraft } from '../hooks/useRestartBlocker';
import { formatNumber } from '../utils/numberFormat';
import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Collection, Product } from '../types';
import {
    FolderKanban, Plus, Trash2, X, Search, Loader2, Printer, ScanBarcode,
    PackagePlus, Sparkles, Save, Wand2, PenTool, ArrowLeft, ArrowRight,
    Package, ImageOff, Pencil, Check, ArrowDownAZ, ArrowDownWideNarrow, Database, Layers, Link2,
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
import PageErrorState from './ui/PageErrorState';
import ImageZoomButton from './products/ImageZoomButton';
import LinkedProductsBadge from './products/LinkedProductsBadge';
import LinkedProductsStrip from './products/LinkedProductsStrip';
import { useProductQuickViews } from './products/useProductQuickViews';
import { productToFanItem } from './products/productFanItems';
import { getLinkedSkus, useProductLinkIndex } from '../features/products/productLinks';

interface Props {
    products?: Product[];
    onPrint?: (data: PriceListPrintData) => void;
}

type GallerySort = 'name' | 'size';
type AddMode = 'registry' | 'bulk';

/** Max registry results rendered at once — keeps the picker fast on large catalogs. */
const REGISTRY_LIMIT = 60;
const PREVIEW_IMAGES = 4;

const productCountLabel = (n: number) => `${formatNumber(n)} ${n === 1 ? 'προϊόν' : 'προϊόντα'}`;

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

/** Search input with leading icon and clear button, shared by every search field on the page. */
function SearchField({ value, onChange, placeholder, className = '', inputClassName = '' }: {
    value: string;
    onChange: (v: string) => void;
    placeholder: string;
    className?: string;
    inputClassName?: string;
}) {
    return (
        <div className={`relative ${className}`}>
            <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
            <input
                type="text"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                className={`w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-9 text-sm font-medium text-slate-800 outline-none transition-all placeholder:text-slate-400 focus:border-slate-400 focus:bg-white focus:ring-2 focus:ring-slate-900/10 ${inputClassName}`}
            />
            {value && (
                <button
                    type="button"
                    aria-label="Καθαρισμός αναζήτησης"
                    onClick={() => onChange('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-0.5 text-slate-400 transition-colors hover:bg-slate-200/70 hover:text-slate-600"
                >
                    <X size={14} />
                </button>
            )}
        </div>
    );
}

/** Image mosaic used as the cover of a collection card. */
function CollectionCover({ images, total }: { images: string[]; total: number }) {
    if (images.length === 0) {
        return (
            <div className="flex h-36 flex-col items-center justify-center gap-1.5 bg-gradient-to-br from-slate-50 to-slate-100 text-slate-300">
                {total === 0 ? <FolderKanban size={26} /> : <ImageOff size={24} />}
                <span className="text-[10px] font-bold uppercase tracking-wider">
                    {total === 0 ? 'Κενή συλλογή' : 'Χωρίς φωτογραφίες'}
                </span>
            </div>
        );
    }

    const gridClass = images.length === 1
        ? 'grid-cols-1'
        : images.length === 2
            ? 'grid-cols-2'
            : images.length === 3
                ? 'grid-cols-3'
                : 'grid-cols-2 grid-rows-2';
    const hidden = total - images.length;

    return (
        <div className={`grid h-36 gap-0.5 bg-slate-100 ${gridClass}`}>
            {images.map((src, i) => (
                <div key={i} className="relative overflow-hidden bg-slate-50">
                    <img
                        src={src}
                        alt=""
                        loading="lazy"
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                    {i === images.length - 1 && hidden > 0 && (
                        <div className="absolute inset-0 flex items-center justify-center bg-[#060b00]/45 text-sm font-black text-white backdrop-blur-[1px]">
                            +{formatNumber(hidden)}
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
}

export default function CollectionsPage({ products: allProducts, onPrint }: Props) {
    const queryClient = useQueryClient();
    const { showToast, confirm } = useUI();
    const { data: collections, isLoading: loadingCollections, isError, error } = useQuery<Collection[]>({ queryKey: ['collections'], queryFn: api.getCollections });
    const { data: materials } = useQuery({ queryKey: ['materials'], queryFn: api.getMaterials });
    const { data: molds } = useQuery({ queryKey: ['molds'], queryFn: api.getMolds });
    const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: api.getSettings });

    // Selection is stored by id so the workspace always reflects the latest query data.
    const [selectedId, setSelectedId] = useState<number | null>(null);

    // Gallery
    const [gallerySearch, setGallerySearch] = useState('');
    const [gallerySort, setGallerySort] = useState<GallerySort>('name');
    const [newCollectionName, setNewCollectionName] = useState('');
    const [isCreating, setIsCreating] = useState(false);

    // Workspace
    const [railSearch, setRailSearch] = useState('');
    const [collectionSearch, setCollectionSearch] = useState('');
    const [isRenaming, setIsRenaming] = useState(false);
    const [renameValue, setRenameValue] = useState('');

    // Add products
    const [addPanelOpen, setAddPanelOpen] = useState(false);
    const [addMode, setAddMode] = useState<AddMode>('registry');
    const [registrySearch, setRegistrySearch] = useState('');
    const [bulkSkus, setBulkSkus] = useState('');
    const [isBulkAdding, setIsBulkAdding] = useState(false);
    const [pendingSkus, setPendingSkus] = useState<Set<string>>(() => new Set());

    // Description & AI
    const [isDescModalOpen, setIsDescModalOpen] = useState(false);
    const [collectionDesc, setCollectionDesc] = useState('');
    const [aiGuidance, setAiGuidance] = useState('');
    const [isGeneratingDesc, setIsGeneratingDesc] = useState(false);

    // Product details
    const [viewProduct, setViewProduct] = useState<Product | null>(null);
    useRestartDraft('Συλλογή', { newCollectionName, renameValue: isRenaming ? renameValue : '', bulkSkus: addPanelOpen ? bulkSkus : '', pendingSkus: [...pendingSkus], collectionDesc: isDescModalOpen ? collectionDesc : '', aiGuidance: isDescModalOpen ? aiGuidance : '' }, { busy: isBulkAdding || isGeneratingDesc });


    const workspaceScrollRef = useRef<HTMLDivElement>(null);
    const registrySearchRef = useRef<HTMLInputElement>(null);

    const collectionList = collections || [];
    const selectedCollection = useMemo(
        () => (selectedId == null ? null : collectionList.find((c) => c.id === selectedId) || null),
        [collectionList, selectedId],
    );

    // Reset workspace state whenever the open collection changes
    useEffect(() => {
        setCollectionSearch('');
        setRegistrySearch('');
        setIsRenaming(false);
        workspaceScrollRef.current?.scrollTo({ top: 0 });
    }, [selectedId]);

    // A deleted (or vanished) collection drops the workspace back to the gallery
    useEffect(() => {
        if (selectedId != null && collections && !selectedCollection) {
            setSelectedId(null);
            setAddPanelOpen(false);
        }
    }, [collections, selectedCollection, selectedId]);

    // Focus the registry search when the add panel opens
    useEffect(() => {
        if (addPanelOpen && addMode === 'registry') {
            const t = setTimeout(() => registrySearchRef.current?.focus(), 80);
            return () => clearTimeout(t);
        }
    }, [addPanelOpen, addMode]);

    // Escape closes the innermost open layer (product details handles its own)
    const handleEscape = useCallback(() => {
        if (isDescModalOpen) setIsDescModalOpen(false);
        else if (addPanelOpen) setAddPanelOpen(false);
    }, [isDescModalOpen, addPanelOpen]);
    useEscapeToClose(handleEscape, !!viewProduct || (!isDescModalOpen && !addPanelOpen));

    // ── Derived data ──────────────────────────────────────────────────────

    const collectionStats = useMemo(() => {
        const map = new Map<number, { images: string[]; total: number }>();
        (allProducts || []).forEach((p) => {
            (p.collections || []).forEach((id) => {
                const entry = map.get(id) || { images: [], total: 0 };
                entry.total += 1;
                if (entry.images.length < PREVIEW_IMAGES && p.image_url) entry.images.push(p.image_url);
                map.set(id, entry);
            });
        });
        return map;
    }, [allProducts]);

    const countOf = useCallback((id: number) => collectionStats.get(id)?.total || 0, [collectionStats]);

    const productsInAnyCollection = useMemo(
        () => (allProducts || []).filter((p) => (p.collections || []).length > 0).length,
        [allProducts],
    );

    const sortedCollections = useMemo(() => {
        const list = [...collectionList];
        if (gallerySort === 'size') {
            list.sort((a, b) => countOf(b.id) - countOf(a.id) || a.name.localeCompare(b.name, 'el'));
        } else {
            list.sort((a, b) => a.name.localeCompare(b.name, 'el', { numeric: true }));
        }
        return list;
    }, [collectionList, gallerySort, countOf]);

    const filterCollections = (list: Collection[], term: string) => {
        const q = term.trim().toLowerCase();
        if (!q) return list;
        return list.filter((c) => c.name.toLowerCase().includes(q) || (c.description || '').toLowerCase().includes(q));
    };

    const galleryCollections = useMemo(() => filterCollections(sortedCollections, gallerySearch), [sortedCollections, gallerySearch]);
    const railCollections = useMemo(() => filterCollections(sortedCollections, railSearch), [sortedCollections, railSearch]);

    const productsInSelectedCollection = useMemo(() => {
        if (!selectedCollection || !allProducts) return [];
        return allProducts
            .filter((p) => p.collections?.includes(selectedCollection.id))
            .sort((a, b) => a.sku.localeCompare(b.sku, undefined, { numeric: true }));
    }, [selectedCollection, allProducts]);

    // Συνδεδεμένα Προϊόντα: set-mates of the collection's products that are not in it yet.
    const linkIndex = useProductLinkIndex(allProducts);
    const productsBySku = useMemo(() => new Map((allProducts || []).map((product) => [product.sku, product])), [allProducts]);
    const quickViews = useProductQuickViews<Product>({
        index: linkIndex,
        productsBySku,
        toFanItem: productToFanItem,
        onOpenProduct: setViewProduct,
    });
    const missingSetMates = useMemo(() => {
        if (!selectedCollection) return [];
        const inCollection = new Set(productsInSelectedCollection.map((product) => product.sku));
        const missing = new Map<string, Product>();
        productsInSelectedCollection.forEach((product) => {
            getLinkedSkus(product.sku, linkIndex).forEach((mate) => {
                const mateProduct = productsBySku.get(mate);
                if (mateProduct && !mateProduct.is_component && !inCollection.has(mate)) missing.set(mate, mateProduct);
            });
        });
        return [...missing.values()].sort((a, b) => a.sku.localeCompare(b.sku, undefined, { numeric: true }));
    }, [selectedCollection, productsInSelectedCollection, linkIndex, productsBySku]);
    const [isAddingSetMates, setIsAddingSetMates] = useState(false);

    const visibleCollectionProducts = useMemo(() => {
        const q = collectionSearch.trim().toLowerCase();
        if (!q) return productsInSelectedCollection;
        return productsInSelectedCollection.filter((p) =>
            p.sku.toLowerCase().includes(q)
            || (p.category || '').toLowerCase().includes(q)
            || (p.description || '').toLowerCase().includes(q)
        );
    }, [productsInSelectedCollection, collectionSearch]);

    const availableProducts = useMemo(() => {
        if (!allProducts || !selectedCollection) return [];
        const q = registrySearch.trim().toLowerCase();
        return allProducts.filter((p) =>
            !p.collections?.includes(selectedCollection.id) &&
            (!q || p.sku.toLowerCase().includes(q) || (p.category || '').toLowerCase().includes(q))
        ).sort((a, b) => a.sku.localeCompare(b.sku, undefined, { numeric: true }));
    }, [allProducts, selectedCollection, registrySearch]);

    const visibleAvailableProducts = useMemo(() => availableProducts.slice(0, REGISTRY_LIMIT), [availableProducts]);

    // ── Actions ───────────────────────────────────────────────────────────

    const openCollection = (id: number) => {
        setSelectedId(id);
        setAddPanelOpen(false);
    };

    const backToGallery = () => {
        setSelectedId(null);
        setAddPanelOpen(false);
    };

    const handleCreateCollection = async () => {
        const name = newCollectionName.trim();
        if (!name || isCreating) return;
        setIsCreating(true);
        try {
            await api.saveCollection(name);
            await queryClient.invalidateQueries({ queryKey: ['collections'] });
            const list = queryClient.getQueryData<Collection[]>(['collections']) || [];
            const created = [...list].reverse().find((c) => c.name === name) || list[list.length - 1];
            setNewCollectionName('');
            if (created) {
                setSelectedId(created.id);
                setAddMode('registry');
                setAddPanelOpen(true);
            }
            showToast("Η συλλογή δημιουργήθηκε.", "success");
        } catch (e) {
            console.error(e);
            showToast("Σφάλμα δημιουργίας.", "error");
        } finally {
            setIsCreating(false);
        }
    };

    const handleDeleteCollection = async (collection: Collection) => {
        const yes = await confirm({
            title: 'Διαγραφή Συλλογής',
            message: `Είστε σίγουροι ότι θέλετε να διαγράψετε τη συλλογή «${collection.name}»; Τα προϊόντα δεν θα διαγραφούν.`,
            isDestructive: true,
            confirmText: 'Διαγραφή'
        });

        if (yes) {
            try {
                await api.deleteCollection(collection.id);
                queryClient.invalidateQueries({ queryKey: ['collections'] });
                if (selectedId === collection.id) backToGallery();
                showToast("Η συλλογή διαγράφηκε.", "info");
            } catch (e) {
                console.error(e);
                showToast("Σφάλμα διαγραφής.", "error");
            }
        }
    };

    const startRename = () => {
        if (!selectedCollection) return;
        setRenameValue(selectedCollection.name);
        setIsRenaming(true);
    };

    const handleRename = async () => {
        if (!selectedCollection) return;
        const name = renameValue.trim();
        if (!name || name === selectedCollection.name) {
            setIsRenaming(false);
            return;
        }
        try {
            await api.updateCollection(selectedCollection.id, { name });
            await queryClient.invalidateQueries({ queryKey: ['collections'] });
            setIsRenaming(false);
            showToast("Η συλλογή μετονομάστηκε.", "success");
        } catch (e) {
            console.error(e);
            showToast("Σφάλμα μετονομασίας.", "error");
        }
    };

    const handleToggleProduct = async (sku: string, collectionId: number) => {
        const product = allProducts?.find(p => p.sku === sku);
        if (!product || pendingSkus.has(sku)) return;

        const currentCollections = product.collections || [];
        const isInCollection = currentCollections.includes(collectionId);
        const newCollections = isInCollection
            ? currentCollections.filter(id => id !== collectionId)
            : [...currentCollections, collectionId];

        setPendingSkus((prev) => new Set(prev).add(sku));
        try {
            await api.setProductCollections(sku, newCollections);
            await invalidateProductsAndCatalog(queryClient);
        } catch (e) {
            console.error(e);
            showToast(isInCollection ? "Σφάλμα αφαίρεσης." : "Σφάλμα προσθήκης.", "error");
        } finally {
            setPendingSkus((prev) => {
                const next = new Set(prev);
                next.delete(sku);
                return next;
            });
        }
    };

    const handleAddSetMates = async (skus: string[]) => {
        if (!selectedCollection || skus.length === 0 || isAddingSetMates) return;
        setIsAddingSetMates(true);
        try {
            await api.addProductsToCollection(skus.map((sku) => ({ product_sku: sku, collection_id: selectedCollection.id })));
            await invalidateProductsAndCatalog(queryClient);
            showToast(skus.length === 1 ? `Προστέθηκε ο ${skus[0]} για να ολοκληρωθεί το σετ.` : `Προστέθηκαν ${formatNumber(skus.length)} κωδικοί για να ολοκληρωθούν τα σετ.`, 'success');
        } catch (e) {
            console.error(e);
            showToast('Σφάλμα προσθήκης των συνδεδεμένων προϊόντων.', 'error');
        } finally {
            setIsAddingSetMates(false);
        }
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
                showToast(`Προστέθηκαν ${formatNumber(newAssociations.length)} κωδικοί.`, 'success');
            } else if (foundCount > 0) {
                showToast(`Οι ${formatNumber(foundCount)} κωδικοί βρίσκονται ήδη στη συλλογή.`, 'info');
            }

            if (notFoundCount > 0) {
                showToast(`${formatNumber(notFoundCount)} κωδικοί δεν βρέθηκαν.`, 'warning');
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
            subtitle: `${formatNumber(items.length)} Κωδικοί`,
            date: dateStr,
            items: items
        });
    };

    const openDescModal = () => {
        if (!selectedCollection) return;
        setCollectionDesc(selectedCollection.description || '');
        setAiGuidance('');
        setIsDescModalOpen(true);
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
            await queryClient.invalidateQueries({ queryKey: ['collections'] });
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
                <PageErrorState
                    message="Δεν ήταν δυνατή η φόρτωση των συλλογών."
                    detail={(error as Error)?.message}
                    onRetry={() => queryClient.invalidateQueries({ queryKey: ['collections'] })}
                />
            </div>
        );
    }

    const canPrint = !!onPrint && productsInSelectedCollection.length > 0;
    const sortButton = (value: GallerySort, Icon: typeof ArrowDownAZ, label: string) => (
        <button
            type="button"
            onClick={() => setGallerySort(value)}
            aria-pressed={gallerySort === value}
            title={label}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${gallerySort === value
                ? 'bg-white text-[#060b00] shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
        >
            <Icon size={14} /> <span className="hidden xl:inline">{label}</span>
        </button>
    );

    return (
        <div className="max-w-7xl mx-auto h-[calc(100vh-120px)] flex flex-col gap-5">
            {/* ── PAGE HEADER ─────────────────────────────────────────────── */}
            <DesktopPageHeader
                icon={FolderKanban}
                title="Συλλογές"
                subtitle="Οργανώστε τον κατάλογο σε ομάδες για παρουσίαση και εκτύπωση."
                tail={
                    <div className="flex items-center gap-2">
                        <div className="flex items-center gap-2 rounded-xl border border-slate-200/70 bg-slate-50 px-3.5 py-2">
                            <Layers size={15} className="text-slate-400" />
                            <span className="text-sm font-black tabular-nums text-slate-800">{formatNumber(collectionList.length)}</span>
                            <span className="text-xs font-bold text-slate-400">συλλογές</span>
                        </div>
                        <div className="flex items-center gap-2 rounded-xl border border-slate-200/70 bg-slate-50 px-3.5 py-2">
                            <Package size={15} className="text-slate-400" />
                            <span className="text-sm font-black tabular-nums text-slate-800">{formatNumber(productsInAnyCollection)}</span>
                            <span className="text-xs font-bold text-slate-400">προϊόντα σε συλλογές</span>
                        </div>
                    </div>
                }
            />

            {!selectedCollection ? (
                /* ── GALLERY ─────────────────────────────────────────────── */
                <div className="flex min-h-0 flex-1 flex-col gap-5">
                    {/* Toolbar: find / sort / create — one create affordance for the whole page */}
                    <div className="shrink-0 rounded-3xl border border-slate-100 bg-white p-3 shadow-sm">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                            <SearchField
                                value={gallerySearch}
                                onChange={setGallerySearch}
                                placeholder="Αναζήτηση συλλογής..."
                                className="lg:w-72"
                            />
                            <div className="flex items-center gap-1 self-start rounded-xl bg-slate-100 p-1 lg:self-auto">
                                {sortButton('name', ArrowDownAZ, 'Αλφαβητικά')}
                                {sortButton('size', ArrowDownWideNarrow, 'Μέγεθος')}
                            </div>
                            <form
                                onSubmit={(e) => { e.preventDefault(); handleCreateCollection(); }}
                                className="flex min-w-0 flex-1 gap-2 lg:ml-auto lg:max-w-md"
                            >
                                <div className="relative min-w-0 flex-1">
                                    <Plus className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                                    <input
                                        type="text"
                                        value={newCollectionName}
                                        onChange={(e) => setNewCollectionName(e.target.value)}
                                        placeholder="Όνομα νέας συλλογής..."
                                        aria-label="Όνομα νέας συλλογής"
                                        className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-3 text-sm font-medium text-slate-800 outline-none transition-all placeholder:text-slate-400 focus:border-slate-400 focus:bg-white focus:ring-2 focus:ring-slate-900/10"
                                    />
                                </div>
                                <button
                                    type="submit"
                                    disabled={!newCollectionName.trim() || isCreating}
                                    className="flex shrink-0 items-center gap-1.5 rounded-xl bg-[#060b00] px-4 text-sm font-bold text-white shadow-md transition-all hover:bg-slate-800 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                    {isCreating ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                                    Νέα Συλλογή
                                </button>
                            </form>
                        </div>
                    </div>

                    <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar pr-1 pb-2">
                        {galleryCollections.length > 0 ? (
                            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                                {galleryCollections.map((c) => {
                                    const preview = collectionStats.get(c.id) || { images: [], total: 0 };
                                    return (
                                        <button
                                            key={c.id}
                                            type="button"
                                            onClick={() => openCollection(c.id)}
                                            className="group flex flex-col overflow-hidden rounded-3xl border border-slate-100 bg-white text-left shadow-sm transition-all hover:-translate-y-1 hover:border-slate-200 hover:shadow-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/20"
                                        >
                                            <CollectionCover images={preview.images} total={preview.total} />
                                            <div className="flex flex-1 flex-col p-5">
                                                <div className="flex items-start justify-between gap-3">
                                                    <h3 className="min-w-0 truncate text-base font-black tracking-tight text-slate-900">{c.name}</h3>
                                                    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-black ${preview.total > 0
                                                        ? 'border-emerald-100 bg-emerald-50 text-emerald-700'
                                                        : 'border-slate-100 bg-slate-50 text-slate-400'
                                                    }`}>
                                                        {productCountLabel(preview.total)}
                                                    </span>
                                                </div>
                                                <p className={`mt-1.5 line-clamp-2 text-xs font-medium leading-relaxed ${c.description ? 'text-slate-500' : 'italic text-slate-300'}`}>
                                                    {c.description || 'Χωρίς περιγραφή'}
                                                </p>
                                                <div className="mt-auto flex items-center gap-1 pt-4 text-xs font-bold text-slate-300 transition-colors group-hover:text-[#060b00]">
                                                    Άνοιγμα
                                                    <ArrowRight size={14} className="transition-transform group-hover:translate-x-1" />
                                                </div>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="flex h-full min-h-[260px] flex-col items-center justify-center rounded-3xl border-2 border-dashed border-slate-200 bg-white/60 px-6 text-center">
                                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-100 bg-white shadow-sm">
                                    {gallerySearch ? <Search size={22} className="text-slate-300" /> : <FolderKanban size={22} className="text-slate-300" />}
                                </div>
                                <p className="text-sm font-black text-slate-600">
                                    {gallerySearch ? 'Δεν βρέθηκαν συλλογές.' : 'Δεν υπάρχουν συλλογές ακόμα.'}
                                </p>
                                <p className="mt-1 text-xs font-medium text-slate-400">
                                    {gallerySearch
                                        ? `Καμία συλλογή δεν ταιριάζει με «${gallerySearch}».`
                                        : 'Γράψτε ένα όνομα στο πεδίο «Νέα συλλογή» επάνω για να ξεκινήσετε.'}
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            ) : (
                /* ── WORKSPACE ───────────────────────────────────────────── */
                <div className="grid min-h-0 flex-1 grid-cols-1 gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
                    {/* Collections rail — quick switching without leaving the workspace */}
                    <aside className="hidden min-h-0 flex-col overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm lg:flex">
                        <div className="space-y-3 border-b border-slate-100 p-3">
                            <button
                                type="button"
                                onClick={backToGallery}
                                className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-sm font-bold text-slate-600 transition-colors hover:bg-slate-50 hover:text-[#060b00]"
                            >
                                <ArrowLeft size={16} /> Όλες οι συλλογές
                            </button>
                            <SearchField value={railSearch} onChange={setRailSearch} placeholder="Φίλτρο..." inputClassName="py-2 text-xs" />
                        </div>
                        <nav className="min-h-0 flex-1 space-y-0.5 overflow-y-auto custom-scrollbar p-2" aria-label="Συλλογές">
                            {railCollections.map((c) => {
                                const active = c.id === selectedCollection.id;
                                const count = countOf(c.id);
                                return (
                                    <button
                                        key={c.id}
                                        type="button"
                                        onClick={() => openCollection(c.id)}
                                        aria-current={active ? 'page' : undefined}
                                        className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors ${active
                                            ? 'bg-[#060b00] text-white shadow-md'
                                            : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                                        }`}
                                    >
                                        <FolderKanban size={15} className={`shrink-0 ${active ? 'text-white/70' : 'text-slate-300'}`} />
                                        <span className="min-w-0 flex-1 truncate text-sm font-bold">{c.name}</span>
                                        <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-black tabular-nums ${active
                                            ? 'bg-white/15 text-white'
                                            : count > 0 ? 'bg-slate-100 text-slate-500' : 'text-slate-300'
                                        }`}>
                                            {formatNumber(count)}
                                        </span>
                                    </button>
                                );
                            })}
                            {railCollections.length === 0 && (
                                <p className="px-2 py-6 text-center text-xs font-medium text-slate-400">Καμία συλλογή.</p>
                            )}
                        </nav>
                    </aside>

                    <div ref={workspaceScrollRef} className="min-h-0 space-y-5 overflow-y-auto custom-scrollbar pr-1 pb-2">
                        {/* Collection header: identity + every collection-level action, once */}
                        <section className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm sm:p-6">
                            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                                <div className="flex min-w-0 items-start gap-3">
                                    <button
                                        type="button"
                                        onClick={backToGallery}
                                        title="Πίσω στις συλλογές"
                                        aria-label="Πίσω στις συλλογές"
                                        className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-500 transition-all hover:border-slate-300 hover:bg-white hover:text-[#060b00] lg:hidden"
                                    >
                                        <ArrowLeft size={17} />
                                    </button>
                                    <div className="min-w-0 flex-1">
                                        <div className="mb-1 flex flex-wrap items-center gap-2">
                                            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-slate-500">Συλλογή</span>
                                            <span className="text-xs font-bold text-slate-400">{productCountLabel(productsInSelectedCollection.length)}</span>
                                        </div>
                                        {isRenaming ? (
                                            <form
                                                onSubmit={(e) => { e.preventDefault(); handleRename(); }}
                                                className="flex items-center gap-2"
                                            >
                                                <input
                                                    autoFocus
                                                    value={renameValue}
                                                    onChange={(e) => setRenameValue(e.target.value)}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Escape') { e.preventDefault(); setIsRenaming(false); }
                                                    }}
                                                    aria-label="Νέο όνομα συλλογής"
                                                    className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-2xl font-black tracking-tight text-slate-900 outline-none focus:ring-2 focus:ring-slate-900/10"
                                                />
                                                <button type="submit" aria-label="Αποθήκευση ονόματος" className="rounded-xl bg-[#060b00] p-2.5 text-white transition-colors hover:bg-slate-800">
                                                    <Check size={16} />
                                                </button>
                                                <button type="button" aria-label="Ακύρωση" onClick={() => setIsRenaming(false)} className="rounded-xl p-2.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600">
                                                    <X size={16} />
                                                </button>
                                            </form>
                                        ) : (
                                            <div className="group/name flex min-w-0 items-center gap-2">
                                                <h2 className="truncate text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">{selectedCollection.name}</h2>
                                                <button
                                                    type="button"
                                                    onClick={startRename}
                                                    title="Μετονομασία"
                                                    aria-label="Μετονομασία συλλογής"
                                                    className="shrink-0 rounded-lg p-1.5 text-slate-300 opacity-0 transition-all hover:bg-slate-100 hover:text-slate-600 focus:opacity-100 group-hover/name:opacity-100"
                                                >
                                                    <Pencil size={15} />
                                                </button>
                                            </div>
                                        )}
                                        <p className={`mt-2 max-w-3xl text-sm leading-relaxed ${selectedCollection.description ? 'font-serif italic text-slate-600' : 'italic text-slate-400'}`}>
                                            {selectedCollection.description || 'Δεν έχει οριστεί περιγραφή για αυτή τη συλλογή.'}
                                        </p>
                                    </div>
                                </div>

                                <div className="flex shrink-0 flex-wrap items-center gap-2">
                                    <button
                                        type="button"
                                        aria-expanded={addPanelOpen}
                                        aria-controls="add-products-panel"
                                        onClick={() => setAddPanelOpen((v) => !v)}
                                        className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-all active:scale-95 ${addPanelOpen
                                            ? 'bg-emerald-700 text-white shadow-inner'
                                            : 'bg-emerald-600 text-white shadow-md hover:bg-emerald-700'
                                        }`}
                                    >
                                        {addPanelOpen ? <X size={16} /> : <PackagePlus size={16} />}
                                        {addPanelOpen ? 'Κλείσιμο' : 'Προσθήκη Προϊόντων'}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={openDescModal}
                                        className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-600 transition-all hover:border-purple-300 hover:text-purple-700 hover:shadow-sm"
                                    >
                                        <Sparkles size={15} className="text-purple-500" />
                                        Περιγραφή
                                    </button>
                                    {onPrint && (
                                        <button
                                            type="button"
                                            onClick={handlePrintCollection}
                                            disabled={!canPrint}
                                            title={canPrint ? 'Εκτύπωση τιμοκαταλόγου συλλογής' : 'Η συλλογή είναι άδεια'}
                                            className="flex items-center gap-2 rounded-xl bg-[#060b00] px-4 py-2.5 text-sm font-bold text-white shadow-md transition-all hover:bg-slate-800 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
                                        >
                                            <Printer size={16} /> Εκτύπωση
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        onClick={() => handleDeleteCollection(selectedCollection)}
                                        title="Διαγραφή συλλογής"
                                        aria-label="Διαγραφή συλλογής"
                                        className="flex h-[42px] w-[42px] items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-400 transition-all hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            </div>
                        </section>

                        {/* Add products (inline, toggled from the header) */}
                        {addPanelOpen && (
                            <section
                                id="add-products-panel"
                                className="overflow-hidden rounded-3xl border border-emerald-100 bg-white shadow-sm animate-in fade-in slide-in-from-top-2 duration-200"
                            >
                                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-emerald-100/70 bg-emerald-50/40 px-5 py-3">
                                    <div className="flex items-center gap-1 rounded-xl bg-white p-1 shadow-sm ring-1 ring-emerald-100">
                                        {([
                                            { id: 'registry', label: 'Από Μητρώο', icon: Database },
                                            { id: 'bulk', label: 'Μαζική Εισαγωγή', icon: ScanBarcode },
                                        ] as const).map(({ id, label, icon: Icon }) => (
                                            <button
                                                key={id}
                                                type="button"
                                                onClick={() => setAddMode(id)}
                                                aria-pressed={addMode === id}
                                                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${addMode === id
                                                    ? 'bg-emerald-600 text-white shadow-sm'
                                                    : 'text-slate-500 hover:text-emerald-700'
                                                }`}
                                            >
                                                <Icon size={14} /> {label}
                                            </button>
                                        ))}
                                    </div>
                                    <span className="text-[11px] font-bold text-emerald-700/70">
                                        Προσθήκη στη «{selectedCollection.name}»
                                    </span>
                                </div>

                                {addMode === 'registry' ? (
                                    <div className="space-y-3 p-5">
                                        <div className="relative">
                                            <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                                            <input
                                                ref={registrySearchRef}
                                                type="text"
                                                placeholder="Αναζήτηση με κωδικό ή κατηγορία..."
                                                value={registrySearch}
                                                onChange={(e) => setRegistrySearch(e.target.value)}
                                                className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-9 text-sm font-medium outline-none transition-all focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/15"
                                            />
                                            {registrySearch && (
                                                <button
                                                    type="button"
                                                    aria-label="Καθαρισμός αναζήτησης"
                                                    onClick={() => setRegistrySearch('')}
                                                    className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                                                >
                                                    <X size={14} />
                                                </button>
                                            )}
                                        </div>
                                        <div className="grid max-h-64 grid-cols-2 gap-2 overflow-y-auto custom-scrollbar p-0.5 sm:grid-cols-3 xl:grid-cols-4">
                                            {visibleAvailableProducts.map((p) => {
                                                const pending = pendingSkus.has(p.sku);
                                                return (
                                                    <button
                                                        key={p.sku}
                                                        type="button"
                                                        disabled={pending}
                                                        onClick={() => handleToggleProduct(p.sku, selectedCollection.id)}
                                                        title={`Προσθήκη ${p.sku}`}
                                                        className="group flex items-center gap-2.5 rounded-xl border border-slate-100 bg-white p-2 text-left transition-all hover:border-emerald-300 hover:bg-emerald-50/40 hover:shadow-sm disabled:opacity-60"
                                                    >
                                                        <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-100 bg-slate-50">
                                                            {p.image_url
                                                                ? <img src={p.image_url} alt="" loading="lazy" className="h-full w-full object-cover" />
                                                                : <ImageOff size={14} className="text-slate-300" />}
                                                        </div>
                                                        <div className="min-w-0 flex-1">
                                                            <div className="flex items-center gap-1 truncate font-mono text-xs font-black text-slate-800">
                                                                {p.sku}
                                                                {linkIndex.bySku.has(p.sku) && (
                                                                    <span title={`Σετ με: ${getLinkedSkus(p.sku, linkIndex).join(', ')}`} className="text-violet-500"><Link2 size={11} strokeWidth={2.75} /></span>
                                                                )}
                                                            </div>
                                                            <div className="truncate text-[10px] text-slate-400">{p.category || '—'}</div>
                                                        </div>
                                                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-300 transition-colors group-hover:bg-emerald-600 group-hover:text-white">
                                                            {pending ? <Loader2 size={13} className="animate-spin" /> : <Plus size={14} />}
                                                        </span>
                                                    </button>
                                                );
                                            })}
                                            {availableProducts.length === 0 && (
                                                <div className="col-span-full py-6 text-center text-xs text-slate-400">
                                                    {registrySearch ? 'Δεν βρέθηκαν αποτελέσματα.' : 'Όλα τα προϊόντα του μητρώου βρίσκονται ήδη στη συλλογή.'}
                                                </div>
                                            )}
                                        </div>
                                        {availableProducts.length > REGISTRY_LIMIT && (
                                            <p className="text-[11px] font-medium text-slate-400">
                                                Εμφανίζονται {formatNumber(REGISTRY_LIMIT)} από {formatNumber(availableProducts.length)} — περιορίστε την αναζήτηση ή χρησιμοποιήστε τη μαζική εισαγωγή.
                                            </p>
                                        )}
                                    </div>
                                ) : (
                                    <div className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1fr)_260px]">
                                        <textarea
                                            value={bulkSkus}
                                            onChange={(e) => setBulkSkus(e.target.value)}
                                            placeholder={`Επικολλήστε κωδικούς (π.χ. από Excel)...\nDA100\nXR2020\nMN050S-MN063S`}
                                            className="h-36 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 p-4 font-mono text-xs outline-none transition-all focus:border-emerald-400 focus:bg-white focus:ring-2 focus:ring-emerald-500/15"
                                        />
                                        <div className="flex flex-col gap-3">
                                            <p className="text-xs font-medium leading-relaxed text-slate-500">
                                                Διαχωρισμός με κόμμα, κενό ή νέα γραμμή. Υποστηρίζονται και διαστήματα κωδικών, π.χ. <span className="font-mono font-bold text-slate-700">MN050S-MN063S</span>.
                                            </p>
                                            <button
                                                type="button"
                                                onClick={handleBulkAdd}
                                                disabled={isBulkAdding || !bulkSkus.trim()}
                                                className="mt-auto flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white shadow-md transition-all hover:bg-emerald-700 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
                                            >
                                                {isBulkAdding ? <Loader2 size={16} className="animate-spin" /> : <PackagePlus size={16} />}
                                                {isBulkAdding ? 'Προσθήκη...' : 'Προσθήκη κωδικών'}
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </section>
                        )}

                        {/* Contents */}
                        <section className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm sm:p-6">
                            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                                <h3 className="flex items-center gap-2 text-sm font-black uppercase tracking-wide text-slate-800">
                                    Περιεχόμενα
                                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black text-slate-500 tabular-nums">
                                        {collectionSearch
                                            ? `${formatNumber(visibleCollectionProducts.length)} / ${formatNumber(productsInSelectedCollection.length)}`
                                            : formatNumber(productsInSelectedCollection.length)}
                                    </span>
                                </h3>
                                {productsInSelectedCollection.length > 0 && (
                                    <SearchField
                                        value={collectionSearch}
                                        onChange={setCollectionSearch}
                                        placeholder="Αναζήτηση στη συλλογή..."
                                        className="w-full sm:w-64"
                                    />
                                )}
                            </div>

                            {missingSetMates.length > 0 && (
                                <LinkedProductsStrip
                                    className="mb-5"
                                    title={`Λείπουν από τα σετ της συλλογής (${formatNumber(missingSetMates.length)})`}
                                    items={missingSetMates.map((product) => ({
                                        sku: product.sku,
                                        suffix: '',
                                        imageUrl: product.image_url,
                                        gender: product.gender,
                                        aside: <span className="truncate">{product.category}</span>,
                                        onSelect: () => setViewProduct(product),
                                        onAdd: isAddingSetMates ? undefined : () => handleAddSetMates([product.sku]),
                                        addTitle: `Προσθήκη ${product.sku} στη συλλογή`,
                                    }))}
                                    action={(
                                        <button
                                            type="button"
                                            disabled={isAddingSetMates}
                                            onClick={() => handleAddSetMates(missingSetMates.map((product) => product.sku))}
                                            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-violet-600 px-2.5 py-1 text-[11px] font-black text-white shadow-sm transition hover:bg-violet-700 disabled:opacity-50"
                                        >
                                            {isAddingSetMates ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} strokeWidth={3} />}
                                            Προσθήκη όλων
                                        </button>
                                    )}
                                />
                            )}

                            {visibleCollectionProducts.length > 0 ? (
                                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
                                    {visibleCollectionProducts.map((p) => {
                                        const pending = pendingSkus.has(p.sku);
                                        return (
                                            <div
                                                key={p.sku}
                                                role="button"
                                                tabIndex={0}
                                                onClick={() => setViewProduct(p)}
                                                onKeyDown={(e) => { if (e.key === 'Enter') setViewProduct(p); }}
                                                className={`group relative cursor-pointer rounded-2xl border border-slate-100 bg-white p-2.5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-slate-200 hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/20 ${pending ? 'pointer-events-none opacity-50' : ''}`}
                                            >
                                                <button
                                                    type="button"
                                                    onClick={(e) => { e.stopPropagation(); handleToggleProduct(p.sku, selectedCollection.id); }}
                                                    className="absolute right-4 top-4 z-10 rounded-full border border-slate-100 bg-white/95 p-1 text-slate-400 opacity-0 shadow-sm transition-all hover:bg-red-50 hover:text-red-500 focus:opacity-100 group-hover:opacity-100"
                                                    title="Αφαίρεση από τη συλλογή"
                                                    aria-label={`Αφαίρεση ${p.sku} από τη συλλογή`}
                                                >
                                                    {pending ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}
                                                </button>
                                                <div className="relative mb-2.5 flex aspect-square items-center justify-center overflow-hidden rounded-xl bg-slate-50">
                                                    {p.image_url ? (
                                                        <img src={p.image_url} alt={p.sku} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                                                    ) : (
                                                        <ImageOff size={22} className="text-slate-300" />
                                                    )}
                                                    {linkIndex.bySku.has(p.sku) && (
                                                        <LinkedProductsBadge
                                                            className="absolute left-2 top-2"
                                                            linkedSkus={getLinkedSkus(p.sku, linkIndex)}
                                                            onOpen={(anchor) => quickViews.openLinks(p.sku, anchor)}
                                                        />
                                                    )}
                                                    {p.image_url && (
                                                        <ImageZoomButton
                                                            size="sm"
                                                            className="absolute bottom-2 right-2"
                                                            onZoom={() => quickViews.zoomProduct(p.sku, p.image_url, p.category)}
                                                        />
                                                    )}
                                                </div>
                                                <div className="px-1">
                                                    <p className="truncate font-mono text-xs font-black text-slate-800">{p.sku}</p>
                                                    <p className="truncate text-[10px] text-slate-500">{p.category || '—'}</p>
                                                    <div className="mt-1.5 flex items-center justify-between gap-1.5">
                                                        <span className="text-xs font-black text-emerald-600">
                                                            {(p.selling_price || 0) > 0 ? formatCurrency(p.selling_price) : <span className="text-slate-300">—</span>}
                                                        </span>
                                                        {(p.variants?.length || 0) > 0 && (
                                                            <span className="rounded-md bg-slate-50 px-1.5 py-0.5 text-[9px] font-bold text-slate-400">
                                                                {formatNumber(p.variants!.length)} παραλ.
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/50 py-14 text-center">
                                    <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-100 bg-white shadow-sm">
                                        {collectionSearch ? <Search size={22} className="text-slate-300" /> : <PackagePlus size={22} className="text-slate-300" />}
                                    </div>
                                    <p className="text-sm font-black text-slate-500">
                                        {collectionSearch ? 'Δεν βρέθηκαν προϊόντα.' : 'Η συλλογή είναι άδεια.'}
                                    </p>
                                    <p className="mt-1 text-xs font-medium text-slate-400">
                                        {collectionSearch
                                            ? 'Δοκιμάστε άλλη αναζήτηση.'
                                            : 'Πατήστε «Προσθήκη Προϊόντων» επάνω για να επιλέξετε από το μητρώο ή να επικολλήσετε κωδικούς.'}
                                    </p>
                                </div>
                            )}
                        </section>
                    </div>
                </div>
            )}

            {/* DESCRIPTION / AI MODAL */}
            {isDescModalOpen && selectedCollection && (
                <div
                    className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-in fade-in"
                    onMouseDown={(e) => { if (e.target === e.currentTarget) setIsDescModalOpen(false); }}
                >
                    <div role="dialog" aria-modal="true" aria-labelledby="collection-desc-title" className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl animate-in zoom-in-95">
                        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
                            <div className="min-w-0">
                                <h3 id="collection-desc-title" className="flex items-center gap-2 text-lg font-black text-slate-800">
                                    <Sparkles className="text-purple-500" size={20} /> Περιγραφή Συλλογής
                                </h3>
                                <p className="truncate text-xs font-medium text-slate-500">{selectedCollection.name}</p>
                            </div>
                            <button type="button" aria-label="Κλείσιμο" onClick={() => setIsDescModalOpen(false)} className="rounded-full p-2 text-slate-500 transition-colors hover:bg-slate-100">
                                <X size={20} />
                            </button>
                        </div>

                        <div className="flex-1 space-y-5 overflow-y-auto p-6">
                            {/* AI Control */}
                            <div className="space-y-3 rounded-2xl border border-purple-100 bg-purple-50/70 p-4">
                                <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-purple-800">
                                    <Wand2 size={14} /> Δημιουργία με AI
                                </label>
                                <form
                                    onSubmit={(e) => { e.preventDefault(); handleGenerateDescription(); }}
                                    className="flex gap-2"
                                >
                                    <input
                                        type="text"
                                        value={aiGuidance}
                                        onChange={(e) => setAiGuidance(e.target.value)}
                                        placeholder="Ύφος, π.χ. 'Καλοκαιρινή διάθεση', 'Πολυτέλεια', 'Minimal'..."
                                        className="min-w-0 flex-1 rounded-xl border border-purple-200 bg-white p-3 text-sm outline-none focus:ring-2 focus:ring-purple-500/20"
                                    />
                                    <button
                                        type="submit"
                                        disabled={isGeneratingDesc || productsInSelectedCollection.length === 0}
                                        className="flex shrink-0 items-center gap-2 rounded-xl bg-purple-600 px-5 text-xs font-bold text-white shadow-md transition-colors hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        {isGeneratingDesc ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                                        {isGeneratingDesc ? 'Δημιουργία...' : 'Δημιουργία'}
                                    </button>
                                </form>
                                <p className="ml-1 text-[11px] italic text-purple-600/70">
                                    {productsInSelectedCollection.length > 0
                                        ? `Το AI θα αναλύσει τα ${formatNumber(productsInSelectedCollection.length)} προϊόντα της συλλογής για να γράψει το κείμενο.`
                                        : 'Προσθέστε προϊόντα στη συλλογή για να χρησιμοποιήσετε το AI.'}
                                </p>
                            </div>

                            {/* Editor */}
                            <div>
                                <label htmlFor="collection-desc-text" className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                                    <PenTool size={14} /> Κείμενο Περιγραφής
                                </label>
                                <textarea
                                    id="collection-desc-text"
                                    value={collectionDesc}
                                    onChange={(e) => setCollectionDesc(e.target.value)}
                                    className="h-48 w-full resize-none rounded-2xl border border-slate-200 bg-white p-5 font-serif text-base leading-relaxed text-slate-700 shadow-inner outline-none focus:ring-4 focus:ring-slate-100"
                                    placeholder="Γράψτε εδώ ή χρησιμοποιήστε το AI..."
                                />
                            </div>
                        </div>

                        <div className="flex justify-end gap-3 border-t border-slate-100 bg-slate-50 px-6 py-4">
                            <button type="button" onClick={() => setIsDescModalOpen(false)} className="rounded-xl px-6 py-2.5 font-bold text-slate-600 transition-colors hover:bg-slate-200">
                                Ακύρωση
                            </button>
                            <button type="button" onClick={handleSaveDescription} className="flex items-center gap-2 rounded-xl bg-[#060b00] px-7 py-2.5 font-bold text-white shadow-lg transition-colors hover:bg-black">
                                <Save size={18} /> Αποθήκευση
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* PRODUCT DETAILS MODAL */}
            {quickViews.element}

            {viewProduct && settings && materials && molds && (
                <ProductDetails
                    key={viewProduct.sku}
                    onOpenProduct={setViewProduct}
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
