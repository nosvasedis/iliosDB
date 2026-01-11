
import React, { useState, useMemo, useEffect } from 'react';
import { Product, ProductVariant, Warehouse, Gender, PlatingType } from '../../types';
import { X, MapPin, Weight, DollarSign, Globe, QrCode, Share2, Scan, ChevronLeft, ChevronRight, Maximize2, Tag } from 'lucide-react';
import { formatCurrency } from '../../utils/pricingEngine';
import { SYSTEM_IDS } from '../../lib/supabase';
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
  
  // Logic: If variants exist, start with the first one. If not, start with null (Master).
  const [activeVariantForBarcode, setActiveVariantForBarcode] = useState<ProductVariant | null>(
      variants.length > 0 ? variants[0] : null
  );

  // --- PRICE SWAPPER LOGIC ---
  const [priceIndex, setPriceIndex] = useState(0);

  // Build a list of price options. If variants exist, ignore master price.
  const priceOptions = useMemo(() => {
      if (variants.length > 0) {
          // Sort variants: P (Plain/Lustre) -> X (Gold) -> Others
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
              label: v.suffix || 'BAS', // BAS = Basic/Lustre
              desc: v.description
          }));
      }
      // Fallback to master if no variants
      return [{ 
          price: product.selling_price || 0, 
          label: 'MST', 
          desc: 'Master' 
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
  
  // Display Logic Helpers
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

  // Generates a rich image card for sharing
  const generateShareImage = async () => {
      setIsSharing(true);
      try {
          // 1. Create a canvas
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          if (!ctx) throw new Error("Canvas init failed");

          const width = 1080;
          const height = 1350; // Instagram Portrait Aspect
          canvas.width = width;
          canvas.height = height;

          // 2. Background
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, width, height);

          // 3. Draw Product Image
          if (product.image_url) {
              const img = new Image();
              // IMPORTANT: Allow Cross-Origin for Canvas Export
              img.crossOrigin = "Anonymous"; 
              
              try {
                  await new Promise<void>((resolve, reject) => {
                      img.onload = () => resolve();
                      img.onerror = () => {
                          console.warn("Image load failed (likely CORS), skipping draw.");
                          // Resolve anyway to continue drawing the card without the image
                          resolve(); 
                      };
                      // Cache buster to bypass browser cache which might not have CORS headers
                      img.src = `${product.image_url}?t=${new Date().getTime()}`;
                  });
                  
                  if (img.complete && img.naturalWidth > 0) {
                      // Scale to fit top area (square-ish)
                      const imgHeight = 800;
                      const scale = Math.max(width / img.width, imgHeight / img.height);
                      const x = (width / 2) - (img.width / 2) * scale;
                      const y = (imgHeight / 2) - (img.height / 2) * scale;
                      
                      ctx.save();
                      ctx.beginPath();
                      ctx.rect(0, 0, width, imgHeight);
                      ctx.clip();
                      ctx.drawImage(img, x, y, img.width * scale, img.height * scale);
                      ctx.restore();
                  }
              } catch (imgErr) {
                  console.warn("Image processing error", imgErr);
              }
          }

          // 4. Draw Info Card Background
          ctx.fillStyle = '#F8FAFC'; // Slate-50
          ctx.fillRect(0, 800, width, height - 800);
          
          // 5. Text
          ctx.fillStyle = '#0F172A'; // Slate-900
          ctx.font = 'bold 60px Inter, sans-serif';
          const skuText = `${product.sku}${activeVariantForBarcode?.suffix || ''}`;
          ctx.fillText(skuText, 50, 900);

          ctx.fillStyle = '#64748B'; // Slate-500
          ctx.font = '40px Inter, sans-serif';
          ctx.fillText(product.category, 50, 960);
          
          if (activeVariantForBarcode?.description) {
              ctx.font = 'italic 36px Inter, sans-serif';
              ctx.fillText(activeVariantForBarcode.description, 50, 1020);
          }

          const price = activeVariantForBarcode?.selling_price || product.selling_price;
          if (price > 0) {
              ctx.fillStyle = '#059669'; // Emerald-600
              ctx.font = 'bold 80px Inter, sans-serif';
              ctx.fillText(formatCurrency(price), width - 350, 920);
          }

          // 6. Generate QR
          const qrUrl = await QRCode.toDataURL(skuText, { margin: 1, width: 250, color: { dark: '#000000', light: '#FFFFFF' } });
          const qrImg = new Image();
          await new Promise(resolve => {
              qrImg.onload = resolve;
              qrImg.src = qrUrl;
          });
          ctx.drawImage(qrImg, width - 300, 1050, 250, 250);

          // 7. Footer Branding
          ctx.fillStyle = '#94A3B8';
          ctx.font = 'bold 24px Inter, sans-serif';
          ctx.fillText("ILIOS KOSMIMA ERP", 50, 1300);

          // 8. Convert to Blob (Promisified for safety)
          const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
          
          if (!blob) throw new Error("Canvas to Blob failed");

          const file = new File([blob], `${skuText}.png`, { type: 'image/png' });
          
          if (navigator.canShare && navigator.canShare({ files: [file] })) {
              try {
                  await navigator.share({
                      files: [file],
                      title: skuText,
                      text: `Check out ${skuText}`
                  });
              } catch (shareErr: any) {
                  if (shareErr.name === 'AbortError') {
                      // User cancelled share, do nothing
                      return;
                  }
                  throw shareErr;
              }
          } else {
              // Fallback: Download
              const link = document.createElement('a');
              link.href = URL.createObjectURL(blob);
              link.download = `${skuText}.png`;
              link.click();
              showToast("Η εικόνα αποθηκεύτηκε.", "success");
          }

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
                NO IMAGE
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
                <button onClick={generateShareImage} disabled={isSharing} className="p-2 bg-white/20 backdrop-blur-md rounded-full text-white hover:bg-white/30 transition-colors shadow-lg active:scale-95 disabled:opacity-50">
                    <Share2 size={20} />
                </button>
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
                        <span className="text-[9px] font-black uppercase tracking-widest border border-purple-400/50 rounded px-1.5">Import</span>
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
                                      {v.suffix || 'BAS'}
                                  </div>
                                  <div>
                                      <div className="font-bold text-slate-800 text-sm">{v.description || 'Βασικό'}</div>
                                      <div className="text-[10px] text-slate-400 font-medium">
                                          Stock: <span className="text-slate-700 font-bold">{v.stock_qty}</span>
                                          {v.stock_by_size && Object.keys(v.stock_by_size).length > 0 && ` • Sizes: ${Object.keys(v.stock_by_size).join(',')}`}
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
                          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Digital Label</h3>
                          <div className="text-2xl font-black text-slate-900">
                              {product.sku}{activeVariantForBarcode?.suffix}
                          </div>
                          <div className="text-sm font-medium text-emerald-600 mt-1">
                              {activeVariantForBarcode?.description || 'Basic'}
                          </div>
                      </div>

                      {/* Barcode Render */}
                      <div className="bg-white p-4 border-2 border-slate-900 rounded-xl w-full flex justify-center">
                          <BarcodeView 
                              product={product}
                              variant={activeVariantForBarcode || undefined}
                              width={70} // Visual Width (mm equivalent)
                              height={35}
                              format="standard"
                          />
                      </div>
                      
                      <div className="mt-6 flex items-center justify-center gap-2 text-slate-400 text-xs animate-pulse">
                          <Scan size={14}/> Ready to Scan
                      </div>
                  </div>

                  {/* Variant Switcher */}
                  {variants.length > 0 && (
                      <div className="bg-slate-50 p-4 border-t border-slate-100 flex items-center justify-between">
                          <button onClick={() => cycleVariant('prev')} className="p-3 bg-white border border-slate-200 rounded-xl text-slate-500 active:bg-slate-100"><ChevronLeft size={20}/></button>
                          
                          <div className="text-center">
                              <div className="text-[10px] font-bold text-slate-400 uppercase">ΠΑΡΑΛΛΑΓΗ</div>
                              <div className="font-black text-slate-800">{activeVariantForBarcode?.suffix || 'BAS'}</div>
                          </div>

                          <button onClick={() => cycleVariant('next')} className="p-3 bg-white border border-slate-200 rounded-xl text-slate-500 active:bg-slate-100"><ChevronRight size={20}/></button>
                      </div>
                  )}
              </div>
              <div className="mt-6">
                  <button 
                    onClick={generateShareImage} 
                    disabled={isSharing}
                    className="flex items-center gap-2 text-white/80 font-bold bg-white/10 px-6 py-3 rounded-full hover:bg-white/20 transition-all disabled:opacity-50"
                  >
                      {isSharing ? <Scan size={18} className="animate-spin"/> : <Share2 size={18}/>} 
                      {isSharing ? 'Δημιουργία...' : 'Κοινοποίηση Ετικέτας'}
                  </button>
              </div>
          </div>
      )}

    </div>
  );
}
