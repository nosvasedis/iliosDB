import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Product, ProductVariant, Warehouse, Gender, PlatingType, MaterialType, RecipeItem } from '../../types';
import { X, MapPin, Weight, DollarSign, Globe, QrCode, Share2, Scan, ChevronLeft, ChevronRight, Maximize2, Tag, Image as ImageIcon, Copy, ArrowRightLeft, PlusCircle, Settings2, ArrowRight, Save, Hammer, Box, Flame, Gem, Coins, ChevronDown, ChevronUp, Palette, Info, Package, Download, Loader2, Sparkles, Layers, Ruler } from 'lucide-react';
import { formatCurrency, getVariantComponents, transliterateForBarcode } from '../../utils/pricingEngine';
import { SYSTEM_IDS, CLOUDFLARE_WORKER_URL, recordStockMovement, supabase, api, R2_PUBLIC_URL, AUTH_KEY_SECRET } from '../../lib/supabase';
import BarcodeView from '../BarcodeView';
import { useUI } from '../UIProvider';
import QRCode from 'qrcode';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { invalidateProductsAndCatalog } from '../../lib/queryInvalidation';
import html2canvas from 'html2canvas';
import { APP_ICON_ONLY } from '../../constants';
import SkuColorizedText from '../SkuColorizedText';
import SkuVariantBadges from '../SkuVariantBadges';
import { getSortedProductVariants } from '../../features/products';

interface Props {
  product: Product;
  onClose: () => void;
  warehouses: Warehouse[];
  setPrintItems?: (items: { product: Product; variant?: ProductVariant; quantity: number, size?: string, format?: 'standard' | 'simple' | 'retail' }[]) => void;
}

const GENDER_LABELS: Record<string, string> = {
    [Gender.Men]: 'Ανδρικό',
    [Gender.Women]: 'Γυναικείο',
    [Gender.Unisex]: 'Unisex'
};

const PLATING_LABELS: Record<string, string> = {
    [PlatingType.None]: 'Λουστρέ',
    [PlatingType.GoldPlated]: 'Επίχρυσο',
    [PlatingType.TwoTone]: 'Δίχρωμο',
    [PlatingType.Platinum]: 'Επιπλατινωμένο'
};

// Proxy helper to fetch images through Cloudflare and return Base64 for Canvas stability
const toBase64 = async (url: string): Promise<string | null> => {
    try {
        let fetchUrl = url;
        if (url.includes('r2.dev')) {
            const filename = url.split('/').pop();
            if (filename) {
                fetchUrl = `${CLOUDFLARE_WORKER_URL}/${filename}`;
            }
        }
        const response = await fetch(fetchUrl, { method: 'GET', mode: 'cors', cache: 'no-cache' });
        if (!response.ok) throw new Error('Network response failed');
        const blob = await response.blob();
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(blob);
        });
    } catch (e) {
        console.warn("Base64 conversion failed", e);
        return null; 
    }
};

