
import React, { useState, useEffect, useMemo } from 'react';
import { Product, Material, RecipeItem, LaborCost, ProductVariant, Gender, GlobalSettings, Collection } from '../types';
import { calculateProductCost, calculateTechnicianCost, analyzeSku, analyzeSuffix } from '../utils/pricingEngine';
import { FINISH_CODES } from '../constants'; 
import { X, Save, Printer, Box, Gem, Hammer, MapPin, Copy, Trash2, Plus, Info, Wand2, TrendingUp, Camera, Loader2, Upload, History, AlertTriangle, FolderKanban, CheckCircle, RefreshCcw, Tag, ImageIcon, Coins, Lock, Unlock, Calculator, Percent } from 'lucide-react';
import { uploadProductImage, supabase, deleteProduct } from '../lib/supabase';
import { compressImage } from '../utils/imageHelpers';
import { useQueryClient } from '@tanstack/react-query';
import { useUI } from './UIProvider';

interface PrintModalProps {
    product: Product;
    onClose: () => void;
    onPrint: (items: { product: Product, variant?: ProductVariant, quantity: number }[]) => void;
}

const PrintModal: React.FC<PrintModalProps> = ({ product, onClose, onPrint }) => {
    const allVariants = [{ suffix: '(Master)', description: 'Βασικό Προϊόν', stock_qty: product.stock_qty }, ...(product.variants || [])];
    
    const [quantities, setQuantities] = useState<Record<string, number>>(
        allVariants.reduce((acc, v) => ({ ...acc, [v.suffix]: 0 }), {})
    );

    React.useEffect(() => {
        if (!product.variants || product.variants.length === 0) {
            setQuantities(prev => ({...prev, '(Master)': 1}));
        }
    }, [product]);

    const handleQuantityChange = (suffix: string, qty: number) => {
        setQuantities(prev => ({ ...prev, [suffix]: Math.max(0, qty) }));
    };

    const handlePrint = () => {
        const itemsToPrint: { product: Product, variant?: ProductVariant, quantity: number }[] = [];
        for (const suffix in quantities) {
            const qty = quantities[suffix];
            if (qty > 0) {
                const variant = suffix === '(Master)' ? undefined : product.variants?.find(v => v.suffix === suffix);
                itemsToPrint.push({ product, variant, quantity: qty });
            }
        }
        
        if (itemsToPrint.length > 0) {
            onPrint(itemsToPrint);
            setTimeout(() => {
                onClose(); 
            }, 500);
        }
    };

    return (
        <div className="fixed inset-0 z-[150] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-lg relative animate-in zoom-in-95 duration-200 border border-slate-100">
                <button onClick={onClose} className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-full transition-all">
                    <X size={20} />
                </button>
                <h2 className="text-xl font-bold mb-1 text-slate-800">Εκτύπωση Ετικετών</h2>
                <p className="text-sm text-slate-500 mb-6 font-medium">{product.sku}</p>
                
                <div className="max-h-72 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                    {allVariants.map((v) => (
                        <div key={v.suffix} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                            <div>
                                <span className="font-mono font-bold text-slate-800">{product.sku}{v.suffix !== '(Master)' ? v.suffix : ''}</span>
                                <span className="text-xs text-slate-500 ml-2 font-medium">{v.description}</span>
                            </div>
                            <input
                                type="number"
                                min="0"
                                value={quantities[v.suffix]}
                                onChange={(e) => handleQuantityChange(v.suffix, parseInt(e.target.value) || 0)}
                                className="w-20 p-2 border border-slate-200 rounded-lg text-center bg-white text-slate-900 focus:ring-2 focus:ring-amber-500 outline-none font-bold"
                            />
                        </div>
                    ))}
                </div>
                
                <button onClick={handlePrint} className="mt-6 w-full bg-slate-900 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-slate-800 transition-colors shadow-lg shadow-slate-200">
                    <Printer size={18} /> Εκτύπωση
                </button>
            </div>
      </div>
    );
};

