import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Product, Material, RecipeItem, LaborCost, ProductVariant, Gender, GlobalSettings, Collection, Mold, ProductionType, PlatingType, ProductMold } from '../types';
import { calculateProductCost, calculateTechnicianCost, analyzeSku, analyzeSuffix, estimateVariantCost, getPrevalentVariant, getVariantComponents, roundPrice, SupplierAnalysis, formatCurrency, transliterateForBarcode } from '../utils/pricingEngine';
import { FINISH_CODES } from '../constants'; 
import { X, Save, Printer, Box, Gem, Hammer, MapPin, Copy, Trash2, Plus, Info, Wand2, TrendingUp, Camera, Loader2, Upload, History, AlertTriangle, FolderKanban, CheckCircle, RefreshCcw, Tag, ImageIcon, Coins, Lock, Unlock, Calculator, Percent, ChevronLeft, ChevronRight, Layers, ScanBarcode, ChevronDown, Edit3, Search, Link, Activity, Puzzle, Minus, Palette, Globe, DollarSign, ThumbsUp, HelpCircle, BookOpen, Scroll } from 'lucide-react';
import { uploadProductImage, supabase, deleteProduct } from '../lib/supabase';
import { compressImage } from '../utils/imageHelpers';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { api } from '../lib/supabase';
import { useUI } from './UIProvider';
import JsBarcode from 'jsbarcode';
import BarcodeView from './BarcodeView';

// CONSTANTS
const PLATING_LABELS: Record<string, string> = {
    [PlatingType.None]: 'Λουστρέ',
    [PlatingType.GoldPlated]: 'Επίχρυσο',
    [PlatingType.TwoTone]: 'Δίχρωμο',
    [PlatingType.Platinum]: 'Πλατίνα'
};

