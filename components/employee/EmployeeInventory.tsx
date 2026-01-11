
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Product, Warehouse } from '../../types';
import { Search, Box, MapPin, ImageIcon, Camera, Plus, Minus, ScanBarcode, ArrowDown, ArrowUp, History, X } from 'lucide-react';
import { formatCurrency, findProductByScannedCode } from '../../utils/pricingEngine';
import { useUI } from '../UIProvider';
import BarcodeScanner from '../BarcodeScanner';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, SYSTEM_IDS, recordStockMovement, supabase } from '../../lib/supabase';

export default function EmployeeInventory() {
    const { data: products } = useQuery({ queryKey: ['products'], queryFn: api.getProducts });
    const { data: warehouses } = useQuery({ queryKey: ['warehouses'], queryFn: api.getWarehouses });
    const queryClient = useQueryClient();
    const { showToast } = useUI();

    const [search, setSearch] = useState('');
    const [showScanner, setShowScanner] = useState(false);
    
    // Quick Manager State
    const [showQuickManager, setShowQuickManager] = useState(false);
    const [qmSku, setQmSku] = useState('');
    const [qmQty, setQmQty] = useState(1);
    const [qmWarehouse, setQmWarehouse] = useState(SYSTEM_IDS.CENTRAL);
    const [qmMode, setQmMode] = useState<'add' | 'remove'>('add');
    const [qmHistory, setQmHistory] = useState<{sku: string, qty: number, type: 'add'|'remove', time: Date}[]>([]);
    
    const [suggestions, setSuggestions] = useState<Product[]>([]);

    // Smart SKU Suggestions Logic
    useEffect(() => {
        if (!products) return;
        const term = qmSku.trim().toUpperCase();
        if (term.length < 2) {
            setSuggestions([]);
            return;
        }
        
        const numericMatch = term.match(/\d+/);
        const numberTerm = numericMatch ? numericMatch[0] : null;

        const results = products.filter(p => {
            if (p.is_component) return false;
            if (p.sku.startsWith(term)) return true;
            if (numberTerm && numberTerm.length >= 3 && p.sku.includes(numberTerm)) return true;
            return false;
        }).sort((a, b) => a.sku.localeCompare(b.sku)).slice(0, 5);

        setSuggestions(results);
    }, [qmSku, products]);

    const inventoryList = useMemo(() => {
        if (!products) return [];
        const lower = search.toLowerCase();
        
        return products
            .map(p => {
                let pTotal = 0;
                if (p.location_stock) {
                    pTotal += Object.values(p.location_stock).reduce((a: number, b: number) => a + b, 0);
                } else {
                    pTotal += (p.stock_qty || 0) + (p.sample_qty || 0);
                }
                if (p.variants && p.variants.length > 0) {
                    p.variants.forEach(v => {
                        if (v.location_stock) {
                            pTotal += Object.values(v.location_stock).reduce((a: number, b: number) => a + b, 0);
                        } else {
                            pTotal += (v.stock_qty || 0);
                        }
                    });
                }
                return { product: p, totalStock: pTotal };
            })
            .filter(item => {
                if (!search) return item.totalStock > 0; // Only show stocked items by default
                return item.product.sku.toLowerCase().includes(lower) || 
                       item.product.category.toLowerCase().includes(lower);
            })
            .slice(0, 50);
    }, [products, search]);

    const handleScan = (code: string) => {
        if (!products) return;
        const match = findProductByScannedCode(code, products);
        if (match) {
            if (showQuickManager) {
                setQmSku(match.product.sku + (match.variant?.suffix || ''));
                setShowScanner(false);
                showToast("Κωδικός αναγνωρίστηκε.", "success");
            } else {
                setSearch(match.product.sku);
                setShowScanner(false);
                showToast(`Βρέθηκε: ${match.product.sku}`, 'success');
            }
        } else {
            showToast(`Ο κωδικός ${code} δεν βρέθηκε.`, 'error');
        }
    };

    const selectSuggestion = (p: Product) => {
        setQmSku(p.sku);
        setSuggestions([]);
    };

    const executeQuickAction = async () => {
        if (!qmSku || !products) { showToast("Εισάγετε SKU.", "error"); return; }
        const match = findProductByScannedCode(qmSku, products);
        if (!match) { showToast("Ο κωδικός δεν βρέθηκε.", "error"); return; }
        
        const { product, variant } = match;
        const targetSku = product.sku;
        const targetSuffix = variant?.suffix || null;
        const qty = qmMode === 'add' ? qmQty : -qmQty;
        const warehouseName = warehouses?.find(w => w.id === qmWarehouse)?.name || 'Unknown';

        try {
            const isCentral = qmWarehouse === SYSTEM_IDS.CENTRAL;
            const isShowroom = qmWarehouse === SYSTEM_IDS.SHOWROOM;

            if (variant) {
                if (isCentral) {
                    await supabase.from('product_variants').update({ stock_qty: Math.max(0, (variant.stock_qty || 0) + qty) }).match({ product_sku: targetSku, suffix: targetSuffix });
                } else {
                    const currentLocStock = variant.location_stock?.[qmWarehouse] || 0;
                    await supabase.from('product_stock').upsert({
                        product_sku: targetSku,
                        variant_suffix: targetSuffix,
                        warehouse_id: qmWarehouse,
                        quantity: Math.max(0, currentLocStock + qty)
                    }, { onConflict: 'product_sku, warehouse_id, variant_suffix' });
                }
            } else {
                if (isCentral) {
                    await supabase.from('products').update({ stock_qty: Math.max(0, (product.stock_qty || 0) + qty) }).eq('sku', targetSku);
                } else if (isShowroom) {
                    await supabase.from('products').update({ sample_qty: Math.max(0, (product.sample_qty || 0) + qty) }).eq('sku', targetSku);
                } else {
                    const currentLocStock = product.location_stock?.[qmWarehouse] || 0;
                    await supabase.from('product_stock').upsert({
                        product_sku: targetSku,
                        variant_suffix: null,
                        warehouse_id: qmWarehouse,
                        quantity: Math.max(0, currentLocStock + qty)
                    }, { onConflict: 'product_sku, warehouse_id, variant_suffix' });
                }
            }

            await recordStockMovement(targetSku, qty, `Clerk Quick: ${warehouseName}`, targetSuffix || undefined);
            
            setQmHistory(prev => [{ sku: qmSku, qty: qmQty, type: qmMode, time: new Date() }, ...prev].slice(0, 5));
            queryClient.invalidateQueries({ queryKey: ['products'] });
            showToast(`${qmMode === 'add' ? 'Προστέθηκαν' : 'Αφαιρέθηκαν'} ${qmQty} τεμ.`, "success");
            
            setQmSku('');
            setQmQty(1);
        } catch (e) {
            console.error(e);
            showToast("Σφάλμα ενημέρωσης.", "error");
        }
    };

    if (!products) return <div className="p-12 text-center">Loading...</div>;

    return (
        <div className="space-y-6 h-full flex flex-col">
            <div className="flex justify-between items-center bg-white p-6 rounded-3xl shadow-sm border border-slate-100 shrink-0">
                <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                    <Box className="text-emerald-600"/> Διαχείριση Αποθήκης
                </h1>
                <button 
                    onClick={() => setShowQuickManager(true)}
                    className="bg-[#060b00] text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 shadow-lg active:scale-95 transition-transform"
                >
                    <ScanBarcode size={18}/> Ταχεία Κίνηση
                </button>
            </div>

            <div className="bg-white rounded-3xl border border-slate-100 flex flex-col flex-1 overflow-hidden shadow-sm">
                <div className="p-4 border-b border-slate-100 flex items-center gap-4">
                    <Search className="text-slate-400" size={20}/>
                    <input 
                        className="flex-1 outline-none font-medium text-slate-700"
                        placeholder="Αναζήτηση Αποθέματος..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                    <button onClick={() => setShowScanner(true)} className="p-2 bg-slate-100 rounded-lg text-slate-600 hover:bg-slate-200"><Camera size={20}/></button>
                </div>
                
                <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-2 bg-slate-50/50">
                    {inventoryList.map(({ product, totalStock }) => (
                        <div key={product.sku} className="bg-white p-4 rounded-xl border border-slate-100 flex items-center gap-4 shadow-sm">
                            <div className="w-12 h-12 bg-slate-50 rounded-lg overflow-hidden border border-slate-200 shrink-0 flex items-center justify-center">
                                {product.image_url ? (
                                    <img src={product.image_url} className="w-full h-full object-cover" />
                                ) : <ImageIcon size={20} className="text-slate-300"/>}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex justify-between items-start">
                                    <h3 className="font-black text-slate-800 text-sm truncate">{product.sku}</h3>
                                    <span className="font-mono font-bold text-xs text-slate-600">{formatCurrency(product.selling_price)}</span>
                                </div>
                                <p className="text-xs text-slate-500 font-medium truncate mb-1">{product.category}</p>
                                <div className="flex items-center gap-2">
                                    <div className={`px-2 py-0.5 rounded text-[10px] font-bold border ${totalStock > 0 ? 'bg-blue-50 text-blue-700 border-blue-100' : 'bg-red-50 text-red-700 border-red-100'}`}>
                                        Total: {totalStock}
                                    </div>
                                    <div className="text-[10px] text-slate-400 font-medium">
                                        {product.variants?.length ? `+${product.variants.length} var` : 'Single'}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                    {inventoryList.length === 0 && <div className="p-10 text-center text-slate-400 italic">Δεν βρέθηκαν προϊόντα.</div>}
                </div>
            </div>

            {showScanner && <BarcodeScanner onScan={handleScan} onClose={() => setShowScanner(false)} />}

            {/* QUICK STOCK MANAGER MODAL */}
            {showQuickManager && (
                <div className="fixed inset-0 z-[150] bg-black/60 backdrop-blur-sm flex flex-col justify-center items-center p-4 animate-in zoom-in-95">
                    <div className="bg-white w-full max-w-md rounded-3xl p-6 shadow-2xl space-y-5 relative">
                        <div className="flex justify-between items-center border-b border-slate-100 pb-4">
                            <h3 className="font-black text-xl text-slate-900 flex items-center gap-2"><ScanBarcode className="text-emerald-600"/> Ταχεία Διαχείριση</h3>
                            <button onClick={() => setShowQuickManager(false)} className="p-2 bg-slate-100 rounded-full text-slate-500 hover:bg-slate-200"><X size={20}/></button>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="text-xs font-bold text-slate-400 uppercase ml-1 mb-1 block">Αποθήκη</label>
                                <select 
                                    value={qmWarehouse} 
                                    onChange={e => setQmWarehouse(e.target.value)} 
                                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500"
                                >
                                    {warehouses?.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                                </select>
                            </div>

                            <div className="flex gap-3 items-start">
                                <div className="flex-1 relative">
                                    <label className="text-xs font-bold text-slate-400 uppercase ml-1 mb-1 block">SKU / Κωδικός</label>
                                    <div className="flex items-center gap-2">
                                        <input 
                                            value={qmSku} 
                                            onChange={e => setQmSku(e.target.value.toUpperCase())} 
                                            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold text-lg outline-none uppercase focus:ring-2 focus:ring-emerald-500"
                                            placeholder="SCAN..."
                                            autoFocus
                                        />
                                        <button onClick={() => setShowScanner(true)} className="p-3 bg-slate-900 text-white rounded-xl shadow-md active:scale-95 hover:bg-black"><Camera size={24}/></button>
                                    </div>
                                    
                                    {suggestions.length > 0 && (
                                        <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-xl border border-slate-100 z-50 max-h-48 overflow-y-auto">
                                            {suggestions.map(p => (
                                                <button 
                                                    key={p.sku} 
                                                    onClick={() => selectSuggestion(p)}
                                                    className="w-full text-left p-3 border-b border-slate-50 hover:bg-slate-50 flex items-center justify-between"
                                                >
                                                    <span className="font-bold text-slate-800">{p.sku}</span>
                                                    <span className="text-xs text-slate-500">{p.category}</span>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <div className="w-24">
                                    <label className="text-xs font-bold text-slate-400 uppercase ml-1 mb-1 block">Ποσότητα</label>
                                    <input 
                                        type="number" 
                                        value={qmQty} 
                                        onChange={e => setQmQty(parseInt(e.target.value) || 1)} 
                                        className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-black text-lg text-center outline-none focus:ring-2 focus:ring-emerald-500"
                                    />
                                </div>
                            </div>

                            <div className="flex gap-3 pt-2">
                                <button 
                                    onClick={() => { setQmMode('add'); setTimeout(executeQuickAction, 50); }}
                                    className="flex-1 bg-emerald-500 text-white py-3 rounded-xl font-black flex items-center justify-center gap-2 shadow-lg shadow-emerald-100 active:scale-95 transition-transform hover:bg-emerald-600"
                                >
                                    <Plus size={24}/> Προσθήκη
                                </button>
                                <button 
                                    onClick={() => { setQmMode('remove'); setTimeout(executeQuickAction, 50); }}
                                    className="flex-1 bg-rose-500 text-white py-3 rounded-xl font-black flex items-center justify-center gap-2 shadow-lg shadow-rose-100 active:scale-95 transition-transform hover:bg-rose-600"
                                >
                                    <Minus size={24}/> Αφαίρεση
                                </button>
                            </div>
                        </div>

                        {qmHistory.length > 0 && (
                            <div className="pt-4 border-t border-slate-100">
                                <h4 className="text-xs font-bold text-slate-400 uppercase mb-2 flex items-center gap-1"><History size={12}/> Ιστορικό Συνεδρίας</h4>
                                <div className="space-y-2 max-h-32 overflow-y-auto">
                                    {qmHistory.map((h, i) => (
                                        <div key={i} className="flex justify-between items-center text-sm p-2 bg-slate-50 rounded-lg">
                                            <span className="font-mono font-bold text-slate-700">{h.sku}</span>
                                            <span className={`font-black flex items-center gap-1 ${h.type === 'add' ? 'text-emerald-600' : 'text-rose-600'}`}>
                                                {h.type === 'add' ? <ArrowUp size={14}/> : <ArrowDown size={14}/>} {h.qty}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
