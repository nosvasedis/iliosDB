
import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Product, Material, RecipeItem, LaborCost, ProductVariant, Gender, GlobalSettings, Collection } from '../types';
import { calculateProductCost, calculateTechnicianCost, analyzeSku, analyzeSuffix, estimateVariantCost, getPrevalentVariant, getVariantComponents } from '../utils/pricingEngine';
import { FINISH_CODES } from '../constants'; 
import { X, Save, Printer, Box, Gem, Hammer, MapPin, Copy, Trash2, Plus, Info, Wand2, TrendingUp, Camera, Loader2, Upload, History, AlertTriangle, FolderKanban, CheckCircle, RefreshCcw, Tag, ImageIcon, Coins, Lock, Unlock, Calculator, Percent, ChevronLeft, ChevronRight, Layers } from 'lucide-react';
import { uploadProductImage, supabase, deleteProduct } from '../lib/supabase';
import { compressImage } from '../utils/imageHelpers';
import { useQueryClient } from '@tanstack/react-query';
import { useUI } from './UIProvider';

interface PrintModalProps {
    product: Product;
    onClose: () => void;
    onPrint: (items: { product: Product, variant?: ProductVariant, quantity: number }[]) => void;
}

const GENDER_MAP: Record<Gender, string> = {
    [Gender.Men]: 'Ανδρικά',
    [Gender.Women]: 'Γυναικεία',
    [Gender.Unisex]: 'Unisex'
};

