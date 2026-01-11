
import React, { useState, useMemo, useEffect } from 'react';
import { Product, ProductVariant, Warehouse, Gender, PlatingType } from '../../types';
import { X, MapPin, Weight, DollarSign, Globe, QrCode, Share2, Scan, ChevronLeft, ChevronRight, Maximize2, Tag, Image as ImageIcon, Copy } from 'lucide-react';
import { formatCurrency } from '../../utils/pricingEngine';
import { SYSTEM_IDS, CLOUDFLARE_WORKER_URL } from '../../lib/supabase';
import BarcodeView from '../BarcodeView';
import { useUI } from '../UIProvider';
import QRCode from 'qrcode';

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

export default function MobileProductDetails({ product, onClose, warehouses }: Props) {
  const { showToast } = useUI();
  const [showBarcode, setShowBarcode] = useState(false);
  const [showFullImage, setShowFullImage] = useState(false);
  const [isSharing, setIsSharing] = useState(false);

  const variants = product.variants || [];
  
  const [activeVariantForBarcode, setActiveVariantForBarcode] = useState<ProductVariant | null>(
      variants.length > 0 ? variants[0] : null
  );

  // --- PRICE SWAPPER LOGIC ---
  const [priceIndex, setPriceIndex] = useState(0);

  const priceOptions = useMemo(() => {
      if (variants.length > 0) {
          const sorted = [...variants].sort((a, b) => {
              const score = (s: string) => {
                  if (s === '' || s === 'P') return 1;
                  if (s === 'X') return 2;
                  return 3;
              };
              return score(a.suffix) - score(b.suffix);
          });
          
          return sorted.map(v => ({
              price: v.selling_price || 0,
              label: v.suffix || 'ΒΑΣ', 
              desc: v.description
          }));
      }
      return [{ 
          price: product.selling_price || 0, 
          label: 'KYP', 
          desc: 'Βασικό' 
      }];
  }, [product, variants]);

  const currentPriceObj = priceOptions[priceIndex] || priceOptions[0];

  const nextPrice = (e: React.MouseEvent) => {
      e.stopPropagation();
      setPriceIndex((prev) => (prev + 1) % priceOptions.length);
  };

  const prevPrice = (e: React.MouseEvent) => {
      e.stopPropagation();
      setPriceIndex((prev) => (prev - 1 + priceOptions.length) % priceOptions.length);
  };
  
  const displayGender = GENDER_LABELS[product.gender] || product.gender;
  
  const displayPlating = useMemo(() => {
      if (variants.length > 0) {
          const suffixPlatings = new Set<string>();
          variants.forEach(v => {
             if (v.suffix.includes('X')) suffixPlatings.add('Επίχρυσο');
             else if (v.suffix.includes('H')) suffixPlatings.add('Επιπλατινωμένο');
             else if (v.suffix.includes('D')) suffixPlatings.add('Δίχρωμο');
             else if (v.suffix.includes('P')) suffixPlatings.add('Πατίνα');
             else if (v.suffix === '') suffixPlatings.add('Λουστρέ');
          });
          if (suffixPlatings.size > 0) return Array.from(suffixPlatings).join(', ');
      }
      return PLATING_LABELS[product.plating_type] || product.plating_type;
  }, [product, variants]);

  const skuText = `${product.sku}${activeVariantForBarcode?.suffix || ''}`;

  // SHARED FUNCTION: Handle the actual share API call
  const shareFile = async (blob: Blob, filename: string) => {
      const file = new File([blob], filename, { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
          try {
              await navigator.share({
                  files: [file],
                  // No text/title to keep it clean (just image)
              });
          } catch (shareErr: any) {
              if (shareErr.name !== 'AbortError') throw shareErr;
          }
      } else {
          const link = document.createElement('a');
          link.href = URL.createObjectURL(blob);
          link.download = filename;
          link.click();
          showToast("Η εικόνα αποθηκεύτηκε.", "success");
      }
  };

  // --- 1. SHARE QR ONLY ---
  const handleShareQr = async () => {
      setIsSharing(true);
      try {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          if (!ctx) throw new Error("Canvas init failed");

          const size = 600;
          canvas.width = size;
          canvas.height = size;

          // Background
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, size, size);

          // QR Code
          const qrUrl = await QRCode.toDataURL(skuText, { margin: 1, width: 400, color: { dark: '#000000', light: '#FFFFFF' } });
          const qrImg = new Image();
          await new Promise(resolve => { qrImg.onload = resolve; qrImg.src = qrUrl; });
          
          // Draw QR Centered slightly up
          ctx.drawImage(qrImg, (size - 400) / 2, 50, 400, 400);

          // Draw SKU Text
          ctx.fillStyle = '#0F172A';
          ctx.font = 'bold 40px Inter, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(skuText, size / 2, 500);
          
          // Branding
          ctx.fillStyle = '#94A3B8';
          ctx.font = 'bold 20px Inter, sans-serif';
          ctx.fillText("ILIOS KOSMIMA", size / 2, 540);

          const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
          if (blob) await shareFile(blob, `QR_${skuText}.png`);

      } catch (err: any) {
          console.error(err);
          showToast(`Σφάλμα: ${err.message}`, "error");
      } finally {
          setIsSharing(false);
      }
  };

  // --- 2. SHARE RICH CARD (CORS FIXED) ---
  const handleShareCard = async () => {
      setIsSharing(true);
      try {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          if (!ctx) throw new Error("Canvas init failed");

          const width = 1080;
          const height = 1350; // Instagram Portrait Aspect
          canvas.width = width;
          canvas.height = height;

          // 1. Clean Background
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, width, height);

          // 2. Draw Image (via Proxy)
          if (product.image_url) {
              const img = new Image();
              img.crossOrigin = "Anonymous"; // Crucial for CORS
              
              // CORS FIX: Use Worker URL if it's an R2 URL
              let src = product.image_url;
              if (src.includes('r2.dev')) {
                  const filename = src.split('/').pop();
                  if (filename) {
                      src = `${CLOUDFLARE_WORKER_URL}/${filename}`; // Proxy through Worker
                  }
              }
              // Cache buster to ensure fresh fetch
              src += (src.includes('?') ? '&' : '?') + `t=${Date.now()}`;

              try {
                  await new Promise<void>((resolve, reject) => {
                      img.onload = () => resolve();
                      img.onerror = () => { console.warn("Image load failed"); resolve(); }; // Resolve to continue without image
                      img.src = src;
                  });

                  if (img.complete && img.naturalWidth > 0) {
                      // Image Area (Top ~65%)
                      const imgAreaHeight = 900;
                      
                      // Draw Image Cover style
                      const scale = Math.max(width / img.naturalWidth, imgAreaHeight / img.naturalHeight);
                      const x = (width / 2) - (img.naturalWidth / 2) * scale;
                      const y = (imgAreaHeight / 2) - (img.naturalHeight / 2) * scale;

                      ctx.save();
                      ctx.beginPath();
                      ctx.rect(0, 0, width, imgAreaHeight);
                      ctx.clip();
                      ctx.drawImage(img, x, y, img.naturalWidth * scale, img.naturalHeight * scale);
                      
                      // Slight gradient at bottom of image for text readability overlap
                      const gradient = ctx.createLinearGradient(0, imgAreaHeight - 200, 0, imgAreaHeight);
                      gradient.addColorStop(0, "rgba(255,255,255,0)");
                      gradient.addColorStop(1, "rgba(255,255,255,1)");
                      ctx.fillStyle = gradient;
                      ctx.fillRect(0, imgAreaHeight - 200, width, 200);
                      
                      ctx.restore();
                  }
              } catch (e) {
                  console.warn("Canvas image error", e);
              }
          } else {
              // Placeholder if no image
              ctx.fillStyle = '#F1F5F9';
              ctx.fillRect(0, 0, width, 900);
              ctx.fillStyle = '#CBD5E1';
              ctx.font = 'bold 100px Inter, sans-serif';
              ctx.textAlign = 'center';
              ctx.fillText("NO IMAGE", width/2, 450);
          }

          // 3. Info Card Area (Bottom)
          const infoTop = 900;
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, infoTop, width, height - infoTop);

          // SKU
          ctx.textAlign = 'left';
          ctx.fillStyle = '#0F172A'; // Slate-900
          ctx.font = '900 80px Inter, sans-serif';
          ctx.fillText(skuText, 60, infoTop + 100);

          // Category & Desc
          ctx.fillStyle = '#64748B'; // Slate-500
          ctx.font = '500 40px Inter, sans-serif';
          ctx.fillText(product.category, 60, infoTop + 160);
          
          if (activeVariantForBarcode?.description) {
              ctx.fillStyle = '#334155';
              ctx.font = 'italic 36px Inter, sans-serif';
              ctx.fillText(activeVariantForBarcode.description, 60, infoTop + 220);
          }

          // Price Badge
          const price = activeVariantForBarcode?.selling_price || product.selling_price;
          if (price > 0) {
              const priceText = formatCurrency(price);
              ctx.font = '900 70px Inter, sans-serif';
              const metrics = ctx.measureText(priceText);
              
              // Badge background
              ctx.fillStyle = '#ECFDF5'; // Emerald-50
              ctx.beginPath();
              ctx.roundRect(width - metrics.width - 100, infoTop + 40, metrics.width + 40, 90, 20);
              ctx.fill();
              
              ctx.fillStyle = '#059669'; // Emerald-600
              ctx.fillText(priceText, width - metrics.width - 80, infoTop + 110);
          }

          // 4. Footer & QR
          // Generate QR
          const qrUrl = await QRCode.toDataURL(skuText, { margin: 0, width: 200, color: { dark: '#0F172A', light: '#FFFFFF' } });
          const qrImg = new Image();
          await new Promise(resolve => { qrImg.onload = resolve; qrImg.src = qrUrl; });
          
          // Draw QR at bottom right
          ctx.drawImage(qrImg, width - 260, height - 260, 200, 200);

          // Brand Watermark
          ctx.fillStyle = '#94A3B8';
          ctx.font = 'bold 30px Inter, sans-serif';
          ctx.fillText("ILIOS KOSMIMA", 60, height - 60);
          
          // Convert & Share
          const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
          if (blob) await shareFile(blob, `${skuText}_card.png`);

      } catch (err: any) {
          console.error(err);
          showToast(`Σφάλμα: ${err.message}`, "error");
      } finally {
          setIsSharing(false);
      }
  };

  const cycleVariant = (direction: 'next' | 'prev') => {
      if (variants.length === 0) return;
      const currentIndex = activeVariantForBarcode 
        ? variants.findIndex(v => v.suffix === activeVariantForBarcode.suffix) 
        : 0;
      let newIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1;
      if (newIndex >= variants.length) newIndex = 0;
      if (newIndex < 0) newIndex = variants.length - 1;
      setActiveVariantForBarcode(variants[newIndex]);
  };

  return (
    <div className="fixed inset-0 z-[100] bg-slate-50 flex flex-col animate-in slide-in-from-bottom-full duration-300">
      
      {/* Header / Image Area */}
      <div className="relative h-80 bg-slate-200 shrink-0 group">
        {product.image_url ? (
            <img 
                src={product.image_url} 
                className="w-full h-full object-cover cursor-pointer" 
                alt={product.sku} 
                onClick={() => setShowFullImage(true)}
            />
        ) : (
            <div className="w-full h-full flex items-center justify-center text-slate-400 font-bold bg-slate-100">
                ΧΩΡΙΣ ΕΙΚΟΝΑ
            </div>
        )}
        
        {product.image_url && (
            <button 
                onClick={() => setShowFullImage(true)}
                className="absolute bottom-4 right-4 p-2 bg-black/40 text-white rounded-full backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity"
            >
                <Maximize2 size={16}/>
            </button>
        )}

        {/* Top Actions */}
        <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-start bg-gradient-to-b from-black/40 to-transparent">
            <button onClick={onClose} className="p-2 bg-white/20 backdrop-blur-md rounded-full text-white hover:bg-white/30 transition-colors shadow-lg active:scale-95">
                <X size={20} />
            </button>
            <div className="flex gap-2">
                <button onClick={() => setShowBarcode(true)} className="p-2 bg-white text-slate-900 rounded-full hover:bg-slate-100 transition-colors shadow-lg active:scale-95">
                    <QrCode size={20} />
                </button>
            </div>
        </div>

        {/* Title Overlay */}
        <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-slate-900/90 via-slate-900/50 to-transparent pt-12">
            <div className="flex justify-between items-end">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <span className="bg-white/20 backdrop-blur-md text-white text-[10px] font-bold px-2 py-0.5 rounded border border-white/10 uppercase tracking-wide">
                            {product.category}
                        </span>
                        {product.is_component && <span className="bg-blue-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">STX</span>}
                    </div>
                    <h1 className="text-3xl font-black text-white tracking-tight leading-none">{product.sku}</h1>
                </div>
                {product.production_type === 'Imported' && (
                    <div className="text-purple-300 flex flex-col items-end">
                        <Globe size={16} className="mb-1"/>
                        <span className="text-[9px] font-black uppercase tracking-widest border border-purple-400/50 rounded px-1.5">ΕΙΣΑΓΩΓΗ</span>
                    </div>
                )}
            </div>
        </div>
      </div>

      {/* Content Scrollable */}
      <div className="flex-1 overflow-y-auto p-5 space-y-6 bg-slate-50">
          
          {/* Main Stats Cards */}
          <div className="grid grid-cols-2 gap-3">
              {/* INTERACTIVE PRICE CARD */}
              <div className="bg-white p-2.5 rounded-2xl border border-slate-100 shadow-sm flex flex-col items-center text-center relative overflow-hidden">
                  <div className="text-slate-400 text-[10px] font-black uppercase mb-1 flex items-center gap-1 justify-center w-full">
                      <DollarSign size={10}/> Τιμή Χονδρικής
                  </div>
                  
                  <div className="flex items-center justify-between w-full mt-1">
                      {priceOptions.length > 1 && (
                          <button onClick={prevPrice} className="p-1.5 hover:bg-slate-50 text-slate-400 rounded-lg active:scale-95 transition-all">
                              <ChevronLeft size={18}/>
                          </button>
                      )}
                      
                      <div className="flex flex-col items-center justify-center flex-1">
                          <div className="text-xl font-black text-slate-800 tracking-tight truncate">
                              {currentPriceObj.price > 0 ? formatCurrency(currentPriceObj.price) : '-'}
                          </div>
                          {priceOptions.length > 1 && (
                              <div className="text-[10px] font-bold text-white bg-slate-800 px-1.5 py-0.5 rounded uppercase mt-0.5 tracking-wide">
                                  {currentPriceObj.label}
                              </div>
                          )}
                      </div>

                      {priceOptions.length > 1 && (
                          <button onClick={nextPrice} className="p-1.5 hover:bg-slate-50 text-slate-400 rounded-lg active:scale-95 transition-all">
                              <ChevronRight size={18}/>
                          </button>
                      )}
                  </div>
              </div>

              <div className="bg-white p-2.5 rounded-2xl border border-slate-100 shadow-sm flex flex-col items-center text-center justify-center">
                  <div className="text-slate-400 text-[10px] font-black uppercase mb-1 flex items-center gap-1"><Weight size={10}/> Βάρος (g)</div>
                  <div className="text-xl font-black text-slate-800 tracking-tight">{product.weight_g.toFixed(2)}</div>
              </div>
          </div>

          {/* Variants List */}
          {variants.length > 0 && (
              <div className="space-y-3">
                  <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest ml-2">Λίστα Παραλλαγών ({variants.length})</h3>
                  <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                      {variants.map((v, idx) => (
                          <div 
                            key={idx} 
                            onClick={() => { setActiveVariantForBarcode(v); setShowBarcode(true); }}
                            className="flex justify-between items-center p-4 border-b border-slate-50 last:border-0 active:bg-slate-50 transition-colors cursor-pointer"
                          >
                              <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center font-mono font-bold text-xs text-slate-600 border border-slate-200">
                                      {v.suffix || 'ΒΑΣ'}
                                  </div>
                                  <div>
                                      <div className="font-bold text-slate-800 text-sm">{v.description || 'Βασικό'}</div>
                                      <div className="text-[10px] text-slate-400 font-medium">
                                          Απόθεμα: <span className="text-slate-700 font-bold">{v.stock_qty}</span>
                                          {v.stock_by_size && Object.keys(v.stock_by_size).length > 0 && ` • Μεγέθη: ${Object.keys(v.stock_by_size).join(',')}`}
                                      </div>
                                  </div>
                              </div>
                              <div className="text-right">
                                  {v.selling_price && v.selling_price > 0 ? (
                                      <div className="text-sm font-black text-emerald-600">{formatCurrency(v.selling_price)}</div>
                                  ) : <span className="text-xs text-slate-300">-</span>}
                              </div>
                          </div>
                      ))}
                  </div>
              </div>
          )}

          {/* Stock Locations */}
          <div className="space-y-3">
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest ml-2">Αποθέματα (Master)</h3>
              <div className="grid grid-cols-2 gap-3">
                  <div className="bg-white p-3 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-3">
                      <div className="bg-slate-100 p-2 rounded-xl text-slate-500"><MapPin size={16}/></div>
                      <div>
                          <div className="text-[10px] font-bold text-slate-400 uppercase">Κεντρική</div>
                          <div className="text-lg font-black text-slate-800">{product.stock_qty}</div>
                      </div>
                  </div>
                  <div className="bg-white p-3 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-3">
                      <div className="bg-purple-50 p-2 rounded-xl text-purple-600"><Scan size={16}/></div>
                      <div>
                          <div className="text-[10px] font-bold text-purple-400 uppercase">Δειγμ/γιο</div>
                          <div className="text-lg font-black text-purple-700">{product.sample_qty}</div>
                      </div>
                  </div>
                  {/* Other Locations */}
                  {product.location_stock && Object.entries(product.location_stock).map(([whId, qty]) => {
                      if (whId === SYSTEM_IDS.CENTRAL || whId === SYSTEM_IDS.SHOWROOM) return null;
                      const whName = warehouses.find(w => w.id === whId)?.name || 'Άλλο';
                      return (
                        <div key={whId} className="bg-white p-3 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-3">
                            <div className="bg-blue-50 p-2 rounded-xl text-blue-600"><MapPin size={16}/></div>
                            <div className="min-w-0">
                                <div className="text-[10px] font-bold text-blue-400 uppercase truncate">{whName}</div>
                                <div className="text-lg font-black text-blue-700">{qty}</div>
                            </div>
                        </div>
                      );
                  })}
              </div>
          </div>

          <div className="bg-slate-100 p-4 rounded-2xl text-xs text-slate-500 space-y-2 border border-slate-200/60">
              <div className="flex justify-between"><span>Επιμετάλλωση:</span> <span className="font-bold text-slate-700">{displayPlating}</span></div>
              <div className="flex justify-between"><span>Φύλο:</span> <span className="font-bold text-slate-700">{displayGender}</span></div>
              {product.secondary_weight_g ? <div className="flex justify-between"><span>Β' Βάρος:</span> <span className="font-bold text-slate-700">{product.secondary_weight_g}g</span></div> : null}
          </div>
          
          <div className="h-12"></div>
      </div>

      {/* FULL SCREEN IMAGE MODAL */}
      {showFullImage && product.image_url && (
          <div className="fixed inset-0 z-[120] bg-black flex items-center justify-center p-0 animate-in fade-in duration-200" onClick={() => setShowFullImage(false)}>
              <img src={product.image_url} className="max-w-full max-h-full object-contain" alt="Full" />
              <button className="absolute top-4 right-4 text-white p-2 bg-white/20 rounded-full"><X size={24}/></button>
          </div>
      )}

      {/* DIGITAL LABEL (QR) MODAL */}
      {showBarcode && (
          <div className="fixed inset-0 z-[110] bg-slate-900/90 backdrop-blur-md flex flex-col items-center justify-center p-6 animate-in fade-in duration-200">
              <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden relative">
                  <button onClick={() => setShowBarcode(false)} className="absolute top-4 right-4 p-2 bg-slate-100 text-slate-500 rounded-full hover:bg-slate-200 z-10"><X size={20}/></button>
                  
                  <div className="p-8 pb-4 flex flex-col items-center">
                      <div className="text-center mb-6">
                          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Ψηφιακή Ετικέτα</h3>
                          <div className="text-2xl font-black text-slate-900">
                              {product.sku}{activeVariantForBarcode?.suffix}
                          </div>
                          <div className="text-sm font-medium text-emerald-600 mt-1">
                              {activeVariantForBarcode?.description || 'Βασικό'}
                          </div>
                      </div>

                      {/* Barcode Render */}
                      <div className="bg-white p-4 border-2 border-slate-900 rounded-xl w-full flex justify-center">
                          <BarcodeView 
                              product={product}
                              variant={activeVariantForBarcode || undefined}
                              width={70} 
                              height={35}
                              format="standard"
                          />
                      </div>
                      
                      <div className="mt-6 flex items-center justify-center gap-2 text-slate-400 text-xs animate-pulse">
                          <Scan size={14}/> Έτοιμο για Σάρωση
                      </div>
                  </div>

                  {/* Variant Switcher */}
                  {variants.length > 0 && (
                      <div className="bg-slate-50 p-4 border-t border-slate-100 flex items-center justify-between">
                          <button onClick={() => cycleVariant('prev')} className="p-3 bg-white border border-slate-200 rounded-xl text-slate-500 active:bg-slate-100"><ChevronLeft size={20}/></button>
                          
                          <div className="text-center">
                              <div className="text-[10px] font-bold text-slate-400 uppercase">ΠΑΡΑΛΛΑΓΗ</div>
                              <div className="font-black text-slate-800">{activeVariantForBarcode?.suffix || 'ΒΑΣ'}</div>
                          </div>

                          <button onClick={() => cycleVariant('next')} className="p-3 bg-white border border-slate-200 rounded-xl text-slate-500 active:bg-slate-100"><ChevronRight size={20}/></button>
                      </div>
                  )}
              </div>
              
              <div className="mt-6 flex gap-3 w-full max-w-sm">
                  <button 
                    onClick={handleShareQr} 
                    disabled={isSharing}
                    className="flex-1 flex flex-col items-center justify-center gap-1 bg-white/10 text-white p-3 rounded-2xl hover:bg-white/20 transition-all disabled:opacity-50"
                  >
                      {isSharing ? <Scan size={24} className="animate-spin"/> : <QrCode size={24}/>} 
                      <span className="text-[10px] font-bold">Μόνο QR</span>
                  </button>
                  <button 
                    onClick={handleShareCard} 
                    disabled={isSharing}
                    className="flex-1 flex flex-col items-center justify-center gap-1 bg-white text-slate-900 p-3 rounded-2xl hover:bg-slate-100 transition-all shadow-lg disabled:opacity-50"
                  >
                      {isSharing ? <Scan size={24} className="animate-spin text-slate-400"/> : <ImageIcon size={24}/>} 
                      <span className="text-[10px] font-bold">Κάρτα</span>
                  </button>
              </div>
          </div>
      )}

    </div>
  );
}