export default function MobileProductDetails({ product, onClose, warehouses, setPrintItems }: Props) {
  const { showToast } = useUI();
  const queryClient = useQueryClient();
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareTab, setShareTab] = useState<'card' | 'qr'>('card');
  const [showFullImage, setShowFullImage] = useState(false);
  const [activeTab, setActiveTab] = useState<'info' | 'stock'>('info'); 
  
  const { data: materials } = useQuery({ queryKey: ['materials'], queryFn: api.getMaterials });
  const { data: allProducts } = useQuery({ queryKey: ['products'], queryFn: api.getProducts });
  const { data: molds } = useQuery({ queryKey: ['molds'], queryFn: api.getMolds });

  const [transferModal, setTransferModal] = useState<{ sourceId: string; targetId: string; qty: number } | null>(null);
  const [adjustModal, setAdjustModal] = useState<{ warehouseId: string; type: 'add' | 'set' | 'remove'; qty: number } | null>(null);
  
  const cardRef = useRef<HTMLDivElement>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [cardImageBase64, setCardImageBase64] = useState<string | null>(null);
  const [logoBase64, setLogoBase64] = useState<string | null>(null);

  const variants = product.variants || [];
  const [variantIndex, setVariantIndex] = useState(0);
  const [variantMenuOpen, setVariantMenuOpen] = useState(false);
  const variantMenuRef = useRef<HTMLDivElement>(null);

  const sortedVariants = useMemo(
      () => (variants.length > 0 ? getSortedProductVariants(product, variants) : []),
      [product, variants]
  );

  useEffect(() => {
      setVariantIndex(0);
      setVariantMenuOpen(false);
  }, [product.sku]);

  useEffect(() => {
      if (!variantMenuOpen) return;
      const onDown = (e: MouseEvent) => {
          if (variantMenuRef.current && !variantMenuRef.current.contains(e.target as Node)) {
              setVariantMenuOpen(false);
          }
      };
      document.addEventListener('mousedown', onDown);
      return () => document.removeEventListener('mousedown', onDown);
  }, [variantMenuOpen]);

  const activeVariant = sortedVariants.length > 0
      ? sortedVariants[Math.min(variantIndex, sortedVariants.length - 1)]
      : null;

  useEffect(() => {
      const sku = `${product.sku}${activeVariant?.suffix || ''}`;
      const safeSku = transliterateForBarcode(sku);
      QRCode.toDataURL(safeSku, { margin: 1, width: 200, color: { dark: '#060b00', light: '#ffffff' } })
          .then(url => setQrDataUrl(url))
          .catch(err => console.error(err));
  }, [product.sku, activeVariant]);

  useEffect(() => {
      if (showShareModal) {
          if (product.image_url) {
              setCardImageBase64(null); 
              toBase64(product.image_url).then(base64 => { if (base64) setCardImageBase64(base64); });
          }
          if (APP_ICON_ONLY) {
              toBase64(APP_ICON_ONLY).then(base64 => { if (base64) setLogoBase64(base64); });
          }
      }
  }, [showShareModal, product.image_url]);

  const nVar = sortedVariants.length;
  const nextVariant = (e?: React.MouseEvent) => {
      e?.stopPropagation();
      if (nVar > 0) setVariantIndex((prev) => (prev + 1) % nVar);
  };
  const prevVariant = (e?: React.MouseEvent) => {
      e?.stopPropagation();
      if (nVar > 0) setVariantIndex((prev) => (prev - 1 + nVar) % nVar);
  };
  
  const displayGender = GENDER_LABELS[product.gender] || product.gender;
  const displayPrice = activeVariant ? (activeVariant.selling_price || 0) : (product.selling_price || 0);
  const displayLabel = activeVariant ? (activeVariant.description || '') : product.category;
  const displaySku = `${product.sku}${activeVariant?.suffix || ''}`;

  const variantDetails = useMemo(() => getVariantComponents(activeVariant?.suffix || '', product.gender), [activeVariant, product.gender]);
  const displayPlating = variantDetails.finish.name || PLATING_LABELS[product.plating_type] || product.plating_type;
  const displayStone = variantDetails.stone.name;

  // Clean description for QR section: Removes the plating name if it's redundant
  const qrDescription = useMemo(() => {
      if (variantDetails.stone.name) return variantDetails.stone.name;
      
      if (activeVariant) {
          let d = activeVariant.description || '';
          // Remove plating name from start if present (case insensitive)
          const finishRegex = new RegExp(`^${displayPlating}`, 'i');
          d = d.replace(finishRegex, '').trim();
          // Remove leading hyphens/spaces
          d = d.replace(/^[-\s]+/, '');
          
          if (d) return d;
      }
      return product.category;
  }, [variantDetails, activeVariant, displayPlating, product.category]);

  const activeTechData = useMemo(() => {
      const suffix = activeVariant?.suffix || '';
      const { finish } = getVariantComponents(suffix, product.gender);
      const isGoldOrPlat = ['X', 'H'].includes(finish.code) || (!suffix && (product.plating_type === PlatingType.GoldPlated || product.plating_type === PlatingType.Platinum));
      const isTwoTone = finish.code === 'D' || (!suffix && product.plating_type === PlatingType.TwoTone);
      return {
          technician: product.labor.technician_cost,
          setter: product.labor.setter_cost,
          casting: product.labor.casting_cost,
          plating: isGoldOrPlat ? product.labor.plating_cost_x : (isTwoTone ? product.labor.plating_cost_d : 0)
      };
  }, [product, activeVariant]);

  const handleShare = async () => {
      if (!cardRef.current && shareTab === 'card') return;
      setIsGenerating(true);
      try {
          let blob: Blob | null = null;
          if (shareTab === 'card' && cardRef.current) {
              await new Promise(r => setTimeout(r, 400)); 
              const canvas = await html2canvas(cardRef.current, {
                  scale: 3, 
                  useCORS: true, 
                  backgroundColor: '#ffffff',
                  logging: false,
                  allowTaint: true
              });
              blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.98));
          } else if (shareTab === 'qr' && qrDataUrl) {
              const res = await fetch(qrDataUrl);
              blob = await res.blob();
          }

          if (!blob) throw new Error("Generation failed");
          const file = new File([blob], `${displaySku}.jpg`, { type: 'image/jpeg' });

          if (navigator.canShare && navigator.canShare({ files: [file] })) {
              await navigator.share({
                  files: [file],
                  title: displaySku,
                  text: shareTab === 'card' ? `${displaySku} - ${displayLabel}` : undefined
              });
          } else {
              const url = URL.createObjectURL(blob);
              const link = document.createElement('a');
              link.href = url;
              link.download = `${displaySku}.jpg`;
              link.click();
              URL.revokeObjectURL(url);
              showToast("Αποθηκεύτηκε στη συσκευή.", "success");
          }
      } catch (err: any) {
          showToast("Σφάλμα κοινοποίησης.", "error");
      } finally {
          setIsGenerating(false);
      }
  };

  // ... (Adjust/Transfer Handlers remain the same)
  const handleAdjustStock = async () => {
      if (!adjustModal) return;
      const { warehouseId, type, qty } = adjustModal;
      const finalQty = type === 'remove' ? -qty : qty;
      const whName = warehouses.find(w => w.id === warehouseId)?.name || 'Unknown';
      try {
          const isCentral = warehouseId === SYSTEM_IDS.CENTRAL;
          const isShowroom = warehouseId === SYSTEM_IDS.SHOWROOM;
          if (activeVariant) {
              if (isCentral) await supabase.from('product_variants').update({ stock_qty: type === 'set' ? qty : Math.max(0, (activeVariant.stock_qty || 0) + finalQty) }).match({ product_sku: product.sku, suffix: activeVariant.suffix });
              else await supabase.from('product_stock').upsert({ product_sku: product.sku, variant_suffix: activeVariant.suffix, warehouse_id: warehouseId, quantity: type === 'set' ? qty : Math.max(0, (activeVariant.location_stock?.[warehouseId] || 0) + finalQty) }, { onConflict: 'product_sku, warehouse_id, variant_suffix' });
          } else {
              if (isCentral) await supabase.from('products').update({ stock_qty: type === 'set' ? qty : Math.max(0, (product.stock_qty || 0) + finalQty) }).eq('sku', product.sku);
              else if (isShowroom) await supabase.from('products').update({ sample_qty: type === 'set' ? qty : Math.max(0, (product.sample_qty || 0) + finalQty) }).eq('sku', product.sku);
              else await supabase.from('product_stock').upsert({ product_sku: product.sku, variant_suffix: null, warehouse_id: warehouseId, quantity: type === 'set' ? qty : Math.max(0, (product.location_stock?.[warehouseId] || 0) + finalQty) }, { onConflict: 'product_sku, warehouse_id, variant_suffix' });
          }
          await recordStockMovement(product.sku, type === 'set' ? 0 : finalQty, type === 'set' ? `Stock Set: ${whName}` : `Manual Adj: ${whName}`, activeVariant?.suffix || undefined);
          invalidateProductsAndCatalog(queryClient);
          showToast("Ενημερώθηκε.", "success"); setAdjustModal(null);
      } catch (e) { showToast("Σφάλμα.", "error"); }
  };

  const handleTransferStock = async () => {
      if (!transferModal) return;
      const { sourceId, targetId, qty } = transferModal;
      if (sourceId === targetId) return;
      try {
          const sku = product.sku; const suffix = activeVariant?.suffix || null;
          const update = async (whId: string, delta: number) => {
               if (activeVariant) {
                   if (whId === SYSTEM_IDS.CENTRAL) await supabase.from('product_variants').update({ stock_qty: Math.max(0, activeVariant.stock_qty + delta) }).match({ product_sku: sku, suffix: suffix });
                   else await supabase.from('product_stock').upsert({ product_sku: sku, variant_suffix: suffix, warehouse_id: whId, quantity: Math.max(0, (activeVariant.location_stock?.[whId] || 0) + delta) }, { onConflict: 'product_sku, warehouse_id, variant_suffix' });
               } else {
                   if (whId === SYSTEM_IDS.CENTRAL) await supabase.from('products').update({ stock_qty: Math.max(0, product.stock_qty + delta) }).eq('sku', sku);
                   else if (whId === SYSTEM_IDS.SHOWROOM) await supabase.from('products').update({ sample_qty: Math.max(0, product.sample_qty + delta) }).eq('sku', sku);
                   else await supabase.from('product_stock').upsert({ product_sku: sku, variant_suffix: null, warehouse_id: whId, quantity: Math.max(0, (product.location_stock?.[whId] || 0) + delta) }, { onConflict: 'product_sku, warehouse_id, variant_suffix' });
               }
          };
          await update(sourceId, -qty); await update(targetId, qty);
          await recordStockMovement(sku, qty, `Transfer: ${warehouses.find(w=>w.id===sourceId)?.name} -> ${warehouses.find(w=>w.id===targetId)?.name}`, suffix || undefined);
          invalidateProductsAndCatalog(queryClient); showToast("Ολοκληρώθηκε.", "success"); setTransferModal(null);
      } catch (e) { showToast("Σφάλμα.", "error"); }
  };

  const renderStockRow = (whId: string, qty: number, isSystem: boolean, label: string) => (
      <div key={whId} className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between">
          <div className="flex items-center gap-3">
              <div className={`p-2 rounded-xl ${isSystem ? (label.includes('Κεντρική') ? 'bg-slate-100 text-slate-600' : 'bg-purple-50 text-purple-600') : 'bg-blue-50 text-blue-600'}`}>
                  <MapPin size={18}/>
              </div>
              <div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase">{label}</div>
                  <div className="text-xl font-black text-slate-800">{qty}</div>
              </div>
          </div>
          <div className="flex gap-2">
              <button onClick={() => setAdjustModal({ warehouseId: whId, type: 'add', qty: 1 })} className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl border border-emerald-100 active:scale-95 transition-transform"><PlusCircle size={20}/></button>
              <button onClick={() => setTransferModal({ sourceId: whId, targetId: warehouses.find(w => w.id !== whId)?.id || '', qty: 1 })} className="p-2.5 bg-blue-50 text-blue-600 rounded-xl border border-blue-100 active:scale-95 transition-transform" disabled={qty <= 0}><ArrowRightLeft size={20}/></button>
              <button onClick={() => setAdjustModal({ warehouseId: whId, type: 'set', qty: qty })} className="p-2.5 bg-slate-50 text-slate-600 rounded-xl border border-slate-200 active:scale-95 transition-transform"><Settings2 size={20}/></button>
          </div>
      </div>
  );

  return (
    <div className="fixed inset-0 z-[100] bg-slate-50 flex flex-col animate-in slide-in-from-bottom-full duration-300 overflow-hidden">
      <div className="relative h-72 bg-slate-200 shrink-0 group">
        {product.image_url ? (
            <img src={product.image_url} className="w-full h-full object-cover cursor-pointer" alt={product.sku} onClick={() => setShowFullImage(true)}/>
        ) : (
            <div className="w-full h-full flex items-center justify-center text-slate-400 font-bold bg-slate-100"><ImageIcon size={48} className="opacity-20"/></div>
        )}
        <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-start bg-gradient-to-b from-black/40 to-transparent">
            <button onClick={onClose} className="p-2 bg-white/20 backdrop-blur-md rounded-full text-white hover:bg-white/30 transition-colors shadow-lg active:scale-95"><X size={20}/></button>
            <div className="flex gap-2">
                <button onClick={() => { setShowShareModal(true); setShareTab('card'); }} className="p-2 bg-white text-slate-900 rounded-full hover:bg-slate-100 transition-colors shadow-lg active:scale-95"><Share2 size={20}/></button>
            </div>
        </div>
        <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-slate-900/90 via-slate-900/50 to-transparent pt-12">
            <div className="flex justify-between items-end">
                <div>
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="bg-white/20 backdrop-blur-md text-white text-[10px] font-bold px-2 py-0.5 rounded border border-white/10 uppercase tracking-wide">{product.category}</span>
                        <span className="bg-white/20 backdrop-blur-md text-white text-[10px] font-bold px-2 py-0.5 rounded border border-white/10 uppercase tracking-wide">{displayGender}</span>
                    </div>
                    <div className="text-3xl font-black tracking-tight leading-none drop-shadow-[0_2px_8px_rgba(0,0,0,0.45)]">
                        <SkuColorizedText
                            sku={product.sku}
                            suffix={activeVariant?.suffix ?? ''}
                            gender={product.gender}
                            masterClassName="text-white font-black"
                            className="font-black"
                        />
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                        {activeVariant ? (
                            <div className="[&_span]:border-white/35 [&_span]:bg-white/12 [&_span]:text-white [&_span]:backdrop-blur-sm">
                                <SkuVariantBadges suffix={activeVariant.suffix} gender={product.gender} product={product} compact />
                            </div>
                        ) : null}
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-white/80 text-xs font-bold">
                        <span className="flex items-center gap-1"><Palette size={10}/> {displayPlating}</span>
                        {displayStone ? <><span>•</span><span className="flex items-center gap-1"><Gem size={10}/> {displayStone}</span></> : null}
                        <span>•</span><span>{product.weight_g}g</span>
                    </div>
                </div>
            </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-6 bg-slate-50 pb-20">
          <div className="bg-white p-3 rounded-2xl border border-slate-100 shadow-sm">
              <div className="mb-4 space-y-3">
                  {nVar > 0 ? (
                      <div className="flex items-stretch gap-2 w-full">
                          <button type="button" onClick={prevVariant} className="shrink-0 self-center p-2.5 bg-slate-100 rounded-xl text-slate-500 active:bg-slate-200" aria-label="Προηγούμενη παραλλαγή"><ChevronLeft size={20}/></button>
                          <div ref={variantMenuRef} className="relative min-w-0 flex-1">
                              <button
                                  type="button"
                                  onClick={() => setVariantMenuOpen((o) => !o)}
                                  className="flex w-full flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-3 text-left shadow-sm transition-colors active:bg-slate-100"
                              >
                                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Παραλλαγή</div>
                                  <SkuColorizedText
                                      sku={product.sku}
                                      suffix={activeVariant?.suffix ?? ''}
                                      gender={product.gender}
                                      className="text-lg font-black"
                                      masterClassName="text-slate-900"
                                  />
                                  <SkuVariantBadges suffix={activeVariant?.suffix ?? ''} gender={product.gender} product={product} compact />
                                  <div className="text-xs font-bold text-slate-600 leading-snug line-clamp-2">
                                      {activeVariant?.description || 'Βασικό'}
                                  </div>
                                  <div className="flex items-center justify-between text-[10px] font-bold text-slate-400">
                                      <span>{variantIndex + 1} / {nVar}</span>
                                      <ChevronDown size={16} className={`text-slate-400 transition-transform ${variantMenuOpen ? 'rotate-180' : ''}`} />
                                  </div>
                              </button>
                              {variantMenuOpen && (
                                  <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-xl">
                                      {sortedVariants.map((v, i) => {
                                          const sel = i === variantIndex;
                                          return (
                                              <button
                                                  key={v.suffix || `v-${i}`}
                                                  type="button"
                                                  onClick={() => { setVariantIndex(i); setVariantMenuOpen(false); }}
                                                  className={`flex w-full flex-col gap-1 px-3 py-2.5 text-left transition-colors ${sel ? 'bg-emerald-50 ring-1 ring-inset ring-emerald-200/60' : 'hover:bg-slate-50'}`}
                                              >
                                                  <SkuColorizedText
                                                      sku={product.sku}
                                                      suffix={v.suffix}
                                                      gender={product.gender}
                                                      className="text-sm font-black"
                                                      masterClassName={sel ? 'text-emerald-950' : 'text-slate-900'}
                                                  />
                                                  <SkuVariantBadges suffix={v.suffix} gender={product.gender} product={product} compact />
                                                  <span className={`text-[11px] font-semibold leading-tight ${sel ? 'text-emerald-800' : 'text-slate-500'}`}>
                                                      {v.description || v.suffix || 'Βασικό'}
                                                  </span>
                                              </button>
                                          );
                                      })}
                                  </div>
                              )}
                          </div>
                          <button type="button" onClick={nextVariant} className="shrink-0 self-center p-2.5 bg-slate-100 rounded-xl text-slate-500 active:bg-slate-200" aria-label="Επόμενη παραλλαγή"><ChevronRight size={20}/></button>
                      </div>
                  ) : (
                      <div className="text-center w-full py-2"><div className="text-[10px] font-bold text-slate-400 uppercase">ΕΚΔΟΣΗ</div><div className="font-black text-slate-800 text-xl">MASTER</div></div>
                  )}
              </div>
              <div className="grid grid-cols-2 gap-3 border-t border-slate-50 pt-3">
                  <div className="text-center">
                      <div className="text-[10px] font-bold text-slate-400 uppercase"><DollarSign size={10} className="inline"/> Τιμή</div>
                      <div className="font-black text-slate-900 text-lg">{displayPrice > 0 ? formatCurrency(displayPrice) : '-'}</div>
                  </div>
                  <div className="text-center border-l border-slate-50">
                      <div className="text-[10px] font-bold text-slate-400 uppercase"><Weight size={10} className="inline"/> Βάρος</div>
                      <div className="font-black text-slate-900 text-lg">{product.weight_g}g</div>
                  </div>
              </div>
          </div>

          <div className="flex p-1 bg-slate-100 rounded-xl mb-2">
                <button onClick={() => setActiveTab('info')} className={`flex-1 py-2.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 ${activeTab === 'info' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}><Info size={14}/> Στοιχεία</button>
                <button onClick={() => setActiveTab('stock')} className={`flex-1 py-2.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 ${activeTab === 'stock' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}><Package size={14}/> Απόθεμα</button>
          </div>

          {activeTab === 'stock' && (
              <div className="space-y-3 animate-in fade-in slide-in-from-right-2">
                  <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest ml-2 flex items-center gap-2"><MapPin size={12}/> Διαχείριση Αποθέματος</h3>
                  {renderStockRow(SYSTEM_IDS.CENTRAL, activeVariant ? activeVariant.stock_qty : product.stock_qty, true, 'Κεντρική Αποθήκη')}
                  {renderStockRow(SYSTEM_IDS.SHOWROOM, activeVariant ? (activeVariant.location_stock?.[SYSTEM_IDS.SHOWROOM] || 0) : product.sample_qty, true, 'Δειγματολόγιο')}
                  {warehouses.filter(w => !w.is_system).map(w => renderStockRow(w.id, activeVariant ? (activeVariant.location_stock?.[w.id] || 0) : (product.location_stock?.[w.id] || 0), false, w.name))}
              </div>
          )}

          {activeTab === 'info' && (
              <div className="space-y-3 animate-in fade-in slide-in-from-left-2">
                  <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm space-y-4">
                      <div>
                          <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1"><Box size={12}/> Συνταγή / Υλικά</h4>
                          {product.recipe.length > 0 ? (
                              <div className="space-y-1">
                                  {product.recipe.map((r, idx) => {
                                      const name = r.type === 'raw' ? materials?.find(m => m.id === r.id)?.name : allProducts?.find(p => p.sku === r.sku)?.category || r.sku;
                                      return (
                                          <div key={idx} className="flex justify-between items-center text-sm p-2 bg-slate-50 rounded-lg"><span className="font-bold text-slate-700">{name}</span><span className="font-mono font-bold text-slate-500">x{r.quantity}</span></div>
                                      );
                                  })}
                              </div>
                          ) : <div className="text-center text-xs text-slate-400 italic">Χωρίς υλικά.</div>}
                      </div>
                      <div>
                          <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1"><MapPin size={12}/> Λάστιχα</h4>
                          {product.molds.length > 0 ? (
                              <div className="space-y-1">
                                  {product.molds.map((m, idx) => {
                                      const moldInfo = molds?.find(md => md.code === m.code);
                                      const moldDescription = moldInfo?.description || '';
                                      return (
                                          <div key={idx} className="flex justify-between items-center text-sm p-2 bg-amber-50 rounded-lg border border-amber-100">
                                              <div className="flex items-center gap-2 min-w-0">
                                                  <span className="font-black text-amber-800 font-mono">{m.code}</span>
                                                  {moldDescription ? (
                                                      <span
                                                          className="text-[10px] text-slate-600 font-bold truncate max-w-[120px]"
                                                          title={moldDescription}
                                                      >
                                                          {moldDescription}
                                                      </span>
                                                  ) : null}
                                                  <span className="text-xs text-slate-500 font-bold shrink-0">x{m.quantity}</span>
                                              </div>
                                              <span className="text-[10px] text-amber-600 font-bold uppercase">{moldInfo?.location ?? ''}</span>
                                          </div>
                                      );
                                  })}
                              </div>
                          ) : <div className="text-center text-xs text-slate-400 italic">Χωρίς λάστιχα.</div>}
                      </div>
                      <div>
                          <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1"><Coins size={12}/> Εργατικά (Εκτίμηση)</h4>
                          <div className="grid grid-cols-2 gap-2 text-xs">
                              <div className="bg-slate-50 p-2 rounded-lg flex justify-between"><span className="text-slate-500">Τεχνίτης</span><span className="font-bold text-slate-700">{activeTechData.technician}€</span></div>
                              <div className="bg-slate-50 p-2 rounded-lg flex justify-between"><span className="text-slate-500">Καρφωτής</span><span className="font-bold text-slate-700">{activeTechData.setter}€</span></div>
                              <div className="bg-slate-50 p-2 rounded-lg flex justify-between"><span className="text-slate-500">Χύτευση</span><span className="font-bold text-slate-700">{activeTechData.casting}€</span></div>
                              <div className="bg-slate-50 p-2 rounded-lg flex justify-between"><span className="text-slate-500">Επιμ.</span><span className={`font-bold ${activeTechData.plating > 0 ? 'text-amber-600' : 'text-slate-400'}`}>{activeTechData.plating > 0 ? `${activeTechData.plating}€` : '-'}</span></div>
                          </div>
                      </div>
                  </div>
              </div>
          )}
          <div className="h-12"></div>
      </div>

      {showFullImage && product.image_url && (
          <div className="fixed inset-0 z-[120] bg-black flex items-center justify-center p-0 animate-in fade-in duration-200" onClick={() => setShowFullImage(false)}>
              <img src={product.image_url} className="max-w-full max-h-full object-contain" alt="Full" />
              <button className="absolute top-4 right-4 text-white p-2 bg-white/20 rounded-full"><X size={24}/></button>
          </div>
      )}

      {showShareModal && (
          <div className="fixed inset-0 z-[110] bg-[#060b00]/95 backdrop-blur-xl flex flex-col items-center justify-center p-4 animate-in fade-in duration-200">
              <div className="bg-slate-100 w-full max-w-sm rounded-[32px] overflow-hidden shadow-2xl relative border border-white/10">
                  <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-white">
                      <div className="flex gap-2 p-1 bg-slate-100 rounded-xl">
                          <button onClick={() => setShareTab('card')} className={`px-4 py-2 rounded-lg text-xs font-black transition-all ${shareTab === 'card' ? 'bg-white shadow-sm text-[#060b00]' : 'text-slate-500'}`}>Κάρτα</button>
                          <button onClick={() => setShareTab('qr')} className={`px-4 py-2 rounded-lg text-xs font-black transition-all ${shareTab === 'qr' ? 'bg-white shadow-sm text-[#060b00]' : 'text-slate-500'}`}>QR</button>
                      </div>
                      <button onClick={() => setShowShareModal(false)} className="p-2 text-slate-400 hover:text-slate-600"><X size={20}/></button>
                  </div>

                  <div className="p-6 flex flex-col items-center justify-center bg-slate-50 min-h-[480px]">
                      {shareTab === 'card' ? (
                          <div
                            ref={cardRef}
                            className="relative w-[320px] shrink-0 rounded-[28px] bg-gradient-to-br from-amber-200/90 via-emerald-100/80 to-slate-200/90 p-[3px] shadow-[0_24px_60px_-12px_rgba(6,11,0,0.35)] font-sans"
                          >
                              <div className="flex flex-col overflow-hidden rounded-[25px] bg-white">
                                  <div className="relative flex items-start justify-between gap-3 border-b border-slate-100/90 bg-gradient-to-r from-white via-emerald-50/30 to-amber-50/25 px-4 pt-4 pb-3">
                                      <Sparkles className="pointer-events-none absolute -right-1 -top-1 h-14 w-14 text-amber-300/35" aria-hidden />
                                      <div className="relative flex min-w-0 flex-1 items-center gap-2.5">
                                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#060b00] shadow-md shadow-emerald-900/10">
                                              {logoBase64 ? (
                                                  <img src={logoBase64} className="h-6 w-6 object-contain" alt="" />
                                              ) : (
                                                  <Gem className="h-4 w-4 text-emerald-300" aria-hidden />
                                              )}
                                          </div>
                                          <div className="min-w-0">
                                              <p className="truncate text-[11px] font-black tracking-tight text-[#060b00]">Ilios Kosmima</p>
                                              <p className="text-[7px] font-bold uppercase tracking-[0.2em] text-amber-700/90">Χειροποίητο · Παραγωγή</p>
                                          </div>
                                      </div>
                                      <div className="relative flex shrink-0 flex-col items-end gap-1 text-right">
                                          {displayPrice > 0 ? (
                                              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Λιανική</p>
                                          ) : null}
                                          {displayPrice > 0 ? (
                                              <p className="text-lg font-black leading-none text-[#060b00]">{formatCurrency(displayPrice)}</p>
                                          ) : (
                                              <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[8px] font-black uppercase tracking-wide text-slate-500">
                                                  Κατάλογος
                                              </span>
                                          )}
                                      </div>
                                  </div>

                                  <div className="relative px-3 pt-3">
                                      <div className="pointer-events-none absolute inset-x-3 top-3 h-[min(200px,42vw)] rounded-2xl bg-gradient-to-b from-slate-100/90 to-white" aria-hidden />
                                      <div className="relative flex min-h-[168px] items-center justify-center px-2 pb-1">
                                          {cardImageBase64 ? (
                                              <img src={cardImageBase64} className="max-h-[200px] w-full object-contain drop-shadow-[0_12px_24px_rgba(15,23,42,0.12)]" alt="" />
                                          ) : product.image_url ? (
                                              <img src={product.image_url} className="max-h-[200px] w-full object-contain" crossOrigin="anonymous" alt="" />
                                          ) : (
                                              <ImageIcon className="h-12 w-12 text-slate-200" aria-hidden />
                                          )}
                                      </div>
                                  </div>

                                  <div className="space-y-3 px-4 pb-4 pt-1">
                                      <div className="rounded-2xl border border-slate-200/80 bg-gradient-to-br from-slate-50 to-white p-3 shadow-sm">
                                          <p className="mb-1 text-[8px] font-black uppercase tracking-[0.18em] text-slate-400">Πλήρης κωδικός</p>
                                          <SkuColorizedText
                                              sku={product.sku}
                                              suffix={activeVariant?.suffix ?? ''}
                                              gender={product.gender}
                                              className="text-[22px] font-black leading-tight"
                                              masterClassName="text-slate-900"
                                          />
                                          <div className="mt-2.5 flex flex-wrap items-center gap-2">
                                              <SkuVariantBadges
                                                  suffix={activeVariant?.suffix ?? ''}
                                                  gender={product.gender}
                                                  product={product}
                                                  compact
                                              />
                                              <span className="inline-flex items-center rounded-full border border-emerald-200/80 bg-emerald-50 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-emerald-900">
                                                  {displayGender}
                                              </span>
                                          </div>
                                          <p className="mt-2 line-clamp-2 text-[10px] font-bold capitalize leading-snug text-slate-600">{product.category}</p>
                                          {displayLabel ? (
                                              <p className="mt-1 line-clamp-2 text-[10px] font-semibold text-slate-500">{displayLabel}</p>
                                          ) : null}
                                      </div>

                                      <div className="grid grid-cols-2 gap-2">
                                          <div className="rounded-xl border border-amber-100/80 bg-gradient-to-br from-amber-50/80 to-white p-2.5">
                                              <p className="mb-0.5 flex items-center gap-1 text-[7px] font-black uppercase tracking-wider text-amber-800/90">
                                                  <Palette className="h-2.5 w-2.5 shrink-0" aria-hidden />
                                                  Φινίρισμα
                                              </p>
                                              <p className="text-[10px] font-bold leading-tight text-slate-800">{displayPlating}</p>
                                          </div>
                                          <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 p-2.5">
                                              <p className="mb-0.5 flex items-center gap-1 text-[7px] font-black uppercase tracking-wider text-slate-500">
                                                  <Weight className="h-2.5 w-2.5 shrink-0" aria-hidden />
                                                  Βάρος
                                              </p>
                                              <p className="text-[11px] font-black text-slate-800">{product.weight_g}g</p>
                                          </div>
                                          {displayStone ? (
                                              <div className="col-span-2 rounded-xl border border-violet-100/90 bg-gradient-to-r from-violet-50/60 to-white p-2.5">
                                                  <p className="mb-0.5 flex items-center gap-1 text-[7px] font-black uppercase tracking-wider text-violet-800/90">
                                                      <Gem className="h-2.5 w-2.5 shrink-0" aria-hidden />
                                                      Πέτρα / Λεπτομέρεια
                                                  </p>
                                                  <p className="text-[10px] font-bold leading-tight text-slate-800">{displayStone}</p>
                                              </div>
                                          ) : null}
                                      </div>

                                      <div className="flex items-stretch gap-2.5 rounded-2xl border border-slate-200/90 bg-white p-2 shadow-sm">
                                          <div className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white p-1">
                                              {qrDataUrl ? (
                                                  <img src={qrDataUrl} className="h-full w-full object-contain" alt="" />
                                              ) : null}
                                          </div>
                                          <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 py-0.5">
                                              <p className="text-[8px] font-black uppercase tracking-wider text-slate-400">Σάρωση · σημείωση</p>
                                              <p className="text-[10px] font-bold leading-snug text-[#060b00]">{qrDescription}</p>
                                          </div>
                                      </div>
                                  </div>
                              </div>
                          </div>
                      ) : (
                          <div className="flex flex-col items-center gap-6 rounded-[40px] border border-slate-200 bg-white p-8 shadow-xl">
                              <div className="rounded-[32px] border border-slate-100 bg-slate-50 p-4">
                                  {qrDataUrl && <img src={qrDataUrl} className="h-56 w-56 object-contain" alt="" />}
                              </div>
                              <div className="text-center">
                                  <div className="flex justify-center text-2xl font-black tracking-tight text-[#060b00]">
                                      <SkuColorizedText
                                          sku={product.sku}
                                          suffix={activeVariant?.suffix ?? ''}
                                          gender={product.gender}
                                          masterClassName="text-slate-900"
                                      />
                                  </div>
                                  <div className="mt-2 flex justify-center">
                                      <SkuVariantBadges suffix={activeVariant?.suffix ?? ''} gender={product.gender} product={product} compact />
                                  </div>
                                  <div className="mt-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">Σάρωση για λεπτομέρειες</div>
                              </div>
                          </div>
                      )}
                  </div>

                  <div className="p-4 bg-white border-t border-slate-200">
                      <button 
                        onClick={handleShare}
                        disabled={isGenerating}
                        className="w-full bg-[#060b00] text-white py-4 rounded-2xl font-black text-sm shadow-xl flex items-center justify-center gap-3 active:scale-95 transition-all"
                      >
                          {isGenerating ? <><Loader2 size={18} className="animate-spin"/> Δημιουργία...</> : <><Share2 size={18}/> {navigator.share ? 'Κοινοποίηση' : 'Λήψη Εικόνας'}</>}
                      </button>
                  </div>
              </div>
          </div>
      )}

      {transferModal && (
          <div className="fixed inset-0 z-[160] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6 animate-in zoom-in-95">
              <div className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl space-y-4">
                  <div className="flex justify-between items-center pb-2 border-b border-slate-100"><h3 className="font-black text-lg text-slate-800">Μεταφορά</h3><button onClick={() => setTransferModal(null)}><X size={20} className="text-slate-400"/></button></div>
                  <div><label className="text-[10px] font-bold text-slate-400 uppercase ml-1 mb-1 block">Από</label><div className="p-3 bg-slate-100 rounded-xl font-bold text-slate-600 border border-slate-200">{warehouses.find(w => w.id === transferModal.sourceId)?.name}</div></div>
                  <div><label className="text-[10px] font-bold text-slate-400 uppercase ml-1 mb-1 block">Προς</label><select value={transferModal.targetId} onChange={e => setTransferModal({...transferModal, targetId: e.target.value})} className="w-full p-3 bg-white border border-slate-200 rounded-xl font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500/20">{warehouses.filter(w => w.id !== transferModal.sourceId).map(w => (<option key={w.id} value={w.id}>{w.name}</option>))}</select></div>
                  <div><label className="text-[10px] font-bold text-slate-400 uppercase ml-1 mb-1 block">Ποσότητα</label><input type="number" min="1" value={transferModal.qty} onChange={e => setTransferModal({...transferModal, qty: parseInt(e.target.value) || 1})} className="w-full p-3 bg-white border border-slate-200 rounded-xl font-black text-2xl text-center outline-none focus:ring-2 focus:ring-blue-500/20"/></div>
                  <button onClick={handleTransferStock} className="w-full bg-blue-600 text-white py-3.5 rounded-xl font-bold text-lg shadow-lg active:scale-95 transition-transform flex items-center justify-center gap-2"><ArrowRightLeft size={20}/> Εκτέλεση</button>
              </div>
          </div>
      )}

      {adjustModal && (
          <div className="fixed inset-0 z-[160] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6 animate-in zoom-in-95">
              <div className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl space-y-4">
                  <div className="flex justify-between items-center pb-2 border-b border-slate-100"><h3 className="font-black text-lg text-slate-800">{adjustModal.type === 'add' ? 'Προσθήκη' : (adjustModal.type === 'remove' ? 'Αφαίρεση' : 'Διόρθωση')}</h3><button onClick={() => setAdjustModal(null)}><X size={20} className="text-slate-400"/></button></div>
                  <div className="text-center text-sm font-bold text-slate-500 mb-2">{warehouses.find(w => w.id === adjustModal.warehouseId)?.name}</div>
                  {adjustModal.type === 'set' ? (<div><label className="text-[10px] font-bold text-slate-400 uppercase ml-1 mb-1 block">Νέο Υπόλοιπο (Set)</label><input type="number" min="0" value={adjustModal.qty} onChange={e => setAdjustModal({...adjustModal, qty: parseInt(e.target.value) || 0})} className="w-full p-3 bg-white border border-slate-200 rounded-xl font-black text-2xl text-center outline-none focus:ring-2 focus:ring-slate-500/20"/></div>) : (<div className="grid grid-cols-2 gap-3"><button onClick={() => setAdjustModal({...adjustModal, type: 'add'})} className={`p-3 rounded-xl font-bold border transition-all ${adjustModal.type === 'add' ? 'bg-emerald-50 border-emerald-500 text-emerald-700 ring-2 ring-emerald-200' : 'bg-white border-slate-200 text-slate-500'}`}>Προσθήκη (+)</button><button onClick={() => setAdjustModal({...adjustModal, type: 'remove'})} className={`p-3 rounded-xl font-bold border transition-all ${adjustModal.type === 'remove' ? 'bg-rose-50 border-rose-500 text-rose-700 ring-2 ring-rose-200' : 'bg-white border-slate-200 text-slate-500'}`}>Αφαίρεση (-)</button></div>)}
                  {adjustModal.type !== 'set' && (<div><label className="text-[10px] font-bold text-slate-400 uppercase ml-1 mb-1 block">Ποσότητα</label><input type="number" min="1" value={adjustModal.qty} onChange={e => setAdjustModal({...adjustModal, qty: parseInt(e.target.value) || 1})} className="w-full p-3 bg-white border border-slate-200 rounded-xl font-black text-2xl text-center outline-none focus:ring-2 focus:ring-slate-500/20"/></div>)}
                  <button onClick={handleAdjustStock} className={`w-full py-3.5 rounded-xl font-bold text-lg shadow-lg active:scale-95 transition-transform flex items-center justify-center gap-2 text-white ${adjustModal.type === 'add' ? 'bg-emerald-600' : (adjustModal.type === 'remove' ? 'bg-rose-600' : 'bg-slate-900')}`}><Save size={20}/> Αποθήκευση</button>
              </div>
          </div>
      )}
    </div>
  );
}