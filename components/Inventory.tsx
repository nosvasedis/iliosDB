
import React, { useState, useMemo } from 'react';
import { Product, ProductVariant, Warehouse, Order, OrderStatus } from '../types';
import { Search, Filter, Store, ArrowLeftRight, Package, X, Plus, Trash2, Edit2, RefreshCw, ArrowRight, ArrowDown, ShoppingBag, AlertTriangle, CheckCircle, Info } from 'lucide-react';
import ProductDetails from './ProductDetails';
import { useUI } from './UIProvider';
import { api, SYSTEM_IDS } from '../lib/supabase';
import { useQuery, useQueryClient } from '@tanstack/react-query';

interface Props {
  products: Product[];
  setPrintItems: (items: { product: Product; variant?: ProductVariant; quantity: number }[]) => void;
  settings: any;
  collections: any[];
}

export default function Inventory({ products, setPrintItems, settings, collections }: Props) {
  const [activeTab, setActiveTab] = useState<'stock' | 'warehouses'>('stock');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  
  // Data Fetching
  const { data: warehouses } = useQuery({ queryKey: ['warehouses'], queryFn: api.getWarehouses });
  const { data: orders } = useQuery({ queryKey: ['orders'], queryFn: api.getOrders });
  
  const queryClient = useQueryClient();
  const { showToast, confirm } = useUI();

  // Warehouse Management State
  const [isEditingWarehouse, setIsEditingWarehouse] = useState(false);
  const [warehouseForm, setWarehouseForm] = useState<Partial<Warehouse>>({ name: '', type: 'Store', address: '' });
  
  // Transfer Logic State
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [transferProduct, setTransferProduct] = useState<Product | null>(null);
  const [sourceId, setSourceId] = useState<string>(SYSTEM_IDS.CENTRAL);
  const [targetId, setTargetId] = useState<string>(SYSTEM_IDS.SHOWROOM);
  const [transferQty, setTransferQty] = useState(1);
  const [isTransferring, setIsTransferring] = useState(false);

  // Helper to display warehouse types nicely
  const getWarehouseTypeLabel = (type: string, id?: string) => {
      if (id === SYSTEM_IDS.SHOWROOM) return 'Samples'; 
      switch (type) {
          case 'Central': return 'Κεντρική Διάθεση';
          case 'Showroom': return 'Samples';
          case 'Store': return 'Κατάστημα';
          case 'Warehouse': return 'Αποθήκη';
          default: return type;
      }
  };

  // Helper to get warehouse name (overriding system default if needed)
  const getWarehouseName = (w: Warehouse) => {
      if (w.id === SYSTEM_IDS.SHOWROOM && (w.name === 'Showroom' || w.name === 'Δειγματολόγιο')) return 'Samples';
      return w.name;
  };

  // --- LOGIC: Compute Demand & Stock Status ---
  const productsWithStockOrDemand = useMemo(() => {
      if (!orders) return [];

      const pendingOrders = orders.filter(o => o.status === OrderStatus.Pending);
      
      // Map required SKUs from pending orders
      const demandMap: Record<string, { qty: number, orderIds: string[] }> = {};
      
      pendingOrders.forEach(o => {
          o.items.forEach(item => {
              if (!demandMap[item.sku]) {
                  demandMap[item.sku] = { qty: 0, orderIds: [] };
              }
              demandMap[item.sku].qty += item.quantity;
              if (!demandMap[item.sku].orderIds.includes(o.id)) {
                  demandMap[item.sku].orderIds.push(o.id);
              }
          });
      });

      // Filter products: Must have stock somewhere OR be in demand
      return products.map(p => {
          const totalStock = p.stock_qty + (p.sample_qty || 0) + Object.values(p.location_stock || {}).reduce((a,b) => a+b, 0) - p.stock_qty - (p.sample_qty||0); 
          const realTotalStock = Object.values(p.location_stock || {}).reduce((acc, val) => acc + val, 0);

          const demand = demandMap[p.sku];
          
          return {
              ...p,
              total_stock: realTotalStock,
              demand_qty: demand ? demand.qty : 0,
              demand_orders: demand ? demand.orderIds : []
          };
      }).filter(p => p.total_stock > 0 || p.demand_qty > 0)
        .filter(p => p.sku.includes(searchTerm.toUpperCase()) || p.category.toLowerCase().includes(searchTerm.toLowerCase()));

  }, [products, orders, searchTerm]);

  // --- WAREHOUSE ACTIONS ---
  const handleEditWarehouse = (w: Warehouse) => { setWarehouseForm(w); setIsEditingWarehouse(true); };
  const handleCreateWarehouse = () => { setWarehouseForm({ name: '', type: 'Store', address: '' }); setIsEditingWarehouse(true); };
  
  const saveWarehouse = async () => {
      if (!warehouseForm.name) { showToast("Το όνομα είναι υποχρεωτικό.", "error"); return; }
      try {
          if (warehouseForm.id) await api.updateWarehouse(warehouseForm.id, warehouseForm as Warehouse);
          else await api.saveWarehouse(warehouseForm);
          queryClient.invalidateQueries({ queryKey: ['warehouses'] });
          setIsEditingWarehouse(false);
          showToast("Αποθηκεύτηκε επιτυχώς.", "success");
      } catch (e) { showToast("Σφάλμα αποθήκευσης.", "error"); }
  };

  const handleDeleteWarehouse = async (id: string) => {
      if (!await confirm({ title: 'Διαγραφή Χώρου', message: 'ΠΡΟΣΟΧΗ: Θα διαγραφούν και όλα τα αποθέματα που βρίσκονται σε αυτόν τον χώρο.', isDestructive: true })) return;
      try {
          await api.deleteWarehouse(id);
          queryClient.invalidateQueries({ queryKey: ['warehouses'] });
          showToast("Ο χώρος διαγράφηκε.", "info");
      } catch (e) { showToast("Σφάλμα διαγραφής.", "error"); }
  };

  // --- TRANSFER ACTIONS ---
  const openTransfer = (p: Product) => {
      setTransferProduct(p);
      setSourceId(SYSTEM_IDS.CENTRAL);
      setTargetId(SYSTEM_IDS.SHOWROOM);
      setTransferQty(1);
      setTransferModalOpen(true);
  };

  const getStockFor = (locationId: string): number => {
      if (!transferProduct) return 0;
      return transferProduct.location_stock?.[locationId] || 0;
  };

  const executeTransfer = async () => {
      if (!transferProduct || sourceId === targetId) return;
      if (transferQty > getStockFor(sourceId)) { showToast("Ανεπαρκές απόθεμα.", "error"); return; }
      setIsTransferring(true);
      try {
          await api.transferStock(transferProduct.sku, sourceId, targetId, transferQty);
          queryClient.invalidateQueries({ queryKey: ['products'] });
          showToast("Η μεταφορά ολοκληρώθηκε.", "success");
          setTransferModalOpen(false);
      } catch (e: any) { showToast(`Σφάλμα: ${e.message}`, "error"); } 
      finally { setIsTransferring(false); }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
         <div>
            <h1 className="text-3xl font-bold text-slate-800 tracking-tight flex items-center gap-3">
                <div className="p-2 bg-slate-800 text-white rounded-xl">
                    <Store size={24} />
                </div>
                Κέντρο Αποθήκης
            </h1>
            <p className="text-slate-500 mt-1 ml-14">Διαχείριση φυσικού αποθέματος και παραγγελιών.</p>
         </div>
         
         <div className="flex bg-slate-100 p-1 rounded-xl">
            <button onClick={() => setActiveTab('stock')} className={`px-6 py-2.5 rounded-lg font-bold text-sm transition-all flex items-center gap-2 ${activeTab === 'stock' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                <Package size={16}/> Απόθεμα
            </button>
            <button onClick={() => setActiveTab('warehouses')} className={`px-6 py-2.5 rounded-lg font-bold text-sm transition-all flex items-center gap-2 ${activeTab === 'warehouses' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                <Store size={16}/> Χώροι
            </button>
         </div>
      </div>

      {activeTab === 'stock' && (
          <div className="space-y-4 animate-in slide-in-from-bottom-2">
              {/* Search */}
              <div className="relative max-w-md">
                 <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                 <input 
                   type="text" 
                   placeholder="Αναζήτηση σε στοκ..." 
                   value={searchTerm}
                   onChange={(e) => setSearchTerm(e.target.value)}
                   className="pl-12 pr-4 py-3 border border-slate-200 rounded-xl focus:ring-4 focus:ring-slate-500/10 focus:border-slate-500 outline-none w-full bg-white transition-all text-slate-900 shadow-sm"
                 />
              </div>

              {/* Enhanced Stock Table/Cards */}
              <div className="grid grid-cols-1 gap-4">
                  {productsWithStockOrDemand.map(product => {
                      const hasDemand = product.demand_qty > 0;
                      const inStock = product.total_stock > 0;
                      const canFulfill = inStock && product.total_stock >= product.demand_qty;
                      
                      return (
                          <div key={product.sku} className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all flex flex-col md:flex-row items-center gap-6 group">
                              {/* Product Info */}
                              <div className="flex items-center gap-4 flex-1 w-full md:w-auto">
                                  <div className="w-16 h-16 bg-slate-50 rounded-xl overflow-hidden shrink-0 relative">
                                      <img src={product.image_url} alt={product.sku} className="w-full h-full object-cover"/>
                                      {hasDemand && (
                                          <div className="absolute top-0 right-0 bg-red-500 text-white p-1 rounded-bl-lg shadow-sm">
                                              <ShoppingBag size={12} fill="currentColor" />
                                          </div>
                                      )}
                                  </div>
                                  <div>
                                      <h3 className="font-bold text-lg text-slate-800 group-hover:text-blue-600 transition-colors cursor-pointer" onClick={() => setSelectedProduct(product)}>{product.sku}</h3>
                                      <p className="text-xs text-slate-500 font-medium">{product.category}</p>
                                  </div>
                              </div>

                              {/* Stock Distribution Visualization */}
                              <div className="flex-1 flex gap-2 overflow-x-auto w-full md:w-auto scrollbar-hide py-2">
                                   {Object.entries(product.location_stock || {}).map(([whId, qty]) => {
                                       if (qty <= 0) return null;
                                       const whObj = warehouses?.find(w => w.id === whId);
                                       const whName = whObj ? getWarehouseName(whObj) : 'Unknown';
                                       const isCentral = whId === SYSTEM_IDS.CENTRAL;
                                       return (
                                           <div key={whId} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-bold whitespace-nowrap ${isCentral ? 'bg-slate-50 border-slate-200 text-slate-700' : 'bg-blue-50 border-blue-100 text-blue-700'}`}>
                                               <span className="text-[10px] uppercase opacity-70">{whName.substring(0, 8)}..</span>
                                               <span className="text-base">{qty}</span>
                                           </div>
                                       );
                                   })}
                              </div>

                              {/* Demand Alert Logic */}
                              {hasDemand && (
                                  <div className={`flex items-center gap-3 px-4 py-2 rounded-xl border w-full md:w-auto justify-center ${canFulfill ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-orange-50 border-orange-200 text-orange-800'}`}>
                                      {canFulfill ? <CheckCircle size={20} className="text-emerald-600"/> : <AlertTriangle size={20} className="text-orange-500"/>}
                                      <div className="text-xs font-bold">
                                          <div className="uppercase tracking-wide opacity-70">Ζητηση</div>
                                          <div className="text-sm">
                                              {canFulfill ? 'Έτοιμο για αποστολή' : 'Έλλειψη στοκ'} ({product.demand_qty} τεμ)
                                          </div>
                                      </div>
                                  </div>
                              )}

                              {/* Actions */}
                              <div className="flex items-center gap-2 w-full md:w-auto justify-end border-t md:border-t-0 pt-3 md:pt-0 mt-3 md:mt-0">
                                  <button onClick={() => openTransfer(product)} className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-xl font-bold text-sm transition-colors">
                                      <ArrowLeftRight size={16}/> Μεταφορά
                                  </button>
                                  <button onClick={() => setSelectedProduct(product)} className="bg-slate-900 text-white p-2.5 rounded-xl hover:bg-slate-800 transition-colors">
                                      <Edit2 size={16}/>
                                  </button>
                              </div>
                          </div>
                      );
                  })}
                  {productsWithStockOrDemand.length === 0 && (
                      <div className="text-center py-20 text-slate-400">
                          <Package size={48} className="mx-auto mb-4 opacity-20"/>
                          <p className="font-medium">Η αποθήκη είναι άδεια ή δεν υπάρχουν ενεργές παραγγελίες.</p>
                      </div>
                  )}
              </div>
          </div>
      )}

      {activeTab === 'warehouses' && (
           <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in slide-in-from-right duration-300">
               {warehouses?.map(wh => (
                   <div key={wh.id} className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 relative overflow-hidden group hover:-translate-y-1 transition-transform">
                       <div className="flex justify-between items-start mb-4">
                           <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${wh.is_system ? 'bg-slate-100 text-slate-600' : 'bg-blue-50 text-blue-600'}`}>
                               <Store size={24} />
                           </div>
                           {!wh.is_system && (
                               <div className="flex gap-2">
                                   <button onClick={() => handleEditWarehouse(wh)} className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-700 transition-colors"><Edit2 size={16}/></button>
                                   <button onClick={() => handleDeleteWarehouse(wh.id)} className="p-2 hover:bg-red-50 rounded-lg text-slate-400 hover:text-red-500 transition-colors"><Trash2 size={16}/></button>
                               </div>
                           )}
                       </div>
                       <h3 className="text-xl font-bold text-slate-800">{getWarehouseName(wh)}</h3>
                       <p className="text-slate-500 text-sm mt-1">{getWarehouseTypeLabel(wh.type, wh.id)}</p>
                       
                       {/* Only show ID for non-system warehouses */}
                       {!wh.is_system && (
                           <div className="mt-4 text-xs font-mono text-slate-400">{wh.id.split('-')[0]}...</div>
                       )}
                   </div>
               ))}
               <button onClick={handleCreateWarehouse} className="border-2 border-dashed border-slate-200 rounded-3xl p-6 flex flex-col items-center justify-center text-slate-400 hover:border-slate-300 hover:bg-slate-50 transition-all min-h-[200px]">
                   <Plus size={32} className="mb-2"/>
                   <span className="font-bold">Νέος Χώρος</span>
               </button>
           </div>
      )}

      {/* MODALS */}
      {isEditingWarehouse && (
          <div className="fixed inset-0 z-[150] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl p-8 animate-in zoom-in-95 border border-slate-100">
                  <div className="flex justify-between items-center mb-6">
                      <h3 className="text-xl font-bold text-slate-800">{warehouseForm.id ? 'Επεξεργασία' : 'Νέος Χώρος'}</h3>
                      <button onClick={() => setIsEditingWarehouse(false)}><X size={20}/></button>
                  </div>
                  <div className="space-y-4">
                      <input className="w-full p-3 border rounded-xl" value={warehouseForm.name} onChange={e => setWarehouseForm({...warehouseForm, name: e.target.value})} placeholder="Όνομασία"/>
                      <select className="w-full p-3 border rounded-xl bg-white" value={warehouseForm.type} onChange={e => setWarehouseForm({...warehouseForm, type: e.target.value as any})}>
                          <option value="Store">Κατάστημα</option><option value="Warehouse">Αποθήκη</option><option value="Showroom">Samples</option>
                      </select>
                      <button onClick={saveWarehouse} className="w-full bg-slate-900 text-white py-3 rounded-xl font-bold hover:bg-slate-800">Αποθήκευση</button>
                  </div>
              </div>
          </div>
      )}

      {transferModalOpen && transferProduct && (
          <div className="fixed inset-0 z-[150] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 border border-slate-100 flex flex-col">
                  <div className="bg-slate-50 p-6 border-b border-slate-100 flex justify-between items-center">
                      <div className="flex items-center gap-4">
                           <img src={transferProduct.image_url} className="w-16 h-16 rounded-xl object-cover bg-white border border-slate-200" alt="thumb"/>
                           <div><h3 className="text-xl font-bold text-slate-800">{transferProduct.sku}</h3><p className="text-slate-500 text-sm">Μεταφορά Αποθέματος</p></div>
                      </div>
                      <button onClick={() => setTransferModalOpen(false)} className="p-2 hover:bg-slate-200 rounded-full text-slate-400 hover:text-slate-600"><X size={20}/></button>
                  </div>
                  <div className="p-8 space-y-6">
                      <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                          <div className="flex-1 w-full"><label className="text-xs font-bold text-slate-400 uppercase">Από</label><select className="w-full p-3 border rounded-xl font-bold" value={sourceId} onChange={e => setSourceId(e.target.value)}>{warehouses?.map(w => <option key={w.id} value={w.id} disabled={w.id===targetId}>{getWarehouseName(w)} ({transferProduct.location_stock?.[w.id] || 0})</option>)}</select></div>
                          <ArrowRight className="text-slate-300 hidden md:block" />
                          <div className="flex-1 w-full"><label className="text-xs font-bold text-slate-400 uppercase">Προς</label><select className="w-full p-3 border rounded-xl font-bold" value={targetId} onChange={e => setTargetId(e.target.value)}>{warehouses?.map(w => <option key={w.id} value={w.id} disabled={w.id===sourceId}>{getWarehouseName(w)} ({transferProduct.location_stock?.[w.id] || 0})</option>)}</select></div>
                      </div>
                      <div className="bg-slate-50 p-4 rounded-xl flex items-center justify-between">
                          <span className="font-bold text-slate-600">Ποσότητα</span>
                          <input type="number" min="1" max={getStockFor(sourceId)} value={transferQty} onChange={e => setTransferQty(parseInt(e.target.value))} className="w-24 text-center p-2 rounded-lg border font-bold text-lg"/>
                      </div>
                      <button onClick={executeTransfer} disabled={isTransferring} className="w-full bg-slate-900 text-white py-4 rounded-xl font-bold hover:bg-slate-800 transition-all">{isTransferring ? 'Μεταφορά...' : 'Επιβεβαίωση'}</button>
                  </div>
              </div>
          </div>
      )}

      {selectedProduct && (
        <ProductDetails 
          product={selectedProduct} 
          allProducts={products}
          allMaterials={[]} // Not needed for stock view
          onClose={() => setSelectedProduct(null)}
          setPrintItems={setPrintItems}
          settings={settings}
          collections={collections}
          viewMode="warehouse" // Hides Definitions/Costing
        />
      )}
    </div>
  );
}
