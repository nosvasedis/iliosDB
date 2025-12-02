import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Product, Material, RecipeItem, LaborCost, ProductVariant, Gender, GlobalSettings, Collection, Mold } from '../types';
import { calculateProductCost, calculateTechnicianCost, analyzeSku, analyzeSuffix, estimateVariantCost, getPrevalentVariant, getVariantComponents } from '../utils/pricingEngine';
import { FINISH_CODES } from '../constants'; 
import { X, Save, Printer, Box, Gem, Hammer, MapPin, Copy, Trash2, Plus, Info, Wand2, TrendingUp, Camera, Loader2, Upload, History, AlertTriangle, FolderKanban, CheckCircle, RefreshCcw, Tag, ImageIcon, Coins, Lock, Unlock, Calculator, Percent, ChevronLeft, ChevronRight, Layers, ScanBarcode, ChevronDown, Edit3, Search } from 'lucide-react';
import { uploadProductImage, supabase, deleteProduct } from '../lib/supabase';
import { compressImage } from '../utils/imageHelpers';
import { useQueryClient } from '@tanstack/react-query';
import { useUI } from './UIProvider';
import JsBarcode from 'jsbarcode';

interface PrintModalProps {
    product: Product;
    onClose: () => void;
    onPrint: (items: { product: Product, variant?: ProductVariant, quantity: number, format?: 'standard' | 'simple' }[]) => void;
}

const GENDER_MAP: Record<Gender, string> = {
    [Gender.Men]: 'Ανδρικά',
    [Gender.Women]: 'Γυναικεία',
    [Gender.Unisex]: 'Unisex'
};

