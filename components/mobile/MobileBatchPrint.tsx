import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Camera, Trash2, Printer, Tag, ShoppingBag, ArrowLeft, Search, X, ChevronRight, ImageIcon, Plus, ScanBarcode } from 'lucide-react';
import { useUI } from '../UIProvider';
import MobileScreenHeader from './MobileScreenHeader';
import BarcodeScanner from '../BarcodeScanner';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/supabase';
import { findProductByScannedCode, getVariantComponents, expandSkuRange, splitSkuComponents } from '../../utils/pricingEngine';
import BarcodeView from '../BarcodeView';
import { Product, ProductVariant } from '../../types';

interface Props {
    onPrintLabels?: (items: { product: Product; variant?: ProductVariant; quantity: number, size?: string, format?: 'standard' | 'simple' | 'retail' }[]) => void;
    onPrintPhotoCatalog?: (products: Product[]) => void;
}

interface QueueItem {
    skuString: string;
    product: Product;
    variant?: ProductVariant;
    qty: number;
}

// Visual Helpers for Variants
const FINISH_COLORS: Record<string, string> = {
    'X': 'text-amber-500', 
    'P': 'text-slate-500',  
    'D': 'text-orange-500', 
    'H': 'text-cyan-400',   
    '': 'text-slate-400'    
};

const STONE_TEXT_COLORS: Record<string, string> = {
    'KR': 'text-rose-600', 'QN': 'text-slate-900', 'LA': 'text-blue-600', 'TY': 'text-teal-500',
    'TG': 'text-orange-700', 'IA': 'text-red-800', 'BSU': 'text-slate-800', 'GSU': 'text-emerald-800',
    'RSU': 'text-rose-800', 'MA': 'text-emerald-600', 'FI': 'text-slate-400', 'OP': 'text-indigo-500',
    'NF': 'text-green-800', 'CO': 'text-orange-500', 'PCO': 'text-emerald-500', 'MCO': 'text-purple-500',
    'PAX': 'text-green-600', 'MAX': 'text-blue-700', 'KAX': 'text-red-700', 'AI': 'text-slate-600',
    'AP': 'text-cyan-600', 'AM': 'text-teal-700', 'LR': 'text-indigo-700', 'BST': 'text-sky-500',
    'MP': 'text-blue-500', 'LE': 'text-slate-400', 'PR': 'text-green-500', 'KO': 'text-red-500',
    'MV': 'text-purple-400', 'RZ': 'text-pink-500', 'AK': 'text-cyan-400', 'XAL': 'text-stone-500'
};

