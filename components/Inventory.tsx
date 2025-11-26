import React, { useState, useMemo } from 'react';
import { Product, Gender, Material, GlobalSettings, Collection, ProductVariant, Warehouse } from '../types';
import { Search, Filter, Box, ArrowRight, ChevronDown, ChevronRight, Layers, Store, ArrowLeftRight, Truck, CheckCircle, Package, X, Plus, Trash2, Edit2, MapPin, AlertCircle, RefreshCw, ArrowDown } from 'lucide-react';
import ProductDetails from './ProductDetails';
import { useUI } from './UIProvider';
import { api, SYSTEM_IDS } from '../lib/supabase';
import { useQueryClient, useQuery } from '@tanstack/react-query';

interface Props {
  products: Product[];
  materials?: Material[];
  setPrintItems: (items: { product: Product; variant?: ProductVariant; quantity: number }[]) => void;
  settings: GlobalSettings;
  collections: Collection[];
}

export default function Inventory({ products, materials = [], setPrintItems, settings, collections }: Props) {
  const [activeTab, setActiveTab] = useState<'products' | 'warehouses'>('products');
  const [filterType, setFilterType] = useState<string>('All');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  
  // Warehouse Data
  const { data: warehouses, isLoading: loadingWarehouses } = useQuery({ queryKey: ['warehouses'], queryFn: api.getWarehouses });

  // Warehouse Management State
  const [isEditingWarehouse, setIsEditingWarehouse] = useState(false);
  const [warehouseForm, setWarehouseForm] = useState<Partial<Warehouse>>({ name: '', type: 'Store', address: '' });
  
  // Transfer Logic State
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [transferProduct, setTransferProduct] = useState<Product | null>(null);
  const [transferVariant, setTransferVariant] = useState<ProductVariant | null>(null);
  
  const [sourceId, setSourceId] = useState<string>(SYSTEM_IDS.CENTRAL);
  const [targetId, setTargetId] = useState<string>(SYSTEM_IDS.SHOWROOM);
  const [transferQty, setTransferQty] = useState(1);
  const [isTransferring, setIsTransferring] = useState(false);

  const { showToast, confirm } = useUI();
  const queryClient = useQueryClient();

  // Collapsed state
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  const toggleGroup = (category: string) => {
      setCollapsedGroups(prev => ({ ...prev, [category]: !prev[category] }));
  };

  const filteredProducts = useMemo(() => {
    return products.filter(p => {
        const matchesSearch = p.sku.includes(searchTerm.toUpperCase()) || p.category.toLowerCase().includes(searchTerm.toLowerCase());
        let matchesType = true;
        if (filterType === 'Men') matchesType = p.gender === Gender.Men;
        if (filterType === 'Women') matchesType = p.gender === Gender.Women;
        if (filterType === 'Unisex') matchesType = p.gender === Gender.Unisex && !p.is_component;
        if (filterType === 'Components') matchesType = p.is_component;
        return matchesType && matchesSearch;
    });
  }, [products, searchTerm, filterType]);

  const groupedProducts = useMemo(() => {
      const groups: Record<string, Product[]> = {};
      filteredProducts.forEach(p => {
          const cat = p.category || 'Άλλο';
          if (!groups[cat]) groups[cat] = [];
          groups[cat].push(p);
      });
      return groups;
  }, [filteredProducts]);

  const groupKeys = Object.keys(groupedProducts).sort();

  // --- WAREHOUSE MANAGEMENT FUNCTIONS ---
  
  const handleEditWarehouse = (w: Warehouse) => {
      setWarehouseForm(w);
      setIsEditingWarehouse(true);
  };

  const handleCreateWarehouse = () => {
      setWarehouseForm({ name: '', type: 'Store', address: '' });
      setIsEditingWarehouse(true);
  };

  const saveWarehouse = async () => {
      if (!warehouseForm.name) {
          showToast("Το όνομα είναι υποχρεωτικό.", "error");
          return;
      }
      try {
          if (warehouseForm.id) {
              await api.updateWarehouse(warehouseForm.id, {
                  name: warehouseForm.name,
                  type: warehouseForm.type,
                  address: warehouseForm.address
              });
          } else {
              await api.saveWarehouse(warehouseForm);
          }
          queryClient.invalidateQueries({ queryKey: ['warehouses'] });
          setIsEditingWarehouse(false);
          showToast("Αποθηκεύτηκε επιτυχώς.", "success");
      } catch (e) {
          showToast("Σφάλμα αποθήκευσης.", "error");
      }
  };

  const handleDeleteWarehouse = async (id: string) => {
      const yes = await confirm({
          title: 'Διαγραφή Χώρου',
          message: 'ΠΡΟΣΟΧΗ: Θα διαγραφούν και όλα τα αποθέματα που βρίσκονται σε αυτόν τον χώρο.',
          isDestructive: true,
          confirmText: 'Διαγραφή'
      });
      if (!yes) return;
      
      try {
          await api.deleteWarehouse(id);
          queryClient.invalidateQueries({ queryKey: ['warehouses'] });
          showToast("Ο χώρος διαγράφηκε.", "info");
      } catch (e) {
          showToast("Σφάλμα διαγραφής.", "error");
      }
  };

  // --- SMART TRANSFER LOGIC ---

  const openTransfer = (p: Product) => {
      setTransferProduct(p);
      setTransferVariant(null);
      setSourceId(SYSTEM_IDS.CENTRAL);
      setTargetId(SYSTEM_IDS.SHOWROOM);
      setTransferQty(1);
      setTransferModalOpen(true);
  };

  const swapLocations = () => {
      setSourceId(targetId);
      setTargetId(sourceId);
  };

  const getStockFor = (locationId: string): number => {
      if (!transferProduct) return 0;
      // Use the unified location_stock map we built in supabase.ts
      return transferProduct.location_stock?.[locationId] || 0;
  };

  const executeTransfer = async () => {
      if (!transferProduct || sourceId === targetId) return;
      
      const available = getStockFor(sourceId);
      if (transferQty > available) {
          showToast("Ανεπαρκές απόθεμα στην πηγή.", "error");
          return;
      }
      
      setIsTransferring(true);
      try {
          await api.transferStock(transferProduct.sku, sourceId, targetId, transferQty);
          queryClient.invalidateQueries({ queryKey: ['products'] });
          showToast("Η μεταφορά ολοκληρώθηκε.", "success");
          setTransferModalOpen(false);
      } catch (e: any) {
          showToast(`Σφάλμα: ${e.message}`, "error");
      } finally {
          setIsTransferring(false);
      }
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Tabs */}
      <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
         <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-6">
            <div>
                <h1 className="text-3xl font-bold text-slate-800 tracking-tight">Διαχείριση Αποθήκης</h1>
                <p className="text-slate-500 mt-1">
                    {activeTab === 'products' ? `Προβολή ${filteredProducts.length} κωδικών` : 'Διαχείριση Χώρων & Αποθεμάτων'}
                </p>
            </div>
            
            <div className="flex bg-slate-100 p-1 rounded-xl">
                <button 
                    onClick={() => setActiveTab('products')} 
                    className={`px-6 py-2.5 rounded-lg font-bold text-sm transition-all flex items-center gap-2 ${activeTab === 'products' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                    <Layers size={16}/> Προϊόντα
                </button>
                <button 
                    onClick={() => setActiveTab('warehouses')} 
                    className={`px-6 py-2.5 rounded-lg font-bold text-sm transition-all flex items-center gap-2 ${activeTab === 'warehouses' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                    <Store size={16}/> Χώροι
                </button>
            </div>
         </div>

         {activeTab === 'products' && (
             <div className="flex flex-col sm:flex-row gap-4 w-full md:w-auto pt-4 border-t border-slate-50">
                <div className="relative group flex-1 md:flex-none">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-amber-500 transition-colors" size={20} />
                    <input 
                    type="text" 
                    placeholder="Αναζήτηση SKU..." 
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-12 pr-4 py-3 border border-slate-200 rounded-xl focus:ring-4 focus:ring-amber-500/20 focus:border-amber-500 outline-none w-full md:w-80 bg-white transition-all text-slate-900 shadow-sm"
                    />
                </div>
                
                <div className="relative group flex-1 md:flex-none">
                    <Filter className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-amber-500 transition-colors" size={20} />
                    <select 
                    value={filterType} 
                    onChange={(e) => setFilterType(e.target.value)}
                    className="pl-12 pr-10 py-3 border border-slate-200 rounded-xl focus:ring-4 focus:ring-amber-500/20 focus:border-amber-500 outline-none bg-white text-slate-900 appearance-none cursor-pointer w-full md:w-auto min-w-[200px] transition-all font-medium shadow-sm"
                    >
                    <option value="All">Όλα τα Προϊόντα</option>
                    <option value="Men">Ανδρικά</option>
                    <option value="Women">Γυναικεία</option>
                    <option value="Unisex">Unisex</option>
                    <option value="Components">Εξαρτήματα (STX)</option>
                    </select>
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                    <ArrowRight size={14} className="rotate-90" />
                    </div>
                </div>
            </div>
         )}
      </div>

      {activeTab === 'warehouses' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in slide-in-from-right duration-300">
               {warehouses?.map(wh => (
                   <div key={wh.id} className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 relative overflow-hidden group hover:-translate-y-1 transition-transform">
                       <div className={`absolute top-0 right-0 p-20 rounded-bl-full opacity-5 transition-transform group-hover:scale-110 ${wh.is_system ? 'bg-blue-500' : 'bg-emerald-500'}`} />
                       
                       <div className="relative z-10">
                           <div className="flex justify-between items-start mb-4">
                               <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${wh.is_system ? 'bg-blue-50 text-blue-600' : 'bg-emerald-50 text-emerald-600'}`}>
                                   <Store size={24} />
                               </div>
                               {!wh.is_system && (
                                   <div className="flex gap-2">
                                       <button onClick={() => handleEditWarehouse(wh)} className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-700 transition-colors"><Edit2 size={16}/></button>
                                       <button onClick={() => handleDeleteWarehouse(wh.id)} className="p-2 hover:bg-red-50 rounded-lg text-slate-400 hover:text-red-500 transition-colors"><Trash2 size={16}/></button>
                                   </div>
                               )}
                           </div>
                           
                           <h3 className="text-xl font-bold text-slate-800">{wh.name}</h3>
                           <p className="text-slate-500 text-sm mt-1">{wh.type} {wh.address ? `• ${wh.address}` : ''}</p>
                           
                           <div className="mt-6 pt-6 border-t border-slate-100 flex justify-between items-end">
                                <div className="text-xs font-bold px-2 py-1 bg-slate-100 rounded text-slate-500 uppercase tracking-wide">
                                    {wh.is_system ? 'Βασικός Χώρος' : 'Επιπλέον Χώρος'}
                                </div>
                                {/* Simple Stock Count Preview */}
                                {wh.is_system && (
                                    <div className="text-right">
                                        <div className="text-[10px] text-slate-400 font-bold uppercase">Τεμάχια</div>
                                        <div className="text-lg font-black text-slate-700">
                                            {wh.id === SYSTEM_IDS.CENTRAL 
                                                ? products.reduce((acc, p) => acc + p.stock_qty, 0)
                                                : products.reduce((acc, p) => acc + (p.sample_qty || 0), 0)
                                            }
                                        </div>
                                    </div>
                                )}
                           </div>
                       </div>
                   </div>
               ))}
               
               {/* Add Warehouse Card */}
               <button onClick={handleCreateWarehouse} className="border-2 border-dashed border-slate-200 rounded-3xl p-6 flex flex-col items-center justify-center text-slate-400 hover:border-slate-300 hover:bg-slate-50 transition-all cursor-pointer min-h-[240px]">
                   <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mb-3 group-hover:bg-white group-hover:shadow-sm transition-all">
                       <Plus size={24} className="text-slate-400 group-hover:text-slate-600"/>
                   </div>
                   <span className="font-bold">Προσθήκη Χώρου</span>
                   <span className="text-xs mt-1">Δημιουργία νέας αποθήκης</span>
               </button>
          </div>
      )}

      {/* Warehouse Edit Modal */}
      {isEditingWarehouse && (
          <div className="fixed inset-0 z-[150] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl p-8 animate-in zoom-in-95 border border-slate-100">
                  <div className="flex justify-between items-center mb-6">
                      <h3 className="text-xl font-bold text-slate-800">{warehouseForm.id ? 'Επεξεργασία Χώρου' : 'Νέος Χώρος'}</h3>
                      <button onClick={() => setIsEditingWarehouse(false)}><X size={20} className="text-slate-400"/></button>
                  </div>
                  <div className="space-y-4">
                      <div>
                          <label className="block text-xs font-bold text-slate-400 uppercase tracking-wide mb-1">Ονομασια *</label>
                          <input className="w-full p-3 border border-slate-200 rounded-xl bg-white text-slate-800 outline-none focus:ring-2 focus:ring-blue-500/20 font-bold" value={warehouseForm.name} onChange={e => setWarehouseForm({...warehouseForm, name: e.target.value})} placeholder="π.χ. Αποθήκη Β"/>
                      </div>
                      <div>
                          <label className="block text-xs font-bold text-slate-400 uppercase tracking-wide mb-1">Τυπος</label>
                          <select className="w-full p-3 border border-slate-200 rounded-xl bg-white text-slate-800 outline-none focus:ring-2 focus:ring-blue-500/20" value={warehouseForm.type} onChange={e => setWarehouseForm({...warehouseForm, type: e.target.value as any})}>
                              <option value="Store">Κατάστημα</option>
                              <option value="Warehouse">Αποθήκη</option>
                              <option value="Showroom">Δειγματολόγιο</option>
                              <option value="Other">Άλλο</option>
                          </select>
                      </div>
                      <div>
                          <label className="block text-xs font-bold text-slate-400 uppercase tracking-wide mb-1">Διευθυνση / Τοποθεσια</label>
                          <input className="w-full p-3 border border-slate-200 rounded-xl bg-white text-slate-800 outline-none focus:ring-2 focus:ring-blue-500/20" value={warehouseForm.address || ''} onChange={e => setWarehouseForm({...warehouseForm, address: e.target.value})} placeholder="Προαιρετικό"/>
                      </div>
                      <button onClick={saveWarehouse} className="w-full bg-slate-900 text-white py-3 rounded-xl font-bold hover:bg-slate-800 transition-all mt-4">Αποθήκευση</button>
                  </div>
              </div>
          </div>
      )}

      {/* Products Grid */}
      {activeTab === 'products' && (
        <div className="space-y-8">
            {groupKeys.map(category => {
                const isCollapsed = collapsedGroups[category];
                const items = groupedProducts[category];
                
                return (
                    <div key={category} className="animate-in slide-in-from-bottom-4 duration-500">
                        <button 
                            onClick={() => toggleGroup(category)}
                            className="flex items-center gap-3 w-full text-left mb-4 group focus:outline-none"
                        >
                            <div className={`p-1.5 rounded-lg transition-colors ${isCollapsed ? 'bg-slate-100 text-slate-500' : 'bg-amber-100 text-amber-600'}`}>
                                {isCollapsed ? <ChevronRight size={20}/> : <ChevronDown size={20}/>}
                            </div>
                            <h2 className="text-xl font-bold text-slate-700 flex items-center gap-3">
                                {category} 
                                <span className="text-xs px-2.5 py-1 bg-slate-100 rounded-full text-slate-500 font-bold">{items.length}</span>
                            </h2>
                            <div className="h-px bg-slate-200 flex-1 ml-4 group-hover:bg-slate-300 transition-colors" />
                        </button>
                        
                        {!isCollapsed && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-6 animate-in fade-in duration-300">
                                {items.map(product => {
                                    // Use System IDs to access stock from the unified map
                                    const centralStock = product.location_stock?.[SYSTEM_IDS.CENTRAL] || 0;
                                    const sampleStock = product.location_stock?.[SYSTEM_IDS.SHOWROOM] || 0;
                                    
                                    return (
                                        <div 
                                        key={product.sku} 
                                        onClick={() => setSelectedProduct(product)}
                                        className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden hover:shadow-xl transition-all duration-300 cursor-pointer group hover:-translate-y-1.5 relative"
                                        >
                                            <div className="aspect-square relative overflow-hidden bg-slate-50 group">
                                                <div className="absolute inset-0 bg-slate-900/0 group-hover:bg-slate-900/10 transition-colors z-10" />
                                                <img src={product.image_url} alt={product.sku} className="w-full h-full object-cover transform group-hover:scale-110 transition-transform duration-500" />
                                                
                                                {/* Stock Badges (Greek) */}
                                                <div className="absolute top-2 right-2 z-20 flex flex-col gap-1 items-end">
                                                    <span className={`px-2 py-1 rounded-md text-[10px] font-bold shadow-sm backdrop-blur-md border border-white/20 ${centralStock > 0 ? 'bg-blue-600/90 text-white' : 'bg-red-500 text-white'}`}>
                                                        {centralStock} Κεντρική
                                                    </span>
                                                     {sampleStock > 0 && (
                                                        <span className="px-2 py-1 rounded-md text-[10px] font-bold shadow-sm backdrop-blur-md border border-white/20 bg-purple-500/90 text-white">
                                                            {sampleStock} Δείγμα
                                                        </span>
                                                     )}
                                                </div>
                                                
                                                {/* Quick Action Overlay */}
                                                <div className="absolute inset-x-0 bottom-0 p-3 translate-y-full group-hover:translate-y-0 transition-transform duration-300 z-30 flex justify-center pb-4">
                                                    <button 
                                                        onClick={(e) => { e.stopPropagation(); openTransfer(product); }}
                                                        className="bg-white text-slate-800 text-xs font-bold px-4 py-2 rounded-full shadow-lg flex items-center gap-2 hover:bg-slate-50 hover:scale-105 transition-all"
                                                    >
                                                        <ArrowLeftRight size={12}/> Μεταφορά
                                                    </button>
                                                </div>
                                            </div>
                                            
                                            <div className="p-5">
                                                <h3 className="font-bold text-slate-800 text-lg tracking-tight group-hover:text-amber-600 transition-colors">{product.sku}</h3>
                                                <p className="text-xs text-slate-500 mb-4 font-medium flex items-center gap-2">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-slate-300"></span>
                                                    {product.gender}
                                                </p>
                                                <div className="flex items-center justify-between border-t border-slate-100 pt-3">
                                                    <span className="font-bold text-amber-600 text-lg">{product.selling_price > 0 ? product.selling_price.toFixed(2) + '€' : '-'}</span>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
      )}

      {/* SMART TRANSFER MODAL */}
      {transferModalOpen && transferProduct && (
          <div className="fixed inset-0 z-[150] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 border border-slate-100 flex flex-col">
                  {/* Header */}
                  <div className="bg-slate-50 p-6 border-b border-slate-100 flex justify-between items-center">
                      <div className="flex items-center gap-4">
                           <img src={transferProduct.image_url} className="w-16 h-16 rounded-xl object-cover bg-white border border-slate-200" alt="thumb"/>
                           <div>
                               <h3 className="text-xl font-bold text-slate-800">{transferProduct.sku}</h3>
                               <p className="text-slate-500 text-sm">Μεταφορά Αποθέματος</p>
                           </div>
                      </div>
                      <button onClick={() => setTransferModalOpen(false)} className="p-2 hover:bg-slate-200 rounded-full text-slate-400 hover:text-slate-600"><X size={20}/></button>
                  </div>
                  
                  {/* Flow Interface */}
                  <div className="p-8">
                      <div className="flex flex-col md:flex-row items-center justify-between gap-6 relative">
                          
                          {/* FROM */}
                          <div className="flex-1 w-full bg-white border-2 border-slate-100 rounded-2xl p-4 hover:border-blue-300 transition-colors group">
                                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wide mb-2 flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full bg-red-400"></div> Από Πού (Πηγή);
                                </label>
                                <select 
                                    className="w-full text-lg font-bold text-slate-800 bg-transparent outline-none cursor-pointer"
                                    value={sourceId}
                                    onChange={(e) => setSourceId(e.target.value)}
                                >
                                    {warehouses?.map(w => (
                                        <option key={w.id} value={w.id} disabled={w.id === targetId}>{w.name}</option>
                                    ))}
                                </select>
                                <div className="mt-3 pt-3 border-t border-slate-50 flex justify-between items-center">
                                    <span className="text-xs text-slate-500">Τρέχον Απόθεμα:</span>
                                    <span className="font-mono font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded">{getStockFor(sourceId)}</span>
                                </div>
                          </div>

                          {/* Swap & Arrow */}
                          <div className="flex flex-col items-center justify-center z-10 shrink-0">
                               <button onClick={swapLocations} className="p-2 bg-slate-100 rounded-full hover:bg-slate-200 text-slate-500 transition-colors mb-2" title="Αντιμετάθεση">
                                   <RefreshCw size={16}/>
                               </button>
                               <ArrowRight size={24} className="text-slate-300 hidden md:block"/>
                               <ArrowDown className="text-slate-300 md:hidden block" size={24} />
                          </div>

                          {/* TO */}
                          <div className="flex-1 w-full bg-white border-2 border-slate-100 rounded-2xl p-4 hover:border-emerald-300 transition-colors group">
                                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wide mb-2 flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full bg-emerald-400"></div> Προς Τα Πού (Προορισμός);
                                </label>
                                <select 
                                    className="w-full text-lg font-bold text-slate-800 bg-transparent outline-none cursor-pointer"
                                    value={targetId}
                                    onChange={(e) => setTargetId(e.target.value)}
                                >
                                    {warehouses?.map(w => (
                                        <option key={w.id} value={w.id} disabled={w.id === sourceId}>{w.name}</option>
                                    ))}
                                </select>
                                <div className="mt-3 pt-3 border-t border-slate-50 flex justify-between items-center">
                                    <span className="text-xs text-slate-500">Τρέχον Απόθεμα:</span>
                                    <span className="font-mono font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded">{getStockFor(targetId)}</span>
                                </div>
                          </div>
                      </div>

                      {/* Qty Input Area */}
                      <div className="mt-8 bg-slate-50 rounded-2xl p-6 flex items-center justify-between border border-slate-100">
                           <div>
                               <label className="block text-xs font-bold text-slate-400 uppercase tracking-wide mb-1">Ποσοτητα Μεταφορας</label>
                               <div className="flex items-center gap-4">
                                   <button onClick={() => setTransferQty(Math.max(1, transferQty - 1))} className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center hover:bg-slate-100 font-bold">-</button>
                                   <input 
                                     type="number" 
                                     min="1" 
                                     max={getStockFor(sourceId)}
                                     value={transferQty} 
                                     onChange={(e) => setTransferQty(Math.max(1, parseInt(e.target.value) || 0))} 
                                     className="w-20 text-center text-3xl font-black bg-transparent outline-none text-slate-800"
                                   />
                                   <button onClick={() => setTransferQty(Math.min(getStockFor(sourceId), transferQty + 1))} className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center hover:bg-slate-100 font-bold">+</button>
                               </div>
                           </div>
                           
                           <div className="text-right opacity-60">
                               <div className="text-xs font-bold uppercase mb-1">Προεπισκόπηση</div>
                               <div className="text-sm font-mono">{getStockFor(sourceId)} <ArrowRight size={10} className="inline"/> {getStockFor(sourceId) - transferQty} (Πηγή)</div>
                               <div className="text-sm font-mono">{getStockFor(targetId)} <ArrowRight size={10} className="inline"/> {getStockFor(targetId) + transferQty} (Προορισμός)</div>
                           </div>
                      </div>

                      <button 
                        onClick={executeTransfer} 
                        disabled={isTransferring || transferQty > getStockFor(sourceId)}
                        className="w-full mt-6 bg-slate-900 text-white py-4 rounded-xl font-bold text-lg hover:bg-slate-800 transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5 active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 disabled:translate-y-0"
                      >
                          {isTransferring ? 'Μεταφορά...' : 'Επιβεβαίωση Μεταφοράς'}
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* Product Detail Modal */}
      {selectedProduct && (
        <ProductDetails 
          product={selectedProduct} 
          allProducts={products}
          allMaterials={materials}
          onClose={() => setSelectedProduct(null)}
          setPrintItems={setPrintItems}
          settings={settings}
          collections={collections}
        />
      )}
    </div>
  );
}