const getSuffixPriority = (suffix: string) => {
    if (suffix.includes('P')) return 1;
    if (suffix.includes('X')) return 2;
    return 3;
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

const LaborCostInput = ({ label, value, onChange, override, onToggleOverride }: { label: string, value: number, onChange: (v: number) => void, override?: boolean, onToggleOverride?: () => void }) => (
    <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
        <span className="text-sm text-slate-600 font-medium">{label}</span>
        <div className="flex items-center gap-2">
            <input 
                type="number" step="0.01" 
                value={value} 
                onChange={(e) => onChange(parseFloat(e.target.value) || 0)} 
                readOnly={onToggleOverride && !override}
                className={`w-20 text-right bg-white border border-slate-200 rounded-lg p-1.5 font-mono text-sm outline-none focus:border-amber-500 ${onToggleOverride && !override ? 'text-slate-400' : 'text-slate-800 font-bold'}`}
            />
            {onToggleOverride && (
                <button onClick={onToggleOverride} className="text-slate-400 hover:text-amber-600 transition-colors">
                    {override ? <Unlock size={14}/> : <Lock size={14}/>}
                </button>
            )}
            <span className="text-xs text-slate-400">€</span>
        </div>
    </div>
);

export default function ProductDetails({ product, allProducts, allMaterials, onClose, onSave, setPrintItems, settings, collections, allMolds, viewMode = 'registry' }: Props) {
  const queryClient = useQueryClient();
  const { showToast, confirm } = useUI();
  const { data: suppliers } = useQuery({ queryKey: ['suppliers'], queryFn: api.getSuppliers });
  
  const [activeTab, setActiveTab] = useState<'overview' | 'recipe' | 'labor' | 'variants' | 'barcodes'>('overview');
  const [isDeleting, setIsDeleting] = useState(false);
  const [viewIndex, setViewIndex] = useState(0);

  const [editedProduct, setEditedProduct] = useState<Product>(() => {
    const initialLabor: Partial<LaborCost> = product.labor || {};
    return { 
        ...product,
        variants: product.variants || [],
        selling_price: product.selling_price || 0,
        molds: product.molds || [],
        collections: product.collections || [],
        secondary_weight_g: product.secondary_weight_g || 0,
        production_type: product.production_type || ProductionType.InHouse,
        supplier_id: product.supplier_id,
        supplier_cost: product.supplier_cost || 0,
        labor: {
            casting_cost: 0,
            setter_cost: 0,
            technician_cost: 0,
            stone_setting_cost: 0,
            plating_cost_x: 0,
            plating_cost_d: 0,
            technician_cost_manual_override: false,
            plating_cost_x_manual_override: false,
            plating_cost_d_manual_override: false,
            ...initialLabor,
        }
    };
  });
  
  const [showRepriceTool, setShowRepriceTool] = useState(false);
  const [targetMargin, setTargetMargin] = useState(50);
  const [calculatedPrice, setCalculatedPrice] = useState(0);

  const [isAddingMold, setIsAddingMold] = useState(false);
  
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [smartAddSuffix, setSmartAddSuffix] = useState(''); 
  const [newVariantSuffix, setNewVariantSuffix] = useState('');
  const [newVariantDesc, setNewVariantDesc] = useState('');
  const [manualSuffixAnalysis, setManualSuffixAnalysis] = useState<string | null>(null);

  useEffect(() => {
    const initialLabor: Partial<LaborCost> = product.labor || {};
    setEditedProduct({ 
      ...product,
      variants: product.variants || [],
      selling_price: product.selling_price || 0,
      molds: product.molds || [],
      collections: product.collections || [],
      secondary_weight_g: product.secondary_weight_g || 0,
      production_type: product.production_type || ProductionType.InHouse,
      supplier_id: product.supplier_id,
      supplier_cost: product.supplier_cost || 0,
      labor: {
            casting_cost: 0,
            setter_cost: 0,
            technician_cost: 0,
            stone_setting_cost: 0,
            plating_cost_x: 0,
            plating_cost_d: 0,
            technician_cost_manual_override: false,
            plating_cost_x_manual_override: false,
            plating_cost_d_manual_override: false,
            ...initialLabor,
        }
    });
    setViewIndex(0);
  }, [product]);

  useEffect(() => {
    if (editedProduct.production_type === ProductionType.InHouse && !editedProduct.labor.technician_cost_manual_override) {
        const techCost = calculateTechnicianCost(editedProduct.weight_g);
        setEditedProduct(prev => ({
            ...prev,
            labor: { ...prev.labor, technician_cost: techCost }
        }));
    }
  }, [editedProduct.weight_g, editedProduct.labor.technician_cost_manual_override, editedProduct.production_type]);
  
  useEffect(() => {
    if (editedProduct.production_type === ProductionType.InHouse) {
        const totalWeight = (editedProduct.weight_g || 0) + (editedProduct.secondary_weight_g || 0);
        const castCost = parseFloat((totalWeight * 0.15).toFixed(2));
        setEditedProduct(prev => ({
            ...prev,
            labor: { ...prev.labor, casting_cost: castCost }
        }));
    }
  }, [editedProduct.weight_g, editedProduct.secondary_weight_g, editedProduct.production_type]);

  useEffect(() => {
    if (!editedProduct.labor.plating_cost_x_manual_override) {
        const costX = parseFloat((editedProduct.weight_g * 0.60).toFixed(2));
        setEditedProduct(prev => ({ ...prev, labor: { ...prev.labor, plating_cost_x: costX } }));
    }
  }, [editedProduct.weight_g, editedProduct.labor.plating_cost_x_manual_override]);

  useEffect(() => {
    // @FIX: Fix typo from 'plating_d_manual_override' to 'plating_cost_d_manual_override'
    if (!editedProduct.labor.plating_cost_d_manual_override) {
        const costD = parseFloat(((editedProduct.secondary_weight_g || 0) * 0.60).toFixed(2));
        setEditedProduct(prev => ({ ...prev, labor: { ...prev.labor, plating_cost_d: costD } }));
    }
  }, [editedProduct.secondary_weight_g, editedProduct.labor.plating_cost_d_manual_override]);

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
                  allProducts
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
      editedProduct.secondary_weight_g,
      editedProduct.labor.casting_cost,
      editedProduct.labor.setter_cost,
      editedProduct.labor.technician_cost,
      editedProduct.labor.stone_setting_cost,
      editedProduct.labor.plating_cost_x,
      editedProduct.labor.plating_cost_d,
      editedProduct.plating_type,
      editedProduct.recipe,
      editedProduct.variants?.length,
      editedProduct.supplier_cost, 
      settings, allMaterials, allProducts
  ]);

  const currentCostCalc = calculateProductCost(editedProduct, settings, allMaterials, allProducts);
  const masterCost = currentCostCalc.total;
  
  const variants = editedProduct.variants || [];
  const hasVariants = variants.length > 0;
  const sortedVariantsList = useMemo(() => {
      if (!hasVariants) return [];
      return [...variants].sort((a, b) => getSuffixPriority(a.suffix) - getSuffixPriority(b.suffix));
  }, [variants]);

  const maxViews = hasVariants ? sortedVariantsList.length : 1;

  const nextView = () => setViewIndex(prev => (prev + 1) % maxViews);
  const prevView = () => setViewIndex(prev => (prev - 1 + maxViews) % maxViews);
  
  const currentViewVariant = hasVariants ? sortedVariantsList[viewIndex % maxViews] : null;
  
  let displayedSku = editedProduct.sku;
  let displayedLabel = 'Βασικό';
  let displayedCost = masterCost;
  let displayedPrice = editedProduct.selling_price;
  let isVariantView = !!currentViewVariant;

  if (currentViewVariant) {
      displayedSku = `${editedProduct.sku}${currentViewVariant.suffix}`;
      displayedLabel = currentViewVariant.description || currentViewVariant.suffix;
      
      if (currentViewVariant.active_price) displayedCost = currentViewVariant.active_price;
      if (currentViewVariant.selling_price) displayedPrice = currentViewVariant.selling_price;
  }

  const displayedProfit = displayedPrice - displayedCost;
  const displayedMargin = displayedPrice > 0 ? (displayedProfit / displayedPrice) * 100 : 0;

  const { displayPlating, displayStones } = React.useMemo(() => {
      if (!editedProduct.variants || editedProduct.variants.length === 0) {
          return { displayPlating: PLATING_LABELS[editedProduct.plating_type] || editedProduct.plating_type, displayStones: '' };
      }

      const finishCodes = new Set<string>();
      const stones = new Set<string>();
      
      editedProduct.variants.forEach(v => {
          const { finish, stone } = getVariantComponents(v.suffix, editedProduct.gender);
          if (finish.code) finishCodes.add(finish.code);
          else if (v.suffix === '') finishCodes.add(''); 
          
          if (stone.name) stones.add(stone.name);
      });

      if (finishCodes.size === 0 && editedProduct.plating_type) {
          return { displayPlating: PLATING_LABELS[editedProduct.plating_type] || editedProduct.plating_type, displayStones: Array.from(stones).join(', ') };
      }

      const sortedFinishNames = Array.from(finishCodes)
        .sort((a, b) => getSuffixPriority(a) - getSuffixPriority(b))
        .map(code => FINISH_CODES[code] || FINISH_CODES[''] /* Lustre if empty */);

      return {
          displayPlating: sortedFinishNames.join(', '),
          displayStones: Array.from(stones).join(', ')
      };
  }, [editedProduct.variants, editedProduct.plating_type, editedProduct.gender]);

  const updateCalculatedPrice = (marginPercent: number) => {
       const marginDecimal = marginPercent / 100;
       if (marginDecimal >= 1) {
           setCalculatedPrice(0);
           return;
       }
       const price = roundPrice(displayedCost / (1 - marginDecimal));
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

  const handleSave = async () => {
    try {
        const isComponent = editedProduct.sku.toUpperCase().startsWith('STX');
        const currentCost = calculateProductCost(editedProduct, settings, allMaterials, allProducts).total;

        const { error: productUpdateError } = await supabase.from('products').update({
            // Editable fields
            category: editedProduct.category,
            gender: editedProduct.gender,
            weight_g: editedProduct.weight_g,
            secondary_weight_g: editedProduct.secondary_weight_g || null,
            selling_price: isComponent ? 0 : editedProduct.selling_price,
            plating_type: editedProduct.plating_type,
            
            // Labor
            labor_casting: editedProduct.labor.casting_cost,
            labor_setter: editedProduct.labor.setter_cost,
            labor_technician: editedProduct.labor.technician_cost,
            labor_plating_x: editedProduct.labor.plating_cost_x,
            labor_plating_d: editedProduct.labor.plating_cost_d,
            labor_technician_manual_override: editedProduct.labor.technician_cost_manual_override,
            labor_plating_x_manual_override: editedProduct.labor.plating_cost_x_manual_override,
            labor_plating_d_manual_override: editedProduct.labor.plating_cost_d_manual_override,

            // Recalculated / System fields
            active_price: currentCost,
            draft_price: currentCost,
            is_component: isComponent,

            // Production Strategy
            production_type: editedProduct.production_type,
            supplier_id: (editedProduct.production_type === ProductionType.Imported && editedProduct.supplier_id) ? editedProduct.supplier_id : null,
            supplier_cost: editedProduct.production_type === ProductionType.Imported ? editedProduct.supplier_cost : null,
            labor_stone_setting: editedProduct.production_type === ProductionType.Imported ? editedProduct.labor.stone_setting_cost : null 
        }).eq('sku', editedProduct.sku);

        if (productUpdateError) throw productUpdateError;

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
        
        await supabase.from('product_molds').delete().eq('product_sku', editedProduct.sku);
        if (editedProduct.molds && editedProduct.molds.length > 0 && editedProduct.production_type === ProductionType.InHouse) {
            const moldInserts = editedProduct.molds.map(m => ({
                product_sku: editedProduct.sku,
                mold_code: m.code,
                quantity: m.quantity
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
                selling_price: editedProduct.is_component ? 0 : ((v.selling_price !== null && !isNaN(Number(v.selling_price))) ? Number(v.selling_price) : null)
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
    if (!smartAddSuffix.trim()) {
        showToast("Παρακαλώ εισάγετε suffix (π.χ. P, X, BSU).", "error");
        return;
    }

    const fullSku = editedProduct.sku + smartAddSuffix.trim().toUpperCase();
    const analysis = analyzeSku(fullSku, editedProduct.gender);
    
    if (!analysis.isVariant) {
      showToast('Δεν αναγνωρίστηκε έγκυρος συνδυασμός.', 'error');
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
        allProducts
    );

    const newVariant: ProductVariant = {
      suffix: analysis.suffix,
      description: analysis.variantDescription,
      stock_qty: 0,
      active_price: estimatedCost,
      selling_price: editedProduct.is_component ? 0 : editedProduct.selling_price
    };
    
    setEditedProduct(prev => ({ ...prev, variants: [...prev.variants, newVariant] }));
    setSmartAddSuffix('');
    showToast(`Παραλλαγή ${analysis.suffix} προστέθηκε!`, 'success');
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
          allProducts
      );

      const newVariant: ProductVariant = {
        suffix: upperSuffix,
        description: newVariantDesc || manualSuffixAnalysis || '',
        stock_qty: 0,
        active_price: estimatedCost,
        selling_price: editedProduct.is_component ? 0 : editedProduct.selling_price
      };
      setEditedProduct(prev => ({ ...prev, variants: [...prev.variants, newVariant] }));
      setNewVariantSuffix('');
      setNewVariantDesc('');
      showToast(`Παραλλαγή ${upperSuffix} προστέθηκε με εκτιμώμενο κόστος ${estimatedCost}€.`, 'success');
  };
  
  const updateVariant = (index: number, field: keyof ProductVariant, value: any) => {
      const variantToUpdate = sortedVariantsList[index];
      const realIndex = editedProduct.variants.findIndex(v => v.suffix === variantToUpdate.suffix);
      if (realIndex === -1) return;
      const newVariants = [...editedProduct.variants];
      newVariants[realIndex] = { ...newVariants[realIndex], [field]: value };
      setEditedProduct(prev => ({ ...prev, variants: newVariants }));
  };

  const deleteVariant = (index: number) => {
      const variantToDelete = sortedVariantsList[index];
      setEditedProduct(prev => ({
          ...prev,
          variants: prev.variants.filter(v => v.suffix !== variantToDelete.suffix)
      }));
  };

  const addMold = (code: string) => {
      if (editedProduct.molds.some(m => m.code === code)) return;
      setEditedProduct(prev => ({
          ...prev,
          molds: [...prev.molds, { code, quantity: 1 }]
      }));
  };

  const updateMoldQuantity = (code: string, delta: number) => {
      setEditedProduct(prev => ({
          ...prev,
          molds: prev.molds.map(m => m.code === code ? { ...m, quantity: Math.max(1, m.quantity + delta) } : m)
      }));
  };

  const removeMold = (code: string) => {
      setEditedProduct(prev => ({
          ...prev,
          molds: prev.molds.filter(m => m.code !== code)
      }));
  };

  const availableMolds = useMemo(() => {
      const usedCodes = new Set(editedProduct.molds.map(m => m.code));
      return allMolds
        .filter(m => !usedCodes.has(m.code))
        .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
  }, [allMolds, editedProduct.molds]);

  const secondaryWeightLabel = useMemo(() => {
    if (editedProduct.gender === Gender.Men && editedProduct.category.includes('Δαχτυλίδι')) {
        return "Βάρος Καπακιού (g)";
    }
    return "Β' Βάρος (g)";
  }, [editedProduct.gender, editedProduct.category]);

  // Handle Print All (Smart)
  const handlePrintAll = () => {
      if (sortedVariantsList.length > 0) {
          // If variants exist, queue 1 of each variant
          const items = sortedVariantsList.map(v => ({
              product: editedProduct,
              variant: v,
              quantity: 1,
              format: 'standard' as const
          }));
          setPrintItems(items);
      } else {
          // If no variants, queue 1 master
          setPrintItems([{ product: editedProduct, quantity: 1, format: 'standard' }]);
      }
  };

  // RENDER
  return createPortal(
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
        <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
        <div className="bg-white w-full max-w-6xl h-[90vh] rounded-3xl shadow-2xl relative flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 border border-slate-100">
           
           {/* Header */}
           <div className="flex justify-between items-center p-6 border-b border-slate-100 bg-white z-10 shrink-0">
               <div>
                   <h2 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-3">
                       {editedProduct.sku}
                       {editedProduct.is_component && <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded text-xs font-bold uppercase">Component</span>}
                   </h2>
                   <div className="flex gap-3 text-sm text-slate-500 font-medium mt-1">
                       <span>{editedProduct.category}</span>
                       <span>•</span>
                       <span>{editedProduct.gender}</span>
                   </div>
               </div>
               <div className="flex items-center gap-2">
                   {viewMode === 'registry' && (
                       <button onClick={requestDelete} disabled={isDeleting} className="p-2.5 bg-red-50 text-red-600 rounded-xl hover:bg-red-100 transition-colors mr-2">
                           <Trash2 size={20}/>
                       </button>
                   )}
                   <button onClick={onClose} className="p-2.5 bg-slate-100 text-slate-600 rounded-xl hover:bg-slate-200 transition-colors">
                       <X size={20}/>
                   </button>
               </div>
           </div>

           {/* Content */}
           <div className="flex-1 overflow-y-auto p-6 md:p-8 bg-slate-50/50">
               <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                   {/* Left Column: Image & Quick Stats */}
                   <div className="lg:col-span-4 space-y-6">
                       <div className="bg-white p-4 rounded-3xl border border-slate-100 shadow-sm relative group">
                           <div className="aspect-square bg-slate-100 rounded-2xl overflow-hidden relative">
                               {editedProduct.image_url ? (
                                   <img src={editedProduct.image_url} className="w-full h-full object-cover" alt={editedProduct.sku}/>
                               ) : (
                                   <div className="w-full h-full flex items-center justify-center text-slate-300"><ImageIcon size={48}/></div>
                               )}
                               
                               <label className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer">
                                   <div className="bg-white/20 backdrop-blur-md text-white px-4 py-2 rounded-xl font-bold flex items-center gap-2 border border-white/30">
                                       <Camera size={18}/> {isUploadingImage ? 'Μεταφόρτωση...' : 'Αλλαγή'}
                                   </div>
                                   <input type="file" className="hidden" accept="image/*" onChange={handleImageUpdate} disabled={isUploadingImage}/>
                               </label>
                           </div>
                       </div>

                       <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm space-y-4">
                           <h3 className="font-bold text-slate-700 flex items-center gap-2 border-b border-slate-100 pb-2">
                               <TrendingUp size={18} className="text-emerald-500"/> Οικονομικά
                           </h3>
                           
                           <div className="flex justify-between items-center text-sm">
                               <span className="text-slate-500">Κόστος (Master)</span>
                               <span className="font-mono font-bold text-slate-800">{formatCurrency(masterCost)}</span>
                           </div>
                           
                           {!editedProduct.is_component && (
                               <>
                               <div className="flex justify-between items-center text-sm">
                                   <span className="text-slate-500">Τιμή Πώλησης</span>
                                   <span className="font-mono font-bold text-emerald-600">{formatCurrency(editedProduct.selling_price)}</span>
                               </div>
                               <div className="w-full h-px bg-slate-100"></div>
                               <div className="flex justify-between items-center text-xs">
                                   <span className="font-bold text-slate-400 uppercase">Περιθωριο</span>
                                   <span className={`font-black ${displayedMargin < 30 ? 'text-red-500' : 'text-emerald-600'}`}>{displayedMargin.toFixed(0)}%</span>
                               </div>
                               </>
                           )}
                       </div>
                   </div>

                   {/* Right Column: Details & Editing */}
                   <div className="lg:col-span-8 space-y-6">
                       
                       {/* TABS */}
                       <div className="flex gap-2 bg-slate-200/50 p-1.5 rounded-2xl w-fit">
                           {[
                               { id: 'overview', label: 'Στοιχεία', icon: Info },
                               { id: 'recipe', label: 'Συνταγή', icon: Box },
                               { id: 'labor', label: 'Εργατικά', icon: Hammer },
                               { id: 'variants', label: `Παραλλαγές (${variants.length})`, icon: Layers },
                               { id: 'barcodes', label: 'Barcodes', icon: ScanBarcode },
                           ].map(tab => (
                               <button 
                                   key={tab.id}
                                   onClick={() => setActiveTab(tab.id as any)}
                                   className={`px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-all ${activeTab === tab.id ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                               >
                                   <tab.icon size={16} className={activeTab === tab.id ? 'text-amber-500' : ''}/> {tab.label}
                               </button>
                           ))}
                       </div>

                       {/* TAB CONTENT */}
                       <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm min-h-[400px]">
                           {activeTab === 'overview' && (
                               <div className="space-y-6 animate-in fade-in">
                                   <div className="grid grid-cols-2 gap-6">
                                       <div>
                                           <label className="text-xs font-bold text-slate-400 uppercase tracking-wide">Κατηγορία</label>
                                           <input className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl mt-1 font-medium" value={editedProduct.category} onChange={e => setEditedProduct({...editedProduct, category: e.target.value})} />
                                       </div>
                                       <div>
                                           <label className="text-xs font-bold text-slate-400 uppercase tracking-wide">Βάρος (g)</label>
                                           <input type="number" step="0.01" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl mt-1 font-bold font-mono" value={editedProduct.weight_g} onChange={e => setEditedProduct({...editedProduct, weight_g: parseFloat(e.target.value) || 0})} />
                                       </div>
                                       <div>
                                           <label className="text-xs font-bold text-slate-400 uppercase tracking-wide">{secondaryWeightLabel}</label>
                                           <input type="number" step="0.01" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl mt-1 font-bold font-mono" value={editedProduct.secondary_weight_g} onChange={e => setEditedProduct({...editedProduct, secondary_weight_g: parseFloat(e.target.value) || 0})} />
                                       </div>
                                        <div>
                                            <label className="text-xs font-bold text-slate-400 uppercase tracking-wide">Φύλο</label>
                                            <select className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl mt-1 font-medium" value={editedProduct.gender} onChange={e => setEditedProduct({...editedProduct, gender: e.target.value as Gender})}>
                                                <option value={Gender.Women}>Γυναικείο</option>
                                                <option value={Gender.Men}>Ανδρικό</option>
                                                <option value={Gender.Unisex}>Unisex</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="text-xs font-bold text-slate-400 uppercase tracking-wide">Βασική Επιμετάλλωση</label>
                                            <select className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl mt-1 font-medium" value={editedProduct.plating_type} onChange={e => setEditedProduct({...editedProduct, plating_type: e.target.value as PlatingType})}>
                                                <option value={PlatingType.None}>Λουστρέ</option>
                                                <option value={PlatingType.GoldPlated}>Επίχρυσο</option>
                                                <option value={PlatingType.TwoTone}>Δίχρωμο</option>
                                                <option value={PlatingType.Platinum}>Πλατίνα</option>
                                            </select>
                                        </div>
                                       {!editedProduct.is_component && (
                                           <div>
                                               <label className="text-xs font-bold text-slate-400 uppercase tracking-wide">Τιμή Πώλησης (€)</label>
                                               <div className="flex gap-2">
                                                   <input type="number" step="0.01" className="w-full p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl mt-1 font-bold font-mono" value={editedProduct.selling_price} onChange={e => setEditedProduct({...editedProduct, selling_price: parseFloat(e.target.value) || 0})} />
                                                   <button onClick={() => setShowRepriceTool(!showRepriceTool)} className="mt-1 p-3 bg-slate-100 hover:bg-slate-200 rounded-xl text-slate-600"><Calculator size={20}/></button>
                                               </div>
                                           </div>
                                       )}
                                   </div>

                                   {showRepriceTool && (
                                       <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 animate-in slide-in-from-top-2">
                                           <h4 className="font-bold text-blue-800 text-sm mb-3 flex items-center gap-2"><TrendingUp size={16}/> Εργαλείο Ανατιμολόγησης</h4>
                                           <div className="flex items-end gap-4">
                                               <div>
                                                   <label className="text-[10px] font-bold text-blue-600 uppercase">Στόχος Margin (%)</label>
                                                   <input type="number" value={targetMargin} onChange={e => { setTargetMargin(parseFloat(e.target.value)); updateCalculatedPrice(parseFloat(e.target.value)); }} className="w-24 p-2 rounded-lg border border-blue-200 font-bold text-center"/>
                                               </div>
                                               <div>
                                                   <label className="text-[10px] font-bold text-blue-600 uppercase">Προτεινόμενη Τιμή</label>
                                                   <div className="font-mono font-black text-xl text-blue-900">{calculatedPrice}€</div>
                                               </div>
                                               <button onClick={applyReprice} className="bg-blue-600 text-white px-4 py-2 rounded-lg font-bold text-sm hover:bg-blue-700">Εφαρμογή</button>
                                           </div>
                                       </div>
                                   )}
                                   
                                   {/* Molds Section - Only for InHouse */}
                                   {editedProduct.production_type === ProductionType.InHouse && (
                                       <div>
                                            <h4 className="font-bold text-slate-700 mb-3 flex items-center justify-between">
                                                <span className="flex items-center gap-2"><MapPin size={18} className="text-amber-500"/> Λάστιχα</span>
                                                <button onClick={() => setIsAddingMold(prev => !prev)} className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold px-3 py-1.5 rounded-lg transition-colors">
                                                    {isAddingMold ? 'Ακύρωση' : 'Προσθήκη'}
                                                </button>
                                            </h4>
                                           <div className="flex flex-wrap gap-2 mb-4">
                                                {editedProduct.molds.map(m => {
                                                    const moldDetails = allMolds.find(mold => mold.code === m.code);
                                                    const tooltipText = moldDetails ? `${moldDetails.description}${moldDetails.location ? ` (${moldDetails.location})` : ''}` : '';
                                                    return (
                                                        <div key={m.code} title={tooltipText} className="bg-amber-50 border border-amber-200 text-amber-800 px-3 py-1.5 rounded-lg text-sm font-bold flex items-center gap-2">
                                                            {m.code} {m.quantity > 1 && `(x${m.quantity})`}
                                                            <div className="flex flex-col gap-0.5 ml-1">
                                                                <button onClick={() => updateMoldQuantity(m.code, 1)} className="text-amber-400 hover:text-amber-600"><ChevronLeft size={10} className="rotate-90"/></button>
                                                                <button onClick={() => updateMoldQuantity(m.code, -1)} className="text-amber-400 hover:text-amber-600"><ChevronRight size={10} className="rotate-90"/></button>
                                                            </div>
                                                            <button onClick={() => removeMold(m.code)} className="text-amber-400 hover:text-red-500 ml-1"><X size={14}/></button>
                                                        </div>
                                                    );
                                                })}
                                               {editedProduct.molds.length === 0 && <span className="text-slate-400 text-sm italic">Κανένα λάστιχο.</span>}
                                           </div>
                                           {isAddingMold && (
                                               <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-xl p-2 bg-slate-50 space-y-1 animate-in fade-in">
                                                   {availableMolds.map(m => (
                                                       <button key={m.code} onClick={() => addMold(m.code)} className="w-full text-left p-2 hover:bg-white rounded-lg flex justify-between items-center group text-sm">
                                                           <span className="font-bold text-slate-700">{m.code}</span>
                                                           <span className="text-xs text-slate-400 group-hover:text-amber-600">{m.description}</span>
                                                       </button>
                                                   ))}
                                                   {availableMolds.length === 0 && <div className="text-center text-xs text-slate-400 p-2">Δεν υπάρχουν άλλα διαθέσιμα λάστιχα.</div>}
                                               </div>
                                           )}
                                       </div>
                                   )}
                               </div>
                           )}

                           {activeTab === 'recipe' && (
                               <div className="space-y-4 animate-in fade-in">
                                   {editedProduct.recipe.map((item, idx) => {
                                       const isRaw = item.type === 'raw';
                                       const details = isRaw ? allMaterials.find(m => m.id === item.id) : allProducts.find(p => p.sku === item.sku);
                                       
                                       return (
                                           <div key={idx} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                                               <div className="p-2 bg-white rounded-lg border border-slate-100">
                                                   {isRaw ? <Gem size={16} className="text-emerald-500"/> : <Puzzle size={16} className="text-blue-500"/>}
                                               </div>
                                               <div className="flex-1">
                                                   {isRaw ? (
                                                       <select 
                                                           className="bg-transparent font-bold text-slate-800 outline-none w-full"
                                                           value={item.id}
                                                           onChange={(e) => updateRecipeItem(idx, 'id', e.target.value)}
                                                       >
                                                           {allMaterials.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                                                       </select>
                                                   ) : (
                                                       <select 
                                                           className="bg-transparent font-bold text-slate-800 outline-none w-full"
                                                           value={item.sku}
                                                           onChange={(e) => updateRecipeItem(idx, 'sku', e.target.value)}
                                                       >
                                                           {allProducts.filter(p => p.is_component).map(p => <option key={p.sku} value={p.sku}>{p.sku} - {p.category}</option>)}
                                                       </select>
                                                   )}
                                               </div>
                                               <div className="flex items-center gap-2">
                                                   <input type="number" className="w-16 p-1 text-center font-bold bg-white rounded border border-slate-200 outline-none" value={item.quantity} onChange={e => updateRecipeItem(idx, 'quantity', e.target.value)}/>
                                                   <span className="text-xs text-slate-400 font-bold w-8">{isRaw ? (details as Material)?.unit : 'τεμ'}</span>
                                               </div>
                                               <button onClick={() => removeRecipeItem(idx)} className="text-slate-400 hover:text-red-500"><Trash2 size={18}/></button>
                                           </div>
                                       );
                                   })}
                                   <div className="flex gap-2 pt-4">
                                       <button onClick={() => addRecipeItem('raw')} className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-xs font-bold text-slate-600 transition-colors flex items-center justify-center gap-2"><Plus size={14}/> Υλικό</button>
                                       <button onClick={() => addRecipeItem('component')} className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-xs font-bold text-slate-600 transition-colors flex items-center justify-center gap-2"><Plus size={14}/> Εξάρτημα</button>
                                   </div>
                               </div>
                           )}

                           {activeTab === 'labor' && (
                               <div className="space-y-4 animate-in fade-in">
                                   <div className="grid grid-cols-2 gap-4">
                                       <LaborCostInput label="Χυτήριο" value={editedProduct.labor.casting_cost} onChange={v => setEditedProduct(p => ({...p, labor: {...p.labor, casting_cost: v}}))} />
                                       <LaborCostInput label="Καρφωτής" value={editedProduct.labor.setter_cost} onChange={v => setEditedProduct(p => ({...p, labor: {...p.labor, setter_cost: v}}))} />
                                       <LaborCostInput 
                                           label="Τεχνίτης" 
                                           value={editedProduct.labor.technician_cost} 
                                           onChange={v => setEditedProduct(p => ({...p, labor: {...p.labor, technician_cost: v}}))} 
                                           override={editedProduct.labor.technician_cost_manual_override} 
                                           onToggleOverride={() => setEditedProduct(p => ({...p, labor: {...p.labor, technician_cost_manual_override: !p.labor.technician_cost_manual_override}}))} 
                                       />
                                       <LaborCostInput 
                                           label="Επιμετάλλωση" 
                                           value={editedProduct.labor.plating_cost_x} 
                                           onChange={v => setEditedProduct(p => ({...p, labor: {...p.labor, plating_cost_x: v}}))} 
                                           override={editedProduct.labor.plating_cost_x_manual_override}
                                           onToggleOverride={() => setEditedProduct(p => ({...p, labor: {...p.labor, plating_cost_x_manual_override: !p.labor.plating_cost_x_manual_override}}))} 
                                       />
                                   </div>
                               </div>
                           )}

                           {activeTab === 'variants' && (
                               <div className="space-y-4 animate-in fade-in h-full flex flex-col">
                                   <div className="flex gap-2 mb-4 bg-slate-50 p-3 rounded-xl border border-slate-100">
                                       <div className="flex-1">
                                           <label className="text-[10px] font-bold text-slate-400 uppercase">Νέα Παραλλαγή (Suffix)</label>
                                           <div className="flex gap-2 mt-1">
                                               <input 
                                                   value={newVariantSuffix} 
                                                   onChange={e => setNewVariantSuffix(e.target.value.toUpperCase())}
                                                   placeholder="π.χ. PKR" 
                                                   className="flex-1 p-2 border border-slate-200 rounded-lg text-sm uppercase font-mono font-bold outline-none focus:border-emerald-500"
                                               />
                                               <button onClick={handleManualAdd} className="bg-emerald-600 text-white px-4 rounded-lg font-bold hover:bg-emerald-700 transition-colors"><Plus/></button>
                                           </div>
                                       </div>
                                       <div className="w-px bg-slate-200 mx-2"></div>
                                       <div className="flex-1">
                                           <label className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-1"><Wand2 size={10} className="text-purple-500"/> Smart Add</label>
                                           <div className="flex gap-2 mt-1">
                                               <input 
                                                   value={smartAddSuffix} 
                                                   onChange={e => setSmartAddSuffix(e.target.value.toUpperCase())}
                                                   placeholder="π.χ. XKR" 
                                                   className="flex-1 p-2 border border-slate-200 rounded-lg text-sm uppercase font-mono font-bold outline-none focus:border-purple-500"
                                               />
                                               <button onClick={handleSmartAdd} className="bg-purple-600 text-white px-4 rounded-lg font-bold hover:bg-purple-700 transition-colors"><Plus/></button>
                                           </div>
                                       </div>
                                   </div>

                                   <div className="flex-1 overflow-y-auto pr-1 space-y-2 max-h-[300px]">
                                       {sortedVariantsList.map((variant, index) => (
                                           <div key={index} className="flex items-center gap-3 p-3 bg-white border border-slate-100 rounded-xl shadow-sm group hover:border-slate-300 transition-colors">
                                               <div className="font-mono font-bold text-emerald-700 w-12 text-center">{variant.suffix}</div>
                                               <input 
                                                   value={variant.description} 
                                                   onChange={e => updateVariant(index, 'description', e.target.value)}
                                                   className="flex-1 text-sm bg-transparent outline-none border-b border-transparent hover:border-slate-200 focus:border-emerald-500 transition-all text-slate-700"
                                               />
                                               <div className="text-xs font-mono text-slate-400">
                                                   <span className="font-bold text-slate-600">{variant.active_price?.toFixed(2)}€</span> cost
                                               </div>
                                               {!editedProduct.is_component && (
                                                   <div className="flex items-center gap-1">
                                                       <input 
                                                           type="number" step="0.01" 
                                                           value={variant.selling_price || ''} 
                                                           onChange={e => updateVariant(index, 'selling_price', parseFloat(e.target.value))}
                                                           className="w-16 text-right font-bold text-emerald-600 text-sm bg-slate-50 rounded p-1 outline-none focus:ring-1 focus:ring-emerald-500"
                                                       />
                                                       <span className="text-xs font-bold text-emerald-600">€</span>
                                                   </div>
                                               )}
                                               <button onClick={() => deleteVariant(index)} className="p-2 text-slate-300 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100">
                                                   <Trash2 size={16}/>
                                               </button>
                                           </div>
                                       ))}
                                       {sortedVariantsList.length === 0 && <div className="text-center text-slate-400 text-sm italic py-10">Δεν υπάρχουν παραλλαγές.</div>}
                                   </div>
                               </div>
                           )}

                           {activeTab === 'barcodes' && (
                               <div className="h-full flex flex-col">
                                   <div className="flex justify-end mb-4">
                                       <button onClick={handlePrintAll} className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-xl font-bold hover:bg-black transition-colors shadow-lg">
                                           <Printer size={16}/> Εκτύπωση Όλων
                                       </button>
                                   </div>
                                   <div className="flex-1 overflow-y-auto grid grid-cols-2 gap-4">
                                       {sortedVariantsList.length === 0 && (
                                           <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col items-center justify-center cursor-pointer hover:bg-white transition-colors" onClick={() => setPrintItems([{ product: editedProduct, quantity: 1 }])}>
                                               <div className="w-full h-24 mb-2 bg-white rounded border border-slate-100 flex items-center justify-center overflow-hidden">
                                                   <BarcodeView product={editedProduct} width={settings.barcode_width_mm} height={settings.barcode_height_mm} />
                                               </div>
                                               <span className="font-bold text-sm text-slate-700">Master SKU</span>
                                           </div>
                                       )}
                                       {sortedVariantsList.map((v, i) => (
                                           <div key={i} className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col items-center justify-center cursor-pointer hover:bg-white transition-colors" onClick={() => setPrintItems([{ product: editedProduct, variant: v, quantity: 1 }])}>
                                               <div className="w-full h-24 mb-2 bg-white rounded border border-slate-100 flex items-center justify-center overflow-hidden">
                                                   <BarcodeView product={editedProduct} variant={v} width={settings.barcode_width_mm} height={settings.barcode_height_mm} />
                                               </div>
                                               <span className="font-bold text-sm text-slate-700">{v.suffix}</span>
                                           </div>
                                       ))}
                                   </div>
                               </div>
                           )}
                       </div>
                   </div>
               </div>
           </div>

           {/* Footer */}
           <div className="p-6 border-t border-slate-100 bg-white z-10 shrink-0 flex justify-end gap-4">
               <button onClick={onClose} className="px-6 py-3 rounded-xl font-bold text-slate-500 hover:bg-slate-50 transition-colors">
                   Ακύρωση
               </button>
               <button onClick={handleSave} className="px-8 py-3 rounded-xl font-bold text-white bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-200 transition-all hover:-translate-y-0.5 flex items-center gap-2">
                   <Save size={18}/> Αποθήκευση Αλλαγών
               </button>
           </div>

        </div>
      </div>,
      document.body
  );
}
