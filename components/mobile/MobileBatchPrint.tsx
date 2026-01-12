
import React, { useState, useEffect, useRef } from 'react';
import { Camera, Trash2, Printer, Tag, ShoppingBag, ArrowLeft, Search, X, ChevronRight, ImageIcon, Plus } from 'lucide-react';
import { useUI } from '../UIProvider';
import BarcodeScanner from '../BarcodeScanner';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/supabase';
import { findProductByScannedCode, getVariantComponents, expandSkuRange, splitSkuComponents } from '../../utils/pricingEngine';
import BarcodeView from '../BarcodeView';
import { Product, ProductVariant } from '../../types';

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
    'MV': 'text-purple-500', 'RZ': 'text-pink-500', 'AK': 'text-cyan-400', 'XAL': 'text-stone-500'
};

export default function MobileBatchPrint() {
    const { data: products } = useQuery({ queryKey: ['products'], queryFn: api.getProducts });
    const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: api.getSettings });
    
    const { showToast } = useUI();
    
    const [queue, setQueue] = useState<QueueItem[]>([]);
    const [showScanner, setShowScanner] = useState(false);
    const [viewMode, setViewMode] = useState<'list' | 'preview'>('list');
    const [printFormat, setPrintFormat] = useState<'standard' | 'retail'>('standard');

    // Smart Entry State
    const [input, setInput] = useState('');
    const [suggestions, setSuggestions] = useState<Product[]>([]);
    const [activeMaster, setActiveMaster] = useState<Product | null>(null);
    const [qty, setQty] = useState(1);
    const inputRef = useRef<HTMLInputElement>(null);

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

        // Updated to support ranges or manual entry with intelligent expansion
        const expandedSkus = expandSkuRange(term);
        let addedCount = 0;
        let notFoundCount = 0;

        const newItems: QueueItem[] = [];

        expandedSkus.forEach(rawSku => {
            let matchFound = false;
            const match = findProductByScannedCode(rawSku, products || []);
            
            if (match) {
                // CASE A: Specific Variant or Simple Product
                if (match.variant || (!match.product.variants || match.product.variants.length === 0)) {
                    newItems.push({
                        skuString: match.product.sku + (match.variant?.suffix || ''),
                        product: match.product,
                        variant: match.variant,
                        qty: qty
                    });
                    matchFound = true;
                } 
                // CASE B: Master SKU without specific variant suffix -> Add ALL variants
                else {
                    if (match.product.variants && match.product.variants.length > 0) {
                        match.product.variants.forEach(v => {
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
            showToast(`Προστέθηκαν ${addedCount} κωδικοί (Expanded).`, 'success');
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
            // Fallback heuristics for coloring if no context found (e.g. range end part)
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
        // Range Detection
        if (input.includes('-')) {
            const parts = input.split('-');
            const start = parts[0];
            const end = parts.slice(1).join('-'); // Handle rest

            // Try to resolve masters for both parts for better coloring
            const startMatch = findProductByScannedCode(start, products || []);
            // End part might be incomplete while typing, try fuzzy
            const endMatch = findProductByScannedCode(end, products || []) || { product: products?.find(p => end.startsWith(p.sku)) || null };

            return (
                <div className="absolute inset-y-0 left-0 p-3.5 pointer-events-none font-mono text-xl tracking-wider flex items-center overflow-hidden z-20">
                    <SkuPartVisualizer text={start} masterContext={startMatch?.product || null} />
                    <span className="text-amber-500 font-bold mx-1">-</span>
                    <SkuPartVisualizer text={end} masterContext={endMatch?.product || null} />
                </div>
            );
        }

        // Standard Single Mode
        return (
            <div className="absolute inset-y-0 left-0 p-3.5 pointer-events-none font-mono text-xl tracking-wider flex items-center overflow-hidden z-20">
                <SkuPartVisualizer text={input} masterContext={activeMaster} />
            </div>
        );
    };

    // If in preview mode, render the print view
    if (viewMode === 'preview' && settings) {
        return (
            <div className="bg-white min-h-screen relative">
                {/* Controls - Hidden during print */}
                <div className="print:hidden fixed top-0 left-0 right-0 bg-white border-b border-slate-200 p-4 z-50 flex justify-between items-center shadow-sm">
                    <button onClick={() => setViewMode('list')} className="flex items-center gap-2 text-slate-600 font-bold">
                        <ArrowLeft size={20}/> Πίσω
                    </button>
                    <button onClick={handlePrint} className="bg-slate-900 text-white px-6 py-2 rounded-xl font-bold flex items-center gap-2 shadow-lg">
                        <Printer size={18}/> Εκτύπωση
                    </button>
                </div>

                {/* Printable Area */}
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

    // Default List View
    return (
        <div className="p-4 h-full flex flex-col">
            <h1 className="text-2xl font-black text-slate-900 mb-4">Εκτυπώσεις</h1>
            
            {/* MANUAL ENTRY / SCANNER HYBRID UI */}
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

                    {/* Suggestions */}
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
                    
                    {/* Add Button if manual input present */}
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
                // VARIANT SELECTION UI
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

                    {/* Quantity Stepper */}
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
