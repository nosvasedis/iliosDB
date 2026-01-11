
import React, { useState, useMemo, useRef } from 'react';
import { Product, Warehouse } from '../../types';
import { Search, Box, MapPin, ImageIcon, Camera, Store, Plus, Trash2, Edit2, X, Save, ArrowDown, ArrowUp, History, Minus, CheckCircle, ScanBarcode } from 'lucide-react';
import { formatCurrency, findProductByScannedCode } from '../../utils/pricingEngine';
import { useUI } from '../UIProvider';
import BarcodeScanner from '../BarcodeScanner';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, SYSTEM_IDS, recordStockMovement, supabase } from '../../lib/supabase';

interface Props {
  products: Product[];
  onProductSelect: (p: Product) => void;
}

// ... (Previous subcomponents)
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
    const [qmSku, setQmSku] = useState('');
    const [qmQty, setQmQty] = useState(1);
    const [qmWarehouse, setQmWarehouse] = useState(SYSTEM_IDS.CENTRAL);
    const [qmMode, setQmMode] = useState<'add' | 'remove'>('add');
    const [qmHistory, setQmHistory] = useState<{sku: string, qty: number, type: 'add'|'remove', time: Date}[]>([]);

    // Warehouse State
    const [isEditingWarehouse, setIsEditingWarehouse] = useState(false);
    const [warehouseForm, setWarehouseForm] = useState<Partial<Warehouse>>({ name: '', type: 'Store', address: '' });

    const { showToast, confirm } = useUI();
    const queryClient = useQueryClient();
    const { data: warehouses } = useQuery({ queryKey: ['warehouses'], queryFn: api.getWarehouses });

    // Inventory List Logic
    const inventoryList = useMemo(() => {
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
            .filter(item => item.totalStock > 0)
            .filter(item => {
                if (!search) return true;
                return item.product.sku.toLowerCase().includes(lower) || 
                       item.product.category.toLowerCase().includes(lower);
            })
            .slice(0, 50);
    }, [products, search]);

    const handleScan = (code: string) => {
        const match = findProductByScannedCode(code, products);
        if (match) {
            if (showQuickManager) {
                // If in Quick Manager, populate the field
                setQmSku(match.product.sku + (match.variant?.suffix || ''));
                setShowScanner(false);
                showToast("Κωδικός αναγνωρίστηκε.", "success");
            } else {
                // Otherwise navigate to details
                onProductSelect(match.product);
                setShowScanner(false);
                showToast(`Βρέθηκε: ${match.product.sku}`, 'success');
            }
        } else {
            showToast(`Ο κωδικός ${code} δεν βρέθηκε.`, 'error');
        }
    };

    const executeQuickAction = async () => {
        if (!qmSku) { showToast("Εισάγετε SKU.", "error"); return; }
        const match = findProductByScannedCode(qmSku, products);
        if (!match) { showToast("Ο κωδικός δεν βρέθηκε.", "error"); return; }
        
        const { product, variant } = match;
        const targetSku = product.sku;
        const targetSuffix = variant?.suffix || null;
        const qty = qmMode === 'add' ? qmQty : -qmQty;
        const warehouseName = warehouses?.find(w => w.id === qmWarehouse)?.name || 'Unknown';

        try {
            // Determine update logic (Central/Showroom vs Custom)
            const isCentral = qmWarehouse === SYSTEM_IDS.CENTRAL;
            const isShowroom = qmWarehouse === SYSTEM_IDS.SHOWROOM;

            if (variant) {
                // Variant Logic
                if (isCentral) {
                    await supabase.from('product_variants').update({ stock_qty: Math.max(0, (variant.stock_qty || 0) + qty) }).match({ product_sku: targetSku, suffix: targetSuffix });
                } else {
                    // Custom Warehouse or Showroom (variants usually don't have distinct showroom col, mapped to location_stock)
                    const currentLocStock = variant.location_stock?.[qmWarehouse] || 0;
                    await supabase.from('product_stock').upsert({
                        product_sku: targetSku,
                        variant_suffix: targetSuffix,
                        warehouse_id: qmWarehouse,
                        quantity: Math.max(0, currentLocStock + qty)
                    }, { onConflict: 'product_sku, warehouse_id, variant_suffix' });
                }
            } else {
                // Master Product Logic
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

            await recordStockMovement(targetSku, qty, `Quick Mobile: ${warehouseName}`, targetSuffix || undefined);
            
            // UI Updates
            setQmHistory(prev => [{ sku: qmSku, qty: qmQty, type: qmMode, time: new Date() }, ...prev].slice(0, 5));
            queryClient.invalidateQueries({ queryKey: ['products'] });
            showToast(`${qmMode === 'add' ? 'Προστέθηκαν' : 'Αφαιρέθηκαν'} ${qmQty} τεμ.`, "success");
            
            // Reset for next scan
            setQmSku('');
            setQmQty(1);
        } catch (e) {
            console.error(e);
            showToast("Σφάλμα ενημέρωσης.", "error");
        }
    };

    // ... (Warehouse CRUD logic remains same)
    const handleEditWarehouse = (w: Warehouse) => { setWarehouseForm(w); setIsEditingWarehouse(true); }
    const handleCreateWarehouse = () => { setWarehouseForm({ name: '', type: 'Store', address: '' }); setIsEditingWarehouse(true); }
    const handleSaveWarehouse = async () => { if (!warehouseForm.name) return; try { if (warehouseForm.id) { await api.updateWarehouse(warehouseForm.id, warehouseForm); showToast("Ο χώρος ενημερώθηκε.", "success"); } else { await api.saveWarehouse(warehouseForm); showToast("Ο χώρος δημιουργήθηκε.", "success"); } queryClient.invalidateQueries({ queryKey: ['warehouses'] }); setIsEditingWarehouse(false); } catch (err) { showToast("Σφάλμα αποθήκευσης.", "error"); } };
    const handleDeleteWarehouse = async (id: string) => { if (id === SYSTEM_IDS.CENTRAL || id === SYSTEM_IDS.SHOWROOM) { showToast("Δεν διαγράφεται.", "error"); return; } if (await confirm({ title: 'Διαγραφή Χώρου', message: 'Είστε σίγουροι;', isDestructive: true, confirmText: 'Διαγραφή' })) { await api.deleteWarehouse(id); queryClient.invalidateQueries({ queryKey: ['warehouses'] }); } };

    return (
        <div className="p-4 h-full flex flex-col">
            <div className="flex justify-between items-center mb-4">
                <h1 className="text-2xl font-black text-slate-900">Αποθήκη</h1>
                <button 
                    onClick={() => setShowQuickManager(true)}
                    className="bg-[#060b00] text-white px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-2 shadow-lg active:scale-95 transition-transform"
                >
                    <ArrowDown size={16}/> +/- Quick Stock
                </button>
            </div>
            
            {/* Tabs */}
            <div className="flex p-1 bg-slate-100 rounded-xl mb-4 shrink-0">
                <button onClick={() => setActiveTab('stock')} className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === 'stock' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>Απόθεμα</button>
                <button onClick={() => setActiveTab('warehouses')} className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === 'warehouses' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>Χώροι</button>
            </div>

            {activeTab === 'stock' && (
                <>
                    <div className="flex gap-2 mb-4 shrink-0">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                            <input type="text" placeholder="Αναζήτηση..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-10 p-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 shadow-sm font-medium"/>
                        </div>
                        <button onClick={() => setShowScanner(true)} className="bg-slate-900 text-white p-3 rounded-xl shadow-md active:scale-95 transition-transform"><Camera size={20} /></button>
                    </div>

                    <div className="flex-1 overflow-y-auto space-y-3 pb-24 custom-scrollbar">
                        {inventoryList.map(item => (
                            <MobileInventoryItem key={item.product.sku} product={item.product} totalStock={item.totalStock} onClick={() => onProductSelect(item.product)} />
                        ))}
                        {inventoryList.length === 0 && <div className="text-center py-10 text-slate-400 text-sm font-medium flex flex-col items-center"><Box size={32} className="mb-2 opacity-50"/>Δεν βρέθηκε απόθεμα.<br/><span className="text-xs opacity-70 mt-1">Ελέγξτε το Μητρώο για κωδικούς χωρίς στοκ.</span></div>}
                    </div>
                </>
            )}

            {activeTab === 'warehouses' && (
                <div className="flex-1 overflow-y-auto pb-24 custom-scrollbar space-y-4">
                    <button onClick={handleCreateWarehouse} className="w-full py-3 bg-slate-900 text-white rounded-xl font-bold flex items-center justify-center gap-2 shadow-md mb-2"><Plus size={18}/> Νέος Χώρος</button>
                    {warehouses?.map(w => (
                        <div key={w.id} className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className={`p-2 rounded-lg ${w.is_system ? 'bg-amber-100 text-amber-600' : 'bg-blue-50 text-blue-600'}`}><Store size={20}/></div>
                                <div>
                                    <div className="font-bold text-slate-800">{w.name}</div>
                                    <div className="text-xs text-slate-500">{w.type}</div>
                                </div>
                            </div>
                            {!w.is_system && (
                                <div className="flex gap-2">
                                    <button onClick={() => handleEditWarehouse(w)} className="p-2 text-slate-400 hover:text-blue-500 bg-slate-50 rounded-lg"><Edit2 size={16}/></button>
                                    <button onClick={() => handleDeleteWarehouse(w.id)} className="p-2 text-slate-400 hover:text-red-500 bg-slate-50 rounded-lg"><Trash2 size={16}/></button>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {showScanner && <BarcodeScanner onScan={handleScan} onClose={() => setShowScanner(false)} />}

            {/* QUICK STOCK MANAGER MODAL */}
            {showQuickManager && (
                <div className="fixed inset-0 z-[150] bg-black/60 backdrop-blur-sm flex flex-col justify-end p-4 animate-in slide-in-from-bottom-10">
                    <div className="bg-white w-full rounded-3xl p-6 shadow-2xl space-y-5" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center border-b border-slate-100 pb-4">
                            <h3 className="font-black text-xl text-slate-900 flex items-center gap-2"><ScanBarcode className="text-emerald-600"/> Quick Stock</h3>
                            <button onClick={() => setShowQuickManager(false)} className="p-2 bg-slate-100 rounded-full text-slate-500"><X size={20}/></button>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="text-xs font-bold text-slate-400 uppercase ml-1 mb-1 block">Αποθήκη</label>
                                <select 
                                    value={qmWarehouse} 
                                    onChange={e => setQmWarehouse(e.target.value)} 
                                    className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 outline-none"
                                >
                                    {warehouses?.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                                </select>
                            </div>

                            <div className="flex gap-3">
                                <div className="flex-1">
                                    <label className="text-xs font-bold text-slate-400 uppercase ml-1 mb-1 block">SKU / Κωδικός</label>
                                    <div className="flex items-center gap-2">
                                        <input 
                                            value={qmSku} 
                                            onChange={e => setQmSku(e.target.value.toUpperCase())} 
                                            className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold text-lg outline-none uppercase"
                                            placeholder="SCAN..."
                                        />
                                        <button onClick={() => setShowScanner(true)} className="p-3.5 bg-slate-900 text-white rounded-xl shadow-md active:scale-95"><Camera size={24}/></button>
                                    </div>
                                </div>
                                <div className="w-24">
                                    <label className="text-xs font-bold text-slate-400 uppercase ml-1 mb-1 block">Ποσότητα</label>
                                    <input 
                                        type="number" 
                                        value={qmQty} 
                                        onChange={e => setQmQty(parseInt(e.target.value) || 1)} 
                                        className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl font-black text-lg text-center outline-none"
                                    />
                                </div>
                            </div>

                            <div className="flex gap-3 pt-2">
                                <button 
                                    onClick={() => { setQmMode('add'); setTimeout(executeQuickAction, 50); }}
                                    className="flex-1 bg-emerald-500 text-white py-4 rounded-2xl font-black flex items-center justify-center gap-2 shadow-lg shadow-emerald-100 active:scale-95 transition-transform"
                                >
                                    <Plus size={24}/> Προσθήκη
                                </button>
                                <button 
                                    onClick={() => { setQmMode('remove'); setTimeout(executeQuickAction, 50); }}
                                    className="flex-1 bg-rose-500 text-white py-4 rounded-2xl font-black flex items-center justify-center gap-2 shadow-lg shadow-rose-100 active:scale-95 transition-transform"
                                >
                                    <Minus size={24}/> Αφαίρεση
                                </button>
                            </div>
                        </div>

                        {qmHistory.length > 0 && (
                            <div className="pt-4 border-t border-slate-100">
                                <h4 className="text-xs font-bold text-slate-400 uppercase mb-2 flex items-center gap-1"><History size={12}/> Ιστορικό Συνεδρίας</h4>
                                <div className="space-y-2">
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
