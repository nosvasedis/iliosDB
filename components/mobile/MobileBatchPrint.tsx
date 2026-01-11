
import React, { useState, useEffect, useRef } from 'react';
import { Camera, Trash2, Printer, Tag, ShoppingBag, ArrowLeft, Search, X, ChevronRight, ImageIcon, Plus } from 'lucide-react';
import { useUI } from '../UIProvider';
import BarcodeScanner from '../BarcodeScanner';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/supabase';
import { findProductByScannedCode, getVariantComponents } from '../../utils/pricingEngine';
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
    'X': 'bg-amber-100 text-amber-700 border-amber-200',
    'P': 'bg-slate-100 text-slate-600 border-slate-200',
    'D': 'bg-orange-100 text-orange-700 border-orange-200',
    'H': 'bg-cyan-100 text-cyan-700 border-cyan-200',
    '': 'bg-emerald-50 text-emerald-700 border-emerald-200' 
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
        
        // Check if already in queue to increment qty instead of duplicating?
        // Batch print usually lists them out or sums them. Let's just add to list for now to keep it simple.
        // Actually, let's consolidate if same SKU.
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
        
        // Reset state but keep keyboard ready?
        // Maybe clear master to allow next search
        setActiveMaster(null);
        setQty(1);
        if (inputRef.current) inputRef.current.focus();
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
                    <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-xl border border-slate-200 focus-within:ring-2 focus-within:ring-emerald-500/20 focus-within:border-emerald-500 transition-all">
                        <Search size={20} className="text-slate-400 ml-1"/>
                        <input 
                            ref={inputRef}
                            type="text" 
                            value={input}
                            onChange={e => setInput(e.target.value.toUpperCase())}
                            placeholder="π.χ. DA100 ή 1005..."
                            className="flex-1 bg-transparent p-2 outline-none font-mono font-bold text-lg text-slate-900 uppercase placeholder-slate-300"
                        />
                        <button onClick={() => setShowScanner(true)} className="p-2 bg-white text-slate-700 rounded-lg shadow-sm active:scale-95">
                            <Camera size={20}/>
                        </button>
                    </div>

                    {/* Suggestions */}
                    {suggestions.length > 0 && (
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
                            const finishColor = FINISH_COLORS[finish.code] || 'bg-slate-50 text-slate-700 border-slate-200';
                            const stoneColorClass = stone.code ? (STONE_TEXT_COLORS[stone.code] || 'text-emerald-600') : '';
                            
                            return (
                                <button 
                                    key={v.suffix}
                                    onClick={() => handleAddItem(v)}
                                    className={`p-4 rounded-2xl border-2 transition-all flex flex-col items-center gap-1 active:scale-95 shadow-sm ${finishColor}`}
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