const PrintModal: React.FC<PrintModalProps> = ({ product, onClose, onPrint }) => {
    // Only show variants in the list if they exist. Don't show Master generic row if variants exist.
    const hasVariants = product.variants && product.variants.length > 0;
    
    const displayItems = hasVariants 
        ? product.variants!.map(v => ({ suffix: v.suffix, description: v.description, stock_qty: v.stock_qty }))
        : [{ suffix: '(Master)', description: 'Βασικό Προϊόν', stock_qty: product.stock_qty }];
    
    const [quantities, setQuantities] = useState<Record<string, number>>(
        displayItems.reduce((acc, v) => ({ ...acc, [v.suffix]: 0 }), {})
    );

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
                    {displayItems.map((v) => (
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
  
  // VIEW INDEX for Left Sidebar
  const [viewIndex, setViewIndex] = useState(0);

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
    // Reset view to 0 when product changes
    setViewIndex(0);
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

  // Dynamic Cost Recalculation Effect
  useEffect(() => {
      setEditedProduct(prev => {
          if (!prev.variants || prev.variants.length === 0) return prev;

          let hasChanges = false;
          const updatedVariants = prev.variants.map(v => {
              // Recalculate based on current editedProduct state (which holds latest labor/weight)
              const estimated = estimateVariantCost(
                  editedProduct, 
                  v.suffix,
                  settings,
                  allMaterials,
                  allProducts,
                  editedProduct.labor.plating_cost
              );
              
              if (Math.abs((v.active_price || 0) - estimated) > 0.005) {
                  hasChanges = true;
                  return { ...v, active_price: estimated };
              }
              return v;
          });

          if (hasChanges) {
              return { ...prev, variants: updatedVariants };
          }
          return prev;
      });
  }, [
      editedProduct.weight_g,
      editedProduct.labor.casting_cost,
      editedProduct.labor.setter_cost,
      editedProduct.labor.technician_cost,
      editedProduct.labor.plating_cost,
      editedProduct.plating_type,
      editedProduct.recipe,
      editedProduct.variants?.length
  ]);

  // Smart Suffix Analysis for Manual Add
  useEffect(() => {
    if (newVariantSuffix) {
        const desc = analyzeSuffix(newVariantSuffix, editedProduct.gender); // Use product gender
        setManualSuffixAnalysis(desc);
        if (desc && !newVariantDesc) {
            setNewVariantDesc(desc);
        }
    } else {
        setManualSuffixAnalysis(null);
    }
  }, [newVariantSuffix, newVariantDesc, editedProduct.gender]);

  // --- DERIVED DATA FOR LEFT SIDEBAR ---
  const variants = editedProduct.variants || [];
  const hasVariants = variants.length > 0;
  
  // Sorting for display logic: P > X > Rest
  const displayVariants = useMemo(() => {
      if (!hasVariants) return [];
      return [...variants].sort((a, b) => {
          const priority = (suffix: string) => {
              if (suffix.includes('P')) return 1;
              if (suffix.includes('X')) return 2;
              return 3;
          };
          return priority(a.suffix) - priority(b.suffix);
      });
  }, [variants]);

  const maxViews = hasVariants ? displayVariants.length : 1;

  // Handlers for switching views
  const nextView = () => setViewIndex(prev => (prev + 1) % maxViews);
  const prevView = () => setViewIndex(prev => (prev - 1 + maxViews) % maxViews);

  // Determine displayed Cost & Price based on ViewIndex
  const currentCostCalc = calculateProductCost(editedProduct, settings, allMaterials, allProducts);
  const masterCost = currentCostCalc.total;
  
  // If variants exist, we pick from the sorted list. If not, currentViewVariant is null (showing master)
  const currentViewVariant = hasVariants ? displayVariants[viewIndex % maxViews] : null;
  
  let displayedSku = editedProduct.sku;
  let displayedLabel = 'Βασικό';
  let displayedCost = masterCost;
  let displayedPrice = editedProduct.selling_price;
  let isVariantView = !!currentViewVariant;

  if (currentViewVariant) {
      displayedSku = `${editedProduct.sku}-${currentViewVariant.suffix}`;
      displayedLabel = currentViewVariant.description || currentViewVariant.suffix;
      
      if (currentViewVariant.active_price) displayedCost = currentViewVariant.active_price;
      if (currentViewVariant.selling_price) displayedPrice = currentViewVariant.selling_price;
  }

  const displayedProfit = displayedPrice - displayedCost;
  const displayedMargin = displayedPrice > 0 ? (displayedProfit / displayedPrice) * 100 : 0;

  // --- End Derived Data ---

  // --- Smart Plating & Stones Logic ---
  const { displayPlating, displayStones } = React.useMemo(() => {
      // 1. If no variants, fallback to master Plating and empty stones (or check recipe)
      if (!editedProduct.variants || editedProduct.variants.length === 0) {
          return { displayPlating: editedProduct.plating_type, displayStones: '' };
      }

      // 2. Collect unique finishes and stones using the smart parser
      const finishes = new Set<string>();
      const stones = new Set<string>();
      
      editedProduct.variants.forEach(v => {
          // Parse each variant suffix
          const { finish, stone } = getVariantComponents(v.suffix, editedProduct.gender);
          
          if (finish.name) finishes.add(finish.name);
          if (stone.name) stones.add(stone.name);
      });

      // Default finish fallback if none detected (e.g. Master plating)
      if (finishes.size === 0) finishes.add(editedProduct.plating_type);

      return {
          displayPlating: Array.from(finishes).join(', '),
          displayStones: Array.from(stones).join(', ')
      };
  }, [editedProduct.variants, editedProduct.plating_type, editedProduct.gender]);

  // Reprice Logic
  const updateCalculatedPrice = (marginPercent: number) => {
       const marginDecimal = marginPercent / 100;
       if (marginDecimal >= 1) {
           setCalculatedPrice(0);
           return;
       }
       // Use currently displayed cost (Master or Variant)
       const price = displayedCost / (1 - marginDecimal);
       setCalculatedPrice(price);
  };

  const applyReprice = async () => {
      if (calculatedPrice <= 0) return;
      
      const targetName = isVariantView ? `παραλλαγή ${currentViewVariant?.suffix}` : 'βασικό προϊόν';

      const confirmed = await confirm({
          title: 'Ενημέρωση Τιμής',
          message: `Θέλετε να αλλάξετε την τιμή για ${targetName} από ${displayedPrice.toFixed(2)}€ σε ${calculatedPrice.toFixed(2)}€;`,
          confirmText: 'Εφαρμογή'
      });

      if (confirmed) {
          if (isVariantView && currentViewVariant) {
              // Update Variant Price
              const variantsCopy = [...editedProduct.variants];
              // Find index in original array
              const originalIdx = variantsCopy.findIndex(v => v.suffix === currentViewVariant!.suffix);
              if (originalIdx >= 0) {
                  variantsCopy[originalIdx] = { ...variantsCopy[originalIdx], selling_price: parseFloat(calculatedPrice.toFixed(2)) };
                  setEditedProduct(prev => ({ ...prev, variants: variantsCopy }));
              }
          } else {
              // Update Master Price
              setEditedProduct(prev => ({...prev, selling_price: parseFloat(calculatedPrice.toFixed(2))}));
          }
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
    const analysis = analyzeSku(smartAddSku, editedProduct.gender); // Pass gender
    if (!analysis.isVariant || analysis.masterSku !== editedProduct.sku) {
      showToast('Μη έγκυρος κωδικός παραλλαγής για αυτό το προϊόν.', 'error');
      return;
    }
    if (editedProduct.variants.some(v => v.suffix === analysis.suffix)) {
      showToast('Αυτή η παραλλαγή υπάρχει ήδη.', 'info');
      return;
    }

    // SMART COST ESTIMATION (Uses Manual Plating Cost from current labor)
    const estimatedCost = estimateVariantCost(
        editedProduct, 
        analysis.suffix, 
        settings, 
        allMaterials, 
        allProducts, 
        editedProduct.labor.plating_cost
    );

    const newVariant: ProductVariant = {
      suffix: analysis.suffix,
      description: analysis.variantDescription,
      stock_qty: 0,
      active_price: estimatedCost, // Auto-fill Estimated Cost
      selling_price: null
    };
    
    setEditedProduct(prev => ({ ...prev, variants: [...prev.variants, newVariant] }));
    setSmartAddSku('');
    showToast(`Παραλλαγή ${analysis.suffix} προστέθηκε με εκτιμώμενο κόστος ${estimatedCost}€.`, 'success');
  };

  const handleManualAdd = () => {
      if (!newVariantSuffix) { showToast("Το Suffix είναι υποχρεωτικό.", 'error'); return; }
      const upperSuffix = newVariantSuffix.toUpperCase();
      if (editedProduct.variants.some(v => v.suffix === upperSuffix)) { showToast('Αυτό το Suffix υπάρχει ήδη.', 'info'); return; }
      
      // SMART COST ESTIMATION (Uses Manual Plating Cost from current labor)
      const estimatedCost = estimateVariantCost(
          editedProduct, 
          upperSuffix, 
          settings, 
          allMaterials, 
          allProducts,
          editedProduct.labor.plating_cost
      );

      const newVariant: ProductVariant = {
        suffix: upperSuffix,
        description: newVariantDesc || manualSuffixAnalysis || '',
        stock_qty: 0,
        active_price: estimatedCost, // Auto-fill Estimated Cost
        selling_price: null
      };
      setEditedProduct(prev => ({ ...prev, variants: [...prev.variants, newVariant] }));
      setNewVariantSuffix('');
      setNewVariantDesc('');
      showToast(`Παραλλαγή ${upperSuffix} προστέθηκε με εκτιμώμενο κόστος ${estimatedCost}€.`, 'success');
  };
  
  const updateVariant = (index: number, field: keyof ProductVariant, value: any) => {
      const newVariants = [...editedProduct.variants];
      newVariants[index] = { ...newVariants[index], [field]: value };
      setEditedProduct(prev => ({ ...prev, variants: newVariants }));
  };

  const deleteVariant = (index: number) => {
      setEditedProduct(prev => ({ ...prev, variants: prev.variants.filter((_, i) => i !== index) }));
      // Adjust view index
      setViewIndex(0); // Reset to first/prevalent
  };
  
  return createPortal(
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
          {/* LEFT SIDEBAR: Smart Product Info & Variant Navigator */}
          <div className={`w-1/3 border-r border-slate-200 p-6 flex flex-col overflow-y-auto transition-colors duration-300 ${isVariantView ? 'bg-indigo-50/30' : 'bg-white'}`}>
             
             {/* Dynamic Header with Navigation */}
             <div className="flex items-center justify-between mb-4">
                 <div className="min-w-0">
                     <h3 className={`font-black text-xl truncate ${isVariantView ? 'text-indigo-700' : 'text-slate-800'}`}>
                         {displayedSku}
                     </h3>
                     <div className="text-xs font-bold text-slate-400 flex items-center gap-1 mt-0.5">
                         {isVariantView && <Tag size={12}/>}
                         {displayedLabel}
                     </div>
                 </div>
                 {/* Navigation Arrows: Only show if we have variants */}
                 {hasVariants && maxViews > 1 && (
                     <div className="flex items-center bg-slate-100 rounded-lg p-1 shrink-0 ml-2">
                         <button onClick={prevView} className="p-1 hover:bg-white hover:text-indigo-600 hover:shadow-sm rounded-md transition-all text-slate-400">
                             <ChevronLeft size={18} />
                         </button>
                         <div className="w-px h-4 bg-slate-200 mx-1"></div>
                         <button onClick={nextView} className="p-1 hover:bg-white hover:text-indigo-600 hover:shadow-sm rounded-md transition-all text-slate-400">
                             <ChevronRight size={18} />
                         </button>
                     </div>
                 )}
             </div>

             <div className={`w-full aspect-square rounded-2xl relative group overflow-hidden border shadow-sm shrink-0 transition-all duration-300 ${isVariantView ? 'border-indigo-200 shadow-indigo-100' : 'border-slate-200 bg-slate-100'}`}>
                {editedProduct.image_url ? (
                    <img src={editedProduct.image_url} alt={editedProduct.sku} className="w-full h-full object-cover"/>
                ) : (
                    <div className="w-full h-full flex items-center justify-center">
                        <ImageIcon size={40} className="text-slate-300"/>
                    </div>
                )}
                {/* Image Overlay Controls - Allow update if viewing Master (which is fallback for variant images) */}
                <label className="absolute inset-0 bg-slate-900/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white cursor-pointer backdrop-blur-sm">
                    {isUploadingImage ? <Loader2 className="animate-spin"/> : <Camera/>}
                    <span className="text-sm font-bold mt-1">Αλλαγή Φωτογραφίας</span>
                    <input type="file" className="hidden" accept="image/*" onChange={handleImageUpdate}/>
                </label>
             </div>

             {viewMode === 'registry' && (
                <div className="w-full mt-6 space-y-4">
                    <div className={`p-4 rounded-xl border text-center transition-colors ${isVariantView ? 'bg-white border-indigo-200' : 'bg-slate-100 border-slate-200'}`}>
                        <span className={`text-xs font-bold uppercase ${isVariantView ? 'text-indigo-400' : 'text-slate-500'}`}>Κόστος</span>
                        <p className={`text-2xl font-black mt-1 ${isVariantView ? 'text-indigo-700' : 'text-slate-800'}`}>
                            {displayedCost.toFixed(2)}€
                        </p>
                    </div>
                    
                    <div className="bg-amber-50 p-4 rounded-xl border border-amber-200">
                        <div className="text-center relative">
                            <span className="text-xs font-bold text-amber-700 uppercase">Χονδρική</span>
                            <div className="flex items-center justify-center gap-2 mt-1">
                                <p className="text-2xl font-black text-amber-600">{displayedPrice > 0 ? displayedPrice.toFixed(2) + '€' : '-'}</p>
                                <button onClick={() => { setShowRepriceTool(!showRepriceTool); updateCalculatedPrice(targetMargin); }} className="bg-white p-1 rounded-full text-amber-600 hover:bg-amber-100 shadow-sm border border-amber-200"><Calculator size={14}/></button>
                            </div>
                            
                            {/* PROFIT & MARGIN DISPLAY */}
                            {displayedPrice > 0 && (
                                <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-amber-200/50">
                                    <div className="text-center">
                                        <div className="text-[9px] font-bold text-amber-800/60 uppercase">Κερδος</div>
                                        <div className="text-sm font-bold text-emerald-600">{displayedProfit.toFixed(2)}€</div>
                                    </div>
                                    <div className="text-center border-l border-amber-200/50">
                                        <div className="text-[9px] font-bold text-amber-800/60 uppercase">Margin</div>
                                        <div className="text-sm font-bold text-blue-600">{displayedMargin.toFixed(0)}%</div>
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
                        <InfoCard label="Φύλο" value={GENDER_MAP[editedProduct.gender] || editedProduct.gender} />
                        
                        {/* Enhanced Plating Display */}
                        <InfoCard label="Επιμετάλλωση" value={displayPlating} />
                        
                        {/* New Stones Display - Only if stones exist */}
                        {displayStones && (
                            <div className="col-span-2 bg-white p-4 rounded-xl border border-slate-200">
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-wide flex items-center gap-2"><Gem size={14}/> Πέτρες</label>
                                <div className="mt-1 font-bold text-slate-800 text-lg leading-snug">
                                    {displayStones}
                                </div>
                            </div>
                        )}
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
                           <div className="font-mono font-bold">{((editedProduct.weight_g * (settings.silver_price_gram * (1 + settings.loss_percentage/100)))).toFixed(2)}€</div>
                           <div className="text-xs text-slate-400">{editedProduct.weight_g}g @ {settings.silver_price_gram}€/g (+{settings.loss_percentage}%)</div>
                       </div>
                   </div>
                   
                   {/* Full Recipe Items Listing */}
                   {editedProduct.recipe.map((r, idx) => {
                       const mat = r.type === 'raw' ? allMaterials.find(m => m.id === r.id) : null;
                       const comp = r.type === 'component' ? allProducts.find(p => p.sku === r.sku) : null;
                       const name = mat?.name || comp?.sku || 'Άγνωστο';
                       const unitCost = mat?.cost_per_unit || comp?.active_price || 0;
                       const totalItemCost = unitCost * r.quantity;

                       return (
                           <div key={idx} className="flex items-center gap-3 p-4 rounded-xl border bg-white border-slate-200 shadow-sm">
                               <div className="p-2 rounded-lg bg-blue-50 text-blue-600"><Box size={20} /></div>
                               <div className="flex-1">
                                   <label className="block text-[10px] text-slate-400 uppercase font-bold tracking-wider mb-1">{r.type === 'raw' ? 'Υλικό' : 'Εξάρτημα'}</label>
                                   <span className="font-bold text-slate-800">{name}</span>
                               </div>
                               <div className="text-right">
                                   <div className="font-mono font-bold">{totalItemCost.toFixed(2)}€</div>
                                   <div className="text-xs text-slate-400">{r.quantity} x {unitCost.toFixed(2)}€</div>
                               </div>
                           </div>
                       );
                   })}

                   {editedProduct.recipe.length === 0 && (
                       <div className="text-center italic text-slate-400 py-4 text-xs">
                           Μόνο Υλικό Βάσης (Ασήμι)
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
                    <div className="bg-white p-4 rounded-xl border border-slate-200">
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wide">Επιμετάλλωση (Manual)</label>
                        <div className="relative mt-1">
                            <input 
                                type="number" 
                                step="0.01" 
                                value={editedProduct.labor.plating_cost}
                                onChange={e => setEditedProduct(prev => ({...prev, labor: {...prev.labor, plating_cost: parseFloat(e.target.value) || 0}}))}
                                className="w-full bg-transparent font-mono font-bold text-slate-800 text-lg outline-none"
                            />
                        </div>
                        <p className="text-[10px] text-amber-600 mt-2">Το ποσό αυτό θα προστεθεί αυτόματα στο κόστος των παραλλαγών X, D, H.</p>
                    </div>
                </div>
            )}
            {activeTab === 'variants' && (
              <div className="space-y-6">
                  {/* Quick Add Area */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col">
                            <h4 className="font-bold text-sm text-slate-600 mb-2 flex items-center gap-2"><Wand2 size={16} className="text-indigo-500"/> Έξυπνη Προσθήκη</h4>
                            <div className="grid grid-cols-[1fr_auto] gap-2 w-full">
                                <input 
                                    type="text" 
                                    placeholder={`π.χ. ${editedProduct.sku}P`}
                                    value={smartAddSku} 
                                    onChange={e => setSmartAddSku(e.target.value.toUpperCase())}
                                    className="w-full p-2 border border-slate-200 rounded-lg font-mono text-sm uppercase min-w-0"
                                />
                                <button onClick={handleSmartAdd} className="bg-indigo-500 text-white px-4 py-2 rounded-lg font-bold text-sm hover:bg-indigo-600 transition-colors whitespace-nowrap">Προσθήκη</button>
                            </div>
                        </div>
                        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col">
                            <h4 className="font-bold text-sm text-slate-600 mb-2">Χειροκίνητη Προσθήκη</h4>
                            <div className="grid grid-cols-[80px_1fr_auto] gap-2 w-full">
                                <input type="text" placeholder="Suffix" value={newVariantSuffix} onChange={e => setNewVariantSuffix(e.target.value.toUpperCase())} className="w-full p-2 border border-slate-200 rounded-lg font-mono text-sm uppercase min-w-0"/>
                                <input type="text" placeholder="Περιγραφή" value={newVariantDesc} onChange={e => setNewVariantDesc(e.target.value)} className="w-full p-2 border border-slate-200 rounded-lg text-sm min-w-0"/>
                                <button onClick={handleManualAdd} className="bg-slate-800 text-white px-3 py-2 rounded-lg font-bold text-sm hover:bg-slate-700 transition-colors flex items-center justify-center"><Plus size={16}/></button>
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
    </>,
    document.body
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
