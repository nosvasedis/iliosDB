
import React, { useState, useMemo, useEffect } from 'react';
import { Product, Warehouse, ProductVariant } from '../../types';
import { Search, Box, MapPin, ImageIcon, Camera, Plus, Minus, ScanBarcode, ArrowDown, ArrowUp, History, X, ChevronRight, Hash, Save } from 'lucide-react';
import { formatCurrency, findProductByScannedCode, getVariantComponents } from '../../utils/pricingEngine';
import { getSizingInfo } from '../../utils/sizing';
import { useUI } from '../UIProvider';
import BarcodeScanner from '../BarcodeScanner';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, SYSTEM_IDS, recordStockMovement, supabase } from '../../lib/supabase';

// Visual Helpers (Shared)
const FINISH_COLORS: Record<string, string> = {
    'X': 'text-amber-500', 'P': 'text-slate-500', 'D': 'text-orange-500', 'H': 'text-cyan-400', '': 'text-slate-400'
};
const BUTTON_COLORS: Record<string, string> = {
    'X': 'bg-amber-50 border-amber-200 text-amber-700', 
    'P': 'bg-slate-50 border-slate-200 text-slate-600', 
    'D': 'bg-orange-50 border-orange-200 text-orange-700', 
    'H': 'bg-cyan-50 border-cyan-200 text-cyan-700', 
    '': 'bg-emerald-50 border-emerald-200 text-emerald-700'
};
const STONE_TEXT_COLORS: Record<string, string> = {
    'KR': 'text-rose-600', 'QN': 'text-slate-900', 'LA': 'text-blue-600', 'TY': 'text-teal-500', 'TG': 'text-orange-700', 'IA': 'text-red-800', 
    'BSU': 'text-slate-800', 'GSU': 'text-emerald-800', 'RSU': 'text-rose-800', 'MA': 'text-emerald-600', 'FI': 'text-slate-400', 'OP': 'text-indigo-500',
    'NF': 'text-green-800', 'CO': 'text-orange-500', 'PCO': 'text-emerald-500', 'MCO': 'text-purple-500', 'PAX': 'text-green-600', 'MAX': 'text-blue-700',
    'KAX': 'text-red-700', 'AI': 'text-slate-600', 'AP': 'text-cyan-600', 'AM': 'text-teal-700', 'LR': 'text-indigo-700', 'BST': 'text-sky-500',
    'MP': 'text-blue-500', 'LE': 'text-slate-400', 'PR': 'text-green-500', 'KO': 'text-red-500', 'MV': 'text-purple-500', 'RZ': 'text-pink-500',
    'AK': 'text-cyan-400', 'XAL': 'text-stone-500'
};

interface Props {
  products: Product[];
  onProductSelect: (p: Product) => void;
}

interface MobileInventoryItemProps {
    product: Product;
    onClick: () => void;
    totalStock: number;
}

