
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Product, ProductVariant, Warehouse, Gender, PlatingType, MaterialType, RecipeItem } from '../../types';
import { X, MapPin, Weight, DollarSign, Globe, QrCode, Share2, Scan, ChevronLeft, ChevronRight, Maximize2, Tag, Image as ImageIcon, Copy, ArrowRightLeft, PlusCircle, Settings2, ArrowRight, Save, Hammer, Box, Flame, Gem, Coins, ChevronDown, ChevronUp, Palette, Info, Package, Download, Loader2, Sparkles, Layers, Ruler } from 'lucide-react';
import { formatCurrency, getVariantComponents, transliterateForBarcode } from '../../utils/pricingEngine';
import { SYSTEM_IDS, CLOUDFLARE_WORKER_URL, recordStockMovement, supabase, api, R2_PUBLIC_URL, AUTH_KEY_SECRET } from '../../lib/supabase';
import BarcodeView from '../BarcodeView';
import { useUI } from '../UIProvider';
import QRCode from 'qrcode';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import html2canvas from 'html2canvas';
import { APP_LOGO, APP_ICON_ONLY } from '../../constants';

interface Props {
  product: Product;
  onClose: () => void;
  warehouses: Warehouse[];
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

// Robust Base64 converter that forces requests through the Cloudflare Worker to ensure CORS headers
const toBase64 = async (url: string): Promise<string | null> => {
    try {
        let fetchUrl = url;
        
        // If it's an R2 URL, replace the domain with the Worker domain
        if (url.includes('r2.dev')) {
            const filename = url.split('/').pop();
            if (filename) {
                fetchUrl = `${CLOUDFLARE_WORKER_URL}/${filename}`;
            }
        }

        const response = await fetch(fetchUrl, { 
            method: 'GET',
            mode: 'cors',
            cache: 'no-cache', 
            headers: {}
        });

        if (!response.ok) throw new Error('Network response was not ok');
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

export default function MobileProductDetails({ product, onClose, warehouses }: Props) {
  const { showToast } = useUI();
  const queryClient = useQueryClient();
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareTab, setShareTab] = useState<'card' | 'qr'>('card');
  const [showFullImage, setShowFullImage] = useState(false);
  const [activeTab, setActiveTab] = useState<'info' | 'stock'>('info'); 
  
  // Data fetching for technical details
  const { data: materials } = useQuery({ queryKey: ['materials'], queryFn: api.getMaterials });
  const { data: allProducts } = useQuery({ queryKey: ['products'], queryFn: api.getProducts });
  const { data: molds } = useQuery({ queryKey: ['molds'], queryFn: api.getMolds });

  // Modal States
  const [transferModal, setTransferModal] = useState<{ sourceId: string; targetId: string; qty: number } | null>(null);
  const [adjustModal, setAdjustModal] = useState<{ warehouseId: string; type: 'add' | 'set' | 'remove'; qty: number } | null>(null);
  
  // Share Card Refs & State
  const cardRef = useRef<HTMLDivElement>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [cardImageBase64, setCardImageBase64] = useState<string | null>(null);
  const [logoBase64, setLogoBase64] = useState<string | null>(null);

  const variants = product.variants || [];
  
  const [variantIndex, setVariantIndex] = useState(0);

  const activeVariant = useMemo(() => {
      if (variants.length === 0) return null;
      const sorted = [...variants].sort((a, b) => {
          const score = (s: string) => {
              if (s === '' || s === 'P') return 1;
              if (s === 'X') return 2;
              return 3;
          };
          return score(a.suffix) - score(b.suffix);
      });
      return sorted[variantIndex];
  }, [variants, variantIndex]);

  // Generate QR code for the current SKU
  useEffect(() => {
      const sku = `${product.sku}${activeVariant?.suffix || ''}`;
      const safeSku = transliterateForBarcode(sku);
      QRCode.toDataURL(safeSku, { margin: 0, width: 200, color: { dark: '#060b00', light: '#ffffff' } })
          .then(url => setQrDataUrl(url))
          .catch(err => console.error(err));
  }, [product.sku, activeVariant]);

  // Pre-load images as base64 when share modal opens
  useEffect(() => {
      if (showShareModal) {
          if (product.image_url) {
              setCardImageBase64(null); 
              toBase64(product.image_url).then(base64 => {
                  if (base64) setCardImageBase64(base64);
              });
          }
          if (APP_ICON_ONLY) {
              toBase64(APP_ICON_ONLY).then(base64 => {
                  if (base64) setLogoBase64(base64);
              });
          }
      }
  }, [showShareModal, product.image_url]);

  const nextVariant = (e?: React.MouseEvent) => {
      e?.stopPropagation();
      if (variants.length > 0) setVariantIndex((prev) => (prev + 1) % variants.length);
  };

  const prevVariant = (e?: React.MouseEvent) => {
      e?.stopPropagation();
      if (variants.length > 0) setVariantIndex((prev) => (prev - 1 + variants.length) % variants.length);
  };
  
  const displayGender = GENDER_LABELS[product.gender] || product.gender;
  const displayPrice = activeVariant ? (activeVariant.selling_price || 0) : (product.selling_price || 0);
  const displayLabel = activeVariant ? (activeVariant.description || activeVariant.suffix) : product.category;
  const displaySku = `${product.sku}${activeVariant?.suffix || ''}`;

  const variantDetails = useMemo(() => {
      if (activeVariant) {
          return getVariantComponents(activeVariant.suffix, product.gender);
      }
      return getVariantComponents('', product.gender);
  }, [activeVariant, product.gender]);

  const displayPlating = useMemo(() => {
      if (variantDetails.finish.name) return variantDetails.finish.name;
      return PLATING_LABELS[product.plating_type] || product.plating_type;
  }, [variantDetails, product.plating_type]);

  const displayStone = variantDetails.stone.name;

  // --- Dynamic Tech Data based on Variant ---
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

  // --- ACTIONS ---

  const handleShare = async () => {
      if (!cardRef.current && shareTab === 'card') return;
      setIsGenerating(true);

      try {
          let blob: Blob | null = null;

          if (shareTab === 'card' && cardRef.current) {
              // Wait a bit for rendering stability (fonts, images)
              await new Promise(r => setTimeout(r, 250)); 
              
              const canvas = await html2canvas(cardRef.current, {
                  scale: 3, 
                  useCORS: true, 
                  backgroundColor: '#ffffff',
                  logging: false,
                  allowTaint: true
              });
              blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.95));
          } else if (shareTab === 'qr' && qrDataUrl) {
              const res = await fetch(qrDataUrl);
              blob = await res.blob();
          }

          if (!blob) throw new Error("Could not generate image.");

          const file = new File([blob], `ilios-${displaySku}.jpg`, { type: 'image/jpeg' });

          if (navigator.canShare && navigator.canShare({ files: [file] })) {
              await navigator.share({
                  files: [file],
                  title: displaySku,
                  text: `${displaySku} - ${displayLabel} (${formatCurrency(displayPrice)})`
              });
          } else {
              // Fallback to download
              const url = URL.createObjectURL(blob);
              const link = document.createElement('a');
              link.href = url;
              link.download = `ilios-${displaySku}.jpg`;
              link.click();
              URL.revokeObjectURL(url);
              showToast("Η εικόνα αποθηκεύτηκε.", "success");
          }
      } catch (err: any) {
          console.error(err);
          showToast("Σφάλμα κατά την κοινοποίηση.", "error");
      } finally {
          setIsGenerating(false);
      }
  };