const PrintModal: React.FC<PrintModalProps> = ({ product, onClose, onPrint }) => {
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
        const itemsToPrint: { product: Product, variant?: ProductVariant, quantity: number, format?: 'standard' | 'simple' }[] = [];
        for (const suffix in quantities) {
            const qty = quantities[suffix];
            if (qty > 0) {
                const variant = suffix === '(Master)' ? undefined : product.variants?.find(v => v.suffix === suffix);
                itemsToPrint.push({ product, variant, quantity: qty, format: 'standard' });
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
                <h2 className="text-xl font-bold mb-1 text-[#060b00]">Εκτύπωση Ετικετών</h2>
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
                
                <button onClick={handlePrint} className="mt-6 w-full bg-[#060b00] text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-black transition-colors shadow-lg shadow-slate-200">
                    <Printer size={18} /> Εκτύπωση
                </button>
            </div>
      </div>
    );
};

const BarcodeRow: React.FC<{ product: Product, variant?: ProductVariant }> = ({ product, variant }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const sku = variant ? `${product.sku}${variant.suffix}` : product.sku;
    
    useEffect(() => {
        if (canvasRef.current) {
            try {
                JsBarcode(canvasRef.current, sku, {
                    format: 'CODE128',
                    width: 1.5,
                    height: 40,
                    displayValue: true,
                    fontSize: 14,
                    fontOptions: "bold",
                    margin: 0,
                    background: 'transparent'
                });
            } catch(e) {}
        }
    }, [sku]);

    return (
        <div className="flex flex-col md:flex-row items-center gap-6 p-4 bg-white rounded-xl border border-slate-200 shadow-sm hover:border-emerald-300 transition-all">
            <div className="flex-1">
                <div className="font-black text-lg text-slate-800 tracking-tight">{sku}</div>
                <div className="text-xs text-slate-500 font-medium mt-1">
                    {variant ? variant.description : 'Βασικό Προϊόν (Master)'}
                </div>
            </div>
            
            <div className="bg-slate-50 p-2 rounded-lg border border-slate-100 flex items-center justify-center min-w-[200px]">
                <canvas ref={canvasRef} className="max-w-full h-auto" />
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
  setPrintItems: (items: { product: Product; variant?: ProductVariant; quantity: number, format?: 'standard' | 'simple' }[]) => void;
  settings: GlobalSettings;
  collections: Collection[];
  allMolds: Mold[];
  viewMode?: 'registry' | 'warehouse';
}

export default function ProductDetails({ product, allProducts, allMaterials, onClose, onSave, setPrintItems, settings, collections, allMolds, viewMode = 'registry' }: Props) {
  const queryClient = useQueryClient();
  const { showToast, confirm } = useUI();
  
  const [activeTab, setActiveTab] = useState<'overview' | 'recipe' | 'labor' | 'variants' | 'barcodes'>('overview');
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [viewIndex, setViewIndex] = useState(0);

  const [editedProduct, setEditedProduct] = useState<Product>({ 
      ...product,
      variants: product.variants || [],
      selling_price: product.selling_price || 0,
      molds: product.molds || [],
      collections: product.collections || []
  });
  
  const [showRepriceTool, setShowRepriceTool] = useState(false);
  const [targetMargin, setTargetMargin] = useState(50);
  const [calculatedPrice, setCalculatedPrice] = useState(0);

  // Molds Editing State
  const [isEditingMolds, setIsEditingMolds] = useState(false);
  const [moldSearch, setMoldSearch] = useState('');

  useEffect(() => {
    setEditedProduct({ 
      ...product,
      variants: product.variants || [],
      selling_price: product.selling_price || 0,
      molds: product.molds || [],
      collections: product.collections || []
    });
    setViewIndex(0);
  }, [product]);

  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [smartAddSku, setSmartAddSku] = useState('');
  const [newVariantSuffix, setNewVariantSuffix] = useState('');
  const [newVariantDesc, setNewVariantDesc] = useState('');
  const [manualSuffixAnalysis, setManualSuffixAnalysis] = useState<string | null>(null);

  useEffect(() => {
    if (!editedProduct.labor.technician_cost_manual_override) {
        const techCost = calculateTechnicianCost(editedProduct.weight_g);
        setEditedProduct(prev => ({
            ...prev,
            labor: { ...prev.labor, technician_cost: techCost }
        }));
    }
  }, [editedProduct.weight_g, editedProduct.labor.technician_cost_manual_override]);

  useEffect(() => {
      setEditedProduct(prev => {
          if (!prev.variants || prev.variants.length === 0) return prev;

          let hasChanges = false;
          const updatedVariants = prev.variants.map(v => {
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

  useEffect(() => {
    if (newVariantSuffix) {
        const desc = analyzeSuffix(newVariantSuffix, editedProduct.gender);
        setManualSuffixAnalysis(desc);
        if (desc && !newVariantDesc) {
            setNewVariantDesc(desc);
        }
    } else {
        setManualSuffixAnalysis(null);
    }
  }, [newVariantSuffix, newVariantDesc, editedProduct.gender]);

  const variants = editedProduct.variants || [];
  const hasVariants = variants.length > 0;
  
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

  const nextView = () => setViewIndex(prev => (prev + 1) % maxViews);
  const prevView = () => setViewIndex(prev => (prev - 1 + maxViews) % maxViews);

  const currentCostCalc = calculateProductCost(editedProduct, settings, allMaterials, allProducts);
  const masterCost = currentCostCalc.total;
  
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

  const { displayPlating, displayStones } = React.useMemo(() => {
      if (!editedProduct.variants || editedProduct.variants.length === 0) {
          return { displayPlating: editedProduct.plating_type, displayStones: '' };
      }

      const finishes = new Set<string>();
      const stones = new Set<string>();
      
      editedProduct.variants.forEach(v => {
          const { finish, stone } = getVariantComponents(v.suffix, editedProduct.gender);
          if (finish.name) finishes.add(finish.name);
          if (stone.name) stones.add(stone.name);
      });

      if (finishes.size === 0) finishes.add(editedProduct.plating_type);

      return {
          displayPlating: Array.from(finishes).join(', '),
          displayStones: Array.from(stones).join(', ')
      };
  }, [editedProduct.variants, editedProduct.plating_type, editedProduct.gender]);

  const updateCalculatedPrice = (marginPercent: number) => {
       const marginDecimal = marginPercent / 100;
       if (marginDecimal >= 1) {
           setCalculatedPrice(0);
           return;
       }
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
              const variantsCopy = [...editedProduct.variants];
              const originalIdx = variantsCopy.findIndex(v => v.suffix === currentViewVariant!.suffix);
              if (originalIdx >= 0) {
                  variantsCopy[originalIdx] = { ...variantsCopy[originalIdx], selling_price: parseFloat(calculatedPrice.toFixed(2)) };
                  setEditedProduct(prev => ({ ...prev, variants: variantsCopy }));
              }
          } else {
              setEditedProduct(prev => ({...prev, selling_price: parseFloat(calculatedPrice.toFixed(2))}));
          }
          setShowRepriceTool(false);
          showToast('Η νέα τιμή εφαρμόστηκε. Πατήστε Αποθήκευση για οριστικοποίηση.', 'info');
      }
  };

  // --- RECIPE EDITING HANDLERS ---
  const addRecipeItem = (type: 'raw' | 'component') => {
    let newItem: RecipeItem;
    if (type === 'raw') {
        if (!allMaterials || allMaterials.length === 0) {
            showToast("Δεν υπάρχουν διαθέσιμα υλικά.", "error");
            return;
        }
        newItem = { type: 'raw', id: allMaterials[0].id, quantity: 1 };
    } else {
        const stxProducts = allProducts.filter(p => p.is_component);
        if (stxProducts.length === 0) {
            showToast("Δεν υπάρχουν διαθέσιμα εξαρτήματα (STX).", "error");
            return;
        }
        newItem = { type: 'component', sku: stxProducts[0].sku, quantity: 1 };
    }
    setEditedProduct(prev => ({
        ...prev,
        recipe: [...prev.recipe, newItem]
    }));
  };

  const updateRecipeItem = (index: number, field: string, value: any) => {
    const newRecipe = [...editedProduct.recipe];
    const item = { ...newRecipe[index] };
    if (field === 'quantity') {
        item.quantity = parseFloat(value) || 0;
    } else if (field === 'id' && item.type === 'raw') {
        item.id = value;
    } else if (field === 'sku' && item.type === 'component') {
        item.sku = value;
    }
    newRecipe[index] = item;
    setEditedProduct(prev => ({ ...prev, recipe: newRecipe }));
  };

  const removeRecipeItem = (index: number) => {
    setEditedProduct(prev => ({
        ...prev,
        recipe: prev.recipe.filter((_, i) => i !== index)
    }));
  };
  // --- END RECIPE EDITING HANDLERS ---

  const handleSave = async () => {
    try {
        const currentCost = calculateProductCost(editedProduct, settings, allMaterials, allProducts).total;

        await supabase.from('products').update({
            gender: editedProduct.gender,
            category: editedProduct.category,
            weight_g: editedProduct.weight_g,
            selling_price: editedProduct.selling_price,
            labor_casting: editedProduct.labor.casting_cost,
            labor_setter: editedProduct.labor.setter_cost,
            labor_technician: editedProduct.labor.technician_cost,
            labor_plating: editedProduct.labor.plating_cost,
            labor_technician_manual_override: editedProduct.labor.technician_cost_manual_override,
            active_price: currentCost,
            draft_price: currentCost
        }).eq('sku', editedProduct.sku);

        // --- NEW RECIPE SAVE LOGIC ---
        await supabase.from('recipes').delete().eq('parent_sku', editedProduct.sku);
        if (editedProduct.recipe.length > 0) {
            const recipeInserts = editedProduct.recipe.map(r => ({
                parent_sku: editedProduct.sku,
                type: r.type,
                material_id: r.type === 'raw' ? r.id : null,
                component_sku: r.type === 'component' ? r.sku : null,
                quantity: r.quantity
            }));
            await supabase.from('recipes').insert(recipeInserts);
        }
        
        // --- NEW MOLD SAVE LOGIC ---
        await supabase.from('product_molds').delete().eq('product_sku', editedProduct.sku);
        if (editedProduct.molds && editedProduct.molds.length > 0) {
            const moldInserts = editedProduct.molds.map(moldCode => ({
                product_sku: editedProduct.sku,
                mold_code: moldCode
            }));
            const { error: moldError } = await supabase.from('product_molds').insert(moldInserts);
            if (moldError) throw moldError;
        }

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
    const analysis = analyzeSku(smartAddSku, editedProduct.gender);
    if (!analysis.isVariant || analysis.masterSku !== editedProduct.sku) {
      showToast('Μη έγκυρος κωδικός παραλλαγής για αυτό το προϊόν.', 'error');
      return;
    }
    if (editedProduct.variants.some(v => v.suffix === analysis.suffix)) {
      showToast('Αυτή η παραλλαγή υπάρχει ήδη.', 'info');
      return;
    }

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
      active_price: estimatedCost,
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
        active_price: estimatedCost,
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
      setViewIndex(0);
  };
  
  // Mold Editor Logic
  const toggleMold = (moldCode: string) => {
      setEditedProduct(prev => {
          const molds = prev.molds || [];
          const newMolds = molds.includes(moldCode)
              ? molds.filter(m => m !== moldCode)
              : [...molds, moldCode];
          return { ...prev, molds: newMolds };
      });
  };

  const availableMolds = useMemo(() => {
      if (!isEditingMolds) return [];
      const selected = new Set(editedProduct.molds || []);
      return allMolds
          .filter(m => !selected.has(m.code))
          .filter(m => 
              m.code.toUpperCase().includes(moldSearch.toUpperCase()) || 
              m.description.toLowerCase().includes(moldSearch.toLowerCase())
          );
  }, [allMolds, editedProduct.molds, moldSearch, isEditingMolds]);


  return createPortal(
    <>
      <div className="fixed inset-0 bg-[#060b00]/30 backdrop-blur-sm z-[100] animate-in fade-in duration-200" onClick={onClose} />
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[101] w-full max-w-7xl h-[90vh] bg-slate-50 rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-300">
        
        {/* Header */}
        <header className="p-6 border-b border-slate-200 bg-white flex justify-between items-center shrink-0">
          <h2 className="text-xl font-bold text-[#060b00]">{editedProduct.sku}</h2>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowPrintModal(true)} className="px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-lg flex items-center gap-2 border border-slate-200"><Printer size={16}/> Εκτύπωση</button>
            <button onClick={requestDelete} disabled={isDeleting} className="p-2 text-slate-400 hover:bg-red-50 hover:text-red-500 rounded-lg">{isDeleting ? <Loader2 className="animate-spin"/> : <Trash2 size={16}/>}</button>
            <button onClick={handleSave} className="px-5 py-2 text-sm font-bold bg-[#060b00] text-white rounded-lg flex items-center gap-2 hover:bg-black shadow-sm"><Save size={16}/> Αποθήκευση</button>
            <button onClick={onClose} className="p-2 text-slate-400 hover:bg-slate-100 rounded-lg"><X size={20}/></button>
          </div>
        </header>

        {/* Body */}
        <main className="flex-1 flex overflow-hidden">
          {/* LEFT SIDEBAR */}
          <div className={`w-1/3 border-r border-slate-200 p-6 flex flex-col overflow-y-auto transition-colors duration-300 ${isVariantView ? 'bg-emerald-50/30' : 'bg-white'}`}>
             
             {/* Dynamic Header */}
             <div className="flex items-center justify-between mb-4">
                 <div className="min-w-0">
                     <h3 className={`font-black text-xl truncate ${isVariantView ? 'text-emerald-700' : 'text-[#060b00]'}`}>
                         {displayedSku}
                     </h3>
                     <div className="text-xs font-bold text-slate-400 flex items-center gap-1 mt-0.5">
                         {isVariantView && <Tag size={12}/>}
                         {displayedLabel}
                     </div>
                 </div>
                 {/* Navigation Arrows */}
                 {hasVariants && maxViews > 1 && (
                     <div className="flex items-center bg-slate-100 rounded-lg p-1 shrink-0 ml-2">
                         <button onClick={prevView} className="p-1 hover:bg-white hover:text-emerald-600 hover:shadow-sm rounded-md transition-all text-slate-400">
                             <ChevronLeft size={18} />
                         </button>
                         <div className="w-px h-4 bg-slate-200 mx-1"></div>
                         <button onClick={nextView} className="p-1 hover:bg-white hover:text-emerald-600 hover:shadow-sm rounded-md transition-all text-slate-400">
                             <ChevronRight size={18} />
                         </button>
                     </div>
                 )}
             </div>

             <div className={`w-full aspect-square rounded-2xl relative group overflow-hidden border shadow-sm shrink-0 transition-all duration-300 ${isVariantView ? 'border-emerald-200 shadow-emerald-100' : 'border-slate-200 bg-slate-100'}`}>
                {editedProduct.image_url ? (
                    <img src={editedProduct.image_url} alt={editedProduct.sku} className="w-full h-full object-cover"/>
                ) : (
                    <div className="w-full h-full flex items-center justify-center">
                        <ImageIcon size={40} className="text-slate-300"/>
                    </div>
                )}
                {/* Image Overlay */}
                <label className="absolute inset-0 bg-[#060b00]/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white cursor-pointer backdrop-blur-sm">
                    {isUploadingImage ? <Loader2 className="animate-spin"/> : <Camera/>}
                    <span className="text-sm font-bold mt-1">Αλλαγή Φωτογραφίας</span>
                    <input type="file" className="hidden" accept="image/*" onChange={handleImageUpdate}/>
                </label>
             </div>

             {viewMode === 'registry' && (
                <div className="w-full mt-6 space-y-4">
                    <div className={`p-4 rounded-xl border text-center transition-colors ${isVariantView ? 'bg-white border-emerald-200' : 'bg-slate-100 border-slate-200'}`}>
                        <span className={`text-xs font-bold uppercase ${isVariantView ? 'text-emerald-400' : 'text-slate-500'}`}>Κόστος</span>
                        <p className={`text-2xl font-black mt-1 ${isVariantView ? 'text-emerald-700' : 'text-slate-800'}`}>
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
                                    <span className="font-bold text-emerald-600 ml-1 text-sm">{calculatedPrice.toFixed(2)}€</span>
                                </div>
                                <button onClick={applyReprice} className="w-full bg-amber-600 text-white py-1.5 rounded-lg text-xs font-bold hover:bg-amber-700">Εφαρμογή</button>
                            </div>
                        )}
                    </div>
                </div>
             )}
          </div>

          <div className="flex-1 p-6 overflow-y-auto">
            <div className="flex gap-2 border-b border-slate-200 mb-6 overflow-x-auto scrollbar-hide">
                <TabButton name="overview" label="Επισκόπηση" activeTab={activeTab} setActiveTab={setActiveTab} />
                {viewMode === 'registry' && <TabButton name="recipe" label="Συνταγή (BOM)" activeTab={activeTab} setActiveTab={setActiveTab} />}
                {viewMode === 'registry' && <TabButton name="labor" label="Εργατικά" activeTab={activeTab} setActiveTab={setActiveTab} />}
                <TabButton name="variants" label="Παραλλαγές & Τιμές" activeTab={activeTab} setActiveTab={setActiveTab} />
                <TabButton name="barcodes" label="Barcodes" activeTab={activeTab} setActiveTab={setActiveTab} />
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
                        
                        <div className="bg-white p-4 rounded-xl border border-slate-200 relative group">
                            <label className="text-xs font-bold text-slate-400 uppercase tracking-wide">Φύλο</label>
                            <div className="relative mt-1">
                                <select 
                                    value={editedProduct.gender}
                                    onChange={(e) => setEditedProduct(prev => ({ ...prev, gender: e.target.value as Gender }))}
                                    className="w-full bg-transparent font-bold text-slate-800 text-lg outline-none appearance-none cursor-pointer pr-6"
                                >
                                    <option value={Gender.Women}>Γυναικεία</option>
                                    <option value={Gender.Men}>Ανδρικά</option>
                                    <option value={Gender.Unisex}>Unisex</option>
                                </select>
                                <ChevronDown className="absolute right-0 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none group-hover:text-slate-600" size={16} />
                            </div>
                        </div>
                        
                        <InfoCard label="Επιμετάλλωση" value={displayPlating} />
                        
                        {displayStones && (
                            <div className="col-span-2 bg-white p-4 rounded-xl border border-slate-200">
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-wide flex items-center gap-2"><Gem size={14}/> Πέτρες</label>
                                <div className="mt-1 font-bold text-slate-800 text-lg leading-snug">
                                    {displayStones}
                                </div>
                            </div>
                        )}
                    </div>

                    {!isEditingMolds ? (
                        <div className="bg-white p-4 rounded-xl border border-slate-200">
                             <div className="flex justify-between items-center mb-3">
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-wide flex items-center gap-2">
                                    <MapPin size={14}/> Απαιτούμενα Λάστιχα
                                </label>
                                <button onClick={() => setIsEditingMolds(true)} className="flex items-center gap-1 text-xs font-bold text-emerald-600 hover:text-emerald-800 bg-emerald-50 px-2 py-1 rounded-md border border-emerald-100">
                                    <Edit3 size={12}/> Επεξεργασία
                                </button>
                            </div>
                            {(editedProduct.molds && editedProduct.molds.length > 0) ? (
                                <div className="flex flex-wrap gap-2">
                                    {editedProduct.molds.map(moldCode => {
                                        const moldDetails = allMolds.find(m => m.code === moldCode);
                                        return (
                                            <div key={moldCode} className="relative group">
                                                <div className="bg-amber-50 text-amber-800 text-sm font-bold font-mono px-3 py-1.5 rounded-lg border border-amber-100 cursor-help">
                                                    {moldCode}
                                                </div>
                                                {moldDetails && (
                                                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max max-w-xs bg-slate-800 text-white text-xs rounded-lg p-3 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 shadow-lg">
                                                        <p className="font-bold border-b border-slate-600 pb-1 mb-1">{moldDetails.description || 'Χωρίς Περιγραφή'}</p>
                                                        <p className="flex items-center gap-1.5"><MapPin size={12} className="text-amber-400"/> {moldDetails.location || 'Άγνωστη Τοποθεσία'}</p>
                                                        <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-x-4 border-x-transparent border-t-4 border-t-slate-800"></div> {/* Arrow */}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="text-sm text-slate-400 italic">Δεν έχουν οριστεί λάστιχα.</div>
                            )}
                        </div>
                    ) : (
                        <div className="bg-white p-4 rounded-xl border-2 border-emerald-200 shadow-lg shadow-emerald-50 animate-in fade-in">
                            <div className="flex justify-between items-center mb-4">
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-wide flex items-center gap-2">
                                    <MapPin size={14}/> Επεξεργασία Λάστιχων
                                </label>
                                <button onClick={() => { setIsEditingMolds(false); setMoldSearch(''); }} className="text-xs font-bold bg-emerald-500 text-white px-4 py-2 rounded-lg shadow-sm hover:bg-emerald-600">
                                    Τέλος
                                </button>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 h-64 flex flex-col">
                                    <h4 className="text-xs font-bold text-slate-500 mb-2 shrink-0">Επιλεγμένα ({editedProduct.molds?.length || 0})</h4>
                                    <div className="overflow-y-auto flex-1 custom-scrollbar pr-1 -mr-1">
                                        <div className="flex flex-wrap gap-2">
                                            {(editedProduct.molds || []).map(moldCode => (
                                                <div key={moldCode} className="bg-amber-100 text-amber-900 font-mono font-bold text-sm px-2 py-1 rounded-md border border-amber-200 flex items-center gap-2">
                                                    <span>{moldCode}</span>
                                                    <button onClick={() => toggleMold(moldCode)} className="text-amber-500 hover:text-amber-700"><X size={12} /></button>
                                                </div>
                                            ))}
                                            {(!editedProduct.molds || editedProduct.molds.length === 0) && <p className="text-xs text-slate-400 italic w-full text-center py-4">Κανένα</p>}
                                        </div>
                                    </div>
                                </div>
                                 <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 h-64 flex flex-col">
                                    <h4 className="text-xs font-bold text-slate-500 mb-2 shrink-0">Διαθέσιμα</h4>
                                    <div className="relative mb-2 shrink-0">
                                        <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
                                        <input type="text" value={moldSearch} onChange={e => setMoldSearch(e.target.value)} placeholder="Αναζήτηση..." className="w-full text-xs pl-7 p-1.5 bg-white rounded-md border border-slate-200 outline-none focus:ring-1 focus:ring-emerald-400"/>
                                    </div>
                                    <div className="overflow-y-auto flex-1 custom-scrollbar pr-1 -mr-1 space-y-1">
                                        {availableMolds.map(mold => (
                                            <div key={mold.code} onClick={() => toggleMold(mold.code)} className="p-2 rounded-md hover:bg-emerald-100 cursor-pointer flex justify-between items-center text-sm">
                                                <span className="font-mono font-bold text-slate-700">{mold.code}</span>
                                                <span className="text-xs text-slate-400 truncate ml-2">{mold.description}</span>
                                            </div>
                                        ))}
                                         {availableMolds.length === 0 && <p className="text-xs text-slate-400 italic w-full text-center py-4">Δεν βρέθηκαν άλλα.</p>}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
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
                   
                   {editedProduct.recipe.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-3 p-4 rounded-xl border bg-white shadow-sm">
                       <div className="flex-1">
                           <label className="block text-[10px] text-slate-400 uppercase font-bold mb-1">{item.type === 'raw' ? 'Υλικό' : 'Εξάρτημα'}</label>
                           {item.type === 'raw' ? (
                               <select value={item.id} onChange={(e) => updateRecipeItem(idx, 'id', e.target.value)} className="w-full text-sm font-bold outline-none cursor-pointer bg-transparent">
                                   {allMaterials.map(m => (<option key={m.id} value={m.id}>{m.name}</option>))}
                               </select>
                           ) : (
                               <select value={item.sku} onChange={(e) => updateRecipeItem(idx, 'sku', e.target.value)} className="w-full text-sm font-bold outline-none cursor-pointer bg-transparent">
                                   {allProducts.filter(p => p.is_component).map(p => (<option key={p.sku} value={p.sku}>{p.sku}</option>))}
                               </select>
                           )}
                       </div>
                       <div className="w-24">
                           <input 
                               type="number" 
                               value={item.quantity} 
                               onChange={(e) => updateRecipeItem(idx, 'quantity', e.target.value)} 
                               className="w-full p-2 bg-slate-50 rounded font-bold text-center outline-none border border-slate-200"
                           />
                       </div>
                       <button onClick={() => removeRecipeItem(idx)} className="p-2 text-slate-300 hover:text-red-500">
                           <Trash2 size={18} />
                       </button>
                    </div>
                   ))}

                   {editedProduct.recipe.length === 0 && (
                       <div className="text-center italic text-slate-400 py-4 text-xs">
                           Μόνο Υλικό Βάσης (Ασήμι). Προσθέστε υλικά.
                       </div>
                   )}
                   <div className="flex gap-2 pt-4 border-t border-slate-100">
                        <button type="button" onClick={() => addRecipeItem('raw')} className="text-xs bg-purple-50 text-purple-700 px-4 py-2.5 rounded-lg font-bold border border-purple-200 flex items-center gap-1 hover:bg-purple-100 transition-colors"><Plus size={14}/> Υλικό</button>
                        <button type="button" onClick={() => addRecipeItem('component')} className="text-xs bg-blue-50 text-blue-700 px-4 py-2.5 rounded-lg font-bold border border-blue-200 flex items-center gap-1 hover:bg-blue-100 transition-colors"><Plus size={14}/> STX</button>
                    </div>
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
                            <h4 className="font-bold text-sm text-slate-600 mb-2 flex items-center gap-2"><Wand2 size={16} className="text-emerald-500"/> Έξυπνη Προσθήκη</h4>
                            <div className="grid grid-cols-[1fr_auto] gap-2 w-full">
                                <input 
                                    type="text" 
                                    placeholder={`π.χ. ${editedProduct.sku}P`}
                                    value={smartAddSku} 
                                    onChange={e => setSmartAddSku(e.target.value.toUpperCase())}
                                    className="w-full p-2 border border-slate-200 rounded-lg font-mono text-sm uppercase min-w-0 bg-white text-slate-800"
                                />
                                <button onClick={handleSmartAdd} className="bg-emerald-600 text-white px-4 py-2 rounded-lg font-bold text-sm hover:bg-emerald-700 transition-colors whitespace-nowrap">Προσθήκη</button>
                            </div>
                        </div>
                        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col">
                            <h4 className="font-bold text-sm text-slate-600 mb-2">Χειροκίνητη Προσθήκη</h4>
                            <div className="grid grid-cols-[80px_1fr_auto] gap-2 w-full">
                                <input type="text" placeholder="Suffix" value={newVariantSuffix} onChange={e => setNewVariantSuffix(e.target.value.toUpperCase())} className="w-full p-2 border border-slate-200 rounded-lg font-mono text-sm uppercase min-w-0 bg-white text-slate-800"/>
                                <input type="text" placeholder="Περιγραφή" value={newVariantDesc} onChange={e => setNewVariantDesc(e.target.value)} className="w-full p-2 border border-slate-200 rounded-lg text-sm min-w-0 bg-white text-slate-800"/>
                                <button onClick={handleManualAdd} className="bg-[#060b00] text-white px-3 py-2 rounded-lg font-bold text-sm hover:bg-black transition-colors flex items-center justify-center"><Plus size={16}/></button>
                            </div>
                            {manualSuffixAnalysis && (
                                <div className="mt-2 text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded border border-blue-100 flex items-center gap-1">
                                    <Wand2 size={12}/> {manualSuffixAnalysis}
                                </div>
                            )}
                        </div>
                  </div>

                  <div>
                      <h4 className="font-bold text-sm text-slate-600 mb-3 uppercase tracking-wide">Λίστα Παραλλαγών ({editedProduct.variants.length})</h4>
                      <div className="space-y-3">
                          {editedProduct.variants.map((variant, index) => {
                              const wholesale = variant.selling_price ?? editedProduct.selling_price;
                              const retail = wholesale * 3;
                              const hasPriceOverride = variant.selling_price !== null;
                              const hasCostOverride = variant.active_price !== null;

                              return (
                              <div key={index} className="flex flex-col md:flex-row md:items-center gap-3 p-4 bg-white rounded-xl border border-slate-200 shadow-sm hover:border-emerald-300 transition-all">
                                <div className="flex items-center gap-3 w-full md:w-auto">
                                    <div className="font-mono font-bold text-lg text-emerald-600 w-16 text-center bg-emerald-50 rounded-lg py-2">{variant.suffix}</div>
                                    <input 
                                        type="text" 
                                        value={variant.description}
                                        onChange={e => updateVariant(index, 'description', e.target.value)}
                                        placeholder="Περιγραφή"
                                        className="flex-1 md:w-48 p-2 border border-slate-200 rounded-lg text-sm bg-white focus:border-emerald-500 outline-none text-slate-800"
                                    />
                                </div>
                                
                                <div className="flex items-center gap-2 flex-1 w-full border-t md:border-t-0 pt-3 md:pt-0 border-slate-100">
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
                                                    : 'border-slate-200 text-slate-700 bg-slate-50 focus:bg-white focus:border-emerald-500'}
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
                                                    : 'border-emerald-200 text-emerald-700 bg-slate-50 focus:bg-white focus:border-emerald-500 ring-1 ring-emerald-100'}
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
            
            {activeTab === 'barcodes' && (
                <div className="space-y-4">
                    <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex items-start gap-3 mb-6">
                        <ScanBarcode className="text-blue-600 mt-1" size={24} />
                        <div>
                            <h4 className="font-bold text-blue-900 text-sm">Διαχείριση Barcode</h4>
                            <p className="text-xs text-blue-700 mt-1">Εδώ μπορείτε να δείτε μεμονωμένα τα barcode για κάθε παραλλαγή.</p>
                        </div>
                    </div>

                    <div className="space-y-3">
                        {editedProduct.variants.length === 0 && (
                            <BarcodeRow product={editedProduct} />
                        )}
                        {editedProduct.variants.map((v, i) => (
                            <BarcodeRow key={i} product={editedProduct} variant={v} />
                        ))}
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
    <button onClick={() => setActiveTab(name)} className={`px-4 py-2 font-bold text-sm rounded-t-lg transition-colors whitespace-nowrap ${activeTab === name ? 'bg-slate-50 border-x border-t border-slate-200 text-slate-800' : 'text-slate-400 hover:text-slate-600'}`}>
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