export default function MobileBatchPrint({ onPrintPhotoCatalog }: Props) {
    const { data: products } = useQuery({ queryKey: ['products'], queryFn: api.getProducts });
    const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: api.getSettings });
    
    const { showToast } = useUI();
    
    const [queue, setQueue] = useState<QueueItem[]>([]);
    const [showScanner, setShowScanner] = useState(false);
    const [viewMode, setViewMode] = useState<'list' | 'preview'>('list');
    const [printFormat, setPrintFormat] = useState<'standard' | 'retail'>('standard');
    const [activeTab, setActiveTab] = useState<'labels' | 'catalog'>('labels');
    const [catalogSearch, setCatalogSearch] = useState('');
    const [catalogOnlyWithImage, setCatalogOnlyWithImage] = useState(false);
    const [selectedSkus, setSelectedSkus] = useState<Set<string>>(new Set());

    // Smart Entry State
    const [input, setInput] = useState('');
    const [suggestions, setSuggestions] = useState<Product[]>([]);
    const [activeMaster, setActiveMaster] = useState<Product | null>(null);
    const [qty, setQty] = useState(1);
    const inputRef = useRef<HTMLInputElement>(null);

    const catalogProducts = useMemo(() => {
        return (products || [])
            .filter((product) => {
                if (product.is_component) return false;
                if (catalogOnlyWithImage && !product.image_url) return false;
                if (!catalogSearch.trim()) return true;
                const term = catalogSearch.trim().toUpperCase();
                return product.sku.toUpperCase().includes(term) || (product.description || '').toUpperCase().includes(term);
            })
            .sort((a, b) => a.sku.localeCompare(b.sku));
    }, [products, catalogOnlyWithImage, catalogSearch]);

    // --- SMART SEARCH LOGIC ---
    useEffect(() => {
        if (!products) return;
        const term = input.trim().toUpperCase();
        if (term.length < 2) {
            setSuggestions([]);
            return;
        }

        if (term.includes('-')) {
            setSuggestions([]);
            return;
        }

        const numericMatch = term.match(/\d+/);
        const numberTerm = numericMatch ? numericMatch[0] : null;

        const results = products.filter(p => {
            if (p.is_component) return false;
            // 1. Starts With SKU
            if (p.sku.startsWith(term)) return true;
            // 2. Contains Numeric Part
            if (numberTerm && numberTerm.length >= 3 && p.sku.includes(numberTerm)) return true;
            return false;
        }).sort((a, b) => {
            if (a.sku.length !== b.sku.length) return a.sku.length - b.sku.length;
            return a.sku.localeCompare(b.sku);
        }).slice(0, 10);

        setSuggestions(results);
    }, [input, products]);

    const handleSelectMaster = (p: Product) => {
        setActiveMaster(p);
        setInput('');
        setSuggestions([]);
        setQty(1);
    };

    const handleAddItem = (variant: ProductVariant | null) => {
        if (!activeMaster) return;
        const skuString = activeMaster.sku + (variant?.suffix || '');
        
        setQueue(prev => {
            const existingIdx = prev.findIndex(i => i.skuString === skuString);
            if (existingIdx >= 0) {
                const updated = [...prev];
                updated[existingIdx].qty += qty;
                return updated;
            }
            return [{
                skuString,
                product: activeMaster,
                variant: variant || undefined,
                qty
            }, ...prev];
        });

        showToast(`Προστέθηκε: ${skuString} (x${qty})`, 'success');
        
        setActiveMaster(null);
        setQty(1);
        if (inputRef.current) inputRef.current.focus();
    };

    const executeSmartAdd = () => {
        const term = input.trim().toUpperCase();
        if (!activeMaster && !term) return;
        
        if (activeMaster) {
            handleAddItem(null);
            return;
        }

        const expandedSkus = expandSkuRange(term);
        let addedCount = 0;
        let notFoundCount = 0;

        const newItems: QueueItem[] = [];

        expandedSkus.forEach(rawSku => {
            let matchFound = false;
            const match = findProductByScannedCode(rawSku, products || []);
            
            if (match) {
                // CASE A: Exact Match for a variant or a simple product with no variants
                if (match.variant || (!match.product.variants || match.product.variants.length === 0)) {
                    newItems.push({
                        skuString: match.product.sku + (match.variant?.suffix || ''),
                        product: match.product,
                        variant: match.variant,
                        qty: qty
                    });
                    matchFound = true;
                } 
                // CASE B: Master SKU entered exactly (no variant suffix matched) -> Expansion logic
                else {
                    const variants = match.product.variants || [];
                    const baseVariant = variants.find(v => v.suffix === "");

                    if (baseVariant) {
                        // If the product has a "Master/Lustre" variant (empty suffix),
                        // assume typing the SKU alone refers specifically to that variant.
                        newItems.push({
                            skuString: match.product.sku,
                            product: match.product,
                            variant: baseVariant,
                            qty: qty
                        });
                        matchFound = true;
                    } 
                    else if (variants.length > 0) {
                        // Otherwise, intelligently add ALL available variants
                        variants.forEach(v => {
                            newItems.push({
                                skuString: match.product.sku + v.suffix,
                                product: match.product,
                                variant: v,
                                qty: qty
                            });
                        });
                        matchFound = true;
                    }
                }
            }

            if (matchFound) {
                addedCount++;
            } else {
                notFoundCount++;
            }
        });

        if (addedCount > 0) {
            setQueue(prev => {
                const updated = [...prev];
                newItems.forEach(item => {
                    const existingIdx = updated.findIndex(i => i.skuString === item.skuString);
                    if (existingIdx >= 0) {
                        updated[existingIdx].qty += item.qty;
                    } else {
                        updated.unshift(item);
                    }
                });
                return updated;
            });
            showToast(`Προστέθηκαν ${addedCount} κωδικοί.`, 'success');
            setInput('');
            setQty(1);
        } else {
            showToast("Δεν βρέθηκαν έγκυροι κωδικοί.", "error");
        }
    };

    const handleScan = (code: string) => {
        if (!products) return;
        const match = findProductByScannedCode(code, products);
        
        if (match) {
            const skuString = match.product.sku + (match.variant?.suffix || '');
            setQueue(prev => {
                const existingIdx = prev.findIndex(i => i.skuString === skuString);
                if (existingIdx >= 0) {
                    const updated = [...prev];
                    updated[existingIdx].qty += 1;
                    return updated;
                }
                return [{
                    skuString,
                    product: match.product,
                    variant: match.variant,
                    qty: 1
                }, ...prev];
            });
            showToast(`Προστέθηκε: ${skuString}`, 'success');
        } else {
            showToast(`Άγνωστος κωδικός: ${code}`, 'error');
        }
    };

    const clearQueue = () => {
        setQueue([]);
        showToast("Η λίστα καθαρίστηκε.", "info");
    };

    const handlePrint = () => {
        window.print();
    };

    const handleToggleCatalogSku = (sku: string) => {
        setSelectedSkus((prev) => {
            const next = new Set(prev);
            if (next.has(sku)) next.delete(sku);
            else next.add(sku);
            return next;
        });
    };

    const handleToggleCatalogAll = () => {
        if (selectedSkus.size === catalogProducts.length) {
            setSelectedSkus(new Set());
        } else {
            setSelectedSkus(new Set(catalogProducts.map((product) => product.sku)));
        }
    };

    const handlePrintCatalog = () => {
        const toPrint = catalogProducts.filter((product) => selectedSkus.has(product.sku));
        if (toPrint.length === 0) {
            showToast('Δεν έχετε επιλέξει προϊόντα για φωτοκατάλογο.', 'info');
            return;
        }

        onPrintPhotoCatalog?.(toPrint);
        showToast(`Στάλθηκαν ${toPrint.length} προϊόντα για εκτύπωση φωτοκαταλόγου.`, 'success');
    };

    const hasVariants = activeMaster && activeMaster.variants && activeMaster.variants.length > 0;

    // --- VISUALIZERS ---
    const SkuPartVisualizer = ({ text, masterContext }: { text: string, masterContext: Product | null }) => {
        let masterStr = text;
        let suffixStr = '';

        if (masterContext) {
            const masterLen = masterContext.sku.length;
            if (text.startsWith(masterContext.sku)) {
                masterStr = text.slice(0, masterLen);
                suffixStr = text.slice(masterLen);
            }
        } else {
            const split = splitSkuComponents(text);
            masterStr = split.master;
            suffixStr = split.suffix;
        }

        const { finish, stone } = getVariantComponents(suffixStr, masterContext?.gender);
        const fColor = FINISH_COLORS[finish.code] || 'text-slate-400';
        const sColor = STONE_TEXT_COLORS[stone.code] || 'text-emerald-400';

        const renderSuffixChars = () => {
            return suffixStr.split('').map((char, i) => {
                let colorClass = 'text-slate-400';
                if (finish.code && i < finish.code.length) colorClass = fColor;
                else if (stone.code && i >= (suffixStr.length - stone.code.length)) colorClass = sColor;
                return <span key={i} className={colorClass}>{char}</span>
            });
        };

        return (
            <span>
                <span className="text-slate-900 font-black">{masterStr}</span>
                <span className="font-black">{renderSuffixChars()}</span>
            </span>
        );
    }

    const SkuVisualizer = () => {
        if (input.includes('-')) {
            const parts = input.split('-');
            const start = parts[0];
            const end = parts.slice(1).join('-');
            const startMatch = findProductByScannedCode(start, products || []);
            const endMatch = findProductByScannedCode(end, products || []) || { product: products?.find(p => end.startsWith(p.sku)) || null };

            return (
                <div className="absolute inset-y-0 left-0 p-3.5 pointer-events-none font-mono text-xl tracking-wider flex items-center overflow-hidden z-20">
                    <SkuPartVisualizer text={start} masterContext={startMatch?.product || null} />
                    <span className="text-amber-500 font-bold mx-1">-</span>
                    <SkuPartVisualizer text={end} masterContext={endMatch?.product || null} />
                </div>
            );
        }

        return (
            <div className="absolute inset-y-0 left-0 p-3.5 pointer-events-none font-mono text-xl tracking-wider flex items-center overflow-hidden z-20">
                <SkuPartVisualizer text={input} masterContext={activeMaster} />
            </div>
        );
    };

    if (viewMode === 'preview' && settings) {
        return (
            <div className="bg-white min-h-screen relative">
                <div className="print:hidden fixed top-0 left-0 right-0 bg-white border-b border-slate-200 p-4 z-50 flex justify-between items-center shadow-sm">
                    <button onClick={() => setViewMode('list')} className="flex items-center gap-2 text-slate-600 font-bold">
                        <ArrowLeft size={20}/> Πίσω
                    </button>
                    <button onClick={handlePrint} className="bg-slate-900 text-white px-6 py-2 rounded-xl font-bold flex items-center gap-2 shadow-lg">
                        <Printer size={18}/> Εκτύπωση
                    </button>
                </div>

                <div className="pt-20 pb-10 px-4 print:p-0 print:m-0">
                    <div className="print-area flex flex-wrap content-start">
                        {queue.flatMap(item => Array(item.qty).fill(item)).map((item, idx) => (
                            <div key={idx} className="mb-4 print:mb-0">
                                <BarcodeView 
                                    product={item.product}
                                    variant={item.variant}
                                    width={printFormat === 'retail' ? (settings.retail_barcode_width_mm || 72) : settings.barcode_width_mm} 
                                    height={printFormat === 'retail' ? (settings.retail_barcode_height_mm || 10) : settings.barcode_height_mm} 
                                    format={printFormat}
                                />
                            </div>
                        ))}
                    </div>
                </div>
                
                <style>{`
                    @media print {
                        @page { size: auto; margin: 0; }
                        body { background: white; }
                        .print-area { display: flex; flex-wrap: wrap; }
                        .print\\:hidden { display: none !important; }
                    }
                `}</style>
            </div>
        );
    }

    if (activeTab === 'catalog') {
        return (
            <div className="flex h-full min-h-0 flex-col bg-slate-50">
                <MobileScreenHeader icon={ScanBarcode} title="Μαζική Εκτύπωση" subtitle="Ετικέτες & φωτοκατάλογος" iconClassName="text-slate-700" />

                <div className="px-4 pt-3">
                    <div className="grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1">
                        <button
                            onClick={() => setActiveTab('labels')}
                            className="rounded-xl px-3 py-2 text-sm font-black text-slate-500"
                        >
                            Ετικέτες
                        </button>
                        <button
                            onClick={() => setActiveTab('catalog')}
                            className="rounded-xl bg-white px-3 py-2 text-sm font-black text-slate-900 shadow-sm"
                        >
                            Φωτοκατάλογος
                        </button>
                    </div>
                </div>

                <div className="flex min-h-0 flex-1 flex-col px-4 pb-24 pt-3">
                    <div className="mb-4 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
                        <div className="mb-3 flex items-center justify-between gap-3">
                            <div>
                                <div className="text-sm font-black text-slate-900">Επιλογή Προϊόντων</div>
                                <div className="text-xs font-medium text-slate-500">Φιλτράρισμα και επιλογή κωδικών για φωτοκατάλογο.</div>
                            </div>
                            <button
                                onClick={handleToggleCatalogAll}
                                className="rounded-xl bg-slate-100 px-3 py-2 text-[11px] font-black text-slate-700"
                            >
                                {selectedSkus.size === catalogProducts.length && catalogProducts.length > 0 ? 'Καμία' : 'Όλα'}
                            </button>
                        </div>

                        <div className="relative mb-3">
                            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                type="text"
                                value={catalogSearch}
                                onChange={(e) => setCatalogSearch(e.target.value)}
                                placeholder="Αναζήτηση SKU ή περιγραφής..."
                                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-9 pr-3 text-sm font-medium outline-none focus:border-slate-400"
                            />
                        </div>

                        <button
                            onClick={() => setCatalogOnlyWithImage((prev) => !prev)}
                            className={`rounded-xl px-3 py-2 text-xs font-black ${catalogOnlyWithImage ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}
                        >
                            {catalogOnlyWithImage ? 'Μόνο με φωτογραφία' : 'Όλα τα προϊόντα'}
                        </button>
                    </div>

                    <div className="mb-4 flex-1 overflow-y-auto rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
                        <div className="space-y-2">
                            {catalogProducts.map((product) => {
                                const selected = selectedSkus.has(product.sku);
                                return (
                                    <button
                                        key={product.sku}
                                        onClick={() => handleToggleCatalogSku(product.sku)}
                                        className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition-all ${selected ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 bg-white'}`}
                                    >
                                        <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-100 bg-slate-50">
                                            {product.image_url ? (
                                                <img src={product.image_url} alt={product.sku} className="h-full w-full object-cover" />
                                            ) : (
                                                <ImageIcon size={20} className="text-slate-300" />
                                            )}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className="font-black text-slate-900">{product.sku}</div>
                                            <div className="mt-0.5 truncate text-xs font-medium text-slate-500">{product.description || product.category}</div>
                                        </div>
                                        <div className={`flex h-5 w-5 items-center justify-center rounded border ${selected ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-300 bg-white text-transparent'}`}>
                                            <Plus size={12} className={selected ? 'rotate-45' : ''} />
                                        </div>
                                    </button>
                                );
                            })}
                            {catalogProducts.length === 0 && (
                                <div className="py-10 text-center text-sm italic text-slate-400">Δεν βρέθηκαν προϊόντα για τα τρέχοντα φίλτρα.</div>
                            )}
                        </div>
                    </div>

                    <button
                        onClick={handlePrintCatalog}
                        disabled={selectedSkus.size === 0}
                        className="w-full rounded-2xl bg-[#060b00] py-4 text-lg font-bold text-white shadow-lg disabled:opacity-50"
                    >
                        Εκτύπωση Φωτοκαταλόγου ({selectedSkus.size})
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="flex h-full min-h-0 flex-col bg-slate-50">
            <MobileScreenHeader icon={ScanBarcode} title="Μαζική εκτύπωση" subtitle="Barcode & ετικέτες" iconClassName="text-slate-700" />

            <div className="px-4 pt-3">
                <div className="grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1">
                    <button
                        onClick={() => setActiveTab('labels')}
                        className="rounded-xl bg-white px-3 py-2 text-sm font-black text-slate-900 shadow-sm"
                    >
                        Ετικέτες
                    </button>
                    <button
                        onClick={() => setActiveTab('catalog')}
                        className="rounded-xl px-3 py-2 text-sm font-black text-slate-500"
                    >
                        Φωτοκατάλογος
                    </button>
                </div>
            </div>

            <div className="flex min-h-0 flex-1 flex-col px-4 pb-24 pt-3">
            {!activeMaster ? (
                <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 mb-4 animate-in fade-in slide-in-from-bottom-2">
                    <label className="text-xs font-black text-slate-400 uppercase mb-2 block">Προσθήκη Κωδικού</label>
                    <div className="relative">
                        <SkuVisualizer />
                        <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-xl border border-slate-200 focus-within:ring-2 focus-within:ring-emerald-500/20 focus-within:border-emerald-500 transition-all">
                            <Search size={20} className="text-slate-400 ml-1"/>
                            <input 
                                ref={inputRef}
                                type="text" 
                                value={input}
                                onChange={e => setInput(e.target.value.toUpperCase())}
                                onKeyDown={e => e.key === 'Enter' && executeSmartAdd()}
                                placeholder="π.χ. DA100 ή 1005..."
                                className="flex-1 bg-transparent p-2 outline-none font-mono font-bold text-lg text-transparent uppercase placeholder-slate-300 relative z-10"
                                autoFocus
                            />
                            {input && <button onClick={() => setInput('')} className="z-10"><X size={18} className="text-slate-400"/></button>}
                            <button onClick={() => setShowScanner(true)} className="p-2 text-slate-400 hover:text-slate-800 z-10"><Camera size={20}/></button>
                        </div>
                    </div>

                    {suggestions.length > 0 && !input.includes('-') && (
                        <div className="mt-2 space-y-2 max-h-48 overflow-y-auto custom-scrollbar pt-2">
                            {suggestions.map(p => (
                                <button 
                                    key={p.sku} 
                                    onClick={() => handleSelectMaster(p)}
                                    className="w-full text-left p-2 rounded-xl bg-white border border-slate-100 hover:border-emerald-300 hover:bg-emerald-50 transition-all flex items-center justify-between group active:scale-98"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 bg-slate-100 rounded-lg overflow-hidden shrink-0 flex items-center justify-center">
                                            {p.image_url ? (
                                                <img src={p.image_url} className="w-full h-full object-cover" alt={p.sku} />
                                            ) : (
                                                <ImageIcon size={16} className="text-slate-300"/>
                                            )}
                                        </div>
                                        <div>
                                            <div className="font-black text-slate-800 text-lg leading-none">{p.sku}</div>
                                            <div className="text-xs text-slate-500 font-medium">{p.category}</div>
                                        </div>
                                    </div>
                                    <div className="bg-slate-100 group-hover:bg-white p-1 rounded-lg transition-colors">
                                        <ChevronRight size={16} className="text-slate-400 group-hover:text-emerald-500"/>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                    
                    {input.length >= 3 && suggestions.length === 0 && (
                        <div className="mt-3 flex gap-2">
                             <div className="w-20 shrink-0">
                                <input type="number" min="1" value={qty} onChange={e => setQty(parseInt(e.target.value)||1)} className="w-full p-3.5 text-center font-black text-xl rounded-2xl outline-none bg-slate-50 text-slate-900 border border-slate-200 focus:ring-4 focus:ring-emerald-500/10 shadow-sm"/>
                            </div>
                            <button 
                                onClick={executeSmartAdd}
                                className="flex-1 bg-slate-900 text-white p-3 rounded-xl font-bold flex items-center justify-center gap-2 active:scale-95"
                            >
                                <Plus size={20}/> Προσθήκη
                            </button>
                        </div>
                    )}
                </div>
            ) : (
                <div className="bg-white p-5 rounded-3xl shadow-lg border border-emerald-100 mb-6 animate-in zoom-in-95 duration-200 relative">
                    <div className="flex justify-between items-start mb-4">
                        <div>
                            <h3 className="text-2xl font-black text-slate-900">{activeMaster.sku}</h3>
                            <p className="text-xs text-slate-500 font-bold uppercase">{activeMaster.category}</p>
                        </div>
                        <button onClick={() => setActiveMaster(null)} className="p-2 bg-slate-100 rounded-full text-slate-500 hover:bg-slate-200">
                            <X size={20}/>
                        </button>
                    </div>

                    <div className="flex items-center justify-between bg-slate-50 p-3 rounded-xl mb-6 border border-slate-100">
                        <span className="text-xs font-bold text-slate-500 uppercase ml-1">Ποσότητα</span>
                        <div className="flex items-center gap-3 bg-white rounded-lg border border-slate-200 p-1 shadow-sm">
                            <button onClick={() => setQty(Math.max(1, qty - 1))} className="w-8 h-8 flex items-center justify-center bg-slate-100 rounded text-slate-600 font-bold hover:bg-slate-200">-</button>
                            <span className="w-8 text-center font-black text-lg">{qty}</span>
                            <button onClick={() => setQty(qty + 1)} className="w-8 h-8 flex items-center justify-center bg-slate-100 rounded text-slate-600 font-bold hover:bg-slate-200">+</button>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 max-h-60 overflow-y-auto custom-scrollbar">
                        {!hasVariants && (
                            <button 
                                onClick={() => handleAddItem(null)}
                                className="p-4 rounded-2xl bg-white border-2 border-slate-100 hover:border-slate-800 transition-all flex flex-col items-center gap-1 active:scale-95 col-span-2"
                            >
                                <span className="text-lg font-black text-slate-700">Βασικό</span>
                                <span className="text-[10px] uppercase font-bold text-slate-400">Master</span>
                            </button>
                        )}

                        {activeMaster.variants?.map(v => {
                            const { finish, stone } = getVariantComponents(v.suffix, activeMaster.gender);
                            const finishColor = FINISH_COLORS[finish.code]?.replace('bg-', 'border-') || 'border-slate-200';
                            const stoneColorClass = stone.code ? (STONE_TEXT_COLORS[stone.code] || 'text-emerald-600') : '';
                            
                            return (
                                <button 
                                    key={v.suffix}
                                    onClick={() => handleAddItem(v)}
                                    className={`p-4 rounded-2xl border-2 transition-all flex flex-col items-center gap-1 active:scale-95 shadow-sm bg-white ${finishColor}`}
                                >
                                    <span className="text-lg font-black flex items-center gap-0.5">
                                        {finish.code}
                                        {stone.code && <span className={stoneColorClass}>{stone.code}</span>}
                                        {!finish.code && !stone.code && (v.suffix || 'BAS')}
                                    </span>
                                    <span className="text-[10px] uppercase font-bold opacity-80 truncate w-full text-center">{v.description || 'Var'}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            <div className="flex justify-between items-center mb-4">
                <div className="flex gap-2 bg-slate-100 p-1 rounded-xl">
                    <button 
                        onClick={() => setPrintFormat('standard')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${printFormat === 'standard' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
                    >
                        <Tag size={14}/> Χονδρ.
                    </button>
                    <button 
                        onClick={() => setPrintFormat('retail')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${printFormat === 'retail' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500'}`}
                    >
                        <ShoppingBag size={14}/> Λιαν.
                    </button>
                </div>
                
                <div className="flex gap-2">
                    <button onClick={clearQueue} disabled={queue.length===0} className="p-2 bg-red-50 text-red-600 rounded-lg disabled:opacity-50"><Trash2 size={18}/></button>
                </div>
            </div>

            <div className="flex-1 bg-white border border-slate-100 rounded-xl p-4 overflow-y-auto shadow-inner custom-scrollbar mb-4">
                {queue.length > 0 ? (
                    <div className="space-y-2">
                        {queue.map((item, idx) => (
                            <div key={idx} className="flex justify-between items-center border-b border-slate-50 pb-2 last:border-0">
                                <div>
                                    <span className="font-black text-slate-800 text-lg block">{item.skuString}</span>
                                    <span className="text-[10px] text-slate-400 font-bold uppercase">{item.variant?.description || item.product.category}</span>
                                </div>
                                <span className="text-sm font-bold bg-slate-100 text-slate-600 px-3 py-1.5 rounded-lg">x{item.qty}</span>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="text-center text-slate-400 italic mt-10 text-sm">Η λίστα είναι κενή.</div>
                )}
            </div>
            
            <button 
                onClick={() => setViewMode('preview')}
                disabled={queue.length === 0}
                className="w-full bg-[#060b00] text-white py-4 rounded-2xl font-bold text-lg shadow-lg flex items-center justify-center gap-2 disabled:opacity-50 active:scale-95 transition-transform"
            >
                <Printer size={20}/> Προεπισκόπηση & Εκτύπωση
            </button>
            </div>

            {showScanner && (
                <BarcodeScanner 
                    onScan={handleScan} 
                    onClose={() => setShowScanner(false)} 
                    continuous={true}
                />
            )}
        </div>
    );
}
