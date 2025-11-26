
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Product, ProductVariant, Warehouse, Order, OrderStatus } from '../types';
import { Search, Store, ArrowLeftRight, Package, X, Plus, Trash2, Edit2, ArrowRight, ShoppingBag, AlertTriangle, CheckCircle, Zap, ScanBarcode } from 'lucide-react';
import ProductDetails from './ProductDetails';
import { useUI } from './UIProvider';
import { api, SYSTEM_IDS, recordStockMovement, supabase } from '../lib/supabase';
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

  // --- SMART SCANNER STATE ---
  const [scanSku, setScanSku] = useState('');
  const [scanSuggestion, setScanSuggestion] = useState('');
  const [scanTargetId, setScanTargetId] = useState<string>(SYSTEM_IDS.CENTRAL);
  const [scanQty, setScanQty] = useState(1);
  const inputRef = useRef<HTMLInputElement>(null);

  // Helper to display warehouse types nicely
  const getWarehouseNameClean = (w: Warehouse) => {
      if (w.id === SYSTEM_IDS.CENTRAL) return 'Κεντρική Αποθήκη';
      if (w.id === SYSTEM_IDS.SHOWROOM || w.type === 'Showroom' || w.name === 'Showroom') return 'Δειγματολόγιο';
      return w.name;
  };

  // --- LOGIC: Compute Demand & Stock Status ---
  const productsWithStockOrDemand = useMemo(() => {
      if (!orders) return [];

      const pendingOrders = orders.filter(o => o.status === OrderStatus.Pending);
      
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

      return products.map(p => {
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

  // --- SMART SCANNER LOGIC ---
  const handleScanInput = (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value.toUpperCase();
      setScanSku(val);
      
      if (val.length > 0) {
          // Find first matching SKU that starts with input
          const match = products.find(p => p.sku.startsWith(val));
          if (match) {
              setScanSuggestion(match.sku);
          } else {
              setScanSuggestion('');
          }
      } else {
          setScanSuggestion('');
      }
  };

  const handleScanKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      // Autocomplete on Right Arrow
      if (e.key === 'ArrowRight' && scanSuggestion) {
          e.preventDefault();
          setScanSku(scanSuggestion);
      }
      // Submit on Enter
      if (e.key === 'Enter') {
          e.preventDefault();
          executeQuickAdd();
      }
  };

  const executeQuickAdd = async () => {
      const targetSku = scanSuggestion || scanSku;
      const product = products.find(p => p.sku === targetSku);
      
      if (!product) {
          showToast(`Ο κωδικός ${targetSku} δεν βρέθηκε.`, "error");
          return;
      }
      
      try {
          const whName = warehouses?.find(w => w.id === scanTargetId)?.name || 'Αποθήκη';
          
          if (scanTargetId === SYSTEM_IDS.CENTRAL) {
              const newQty = product.stock_qty + scanQty;
              await supabase.from('products').update({ stock_qty: newQty }).eq('sku', product.sku);
          } else if (scanTargetId === SYSTEM_IDS.SHOWROOM) {
              const newQty = (product.sample_qty || 0) + scanQty;
              await supabase.from('products').update({ sample_qty: newQty }).eq('sku', product.sku);
          } else {
              // Custom Warehouse
              const currentStock = product.location_stock?.[scanTargetId] || 0;
              const newQty = currentStock + scanQty;
              await supabase.from('product_stock').upsert({ 
                  product_sku: product.sku, 
                  warehouse_id: scanTargetId, 
                  quantity: newQty 
              });
          }

          await recordStockMovement(product.sku, scanQty, `Quick Add: ${whName}`);
          queryClient.invalidateQueries({ queryKey: ['products'] });
          
          showToast(`Προστέθηκαν ${scanQty} τεμ. στον κωδικό ${product.sku}`, "success");
          
          // Reset but keep focus
          setScanSku('');
          setScanSuggestion('');
          setScanQty(1);
          inputRef.current?.focus();

      } catch (err) {
          showToast("Σφάλμα ενημέρωσης.", "error");
      }
  };

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
          <div className="space-y-6 animate-in slide-in-from-bottom-2">
              
              {/* --- SMART SCANNER BAR --- */}
              <div className="bg-slate-900 p-5 rounded-2xl shadow-lg flex flex-col lg:flex-row items-center gap-4 border border-slate-800">
                  <div className="flex items-center gap-2 text-white/80 font-bold shrink-0">
                      <ScanBarcode size={24} className="text-amber-400" /> 
                      <span className="uppercase tracking-wider text-sm">Γρήγορη Εισαγωγή</span>
                  </div>
                  
                  <div className="flex-1 w-full grid grid-cols-1 md:grid-cols-12 gap-3">
                      {/* Target Warehouse Selector */}
                      <div className="md:col-span-3">
                          <select 
                            value={scanTargetId} 
                            onChange={(e) => setScanTargetId(e.target.value)}
                            className="w-full bg-slate-800 text-white font-bold p-3 rounded-xl border border-slate-700 focus:ring-2 focus:ring-amber-500 outline-none cursor-pointer"
                          >
                             {warehouses?.map(w => (
                                 <option key={w.id} value={w.id}>{getWarehouseNameClean(w)}</option>
                             ))}
                          </select>
                      </div>

                      {/* Smart Input */}
                      <div className="md:col-span-6 relative">
                          {/* Ghost Text */}
                          <div className="absolute inset-0 p-3 pointer-events-none font-mono text-lg tracking-wider flex items-center">
                              <span className="text-transparent">{scanSku}</span>
                              <span className="text-slate-600">
                                  {scanSuggestion.startsWith(scanSku) ? scanSuggestion.substring(scanSku.length) : ''}
                              </span>
                          </div>
                          
                          <input 
                              ref={inputRef}
                              type="text" 
                              value={scanSku}
                              onChange={handleScanInput}
                              onKeyDown={handleScanKeyDown}
                              placeholder="Πληκτρολογήστε Κωδικό (π.χ. XR...)"
                              className="w-full p-3 bg-white text-slate-900 font-mono text-lg font-bold rounded-xl outline-none focus:ring-4 focus:ring-amber-500/50 uppercase tracking-wider placeholder-slate-400"
                          />
                          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex gap-1">
                             {scanSuggestion && scanSku !== scanSuggestion && (
                                 <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded border border-slate-200 font-bold">Right Arrow ➜</span>
                             )}
                          </div>
                      </div>

                      {/* Quantity & Button */}
                      <div className="md:col-span-3 flex gap-2">
                          <input 
                              type="number" 
                              min="1" 
                              value={scanQty} 
                              onChange={(e) => setScanQty(parseInt(e.target.value) || 1)}
                              className="w-20 p-3 text-center font-bold rounded-xl outline-none bg-slate-800 text-white border border-slate-700 focus:ring-2 focus:ring-amber-500"
                          />
                          <button 
                             onClick={executeQuickAdd}
                             className="flex-1 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-all active:scale-95 shadow-lg shadow-amber-900/20"
                          >
                              <Plus size={20} /> Προσθήκη
                          </button>
                      </div>
                  </div>
              </div>

              {/* Search Filter */}
              <div className="relative max-w-md">
                 <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                 <input 
                   type="text" 
                   placeholder="Φίλτρο λίστας..." 
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
                                       const whName = whObj ? getWarehouseNameClean(whObj) : 'Unknown';
                                       const isCentral = whId === SYSTEM_IDS.CENTRAL;
                                       return (
                                           <div key={whId} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-bold whitespace-nowrap ${isCentral ? 'bg-slate-50 border-slate-200 text-slate-700' : 'bg-blue-50 border-blue-100 text-blue-700'}`}>
                                               <span className="text-[10px] uppercase opacity-70">{whName.substring(0, 10)}</span>
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
                   <div key={wh.id} className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100 relative overflow-hidden group hover:-translate-y-1 transition-transform">
                       <div className="flex justify-between items-start mb-6">
                           <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${wh.is_system ? 'bg-slate-900 text-white' : 'bg-blue-600 text-white'} shadow-lg`}>
                               <Store size={28} />
                           </div>
                           {!wh.is_system && (
                               <div className="flex gap-2">
                                   <button onClick={() => handleEditWarehouse(wh)} className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-700 transition-colors"><Edit2 size={16}/></button>
                                   <button onClick={() => handleDeleteWarehouse(wh.id)} className="p-2 hover:bg-red-50 rounded-lg text-slate-400 hover:text-red-500 transition-colors"><Trash2 size={16}/></button>
                               </div>
                           )}
                       </div>
                       
                       <h3 className="text-2xl font-black text-slate-800 tracking-tight">{getWarehouseNameClean(wh)}</h3>
                       
                       {/* Simplified: Removed subtitle as requested, just showing ID if custom */}
                       {!wh.is_system && (
                           <div className="mt-2 text-xs font-mono text-slate-400 bg-slate-50 inline-block px-2 py-1 rounded">ID: {wh.id.split('-')[0]}</div>
                       )}
                   </div>
               ))}
               <button onClick={handleCreateWarehouse} className="border-2 border-dashed border-slate-200 rounded-3xl p-6 flex flex-col items-center justify-center text-slate-400 hover:border-slate-300 hover:bg-slate-50 transition-all min-h-[200px] group">
                   <div className="w-16 h-16 rounded-full bg-slate-50 group-hover:bg-white flex items-center justify-center mb-4 transition-colors">
                       <Plus size={32} className="text-slate-300 group-hover:text-slate-500"/>
                   </div>
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
                          <option value="Store">Κατάστημα</option><option value="Warehouse">Αποθήκη</option><option value="Showroom">Δειγματολόγιο</option>
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
                          <div className="flex-1 w-full"><label className="text-xs font-bold text-slate-400 uppercase">Από</label><select className="w-full p-3 border rounded-xl font-bold" value={sourceId} onChange={e => setSourceId(e.target.value)}>{warehouses?.map(w => <option key={w.id} value={w.id} disabled={w.id===targetId}>{getWarehouseNameClean(w)} ({transferProduct.location_stock?.[w.id] || 0})</option>)}</select></div>
                          <ArrowRight className="text-slate-300 hidden md:block" />
                          <div className="flex-1 w-full"><label className="text-xs font-bold text-slate-400 uppercase">Προς</label><select className="w-full p-3 border rounded-xl font-bold" value={targetId} onChange={e => setTargetId(e.target.value)}>{warehouses?.map(w => <option key={w.id} value={w.id} disabled={w.id===sourceId}>{getWarehouseNameClean(w)} ({transferProduct.location_stock?.[w.id] || 0})</option>)}</select></div>
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