interface Props {
  product: Product;
  allProducts: Product[];
  allMaterials: Material[];
  onClose: () => void;
  onSave?: (updatedProduct: Product) => void;
  setPrintItems: (items: { product: Product; variant?: ProductVariant; quantity: number }[]) => void;
  settings: GlobalSettings;
  collections: Collection[];
  viewMode?: 'registry' | 'warehouse'; // New prop
}

export default function ProductDetails({ product, allProducts, allMaterials, onClose, onSave, setPrintItems, settings, collections, viewMode = 'registry' }: Props) {
  const queryClient = useQueryClient();
  const { showToast, confirm } = useUI();
  
  const [activeTab, setActiveTab] = useState<'overview' | 'recipe' | 'labor' | 'variants'>('overview');
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  
  const [editedProduct, setEditedProduct] = useState<Product>({ 
      ...product,
      variants: product.variants || [],
      selling_price: product.selling_price || 0,
      molds: product.molds || [],
      collections: product.collections || []
  });
  
  // Smart Reprice State
  const [showRepriceTool, setShowRepriceTool] = useState(false);
  const [targetMargin, setTargetMargin] = useState(50);
  const [calculatedPrice, setCalculatedPrice] = useState(0);

  useEffect(() => {
    setEditedProduct({ 
      ...product,
      variants: product.variants || [],
      selling_price: product.selling_price || 0,
      molds: product.molds || [],
      collections: product.collections || []
    });
  }, [product]);

  const [isUploadingImage, setIsUploadingImage] = useState(false);
  
  // Variant form states
  const [smartAddSku, setSmartAddSku] = useState('');
  const [newVariantSuffix, setNewVariantSuffix] = useState('');
  const [newVariantDesc, setNewVariantDesc] = useState('');
  const [manualSuffixAnalysis, setManualSuffixAnalysis] = useState<string | null>(null);

  // Auto-recalculate technician cost if weight changes and override is OFF
  useEffect(() => {
    if (!editedProduct.labor.technician_cost_manual_override) {
        const techCost = calculateTechnicianCost(editedProduct.weight_g);
        setEditedProduct(prev => ({
            ...prev,
            labor: { ...prev.labor, technician_cost: techCost }
        }));
    }
  }, [editedProduct.weight_g, editedProduct.labor.technician_cost_manual_override]);

  // Smart Suffix Analysis for Manual Add
  useEffect(() => {
    if (newVariantSuffix) {
        const desc = analyzeSuffix(newVariantSuffix);
        setManualSuffixAnalysis(desc);
        // Auto-populate description if it's empty and we found a match
        if (desc && !newVariantDesc) {
            setNewVariantDesc(desc);
        }
    } else {
        setManualSuffixAnalysis(null);
    }
  }, [newVariantSuffix, newVariantDesc]);

  // --- Smart Plating Logic ---
  const displayPlating = React.useMemo(() => {
      // 1. If no variants, fallback to master Plating
      if (!editedProduct.variants || editedProduct.variants.length === 0) {
          return editedProduct.plating_type;
      }

      // 2. Collect unique finishes from variants
      const finishes = new Set<string>();
      
      // Analyze suffix of each variant
      editedProduct.variants.forEach(v => {
          const suffix = v.suffix;
          // Check against known finish codes (P, X, D, H)
          Object.keys(FINISH_CODES).forEach(code => {
              // Only check valid non-empty codes.
              // Suffix could be "PKR". P is in codes.
              if (code && suffix.includes(code)) {
                  finishes.add(FINISH_CODES[code]);
              }
          });
      });

      if (finishes.size === 0) return editedProduct.plating_type;
      return Array.from(finishes).join(', ');
  }, [editedProduct.variants, editedProduct.plating_type]);

  const cost = calculateProductCost(editedProduct, settings, allMaterials, allProducts);
  
  const lossMultiplier = 1 + (settings.loss_percentage / 100);
  const silverTotalCost = editedProduct.weight_g * (settings.silver_price_gram * lossMultiplier);

  // Profit & Margin Calc
  const profit = editedProduct.selling_price - cost.total;
  const margin = editedProduct.selling_price > 0 ? (profit / editedProduct.selling_price) * 100 : 0;

  // Reprice Logic
  const updateCalculatedPrice = (marginPercent: number) => {
       const marginDecimal = marginPercent / 100;
       if (marginDecimal >= 1) {
           setCalculatedPrice(0);
           return;
       }
       const price = cost.total / (1 - marginDecimal);
       setCalculatedPrice(price);
  };

  const applyReprice = async () => {
      if (calculatedPrice <= 0) return;
      
      const confirmed = await confirm({
          title: 'Ενημέρωση Τιμής',
          message: `Είστε σίγουροι ότι θέλετε να αλλάξετε την τιμή από ${editedProduct.selling_price.toFixed(2)}€ σε ${calculatedPrice.toFixed(2)}€;`,
          confirmText: 'Εφαρμογή'
      });

      if (confirmed) {
          setEditedProduct(prev => ({...prev, selling_price: parseFloat(calculatedPrice.toFixed(2))}));
          setShowRepriceTool(false);
          showToast('Η νέα τιμή εφαρμόστηκε. Πατήστε Αποθήκευση για οριστικοποίηση.', 'info');
      }
  };

  const handleSave = async () => {
    try {
        // Calculate latest cost to update snapshot
        const currentCost = calculateProductCost(editedProduct, settings, allMaterials, allProducts).total;

        // 1. Update Master Product
        await supabase.from('products').update({
            weight_g: editedProduct.weight_g,
            selling_price: editedProduct.selling_price,
            labor_casting: editedProduct.labor.casting_cost,
            labor_setter: editedProduct.labor.setter_cost,
            labor_technician: editedProduct.labor.technician_cost,
            labor_plating: editedProduct.labor.plating_cost,
            labor_technician_manual_override: editedProduct.labor.technician_cost_manual_override,
            active_price: currentCost, // UPDATING SNAPSHOT
            draft_price: currentCost   // UPDATING SNAPSHOT
        }).eq('sku', editedProduct.sku);

        // 2. Sync Variants (Upsert via delete-insert or intelligent upsert)
        await supabase.from('product_variants').delete().eq('product_sku', editedProduct.sku);
        if (editedProduct.variants && editedProduct.variants.length > 0) {
            const newVariantsForDB = editedProduct.variants.map(v => ({
                product_sku: editedProduct.sku,
                suffix: v.suffix,
                description: v.description,
                stock_qty: v.stock_qty || 0,
                active_price: v.active_price || null,
                selling_price: v.selling_price || null
            }));
            await supabase.from('product_variants').insert(newVariantsForDB);
        }
        
        await queryClient.refetchQueries({ queryKey: ['products'] });

        if (onSave) onSave(editedProduct);
        showToast("Οι αλλαγές αποθηκεύτηκαν.", "success");
        onClose();
    } catch (err: any) {
        showToast(`Σφάλμα αποθήκευσης: ${err.message}`, "error");
    }
  };

  const requestDelete = async () => {
      const confirmed = await confirm({
          title: 'Διαγραφή Προϊόντος',
          message: `Διαγραφή οριστικά ${editedProduct.sku}; Αυτή η ενέργεια θα διαγράψει και όλες τις παραλλαγές του.`,
          confirmText: 'Διαγραφή',
          isDestructive: true
      });
      if (!confirmed) return;
      setIsDeleting(true);
      const result = await deleteProduct(editedProduct.sku, editedProduct.image_url);
      
      if (result.success) {
          await queryClient.refetchQueries({ queryKey: ['products'] });
          onClose(); 
          showToast("Το προϊόν διαγράφηκε επιτυχώς.", "success");
      } else {
          showToast(`Σφάλμα: ${result.error}`, "error");
      }
      setIsDeleting(false);
  };

  const handleImageUpdate = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0]) {
          const file = e.target.files[0];
          setIsUploadingImage(true);
          try {
              const compressedBlob = await compressImage(file);
              const publicUrl = await uploadProductImage(compressedBlob, editedProduct.sku);
              if (publicUrl) {
                  setEditedProduct(prev => ({ ...prev, image_url: publicUrl }));
                  await supabase.from('products').update({ image_url: publicUrl }).eq('sku', editedProduct.sku);
                  queryClient.invalidateQueries({ queryKey: ['products'] });
                  showToast("Η φωτογραφία ενημερώθηκε.", "success");
              }
          } catch (error) {
              console.error(error);
              showToast("Σφάλμα κατά την ενημέρωση.", "error");
          } finally {
              setIsUploadingImage(false);
          }
      }
  };

  const handleSmartAdd = () => {
    const analysis = analyzeSku(smartAddSku);
    if (!analysis.isVariant || analysis.masterSku !== editedProduct.sku) {
      showToast('Μη έγκυρος κωδικός παραλλαγής για αυτό το προϊόν.', 'error');
      return;
    }
    if (editedProduct.variants.some(v => v.suffix === analysis.suffix)) {
      showToast('Αυτή η παραλλαγή υπάρχει ήδη.', 'info');
      return;
    }
    const newVariant: ProductVariant = {
      suffix: analysis.suffix,
      description: analysis.variantDescription,
      stock_qty: 0,
      active_price: null,
      selling_price: null
    };
    setEditedProduct(prev => ({ ...prev, variants: [...prev.variants, newVariant] }));
    setSmartAddSku('');
  };

  const handleManualAdd = () => {
      if (!newVariantSuffix) { showToast("Το Suffix είναι υποχρεωτικό.", 'error'); return; }
      if (editedProduct.variants.some(v => v.suffix === newVariantSuffix.toUpperCase())) { showToast('Αυτό το Suffix υπάρχει ήδη.', 'info'); return; }
      const newVariant: ProductVariant = {
        suffix: newVariantSuffix.toUpperCase(),
        description: newVariantDesc || manualSuffixAnalysis || '',
        stock_qty: 0,
        active_price: null,
        selling_price: null
      };
      setEditedProduct(prev => ({ ...prev, variants: [...prev.variants, newVariant] }));
      setNewVariantSuffix('');
      setNewVariantDesc('');
  };
  
  const updateVariant = (index: number, field: keyof ProductVariant, value: any) => {
      const newVariants = [...editedProduct.variants];
      newVariants[index] = { ...newVariants[index], [field]: value };
      setEditedProduct(prev => ({ ...prev, variants: newVariants }));
  };

  const deleteVariant = (index: number) => {
      setEditedProduct(prev => ({ ...prev, variants: prev.variants.filter((_, i) => i !== index) }));
  };
  
  return (
    <>
      <div className="fixed inset-0 bg-slate-900/30 backdrop-blur-sm z-[100] animate-in fade-in duration-200" onClick={onClose} />
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[101] w-full max-w-5xl h-[90vh] bg-slate-50 rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-300">
        
        {/* Header */}
        <header className="p-6 border-b border-slate-200 bg-white flex justify-between items-center shrink-0">
          <h2 className="text-xl font-bold text-slate-800">{editedProduct.sku}</h2>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowPrintModal(true)} className="px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-lg flex items-center gap-2 border border-slate-200"><Printer size={16}/> Εκτύπωση</button>
            <button onClick={requestDelete} disabled={isDeleting} className="p-2 text-slate-400 hover:bg-red-50 hover:text-red-500 rounded-lg">{isDeleting ? <Loader2 className="animate-spin"/> : <Trash2 size={16}/>}</button>
            <button onClick={handleSave} className="px-5 py-2 text-sm font-bold bg-slate-900 text-white rounded-lg flex items-center gap-2 hover:bg-slate-800 shadow-sm"><Save size={16}/> Αποθήκευση</button>
            <button onClick={onClose} className="p-2 text-slate-400 hover:bg-slate-100 rounded-lg"><X size={20}/></button>
          </div>
        </header>

        {/* Body */}
        <main className="flex-1 flex overflow-hidden">
          <div className="w-1/3 bg-white border-r border-slate-200 p-6 flex flex-col overflow-y-auto">
             <div className="w-full aspect-square rounded-2xl bg-slate-100 relative group overflow-hidden border border-slate-200 shadow-sm shrink-0">
                {editedProduct.image_url ? (
                    <img src={editedProduct.image_url} alt={editedProduct.sku} className="w-full h-full object-cover"/>
                ) : (
                    <div className="w-full h-full flex items-center justify-center">
                        <ImageIcon size={40} className="text-slate-300"/>
                    </div>
                )}
                <label className="absolute inset-0 bg-slate-900/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white cursor-pointer backdrop-blur-sm">
                    {isUploadingImage ? <Loader2 className="animate-spin"/> : <Camera/>}
                    <span className="text-sm font-bold mt-1">Αλλαγή Φωτογραφίας</span>
                    <input type="file" className="hidden" accept="image/*" onChange={handleImageUpdate}/>
                </label>
             </div>
             {viewMode === 'registry' && (
                <div className="w-full mt-6 space-y-4">
                    <div className="bg-slate-100 p-4 rounded-xl border border-slate-200 text-center">
                        <span className="text-xs font-bold text-slate-500 uppercase">Κόστος (Master)</span>
                        <p className="text-2xl font-black text-slate-800 mt-1">{cost.total.toFixed(2)}€</p>
                    </div>
                    <div className="bg-amber-50 p-4 rounded-xl border border-amber-200">
                        <div className="text-center relative">
                            <span className="text-xs font-bold text-amber-700 uppercase">Χονδρική (Master)</span>
                            <div className="flex items-center justify-center gap-2 mt-1">
                                <p className="text-2xl font-black text-amber-600">{editedProduct.selling_price > 0 ? editedProduct.selling_price.toFixed(2) + '€' : '-'}</p>
                                <button onClick={() => { setShowRepriceTool(!showRepriceTool); updateCalculatedPrice(targetMargin); }} className="bg-white p-1 rounded-full text-amber-600 hover:bg-amber-100 shadow-sm border border-amber-200"><Calculator size={14}/></button>
                            </div>
                            
                            {/* PROFIT & MARGIN DISPLAY */}
                            {editedProduct.selling_price > 0 && (
                                <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-amber-200/50">
                                    <div className="text-center">
                                        <div className="text-[9px] font-bold text-amber-800/60 uppercase">Κερδος</div>
                                        <div className="text-sm font-bold text-emerald-600">{profit.toFixed(2)}€</div>
                                    </div>
                                    <div className="text-center border-l border-amber-200/50">
                                        <div className="text-[9px] font-bold text-amber-800/60 uppercase">Margin</div>
                                        <div className="text-sm font-bold text-blue-600">{margin.toFixed(0)}%</div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* SMART REPRICE TOOL */}
                        {showRepriceTool && (
                            <div className="mt-4 pt-4 border-t border-amber-200 animate-in fade-in slide-in-from-top-2">
                                <label className="block text-[10px] font-bold text-amber-800 uppercase mb-1">Νεο Margin: {targetMargin}%</label>
                                <input 
                                    type="range" min="10" max="90" step="5" 
                                    value={targetMargin} 
                                    onChange={e => {
                                        const val = parseInt(e.target.value);
                                        setTargetMargin(val);
                                        updateCalculatedPrice(val);
                                    }}
                                    className="w-full accent-amber-600 mb-2 h-1.5 bg-amber-200 rounded-lg appearance-none cursor-pointer"
                                />
                                <div className="bg-white p-2 rounded-lg text-center border border-amber-100 mb-2">
                                    <span className="text-xs font-bold text-slate-500">Πρόταση:</span> 
                                    <span className="font-bold text-indigo-600 ml-1 text-sm">{calculatedPrice.toFixed(2)}€</span>
                                </div>
                                <button onClick={applyReprice} className="w-full bg-amber-600 text-white py-1.5 rounded-lg text-xs font-bold hover:bg-amber-700">Εφαρμογή</button>
                            </div>
                        )}
                    </div>
                </div>
             )}
          </div>

          <div className="flex-1 p-6 overflow-y-auto">
            <div className="flex gap-2 border-b border-slate-200 mb-6">
                <TabButton name="overview" label="Επισκόπηση" activeTab={activeTab} setActiveTab={setActiveTab} />
                {viewMode === 'registry' && <TabButton name="recipe" label="Συνταγή (BOM)" activeTab={activeTab} setActiveTab={setActiveTab} />}
                {viewMode === 'registry' && <TabButton name="labor" label="Εργατικά" activeTab={activeTab} setActiveTab={setActiveTab} />}
                <TabButton name="variants" label="Παραλλαγές & Τιμές" activeTab={activeTab} setActiveTab={setActiveTab} />
            </div>
            
            {activeTab === 'overview' && (
                <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-white p-4 rounded-xl border border-slate-200">
                            <label className="text-xs font-bold text-slate-400 uppercase tracking-wide">Βάρος</label>
                            <div className="flex items-baseline gap-2 mt-1">
                                <input 
                                    type="number"
                                    step="0.01"
                                    value={editedProduct.weight_g}
                                    onChange={e => setEditedProduct(prev => ({ ...prev, weight_g: parseFloat(e.target.value) || 0 }))}
                                    className="w-full bg-transparent font-bold text-slate-800 text-lg outline-none"
                                />
                                <span className="text-sm font-medium text-slate-500">g</span>
                            </div>
                        </div>
                        <InfoCard label="Κατηγορία" value={editedProduct.category} />
                        <InfoCard label="Φύλο" value={editedProduct.gender} />
                        {/* Enhanced Plating Display */}
                        <InfoCard label="Επιμετάλλωση" value={displayPlating} />
                    </div>
                </div>
            )}
            {activeTab === 'recipe' && viewMode === 'registry' && (
                <div className="space-y-3">
                   <div className="flex items-center gap-3 p-4 rounded-xl border bg-white border-slate-200 shadow-sm">
                       <div className="p-2 rounded-lg bg-slate-100 text-slate-600"><Coins size={20} /></div>
                       <div className="flex-1">
                           <label className="block text-[10px] text-slate-400 uppercase font-bold tracking-wider mb-1">Υλικό Βάσης</label>
                           <span className="font-bold text-slate-800">Ασήμι 925 (Βάση)</span>
                       </div>
                       <div className="text-right">
                           <div className="font-mono font-bold">{silverTotalCost.toFixed(2)}€</div>
                           <div className="text-xs text-slate-400">{editedProduct.weight_g}g @ {settings.silver_price_gram}€/g (+{settings.loss_percentage}%)</div>
                       </div>
                   </div>
                   {/* Full recipe items would be listed here if needed */}
                   {editedProduct.recipe.length === 0 && (
                       <div className="text-center italic text-slate-400 py-4 text-sm">
                           {/* Intentionally blank to avoid "Κενή Συνταγή" message when only silver exists */}
                       </div>
                   )}
                </div>
            )}
            {activeTab === 'labor' && viewMode === 'registry' && (
                <div className="grid grid-cols-2 gap-4">
                    <LaborInput label="Χύτευση" value={editedProduct.labor.casting_cost} onChange={val => setEditedProduct({...editedProduct, labor: {...editedProduct.labor, casting_cost: val}})} />
                    <LaborInput label="Καρφωτής" value={editedProduct.labor.setter_cost} onChange={val => setEditedProduct({...editedProduct, labor: {...editedProduct.labor, setter_cost: val}})} />
                    <LaborInput 
                        label="Τεχνίτης (Finishing)" 
                        value={editedProduct.labor.technician_cost} 
                        onChange={val => setEditedProduct({...editedProduct, labor: {...editedProduct.labor, technician_cost: val}})}
                        isOverridden={editedProduct.labor.technician_cost_manual_override}
                        onToggleOverride={() => setEditedProduct(prev => ({...prev, labor: {...prev.labor, technician_cost_manual_override: !prev.labor.technician_cost_manual_override}}))}
                    />
                    <LaborInput label="Επιμετάλλωση" value={editedProduct.labor.plating_cost} onChange={val => setEditedProduct({...editedProduct, labor: {...editedProduct.labor, plating_cost: val}})} />
                </div>
            )}
            {activeTab === 'variants' && (
              <div className="space-y-6">
                  {/* Quick Add Area */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                            <h4 className="font-bold text-sm text-slate-600 mb-2 flex items-center gap-2"><Wand2 size={16} className="text-indigo-500"/> Έξυπνη Προσθήκη</h4>
                            <div className="flex gap-2">
                                <input 
                                    type="text" 
                                    placeholder={`π.χ. ${editedProduct.sku}P`}
                                    value={smartAddSku} 
                                    onChange={e => setSmartAddSku(e.target.value.toUpperCase())}
                                    className="flex-1 p-2 border border-slate-200 rounded-lg font-mono text-sm uppercase"
                                />
                                <button onClick={handleSmartAdd} className="bg-indigo-500 text-white px-4 rounded-lg font-bold text-sm hover:bg-indigo-600 transition-colors">Προσθήκη</button>
                            </div>
                        </div>
                        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                            <h4 className="font-bold text-sm text-slate-600 mb-2">Χειροκίνητη Προσθήκη</h4>
                            <div className="flex gap-2">
                                <input type="text" placeholder="Suffix" value={newVariantSuffix} onChange={e => setNewVariantSuffix(e.target.value.toUpperCase())} className="w-20 p-2 border border-slate-200 rounded-lg font-mono text-sm uppercase"/>
                                <input type="text" placeholder="Περιγραφή" value={newVariantDesc} onChange={e => setNewVariantDesc(e.target.value)} className="flex-1 p-2 border border-slate-200 rounded-lg text-sm"/>
                                <button onClick={handleManualAdd} className="bg-slate-800 text-white px-4 rounded-lg font-bold text-sm hover:bg-slate-700 transition-colors"><Plus size={16}/></button>
                            </div>
                            {manualSuffixAnalysis && (
                                <div className="mt-2 text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded border border-blue-100 flex items-center gap-1">
                                    <Wand2 size={12}/> {manualSuffixAnalysis}
                                </div>
                            )}
                        </div>
                  </div>

                  {/* Variants List / Table */}
                  <div>
                      <h4 className="font-bold text-sm text-slate-600 mb-3 uppercase tracking-wide">Λίστα Παραλλαγών ({editedProduct.variants.length})</h4>
                      <div className="space-y-3">
                          {editedProduct.variants.map((variant, index) => {
                              const wholesale = variant.selling_price ?? editedProduct.selling_price;
                              const retail = wholesale * 3;
                              
                              // Check if price/cost is overridden to apply styling
                              const hasPriceOverride = variant.selling_price !== null;
                              const hasCostOverride = variant.active_price !== null;

                              return (
                              <div key={index} className="flex flex-col md:flex-row md:items-center gap-3 p-4 bg-white rounded-xl border border-slate-200 shadow-sm hover:border-indigo-300 transition-all">
                                <div className="flex items-center gap-3 w-full md:w-auto">
                                    <div className="font-mono font-bold text-lg text-indigo-600 w-16 text-center bg-indigo-50 rounded-lg py-2">{variant.suffix}</div>
                                    <input 
                                        type="text" 
                                        value={variant.description}
                                        onChange={e => updateVariant(index, 'description', e.target.value)}
                                        placeholder="Περιγραφή"
                                        className="flex-1 md:w-48 p-2 border border-slate-200 rounded-lg text-sm bg-white focus:border-indigo-500 outline-none"
                                    />
                                </div>
                                
                                <div className="flex items-center gap-2 flex-1 w-full border-t md:border-t-0 pt-3 md:pt-0 border-slate-100">
                                     {/* Override Price Inputs - Clean, Intuitive Styling */}
                                     <div className="flex flex-col w-1/2 md:w-auto relative group/cost">
                                        <label className="text-[10px] uppercase font-bold text-slate-400 mb-0.5">Κόστος</label>
                                        <input 
                                            type="number"
                                            step="0.01"
                                            placeholder={editedProduct.active_price.toFixed(2)}
                                            value={variant.active_price === null ? '' : variant.active_price}
                                            onChange={e => updateVariant(index, 'active_price', e.target.value === '' ? null : parseFloat(e.target.value))}
                                            className={`w-full p-2 border rounded-lg text-sm font-bold outline-none transition-colors 
                                                ${hasCostOverride 
                                                    ? 'border-amber-400 text-amber-700 bg-white ring-1 ring-amber-100' 
                                                    : 'border-slate-200 text-slate-700 bg-slate-50 focus:bg-white focus:border-indigo-500'}
                                            `}
                                        />
                                     </div>
                                     <div className="flex flex-col w-1/2 md:w-auto relative group/price">
                                        <label className="text-[10px] uppercase font-bold text-slate-400 mb-0.5">Χονδρική</label>
                                        <input 
                                            type="number"
                                            step="0.01"
                                            placeholder={editedProduct.selling_price.toFixed(2)}
                                            value={variant.selling_price === null ? '' : variant.selling_price}
                                            onChange={e => updateVariant(index, 'selling_price', e.target.value === '' ? null : parseFloat(e.target.value))}
                                            className={`w-full p-2 border rounded-lg text-sm font-bold outline-none transition-colors 
                                                ${hasPriceOverride 
                                                    ? 'border-emerald-500 text-emerald-700 bg-white ring-1 ring-emerald-100' 
                                                    : 'border-slate-200 text-slate-700 bg-slate-50 focus:bg-white focus:border-indigo-500'}
                                            `}
                                        />
                                        <div className="absolute top-full left-0 w-full mt-1 text-[9px] text-slate-400 font-medium whitespace-nowrap opacity-0 group-focus-within/price:opacity-100 transition-opacity">
                                            Λιανική: <span className="text-slate-600 font-bold">{retail.toFixed(2)}€</span>
                                        </div>
                                     </div>
                                     
                                     <button onClick={() => deleteVariant(index)} className="ml-auto md:ml-2 p-2.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors mt-auto">
                                         <Trash2 size={18}/>
                                     </button>
                                </div>
                              </div>
                              );
                          })}
                          {editedProduct.variants.length === 0 && <div className="text-center text-slate-400 py-6 italic text-sm">Δεν υπάρχουν παραλλαγές.</div>}
                      </div>
                  </div>
              </div>
            )}

          </div>
        </main>

      </div>
      {showPrintModal && <PrintModal product={editedProduct} onClose={() => setShowPrintModal(false)} onPrint={setPrintItems} />}
    </>
  );
}