  // ... (Stock logic remains the same)
  const handleAdjustStock = async () => {
      if (!adjustModal) return;
      const { warehouseId, type, qty } = adjustModal;
      const finalQty = type === 'remove' ? -qty : qty;
      const whName = warehouses.find(w => w.id === warehouseId)?.name || 'Unknown';

      try {
          const isCentral = warehouseId === SYSTEM_IDS.CENTRAL;
          const isShowroom = warehouseId === SYSTEM_IDS.SHOWROOM;
          
          if (activeVariant) {
              if (isCentral) {
                  const newQty = type === 'set' ? qty : Math.max(0, (activeVariant.stock_qty || 0) + finalQty);
                  await supabase.from('product_variants').update({ stock_qty: newQty }).match({ product_sku: product.sku, suffix: activeVariant.suffix });
              } else {
                  const currentLocStock = activeVariant.location_stock?.[warehouseId] || 0;
                  const newQty = type === 'set' ? qty : Math.max(0, currentLocStock + finalQty);
                  await supabase.from('product_stock').upsert({
                      product_sku: product.sku,
                      variant_suffix: activeVariant.suffix,
                      warehouse_id: warehouseId,
                      quantity: newQty
                  }, { onConflict: 'product_sku, warehouse_id, variant_suffix' });
              }
          } else {
              // Master Product
              if (isCentral) {
                  const newQty = type === 'set' ? qty : Math.max(0, (product.stock_qty || 0) + finalQty);
                  await supabase.from('products').update({ stock_qty: newQty }).eq('sku', product.sku);
              } else if (isShowroom) {
                  const newQty = type === 'set' ? qty : Math.max(0, (product.sample_qty || 0) + finalQty);
                  await supabase.from('products').update({ sample_qty: newQty }).eq('sku', product.sku);
              } else {
                  const currentLocStock = product.location_stock?.[warehouseId] || 0;
                  const newQty = type === 'set' ? qty : Math.max(0, currentLocStock + finalQty);
                  await supabase.from('product_stock').upsert({
                      product_sku: product.sku,
                      variant_suffix: null,
                      warehouse_id: warehouseId,
                      quantity: newQty
                  }, { onConflict: 'product_sku, warehouse_id, variant_suffix' });
              }
          }

          const reason = type === 'set' ? `Stock Set: ${whName}` : `Manual Adj: ${whName}`;
          await recordStockMovement(product.sku, type === 'set' ? 0 : finalQty, reason, activeVariant?.suffix || undefined);
          
          queryClient.invalidateQueries({ queryKey: ['products'] });
          showToast("Το απόθεμα ενημερώθηκε.", "success");
          setAdjustModal(null);
      } catch (e) {
          showToast("Σφάλμα ενημέρωσης.", "error");
      }
  };

