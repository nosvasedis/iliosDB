import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Product, ProductVariant, Warehouse, Gender, PlatingType, MaterialType, RecipeItem } from '../../types';
import { X, MapPin, Weight, DollarSign, Globe, QrCode, Share2, Scan, ChevronLeft, ChevronRight, Maximize2, Tag, Image as ImageIcon, Copy, ArrowRightLeft, PlusCircle, Settings2, ArrowRight, Save, Hammer, Box, Flame, Gem, Coins, ChevronDown, ChevronUp, Palette, Info, Package, Download, Loader2, Sparkles, Layers, Ruler, Camera } from 'lucide-react';
import { formatCurrency, getVariantComponents, transliterateForBarcode } from '../../utils/pricingEngine';
import { SYSTEM_IDS, CLOUDFLARE_WORKER_URL, supabase, api, R2_PUBLIC_URL, AUTH_KEY_SECRET, uploadProductImage } from '../../lib/supabase';
import { ACCEPTED_IMAGE_INPUT_TYPES, compressImage } from '../../utils/imageHelpers';
import { productsRepository } from '../../features/products/repository';
import BarcodeView from '../BarcodeView';
import { useUI } from '../UIProvider';
import QRCode from 'qrcode';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { invalidateProductsAndCatalog } from '../../lib/queryInvalidation';
import html2canvas from 'html2canvas';
import { APP_LOGO, APP_ICON_ONLY } from '../../constants';
import { getVariantIndexBySuffix } from '../../features/products/productDetailsViewModels';
import SkuColorizedText from '../SkuColorizedText';
import { getSkuFinishBadgeSurface, getSkuFinishCardTheme } from '../../utils/skuColoring';
import {
  inventoryRepository,
  summarizeInventorySelectionByWarehouse,
  type InventoryAvailability,
} from '../../features/inventory';
import {
  refreshInventoryAvailability,
  useInventoryAvailability,
} from '../../hooks/api/useInventory';
import { useAuth } from '../AuthContext';

interface Props {
  product: Product;
  onClose: () => void;
  warehouses: Warehouse[];
  setPrintItems?: (items: { product: Product; variant?: ProductVariant; quantity: number, size?: string, format?: 'standard' | 'simple' | 'retail' }[]) => void;
  initialVariantSuffix?: string;
}

