
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Product, ProductVariant, Warehouse, Order, OrderStatus, Mold } from '../types';
import { Search, Store, ArrowLeftRight, Package, X, Plus, Trash2, Edit2, ArrowRight, ShoppingBag, AlertTriangle, CheckCircle, Zap, ScanBarcode, ChevronDown, Printer, Filter, ImageIcon, Camera, Ruler } from 'lucide-react';
import ProductDetails from './ProductDetails';
import { useUI } from './UIProvider';
import { api, SYSTEM_IDS, recordStockMovement, supabase, deleteProduct } from '../lib/supabase';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import BarcodeScanner from './BarcodeScanner';
import { formatCurrency, formatDecimal } from '../utils/pricingEngine';
import { getSizingInfo, isSizable } from '../utils/sizing';

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
  const [scanSize, setScanSize] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const getWarehouseNameClean = (w: Warehouse) => {
      if (w.id === SYSTEM_IDS.CENTRAL) return 'Κεντρική Αποθήκη';
      if (w.id === SYSTEM_IDS.SHOWROOM || w.type === 'Showroom') return 'Δειγματολόγιο';
      return w.name;
  };

  const rawInventory = useMemo(() => {
      if (!products) return [];
      const items: InventoryItem[] = [];
      const demandMap: Record<string, number> = {};
      if (orders) {
          const pending = orders.filter(o => o.status === OrderStatus.Pending);
          pending.forEach(o => o.items.forEach(i => {
              const key = i.sku + (i.variant_suffix || '');
              demandMap[key] = (demandMap[key] || 0) + i.quantity;
          }));
      }
      products.forEach(p => {
          const variants = p.variants || [];
          if (variants.length === 0) {
              const totalStock = Object.values(p.location_stock || {}).reduce((a, b) => a + b, 0) + p.stock_qty + p.sample_qty;
              items.push({ id: p.sku, masterSku: p.sku, suffix: '', description: 'Βασικό', category: p.category, imageUrl: p.image_url, locationStock: { ...p.location_stock, [SYSTEM_IDS.CENTRAL]: p.stock_qty, [SYSTEM_IDS.SHOWROOM]: p.sample_qty }, totalStock, demandQty: demandMap[p.sku] || 0, product: p });
          } else {
              variants.forEach(v => {
                  const key = p.sku + v.suffix;
                  const vStock = { ...v.location_stock, [SYSTEM_IDS.CENTRAL]: v.stock_qty };
                  const total = Object.values(vStock).reduce((a, b) => a + b, 0);
                  items.push({ id: key, masterSku: p.sku, suffix: v.suffix, description: v.description, category: p.category, imageUrl: p.image_url, locationStock: vStock, totalStock: total, demandQty: demandMap[key] || 0, product: p, variantRef: v });
              });
          }
      });
      return items;
  }, [products, orders]);

  const filteredInventory = useMemo(() => rawInventory.filter(i => {
      if (viewWarehouseId !== 'ALL' && (i.locationStock[viewWarehouseId] || 0) <= 0) return false;
      const term = searchTerm.toUpperCase();
      return !term || i.masterSku.includes(term) || i.suffix.includes(term);
  }), [rawInventory, viewWarehouseId, searchTerm]);

  const executeQuickAdd = async () => {
      const targetCode = scanSuggestion || scanInput;
      const product = products.find(p => targetCode.startsWith(p.sku));
      if (!product) { showToast("Ο κωδικός δεν βρέθηκε.", "error"); return; }
      const suffix = targetCode.replace(product.sku, '');
      const variant = product.variants?.find(v => v.suffix === suffix);

      try {
          const whName = warehouses?.find(w => w.id === scanTargetId)?.name || 'Αποθήκη';
          if (variant) {
               const newQty = (variant.location_stock?.[scanTargetId] || 0) + scanQty;
               if (scanTargetId === SYSTEM_IDS.CENTRAL) {
                   const currentMap = variant.stock_by_size || {};
                   if (scanSize) currentMap[scanSize] = (currentMap[scanSize] || 0) + scanQty;
                   await supabase.from('product_variants').update({ stock_qty: (variant.stock_qty || 0) + scanQty, stock_by_size: currentMap }).match({ product_sku: product.sku, suffix: variant.suffix });
               } else {
                   await supabase.from('product_stock').upsert({ product_sku: product.sku, variant_suffix: variant.suffix, warehouse_id: scanTargetId, quantity: newQty, size_info: scanSize || null }, { onConflict: 'product_sku, warehouse_id, variant_suffix' });
               }
               await recordStockMovement(product.sku, scanQty, `Γρήγορη Προσθήκη: ${whName}`, variant.suffix);
          } else {
              const newQty = (product.location_stock?.[scanTargetId] || 0) + scanQty;
              if (scanTargetId === SYSTEM_IDS.CENTRAL) {
                  const currentMap = product.stock_by_size || {};
                  if (scanSize) currentMap[scanSize] = (currentMap[scanSize] || 0) + scanQty;
                  await supabase.from('products').update({ stock_qty: product.stock_qty + scanQty, stock_by_size: currentMap }).eq('sku', product.sku);
              } else {
                  await supabase.from('product_stock').upsert({ product_sku: product.sku, warehouse_id: scanTargetId, quantity: newQty, size_info: scanSize || null });
              }
              await recordStockMovement(product.sku, scanQty, `Γρήγορη Προσθήκη: ${whName}`);
          }
          queryClient.invalidateQueries({ queryKey: ['products'] });
          showToast(`Προστέθηκε απόθεμα στον κωδικό ${targetCode}`, "success");
          setScanInput(''); setScanSuggestion(''); setScanSize(''); setScanQty(1);
          inputRef.current?.focus();
      } catch (err) { showToast("Σφάλμα.", "error"); }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex flex-col md:flex-row justify-between gap-6">
         <div><h1 className="text-3xl font-bold text-[#060b00] flex items-center gap-3"><div className="p-2 bg-slate-800 text-white rounded-xl"><Store size={24} /></div> Κέντρο Αποθήκης</h1></div>
         <div className="flex bg-slate-100 p-1 rounded-xl">
            <button onClick={() => setActiveTab('stock')} className={`px-6 py-2.5 rounded-lg font-bold text-sm ${activeTab === 'stock' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}><Package size={16}/> Απόθεμα</button>
            <button onClick={() => setActiveTab('warehouses')} className={`px-6 py-2.5 rounded-lg font-bold text-sm ${activeTab === 'warehouses' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}><Store size={16}/> Χώροι</button>
         </div>
      </div>

      {activeTab === 'stock' && (
          <div className="space-y-6">
              <div className="bg-[#060b00] p-5 rounded-2xl flex flex-col lg:flex-row items-center gap-4">
                  <div className="flex items-center gap-2 text-white/80 font-bold shrink-0"><ScanBarcode size={24} className="text-amber-400" /><span className="uppercase text-sm">Γρήγορη Εισαγωγή</span></div>
                  <div className="flex-1 w-full grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                      <div className="md:col-span-3"><select value={scanTargetId} onChange={(e) => setScanTargetId(e.target.value)} className="w-full bg-slate-800 text-white font-bold p-3 rounded-xl border border-slate-700">{warehouses?.map(w => <option key={w.id} value={w.id}>{getWarehouseNameClean(w)}</option>)}</select></div>
                      <div className="md:col-span-5 relative">
                          <input ref={inputRef} type="text" value={scanInput} onChange={e => { setScanInput(e.target.value.toUpperCase()); setScanSuggestion(''); }} placeholder="π.χ. XR..." className="w-full p-3 bg-white text-slate-900 font-mono text-lg font-bold rounded-xl outline-none" />
                      </div>
                      <div className="md:col-span-4 flex gap-2">
                          <input type="number" min="1" value={scanQty} onChange={(e) => setScanQty(parseInt(e.target.value) || 1)} className="w-24 p-3 text-center font-bold rounded-xl bg-slate-800 text-white border border-slate-700"/>
                          <button onClick={executeQuickAdd} className="flex-1 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl flex items-center justify-center gap-2"><Plus size={20} /></button>
                      </div>
                  </div>
              </div>
              <div className="flex gap-4 mb-2">
                 <select value={viewWarehouseId} onChange={(e) => setViewWarehouseId(e.target.value)} className="w-64 p-3 bg-white border border-slate-200 rounded-xl"><option value="ALL">Όλες οι Αποθήκες</option>{warehouses?.map(w => <option key={w.id} value={w.id}>{getWarehouseNameClean(w)}</option>)}</select>
                 <div className="relative flex-1"><Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} /><input type="text" placeholder="Φίλτρο λίστας..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-12 pr-4 py-3 border border-slate-200 rounded-xl w-full" /></div>
              </div>
              <div className="grid grid-cols-1 gap-4">
                  {filteredInventory.slice(0, 50).map(item => (
                      <div key={item.id} className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-6 group">
                          <div className="flex items-center gap-4 flex-1">
                              <div className="w-16 h-16 bg-slate-50 rounded-xl overflow-hidden shrink-0 border border-slate-100">{item.imageUrl ? <img src={item.imageUrl} loading="lazy" className="w-full h-full object-cover"/> : <div className="w-full h-full flex items-center justify-center text-slate-300"><ImageIcon size={24} /></div>}</div>
                              <div><h3 className="font-bold text-lg text-slate-800 cursor-pointer" onClick={() => setSelectedProduct(item.product)}>{item.masterSku}{item.suffix && `-${item.suffix}`}</h3><p className="text-xs text-slate-500">{item.category}</p></div>
                          </div>
                          <div className="flex gap-2">
                               {Object.entries(item.locationStock).map(([whId, qty]) => Number(qty) > 0 && (
                                   <div key={whId} className="flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-bold bg-slate-50 text-slate-700">
                                       <span className="text-[10px] uppercase opacity-70">{(warehouses?.find(w=>w.id===whId)?.name || 'WH').substring(0, 5)}</span>
                                       <span>{Number(qty)}</span>
                                   </div>
                               ))}
                          </div>
                          <div className="flex gap-2"><button onClick={() => setSelectedProduct(item.product)} className="bg-[#060b00] text-white p-2.5 rounded-xl"><Edit2 size={16}/></button></div>
                      </div>
                  ))}
              </div>
          </div>
      )}
      {selectedProduct && <ProductDetails product={selectedProduct} allProducts={products} allMaterials={[]} onClose={() => setSelectedProduct(null)} setPrintItems={setPrintItems} settings={settings} collections={collections} allMolds={molds} viewMode="warehouse" />}
    </div>
  );
}