  const handleTransferStock = async () => {
      if (!transferModal) return;
      const { sourceId, targetId, qty } = transferModal;
      if (sourceId === targetId) { showToast("Επιλέξτε διαφορετική αποθήκη.", "error"); return; }

      let sourceQty = 0;
      if (activeVariant) {
          sourceQty = sourceId === SYSTEM_IDS.CENTRAL ? activeVariant.stock_qty : (activeVariant.location_stock?.[sourceId] || 0);
      } else {
          sourceQty = sourceId === SYSTEM_IDS.CENTRAL ? product.stock_qty : (sourceId === SYSTEM_IDS.SHOWROOM ? product.sample_qty : (product.location_stock?.[sourceId] || 0));
      }

      if (qty > sourceQty) { showToast("Ανεπαρκές υπόλοιπο.", "error"); return; }

      try {
          const variantSuffix = activeVariant?.suffix || null;
          const sku = product.sku;

          const updateStock = async (whId: string, delta: number) => {
               const isCen = whId === SYSTEM_IDS.CENTRAL;
               const isShow = whId === SYSTEM_IDS.SHOWROOM;
               
               if (activeVariant) {
                   if (isCen) await supabase.from('product_variants').update({ stock_qty: Math.max(0, activeVariant.stock_qty + delta) }).match({ product_sku: sku, suffix: variantSuffix });
                   else {
                       const curr = activeVariant.location_stock?.[whId] || 0;
                       await supabase.from('product_stock').upsert({ product_sku: sku, variant_suffix: variantSuffix, warehouse_id: whId, quantity: Math.max(0, curr + delta) }, { onConflict: 'product_sku, warehouse_id, variant_suffix' });
                   }
               } else {
                   if (isCen) await supabase.from('products').update({ stock_qty: Math.max(0, product.stock_qty + delta) }).eq('sku', sku);
                   else if (isShow) await supabase.from('products').update({ sample_qty: Math.max(0, product.sample_qty + delta) }).eq('sku', sku);
                   else {
                       const curr = product.location_stock?.[whId] || 0;
                       await supabase.from('product_stock').upsert({ product_sku: sku, variant_suffix: null, warehouse_id: whId, quantity: Math.max(0, curr + delta) }, { onConflict: 'product_sku, warehouse_id, variant_suffix' });
                   }
               }
          };
          
          await updateStock(sourceId, -qty);
          
          if (activeVariant) {
               if (targetId === SYSTEM_IDS.CENTRAL) await supabase.from('product_variants').update({ stock_qty: activeVariant.stock_qty + qty }).match({ product_sku: sku, suffix: variantSuffix });
               else {
                   const curr = activeVariant.location_stock?.[targetId] || 0;
                   await supabase.from('product_stock').upsert({ product_sku: sku, variant_suffix: variantSuffix, warehouse_id: targetId, quantity: curr + qty }, { onConflict: 'product_sku, warehouse_id, variant_suffix' });
               }
          } else {
               if (targetId === SYSTEM_IDS.CENTRAL) await supabase.from('products').update({ stock_qty: product.stock_qty + qty }).eq('sku', sku);
               else if (targetId === SYSTEM_IDS.SHOWROOM) await supabase.from('products').update({ sample_qty: product.sample_qty + qty }).eq('sku', sku);
               else {
                   const curr = product.location_stock?.[targetId] || 0;
                   await supabase.from('product_stock').upsert({ product_sku: sku, variant_suffix: null, warehouse_id: targetId, quantity: curr + qty }, { onConflict: 'product_sku, warehouse_id, variant_suffix' });
               }
          }

          const srcName = warehouses.find(w=>w.id===sourceId)?.name;
          const tgtName = warehouses.find(w=>w.id===targetId)?.name;
          await recordStockMovement(sku, qty, `Transfer: ${srcName} -> ${tgtName}`, variantSuffix || undefined);

          queryClient.invalidateQueries({ queryKey: ['products'] });
          showToast("Η μεταφορά ολοκληρώθηκε.", "success");
          setTransferModal(null);
      } catch (e) {
          showToast("Σφάλμα μεταφοράς.", "error");
      }
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
              <button 
                onClick={() => setAdjustModal({ warehouseId: whId, type: 'add', qty: 1 })}
                className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl border border-emerald-100 active:scale-95 transition-transform"
                title="Προσθήκη"
              >
                  <PlusCircle size={20}/>
              </button>
              <button 
                onClick={() => setTransferModal({ sourceId: whId, targetId: warehouses.find(w => w.id !== whId)?.id || '', qty: 1 })}
                className="p-2.5 bg-blue-50 text-blue-600 rounded-xl border border-blue-100 active:scale-95 transition-transform"
                disabled={qty <= 0}
                title="Μεταφορά"
              >
                  <ArrowRightLeft size={20}/>
              </button>
              <button 
                onClick={() => setAdjustModal({ warehouseId: whId, type: 'set', qty: qty })}
                className="p-2.5 bg-slate-50 text-slate-600 rounded-xl border border-slate-200 active:scale-95 transition-transform"
                title="Διόρθωση"
              >
                  <Settings2 size={20}/>
              </button>
          </div>
      </div>
  );