const TabButton = ({ name, label, activeTab, setActiveTab }: any) => (
    <button onClick={() => setActiveTab(name)} className={`px-4 py-2 font-bold text-sm rounded-t-lg transition-colors ${activeTab === name ? 'bg-slate-50 border-x border-t border-slate-200 text-slate-800' : 'text-slate-400 hover:text-slate-600'}`}>
        {label}
    </button>
);

const InfoCard = ({ label, value, unit }: any) => (
    <div className="bg-white p-4 rounded-xl border border-slate-200">
        <label className="text-xs font-bold text-slate-400 uppercase tracking-wide">{label}</label>
        <div className="flex items-baseline gap-2 mt-1">
            <p className="font-bold text-slate-800 text-lg">{value}</p>
            {unit && <span className="text-sm font-medium text-slate-500">{unit}</span>}
        </div>
    </div>
);

const LaborInput = ({ label, value, onChange, isOverridden, onToggleOverride }: any) => (
    <div className="bg-white p-4 rounded-xl border border-slate-200">
        <label className="text-xs font-bold text-slate-400 uppercase tracking-wide">{label}</label>
        <div className="relative mt-1">
            <input 
                type="number" 
                step="0.01" 
                value={value}
                readOnly={onToggleOverride && !isOverridden}
                onChange={e => onChange(parseFloat(e.target.value) || 0)}
                className={`w-full bg-transparent font-mono font-bold text-slate-800 text-lg outline-none ${onToggleOverride && !isOverridden ? 'text-slate-500' : ''}`}
            />
            {onToggleOverride && (
                 <button onClick={onToggleOverride} title="Manual Override" className="absolute right-0 top-1/2 -translate-y-1/2 p-1.5 rounded-full text-slate-400 hover:bg-slate-100">
                    {isOverridden ? <Unlock size={14}/> : <Lock size={14}/>}
                </button>
            )}
        </div>
    </div>
);