const GENDER_LABELS: Record<string, string> = {
    [Gender.Men]: 'Ανδρικό',
    [Gender.Women]: 'Γυναικείο',
    [Gender.Unisex]: 'Ουδέτερο'
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

export default function MobileProductDetails({ product, onClose, warehouses, setPrintItems, initialVariantSuffix }: Props) {
  const { showToast } = useUI();
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const canTransfer = isAdmin || profile?.role === 'user';
  const queryClient = useQueryClient();
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareTab, setShareTab] = useState<'card' | 'qr'>('card');
  const [showFullImage, setShowFullImage] = useState(false);
  const [activeTab, setActiveTab] = useState<'info' | 'stock'>('info'); 
  
  const { data: materials } = useQuery({ queryKey: ['materials'], queryFn: api.getMaterials });
  const { data: allProducts } = useQuery({ queryKey: ['products'], queryFn: api.getProducts });
  const { data: molds } = useQuery({ queryKey: ['molds'], queryFn: api.getMolds });
  const availabilityQuery = useInventoryAvailability();

  const [transferModal, setTransferModal] = useState<{ sourceId: string; targetId: string; qty: number; reason: string } | null>(null);
  const [adjustModal, setAdjustModal] = useState<{ warehouseId: string; type: 'add' | 'set' | 'remove'; qty: number; reason: string } | null>(null);
  const [stockMutationPending, setStockMutationPending] = useState(false);
  
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [localImageUrl, setLocalImageUrl] = useState<string | null>(product.image_url);

  const cardRef = useRef<HTMLDivElement>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [cardImageBase64, setCardImageBase64] = useState<string | null>(null);
  const [logoBase64, setLogoBase64] = useState<string | null>(null);

  const variants = product.variants || [];
  const sortedVariants = useMemo(() => {
      return [...variants].sort((a, b) => {
          const score = (s: string) => {
              if (s === '' || s === 'P') return 1;
              if (s === 'X') return 2;
              return 3;
          };
          return score(a.suffix) - score(b.suffix);
      });
  }, [product.variants]);
  const [variantIndex, setVariantIndex] = useState(() => getVariantIndexBySuffix(sortedVariants, initialVariantSuffix));
  const [variantDirection, setVariantDirection] = useState<'next' | 'previous'>('next');
  const activeVariant = sortedVariants[variantIndex] || null;

  useEffect(() => {
      setVariantIndex(getVariantIndexBySuffix(sortedVariants, initialVariantSuffix));
  }, [product.sku, initialVariantSuffix, sortedVariants]);

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

  const nextVariant = (e?: React.MouseEvent) => {
      e?.stopPropagation();
      if (sortedVariants.length > 0) {
          setVariantDirection('next');
          setVariantIndex((prev) => (prev + 1) % sortedVariants.length);
      }
  };
  const prevVariant = (e?: React.MouseEvent) => {
      e?.stopPropagation();
      if (sortedVariants.length > 0) {
          setVariantDirection('previous');
          setVariantIndex((prev) => (prev - 1 + sortedVariants.length) % sortedVariants.length);
      }
  };
  
  const displayGender = GENDER_LABELS[product.gender] || product.gender;
  const displayPrice = activeVariant ? (activeVariant.selling_price || 0) : (product.selling_price || 0);
  const displayLabel = activeVariant ? (activeVariant.description || '') : product.category;
  const displaySku = `${product.sku}${activeVariant?.suffix || ''}`;
  const inventoryByWarehouse = useMemo(() => {
      const summaries = summarizeInventorySelectionByWarehouse(
          availabilityQuery.data || [],
          product.sku,
          activeVariant?.suffix || '',
      );
      return new Map(summaries.map((summary) => [summary.warehouseId, summary]));
  }, [availabilityQuery.data, product.sku, activeVariant?.suffix]);

  const stockForWarehouse = (warehouseId: string) => inventoryByWarehouse.get(warehouseId) || {
      warehouseId,
      warehouseName: warehouses.find((warehouse) => warehouse.id === warehouseId)?.name || '',
      onHand: 0,
      reserved: 0,
      available: 0,
  };

  const variantDetails = useMemo(() => getVariantComponents(activeVariant?.suffix || '', product.gender), [activeVariant, product.gender]);
  const activeBadgeSurface = getSkuFinishBadgeSurface(variantDetails.finish.code);
  const activeCardTheme = getSkuFinishCardTheme(variantDetails.finish.code);
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

  const handleImageUpdate = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0]) {
          const file = e.target.files[0];
          setIsUploadingImage(true);
          try {
              const compressedBlob = await compressImage(file);
              const publicUrl = await uploadProductImage(compressedBlob, product.sku);
              if (publicUrl) {
                  setLocalImageUrl(publicUrl);
                  await productsRepository.saveProduct({ ...product, image_url: publicUrl });
                  await invalidateProductsAndCatalog(queryClient);
                  showToast("Η φωτογραφία ενημερώθηκε.", "success");
              }
          } catch (error) {
              console.error(error);
              showToast("Σφάλμα κατά την ενημέρωση φωτογραφίας.", "error");
          } finally {
              setIsUploadingImage(false);
              // Reset the input so the same file can be re-selected if needed
              e.target.value = '';
          }
      }
  };

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
      if (!adjustModal || stockMutationPending) return;
      const { warehouseId, type, qty } = adjustModal;
      const finalQty = type === 'remove' ? -qty : qty;
      const currentRow = (availabilityQuery.data || []).find((row) => (
          row.productSku === product.sku
          && row.variantSuffix === (activeVariant?.suffix || '')
          && row.sizeInfo === ''
          && row.warehouseId === warehouseId
      ));
      const expectedOnHand = type === 'set'
          ? qty
          : Number(currentRow?.onHand || 0) + finalQty;
      let mutationCommitted = false;
      setStockMutationPending(true);
      try {
          await inventoryRepository.adjustStock({
              productSku: product.sku,
              variantSuffix: activeVariant?.suffix || '',
              sizeInfo: '',
              warehouseId,
              mode: type === 'set' ? 'set' : 'delta',
              quantity: type === 'set' ? qty : finalQty,
              reason: adjustModal.reason,
          });
          mutationCommitted = true;
          const confirmedRows = await refreshInventoryAvailability(queryClient);
          const confirmedRow = confirmedRows.find((row) => (
              row.productSku === product.sku
              && row.variantSuffix === (activeVariant?.suffix || '')
              && row.sizeInfo === ''
              && row.warehouseId === warehouseId
          ));
          if (!confirmedRow || confirmedRow.onHand !== expectedOnHand) {
              throw new Error('Η νέα ποσότητα δεν επιβεβαιώθηκε από το κανονικό υπόλοιπο.');
          }
          showToast("Η διόρθωση αποθέματος καταχωρίστηκε και το υπόλοιπο ενημερώθηκε.", "success");
          setAdjustModal(null);
      } catch (e: any) {
          showToast(
              mutationCommitted
                  ? "Η καταχώριση ολοκληρώθηκε στη βάση, αλλά η ανανεωμένη ποσότητα δεν επιβεβαιώθηκε στην οθόνη. Το απόθεμα ενδέχεται να έχει μεταβληθεί· πατήστε «Ανανέωση» πριν επαναλάβετε την ενέργεια."
                  : (e?.message || "Η διόρθωση δεν ολοκληρώθηκε. Δεν πραγματοποιήθηκε καμία μεταβολή."),
              "error",
          );
      } finally {
          setStockMutationPending(false);
      }
  };

  const handleTransferStock = async () => {
      if (!transferModal || stockMutationPending) return;
      const { sourceId, targetId, qty } = transferModal;
      if (sourceId === targetId) return;
      const identityMatches = (row: InventoryAvailability, warehouseId: string) => (
          row.productSku === product.sku
          && row.variantSuffix === (activeVariant?.suffix || '')
          && row.sizeInfo === ''
          && row.warehouseId === warehouseId
      );
      const sourceBefore = (availabilityQuery.data || []).find((row) => identityMatches(row, sourceId));
      const targetBefore = (availabilityQuery.data || []).find((row) => identityMatches(row, targetId));
      let mutationCommitted = false;
      setStockMutationPending(true);
      try {
          await inventoryRepository.transferStock({
              productSku: product.sku,
              variantSuffix: activeVariant?.suffix || '',
              sizeInfo: '',
              sourceWarehouseId: sourceId,
              destinationWarehouseId: targetId,
              quantity: qty,
              reason: transferModal.reason,
          });
          mutationCommitted = true;
          const confirmedRows = await refreshInventoryAvailability(queryClient);
          const sourceAfter = confirmedRows.find((row) => identityMatches(row, sourceId));
          const targetAfter = confirmedRows.find((row) => identityMatches(row, targetId));
          const sourceConfirmed = sourceAfter?.onHand === Number(sourceBefore?.onHand || 0) - qty;
          const targetConfirmed = targetAfter?.onHand === Number(targetBefore?.onHand || 0) + qty;
          if (!sourceConfirmed || !targetConfirmed) {
              throw new Error('Τα νέα υπόλοιπα της ενδοδιακίνησης δεν επιβεβαιώθηκαν.');
          }
          showToast("Η ενδοδιακίνηση ολοκληρώθηκε και τα υπόλοιπα ενημερώθηκαν.", "success");
          setTransferModal(null);
      } catch (e: any) {
          showToast(
              mutationCommitted
                  ? "Η ενδοδιακίνηση ολοκληρώθηκε στη βάση, αλλά τα ανανεωμένα υπόλοιπα δεν επιβεβαιώθηκαν στην οθόνη. Πατήστε «Ανανέωση» πριν επαναλάβετε την ενέργεια."
                  : (e?.message || "Η ενδοδιακίνηση δεν ολοκληρώθηκε. Δεν πραγματοποιήθηκε καμία μεταβολή."),
              "error",
          );
      } finally {
          setStockMutationPending(false);
      }
  };

  const renderStockRow = (whId: string, isSystem: boolean, label: string) => {
      const { onHand, reserved, available } = stockForWarehouse(whId);
      return (
      <div key={whId} className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between">
          <div className="flex items-center gap-3">
              <div className={`p-2 rounded-xl ${isSystem ? (label.includes('Κεντρική') ? 'bg-slate-100 text-slate-600' : 'bg-purple-50 text-purple-600') : 'bg-blue-50 text-blue-600'}`}>
                  <MapPin size={18}/>
              </div>
              <div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase">{label}</div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs font-bold text-slate-600">
                      <span>Φυσικό: <strong className="text-slate-900">{onHand}</strong></span>
                      <span>Δεσμευμένο: <strong className="text-amber-700">{reserved}</strong></span>
                      <span>Διαθέσιμο: <strong className="text-emerald-700">{available}</strong></span>
                  </div>
              </div>
          </div>
          <div className="flex gap-2">
              {isAdmin && <button aria-label={`Προσθήκη αποθέματος στην ${label}`} onClick={() => setAdjustModal({ warehouseId: whId, type: 'add', qty: 1, reason: '' })} className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl border border-emerald-100 active:scale-95 transition-transform"><PlusCircle size={20}/></button>}
              {canTransfer && <button aria-label={`Ενδοδιακίνηση από ${label}`} onClick={() => setTransferModal({ sourceId: whId, targetId: warehouses.find(w => w.id !== whId)?.id || '', qty: 1, reason: '' })} className="p-2.5 bg-blue-50 text-blue-600 rounded-xl border border-blue-100 active:scale-95 transition-transform" disabled={available <= 0}><ArrowRightLeft size={20}/></button>}
              {isAdmin && <button aria-label={`Διόρθωση αποθέματος στην ${label}`} onClick={() => setAdjustModal({ warehouseId: whId, type: 'set', qty: onHand, reason: '' })} className="p-2.5 bg-slate-50 text-slate-600 rounded-xl border border-slate-200 active:scale-95 transition-transform"><Settings2 size={20}/></button>}
          </div>
      </div>
      );
  };

  return (
    <div className="fixed inset-0 z-[100] bg-slate-50 flex flex-col animate-in slide-in-from-bottom-full duration-300 overflow-hidden">
      <div className="relative h-72 bg-slate-200 shrink-0 group">
        {localImageUrl ? (
            <img src={localImageUrl} className="w-full h-full object-cover cursor-pointer" alt={product.sku} onClick={() => setShowFullImage(true)}/>
        ) : (
            <div className="w-full h-full flex items-center justify-center text-slate-400 font-bold bg-slate-100"><ImageIcon size={48} className="opacity-20"/></div>
        )}
        <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-start bg-gradient-to-b from-black/40 to-transparent">
            <button onClick={onClose} className="p-2 bg-white/20 backdrop-blur-md rounded-full text-white hover:bg-white/30 transition-colors shadow-lg active:scale-95"><X size={20}/></button>
            <div className="flex gap-2">
                <button onClick={() => { setShowShareModal(true); setShareTab('card'); }} className="p-2 bg-white text-slate-900 rounded-full hover:bg-slate-100 transition-colors shadow-lg active:scale-95"><Share2 size={20}/></button>
            </div>
        </div>
        {/* Camera / Upload button — always visible on mobile (no hover) */}
        <label className={`absolute bottom-4 right-4 z-10 flex items-center gap-2 px-3 py-2 rounded-xl shadow-lg cursor-pointer active:scale-95 transition-transform select-none ${isUploadingImage ? 'bg-white/60 text-slate-400' : 'bg-white/90 backdrop-blur-md text-slate-800'}`}>
            {isUploadingImage
                ? <><Loader2 size={16} className="animate-spin"/> <span className="text-xs font-bold">Μεταφόρτωση...</span></>
                : <><Camera size={16}/> <span className="text-xs font-bold">{localImageUrl ? 'Αλλαγή' : 'Προσθήκη'} Φωτο</span></>
            }
            <input type="file" accept={ACCEPTED_IMAGE_INPUT_TYPES} className="hidden" onChange={handleImageUpdate} disabled={isUploadingImage} />
        </label>
        <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-slate-900/90 via-slate-900/50 to-transparent pt-12">
            <div className="flex justify-between items-end">
                <div>
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="bg-white/20 backdrop-blur-md text-white text-[10px] font-bold px-2 py-0.5 rounded border border-white/10 uppercase tracking-wide">{product.category}</span>
                        <span className="bg-white/20 backdrop-blur-md text-white text-[10px] font-bold px-2 py-0.5 rounded border border-white/10 uppercase tracking-wide">{displayGender}</span>
                    </div>
                    <h1 className="text-3xl font-black text-white tracking-tight leading-none">{product.sku}</h1>
                    <div className="mt-1 flex items-center gap-2 text-white/80 text-xs font-bold"><span className="flex items-center gap-1"><Palette size={10}/> {displayPlating}</span><span>•</span><span>{product.weight_g}g</span></div>
                </div>
            </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-6 bg-slate-50 pb-20">
          <div className="bg-white p-3 rounded-2xl border border-slate-100 shadow-sm">
              <div className={`relative overflow-hidden rounded-xl border p-3 mb-3 shadow-sm ring-1 ring-inset ring-white/60 transition-[background-color,border-color,box-shadow] duration-200 ease-out motion-reduce:transition-none ${activeCardTheme.panel}`}>
                  <div className={`absolute inset-x-8 top-0 h-px transition-colors duration-200 motion-reduce:transition-none ${activeCardTheme.accent}`} />
                  {variants.length > 0 ? (
                      <div className="flex items-center gap-3 w-full">
                          <button
                              type="button"
                              onClick={prevVariant}
                              className={`shrink-0 rounded-lg border p-2 shadow-sm transition-[color,background-color,border-color,transform,box-shadow] duration-200 ease-out active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-1 motion-reduce:transition-none ${activeCardTheme.control}`}
                              aria-label="Προηγούμενη παραλλαγή"
                          >
                              <ChevronLeft size={20}/>
                          </button>
                          
                          {/* UPDATED: Prominent Suffix & Description */}
                          <div
                              key={`${variantIndex}-${activeVariant?.suffix || 'base'}`}
                              className={`min-w-0 flex-1 flex flex-col items-center justify-center ${variantDirection === 'next' ? 'ilios-variant-change-next' : 'ilios-variant-change-previous'}`}
                          >
                              <div className={`text-[10px] font-bold uppercase tracking-wider mb-1 transition-colors duration-200 motion-reduce:transition-none ${activeCardTheme.label}`}>Παραλλαγή</div>
                              <div
                                  className={`inline-flex min-h-10 items-center justify-center px-4 py-1.5 rounded-xl font-black text-xl border shadow-sm mb-2 transition-[background-color,border-color,box-shadow] duration-200 ease-out motion-reduce:transition-none ${activeBadgeSurface}`}
                                  aria-label={activeVariant?.suffix || 'ΒΑΣ'}
                              >
                                  {activeVariant?.suffix ? (
                                      <SkuColorizedText
                                          sku=""
                                          suffix={activeVariant.suffix}
                                          gender={product.gender}
                                          className="text-xl"
                                          masterClassName="text-slate-700"
                                      />
                                  ) : (
                                      <span className="text-slate-600">ΒΑΣ</span>
                                  )}
                              </div>
                              <div className="max-w-full text-sm text-slate-800 font-bold text-center leading-tight">
                                  {activeVariant?.description || 'Βασικό'}
                              </div>
                          </div>
                          
                          <button
                              type="button"
                              onClick={nextVariant}
                              className={`shrink-0 rounded-lg border p-2 shadow-sm transition-[color,background-color,border-color,transform,box-shadow] duration-200 ease-out active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-1 motion-reduce:transition-none ${activeCardTheme.control}`}
                              aria-label="Επόμενη παραλλαγή"
                          >
                              <ChevronRight size={20}/>
                          </button>
                      </div>
                  ) : (
                      <div className="text-center w-full"><div className="text-[10px] font-bold text-slate-400 uppercase">ΕΚΔΟΣΗ</div><div className="font-black text-slate-800 text-xl">MASTER</div></div>
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
                  <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest ml-2 flex items-center gap-2">
                      <MapPin size={12}/> Διαχείριση Αποθέματος
                      {availabilityQuery.isFetching && <Loader2 size={12} className="animate-spin" aria-label="Ανανέωση υπολοίπων"/>}
                  </h3>
                  {availabilityQuery.isLoading ? (
                      <div className="rounded-2xl border border-slate-100 bg-white p-5 text-center text-sm font-bold text-slate-500" role="status">
                          <Loader2 size={18} className="mx-auto mb-2 animate-spin" aria-hidden="true"/> Φόρτωση κανονικών υπολοίπων...
                      </div>
                  ) : availabilityQuery.isError ? (
                      <div className="rounded-2xl border border-rose-100 bg-rose-50 p-4 text-sm text-rose-800" role="alert">
                          <p className="font-bold">Τα υπόλοιπα αποθέματος δεν φορτώθηκαν. Δεν εμφανίζονται προσωρινά ποσότητες, ώστε να μην παρουσιαστούν παλιά στοιχεία.</p>
                          <button type="button" onClick={() => availabilityQuery.refetch()} className="mt-3 rounded-xl bg-rose-700 px-4 py-2 font-bold text-white">
                              Ανανέωση υπολοίπων
                          </button>
                      </div>
                  ) : (
                      <>
                          {renderStockRow(
                              SYSTEM_IDS.CENTRAL,
                              true,
                              warehouses.find((warehouse) => warehouse.id === SYSTEM_IDS.CENTRAL)?.name || 'Κεντρική Αποθήκη',
                          )}
                          {renderStockRow(
                              SYSTEM_IDS.SHOWROOM,
                              true,
                              warehouses.find((warehouse) => warehouse.id === SYSTEM_IDS.SHOWROOM)?.name || 'Δειγματολόγιο',
                          )}
                          {warehouses.filter(w => !w.is_system).map(w => renderStockRow(
                              w.id,
                              false,
                              w.name,
                          ))}
                      </>
                  )}
              </div>
          )}

          {activeTab === 'info' && (
              <div className="space-y-3 animate-in fade-in slide-in-from-left-2">
                  <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm space-y-4">
                      <div>
                          <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1"><Box size={12}/> Συνταγή / Υλικά</h4>
                          {product.recipe.length > 0 ? (
                              <div className="space-y-1.5">
                                  {product.recipe.map((r, idx) => {
                                      if (r.type === 'component') {
                                          const comp = allProducts?.find(p => p.sku === r.sku);
                                          const compDescription = comp?.description || comp?.category || '';
                                          const compImage = comp?.image_url || null;
                                          return (
                                              <div key={idx} className="flex items-center gap-2.5 p-2 bg-purple-50 rounded-xl border border-purple-100">
                                                  <div className="w-10 h-10 shrink-0 rounded-lg overflow-hidden border border-purple-200 bg-white flex items-center justify-center">
                                                      {compImage ? (
                                                          <img src={compImage} alt={r.sku} className="w-full h-full object-cover" />
                                                      ) : (
                                                          <div className="w-full h-full bg-purple-100 flex flex-col items-center justify-center gap-0.5">
                                                              <span className="text-[7px] font-black text-purple-500 tracking-widest leading-none">STX</span>
                                                              <Box size={11} className="text-purple-400" />
                                                          </div>
                                                      )}
                                                  </div>
                                                  <div className="min-w-0 flex-1">
                                                      <div className="font-black text-purple-800 text-xs leading-tight">{r.sku}</div>
                                                      {compDescription ? (
                                                          <div className="text-[11px] text-purple-600 font-medium mt-0.5 leading-snug line-clamp-2">{compDescription}</div>
                                                      ) : null}
                                                  </div>
                                                  <span className="font-mono font-black text-purple-700 text-xs shrink-0">×{r.quantity}</span>
                                              </div>
                                          );
                                      }
                                      const name = materials?.find(m => m.id === r.id)?.name || r.id;
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

                  <div className="p-6 flex flex-col items-center justify-center bg-slate-50 min-h-[440px]">
                      {shareTab === 'card' ? (
                          /* REDESIGNED PROFESSIONAL PRODUCT CARD - COMPACT SQUARE STYLE */
                          <div 
                            ref={cardRef}
                            className="bg-white rounded-[24px] shadow-2xl overflow-hidden w-[320px] border-4 border-white flex flex-col relative font-sans"
                            style={{ aspectRatio: '1/1.1' }}
                          >
                              {/* Decorative Background Accent */}
                              <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-emerald-50/50 to-transparent pointer-events-none" />

                              {/* Header */}
                              <div className="flex justify-between items-center p-5 pb-2 relative z-10">
                                  <div className="flex items-center gap-2">
                                      {/* Logo */}
                                      <div className="w-6 h-6 shrink-0">
                                          {logoBase64 ? <img src={logoBase64} className="w-full h-full object-contain" /> : <div className="w-6 h-6 bg-[#060b00] rounded-full"/>}
                                      </div>
                                      <div className="flex flex-col">
                                          <span className="font-bold text-[#060b00] text-xs leading-none tracking-tight">Ilios Kosmima</span>
                                          <span className="text-[7px] font-medium text-amber-600 uppercase tracking-widest leading-none mt-0.5">ΠΑΡΑΓΩΓΗ</span>
                                      </div>
                                  </div>
                                  {displayPrice > 0 && (
                                      <div className="flex flex-col items-end">
                                          <span className="text-lg font-black text-[#060b00] leading-none">{formatCurrency(displayPrice)}</span>
                                      </div>
                                  )}
                              </div>

                              {/* Hero Image Section */}
                              <div className="w-full flex-1 flex items-center justify-center px-4 relative z-10 min-h-0">
                                  <div className="w-full h-full relative flex items-center justify-center">
                                      {cardImageBase64 ? (
                                          <img src={cardImageBase64} className="max-w-full max-h-full object-contain drop-shadow-xl" alt="Product" />
                                      ) : (
                                          <div className="w-full h-full flex items-center justify-center text-slate-300">
                                              {product.image_url ? <img src={product.image_url} className="max-w-[80%] max-h-[80%] object-contain" crossOrigin="anonymous" alt="Fallback" /> : <ImageIcon size={40} className="opacity-20"/>}
                                          </div>
                                      )}
                                  </div>
                              </div>

                              {/* Details Content - Gold Border Top */}
                              <div className="px-5 pb-5 pt-3 relative z-10">
                                  <div className="flex justify-between items-end mb-3">
                                      <div>
                                          <h1 className="text-2xl font-black text-[#060b00] leading-none tracking-tight">{displaySku}</h1>
                                          <p className="text-[10px] font-bold text-slate-500 mt-1 capitalize">{product.category}</p>
                                      </div>
                                      {/* Pill Box - Fixed Alignment */}
                                      <div className="flex items-center justify-center">
                                           <span className="bg-emerald-50 border border-emerald-100 text-emerald-800 text-[9px] font-bold px-2.5 h-5 flex items-center justify-center rounded-full capitalize shadow-sm pb-[1px]">
                                              {displayGender}
                                           </span>
                                      </div>
                                  </div>
                                  
                                  {/* Specs Grid with Gold Accents */}
                                  <div className="grid grid-cols-2 gap-2">
                                      <div className="bg-amber-50/50 p-2 rounded-xl border border-amber-100/50 flex flex-col justify-center min-h-[40px]">
                                          <span className="text-[7px] font-bold text-amber-700 uppercase tracking-wider mb-0.5">Υλικό / Φινίρισμα</span>
                                          <span className="font-bold text-slate-700 text-[9px] leading-tight break-words">{displayPlating}</span>
                                      </div>
                                      <div className="bg-slate-50 p-2 rounded-xl border border-slate-100 flex flex-col justify-center min-h-[40px]">
                                          <span className="text-[7px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Βάρος</span>
                                          <span className="font-bold text-slate-700 text-[10px]">{product.weight_g}g</span>
                                      </div>
                                      
                                      {/* Footer / QR Row */}
                                      <div className="col-span-2 mt-1 flex items-center gap-3 bg-white rounded-xl border border-slate-100 p-1.5 pr-3 shadow-sm">
                                          <div className="w-9 h-9 bg-slate-50 rounded-lg p-0.5 shrink-0 border border-slate-200 flex items-center justify-center">
                                              {qrDataUrl && <img src={qrDataUrl} className="w-full h-full object-contain mix-blend-multiply" />}
                                          </div>
                                          <div className="flex-1 flex flex-col justify-center">
                                              <span className="text-[10px] font-bold text-[#060b00] leading-tight break-words">{qrDescription}</span>
                                          </div>
                                      </div>
                                  </div>
                              </div>
                          </div>
                      ) : (
                          /* QR ONLY VIEW */
                          <div className="bg-white p-8 rounded-[40px] border border-slate-200 shadow-xl flex flex-col items-center gap-6">
                              <div className="p-4 bg-slate-50 rounded-[32px] border border-slate-100">
                                  {qrDataUrl && <img src={qrDataUrl} className="w-56 h-56 object-contain" />}
                              </div>
                              <div className="text-center">
                                  <div className="text-3xl font-black text-[#060b00] tracking-tighter uppercase">{displaySku}</div>
                                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Σάρωση για λεπτομέρειες</div>
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
                  <div className="flex justify-between items-center pb-2 border-b border-slate-100"><h3 className="font-black text-lg text-slate-800">Ενδοδιακίνηση</h3><button aria-label="Κλείσιμο" onClick={() => { if (!stockMutationPending) setTransferModal(null); }} disabled={stockMutationPending}><X size={20} className="text-slate-400"/></button></div>
                  <div><label className="text-[10px] font-bold text-slate-400 uppercase ml-1 mb-1 block">Αποθήκη Προέλευσης</label><div className="p-3 bg-slate-100 rounded-xl font-bold text-slate-600 border border-slate-200">{warehouses.find(w => w.id === transferModal.sourceId)?.name}</div></div>
                  <div><label className="text-[10px] font-bold text-slate-400 uppercase ml-1 mb-1 block">Αποθήκη Προορισμού</label><select value={transferModal.targetId} onChange={e => setTransferModal({...transferModal, targetId: e.target.value})} className="w-full p-3 bg-white border border-slate-200 rounded-xl font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500/20">{warehouses.filter(w => w.id !== transferModal.sourceId).map(w => (<option key={w.id} value={w.id}>{w.name}</option>))}</select></div>
                  <div><label className="text-[10px] font-bold text-slate-400 uppercase ml-1 mb-1 block">Ποσότητα</label><input type="number" min="1" value={transferModal.qty} onChange={e => setTransferModal({...transferModal, qty: parseInt(e.target.value) || 1})} className="w-full p-3 bg-white border border-slate-200 rounded-xl font-black text-2xl text-center outline-none focus:ring-2 focus:ring-blue-500/20"/></div>
                  <div><label className="text-[10px] font-bold text-slate-400 uppercase ml-1 mb-1 block">Αιτιολογία</label><textarea value={transferModal.reason} onChange={e => setTransferModal({...transferModal, reason: e.target.value})} rows={2} className="w-full p-3 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500/20" placeholder="Καταχωρίστε την αιτία της ενδοδιακίνησης..."/></div>
                  <button onClick={handleTransferStock} disabled={stockMutationPending || !transferModal.reason.trim()} className="w-full bg-blue-600 text-white py-3.5 rounded-xl font-bold text-lg shadow-lg active:scale-95 transition-transform flex items-center justify-center gap-2 disabled:opacity-50">
                      {stockMutationPending ? <><Loader2 size={20} className="animate-spin"/> Επιβεβαίωση υπολοίπων...</> : <><ArrowRightLeft size={20}/> Καταχώριση</>}
                  </button>
              </div>
          </div>
      )}

      {adjustModal && (
          <div className="fixed inset-0 z-[160] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6 animate-in zoom-in-95">
              <div className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl space-y-4">
                  <div className="flex justify-between items-center pb-2 border-b border-slate-100"><h3 className="font-black text-lg text-slate-800">Διόρθωση Αποθέματος</h3><button aria-label="Κλείσιμο" onClick={() => { if (!stockMutationPending) setAdjustModal(null); }} disabled={stockMutationPending}><X size={20} className="text-slate-400"/></button></div>
                  <div className="text-center text-sm font-bold text-slate-500 mb-2">{warehouses.find(w => w.id === adjustModal.warehouseId)?.name}</div>
                  {adjustModal.type === 'set' ? (<div><label className="text-[10px] font-bold text-slate-400 uppercase ml-1 mb-1 block">Νέο Φυσικό Απόθεμα</label><input type="number" min="0" value={adjustModal.qty} onChange={e => setAdjustModal({...adjustModal, qty: parseInt(e.target.value) || 0})} className="w-full p-3 bg-white border border-slate-200 rounded-xl font-black text-2xl text-center outline-none focus:ring-2 focus:ring-slate-500/20"/></div>) : (<div className="grid grid-cols-2 gap-3"><button onClick={() => setAdjustModal({...adjustModal, type: 'add'})} className={`p-3 rounded-xl font-bold border transition-all ${adjustModal.type === 'add' ? 'bg-emerald-50 border-emerald-500 text-emerald-700 ring-2 ring-emerald-200' : 'bg-white border-slate-200 text-slate-500'}`}>Προσθήκη (+)</button><button onClick={() => setAdjustModal({...adjustModal, type: 'remove'})} className={`p-3 rounded-xl font-bold border transition-all ${adjustModal.type === 'remove' ? 'bg-rose-50 border-rose-500 text-rose-700 ring-2 ring-rose-200' : 'bg-white border-slate-200 text-slate-500'}`}>Αφαίρεση (-)</button></div>)}
                  {adjustModal.type !== 'set' && (<div><label className="text-[10px] font-bold text-slate-400 uppercase ml-1 mb-1 block">Ποσότητα</label><input type="number" min="1" value={adjustModal.qty} onChange={e => setAdjustModal({...adjustModal, qty: parseInt(e.target.value) || 1})} className="w-full p-3 bg-white border border-slate-200 rounded-xl font-black text-2xl text-center outline-none focus:ring-2 focus:ring-slate-500/20"/></div>)}
                  <div><label className="text-[10px] font-bold text-slate-400 uppercase ml-1 mb-1 block">Αιτιολογία</label><textarea value={adjustModal.reason} onChange={e => setAdjustModal({...adjustModal, reason: e.target.value})} rows={2} className="w-full p-3 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-slate-500/20" placeholder="Καταχωρίστε την αιτία της διόρθωσης..."/></div>
                  <button onClick={handleAdjustStock} disabled={stockMutationPending || !adjustModal.reason.trim()} className={`w-full py-3.5 rounded-xl font-bold text-lg shadow-lg active:scale-95 transition-transform flex items-center justify-center gap-2 text-white disabled:opacity-50 ${adjustModal.type === 'add' ? 'bg-emerald-600' : (adjustModal.type === 'remove' ? 'bg-rose-600' : 'bg-slate-900')}`}>
                      {stockMutationPending ? <><Loader2 size={20} className="animate-spin"/> Επιβεβαίωση υπολοίπου...</> : <><Save size={20}/> Καταχώριση</>}
                  </button>
              </div>
          </div>
      )}

      <style>{`
          @keyframes ilios-variant-change-next {
              from { opacity: 0.55; transform: translateX(5px) scale(0.99); }
              to { opacity: 1; transform: translateX(0) scale(1); }
          }
          @keyframes ilios-variant-change-previous {
              from { opacity: 0.55; transform: translateX(-5px) scale(0.99); }
              to { opacity: 1; transform: translateX(0) scale(1); }
          }
          .ilios-variant-change-next {
              animation: ilios-variant-change-next 180ms cubic-bezier(0.22, 1, 0.36, 1);
          }
          .ilios-variant-change-previous {
              animation: ilios-variant-change-previous 180ms cubic-bezier(0.22, 1, 0.36, 1);
          }
          @media (prefers-reduced-motion: reduce) {
              .ilios-variant-change-next,
              .ilios-variant-change-previous { animation: none; }
          }
      `}</style>
    </div>
  );
}
