

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Product, ProductVariant, Warehouse, Order, OrderStatus, Mold } from '../types';
import { Search, Store, ArrowLeftRight, Package, X, Plus, Trash2, Edit2, ArrowRight, ShoppingBag, AlertTriangle, CheckCircle, Zap, ScanBarcode, ChevronDown, Printer, Filter, ImageIcon, Camera } from 'lucide-react';
import ProductDetails from './ProductDetails';
import { useUI } from './UIProvider';
import { api, SYSTEM_IDS, recordStockMovement, supabase, deleteProduct } from '../lib/supabase';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import BarcodeScanner from './BarcodeScanner';
import { formatCurrency, formatDecimal } from '../utils/pricingEngine';

interface Props {
  products: Product[];
  setPrintItems: (items: { product: Product; variant?: ProductVariant; quantity: number, format?: 'standard' | 'simple' }[]) => void;
  settings: any;
  collections: any[];
  molds: Mold[];
}

interface InventoryItem {
    id: string;
    masterSku: string;
    suffix: string;
    description: string;
    category: string;
    imageUrl: string | null;
    locationStock: Record<string, number>;
    totalStock: number;
    demandQty: number;
    product: Product;
    variantRef?: ProductVariant;
    isSingleVariantMode?: boolean;
}

export default function Inventory({ products, setPrintItems, settings, collections, molds }: Props) {
  const [activeTab, setActiveTab] = useState<'stock' | 'warehouses'>('stock');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [viewWarehouseId, setViewWarehouseId] = useState<string>('ALL');
  const [showScanner, setShowScanner] = useState(false);
  
  const { data: warehouses } = useQuery({ queryKey: ['warehouses'], queryFn: api.getWarehouses });
  const { data: orders } = useQuery({ queryKey: ['orders'], queryFn: api.getOrders });
  
  const queryClient = useQueryClient();
  const { showToast, confirm } = useUI();

  const [isEditingWarehouse, setIsEditingWarehouse] = useState(false);
  const [warehouseForm, setWarehouseForm] = useState<Partial<Warehouse>>({ name: '', type: 'Store', address: '' });
  
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [transferItem, setTransferItem] = useState<InventoryItem | null>(null);
  const [sourceId, setSourceId] = useState<string>(SYSTEM_IDS.CENTRAL);
  const [targetId, setTargetId] = useState<string>(SYSTEM_IDS.SHOWROOM);
  const [transferQty, setTransferQty] = useState(1);
  const [isTransferring, setIsTransferring] = useState(false);

  const [scanInput, setScanInput] = useState('');
  const [scanSuggestion, setScanSuggestion] = useState('');
  const [scanTargetId, setScanTargetId] = useState<string>(SYSTEM_IDS.CENTRAL);
  const [scanQty, setScanQty] = useState(1);
  const inputRef = useRef<HTMLInputElement>(null);

  const getWarehouseNameClean = (w: Warehouse) => {
      if (w.id === SYSTEM_IDS.CENTRAL) return 'Κεντρική Αποθήκη';
      if (w.id === SYSTEM_IDS.SHOWROOM || w.type === 'Showroom' || w.name === 'Showroom') return 'Δειγματολόγιο';
      return w.name;
  };

  const rawInventory = useMemo(() => {
      if (!products) return [];
      
      const items: InventoryItem[] = [];
      const demandMap: Record<string, number> = {};
      if (orders) {
          const pending = orders.filter(o => o.status === OrderStatus.Pending);
          pending.forEach(o => {
              o.items.forEach(i => {
                  const key = i.sku + (i.variant_suffix || '');
                  demandMap[key] = (demandMap[key] || 0) + i.quantity;
              });
          });
      }

      products.forEach(p => {
          const hasSingleVariant = p.variants && p.variants.length === 1;

          if (hasSingleVariant) {
              const v = p.variants![0];
              const key = p.sku + v.suffix;
              const demand = (demandMap[p.sku] || 0) + (demandMap[key] || 0);
              const mergedLocationStock: Record<string, number> = {};
              mergedLocationStock[SYSTEM_IDS.CENTRAL] = (p.stock_qty || 0) + (v.stock_qty || 0);
              mergedLocationStock[SYSTEM_IDS.SHOWROOM] = (p.sample_qty || 0);

              const allWarehouseIds = new Set([
                  ...Object.keys(p.location_stock || {}),
                  ...Object.keys(v.location_stock || {})
              ]);

              allWarehouseIds.forEach(whId => {
                  if (whId !== SYSTEM_IDS.CENTRAL && whId !== SYSTEM_IDS.SHOWROOM) {
                      mergedLocationStock[whId] = (p.location_stock?.[whId] || 0) + (v.location_stock?.[whId] || 0);
                  }
              });

              const totalStock = Object.values(mergedLocationStock).reduce((a, b) => a + b, 0);

              if (totalStock > 0 || demand > 0) {
                  items.push({
                      id: key,
                      masterSku: p.sku,
                      suffix: v.suffix,
                      description: v.description,
                      category: p.category,
                      imageUrl: p.image_url,
                      locationStock: mergedLocationStock,
                      totalStock,
                      demandQty: demand,
                      product: p,
                      variantRef: v,
                      isSingleVariantMode: true
                  });
              }

          } else if (p.variants && p.variants.length > 1) {
              p.variants.forEach(v => {
                  const key = p.sku + v.suffix;
                  const totalStock = Object.values(v.location_stock || {}).reduce((a, b) => a + b, 0) + v.stock_qty; 
                  const variantLocStock = { ...v.location_stock };
                  variantLocStock[SYSTEM_IDS.CENTRAL] = v.stock_qty;
                  const demand = demandMap[key] || 0;
                  
                  if (totalStock > 0 || demand > 0) {
                      items.push({
                          id: key,
                          masterSku: p.sku,
                          suffix: v.suffix,
                          description: v.description,
                          category: p.category,
                          imageUrl: p.image_url,
                          locationStock: variantLocStock,
                          totalStock,
                          demandQty: demand,
                          product: p,
                          variantRef: v
                      });
                  }
              });
          } else {
              const totalStock = Object.values(p.location_stock || {}).reduce((a, b) => a + b, 0) + p.stock_qty + p.sample_qty;
              const demand = demandMap[p.sku] || 0;
              const displayStock = { ...p.location_stock, [SYSTEM_IDS.CENTRAL]: p.stock_qty, [SYSTEM_IDS.SHOWROOM]: p.sample_qty };

               if (totalStock > 0 || demand > 0) {
                  items.push({
                      id: p.sku,
                      masterSku: p.sku,
                      suffix: '',
                      description: 'Βασικό',
                      category: p.category,
                      imageUrl: p.image_url,
                      locationStock: displayStock,
                      totalStock,
                      demandQty: demand,
                      product: p
                  });
               }
          }
      });
      return items;
  }, [products, orders]);

  const filteredInventory = useMemo(() => {
    return rawInventory.filter(i => {
      if (viewWarehouseId !== 'ALL') {
         const qtyInWh = i.locationStock[viewWarehouseId] || 0;
         if (qtyInWh <= 0) return false;
      }
      const term = searchTerm.toUpperCase();
      if (term) {
        return i.masterSku.includes(term) || 
               i.suffix.includes(term) ||
               i.category.toLowerCase().includes(term.toLowerCase());
      }
      return true;
    });
  }, [rawInventory, viewWarehouseId, searchTerm]);

  const handleDeleteItem = async (item: InventoryItem) => {
      const isSpecificView = viewWarehouseId !== 'ALL';
      const warehouseName = warehouses?.find(w => w.id === viewWarehouseId)?.name;
      
      const title = isSpecificView 
        ? 'Αφαίρεση από Αποθήκη' 
        : 'Μηδενισμός Αποθέματος';
        
      const message = isSpecificView
        ? `Θέλετε να μηδενίσετε το απόθεμα για το "${item.masterSku}${item.suffix ? '-'+item.suffix : ''}" στον χώρο "${warehouseName}"; Ο κωδικός SKU θα παραμείνει στο Μητρώο.`
        : `ΠΡΟΣΟΧΗ: Θα μηδενιστεί το απόθεμα σε ΟΛΕΣ τις αποθήκες για το ${item.masterSku}${item.suffix ? '-'+item.suffix : ''}. Ο κωδικός SKU θα παραμείνει στο Μητρώο.`;

      if (!await confirm({ title, message, isDestructive: true, confirmText: 'Εκκαθάριση' })) return;

      try {
          const sku = item.masterSku;
          const suffix = item.suffix;

          const clearCustomStock = async (whId?: string) => {
              let query = supabase.from('product_stock').delete().eq('product_sku', sku);
              if (suffix) query = query.eq('variant_suffix', suffix);
              else query = query.is('variant_suffix', null);
              if (whId) query = query.eq('warehouse_id', whId);
              await query;
          };

          if (isSpecificView) {
              let movementAmount = 0;
              if (viewWarehouseId === SYSTEM_IDS.CENTRAL) {
                  movementAmount = item.locationStock[SYSTEM_IDS.CENTRAL] || 0;
                  if (item.isSingleVariantMode) {
                       await supabase.from('products').update({ stock_qty: 0 }).eq('sku', sku);
                       if (suffix) await supabase.from('product_variants').update({ stock_qty: 0 }).match({ product_sku: sku, suffix });
                  } else if (suffix) {
                      await supabase.from('product_variants').update({ stock_qty: 0 }).match({ product_sku: sku, suffix });
                  } else {
                      await supabase.from('products').update({ stock_qty: 0 }).eq('sku', sku);
                  }
              } else if (viewWarehouseId === SYSTEM_IDS.SHOWROOM) {
                   movementAmount = item.locationStock[SYSTEM_IDS.SHOWROOM] || 0;
                   await supabase.from('products').update({ sample_qty: 0 }).eq('sku', sku);
              } else {
                   movementAmount = item.locationStock[viewWarehouseId] || 0;
                   await clearCustomStock(viewWarehouseId);
              }
              if (movementAmount > 0) {
                  await recordStockMovement(sku, -movementAmount, `Εκκαθάριση: ${warehouseName}`, suffix);
              }
          } else {
              if (item.isSingleVariantMode) {
                   await supabase.from('products').update({ stock_qty: 0 }).eq('sku', sku);
                   if (suffix) await supabase.from('product_variants').update({ stock_qty: 0 }).match({ product_sku: sku, suffix });
              } else if (suffix) {
                  await supabase.from('product_variants').update({ stock_qty: 0 }).match({ product_sku: sku, suffix });
              } else {
                  await supabase.from('products').update({ stock_qty: 0 }).eq('sku', sku);
              }
              await supabase.from('products').update({ sample_qty: 0 }).eq('sku', sku);
              await clearCustomStock();
              if (item.totalStock > 0) {
                await recordStockMovement(sku, -item.totalStock, 'Μαζική Εκκαθάριση', suffix);
              }
          }
          queryClient.invalidateQueries({ queryKey: ['products'] });
          showToast('Το απόθεμα μηδενίστηκε.', 'success');
      } catch (err: any) {
          showToast(err.message || 'Σφάλμα ενημέρωσης', 'error');
      }
  };

  const handleScanInput = (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value.toUpperCase();
      setScanInput(val);
      if (val.length > 0) {
          let match = rawInventory.find(i => (i.masterSku + i.suffix).startsWith(val));
          if (!match) {
             const prod = products.find(p => p.sku.startsWith(val));
             if (prod) {
                 if (prod.variants && prod.variants.length === 1) {
                     setScanSuggestion(prod.sku + prod.variants[0].suffix);
                 } else if (prod.variants && prod.variants.length > 0) {
                     const vMatch = prod.variants.find(v => (prod.sku + v.suffix).startsWith(val));
                     if (vMatch) setScanSuggestion(prod.sku + vMatch.suffix);
                     else setScanSuggestion(prod.sku); 
                 } else {
                     setScanSuggestion(prod.sku);
                 }
             } else {
                 setScanSuggestion('');
             }
          } else {
             setScanSuggestion(match.masterSku + match.suffix);
          }
      } else {
          setScanSuggestion('');
      }
  };

  const handleScanKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'ArrowRight' && scanSuggestion) {
          e.preventDefault();
          setScanInput(scanSuggestion);
      }
      if (e.key === 'Enter') {
          e.preventDefault();
          executeQuickAdd();
      }
  };

  const executeQuickAdd = async () => {
      const targetCode = scanSuggestion || scanInput;
      const product = products.find(p => targetCode.startsWith(p.sku));
      if (!product) {
          showToast(`Ο κωδικός ${targetCode} δεν βρέθηκε.`, "error");
          return;
      }
      let variantSuffix = targetCode.replace(product.sku, '');
      let variant = product.variants?.find(v => v.suffix === variantSuffix);
      if (product.variants && product.variants.length === 1 && !variantSuffix) {
          variant = product.variants[0];
          variantSuffix = variant.suffix;
      }
      if (product.variants && product.variants.length > 0 && !variant && variantSuffix) {
           showToast(`Η παραλλαγή ${variantSuffix} δεν βρέθηκε.`, "error");
           return;
      }
      try {
          const whName = warehouses?.find(w => w.id === scanTargetId)?.name || 'Αποθήκη';
          if (variant) {
               const currentStock = variant.location_stock?.[scanTargetId] || 0;
               let newQty = 0;
               if (scanTargetId === SYSTEM_IDS.CENTRAL) {
                   newQty = (variant.stock_qty || 0) + scanQty;
                   await supabase.from('product_variants').update({ stock_qty: newQty }).match({ product_sku: product.sku, suffix: variant.suffix });
               } else {
                   newQty = currentStock + scanQty;
                   await supabase.from('product_stock').upsert({ 
                      product_sku: product.sku, 
                      variant_suffix: variant.suffix, 
                      warehouse_id: scanTargetId, 
                      quantity: newQty 
                   }, { onConflict: 'product_sku, warehouse_id, variant_suffix' });
               }
               await recordStockMovement(product.sku, scanQty, `Γρήγορη Προσθήκη: ${whName}`, variant.suffix);
          } else {
              if (scanTargetId === SYSTEM_IDS.CENTRAL) {
                  const newQty = product.stock_qty + scanQty;
                  await supabase.from('products').update({ stock_qty: newQty }).eq('sku', product.sku);
              } else if (scanTargetId === SYSTEM_IDS.SHOWROOM) {
                  const newQty = (product.sample_qty || 0) + scanQty;
                  await supabase.from('products').update({ sample_qty: newQty }).eq('sku', product.sku);
              } else {
                  const currentStock = product.location_stock?.[scanTargetId] || 0;
                  const newQty = currentStock + scanQty;
                  await supabase.from('product_stock').upsert({ 
                      product_sku: product.sku, 
                      warehouse_id: scanTargetId, 
                      quantity: newQty 
                  });
              }
              await recordStockMovement(product.sku, scanQty, `Γρήγορη Προσθήκη: ${whName}`);
          }
          queryClient.invalidateQueries({ queryKey: ['products'] });
          showToast(`Προστέθηκε ${scanQty} τεμ. στον κωδικό ${product.sku}${variant ? variant.suffix : ''}`, "success");
          setScanInput('');
          setScanSuggestion('');
          setScanQty(1);
          inputRef.current?.focus();
      } catch (err) {
          console.error(err);
          showToast("Σφάλμα ενημέρωσης.", "error");
      }
  };

  const handleGlobalScan = (code: string) => {
      const product = products.find(p => code.startsWith(p.sku));
      if (product) {
          setSelectedProduct(product);
      } else {
          showToast(`Ο κωδικός ${code} δεν βρέθηκε.`, 'error');
      }
  };

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

  const openTransfer = (item: InventoryItem) => {
      setTransferItem(item);
      setSourceId(SYSTEM_IDS.CENTRAL);
      setTargetId(SYSTEM_IDS.SHOWROOM);
      setTransferQty(1);
      setTransferModalOpen(true);
  };

  const executeTransfer = async () => {
      if (!transferItem || sourceId === targetId) return;
      const currentSourceQty = transferItem.locationStock[sourceId] || 0;
      if (transferQty > currentSourceQty) { showToast("Ανεπαρκές απόθεμα.", "error"); return; }
      setIsTransferring(true);
      try {
          const variantSuffix = transferItem.suffix;
          const sku = transferItem.masterSku;
          const newSourceQty = currentSourceQty - transferQty;
          const currentTargetQty = transferItem.locationStock[targetId] || 0;
          const newTargetQty = currentTargetQty + transferQty;
          const updateStock = async (whId: string, qty: number) => {
               if (whId === SYSTEM_IDS.CENTRAL) {
                   if (variantSuffix) await supabase.from('product_variants').update({ stock_qty: qty }).match({ product_sku: sku, suffix: variantSuffix });
                   else await supabase.from('products').update({ stock_qty: qty }).eq('sku', sku);
               } else if (whId === SYSTEM_IDS.SHOWROOM && !variantSuffix) {
                   await supabase.from('products').update({ sample_qty: qty }).eq('sku', sku);
               } else {
                    await supabase.from('product_stock').upsert({ 
                      product_sku: sku, 
                      variant_suffix: variantSuffix || null, 
                      warehouse_id: whId, 
                      quantity: qty 
                   }, { onConflict: 'product_sku, warehouse_id, variant_suffix' });
               }
          };
          await updateStock(sourceId, newSourceQty);
          await updateStock(targetId, newTargetQty);
          await recordStockMovement(sku, transferQty, `Transfer: ${getWarehouseNameClean(warehouses!.find(w=>w.id===sourceId)!)} -> ${getWarehouseNameClean(warehouses!.find(w=>w.id===targetId)!)}`, variantSuffix);
          queryClient.invalidateQueries({ queryKey: ['products'] });
          showToast("Η μεταφορά ολοκληρώθηκε.", "success");
          setTransferModalOpen(false);
      } catch (e: any) { showToast(`Σφάλμα: ${e.message}`, "error"); } 
      finally { setIsTransferring(false); }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
         <div>
            <h1 className="text-3xl font-bold text-[#060b00] tracking-tight flex items-center gap-3">
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
              <div className="bg-[#060b00] p-5 rounded-2xl shadow-lg flex flex-col lg:flex-row items-center gap-4 border border-slate-800">
                  <div className="flex items-center gap-2 text-white/80 font-bold shrink-0">
                      <ScanBarcode size={24} className="text-amber-400" /> 
                      <span className="uppercase tracking-wider text-sm">Γρήγορη Εισαγωγή</span>
                  </div>
                  
                  <div className="flex-1 w-full grid grid-cols-1 md:grid-cols-12 gap-3">
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

                      <div className="md:col-span-6 relative">
                          <div className="absolute inset-0 p-3 pointer-events-none font-mono text-lg tracking-wider flex items-center">
                              <span className="text-transparent">{scanInput}</span>
                              <span className="text-slate-600">
                                  {scanSuggestion.startsWith(scanInput) ? scanSuggestion.substring(scanInput.length) : ''}
                              </span>
                          </div>
                          
                          <input 
                              ref={inputRef}
                              type="text" 
                              value={scanInput}
                              onChange={handleScanInput}
                              onKeyDown={handleScanKeyDown}
                              placeholder="Πληκτρολογήστε Κωδικό (π.χ. XR...)"
                              className="w-full p-3 bg-white text-slate-900 font-mono text-lg font-bold rounded-xl outline-none focus:ring-4 focus:ring-amber-500/50 uppercase tracking-wider placeholder-slate-400"
                          />
                          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex gap-1">
                             {scanSuggestion && scanInput !== scanSuggestion && (
                                 <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded border border-slate-200 font-bold">Δεξί Βέλος ➜</span>
                             )}
                          </div>
                      </div>

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

              <div className="flex flex-col md:flex-row gap-4 mb-2">
                 <div className="w-full md:w-64 relative">
                     <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                     <select 
                         value={viewWarehouseId} 
                         onChange={(e) => setViewWarehouseId(e.target.value)}
                         className="w-full pl-10 p-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-200 appearance-none font-medium cursor-pointer"
                     >
                         <option value="ALL">Όλες οι Αποθήκες</option>
                         {warehouses?.map(w => (
                             <option key={w.id} value={w.id}>{getWarehouseNameClean(w)}</option>
                         ))}
                     </select>
                 </div>
                 
                 <div className="relative flex-1 flex gap-2">
                     <div className="relative flex-1">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                        <input 
                        type="text" 
                        placeholder="Φίλτρο λίστας (Κωδικός, Κατηγορία)..." 
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-12 pr-4 py-3 border border-slate-200 rounded-xl focus:ring-4 focus:ring-slate-500/10 focus:border-slate-500 outline-none w-full bg-white transition-all text-slate-900 shadow-sm"
                        />
                     </div>
                     <button 
                        onClick={() => setShowScanner(true)}
                        className="bg-white p-3 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900 hover:border-slate-300 transition-all shadow-sm flex items-center gap-2 font-bold"
                        title="Σάρωση Barcode"
                     >
                         <Camera size={20} /> Scan
                     </button>
                 </div>
              </div>

              <div className="grid grid-cols-1 gap-4">
                  {filteredInventory.map(item => {
                      const hasDemand = item.demandQty > 0;
                      const inStock = item.totalStock > 0;
                      const canFulfill = inStock && item.totalStock >= item.demandQty;
                      const displayName = (item.isSingleVariantMode || !item.suffix) ? item.masterSku : `${item.masterSku}-${item.suffix}`;
                      const displayPrice = item.variantRef?.selling_price ?? item.product.selling_price;
                      const displayRetail = displayPrice * 3;

                      return (
                          <div key={item.id} className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all flex flex-col md:flex-row items-center gap-6 group relative overflow-hidden">
                              <div className={`absolute left-0 top-0 bottom-0 w-1 ${inStock ? 'bg-emerald-500' : 'bg-slate-200'}`} />

                              <div className="flex items-center gap-4 flex-1 w-full md:w-auto pl-2">
                                  <div className="w-16 h-16 bg-slate-50 rounded-xl overflow-hidden shrink-0 relative border border-slate-100">
                                      {item.imageUrl ? (
                                        <img src={item.imageUrl} alt={item.id} className="w-full h-full object-cover"/>
                                      ) : (
                                        <div className="w-full h-full bg-slate-100 flex items-center justify-center">
                                            <ImageIcon size={24} className="text-slate-300" />
                                        </div>
                                      )}
                                  </div>
                                  <div>
                                      <h3 className="font-bold text-lg text-slate-800 group-hover:text-emerald-600 transition-colors cursor-pointer flex items-center gap-2" onClick={() => setSelectedProduct(item.product)}>
                                          {displayName}
                                          {item.suffix && <span className="text-xs bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded border border-amber-100">{item.description}</span>}
                                          {item.isSingleVariantMode && <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded border border-slate-200" title="Μοναδική Παραλλαγή">1 Var</span>}
                                      </h3>
                                      <div className="flex items-center gap-3 mt-0.5">
                                          <p className="text-xs text-slate-500 font-medium">{item.category}</p>
                                          {displayPrice > 0 && (
                                              <div className="flex items-baseline gap-1.5">
                                                  <span className="text-xs font-bold text-slate-700 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100">{formatCurrency(displayPrice)}</span>
                                                  <span className="text-[10px] text-slate-400 font-medium">Λιαν: {formatDecimal(displayRetail, 0)}€</span>
                                              </div>
                                          )}
                                      </div>
                                  </div>
                              </div>

                              <div className="flex-1 flex gap-2 overflow-x-auto w-full md:w-auto scrollbar-hide py-2 items-center">
                                   {Object.entries(item.locationStock).map(([whId, qty]) => {
                                       if (Number(qty) <= 0) return null;
                                       const whObj = warehouses?.find(w => w.id === whId);
                                       const whName = whObj ? getWarehouseNameClean(whObj) : 'Άγνωστο';
                                       const isCentral = whId === SYSTEM_IDS.CENTRAL;
                                       const isSelected = viewWarehouseId === whId;
                                       
                                       return (
                                           <div key={whId} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-bold whitespace-nowrap shadow-sm transition-all ${isSelected ? 'ring-2 ring-emerald-500 ring-offset-1' : ''} ${isCentral ? 'bg-slate-50 border-slate-200 text-slate-700' : 'bg-blue-50 border-blue-100 text-blue-700'}`}>
                                               <span className="text-[10px] uppercase opacity-70">{whName.substring(0, 15)}</span>
                                               <span className="text-base">{Number(qty)}</span>
                                           </div>
                                       );
                                   })}
                                   {item.totalStock === 0 && <span className="text-slate-400 text-sm italic">Εξαντλημένο</span>}
                              </div>

                              {hasDemand && (
                                  <div className={`flex items-center gap-3 px-4 py-2 rounded-xl border w-full md:w-auto justify-center ${canFulfill ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-orange-50 border-orange-200 text-orange-800'}`}>
                                      {canFulfill ? <CheckCircle size={20} className="text-emerald-600"/> : <AlertTriangle size={20} className="text-orange-500"/>}
                                      <div className="text-xs font-bold">
                                          <div className="uppercase tracking-wide opacity-70">Ζητηση</div>
                                          <div className="text-sm">
                                              {canFulfill ? 'Έτοιμο για αποστολή' : 'Έλλειψη στοκ'} ({item.demandQty} τεμ)
                                          </div>
                                      </div>
                                  </div>
                              )}

                              <div className="flex items-center gap-2 w-full md:w-auto justify-end border-t md:border-t-0 pt-3 md:pt-0 mt-3 md:mt-0">
                                  <button onClick={() => openTransfer(item)} className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2.5 rounded-xl font-bold text-sm transition-colors">
                                      <ArrowLeftRight size={16}/> Μεταφορά
                                  </button>
                                  <button onClick={() => setSelectedProduct(item.product)} className="bg-[#060b00] text-white p-2.5 rounded-xl hover:bg-black transition-colors">
                                      <Edit2 size={16}/>
                                  </button>
                                  <button onClick={() => handleDeleteItem(item)} className="bg-red-50 text-red-600 p-2.5 rounded-xl hover:bg-red-100 transition-colors border border-red-100">
                                      <Trash2 size={16}/>
                                  </button>
                              </div>
                          </div>
                      );
                  })}
                  {filteredInventory.length === 0 && (
                      <div className="text-center py-20 text-slate-400">
                          <Package size={48} className="mx-auto mb-4 opacity-20"/>
                          <p className="font-medium">Δεν βρέθηκαν αποθέματα με αυτά τα κριτήρια.</p>
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
                           <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${wh.is_system ? 'bg-[#060b00] text-white' : 'bg-blue-600 text-white'} shadow-lg`}>
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

      {isEditingWarehouse && (
          <div className="fixed inset-0 z-[150] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl p-8 animate-in zoom-in-95 border border-slate-100">
                  <div className="flex justify-between items-center mb-6">
                      <h3 className="text-xl font-bold text-slate-800">{warehouseForm.id ? 'Επεξεργασία' : 'Νέος Χώρος'}</h3>
                      <button onClick={() => setIsEditingWarehouse(false)}><X size={20}/></button>
                  </div>
                  <div className="space-y-4">
                      <input className="w-full p-3 border rounded-xl" value={warehouseForm.name} onChange={e => setWarehouseForm({...warehouseForm,name: e.target.value})} placeholder="Όνομασία"/>
                      <select className="w-full p-3 border rounded-xl bg-white" value={warehouseForm.type} onChange={e => setWarehouseForm({...warehouseForm, type: e.target.value as any})}>
                          <option value="Store">Κατάστημα</option><option value="Warehouse">Αποθήκη</option><option value="Showroom">Δειγματολόγιο</option>
                      </select>
                      <button onClick={saveWarehouse} className="w-full bg-[#060b00] text-white py-3 rounded-xl font-bold hover:bg-black">Αποθήκευση</button>
                  </div>
              </div>
          </div>
      )}

      {transferModalOpen && transferItem && (
          <div className="fixed inset-0 z-[150] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 border border-slate-100 flex flex-col">
                  <div className="bg-slate-50 p-6 border-b border-slate-100 flex justify-between items-center">
                      <div className="flex items-center gap-4">
                           <div className="w-16 h-16 rounded-xl object-cover bg-white border border-slate-200">
                             {transferItem.imageUrl ? <img src={transferItem.imageUrl} className="w-full h-full object-cover rounded-xl" alt="thumb"/> : <div className="w-full h-full flex items-center justify-center"><ImageIcon size={24} className="text-slate-300"/></div>}
                           </div>
                           <div>
                               <h3 className="text-xl font-bold text-slate-800">{transferItem.masterSku}{transferItem.suffix ? `-${transferItem.suffix}` : ''}</h3>
                               <p className="text-slate-500 text-sm">Μεταφορά Αποθέματος</p>
                           </div>
                      </div>
                      <button onClick={() => setTransferModalOpen(false)} className="p-2 hover:bg-slate-200 rounded-full text-slate-400 hover:text-slate-600"><X size={20}/></button>
                  </div>
                  <div className="p-8 space-y-6">
                      <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                          <div className="flex-1 w-full"><label className="text-xs font-bold text-slate-400 uppercase">Από</label><select className="w-full p-3 border rounded-xl font-bold" value={sourceId} onChange={e => setSourceId(e.target.value)}>{warehouses?.map(w => <option key={w.id} value={w.id} disabled={w.id===targetId}>{getWarehouseNameClean(w)} ({transferItem.locationStock[w.id] || 0})</option>)}</select></div>
                          <ArrowRight className="text-slate-300 hidden md:block" />
                          <div className="flex-1 w-full"><label className="text-xs font-bold text-slate-400 uppercase">Προς</label><select className="w-full p-3 border rounded-xl font-bold" value={targetId} onChange={e => setTargetId(e.target.value)}>{warehouses?.map(w => <option key={w.id} value={w.id} disabled={w.id===sourceId}>{getWarehouseNameClean(w)} ({transferItem.locationStock[w.id] || 0})</option>)}</select></div>
                      </div>
                      <div className="bg-slate-50 p-4 rounded-xl flex items-center justify-between">
                          <span className="font-bold text-slate-600">Ποσότητα</span>
                          <input type="number" min="1" max={transferItem.locationStock[sourceId] || 0} value={transferQty} onChange={e => setTransferQty(parseInt(e.target.value))} className="w-24 text-center p-2 rounded-lg border font-bold text-lg"/>
                      </div>
                      <button onClick={executeTransfer} disabled={isTransferring} className="w-full bg-[#060b00] text-white py-4 rounded-xl font-bold hover:bg-black transition-all">{isTransferring ? 'Μεταφορά...' : 'Επιβεβαίωση'}</button>
                  </div>
              </div>
          </div>
      )}

      {selectedProduct && (
        <ProductDetails 
          product={selectedProduct} 
          allProducts={products}
          allMaterials={[]} 
          onClose={() => setSelectedProduct(null)}
          setPrintItems={setPrintItems}
          settings={settings}
          collections={collections}
          allMolds={molds}
          viewMode="warehouse" 
        />
      )}

      {showScanner && (
          <BarcodeScanner 
            onScan={handleGlobalScan} 
            onClose={() => setShowScanner(false)} 
          />
      )}
    </div>
  );
}
