
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Product, ProductVariant, Warehouse, Order, OrderStatus, Mold, Gender } from '../types';
import { Search, Store, ArrowLeftRight, Package, X, Plus, Trash2, Edit2, ArrowRight, ShoppingBag, AlertTriangle, CheckCircle, Zap, ScanBarcode, ChevronDown, Printer, Filter, ImageIcon, Camera, Ruler, Loader2, Minus, History, Sparkles, ArrowDown, ArrowUp, Lightbulb } from 'lucide-react';
import ProductDetails from './ProductDetails';
import { useUI } from './UIProvider';
import { api, SYSTEM_IDS, recordStockMovement, supabase } from '../lib/supabase';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import BarcodeScanner from './BarcodeScanner';
import { formatCurrency, formatDecimal, analyzeSku, getVariantComponents, findProductByScannedCode, transliterateForBarcode } from '../utils/pricingEngine';
import { getSizingInfo, isSizable } from '../utils/sizing';
import { FINISH_CODES, STONE_CODES_MEN, STONE_CODES_WOMEN } from '../constants';

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

interface QuickActionHistory {
    id: string;
    sku: string;
    amount: number;
    target: string;
    timestamp: Date;
    type: 'add' | 'subtract';
}

const FINISH_COLORS: Record<string, string> = { 'X': 'text-amber-500', 'P': 'text-slate-500', 'D': 'text-orange-500', 'H': 'text-cyan-400', '': 'text-slate-400' };
const STONE_CATEGORIES: Record<string, string> = { 'KR': 'text-rose-500', 'QN': 'text-neutral-900', 'LA': 'text-blue-500', 'TY': 'text-teal-400', 'TG': 'text-orange-600', 'IA': 'text-red-700', 'BSU': 'text-slate-800', 'GSU': 'text-emerald-800', 'RSU': 'text-rose-800', 'MA': 'text-emerald-500', 'FI': 'text-slate-400', 'OP': 'text-indigo-400', 'NF': 'text-green-700', 'CO': 'text-orange-400', 'PCO': 'text-emerald-400', 'MCO': 'text-purple-400', 'PAX': 'text-green-500', 'MAX': 'text-blue-600', 'KAX': 'text-red-600', 'AI': 'text-slate-500', 'AP': 'text-cyan-500', 'AM': 'text-teal-600', 'LR': 'text-indigo-600', 'BST': 'text-sky-400', 'MP': 'text-blue-400', 'LE': 'text-slate-300', 'PR': 'text-green-400', 'KO': 'text-red-400', 'MV': 'text-purple-400', 'RZ': 'text-pink-400', 'AK': 'text-cyan-300', 'XAL': 'text-stone-400' };

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
  const [availableSuffixes, setAvailableSuffixes] = useState<{suffix: string, desc: string}[]>([]);
  const [scanTargetId, setScanTargetId] = useState<string>(SYSTEM_IDS.CENTRAL);
  const [scanQty, setScanQty] = useState(1);
  const [scanSize, setScanSize] = useState('');
  const [quickMode, setQuickMode] = useState<'add' | 'subtract'>('add');
  const [recentActions, setRecentActions] = useState<QuickActionHistory[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const listParentRef = useRef<HTMLDivElement>(null);

  const getWarehouseNameClean = (w: Warehouse) => w.id === SYSTEM_IDS.CENTRAL ? 'Κεντρική Αποθήκη' : (w.id === SYSTEM_IDS.SHOWROOM || w.type === 'Showroom' || w.name === 'Showroom' ? 'Δειγματολόγιο' : w.name);

  const rawInventory = useMemo(() => {
      if (!products) return [];
      const items: InventoryItem[] = [];
      const demandMap: Record<string, number> = {};
      if (orders) orders.filter(o => o.status === OrderStatus.Pending).forEach(o => o.items.forEach(i => { const key = i.sku + (i.variant_suffix || ''); demandMap[key] = (demandMap[key] || 0) + i.quantity; }));
      products.forEach(p => {
          if (p.variants && p.variants.length === 1) {
              const v = p.variants[0]; const key = p.sku + v.suffix;
              const mergedLocStock: Record<string, number> = { [SYSTEM_IDS.CENTRAL]: (p.stock_qty || 0) + (v.stock_qty || 0), [SYSTEM_IDS.SHOWROOM]: (p.sample_qty || 0) };
              new Set([...Object.keys(p.location_stock || {}), ...Object.keys(v.location_stock || {})]).forEach(id => { if (id !== SYSTEM_IDS.CENTRAL && id !== SYSTEM_IDS.SHOWROOM) mergedLocStock[id] = (p.location_stock?.[id] || 0) + (v.location_stock?.[id] || 0); });
              const total = Object.values(mergedLocStock).reduce((a, b) => a + b, 0);
              if (total > 0 || demandMap[key] || demandMap[p.sku]) items.push({ id: key, masterSku: p.sku, suffix: v.suffix, description: v.description, category: p.category, imageUrl: p.image_url, locationStock: mergedLocStock, totalStock: total, demandQty: (demandMap[p.sku] || 0) + (demandMap[key] || 0), product: p, variantRef: v, isSingleVariantMode: true });
          } else if (p.variants && p.variants.length > 1) {
              p.variants.forEach(v => {
                  const key = p.sku + v.suffix; const variantLocStock = { ...v.location_stock, [SYSTEM_IDS.CENTRAL]: v.stock_qty };
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

  const filteredInventory = useMemo(() => rawInventory.filter(i => {
      if (viewWarehouseId !== 'ALL' && (i.locationStock[viewWarehouseId] || 0) <= 0) return false;
      const term = searchTerm.toUpperCase();
      return !term || i.masterSku.includes(term) || i.suffix.includes(term) || i.category.toLowerCase().includes(term.toLowerCase());
  }), [rawInventory, viewWarehouseId, searchTerm]);

  const rowVirtualizer = useVirtualizer({ count: filteredInventory.length, getScrollElement: () => listParentRef.current, estimateSize: () => 100, overscan: 10 });

  const handleScanInput = (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value.toUpperCase();
      setScanInput(val);
      setScanSize('');
      if (val.length === 0) { setScanSuggestion(''); setAvailableSuffixes([]); return; }
      
      const match = findProductByScannedCode(val, products);
      if (match) {
          const { product } = match;
          setScanSuggestion(product.sku + (match.variant?.suffix || ''));
          setAvailableSuffixes(product.variants?.map(v => ({ suffix: v.suffix, desc: v.description })) || []);
      } else {
          const masterMatch = products.find(p => p.sku.startsWith(val) || transliterateForBarcode(p.sku).startsWith(val));
          if (masterMatch) {
              setScanSuggestion(masterMatch.sku);
              setAvailableSuffixes(masterMatch.variants?.map(v => ({ suffix: v.suffix, desc: v.description })) || []);
          } else {
              setScanSuggestion(''); setAvailableSuffixes([]);
          }
      }
  };

  const selectSuffix = (suffix: string) => {
      const prod = getScanProductInfo()?.product;
      if (prod) { const fullCode = prod.sku + suffix; setScanInput(fullCode); setScanSuggestion(fullCode); setAvailableSuffixes([]); inputRef.current?.focus(); }
  };

  const executeQuickAdd = async () => {
      const targetCode = scanSuggestion || scanInput; 
      if (!targetCode) return;
      const match = findProductByScannedCode(targetCode, products);
      if (!match) { showToast(`Ο κωδικός δεν βρέθηκε.`, "error"); return; }
      const { product, variant } = match;
      const sizing = getSizingInfo(product); 
      if (sizing && !scanSize) { showToast(`Επιλέξτε ${sizing.type}.`, "error"); return; }
      const changeAmount = quickMode === 'add' ? scanQty : -scanQty;
      try {
          const whName = warehouses?.find(w => w.id === scanTargetId)?.name || 'Αποθήκη';
          if (variant) {
               if (scanTargetId === SYSTEM_IDS.CENTRAL) {
                   const map = variant.stock_by_size ? { ...variant.stock_by_size } : {}; if (scanSize) map[scanSize] = (map[scanSize] || 0) + changeAmount;
                   await supabase.from('product_variants').update({ stock_qty: (variant.stock_qty || 0) + changeAmount, stock_by_size: map }).match({ product_sku: product.sku, suffix: variant.suffix });
               } else await supabase.from('product_stock').upsert({ product_sku: product.sku, variant_suffix: variant.suffix, warehouse_id: scanTargetId, quantity: Math.max(0, (variant.location_stock?.[scanTargetId] || 0) + changeAmount), size_info: scanSize || null }, { onConflict: 'product_sku, warehouse_id, variant_suffix' });
               await recordStockMovement(product.sku, changeAmount, `Ταχεία Κίνηση: ${whName}`, variant.suffix);
          } else {
              if (scanTargetId === SYSTEM_IDS.CENTRAL) { 
                  const map = product.stock_by_size ? { ...product.stock_by_size } : {}; if (scanSize) map[scanSize] = (map[scanSize] || 0) + changeAmount; 
                  await supabase.from('products').update({ stock_qty: (product.stock_qty || 0) + changeAmount, stock_by_size: map }).eq('sku', product.sku); 
              } else if (scanTargetId === SYSTEM_IDS.SHOWROOM) { 
                  const map = product.sample_stock_by_size ? { ...product.sample_stock_by_size } : {}; if (scanSize) map[scanSize] = (map[scanSize] || 0) + changeAmount; 
                  await supabase.from('products').update({ sample_qty: (product.sample_qty || 0) + changeAmount, sample_stock_by_size: map }).eq('sku', product.sku); 
              } else await supabase.from('product_stock').upsert({ product_sku: product.sku, warehouse_id: scanTargetId, quantity: Math.max(0, (product.location_stock?.[scanTargetId] || 0) + changeAmount), size_info: scanSize || null }, { onConflict: 'product_sku, warehouse_id, variant_suffix' });
              await recordStockMovement(product.sku, changeAmount, `Ταχεία Κίνηση: ${whName}`);
          }
          setRecentActions(prev => [{ id: Math.random().toString(36), sku: targetCode, amount: scanQty, target: whName, timestamp: new Date(), type: quickMode }, ...prev].slice(0, 5));
          queryClient.invalidateQueries({ queryKey: ['products'] }); showToast(`${quickMode === 'add' ? 'Προστέθηκαν' : 'Αφαιρέθηκαν'} ${scanQty} τεμ. στο ${targetCode}`, "success");
          setScanInput(''); setScanSuggestion(''); setScanSize(''); setScanQty(1); setAvailableSuffixes([]); inputRef.current?.focus();
      } catch (err) { showToast("Σφάλμα ενημέρωσης.", "error"); }
  };

  const getScanProductInfo = () => { 
      const t = scanSuggestion || scanInput; if (!t) return null;
      const match = findProductByScannedCode(t, products); 
      if(!match) return null;
      return { product: match.product, variant: match.variant, variantSuffix: match.variant?.suffix || '' }; 
  }

  const SkuVisualizer = () => {
    if (!scanSuggestion && !scanInput) return null;
    const textToRender = scanSuggestion || scanInput;
    const match = findProductByScannedCode(textToRender, products);
    const prod = match?.product;
    let masterPart = prod ? prod.sku : textToRender;
    let suffixPart = prod ? textToRender.substring(prod.sku.length) : '';
    const { finish, stone } = prod ? getVariantComponents(suffixPart, prod.gender) : { finish: { code: '' }, stone: { code: '' } };
    const finishColor = FINISH_COLORS[finish.code] || 'text-slate-400';
    const stoneColor = STONE_CATEGORIES[stone.code] || 'text-emerald-400';
    return (
        <div className="absolute inset-y-0 left-0 p-3.5 pointer-events-none font-mono text-xl tracking-wider flex items-center overflow-hidden z-20">
            {textToRender.split('').map((char, i) => {
                const isGhost = i >= scanInput.length;
                const isSuffix = prod && i >= prod.sku.length;
                let colorClass = 'text-slate-800';
                if (isSuffix) {
                    const sIdx = i - prod!.sku.length;
                    if (finish.code && suffixPart.startsWith(finish.code) && sIdx < finish.code.length) colorClass = finishColor;
                    else if (stone.code && suffixPart.endsWith(stone.code) && sIdx >= (suffixPart.length - stone.code.length)) colorClass = stoneColor;
                    else colorClass = 'text-slate-400';
                }
                return <span key={i} className={`${colorClass} ${isGhost ? 'opacity-30 italic font-medium' : 'font-black'}`}>{char}</span>;
            })}
        </div>
    );
  };

  const handleDeleteItem = async (item: InventoryItem) => {
      const isSpecificView = viewWarehouseId !== 'ALL';
      const warehouseName = warehouses?.find(w => w.id === viewWarehouseId)?.name;
      if (!await confirm({ title: isSpecificView ? 'Αφαίρεση από Αποθήκη' : 'Μηδενισμός Αποθέματος', message: isSpecificView ? `Μηδενισμός για το "${item.masterSku}${item.suffix ? '-'+item.suffix : ''}" στον χώρο "${warehouseName}";` : `Μηδενισμός σε ΟΛΕΣ τις αποθήκες για το ${item.masterSku}${item.suffix ? '-'+item.suffix : ''}.`, isDestructive: true, confirmText: 'Εκκαθάριση' })) return;
      try {
          const sku = item.masterSku; const suffix = item.suffix;
          const clearCustomStock = async (whId?: string) => { let q = supabase.from('product_stock').delete().eq('product_sku', sku); if (suffix) q = q.eq('variant_suffix', suffix); else q = q.is('variant_suffix', null); if (whId) q = q.eq('warehouse_id', whId); await q; };
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

  const handleSaveWarehouse = async () => { if (!warehouseForm.name) return; try { if (warehouseForm.id) { await api.updateWarehouse(warehouseForm.id, warehouseForm); showToast("Ο χώρος ενημερώθηκε.", "success"); } else { await api.saveWarehouse(warehouseForm); showToast("Ο χώρος δημιουργήθηκε.", "success"); } queryClient.invalidateQueries({ queryKey: ['warehouses'] }); setIsEditingWarehouse(false); } catch (err) { showToast("Σφάλμα αποθήκευσης.", "error"); } };
  const handleCreateWarehouse = () => { setWarehouseForm({ name: '', type: 'Store', address: '' }); setIsEditingWarehouse(true); }
  const handleEditWarehouse = (w: Warehouse) => { setWarehouseForm(w); setIsEditingWarehouse(true); }
  const handleDeleteWarehouse = async (id: string) => { if (id === SYSTEM_IDS.CENTRAL || id === SYSTEM_IDS.SHOWROOM) { showToast("Δεν μπορείτε να διαγράψετε συστημικούς χώρους.", "error"); return; } if (await confirm({ title: 'Διαγραφή Χώρου', message: 'Είστε σίγουροι ότι θέλετε να διαγράψετε αυτόν τον χώρο;', isDestructive: true, confirmText: 'Διαγραφή' })) { await api.deleteWarehouse(id); queryClient.invalidateQueries({ queryKey: ['warehouses'] }); } };

  const executeTransfer = async () => {
      if (!transferItem || sourceId === targetId) return; const currentSourceQty = transferItem.locationStock[sourceId] || 0;
      if (transferQty > currentSourceQty) { showToast("Ανεπαρκές απόθεμα.", "error"); return; }
      setIsTransferring(true);
      try {
          const variantSuffix = transferItem.suffix; const sku = transferItem.masterSku;
          const updateStock = async (whId: string, qty: number) => {
               if (whId === SYSTEM_IDS.CENTRAL) { if (variantSuffix) await supabase.from('product_variants').update({ stock_qty: qty }).match({ product_sku: sku, suffix: variantSuffix }); else await supabase.from('products').update({ stock_qty: qty }).eq('sku', sku); }
               else if (whId === SYSTEM_IDS.SHOWROOM && !variantSuffix) await supabase.from('products').update({ sample_qty: qty }).eq('sku', sku);
               else await supabase.from('product_stock').upsert({ product_sku: sku, variant_suffix: variantSuffix || null, warehouse_id: whId, quantity: qty }, { onConflict: 'product_sku, warehouse_id, variant_suffix' });
          };
          await updateStock(sourceId, currentSourceQty - transferQty); await updateStock(targetId, (transferItem.locationStock[targetId] || 0) + transferQty);
          await recordStockMovement(sku, transferQty, `Transfer: ${getWarehouseNameClean(warehouses!.find(w=>w.id===sourceId)!)} -> ${getWarehouseNameClean(warehouses!.find(w=>w.id===targetId)!)}`, variantSuffix);
          queryClient.invalidateQueries({ queryKey: ['products'] }); showToast("Η μεταφορά ολοκληρώθηκε.", "success"); setTransferModalOpen(false);
      } catch (e: any) { showToast(`Σφάλμα: ${e.message}`, "error"); } finally { setIsTransferring(false); }
  };

  const openTransfer = (item: InventoryItem) => { setTransferItem(item); setSourceId(SYSTEM_IDS.CENTRAL); setTargetId(SYSTEM_IDS.SHOWROOM); setTransferQty(1); setTransferModalOpen(true); }

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
              <div className="bg-white rounded-[2rem] border border-slate-200 shadow-xl shrink-0 flex flex-col lg:flex-row">
                  <div className="flex-1 p-8 bg-slate-50 border-r border-slate-100 flex flex-col gap-6 rounded-t-[2rem] lg:rounded-tr-none lg:rounded-l-[2rem]">
                      <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                              <div className="p-2.5 bg-[#060b00] text-white rounded-xl shadow-lg">
                                  <ScanBarcode size={22} className="animate-pulse" />
                              </div>
                              <h2 className="font-black text-slate-800 uppercase tracking-tighter text-lg">Έξυπνη Ταχεία Εισαγωγή</h2>
                          </div>
                          <div className="flex bg-slate-200 p-1 rounded-xl">
                                <button onClick={() => setQuickMode('add')} className={`px-4 py-2 rounded-lg text-xs font-black uppercase transition-all flex items-center gap-2 ${quickMode === 'add' ? 'bg-emerald-500 text-white shadow-md' : 'text-slate-500 hover:text-slate-700'}`}>
                                    <Plus size={14}/> Εισαγωγή
                                </button>
                                <button onClick={() => setQuickMode('subtract')} className={`px-4 py-2 rounded-lg text-xs font-black uppercase transition-all flex items-center gap-2 ${quickMode === 'subtract' ? 'bg-rose-500 text-white shadow-md' : 'text-slate-500 hover:text-slate-700'}`}>
                                    <Minus size={14}/> Αφαίρεση
                                </button>
                          </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-end">
                            <div className="md:col-span-3">
                                <label className="text-[10px] text-slate-400 font-black uppercase mb-1.5 ml-1 block tracking-widest">Χώρος Στόχος</label>
                                <select value={scanTargetId} onChange={(e) => setScanTargetId(e.target.value)} className="w-full bg-white text-slate-800 font-bold p-3.5 rounded-2xl border border-slate-200 focus:ring-4 focus:ring-emerald-500/10 outline-none cursor-pointer transition-all shadow-sm">
                                    {warehouses?.map(w => <option key={w.id} value={w.id}>{getWarehouseNameClean(w)}</option>)}
                                </select>
                            </div>
                            <div className="md:col-span-5 relative">
                                <label className="text-[10px] text-slate-400 font-black uppercase mb-1.5 ml-1 block tracking-widest">Κωδικός / SKU</label>
                                <div className="relative">
                                    <SkuVisualizer />
                                    <input 
                                        ref={inputRef} type="text" value={scanInput} onChange={handleScanInput} 
                                        onKeyDown={e => { if(e.key==='ArrowRight'&&scanSuggestion){e.preventDefault();setScanInput(scanSuggestion);} if(e.key==='Enter'){e.preventDefault();executeQuickAdd();} }} 
                                        placeholder="Σκανάρετε..." className="w-full p-3.5 bg-white text-transparent caret-slate-800 font-mono text-xl font-black rounded-2xl border border-slate-200 outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 uppercase tracking-widest transition-all shadow-sm relative z-10"
                                    />
                                    {availableSuffixes.length > 0 && (
                                        <div className="absolute top-full left-0 right-0 mt-2 flex flex-wrap gap-1.5 z-[100] p-3 bg-white rounded-2xl border border-slate-100 shadow-2xl max-h-48 overflow-y-auto custom-scrollbar ring-4 ring-black/5">
                                            <div className="w-full text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5 flex items-center gap-1"><Lightbulb size={10} className="text-amber-500"/> Προτάσεις Παραλλαγών</div>
                                            {availableSuffixes.map(s => {
                                                const info = getScanProductInfo(); const { finish, stone } = getVariantComponents(s.suffix, info?.product?.gender);
                                                return <button key={s.suffix} onClick={() => selectSuffix(s.suffix)} className="bg-slate-50 hover:bg-emerald-50 text-slate-600 px-2.5 py-1.5 rounded-xl text-[10px] font-black uppercase transition-all shadow-sm border border-slate-200 hover:border-emerald-200 flex items-center gap-1" title={s.desc}>
                                                    <span className={FINISH_COLORS[finish.code] || 'text-slate-400'}>{finish.code || 'LUSTRE'}</span>
                                                    {stone.code && <span className={STONE_CATEGORIES[stone.code] || 'text-emerald-400'}>{stone.code}</span>}
                                                </button>;
                                            })}
                                        </div>
                                    )}
                                </div>
                            </div>
                            {getScanProductInfo()?.product && isSizable(getScanProductInfo()!.product) && (
                                <div className="md:col-span-2 animate-in zoom-in-95">
                                    <label className="text-[10px] text-amber-600 font-black uppercase mb-1.5 ml-1 block tracking-widest">{getSizingInfo(getScanProductInfo()!.product)!.type}</label>
                                    <select value={scanSize} onChange={e => setScanSize(e.target.value)} className="w-full bg-amber-50 text-amber-700 font-black p-3.5 rounded-2xl border border-amber-200 focus:ring-4 focus:ring-amber-500/10 outline-none transition-all shadow-sm">
                                        <option value="">-</option>
                                        {getSizingInfo(getScanProductInfo()!.product)!.sizes.map(s => <option key={s} value={s}>{s}</option>)}
                                    </select>
                                </div>
                            )}
                            <div className="md:col-span-2 flex gap-3 h-full items-end">
                                <div className="w-20 shrink-0">
                                    <label className="text-[10px] text-slate-400 font-black uppercase mb-1.5 ml-1 block tracking-widest">Ποσ.</label>
                                    <input type="number" min="1" value={scanQty} onChange={e => setScanQty(parseInt(e.target.value)||1)} className="w-full p-3.5 text-center font-black text-xl rounded-2xl outline-none bg-white text-slate-900 border border-slate-200 focus:ring-4 focus:ring-emerald-500/10 shadow-sm"/>
                                </div>
                                <button onClick={executeQuickAdd} className={`flex-1 h-[54px] ${quickMode === 'add' ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-rose-500 hover:bg-rose-600'} text-white font-black rounded-2xl flex items-center justify-center transition-all shadow-lg hover:-translate-y-0.5 active:scale-95`}><Plus size={28}/></button>
                            </div>
                      </div>
                  </div>
                  <div className="w-full lg:w-96 p-8 bg-white flex flex-col rounded-b-[2rem] lg:rounded-bl-none lg:rounded-r-[2rem]">
                      {getScanProductInfo()?.product ? (
                          <div className="flex-1 animate-in slide-in-from-right duration-500">
                                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4">Προεπισκόπηση</h3>
                                <div className="flex items-start gap-4 mb-6">
                                    <div className="w-24 h-24 bg-slate-50 rounded-2xl overflow-hidden border border-slate-100 shrink-0 shadow-sm">{getScanProductInfo()!.product.image_url ? <img src={getScanProductInfo()!.product.image_url!} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-slate-300"><ImageIcon size={24}/></div>}</div>
                                    <div className="min-w-0">
                                        <h4 className="font-black text-slate-800 text-xl leading-none truncate">{getScanProductInfo()!.product.sku}{getScanProductInfo()!.variantSuffix}</h4>
                                        <p className="text-xs text-slate-400 font-bold mt-1.5 truncate">{getScanProductInfo()!.product.category}</p>
                                        <div className="flex flex-wrap gap-1.5 mt-3"><div className="px-2 py-1 bg-slate-100 text-slate-600 text-[9px] font-black rounded uppercase">ΣΤΟΚ: {getScanProductInfo()!.variant?.stock_qty ?? getScanProductInfo()!.product.stock_qty}</div>{getScanProductInfo()!.product.selling_price > 0 && <div className="px-2 py-1 bg-emerald-50 text-emerald-600 text-[9px] font-black rounded uppercase">{formatCurrency(getScanProductInfo()!.variant?.selling_price ?? getScanProductInfo()!.product.selling_price)}</div>}</div>
                                    </div>
                                </div>
                          </div>
                      ) : <div className="flex-1 flex flex-col items-center justify-center text-center opacity-30"><History size={40} className="text-slate-300 mb-2"/><p className="text-xs font-black text-slate-400 uppercase tracking-widest">Πρόσφατες Κινήσεις</p></div>}
                      <div className="mt-auto space-y-2">{recentActions.map(action => <div key={action.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100 animate-in slide-in-from-bottom-2"><div className="flex items-center gap-3"><div className={`w-8 h-8 rounded-lg flex items-center justify-center ${action.type === 'add' ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'}`}>{action.type === 'add' ? <ArrowUp size={14}/> : <ArrowDown size={14}/>}</div><div><div className="text-xs font-black text-slate-800">{action.sku}</div><div className="text-[9px] text-slate-400 font-bold uppercase truncate max-w-[120px]">{action.target}</div></div></div><div className="text-right"><div className={`text-sm font-black ${action.type === 'add' ? 'text-emerald-600' : 'text-rose-600'}`}>{action.type === 'add' ? '+' : '-'}{action.amount}</div><div className="text-[9px] text-slate-300 font-mono">{action.timestamp.toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit' })}</div></div></div>)}</div>
                  </div>
              </div>
              <div className="flex flex-col md:flex-row gap-4 shrink-0">
                 <div className="w-full md:w-64 relative"><Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} /><select value={viewWarehouseId} onChange={e => setViewWarehouseId(e.target.value)} className="w-full pl-10 p-3 bg-white border border-slate-200 rounded-xl outline-none appearance-none font-medium cursor-pointer"><option value="ALL">Όλες οι Αποθήκες</option>{warehouses?.map(w => <option key={w.id} value={w.id}>{getWarehouseNameClean(w)}</option>)}</select></div>
                 <div className="relative flex-1 flex gap-2"><div className="relative flex-1"><Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} /><input type="text" placeholder="Φίλτρο λίστας..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-12 pr-4 py-3 border border-slate-200 rounded-xl outline-none w-full bg-white shadow-sm"/></div><button onClick={() => setShowScanner(true)} className="bg-white px-5 rounded-xl border border-slate-200 text-slate-600 hover:text-slate-900 transition-all shadow-sm flex items-center gap-2 font-bold"><Camera size={20} /> Σάρωση</button></div>
              </div>
              <div ref={listParentRef} className="flex-1 overflow-y-auto custom-scrollbar pr-1 relative">{filteredInventory.length > 0 ? <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, width: '100%', position: 'relative' }}>{rowVirtualizer.getVirtualItems().map((virtualRow) => { const item = filteredInventory[virtualRow.index]; const displayPrice = item.variantRef?.selling_price ?? item.product.selling_price; return <div key={virtualRow.key} className="absolute top-0 left-0 w-full" style={{ height: `${virtualRow.size}px`, transform: `translateY(${virtualRow.start}px)`, padding: '4px 0' }}><div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all flex flex-col md:flex-row items-center gap-6 group relative overflow-hidden h-full"><div className={`absolute left-0 top-0 bottom-0 w-1 ${item.totalStock > 0 ? 'bg-emerald-500' : 'bg-slate-200'}`} /><div className="flex items-center gap-4 flex-1 w-full md:w-auto pl-2"><div className="w-16 h-16 bg-slate-50 rounded-xl overflow-hidden shrink-0 border border-slate-100">{item.imageUrl ? <img src={item.imageUrl} className="w-full h-full object-cover"/> : <div className="w-full h-full flex items-center justify-center text-slate-300"><ImageIcon size={24}/></div>}</div><div><h3 className="font-bold text-lg text-slate-800 cursor-pointer" onClick={() => setSelectedProduct(item.product)}>{item.isSingleVariantMode || !item.suffix ? item.masterSku : `${item.masterSku}-${item.suffix}`} {item.suffix && <span className="text-xs bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded border border-amber-100 ml-1">{item.description}</span>}</h3><div className="flex items-center gap-3 mt-0.5"><p className="text-xs text-slate-500">{item.category}</p>{displayPrice > 0 && <span className="text-xs font-bold text-slate-700 bg-slate-50 px-1.5 py-0.5 rounded">{formatCurrency(displayPrice)}</span>}</div></div></div><div className="flex-1 flex gap-2 overflow-x-auto w-full md:w-auto scrollbar-hide py-2 items-center">{Object.entries(item.locationStock).map(([whId, qty]) => { if (Number(qty) <= 0) return null; const wh = warehouses?.find(w => w.id === whId); return <div key={whId} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-bold whitespace-nowrap shadow-sm ${whId === SYSTEM_IDS.CENTRAL ? 'bg-slate-50 border-slate-200' : 'bg-blue-50 border-blue-100 text-blue-700'}`}><span className="text-[10px] uppercase opacity-70">{(wh ? getWarehouseNameClean(wh) : '???').substring(0, 15)}</span><span className="text-base">{qty}</span></div>; })}{item.totalStock === 0 && <span className="text-slate-400 text-sm italic">Εξαντλημένο</span>}</div><div className="flex items-center gap-2 w-full md:w-auto justify-end"><button onClick={() => openTransfer(item)} className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2.5 rounded-xl font-bold text-sm"><ArrowLeftRight size={16}/></button><button onClick={() => setSelectedProduct(item.product)} className="bg-[#060b00] text-white p-2.5 rounded-xl"><Edit2 size={16}/></button><button onClick={() => handleDeleteItem(item)} className="bg-red-50 text-red-600 p-2.5 rounded-xl"><Trash2 size={16}/></button></div></div></div>; })}</div> : <div className="text-center py-20 text-slate-400"><Package size={48} className="mx-auto mb-4 opacity-20"/><p className="font-medium">Δεν βρέθηκαν αποθέματα.</p></div>}</div>
          </div>
      )}

      {activeTab === 'warehouses' && (
           <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in slide-in-from-right duration-300">
               {warehouses?.map(wh => <div key={wh.id} className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100 relative group hover:-translate-y-1 transition-transform"><div className="flex justify-between items-start mb-6"><div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${wh.is_system ? 'bg-[#060b00]' : 'bg-blue-600'} text-white shadow-lg`}><Store size={28} /></div>{!wh.is_system && <div className="flex gap-2"><button onClick={() => handleEditWarehouse(wh)} className="p-2 text-slate-400 hover:text-slate-700"><Edit2 size={16}/></button><button onClick={() => handleDeleteWarehouse(wh.id)} className="p-2 text-slate-400 hover:text-red-500"><Trash2 size={16}/></button></div>}</div><h3 className="text-2xl font-black text-slate-800 tracking-tight">{getWarehouseNameClean(wh)}</h3></div>)}
               <button onClick={handleCreateWarehouse} className="border-2 border-dashed border-slate-200 rounded-3xl p-6 flex flex-col items-center justify-center text-slate-400 hover:bg-slate-50 min-h-[200px] group"><div className="w-16 h-16 rounded-full bg-slate-50 flex items-center justify-center mb-4"><Plus size={32}/></div><span className="font-bold">Νέος Χώρος</span></button>
           </div>
      )}

      {isEditingWarehouse && (
          <div className="fixed inset-0 z-[150] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl p-6 animate-in zoom-in-95 border border-slate-100">
                  <div className="flex justify-between items-center mb-6 pb-4 border-b border-slate-100"><h3 className="text-xl font-bold text-slate-800">{warehouseForm.id ? 'Επεξεργασία Χώρου' : 'Νέος Χώρος'}</h3><button onClick={() => setIsEditingWarehouse(false)} className="p-2 hover:bg-slate-100 rounded-full text-slate-500"><X size={20}/></button></div>
                  <div className="space-y-4"><div><label className="block text-xs font-bold text-slate-500 uppercase mb-1.5 tracking-wide">Όνομα Χώρου</label><input type="text" value={warehouseForm.name} onChange={e => setWarehouseForm({...warehouseForm, name: e.target.value})} className="w-full p-3 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20" placeholder="π.χ. Υποκατάστημα Α"/></div><div><label className="block text-xs font-bold text-slate-500 uppercase mb-1.5 tracking-wide">Τύπος</label><select value={warehouseForm.type} onChange={e => setWarehouseForm({...warehouseForm, type: e.target.value as any})} className="w-full p-3 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20"><option value="Store">Κατάστημα</option><option value="Showroom">Δειγματολόγιο</option><option value="Central">Αποθήκη</option><option value="Other">Άλλο</option></select></div><div><label className="block text-xs font-bold text-slate-500 uppercase mb-1.5 tracking-wide">Διεύθυνση</label><input type="text" value={warehouseForm.address} onChange={e => setWarehouseForm({...warehouseForm, address: e.target.value})} className="w-full p-3 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20"/></div><button onClick={handleSaveWarehouse} className="w-full bg-slate-900 text-white py-4 rounded-xl font-bold shadow-lg hover:bg-black transition-all mt-4">Αποθήκευση</button></div>
              </div>
          </div>
      )}

      {transferModalOpen && transferItem && (
          <div className="fixed inset-0 z-[150] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl p-8 animate-in zoom-in-95 border border-slate-100">
                  <div className="flex justify-between items-start mb-8"><div><h3 className="text-2xl font-black text-slate-800">Μεταφορά Αποθέματος</h3><p className="text-slate-500 font-mono text-sm mt-1">{transferItem.masterSku}{transferItem.suffix}</p></div><button onClick={() => setTransferModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-full"><X size={24}/></button></div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8"><div><label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Από</label><select value={sourceId} onChange={e => setSourceId(e.target.value)} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none">{warehouses?.map(w => <option key={w.id} value={w.id} disabled={(transferItem.locationStock[w.id] || 0) <= 0}>{getWarehouseNameClean(w)} ({transferItem.locationStock[w.id] || 0})</option>)}</select></div><div className="flex items-center justify-center pt-6"><div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-400"><ArrowRight size={20}/></div></div><div className="md:col-start-2"><label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Προς</label><select value={targetId} onChange={e => setTargetId(e.target.value)} className="w-full p-4 bg-blue-50 border border-blue-200 text-blue-900 rounded-2xl font-bold outline-none">{warehouses?.map(w => <option key={w.id} value={w.id} disabled={w.id === sourceId}>{getWarehouseNameClean(w)}</option>)}</select></div></div>
                  <div className="bg-slate-100 p-6 rounded-3xl border border-slate-200 text-center mb-8"><label className="text-sm font-bold text-slate-600 block mb-3">Ποσότητα Μεταφοράς</label><input type="number" min="1" max={transferItem.locationStock[sourceId] || 1} value={transferQty} onChange={e => setTransferQty(parseInt(e.target.value) || 1)} className="w-32 p-4 text-center font-black text-4xl bg-transparent border-b-4 border-slate-300 outline-none focus:border-blue-500"/></div>
                  <button onClick={executeTransfer} disabled={isTransferring || sourceId === targetId || transferQty > (transferItem.locationStock[sourceId] || 0)} className="w-full py-5 bg-[#060b00] text-white rounded-2xl font-bold text-lg shadow-xl shadow-slate-200 hover:bg-black transition-all flex items-center justify-center gap-3 disabled:opacity-50">{isTransferring ? <Loader2 className="animate-spin" size={24}/> : <ArrowLeftRight size={24}/>}{isTransferring ? 'Μεταφορά...' : 'Εκτέλεση Μεταφοράς'}</button>
              </div>
          </div>
      )}
      {selectedProduct && <ProductDetails product={selectedProduct} allProducts={products} allMaterials={[]} onClose={() => setSelectedProduct(null)} setPrintItems={setPrintItems} settings={settings} collections={collections} allMolds={molds} viewMode="warehouse" />}
      {showScanner && <BarcodeScanner onScan={handleGlobalScan} onClose={() => setShowScanner(false)} />}
    </div>
  );

  function handleGlobalScan(code: string) { const match = findProductByScannedCode(code, products); if (match) setSelectedProduct(match.product); else showToast(`Ο κωδικός ${code} δεν βρέθηκε.`, 'error'); }
}
