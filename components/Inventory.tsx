
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Product, ProductVariant, Warehouse, Order, OrderStatus, Mold } from '../types';
import { Search, Store, ArrowLeftRight, Package, X, Plus, Trash2, Edit2, ArrowRight, ShoppingBag, AlertTriangle, CheckCircle, Zap, ScanBarcode, ChevronDown, Printer, Filter, ImageIcon, Camera, Ruler, Loader2 } from 'lucide-react';
import ProductDetails from './ProductDetails';
import { useUI } from './UIProvider';
import { api, SYSTEM_IDS, recordStockMovement, supabase, deleteProduct } from '../lib/supabase';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import BarcodeScanner from './BarcodeScanner';
import { formatCurrency, formatDecimal } from '../utils/pricingEngine';
import { getSizingInfo, isSizable } from '../utils/sizing';

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

interface Props {
  products: Product[];
  setPrintItems: (items: { product: Product; variant?: ProductVariant; quantity: number, format?: 'standard' | 'simple' }[]) => void;
  settings: any;
  collections: any[];
  molds: Mold[];
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
  const [scanSize, setScanSize] = useState('');
  
  const inputRef = useRef<HTMLInputElement>(null);
  const listParentRef = useRef<HTMLDivElement>(null);

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
          orders.filter(o => o.status === OrderStatus.Pending).forEach(o => {
              o.items.forEach(i => {
                  const key = i.sku + (i.variant_suffix || '');
                  demandMap[key] = (demandMap[key] || 0) + i.quantity;
              });
          });
      }

      products.forEach(p => {
          if (p.variants && p.variants.length === 1) {
              const v = p.variants[0];
              const key = p.sku + v.suffix;
              const mergedLocStock: Record<string, number> = { [SYSTEM_IDS.CENTRAL]: (p.stock_qty || 0) + (v.stock_qty || 0), [SYSTEM_IDS.SHOWROOM]: (p.sample_qty || 0) };
              new Set([...Object.keys(p.location_stock || {}), ...Object.keys(v.location_stock || {})]).forEach(id => {
                  if (id !== SYSTEM_IDS.CENTRAL && id !== SYSTEM_IDS.SHOWROOM) mergedLocStock[id] = (p.location_stock?.[id] || 0) + (v.location_stock?.[id] || 0);
              });
              const total = Object.values(mergedLocStock).reduce((a, b) => a + b, 0);
              if (total > 0 || demandMap[key] || demandMap[p.sku]) items.push({ id: key, masterSku: p.sku, suffix: v.suffix, description: v.description, category: p.category, imageUrl: p.image_url, locationStock: mergedLocStock, totalStock: total, demandQty: (demandMap[p.sku] || 0) + (demandMap[key] || 0), product: p, variantRef: v, isSingleVariantMode: true });
          } else if (p.variants && p.variants.length > 1) {
              p.variants.forEach(v => {
                  const key = p.sku + v.suffix;
                  const variantLocStock = { ...v.location_stock, [SYSTEM_IDS.CENTRAL]: v.stock_qty };
                  const total = Object.values(variantLocStock).reduce((a, b) => a + b, 0);
                  if (total > 0 || demandMap[key]) items.push({ id: key, masterSku: p.sku, suffix: v.suffix, description: v.description, category: p.category, imageUrl: p.image_url, locationStock: variantLocStock, totalStock: total, demandQty: demandMap[key] || 0, product: p, variantRef: v });
              });
          } else {
              const displayStock = { ...p.location_stock, [SYSTEM_IDS.CENTRAL]: p.stock_qty, [SYSTEM_IDS.SHOWROOM]: p.sample_qty };
              const total = Object.values(displayStock).reduce((a, b) => a + b, 0);
               if (total > 0 || demandMap[p.sku]) items.push({ id: p.sku, masterSku: p.sku, suffix: '', description: 'Βασικό', category: p.category, imageUrl: p.image_url, locationStock: displayStock, totalStock: total, demandQty: demandMap[p.sku] || 0, product: p });
          }
      });
      return items;
  }, [products, orders]);

  const filteredInventory = useMemo(() => {
    return rawInventory.filter(i => {
      if (viewWarehouseId !== 'ALL' && (i.locationStock[viewWarehouseId] || 0) <= 0) return false;
      const term = searchTerm.toUpperCase();
      return !term || i.masterSku.includes(term) || i.suffix.includes(term) || i.category.toLowerCase().includes(term.toLowerCase());
    });
  }, [rawInventory, viewWarehouseId, searchTerm]);

  // VIRTUALIZER
  const rowVirtualizer = useVirtualizer({
      count: filteredInventory.length,
      getScrollElement: () => listParentRef.current,
      estimateSize: () => 100, // Reduced estimate height to fit compact cards
      overscan: 10,
  });

  const handleDeleteItem = async (item: InventoryItem) => {
      const isSpecificView = viewWarehouseId !== 'ALL';
      const warehouseName = warehouses?.find(w => w.id === viewWarehouseId)?.name;
      if (!await confirm({ title: isSpecificView ? 'Αφαίρεση από Αποθήκη' : 'Μηδενισμός Αποθέματος', message: isSpecificView ? `Μηδενισμός για το "${item.masterSku}${item.suffix ? '-'+item.suffix : ''}" στον χώρο "${warehouseName}";` : `Μηδενισμός σε ΟΛΕΣ τις αποθήκες για το ${item.masterSku}${item.suffix ? '-'+item.suffix : ''}.`, isDestructive: true, confirmText: 'Εκκαθάριση' })) return;
      try {
          const sku = item.masterSku; const suffix = item.suffix;
          const clearCustomStock = async (whId?: string) => {
              let q = supabase.from('product_stock').delete().eq('product_sku', sku);
              if (suffix) q = q.eq('variant_suffix', suffix); else q = q.is('variant_suffix', null);
              if (whId) q = q.eq('warehouse_id', whId); await q;
          };
          if (isSpecificView) {
              let amt = item.locationStock[viewWarehouseId] || 0;
              if (viewWarehouseId === SYSTEM_IDS.CENTRAL) {
                  if (item.isSingleVariantMode) { await supabase.from('products').update({ stock_qty: 0, stock_by_size: {} }).eq('sku', sku); if (suffix) await supabase.from('product_variants').update({ stock_qty: 0, stock_by_size: {} }).match({ product_sku: sku, suffix }); }
                  else if (suffix) await supabase.from('product_variants').update({ stock_qty: 0, stock_by_size: {} }).match({ product_sku: sku, suffix });
                  else await supabase.from('products').update({ stock_qty: 0, stock_by_size: {} }).eq('sku', sku);
              } else if (viewWarehouseId === SYSTEM_IDS.SHOWROOM) await supabase.from('products').update({ sample_qty: 0, sample_stock_by_size: {} }).eq('sku', sku);
              else await clearCustomStock(viewWarehouseId);
              if (amt > 0) await recordStockMovement(sku, -amt, `Εκκαθάριση: ${warehouseName}`, suffix);
          } else {
              if (item.isSingleVariantMode) { await supabase.from('products').update({ stock_qty: 0, stock_by_size: {} }).eq('sku', sku); if (suffix) await supabase.from('product_variants').update({ stock_qty: 0, stock_by_size: {} }).match({ product_sku: sku, suffix }); }
                  else if (suffix) await supabase.from('product_variants').update({ stock_qty: 0, stock_by_size: {} }).match({ product_sku: sku, suffix });
              else await supabase.from('products').update({ stock_qty: 0, stock_by_size: {} }).eq('sku', sku);
              await supabase.from('products').update({ sample_qty: 0, sample_stock_by_size: {} }).eq('sku', sku);
              await clearCustomStock(); if (item.totalStock > 0) await recordStockMovement(sku, -item.totalStock, 'Μαζική Εκκαθάριση', suffix);
          }
          queryClient.invalidateQueries({ queryKey: ['products'] }); showToast('Το απόθεμα μηδενίστηκε.', 'success');
      } catch (err: any) { showToast(err.message || 'Σφάλμα', 'error'); }
  };

  const handleScanInput = (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value.toUpperCase(); setScanInput(val); setScanSize('');
      if (val.length > 0) {
          let match = rawInventory.find(i => (i.masterSku + i.suffix).startsWith(val));
          if (!match) {
             const prod = products.find(p => p.sku.startsWith(val));
             if (prod) {
                 if (prod.variants?.length === 1) setScanSuggestion(prod.sku + prod.variants[0].suffix);
                 else if (prod.variants?.length) { const v = prod.variants.find(v => (prod.sku + v.suffix).startsWith(val)); setScanSuggestion(v ? prod.sku + v.suffix : prod.sku); }
                 else setScanSuggestion(prod.sku);
             } else setScanSuggestion('');
          } else setScanSuggestion(match.masterSku + match.suffix);
      } else setScanSuggestion('');
  };

  const executeQuickAdd = async () => {
      const targetCode = scanSuggestion || scanInput; const product = products.find(p => targetCode.startsWith(p.sku));
      if (!product) { showToast(`Ο κωδικός δεν βρέθηκε.`, "error"); return; }
      let varSuffix = targetCode.replace(product.sku, ''); let variant = product.variants?.find(v => v.suffix === varSuffix);
      if (product.variants?.length === 1 && !varSuffix) { variant = product.variants[0]; varSuffix = variant.suffix; }
      const sizing = getSizingInfo(product); if (sizing && !scanSize) { showToast(`Επιλέξτε ${sizing.type}.`, "error"); return; }
      try {
          const whName = warehouses?.find(w => w.id === scanTargetId)?.name || 'Αποθήκη';
          if (variant) {
               if (scanTargetId === SYSTEM_IDS.CENTRAL) {
                   const map = variant.stock_by_size || {}; if (scanSize) map[scanSize] = (map[scanSize] || 0) + scanQty;
                   await supabase.from('product_variants').update({ stock_qty: (variant.stock_qty || 0) + scanQty, stock_by_size: map }).match({ product_sku: product.sku, suffix: variant.suffix });
               } else await supabase.from('product_stock').upsert({ product_sku: product.sku, variant_suffix: variant.suffix, warehouse_id: scanTargetId, quantity: (variant.location_stock?.[scanTargetId] || 0) + scanQty, size_info: scanSize || null }, { onConflict: 'product_sku, warehouse_id, variant_suffix' });
               await recordStockMovement(product.sku, scanQty, `Γρήγορη Προσθήκη: ${whName}`, variant.suffix);
          } else {
              if (scanTargetId === SYSTEM_IDS.CENTRAL) { const map = product.stock_by_size || {}; if (scanSize) map[scanSize] = (map[scanSize] || 0) + scanQty; await supabase.from('products').update({ stock_qty: product.stock_qty + scanQty, stock_by_size: map }).eq('sku', product.sku); }
              else if (scanTargetId === SYSTEM_IDS.SHOWROOM) { const map = product.sample_stock_by_size || {}; if (scanSize) map[scanSize] = (map[scanSize] || 0) + scanQty; await supabase.from('products').update({ sample_qty: (product.sample_qty || 0) + scanQty, sample_stock_by_size: map }).eq('sku', product.sku); }
              else await supabase.from('product_stock').upsert({ product_sku: product.sku, warehouse_id: scanTargetId, quantity: (product.location_stock?.[scanTargetId] || 0) + scanQty, size_info: scanSize || null });
              await recordStockMovement(product.sku, scanQty, `Γρήγορη Προσθήκη: ${whName}`);
          }
          queryClient.invalidateQueries({ queryKey: ['products'] }); showToast(`Προστέθηκε ${scanQty} τεμ. στον ${product.sku}${variant ? variant.suffix : ''}`, "success");
          setScanInput(''); setScanSuggestion(''); setScanSize(''); setScanQty(1); inputRef.current?.focus();
      } catch (err) { showToast("Σφάλμα ενημέρωσης.", "error"); }
  };

  const executeTransfer = async () => {
      if (!transferItem || sourceId === targetId) return; const currentSourceQty = transferItem.locationStock[sourceId] || 0;
      if (transferQty > currentSourceQty) { showToast("Ανεπαρκές απόθεμα.", "error"); return; }
      setIsTransferring(true);
      try {
          const variantSuffix = transferItem.suffix; const sku = transferItem.masterSku;
          const updateStock = async (whId: string, qty: number) => {
               if (whId === SYSTEM_IDS.CENTRAL) {
                   if (variantSuffix) await supabase.from('product_variants').update({ stock_qty: qty }).match({ product_sku: sku, suffix: variantSuffix });
                   else await supabase.from('products').update({ stock_qty: qty }).eq('sku', sku);
               } else if (whId === SYSTEM_IDS.SHOWROOM && !variantSuffix) await supabase.from('products').update({ sample_qty: qty }).eq('sku', sku);
               else await supabase.from('product_stock').upsert({ product_sku: sku, variant_suffix: variantSuffix || null, warehouse_id: whId, quantity: qty }, { onConflict: 'product_sku, warehouse_id, variant_suffix' });
          };
          await updateStock(sourceId, currentSourceQty - transferQty); await updateStock(targetId, (transferItem.locationStock[targetId] || 0) + transferQty);
          await recordStockMovement(sku, transferQty, `Transfer: ${getWarehouseNameClean(warehouses!.find(w=>w.id===sourceId)!)} -> ${getWarehouseNameClean(warehouses!.find(w=>w.id===targetId)!)}`, variantSuffix);
          queryClient.invalidateQueries({ queryKey: ['products'] }); showToast("Η μεταφορά ολοκληρώθηκε.", "success"); setTransferModalOpen(false);
      } catch (e: any) { showToast(`Σφάλμα: ${e.message}`, "error"); } finally { setIsTransferring(false); }
  };

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

  return (
    <div className="flex flex-col h-full space-y-6">
      <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-6 shrink-0">
         <div>
            <h1 className="text-3xl font-bold text-[#060b00] tracking-tight flex items-center gap-3">
                <div className="p-2 bg-slate-800 text-white rounded-xl"><Store size={24} /></div>
                Κέντρο Αποθήκης
            </h1>
         </div>
         <div className="flex bg-slate-100 p-1 rounded-xl">
            <button onClick={() => setActiveTab('stock')} className={`px-6 py-2.5 rounded-lg font-bold text-sm transition-all flex items-center gap-2 ${activeTab === 'stock' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}><Package size={16}/> Απόθεμα</button>
            <button onClick={() => setActiveTab('warehouses')} className={`px-6 py-2.5 rounded-lg font-bold text-sm transition-all flex items-center gap-2 ${activeTab === 'warehouses' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}><Store size={16}/> Χώροι</button>
         </div>
      </div>

      {activeTab === 'stock' && (
          <div className="flex-1 flex flex-col min-h-0 space-y-6 animate-in slide-in-from-bottom-2">
              <div className="bg-[#060b00] p-5 rounded-2xl shadow-lg flex flex-col lg:flex-row items-center gap-4 border border-slate-800 shrink-0">
                  <div className="flex items-center gap-2 text-white/80 font-bold shrink-0"><ScanBarcode size={24} className="text-amber-400" /> <span className="uppercase tracking-wider text-sm">Γρήγορη Εισαγωγή</span></div>
                  <div className="flex-1 w-full grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                      <div className="md:col-span-3">
                          <label className="text-[10px] text-slate-400 font-bold uppercase mb-1 block">Στόχος</label>
                          <select value={scanTargetId} onChange={(e) => setScanTargetId(e.target.value)} className="w-full bg-slate-800 text-white font-bold p-3 rounded-xl border border-slate-700 focus:ring-2 focus:ring-amber-500 outline-none cursor-pointer">{warehouses?.map(w => <option key={w.id} value={w.id}>{getWarehouseNameClean(w)}</option>)}</select>
                      </div>
                      <div className="md:col-span-5 relative">
                          <label className="text-[10px] text-slate-400 font-bold uppercase mb-1 block">Κωδικός</label>
                          <div className="absolute inset-x-0 bottom-0 top-6 p-3 pointer-events-none font-mono text-lg tracking-wider flex items-center"><span className="text-transparent">{scanInput}</span><span className="text-slate-600">{scanSuggestion.startsWith(scanInput) ? scanSuggestion.substring(scanInput.length) : ''}</span></div>
                          <input ref={inputRef} type="text" value={scanInput} onChange={handleScanInput} onKeyDown={e => { if(e.key==='ArrowRight'&&scanSuggestion){e.preventDefault();setScanInput(scanSuggestion);} if(e.key==='Enter'){e.preventDefault();executeQuickAdd();} }} placeholder="π.χ. XR..." className="w-full p-3 bg-white text-slate-900 font-mono text-lg font-bold rounded-xl outline-none focus:ring-4 focus:ring-amber-500/50 uppercase tracking-wider"/>
                      </div>
                      {getScanProductInfo()?.product && getSizingInfo(getScanProductInfo()!.product) && (
                          <div className="md:col-span-2">
                              <label className="text-[10px] text-amber-400 font-bold uppercase mb-1 block">{getSizingInfo(getScanProductInfo()!.product)!.type}</label>
                              <select value={scanSize} onChange={e => setScanSize(e.target.value)} className="w-full bg-slate-800 text-amber-400 font-bold p-3 rounded-xl border border-amber-500/50 outline-none"><option value="">Επιλογή</option>{getSizingInfo(getScanProductInfo()!.product)!.sizes.map(s => <option key={s} value={s}>{s}</option>)}</select>
                          </div>
                      )}
                      <div className="md:col-span-2 flex gap-2"><div className="w-20"><label className="text-[10px] text-slate-400 font-bold uppercase mb-1 block">Ποσ.</label><input type="number" min="1" value={scanQty} onChange={e => setScanQty(parseInt(e.target.value)||1)} className="w-full p-3 text-center font-bold rounded-xl outline-none bg-slate-800 text-white border border-slate-700"/></div><button onClick={executeQuickAdd} className="flex-1 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl flex items-center justify-center mt-6"><Plus size={20}/></button></div>
                  </div>
              </div>

              <div className="flex flex-col md:flex-row gap-4 shrink-0">
                 <div className="w-full md:w-64 relative"><Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} /><select value={viewWarehouseId} onChange={e => setViewWarehouseId(e.target.value)} className="w-full pl-10 p-3 bg-white border border-slate-200 rounded-xl outline-none appearance-none font-medium cursor-pointer"><option value="ALL">Όλες οι Αποθήκες</option>{warehouses?.map(w => <option key={w.id} value={w.id}>{getWarehouseNameClean(w)}</option>)}</select></div>
                 <div className="relative flex-1 flex gap-2">
                     <div className="relative flex-1"><Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} /><input type="text" placeholder="Φίλτρο λίστας..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-12 pr-4 py-3 border border-slate-200 rounded-xl outline-none w-full bg-white shadow-sm"/></div>
                     <button onClick={() => setShowScanner(true)} className="bg-white px-5 rounded-xl border border-slate-200 text-slate-600 hover:text-slate-900 transition-all shadow-sm flex items-center gap-2 font-bold"><Camera size={20} /> Scan</button>
                 </div>
              </div>

              <div ref={listParentRef} className="flex-1 overflow-y-auto custom-scrollbar pr-1 relative">
                  {filteredInventory.length > 0 ? (
                      <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, width: '100%', position: 'relative' }}>
                          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                              const item = filteredInventory[virtualRow.index];
                              const inStock = item.totalStock > 0;
                              const displayPrice = item.variantRef?.selling_price ?? item.product.selling_price;
                              return (
                                  <div 
                                      key={virtualRow.key} 
                                      className="absolute top-0 left-0 w-full" 
                                      style={{ height: `${virtualRow.size}px`, transform: `translateY(${virtualRow.start}px)`, padding: '4px 0' }}
                                  >
                                      <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all flex flex-col md:flex-row items-center gap-6 group relative overflow-hidden h-full">
                                          <div className={`absolute left-0 top-0 bottom-0 w-1 ${inStock ? 'bg-emerald-500' : 'bg-slate-200'}`} />
                                          <div className="flex items-center gap-4 flex-1 w-full md:w-auto pl-2">
                                              <div className="w-16 h-16 bg-slate-50 rounded-xl overflow-hidden shrink-0 border border-slate-100">{item.imageUrl ? <img src={item.imageUrl} className="w-full h-full object-cover"/> : <div className="w-full h-full flex items-center justify-center text-slate-300"><ImageIcon size={24}/></div>}</div>
                                              <div>
                                                  <h3 className="font-bold text-lg text-slate-800 cursor-pointer" onClick={() => setSelectedProduct(item.product)}>{item.isSingleVariantMode || !item.suffix ? item.masterSku : `${item.masterSku}-${item.suffix}`} {item.suffix && <span className="text-xs bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded border border-amber-100 ml-1">{item.description}</span>}</h3>
                                                  <div className="flex items-center gap-3 mt-0.5"><p className="text-xs text-slate-500">{item.category}</p>{displayPrice > 0 && <span className="text-xs font-bold text-slate-700 bg-slate-50 px-1.5 py-0.5 rounded">{formatCurrency(displayPrice)}</span>}</div>
                                              </div>
                                          </div>
                                          <div className="flex-1 flex gap-2 overflow-x-auto w-full md:w-auto scrollbar-hide py-2 items-center">
                                               {Object.entries(item.locationStock).map(([whId, qty]) => {
                                                   if (Number(qty) <= 0) return null;
                                                   const wh = warehouses?.find(w => w.id === whId);
                                                   return <div key={whId} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-bold whitespace-nowrap shadow-sm ${whId === SYSTEM_IDS.CENTRAL ? 'bg-slate-50 border-slate-200' : 'bg-blue-50 border-blue-100 text-blue-700'}`}><span className="text-[10px] uppercase opacity-70">{(wh ? getWarehouseNameClean(wh) : '???').substring(0, 15)}</span><span className="text-base">{qty}</span></div>;
                                               })}
                                               {item.totalStock === 0 && <span className="text-slate-400 text-sm italic">Εξαντλημένο</span>}
                                          </div>
                                          <div className="flex items-center gap-2 w-full md:w-auto justify-end"><button onClick={() => openTransfer(item)} className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2.5 rounded-xl font-bold text-sm"><ArrowLeftRight size={16}/></button><button onClick={() => setSelectedProduct(item.product)} className="bg-[#060b00] text-white p-2.5 rounded-xl"><Edit2 size={16}/></button><button onClick={() => handleDeleteItem(item)} className="bg-red-50 text-red-600 p-2.5 rounded-xl"><Trash2 size={16}/></button></div>
                                      </div>
                                  </div>
                              );
                          })}
                      </div>
                  ) : (
                      <div className="text-center py-20 text-slate-400"><Package size={48} className="mx-auto mb-4 opacity-20"/><p className="font-medium">Δεν βρέθηκαν αποθέματα.</p></div>
                  )}
              </div>
          </div>
      )}

      {activeTab === 'warehouses' && (
           <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in slide-in-from-right duration-300">
               {warehouses?.map(wh => (
                   <div key={wh.id} className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100 relative group hover:-translate-y-1 transition-transform">
                       <div className="flex justify-between items-start mb-6"><div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${wh.is_system ? 'bg-[#060b00]' : 'bg-blue-600'} text-white shadow-lg`}><Store size={28} /></div>{!wh.is_system && <div className="flex gap-2"><button onClick={() => handleEditWarehouse(wh)} className="p-2 text-slate-400 hover:text-slate-700"><Edit2 size={16}/></button><button onClick={() => handleDeleteWarehouse(wh.id)} className="p-2 text-slate-400 hover:text-red-500"><Trash2 size={16}/></button></div>}</div>
                       <h3 className="text-2xl font-black text-slate-800 tracking-tight">{getWarehouseNameClean(wh)}</h3>
                   </div>
               ))}
               <button onClick={handleCreateWarehouse} className="border-2 border-dashed border-slate-200 rounded-3xl p-6 flex flex-col items-center justify-center text-slate-400 hover:bg-slate-50 min-h-[200px] group"><div className="w-16 h-16 rounded-full bg-slate-50 flex items-center justify-center mb-4"><Plus size={32}/></div><span className="font-bold">Νέος Χώρος</span></button>
           </div>
      )}

      {/* Warehouse Editor Modal */}
      {isEditingWarehouse && (
          <div className="fixed inset-0 z-[150] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl p-6 animate-in zoom-in-95 border border-slate-100">
                  <div className="flex justify-between items-center mb-6 pb-4 border-b border-slate-100">
                      <h3 className="text-xl font-bold text-slate-800">{warehouseForm.id ? 'Επεξεργασία Χώρου' : 'Νέος Χώρος'}</h3>
                      <button onClick={() => setIsEditingWarehouse(false)} className="p-2 hover:bg-slate-100 rounded-full text-slate-500"><X size={20}/></button>
                  </div>
                  <div className="space-y-4">
                      <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5 tracking-wide">Όνομα Χώρου</label>
                          <input type="text" value={warehouseForm.name} onChange={e => setWarehouseForm({...warehouseForm, name: e.target.value})} className="w-full p-3 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20" placeholder="π.χ. Υποκατάστημα Α"/>
                      </div>
                      <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5 tracking-wide">Τύπος</label>
                          <select value={warehouseForm.type} onChange={e => setWarehouseForm({...warehouseForm, type: e.target.value as any})} className="w-full p-3 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20">
                              <option value="Store">Κατάστημα</option>
                              <option value="Showroom">Δειγματολόγιο</option>
                              <option value="Central">Αποθήκη</option>
                              <option value="Other">Άλλο</option>
                          </select>
                      </div>
                      <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5 tracking-wide">Διεύθυνση</label>
                          <input type="text" value={warehouseForm.address} onChange={e => setWarehouseForm({...warehouseForm, address: e.target.value})} className="w-full p-3 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20"/>
                      </div>
                      <button onClick={handleSaveWarehouse} className="w-full bg-slate-900 text-white py-4 rounded-xl font-bold shadow-lg hover:bg-black transition-all mt-4">Αποθήκευση</button>
                  </div>
              </div>
          </div>
      )}

      {/* Transfer Modal */}
      {transferModalOpen && transferItem && (
          <div className="fixed inset-0 z-[150] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl p-8 animate-in zoom-in-95 border border-slate-100">
                  <div className="flex justify-between items-start mb-8">
                      <div>
                          <h3 className="text-2xl font-black text-slate-800">Μεταφορά Αποθέματος</h3>
                          <p className="text-slate-500 font-mono text-sm mt-1">{transferItem.masterSku}{transferItem.suffix}</p>
                      </div>
                      <button onClick={() => setTransferModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-full"><X size={24}/></button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                      <div>
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Από</label>
                          <select value={sourceId} onChange={e => setSourceId(e.target.value)} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none">
                              {warehouses?.map(w => (
                                  <option key={w.id} value={w.id} disabled={(transferItem.locationStock[w.id] || 0) <= 0}>
                                      {getWarehouseNameClean(w)} ({transferItem.locationStock[w.id] || 0})
                                  </option>
                              ))}
                          </select>
                      </div>
                      <div className="flex items-center justify-center pt-6">
                          <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                              <ArrowRight size={20}/>
                          </div>
                      </div>
                      <div className="md:col-start-2">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Προς</label>
                          <select value={targetId} onChange={e => setTargetId(e.target.value)} className="w-full p-4 bg-blue-50 border border-blue-200 text-blue-900 rounded-2xl font-bold outline-none">
                              {warehouses?.map(w => (
                                  <option key={w.id} value={w.id} disabled={w.id === sourceId}>{getWarehouseNameClean(w)}</option>
                              ))}
                          </select>
                      </div>
                  </div>

                  <div className="bg-slate-100 p-6 rounded-3xl border border-slate-200 text-center mb-8">
                      <label className="text-sm font-bold text-slate-600 block mb-3">Ποσότητα Μεταφοράς</label>
                      <input 
                        type="number" 
                        min="1" 
                        max={transferItem.locationStock[sourceId] || 1} 
                        value={transferQty} 
                        onChange={e => setTransferQty(parseInt(e.target.value) || 1)}
                        className="w-32 p-4 text-center font-black text-4xl bg-transparent border-b-4 border-slate-300 outline-none focus:border-blue-500"
                      />
                  </div>

                  <button 
                    onClick={executeTransfer}
                    disabled={isTransferring || sourceId === targetId || transferQty > (transferItem.locationStock[sourceId] || 0)}
                    className="w-full py-5 bg-[#060b00] text-white rounded-2xl font-bold text-lg shadow-xl shadow-slate-200 hover:bg-black transition-all flex items-center justify-center gap-3 disabled:opacity-50"
                  >
                      {isTransferring ? <Loader2 className="animate-spin" size={24}/> : <ArrowLeftRight size={24}/>}
                      {isTransferring ? 'Μεταφορά...' : 'Εκτέλεση Μεταφοράς'}
                  </button>
              </div>
          </div>
      )}

      {selectedProduct && <ProductDetails product={selectedProduct} allProducts={products} allMaterials={[]} onClose={() => setSelectedProduct(null)} setPrintItems={setPrintItems} settings={settings} collections={collections} allMolds={molds} viewMode="warehouse" />}
      {showScanner && <BarcodeScanner onScan={handleGlobalScan} onClose={() => setShowScanner(false)} />}
    </div>
  );

  function handleGlobalScan(code: string) { const p = products.find(p => code.startsWith(p.sku)); if (p) setSelectedProduct(p); else showToast(`Ο κωδικός ${code} δεν βρέθηκε.`, 'error'); }
  function handleEditWarehouse(w: Warehouse) { setWarehouseForm(w); setIsEditingWarehouse(true); }
  function handleCreateWarehouse() { setWarehouseForm({ name: '', type: 'Store', address: '' }); setIsEditingWarehouse(true); }
  
  // @FIX: Implemented missing handleDeleteWarehouse function to resolve ReferenceError.
  async function handleDeleteWarehouse(id: string) {
      if (id === SYSTEM_IDS.CENTRAL || id === SYSTEM_IDS.SHOWROOM) {
          showToast("Δεν μπορείτε να διαγράψετε συστημικούς χώρους.", "error");
          return;
      }
      const yes = await confirm({
          title: 'Διαγραφή Χώρου',
          message: 'Είστε σίγουροι ότι θέλετε να διαγράψετε αυτόν τον χώρο; Το απόθεμα που περιέχει ενδέχεται να χαθεί από την προβολή.',
          isDestructive: true,
          confirmText: 'Διαγραφή'
      });
      if (!yes) return;
      try {
          await api.deleteWarehouse(id);
          queryClient.invalidateQueries({ queryKey: ['warehouses'] });
          showToast('Ο χώρος διαγράφηκε.', 'success');
      } catch (err: any) {
          showToast('Σφάλμα κατά τη διαγραφή.', 'error');
      }
  }

  function getScanProductInfo() { const t = scanSuggestion || scanInput; const p = products.find(p => t.startsWith(p.sku)); if(!p) return null; let s = t.replace(p.sku, ''); let v = p.variants?.find(v => v.suffix === s); if (p.variants?.length===1 && !s) { v = p.variants[0]; s = v.suffix; } return { product: p, variant: v, variantSuffix: s }; }
  function openTransfer(item: InventoryItem) { setTransferItem(item); setSourceId(SYSTEM_IDS.CENTRAL); setTargetId(SYSTEM_IDS.SHOWROOM); setTransferQty(1); setTransferModalOpen(true); }
}