  return (
    <div className="fixed inset-0 z-[100] bg-slate-50 flex flex-col animate-in slide-in-from-bottom-full duration-300 overflow-hidden">
      
      {/* Header / Image Area */}
      <div className="relative h-72 bg-slate-200 shrink-0 group">
        {product.image_url ? (
            <img 
                src={product.image_url} 
                className="w-full h-full object-cover cursor-pointer" 
                alt={product.sku} 
                onClick={() => setShowFullImage(true)}
            />
        ) : (
            <div className="w-full h-full flex items-center justify-center text-slate-400 font-bold bg-slate-100">
                <ImageIcon size={48} className="opacity-20"/>
            </div>
        )}
        
        <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-start bg-gradient-to-b from-black/40 to-transparent">
            <button onClick={onClose} className="p-2 bg-white/20 backdrop-blur-md rounded-full text-white hover:bg-white/30 transition-colors shadow-lg active:scale-95">
                <X size={20} />
            </button>
            <div className="flex gap-2">
                <button onClick={() => { setShowShareModal(true); setShareTab('card'); }} className="p-2 bg-white text-slate-900 rounded-full hover:bg-slate-100 transition-colors shadow-lg active:scale-95">
                    <QrCode size={20} />
                </button>
            </div>
        </div>

        <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-slate-900/90 via-slate-900/50 to-transparent pt-12">
            <div className="flex justify-between items-end">
                <div>
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="bg-white/20 backdrop-blur-md text-white text-[10px] font-bold px-2 py-0.5 rounded border border-white/10 uppercase tracking-wide">
                            {product.category}
                        </span>
                        <span className="bg-white/20 backdrop-blur-md text-white text-[10px] font-bold px-2 py-0.5 rounded border border-white/10 uppercase tracking-wide">
                            {displayGender}
                        </span>
                        {product.is_component && <span className="bg-blue-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">STX</span>}
                    </div>
                    <h1 className="text-3xl font-black text-white tracking-tight leading-none">{product.sku}</h1>
                    <div className="mt-1 flex items-center gap-2 text-white/80 text-xs font-bold">
                        <span className="flex items-center gap-1"><Palette size={10}/> {displayPlating}</span>
                        <span>•</span>
                        <span>{product.weight_g}g</span>
                    </div>
                </div>
            </div>
        </div>
      </div>

      {/* Content Scrollable */}
      <div className="flex-1 overflow-y-auto p-5 space-y-6 bg-slate-50 pb-20">
          
          {/* Variant Switcher / Main Info */}
          <div className="bg-white p-3 rounded-2xl border border-slate-100 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                  {variants.length > 0 ? (
                      <div className="flex items-center gap-3 w-full">
                          <button onClick={prevVariant} className="p-2 bg-slate-100 rounded-lg text-slate-500 active:bg-slate-200"><ChevronLeft size={20}/></button>
                          <div className="flex-1 text-center">
                              <div className="text-[10px] font-bold text-slate-400 uppercase">ΠΑΡΑΛΛΑΓΗ</div>
                              <div className="font-black text-slate-800 text-xl">{activeVariant?.suffix || 'ΒΑΣ'}</div>
                              <div className="text-xs text-emerald-600 font-medium truncate">{activeVariant?.description || 'Βασικό'}</div>
                          </div>
                          <button onClick={nextVariant} className="p-2 bg-slate-100 rounded-lg text-slate-500 active:bg-slate-200"><ChevronRight size={20}/></button>
                      </div>
                  ) : (
                      <div className="text-center w-full">
                          <div className="text-[10px] font-bold text-slate-400 uppercase">ΕΚΔΟΣΗ</div>
                          <div className="font-black text-slate-800 text-xl">MASTER</div>
                      </div>
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

          {/* TABS CONTROLLER */}
          <div className="flex p-1 bg-slate-100 rounded-xl mb-2">
                <button 
                    onClick={() => setActiveTab('info')} 
                    className={`flex-1 py-2.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 ${activeTab === 'info' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                    <Info size={14}/> Στοιχεία
                </button>
                <button 
                    onClick={() => setActiveTab('stock')} 
                    className={`flex-1 py-2.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 ${activeTab === 'stock' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                    <Package size={14}/> Απόθεμα
                </button>
          </div>

          {/* TAB CONTENT: STOCK */}
          {activeTab === 'stock' && (
              <div className="space-y-3 animate-in fade-in slide-in-from-right-2">
                  <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest ml-2 flex items-center gap-2"><MapPin size={12}/> Διαχείριση Αποθέματος</h3>
                  
                  {renderStockRow(
                      SYSTEM_IDS.CENTRAL, 
                      activeVariant ? activeVariant.stock_qty : product.stock_qty, 
                      true, 
                      'Κεντρική Αποθήκη'
                  )}
                  
                  {renderStockRow(
                      SYSTEM_IDS.SHOWROOM, 
                      activeVariant ? (activeVariant.location_stock?.[SYSTEM_IDS.SHOWROOM] || 0) : product.sample_qty, 
                      true, 
                      'Δειγματολόγιο'
                  )}

                  {warehouses.filter(w => !w.is_system).map(w => (
                      renderStockRow(
                          w.id,
                          activeVariant ? (activeVariant.location_stock?.[w.id] || 0) : (product.location_stock?.[w.id] || 0),
                          false,
                          w.name
                      )
                  ))}
              </div>
          )}

          {/* TAB CONTENT: INFO */}
          {activeTab === 'info' && (
              <div className="space-y-3 animate-in fade-in slide-in-from-left-2">
                  {/* TECHNICAL DETAILS TOGGLE (Always Open or Collapsible?) Let's default open in Tab */}
                  <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm space-y-4">
                      {/* Recipe */}
                      <div>
                          <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1"><Box size={12}/> Συνταγή / Υλικά</h4>
                          {product.recipe.length > 0 ? (
                              <div className="space-y-1">
                                  {product.recipe.map((r, idx) => {
                                      const name = r.type === 'raw' 
                                          ? materials?.find(m => m.id === r.id)?.name 
                                          : allProducts?.find(p => p.sku === r.sku)?.category || r.sku;
                                      return (
                                          <div key={idx} className="flex justify-between items-center text-sm p-2 bg-slate-50 rounded-lg">
                                              <span className="font-bold text-slate-700">{name}</span>
                                              <span className="font-mono font-bold text-slate-500">x{r.quantity}</span>
                                          </div>
                                      );
                                  })}
                              </div>
                          ) : (
                              <div className="text-center text-xs text-slate-400 italic">Χωρίς υλικά.</div>
                          )}
                      </div>

                      {/* Molds */}
                      <div>
                          <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1"><MapPin size={12}/> Λάστιχα</h4>
                          {product.molds.length > 0 ? (
                              <div className="space-y-1">
                                  {product.molds.map((m, idx) => {
                                      const moldInfo = molds?.find(md => md.code === m.code);
                                      return (
                                          <div key={idx} className="flex justify-between items-center text-sm p-2 bg-amber-50 rounded-lg border border-amber-100">
                                              <div className="flex items-center gap-2">
                                                  <span className="font-black text-amber-800 font-mono">{m.code}</span>
                                                  <span className="text-xs text-slate-500 font-bold">x{m.quantity}</span>
                                              </div>
                                              <span className="text-[10px] text-amber-600 font-bold uppercase">{moldInfo?.location || '-'}</span>
                                          </div>
                                      );
                                  })}
                              </div>
                          ) : (
                              <div className="text-center text-xs text-slate-400 italic">Χωρίς λάστιχα.</div>
                          )}
                      </div>

                      {/* Labor Costs (Brief) - Variant Sensitive */}
                      <div>
                          <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1"><Coins size={12}/> Εργατικά (Εκτίμηση)</h4>
                          <div className="grid grid-cols-2 gap-2 text-xs">
                              <div className="bg-slate-50 p-2 rounded-lg flex justify-between">
                                  <span className="text-slate-500">Τεχνίτης</span>
                                  <span className="font-bold text-slate-700">{activeTechData.technician}€</span>
                              </div>
                              <div className="bg-slate-50 p-2 rounded-lg flex justify-between">
                                  <span className="text-slate-500">Καρφωτής</span>
                                  <span className="font-bold text-slate-700">{activeTechData.setter}€</span>
                              </div>
                              <div className="bg-slate-50 p-2 rounded-lg flex justify-between">
                                  <span className="text-slate-500">Χύτευση</span>
                                  <span className="font-bold text-slate-700">{activeTechData.casting}€</span>
                              </div>
                              <div className="bg-slate-50 p-2 rounded-lg flex justify-between">
                                  <span className="text-slate-500">Επιμ.</span>
                                  <span className={`font-bold ${activeTechData.plating > 0 ? 'text-amber-600' : 'text-slate-400'}`}>
                                      {activeTechData.plating > 0 ? `${activeTechData.plating}€` : '-'}
                                  </span>
                              </div>
                          </div>
                      </div>
                  </div>
              </div>
          )}
          
          <div className="h-12"></div>
      </div>

      {/* FULL SCREEN IMAGE MODAL */}
      {showFullImage && product.image_url && (
          <div className="fixed inset-0 z-[120] bg-black flex items-center justify-center p-0 animate-in fade-in duration-200" onClick={() => setShowFullImage(false)}>
              <img src={product.image_url} className="max-w-full max-h-full object-contain" alt="Full" />
              <button className="absolute top-4 right-4 text-white p-2 bg-white/20 rounded-full"><X size={24}/></button>
          </div>
      )}

      {/* SHARE / QR MODAL */}
      {showShareModal && (
          <div className="fixed inset-0 z-[110] bg-slate-900/90 backdrop-blur-md flex flex-col items-center justify-center p-4 animate-in fade-in duration-200">
              <div className="bg-slate-100 w-full max-w-sm rounded-3xl overflow-hidden shadow-2xl relative">
                  <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-white">
                      <div className="flex gap-2 p-1 bg-slate-100 rounded-xl">
                          <button 
                            onClick={() => setShareTab('card')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${shareTab === 'card' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500'}`}
                          >
                              Κάρτα
                          </button>
                          <button 
                            onClick={() => setShareTab('qr')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${shareTab === 'qr' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500'}`}
                          >
                              QR
                          </button>
                      </div>
                      <button onClick={() => setShowShareModal(false)} className="p-2 text-slate-400 hover:text-slate-600"><X size={20}/></button>
                  </div>

                  <div className="p-6 flex flex-col items-center justify-center bg-slate-50 min-h-[320px]">
                      {shareTab === 'card' ? (
                          /* PRODUCT CARD PREVIEW (RENDERED) */
                          <div 
                            ref={cardRef}
                            className="bg-white rounded-2xl shadow-lg overflow-hidden w-[280px] aspect-[4/6] flex flex-col relative border border-slate-200"
                          >
                              {/* Background Image / Placeholder */}
                              <div className="absolute inset-0 z-0 bg-white">
                                  {cardImageBase64 ? (
                                      <img 
                                        src={cardImageBase64} 
                                        className="w-full h-full object-contain p-8" 
                                        alt="Product" 
                                      />
                                  ) : (
                                      <div className="w-full h-full bg-slate-100 flex items-center justify-center text-slate-300">
                                          {product.image_url ? (
                                              /* Fallback to URL with crossOrigin if Base64 fails */
                                              <img src={product.image_url} className="w-full h-full object-contain p-8" crossOrigin="anonymous" alt="Fallback" />
                                          ) : (
                                              <ImageIcon size={48}/>
                                          )}
                                      </div>
                                  )}
                                  {/* Gradient Overlays */}
                                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30 pointer-events-none"></div>
                              </div>

                              {/* Branding - Top */}
                              <div className="relative z-10 p-5 pt-6 w-full flex justify-between items-start">
                                  <div className="bg-white/10 backdrop-blur-md text-white p-2 rounded-xl border border-white/20 shadow-sm">
                                      {logoBase64 ? (
                                          <img src={logoBase64} className="w-8 h-8 object-contain drop-shadow-md"/>
                                      ) : (
                                          <span className="font-black text-xs">ILIOS</span>
                                      )}
                                  </div>
                              </div>

                              {/* Footer Details - Bottom */}
                              <div className="mt-auto relative z-10 p-5 text-white w-full">
                                  <div className="flex items-end gap-3">
                                      <div className="flex-1 min-w-0">
                                          <div className="flex items-center gap-2 mb-2">
                                              <span className="text-[10px] bg-white/20 backdrop-blur-md px-2 py-0.5 rounded font-bold uppercase border border-white/10 tracking-wide">{product.category}</span>
                                          </div>
                                          {/* SKU Handling with Word Break for Long SKUs */}
                                          <h3 className="text-3xl font-black leading-none tracking-tighter shadow-black drop-shadow-md break-all">{displaySku}</h3>
                                          <p className="text-sm font-bold opacity-90 mt-1 uppercase tracking-wide truncate">{displayLabel}</p>
                                          
                                          {/* Variant Specs */}
                                          <div className="mt-4 flex items-center gap-2 text-xs font-bold text-white/90 flex-wrap">
                                              <div className="flex items-center gap-1.5 bg-black/30 px-2 py-1 rounded-md backdrop-blur-sm border border-white/10">
                                                  <Palette size={12}/> {displayPlating}
                                              </div>
                                              {displayStone && (
                                                  <div className="flex items-center gap-1.5 bg-black/30 px-2 py-1 rounded-md backdrop-blur-sm border border-white/10">
                                                      <Gem size={12}/> {displayStone}
                                                  </div>
                                              )}
                                               <div className="flex items-center gap-1.5 bg-black/30 px-2 py-1 rounded-md backdrop-blur-sm border border-white/10">
                                                  <Weight size={12}/> {product.weight_g}g
                                              </div>
                                          </div>
                                      </div>
                                  </div>

                                  <div className="mt-5 pt-4 border-t border-white/20 flex justify-between items-end">
                                      {displayPrice > 0 ? (
                                          <div>
                                              <div className="text-[10px] font-bold opacity-70 uppercase tracking-widest mb-0.5">Τιμή</div>
                                              <div className="text-2xl font-black tracking-tight">{formatCurrency(displayPrice)}</div>
                                          </div>
                                      ) : <div></div>}
                                      
                                      <div className="bg-white p-1.5 rounded-xl shadow-lg">
                                          {qrDataUrl && <img src={qrDataUrl} className="w-12 h-12 object-contain" />}
                                      </div>
                                  </div>
                              </div>
                          </div>
                      ) : (
                          /* QR ONLY VIEW */
                          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-md">
                              {qrDataUrl && <img src={qrDataUrl} className="w-48 h-48 object-contain" />}
                              <div className="text-center mt-4 font-mono font-black text-slate-800 text-lg">{displaySku}</div>
                          </div>
                      )}
                  </div>

                  <div className="p-4 bg-white border-t border-slate-200">
                      <button 
                        onClick={handleShare}
                        disabled={isGenerating}
                        className="w-full bg-[#060b00] text-white py-3.5 rounded-xl font-bold text-sm shadow-lg flex items-center justify-center gap-2 active:scale-95 transition-transform"
                      >
                          {isGenerating ? (
                              <><Loader2 size={18} className="animate-spin"/> Δημιουργία...</>
                          ) : (
                              <>
                                  <Share2 size={18}/>
                                  {navigator.share ? 'Κοινοποίηση' : 'Λήψη'}
                              </>
                          )}
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* Modals (Transfer/Adjust) remain the same... */}
      {transferModal && (
          <div className="fixed inset-0 z-[160] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6 animate-in zoom-in-95">
              <div className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl space-y-4">
                  <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                      <h3 className="font-black text-lg text-slate-800">Μεταφορά</h3>
                      <button onClick={() => setTransferModal(null)}><X size={20} className="text-slate-400"/></button>
                  </div>
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
                  <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                      <h3 className="font-black text-lg text-slate-800">{adjustModal.type === 'add' ? 'Προσθήκη' : (adjustModal.type === 'remove' ? 'Αφαίρεση' : 'Διόρθωση')}</h3>
                      <button onClick={() => setAdjustModal(null)}><X size={20} className="text-slate-400"/></button>
                  </div>
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