const MobileInventoryItem: React.FC<MobileInventoryItemProps> = ({ product, onClick, totalStock }) => {
    const variantsCount = product.variants?.length || 0;

    return (
        <div 
            onClick={onClick}
            className="bg-white p-3 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4 active:scale-[0.98] transition-transform"
        >
            <div className="w-16 h-16 bg-slate-50 rounded-xl overflow-hidden border border-slate-100 shrink-0 relative">
                {product.image_url ? (
                    <img src={product.image_url} className="w-full h-full object-cover" alt={product.sku} />
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-300"><ImageIcon size={20}/></div>
                )}
                {variantsCount > 0 && (
                    <div className="absolute bottom-0 right-0 bg-slate-900/80 text-white text-[9px] px-1.5 py-0.5 rounded-tl-lg font-bold">
                        +{variantsCount}
                    </div>
                )}
            </div>
            
            <div className="flex-1 min-w-0">
                <div className="flex justify-between items-start">
                    <h3 className="font-black text-slate-800 text-base truncate">{product.sku}</h3>
                    {product.selling_price > 0 && <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">{formatCurrency(product.selling_price)}</span>}
                </div>
                <p className="text-xs text-slate-500 font-medium truncate mb-2">{product.category}</p>
                
                <div className="flex gap-2">
                    <div className={`px-2 py-1 rounded-lg text-[10px] font-bold border flex items-center gap-1 ${totalStock > 0 ? 'bg-blue-50 text-blue-700 border-blue-100' : 'bg-red-50 text-red-700 border-red-100'}`}>
                        <Box size={10}/> {totalStock}
                    </div>
                    {(product.sample_qty > 0) && (
                        <div className="px-2 py-1 rounded-lg text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-100 flex items-center gap-1">
                            <MapPin size={10}/> Δειγμ: {product.sample_qty}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default function MobileInventory({ products, onProductSelect }: Props) {
    const [activeTab, setActiveTab] = useState<'stock' | 'warehouses'>('stock');
    const [search, setSearch] = useState('');
    const [showScanner, setShowScanner] = useState(false);
    
    // Quick Manager State
    const [showQuickManager, setShowQuickManager] = useState(false);
    const [qmSkuInput, setQmSkuInput] = useState('');
    const [qmQty, setQmQty] = useState(1);
    const [qmWarehouse, setQmWarehouse] = useState(SYSTEM_IDS.CENTRAL);
    const [qmHistory, setQmHistory] = useState<{sku: string, qty: number, type: 'add'|'remove', time: Date}[]>([]);
    
    const [suggestions, setSuggestions] = useState<Product[]>([]);
    const [activeMaster, setActiveMaster] = useState<Product | null>(null);
    const [activeVariant, setActiveVariant] = useState<ProductVariant | null>(null);
    const [qmSize, setQmSize] = useState('');
    
    // Warehouse State
    const [isEditingWarehouse, setIsEditingWarehouse] = useState(false);
    const [warehouseForm, setWarehouseForm] = useState<Partial<Warehouse>>({ name: '', type: 'Store', address: '' });

    const { showToast, confirm } = useUI();
    const queryClient = useQueryClient();
    const { data: warehouses } = useQuery({ queryKey: ['warehouses'], queryFn: api.getWarehouses });

    // 1. Smart Search
    useEffect(() => {
        const term = qmSkuInput.trim().toUpperCase();
        if (term.length < 2) {
            setSuggestions([]);
            return;
        }
        
        const numericMatch = term.match(/\d+/);
        const numberTerm = numericMatch ? numericMatch[0] : null;

        const results = products.filter(p => {
            if (p.is_component) return false;
            // Exact or Prefix Match
            if (p.sku.startsWith(term)) return true;
            // Loose numeric match
            if (numberTerm && numberTerm.length >= 3 && p.sku.includes(numberTerm)) return true;
            return false;
        }).sort((a, b) => {
            if (a.sku.length !== b.sku.length) return a.sku.length - b.sku.length;
            return a.sku.localeCompare(b.sku);
        }).slice(0, 5);

        setSuggestions(results);
    }, [qmSkuInput, products]);

    const inventoryList = useMemo(() => {
        if (!products) return [];
        const lower = search.toLowerCase();
        
        return products
            .map(p => {
                let pTotal = 0;
                if (p.location_stock) {
                    pTotal += Object.values(p.location_stock).reduce((a, b) => a + b, 0);
                } else {
                    pTotal += (p.stock_qty || 0) + (p.sample_qty || 0);
                }
                if (p.variants && p.variants.length > 0) {
                    p.variants.forEach(v => {
                        if (v.location_stock) {
                            pTotal += Object.values(v.location_stock).reduce((a, b) => a + b, 0);
                        } else {
                            pTotal += (v.stock_qty || 0);
                        }
                    });
                }
                return { product: p, totalStock: pTotal };
            })
            .filter(item => {
                if (!search) return item.totalStock > 0;
                return item.product.sku.toLowerCase().includes(lower) || 
                       item.product.category.toLowerCase().includes(lower);
            })
            .slice(0, 50);
    }, [products, search]);

    const handleScan = (code: string) => {
        const match = findProductByScannedCode(code, products);
        if (match) {
            if (showQuickManager) {
                setActiveMaster(match.product);
                // If scanned a variant specific code, verify sizing then set active variant
                if (match.variant) {
                    setActiveVariant(match.variant);
                    setQmSkuInput(match.product.sku + match.variant.suffix);
                } else if (match.product.variants && match.product.variants.length > 0) {
                    // Scanned master but has variants -> Reset variant to force choice
                    setActiveVariant(null);
                    setQmSkuInput(match.product.sku);
                } else {
                    // Simple product
                    setActiveVariant(null);
                    setQmSkuInput(match.product.sku);
                }
                setQmSize('');
                setShowScanner(false);
                showToast("Κωδικός αναγνωρίστηκε.", "success");
            } else {
                onProductSelect(match.product);
                setShowScanner(false);
                showToast(`Βρέθηκε: ${match.product.sku}`, 'success');
            }
        } else {
            showToast(`Ο κωδικός ${code} δεν βρέθηκε.`, 'error');
        }
    };

    const selectSuggestion = (p: Product) => {
        setActiveMaster(p);
        setActiveVariant(null);
        setQmSkuInput(p.sku);
        setQmSize('');
        setSuggestions([]);
    };

    const handleVariantSelect = (v: ProductVariant | null) => {
        setActiveVariant(v);
        setQmSkuInput(activeMaster ? activeMaster.sku + (v?.suffix || '') : '');
    };

    const executeQuickAction = async (mode: 'add' | 'remove') => {
        if (!activeMaster) { showToast("Επιλέξτε προϊόν.", "error"); return; }
        
        // Strict Validation: If variants exist, one MUST be selected
        if (activeMaster.variants && activeMaster.variants.length > 0 && !activeVariant) {
            showToast("Το προϊόν έχει παραλλαγές. Επιλέξτε μία.", "error");
            return;
        }

        // Strict Validation: Sizing
        const sizing = getSizingInfo(activeMaster);
        if (sizing && !qmSize) {
            showToast(`Παρακαλώ επιλέξτε ${sizing.type}.`, "error");
            return;
        }

        // Logic
        const targetSku = activeMaster.sku;
        const targetSuffix = activeVariant?.suffix || null;
        // Correctly calculate delta
        const delta = mode === 'add' ? qmQty : -qmQty;
        const warehouseName = warehouses?.find(w => w.id === qmWarehouse)?.name || 'Unknown';

        try {
            const isCentral = qmWarehouse === SYSTEM_IDS.CENTRAL;
            const isShowroom = qmWarehouse === SYSTEM_IDS.SHOWROOM;

            if (activeVariant) {
                // IT IS A VARIANT
                if (isCentral) {
                    // Logic for variant size breakdown in central
                    const currentMap = activeVariant.stock_by_size || {};
                    const newMap = { ...currentMap };
                    if (qmSize) {
                        newMap[qmSize] = (newMap[qmSize] || 0) + delta;
                        if (newMap[qmSize] < 0) newMap[qmSize] = 0;
                    }
                    // Recalculate total stock from size map OR just update total + delta for consistency with simple removal
                    const newTotal = Math.max(0, (activeVariant.stock_qty || 0) + delta);
                    
                    await supabase.from('product_variants')
                        .update({ stock_qty: newTotal, stock_by_size: newMap })
                        .match({ product_sku: targetSku, suffix: targetSuffix });
                } else {
                    // Warehouse Stock
                    const currentLocStock = activeVariant.location_stock?.[qmWarehouse] || 0;
                    await supabase.from('product_stock').upsert({
                        product_sku: targetSku,
                        variant_suffix: targetSuffix,
                        warehouse_id: qmWarehouse,
                        quantity: Math.max(0, currentLocStock + delta),
                        size_info: qmSize || null
                    }, { onConflict: 'product_sku, warehouse_id, variant_suffix' });
                }
            } else {
                // IT IS A SIMPLE PRODUCT (No variants)
                if (isCentral) {
                    const currentMap = activeMaster.stock_by_size || {};
                    const newMap = { ...currentMap };
                    if (qmSize) {
                        newMap[qmSize] = (newMap[qmSize] || 0) + delta;
                        if (newMap[qmSize] < 0) newMap[qmSize] = 0;
                    }
                    await supabase.from('products')
                        .update({ 
                            stock_qty: Math.max(0, (activeMaster.stock_qty || 0) + delta),
                            stock_by_size: newMap 
                        })
                        .eq('sku', targetSku);
                } else if (isShowroom) {
                    // Showroom is stored on product table for master
                    await supabase.from('products').update({ sample_qty: Math.max(0, (activeMaster.sample_qty || 0) + delta) }).eq('sku', targetSku);
                } else {
                    const currentLocStock = activeMaster.location_stock?.[qmWarehouse] || 0;
                    await supabase.from('product_stock').upsert({
                        product_sku: targetSku,
                        variant_suffix: null,
                        warehouse_id: qmWarehouse,
                        quantity: Math.max(0, currentLocStock + delta),
                        size_info: qmSize || null
                    }, { onConflict: 'product_sku, warehouse_id, variant_suffix' });
                }
            }

            await recordStockMovement(targetSku, delta, `Clerk Quick ${mode}: ${warehouseName}`, targetSuffix || undefined);
            
            // UI Updates
            setQmHistory(prev => [{ sku: `${targetSku}${targetSuffix||''}`, qty: qmQty, type: mode, time: new Date() }, ...prev].slice(0, 5));
            queryClient.invalidateQueries({ queryKey: ['products'] });
            showToast(`${mode === 'add' ? 'Προστέθηκαν' : 'Αφαιρέθηκαν'} ${qmQty} τεμ.`, "success");
            
            // Reset logic
            setQmSkuInput('');
            setActiveMaster(null);
            setActiveVariant(null);
            setQmSize('');
            setQmQty(1);
        } catch (e) {
            console.error(e);
            showToast("Σφάλμα ενημέρωσης.", "error");
        }
    };

    // Helper Component for Visualizer
    const SkuVisualizer = () => {
        if (!activeMaster) {
            return (
                <div className="absolute inset-y-0 left-0 p-3.5 pointer-events-none font-mono text-xl tracking-wider flex items-center overflow-hidden z-20">
                    <span className="text-slate-800 font-bold">{qmSkuInput}</span>
                </div>
            );
        }
        
        const suffixStr = activeVariant ? activeVariant.suffix : qmSkuInput.replace(activeMaster.sku, '');
        const { finish, stone } = getVariantComponents(suffixStr, activeMaster.gender);
        
        return (
            <div className="absolute inset-y-0 left-0 p-3.5 pointer-events-none font-mono text-xl tracking-wider flex items-center overflow-hidden z-20">
                <span className="text-slate-900 font-black">{activeMaster.sku}</span>
                <span className={`font-black ${FINISH_COLORS[finish.code]?.split(' ')[1] || 'text-slate-400'}`}>{finish.code}</span>
                <span className={`font-black ${STONE_TEXT_COLORS[stone.code] || 'text-emerald-500'}`}>{stone.code}</span>
            </div>
        );
    };

    // ... Warehouse handlers ...
    const handleEditWarehouse = (w: Warehouse) => { setWarehouseForm(w); setIsEditingWarehouse(true); }
    const handleCreateWarehouse = () => { setWarehouseForm({ name: '', type: 'Store', address: '' }); setIsEditingWarehouse(true); }
    const handleSaveWarehouse = async () => { if (!warehouseForm.name) return; try { if (warehouseForm.id) { await api.updateWarehouse(warehouseForm.id, warehouseForm); showToast("Ο χώρος ενημερώθηκε.", "success"); } else { await api.saveWarehouse(warehouseForm); showToast("Ο χώρος δημιουργήθηκε.", "success"); } queryClient.invalidateQueries({ queryKey: ['warehouses'] }); setIsEditingWarehouse(false); } catch (err) { showToast("Σφάλμα αποθήκευσης.", "error"); } };
    const handleDeleteWarehouse = async (id: string) => { if (id === SYSTEM_IDS.CENTRAL || id === SYSTEM_IDS.SHOWROOM) { showToast("Δεν διαγράφεται.", "error"); return; } if (await confirm({ title: 'Διαγραφή Χώρου', message: 'Είστε σίγουροι;', isDestructive: true, confirmText: 'Διαγραφή' })) { await api.deleteWarehouse(id); queryClient.invalidateQueries({ queryKey: ['warehouses'] }); } };

    if (!products) return <div className="p-12 text-center">Loading...</div>;

    const sizingInfo = activeMaster ? getSizingInfo(activeMaster) : null;

    return (
        <div className="space-y-6 h-full flex flex-col">
            <div className="flex justify-between items-center bg-white p-6 rounded-3xl shadow-sm border border-slate-100 shrink-0">
                <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                    <Box className="text-emerald-600"/> Διαχείριση Αποθήκης
                </h1>
                <button 
                    onClick={() => { setShowQuickManager(true); setActiveMaster(null); setActiveVariant(null); setQmSkuInput(''); }}
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
                                    className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500"
                                >
                                    {warehouses?.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                                </select>
                            </div>

                            {!activeMaster ? (
                                <div className="relative">
                                    <label className="text-xs font-bold text-slate-400 uppercase ml-1 mb-1 block">SKU / Κωδικός</label>
                                    <div className="flex items-center gap-2">
                                        <div className="relative flex-1">
                                            <input 
                                                value={qmSkuInput} 
                                                onChange={e => setQmSkuInput(e.target.value.toUpperCase())} 
                                                className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold text-lg outline-none uppercase focus:ring-2 focus:ring-emerald-500"
                                                placeholder="SCAN..."
                                                autoFocus
                                            />
                                            {suggestions.length > 0 && (
                                                <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-xl border border-slate-100 z-50 max-h-48 overflow-y-auto">
                                                    {suggestions.map(p => (
                                                        <button 
                                                            key={p.sku} 
                                                            onClick={() => selectSuggestion(p)}
                                                            className="w-full text-left p-3 border-b border-slate-50 hover:bg-slate-50 flex items-center justify-between"
                                                        >
                                                            <div className="flex items-center gap-3">
                                                                <div className="w-8 h-8 bg-slate-100 rounded overflow-hidden">
                                                                    {p.image_url && <img src={p.image_url} className="w-full h-full object-cover"/>}
                                                                </div>
                                                                <div>
                                                                    <span className="font-bold text-slate-800 block leading-none">{p.sku}</span>
                                                                    <span className="text-[10px] text-slate-500">{p.category}</span>
                                                                </div>
                                                            </div>
                                                            <ChevronRight size={16} className="text-slate-300"/>
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                        <button onClick={() => setShowScanner(true)} className="p-3.5 bg-slate-900 text-white rounded-xl shadow-md active:scale-95 hover:bg-black"><Camera size={24}/></button>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-4 animate-in fade-in">
                                    <div className="flex items-center justify-between bg-slate-50 p-3 rounded-2xl border border-slate-200">
                                        <div className="flex items-center gap-3">
                                            <div className="w-12 h-12 bg-white rounded-xl overflow-hidden shadow-sm">
                                                {activeMaster.image_url ? <img src={activeMaster.image_url} className="w-full h-full object-cover"/> : <ImageIcon className="m-3 text-slate-300"/>}
                                            </div>
                                            <div>
                                                <div className="font-black text-lg text-slate-900 leading-none">{activeMaster.sku}</div>
                                                <div className="text-xs text-slate-500 font-bold">{activeMaster.category}</div>
                                            </div>
                                        </div>
                                        <button onClick={() => { setActiveMaster(null); setActiveVariant(null); setQmSkuInput(''); }} className="p-2 bg-white rounded-full shadow-sm text-slate-400"><X size={16}/></button>
                                    </div>

                                    {/* Variant Selector */}
                                    {activeMaster.variants && activeMaster.variants.length > 0 && (
                                        <div>
                                            <label className="text-[10px] font-black text-slate-400 uppercase ml-1 mb-2 block">Επιλογή Παραλλαγής</label>
                                            <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto custom-scrollbar">
                                                {activeMaster.variants.map(v => {
                                                    const { finish, stone } = getVariantComponents(v.suffix, activeMaster.gender);
                                                    const isActive = activeVariant?.suffix === v.suffix;
                                                    const btnColor = BUTTON_COLORS[finish.code] || 'bg-white border-slate-200 text-slate-600';
                                                    
                                                    return (
                                                        <button
                                                            key={v.suffix}
                                                            onClick={() => handleVariantSelect(v)}
                                                            className={`
                                                                px-3 py-2 rounded-xl text-xs font-black border transition-all flex items-center gap-1
                                                                ${isActive ? 'ring-2 ring-slate-900 scale-105 shadow-md' : 'opacity-80 hover:opacity-100'}
                                                                ${btnColor}
                                                            `}
                                                        >
                                                            {finish.code || 'BAS'}
                                                            {stone.code && <span className={STONE_TEXT_COLORS[stone.code] || 'text-slate-800'}>{stone.code}</span>}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}

                                    {/* Size Selector */}
                                    {sizingInfo && (
                                        <div>
                                            <label className="text-[10px] font-black text-slate-400 uppercase ml-1 mb-2 block flex items-center gap-1"><Hash size={10}/> Επιλογή {sizingInfo.type}</label>
                                            <div className="grid grid-cols-5 gap-2">
                                                {sizingInfo.sizes.map(s => (
                                                    <button 
                                                        key={s} 
                                                        onClick={() => setQmSize(s)}
                                                        className={`py-2 rounded-lg text-sm font-bold border ${qmSize === s ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200'}`}
                                                    >
                                                        {s}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Quantity & Actions */}
                                    <div className="grid grid-cols-4 gap-3 pt-2">
                                        <div className="col-span-4 flex items-center justify-between mb-2">
                                            <label className="text-xs font-bold text-slate-400 uppercase">Ποσότητα</label>
                                            <div className="flex items-center gap-3 bg-slate-50 rounded-lg p-1 border border-slate-200">
                                                <button onClick={() => setQmQty(Math.max(1, qmQty - 1))} className="w-8 h-8 flex items-center justify-center bg-white rounded shadow-sm text-slate-700 font-bold">-</button>
                                                <span className="w-8 text-center font-black">{qmQty}</span>
                                                <button onClick={() => setQmQty(qmQty + 1)} className="w-8 h-8 flex items-center justify-center bg-white rounded shadow-sm text-slate-700 font-bold">+</button>
                                            </div>
                                        </div>
                                        
                                        <button 
                                            onClick={() => executeQuickAction('add')}
                                            className="col-span-2 bg-emerald-500 text-white py-3 rounded-2xl font-black flex items-center justify-center gap-2 shadow-lg shadow-emerald-100 active:scale-95 transition-transform hover:bg-emerald-600"
                                        >
                                            <Plus size={20}/> Προσθήκη
                                        </button>
                                        <button 
                                            onClick={() => executeQuickAction('remove')}
                                            className="col-span-2 bg-rose-500 text-white py-3 rounded-2xl font-black flex items-center justify-center gap-2 shadow-lg shadow-rose-100 active:scale-95 transition-transform hover:bg-rose-600"
                                        >
                                            <Minus size={20}/> Αφαίρεση
                                        </button>
                                    </div>
                                </div>
                            )}
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

            {isEditingWarehouse && (
                <div className="fixed inset-0 z-[150] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white w-full max-w-sm rounded-3xl p-6 animate-in zoom-in-95">
                        <div className="flex justify-between items-center mb-4"><h3 className="font-bold text-lg">{warehouseForm.id ? 'Επεξεργασία' : 'Νέος Χώρος'}</h3><button onClick={() => setIsEditingWarehouse(false)}><X size={20}/></button></div>
                        <div className="space-y-3">
                            <input value={warehouseForm.name} onChange={e => setWarehouseForm({...warehouseForm, name: e.target.value})} placeholder="Όνομα" className="w-full p-3 bg-slate-50 border rounded-xl font-bold outline-none"/>
                            <select value={warehouseForm.type} onChange={e => setWarehouseForm({...warehouseForm, type: e.target.value as any})} className="w-full p-3 bg-slate-50 border rounded-xl outline-none"><option value="Store">Κατάστημα</option><option value="Showroom">Δειγματολόγιο</option><option value="Central">Αποθήκη</option><option value="Other">Άλλο</option></select>
                            <input value={warehouseForm.address} onChange={e => setWarehouseForm({...warehouseForm, address: e.target.value})} placeholder="Διεύθυνση" className="w-full p-3 bg-slate-50 border rounded-xl outline-none"/>
                            <button onClick={handleSaveWarehouse} className="w-full bg-emerald-600 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 mt-4"><Save size={18}/> Αποθήκευση</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
