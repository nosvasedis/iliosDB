
import React, { useState, useMemo } from 'react';
import { Product, Warehouse } from '../../types';
import { Search, Box, MapPin, ImageIcon, Camera, Store, Plus, Trash2, Edit2, X, Save } from 'lucide-react';
import { formatCurrency, findProductByScannedCode } from '../../utils/pricingEngine';
import { useUI } from '../UIProvider';
import BarcodeScanner from '../BarcodeScanner';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, SYSTEM_IDS } from '../../lib/supabase';

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
            onProductSelect(match.product);
            setShowScanner(false);
            showToast(`Βρέθηκε: ${match.product.sku}`, 'success');
        } else {
            showToast(`Ο κωδικός ${code} δεν βρέθηκε.`, 'error');
        }
    };

    // Warehouse Logic
    const handleEditWarehouse = (w: Warehouse) => { setWarehouseForm(w); setIsEditingWarehouse(true); }
    const handleCreateWarehouse = () => { setWarehouseForm({ name: '', type: 'Store', address: '' }); setIsEditingWarehouse(true); }
    
    const handleSaveWarehouse = async () => { 
        if (!warehouseForm.name) return; 
        try { 
            if (warehouseForm.id) { 
                await api.updateWarehouse(warehouseForm.id, warehouseForm); 
                showToast("Ο χώρος ενημερώθηκε.", "success"); 
            } else { 
                await api.saveWarehouse(warehouseForm); 
                showToast("Ο χώρος δημιουργήθηκε.", "success"); 
            } 
            queryClient.invalidateQueries({ queryKey: ['warehouses'] }); 
            setIsEditingWarehouse(false); 
        } catch (err) { 
            showToast("Σφάλμα αποθήκευσης.", "error"); 
        } 
    };

    const handleDeleteWarehouse = async (id: string) => { 
        if (id === SYSTEM_IDS.CENTRAL || id === SYSTEM_IDS.SHOWROOM) { showToast("Δεν διαγράφεται.", "error"); return; } 
        if (await confirm({ title: 'Διαγραφή Χώρου', message: 'Είστε σίγουροι;', isDestructive: true, confirmText: 'Διαγραφή' })) { 
            await api.deleteWarehouse(id); 
            queryClient.invalidateQueries({ queryKey: ['warehouses'] }); 
        } 
    };

    return (
        <div className="p-4 h-full flex flex-col">
            <h1 className="text-2xl font-black text-slate-900 mb-4">Αποθήκη</h1>
            
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
