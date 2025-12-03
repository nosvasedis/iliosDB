
import React, { useState, useEffect, useMemo } from 'react';
import { Product, Material, Gender, PlatingType, RecipeItem, LaborCost, Mold, ProductVariant } from '../types';
import { parseSku, calculateProductCost, analyzeSku, calculateTechnicianCost, calculatePlatingCost, estimateVariantCost, analyzeSuffix, getVariantComponents } from '../utils/pricingEngine';
import { Plus, Trash2, Camera, Box, Upload, Loader2, ArrowRight, ArrowLeft, CheckCircle, Lightbulb, Wand2, Percent, Search, ImageIcon, Lock, Unlock, MapPin, Tag, Layers, RefreshCw, DollarSign, Calculator, Crown, Coins, Hammer, Flame, Users, Palette } from 'lucide-react';
import { supabase, uploadProductImage } from '../lib/supabase';
import { compressImage } from '../utils/imageHelpers';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { api } from '../lib/supabase';
import { useUI } from './UIProvider';
import { FINISH_CODES } from '../constants';

interface Props {
  products: Product[];
  materials: Material[];
  molds?: Mold[];
  onCancel?: () => void;
}

const STEPS = [
  { id: 1, title: 'Στοιχεία' },
  { id: 2, title: 'Συνταγή' },
  { id: 3, title: 'Εργατικά' },
  { id: 4, title: 'Παραλλαγές' },
  { id: 5, title: 'Σύνοψη' }
];

// Helper Component for Labor Inputs
const LaborCostCard = ({ icon, label, value, onChange, isOverridden, onToggleOverride, readOnly = false, hint }: {
    icon: React.ReactNode;
    label: string;
    value: number;
    onChange?: (value: number) => void;
    isOverridden?: boolean;
    onToggleOverride?: () => void;
    readOnly?: boolean;
    hint?: string;
}) => (
    <div className="bg-white p-4 rounded-xl border border-slate-200">
        <label className="text-xs font-bold text-slate-400 uppercase tracking-wide flex items-center justify-between">
            <span className="flex items-center gap-2">{icon} {label}</span>
            {onToggleOverride && (
                <button onClick={onToggleOverride} className="text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-100 transition-colors">
                    {isOverridden ? <Unlock size={14}/> : <Lock size={14}/>}
                </button>
            )}
        </label>
        <div className="relative mt-1">
            <input 
                type="number" step="0.01" 
                value={value}
                readOnly={readOnly || (onToggleOverride && !isOverridden)}
                onChange={!readOnly && onChange ? (e => onChange(parseFloat(e.target.value) || 0)) : undefined}
                className={`w-full bg-transparent font-mono font-bold text-lg outline-none pr-2 transition-colors ${readOnly || (onToggleOverride && !isOverridden) ? 'text-slate-500' : 'text-slate-800'}`}
            />
        </div>
        {hint && <p className="text-[10px] text-slate-400 mt-1">{hint}</p>}
    </div>
);

const SummaryRow = ({ label, value, sub, color }: { label: string, value: number, sub?: string, color: string }) => (
    <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100/50 hover:bg-slate-100 transition-colors">
        <div className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full shadow-sm ${color}`}></div>
            <span className="text-sm font-bold text-slate-600">{label}</span>
        </div>
        <div className="text-right">
            <div className="font-mono font-bold text-slate-800">{value.toFixed(2)}€</div>
            {sub && <div className="text-[10px] text-slate-400 font-medium">{sub}</div>}
        </div>
    </div>
);


export default function NewProduct({ products, materials, molds = [], onCancel }: Props) {
  const queryClient = useQueryClient();
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: api.getSettings });
  const [currentStep, setCurrentStep] = useState(1);
  const { showToast } = useUI();

  // Form State
  const [sku, setSku] = useState('');
  const [category, setCategory] = useState('');
  const [gender, setGender] = useState<Gender | ''>('');
  const [isCategoryManuallySet, setIsCategoryManuallySet] = useState(false);
  const [isGenderManuallySet, setIsGenderManuallySet] = useState(false);
  
  const [weight, setWeight] = useState(0);
  const [secondaryWeight, setSecondaryWeight] = useState(0);
  const [plating, setPlating] = useState<PlatingType>(PlatingType.None);
  
  const [sellingPrice, setSellingPrice] = useState(0); // Master Wholesale
  
  const [recipe, setRecipe] = useState<RecipeItem[]>([]);
  const [labor, setLabor] = useState<LaborCost>({ 
    casting_cost: 0, 
    setter_cost: 0, 
    technician_cost: 0, 
    plating_cost_x: 0, 
    plating_cost_d: 0, 
    technician_cost_manual_override: false,
    plating_cost_x_manual_override: false,
    plating_cost_d_manual_override: false
  });
  
  // Variants State
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [newVariantSuffix, setNewVariantSuffix] = useState('');
  const [newVariantDesc, setNewVariantDesc] = useState('');
  const [newVariantPrice, setNewVariantPrice] = useState(0); // New: Pre-add price input
  
  // Image State
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>('');
  const [isUploading, setIsUploading] = useState(false);

  // Molds Multi-Select & Creation State
  const [selectedMolds, setSelectedMolds] = useState<string[]>([]);
  const [moldSearch, setMoldSearch] = useState('');
  
  // New Mold Creator State
  const [newMoldCode, setNewMoldCode] = useState('');
  const [newMoldLoc, setNewMoldLoc] = useState('');
  const [newMoldDesc, setNewMoldDesc] = useState('');
  const [isCreatingMold, setIsCreatingMold] = useState(false);
  
  const [isSTX, setIsSTX] = useState(false);
  const [masterEstimatedCost, setMasterEstimatedCost] = useState(0);
  const [costBreakdown, setCostBreakdown] = useState<{silver: number, materials: number, labor: number} | null>(null);

  // Smart SKU Detection State
  const [detectedMasterSku, setDetectedMasterSku] = useState('');
  const [detectedSuffix, setDetectedSuffix] = useState('');
  const [detectedVariantDesc, setDetectedVariantDesc] = useState('');
  const [detectedFinishCode, setDetectedFinishCode] = useState('');

  // Auto-Suggest Logic & Smart SKU Analysis
  useEffect(() => {
    const skuTrimmed = sku.trim();
    if (skuTrimmed.length >= 2) {
      // 1. Analyze Category/Gender, guarded by manual override flags
      const meta = parseSku(skuTrimmed);
      if (meta.category !== 'Γενικό' && !isCategoryManuallySet) {
         setCategory(meta.category);
      }
      if (meta.gender && !isGenderManuallySet) {
         setGender(meta.gender as Gender);
      }
      setIsSTX(skuTrimmed.startsWith('STX'));
      
      // 2. Smart Suffix Analysis (always runs to keep detection fresh)
      const analysis = analyzeSku(skuTrimmed, gender as Gender);
      const { finish } = getVariantComponents(analysis.suffix, gender as Gender);
      setDetectedFinishCode(finish.code);
      
      if (analysis.isVariant) {
          setDetectedMasterSku(analysis.masterSku);
          setDetectedSuffix(analysis.suffix);
          setDetectedVariantDesc(analysis.variantDescription);
          setPlating(analysis.detectedPlating);
      } else {
          setDetectedMasterSku(skuTrimmed.toUpperCase());
          setDetectedSuffix('');
          setDetectedVariantDesc('');
          setPlating(PlatingType.None);
      }
    } else {
        // BUG FIX: Reset ALL derived fields and manual locks when SKU is empty.
        setCategory('');
        setGender('');
        setIsSTX(false);
        setDetectedMasterSku('');
        setDetectedSuffix('');
        setDetectedVariantDesc('');
        setIsCategoryManuallySet(false);
        setIsGenderManuallySet(false);
        setDetectedFinishCode('');
    }
  }, [sku, gender]);

  const platingNoneLabel = useMemo(() => {
    if (detectedFinishCode === 'P') {
        return FINISH_CODES['P'];
    }
    return FINISH_CODES['']; // Default to Lustre
  }, [detectedFinishCode]);

  // Sync detected suffix to variants form inputs (Interconnection Step 1 -> Step 4)
  useEffect(() => {
      if (detectedSuffix) {
          // If the detected suffix is not already in the list, pre-fill the form
          const exists = variants.some(v => v.suffix === detectedSuffix);
          if (!exists) {
              setNewVariantSuffix(detectedSuffix);
              setNewVariantDesc(detectedVariantDesc);
          }
      }
  }, [detectedSuffix, detectedVariantDesc, variants]);

  // Sync Variant Price with Master Price (Interconnection Step 1 -> Step 4)
  useEffect(() => {
      // Always keep the "New Variant Price" input in sync with Master Price 
      // to save typing, assuming most variants share the base wholesale price.
      setNewVariantPrice(sellingPrice);
  }, [sellingPrice]);

  // Dynamic Technician Cost Calculation
  useEffect(() => {
    if (!labor.technician_cost_manual_override) {
      const techCost = calculateTechnicianCost(weight);
      setLabor(prevLabor => ({...prevLabor, technician_cost: techCost}));
    }
  }, [weight, labor.technician_cost_manual_override]);
  
  // Dynamic Casting Cost Calculation
  useEffect(() => {
    const totalWeight = (weight || 0) + (secondaryWeight || 0);
    const castCost = parseFloat((totalWeight * 0.15).toFixed(2));
    setLabor(prevLabor => ({...prevLabor, casting_cost: castCost}));
  }, [weight, secondaryWeight]);
  
  // Auto-calculate Plating Cost X based on main weight
  useEffect(() => {
    if (!labor.plating_cost_x_manual_override) {
      const costX = parseFloat((weight * 0.60).toFixed(2));
      setLabor(prev => ({ ...prev, plating_cost_x: costX }));
    }
  }, [weight, labor.plating_cost_x_manual_override]);

  // Auto-calculate Plating Cost D based on secondary weight
  useEffect(() => {
    if (!labor.plating_cost_d_manual_override) {
      const costD = parseFloat((secondaryWeight * 0.60).toFixed(2));
      setLabor(prev => ({ ...prev, plating_cost_d: costD }));
    }
  }, [secondaryWeight, labor.plating_cost_d_manual_override]);


  // Cost Calculator Effect
  useEffect(() => {
    if (!settings) return;
    const tempProduct: Product = {
      sku: detectedMasterSku || sku,
      prefix: sku.substring(0, 2),
      category: category,
      gender: gender as Gender || Gender.Unisex,
      image_url: imagePreview,
      weight_g: weight,
      secondary_weight_g: secondaryWeight,
      plating_type: plating,
      active_price: 0,
      draft_price: 0,
      selling_price: 0,
      stock_qty: 0,
      sample_qty: 0,
      molds: selectedMolds,
      is_component: isSTX,
      recipe: recipe,
      labor
    };
    const cost = calculateProductCost(tempProduct, settings, materials, products);
    setMasterEstimatedCost(cost.total);
    setCostBreakdown(cost.breakdown);
  }, [sku, detectedMasterSku, category, gender, weight, secondaryWeight, plating, recipe, labor, materials, imagePreview, selectedMolds, isSTX, products, settings]);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedImage(file);
      const previewUrl = URL.createObjectURL(file);
      setImagePreview(previewUrl);
    }
  };

  const addRawMaterial = () => {
    if (materials.length > 0) {
      setRecipe([...recipe, { type: 'raw', id: materials[0].id, quantity: 1 }]);
    }
  };

  const addComponent = () => {
    const stxProducts = products.filter(p => p.is_component);
    if (stxProducts.length > 0) {
      setRecipe([...recipe, { type: 'component', sku: stxProducts[0].sku, quantity: 1 }]);
    } else {
        showToast("Δεν υπάρχουν διαθέσιμα εξαρτήματα (STX).", "error");
    }
  };

  const updateRecipeItem = (index: number, field: string, value: any) => {
    const newRecipe = [...recipe];
    const item = newRecipe[index];
    if (field === 'quantity') item.quantity = parseFloat(value);
    else if (field === 'id' && item.type === 'raw') item.id = value;
    else if (field === 'sku' && item.type === 'component') item.sku = value;
    setRecipe(newRecipe);
  };

  const removeRecipeItem = (index: number) => {
    setRecipe(recipe.filter((_, i) => i !== index));
  };

  const toggleMold = (code: string) => {
      if (selectedMolds.includes(code)) setSelectedMolds(selectedMolds.filter(m => m !== code));
      else setSelectedMolds([...selectedMolds, code]);
  };

  const handleQuickCreateMold = async () => {
      if (!newMoldCode) { showToast("Ο Κωδικός είναι υποχρεωτικός.", "error"); return; }
      setIsCreatingMold(true);
      try {
          const newMold: Mold = { code: newMoldCode.toUpperCase(), location: newMoldLoc, description: newMoldDesc };
          const { error } = await supabase.from('molds').insert(newMold);
          if (error) throw error;
          await queryClient.invalidateQueries({ queryKey: ['molds'] });
          setSelectedMolds(prev => [...prev, newMold.code]);
          setNewMoldCode(''); setNewMoldLoc(''); setNewMoldDesc('');
          showToast(`Το λάστιχο ${newMold.code} επιλέχθηκε!`, "success");
      } catch (err: any) {
          showToast("Σφάλμα δημιουργίας.", "error");
      } finally { setIsCreatingMold(false); }
  };

  // SMART MOLD SUGGESTIONS
  const { suggestedMolds, otherMolds } = useMemo(() => {
    const upperSku = sku.toUpperCase();
    let suggestionKeyword: string | null = null;

    if (upperSku.startsWith('PN') || upperSku.startsWith('MN')) {
        suggestionKeyword = 'κρίκος';
    } else if (upperSku.startsWith('SK')) {
        suggestionKeyword = 'καβαλάρης';
    }

    const allMoldsFilteredBySearch = molds
      .filter(m => 
          m.code.toUpperCase().includes(moldSearch.toUpperCase()) || 
          m.description.toLowerCase().includes(moldSearch.toLowerCase())
      );

    let suggested: Mold[] = [];
    let others: Mold[] = [];

    if (suggestionKeyword) {
        allMoldsFilteredBySearch.forEach(m => {
            if (m.description.toLowerCase().includes(suggestionKeyword!)) {
                suggested.push(m);
            } else {
                others.push(m);
            }
        });
    } else {
        others = allMoldsFilteredBySearch;
    }
    
    const sortFn = (a: Mold, b: Mold) => a.code.localeCompare(b.code, undefined, { numeric: true });
    
    suggested.sort(sortFn);
    others.sort(sortFn);

    return { suggestedMolds: suggested, otherMolds: others };
  }, [molds, moldSearch, sku]);

  // --- VARIANT MANAGEMENT ---
  
  // Auto-analyze suffix for new variant - UPDATED LOGIC with Gender Awareness
  useEffect(() => {
      if (newVariantSuffix) {
          const desc = analyzeSuffix(newVariantSuffix, gender as Gender);
          // Always update description if analysis finds a match, enabling dynamic updates as user types (e.g., P -> P-Code)
          if (desc) setNewVariantDesc(desc);
      }
  }, [newVariantSuffix, gender]);

  const handleAddVariant = () => {
      if (!newVariantSuffix) { showToast("Η κατάληξη είναι υποχρεωτική.", "error"); return; }
      
      const upperSuffix = newVariantSuffix.toUpperCase();
      if (variants.some(v => v.suffix === upperSuffix)) { showToast("Αυτή η παραλλαγή υπάρχει ήδη.", "error"); return; }

      // Calculate Estimated Cost
      const tempMaster: Product = {
          sku: detectedMasterSku || sku,
          prefix: sku.substring(0, 2),
          category, 
          gender: gender as Gender, 
          weight_g: weight, 
          secondary_weight_g: secondaryWeight,
          plating_type: plating,
          image_url: imagePreview || null,
          active_price: masterEstimatedCost, 
          draft_price: masterEstimatedCost,
          selling_price: sellingPrice,
          stock_qty: 0, 
          sample_qty: 0, 
          molds: [], 
          is_component: isSTX, 
          recipe, 
          labor
      };

      const estimatedCost = estimateVariantCost(
          tempMaster, 
          upperSuffix, 
          settings!, 
          materials, 
          products
      );
      
      const newV: ProductVariant = {
          suffix: upperSuffix,
          description: newVariantDesc,
          stock_qty: 0,
          active_price: parseFloat(estimatedCost.toFixed(2)),
          selling_price: newVariantPrice > 0 ? newVariantPrice : sellingPrice // Use input price
      };

      setVariants([...variants, newV]);
      setNewVariantSuffix('');
      setNewVariantDesc('');
      showToast(`Προστέθηκε η παραλλαγή ${upperSuffix}`, "success");
  };

  const updateVariant = (index: number, field: keyof ProductVariant, value: any) => {
      const updated = [...variants];
      updated[index] = { ...updated[index], [field]: value };
      setVariants(updated);
  };

  const removeVariant = (index: number) => {
      setVariants(variants.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    // FAILSAFE: Weight Check
    if (!weight || weight <= 0) { 
        showToast("Το Βάρος (g) είναι υποχρεωτικό.", "error"); 
        setCurrentStep(3); // Auto-navigate back to step 3
        return; 
    }

    if (!sku) { showToast("Το SKU είναι υποχρεωτικό", "error"); setCurrentStep(1); return; }
    if (!category) { showToast("Η Κατηγορία είναι υποχρεωτική", "error"); setCurrentStep(1); return; }
    if (!gender) { showToast("Το Φύλο είναι υποχρεωτικό", "error"); setCurrentStep(1); return; }

    setIsUploading(true);
    let finalImageUrl: string | null = null; 
    const finalMasterSku = (detectedMasterSku || sku).toUpperCase().trim();

    try {
        let existingStockQty = 0;
        let existingSampleQty = 0;
        
        const { data: existingProd } = await supabase.from('products').select('stock_qty, sample_qty, image_url').eq('sku', finalMasterSku).single();

        if (existingProd) {
            existingStockQty = existingProd.stock_qty || 0;
            existingSampleQty = existingProd.sample_qty || 0;
            if (!selectedImage && existingProd.image_url) finalImageUrl = existingProd.image_url;
        }

        if (selectedImage) {
            const compressedBlob = await compressImage(selectedImage);
            finalImageUrl = await uploadProductImage(compressedBlob, finalMasterSku);
        }

        // Persist Master
        const { error: prodError } = await supabase.from('products').upsert({
            sku: finalMasterSku,
            prefix: finalMasterSku.substring(0, 2),
            category,
            gender,
            image_url: finalImageUrl,
            weight_g: Number(weight) || 0,
            secondary_weight_g: Number(secondaryWeight) || null,
            plating_type: plating,
            active_price: masterEstimatedCost,
            draft_price: masterEstimatedCost,
            selling_price: sellingPrice,
            stock_qty: existingStockQty,
            sample_qty: existingSampleQty,
            is_component: isSTX,
            labor_casting: Number(labor.casting_cost),
            labor_setter: Number(labor.setter_cost),
            labor_technician: Number(labor.technician_cost),
            labor_plating_x: Number(labor.plating_cost_x || 0),
            labor_plating_d: Number(labor.plating_cost_d || 0),
            technician_cost_manual_override: labor.technician_cost_manual_override,
            // Add manual overrides for plating
            plating_cost_x_manual_override: labor.plating_cost_x_manual_override,
            plating_cost_d_manual_override: labor.plating_cost_d_manual_override
        });

        if (prodError) throw prodError;

        if (variants.length > 0) {
            for (const v of variants) {
                // Fetch existing stock to preserve it
                const { data: existV } = await supabase.from('product_variants').select('stock_qty').match({ product_sku: finalMasterSku, suffix: v.suffix }).single();
                const vStock = existV ? existV.stock_qty : 0;

                const { error: varError } = await supabase.from('product_variants').upsert({
                    product_sku: finalMasterSku,
                    suffix: v.suffix,
                    description: v.description,
                    stock_qty: vStock,
                    active_price: v.active_price,
                    selling_price: v.selling_price
                }, { onConflict: 'product_sku, suffix' });
                
                if (varError) throw varError;
            }
        }
        
        // Handle Recipes
        await supabase.from('recipes').delete().eq('parent_sku', finalMasterSku);
        if (recipe.length > 0) {
            const recipeInserts = recipe.map(r => ({
                parent_sku: finalMasterSku,
                type: r.type,
                material_id: r.type === 'raw' ? r.id : null,
                component_sku: r.type === 'component' ? r.sku : null,
                quantity: r.quantity
            }));
             await supabase.from('recipes').insert(recipeInserts);
        }
        
        // Handle Molds
        await supabase.from('product_molds').delete().eq('product_sku', finalMasterSku);
        if (selectedMolds.length > 0) {
             const moldInserts = selectedMolds.map(m => ({ product_sku: finalMasterSku, mold_code: m }));
             await supabase.from('product_molds').insert(moldInserts);
        }

        await queryClient.invalidateQueries({ queryKey: ['products'] });
        await queryClient.refetchQueries({ queryKey: ['products'] });

        showToast(`Το προϊόν ${finalMasterSku} αποθηκεύτηκε με ${variants.length} παραλλαγές!`, "success");
        
        if (onCancel) onCancel();
        else {
            setSku(''); setWeight(0); setRecipe([]); setSellingPrice(0); setSelectedMolds([]); setSelectedImage(null); setImagePreview(''); setVariants([]); setCurrentStep(1); setSecondaryWeight(0);
        }

    } catch (error: any) {
        console.error("Save error:", error);
        showToast(`Σφάλμα: ${error.message}`, "error");
    } finally {
        setIsUploading(false);
    }
  };

  const nextStep = () => setCurrentStep(prev => Math.min(prev + 1, 5));
  const prevStep = () => setCurrentStep(prev => Math.max(prev - 1, 1));
  
  const secondaryWeightLabel = useMemo(() => {
    if (gender === Gender.Men && category.includes('Δαχτυλίδι')) {
        return "Βάρος Καπακιού (g)";
    }
    if (gender === Gender.Women && (
        category.includes('Βραχιόλι') || 
        category.includes('Σκουλαρίκια') || 
        category.includes('Δαχτυλίδι') || 
        category.includes('Μενταγιόν')
    )) {
        return "Βάρος Καστονιού (g)";
    }
    return "Β' Βάρος (π.χ. Καστόνι) (g)";
  }, [gender, category]);

  const masterMargin = sellingPrice > 0 ? ((sellingPrice - masterEstimatedCost) / sellingPrice) * 100 : 0;

  return (
    <div className="max-w-7xl mx-auto h-[calc(100vh-140px)] flex flex-col">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
          <div className="flex items-center gap-4">
            {onCancel && (
                <button onClick={onCancel} className="p-2 hover:bg-slate-100 rounded-full text-slate-500 hover:text-slate-800 transition-colors">
                    <ArrowLeft size={24} />
                </button>
            )}
            <h1 className="text-3xl font-bold text-slate-800 flex items-center gap-3">
                <div className="p-2 bg-amber-100 rounded-xl text-amber-600">
                    <Wand2 size={24} />
                </div>
                Νέο Προϊόν
            </h1>
          </div>
          
          <div className="flex items-center gap-1 bg-white px-3 py-2 rounded-full shadow-sm border border-slate-100">
             {STEPS.map(s => (
                 <div key={s.id} className="flex items-center">
                    <div className={`
                        flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold transition-all duration-300 cursor-pointer
                        ${currentStep >= s.id ? 'bg-amber-500 text-white shadow-md shadow-amber-200' : 'bg-slate-100 text-slate-400'}
                    `} onClick={() => setCurrentStep(s.id)}>
                        {currentStep > s.id ? <CheckCircle size={14} /> : s.id}
                    </div>
                    {s.id !== 5 && <div className={`w-4 h-0.5 mx-1 rounded-full ${currentStep > s.id ? 'bg-amber-500' : 'bg-slate-200'}`} />}
                 </div>
             ))}
          </div>
      </div>

      <div className="flex-1 overflow-hidden">
        
        {/* === MAIN PANEL === */}
        <div className="h-full flex flex-col relative bg-white rounded-3xl shadow-lg shadow-slate-200/50 border border-slate-100 overflow-hidden">
            <div className="flex-1 overflow-y-auto p-8 scroll-smooth custom-scrollbar">
            
            {/* STEP 1: BASIC INFO & IMAGE */}
            {currentStep === 1 && (
                <div className="space-y-8 animate-in slide-in-from-right duration-300 fade-in">
                    <h3 className="text-xl font-bold text-slate-800 border-b border-slate-100 pb-4">1. Βασικά Στοιχεία</h3>
                    <div className="flex flex-col lg:flex-row gap-8">
                        <div className="w-full lg:w-1/3">
                            <label className="block text-sm font-bold text-slate-700 mb-2">Φωτογραφία</label>
                            <div className="relative group w-full aspect-square bg-slate-50 border-2 border-dashed border-slate-300 rounded-2xl overflow-hidden hover:border-amber-400 transition-all cursor-pointer shadow-inner">
                                {imagePreview ? <img src={imagePreview} className="w-full h-full object-cover" /> : <div className="flex flex-col items-center justify-center h-full text-slate-400 pointer-events-none"><ImageIcon size={32} className="opacity-50 mb-2"/><span className="text-xs font-bold">Επιλογή</span></div>}
                                <input type="file" accept="image/*" onChange={handleImageSelect} className="absolute inset-0 opacity-0 cursor-pointer z-50"/>
                            </div>
                        </div>
                        <div className="flex-1 space-y-5">
                            <div className="relative">
                            <label className="block text-sm font-bold text-slate-700 mb-1.5">SKU *</label>
                            <input type="text" value={sku} onChange={(e) => setSku(e.target.value.toUpperCase())} className="w-full p-3 border border-slate-200 rounded-xl font-mono uppercase bg-slate-50 focus:ring-4 focus:ring-amber-500/20 outline-none font-bold text-lg"/>
                            {detectedSuffix && <div className="mt-2 text-xs bg-blue-50 text-blue-700 p-2 rounded flex items-center gap-1"><Lightbulb size={12}/> Η παραλλαγή <strong>{detectedSuffix}</strong> ({detectedVariantDesc}) έχει προετοιμαστεί για το Βήμα 4.</div>}
                            </div>
                            <div className="grid grid-cols-2 gap-5">
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-1.5">Φύλο *</label>
                                    <select value={gender} onChange={(e) => { setGender(e.target.value as Gender); setIsGenderManuallySet(true); }} className="w-full p-3 border border-slate-200 rounded-xl bg-white focus:ring-4 focus:ring-amber-500/20 outline-none"><option value="" disabled>Επιλέξτε</option><option value={Gender.Women}>Γυναικείο</option><option value={Gender.Men}>Ανδρικό</option><option value={Gender.Unisex}>Unisex</option></select>
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-1.5">Κατηγορία *</label>
                                    <input type="text" value={category} onChange={(e) => { setCategory(e.target.value); setIsCategoryManuallySet(true); }} className="w-full p-3 border border-slate-200 rounded-xl bg-white focus:ring-4 focus:ring-amber-500/20 outline-none" />
                                </div>
                            </div>
                            <div>
                                <label className="flex items-center gap-2 text-sm font-bold text-slate-700 mb-1.5">
                                    Βασική Επιμετάλλωση (Master)
                                </label>
                                <select 
                                    value={plating} 
                                    onChange={(e) => { setPlating(e.target.value as PlatingType); }} 
                                    className="w-full p-3 border border-slate-200 rounded-xl bg-white focus:ring-4 focus:ring-amber-500/20 outline-none">
                                    <option value={PlatingType.None}>{platingNoneLabel}</option>
                                    <option value={PlatingType.GoldPlated}>Επίχρυσο (Gold)</option>
                                    <option value={PlatingType.TwoTone}>Δíχρωμο (Two-Tone)</option>
                                    <option value={PlatingType.Platinum}>Επιπλατινωμένο (Platinum)</option>
                                </select>
                            </div>
                            <div className="flex gap-4">
                                <label className="flex-1 flex items-center gap-3 p-3 border border-slate-200 rounded-xl bg-slate-50 cursor-pointer"><input type="checkbox" checked={isSTX} onChange={(e) => setIsSTX(e.target.checked)} className="h-5 w-5 text-amber-600 rounded" /><span className="font-bold text-slate-700">Είναι Εξάρτημα (STX);</span></label>
                                <div className="flex-1">
                                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Χονδρική (Βασική)</label>
                                    <div className="flex items-center gap-1"><input type="number" step="0.01" value={sellingPrice} onChange={e => setSellingPrice(parseFloat(e.target.value))} className="w-full p-2.5 border border-slate-200 rounded-xl font-bold"/><span className="text-slate-500 font-bold">€</span></div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="pt-4 border-t border-slate-100">
                        <label className="block text-sm font-bold text-slate-700 mb-3">Λάστιχα</label>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 h-64 flex flex-col gap-3">
                                <div className="relative shrink-0">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16}/>
                                    <input 
                                        type="text" 
                                        placeholder="Αναζήτηση..."
                                        value={moldSearch}
                                        onChange={e => setMoldSearch(e.target.value)}
                                        className="w-full pl-9 p-2 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all placeholder-slate-400"
                                    />
                                </div>
                                <div className="overflow-y-auto custom-scrollbar flex-1 pr-1">
                                    {suggestedMolds.length > 0 && (
                                        <>
                                            <div className="text-xs font-bold text-amber-600 px-2 py-1">Προτάσεις</div>
                                            {suggestedMolds.map(m => (
                                                <div key={m.code} onClick={() => toggleMold(m.code)} className={`flex items-center gap-2 text-sm p-2 rounded-lg cursor-pointer border mb-1 transition-colors ${selectedMolds.includes(m.code) ? 'bg-amber-100 border-amber-200 text-amber-900 font-bold' : 'bg-emerald-50/50 border-transparent hover:bg-emerald-50'}`}>
                                                    <CheckCircle size={14} className={selectedMolds.includes(m.code) ? 'opacity-100' : 'opacity-0'}/> 
                                                    {m.code} 
                                                    <span className="text-xs text-slate-400 ml-auto truncate">{m.description}</span>
                                                </div>
                                            ))}
                                            {otherMolds.length > 0 && <div className="h-px bg-slate-200 my-2 mx-2"></div>}
                                        </>
                                    )}
                                    {otherMolds.length > 0 && (
                                        otherMolds.map(m => (
                                            <div key={m.code} onClick={() => toggleMold(m.code)} className={`flex items-center gap-2 text-sm p-2 rounded-lg cursor-pointer border mb-1 transition-colors ${selectedMolds.includes(m.code) ? 'bg-amber-100 border-amber-200 text-amber-900 font-bold' : 'border-transparent hover:bg-white'}`}>
                                                <CheckCircle size={14} className={selectedMolds.includes(m.code) ? 'opacity-100' : 'opacity-0'}/> 
                                                {m.code} 
                                                <span className="text-xs text-slate-400 ml-auto truncate">{m.description}</span>
                                            </div>
                                        ))
                                    )}
                                    {suggestedMolds.length === 0 && otherMolds.length === 0 && (
                                        <div className="text-center text-slate-400 pt-8 text-xs italic">
                                            Δεν βρέθηκαν λάστιχα.
                                        </div>
                                    )}
                                </div>
                            </div>
                            
                            {/* Mini Mold Creator */}
                            <div className="bg-white p-5 rounded-2xl border-2 border-dashed border-slate-200 hover:border-amber-300 transition-all group flex flex-col gap-3 h-full">
                                <div className="flex items-center gap-2 text-xs font-bold text-slate-400 group-hover:text-amber-500 uppercase tracking-wide transition-colors">
                                    <Plus size={14} /> Νέο Λάστιχο
                                </div>
                                
                                <input 
                                    type="text" 
                                    placeholder="Κωδικός *" 
                                    value={newMoldCode} 
                                    onChange={e => setNewMoldCode(e.target.value.toUpperCase())} 
                                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono font-bold outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all uppercase placeholder-slate-400"
                                />
                                
                                <div className="grid grid-cols-2 gap-3">
                                    <input 
                                        type="text" 
                                        placeholder="Τοποθεσία" 
                                        value={newMoldLoc} 
                                        onChange={e => setNewMoldLoc(e.target.value)} 
                                        className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all placeholder-slate-400"
                                    />
                                    <input 
                                        type="text" 
                                        placeholder="Περιγραφή" 
                                        value={newMoldDesc} 
                                        onChange={e => setNewMoldDesc(e.target.value)} 
                                        className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all placeholder-slate-400"
                                    />
                                </div>
                                
                                <button 
                                    onClick={handleQuickCreateMold} 
                                    disabled={isCreatingMold}
                                    className="mt-auto w-full bg-amber-500 hover:bg-amber-600 text-white font-bold py-3 rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center"
                                >
                                    {isCreatingMold ? <Loader2 size={16} className="animate-spin" /> : 'Δημιουργία & Επιλογή'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            
            {/* STEP 2: RECIPE */}
            {currentStep === 2 && (
                <div className="space-y-4 animate-in slide-in-from-right duration-300">
                    <h3 className="text-xl font-bold text-slate-800 border-b border-slate-100 pb-4">2. Συνταγή (Bill of Materials)</h3>
                    
                    {/* Always show Silver */}
                    <div className="flex items-center gap-3 p-4 rounded-xl border bg-slate-100 border-slate-200 shadow-sm">
                        <div className="p-2 rounded-lg bg-white text-slate-600"><Coins size={20} /></div>
                        <div className="flex-1">
                            <label className="block text-[10px] text-slate-400 uppercase font-bold tracking-wider mb-1">Υλικό Βάσης</label>
                            <span className="font-bold text-slate-800">Ασήμι 925 (Βάση)</span>
                        </div>
                        <div className="text-right">
                            <div className="font-mono font-bold">{costBreakdown?.silver.toFixed(2)}€</div>
                            <div className="text-xs text-slate-400">{weight}g @ {settings?.silver_price_gram}€/g (+{settings?.loss_percentage}%)</div>
                        </div>
                    </div>

                    {recipe.map((item, idx) => (
                        <div key={idx} className="flex items-center gap-3 p-4 rounded-xl border bg-white shadow-sm">
                        <div className="flex-1">
                            <label className="block text-[10px] text-slate-400 uppercase font-bold mb-1">{item.type === 'raw' ? 'Υλικό' : 'Εξάρτημα'}</label>
                            {item.type === 'raw' ? (
                                <select value={item.id} onChange={(e) => updateRecipeItem(idx, 'id', e.target.value)} className="w-full text-sm font-bold outline-none cursor-pointer bg-transparent">
                                    {materials.map(m => (<option key={m.id} value={m.id}>{m.name}</option>))}
                                </select>
                            ) : (
                                <select value={item.sku} onChange={(e) => updateRecipeItem(idx, 'sku', e.target.value)} className="w-full text-sm font-bold outline-none cursor-pointer bg-transparent">
                                    {products.filter(p => p.is_component).map(p => (<option key={p.sku} value={p.sku}>{p.sku}</option>))}
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
                    
                    {recipe.length === 0 && (
                        <div className="text-center italic text-slate-400 py-4 text-xs">
                            Μόνο Υλικό Βάσης (Ασήμι).
                        </div>
                    )}

                    <div className="flex gap-2 pt-4 border-t border-slate-100">
                        <button type="button" onClick={addRawMaterial} className="text-xs bg-purple-50 text-purple-700 px-4 py-2.5 rounded-lg font-bold border border-purple-200 flex items-center gap-1 hover:bg-purple-100 transition-colors"><Plus size={14}/> Υλικό</button>
                        <button type="button" onClick={addComponent} className="text-xs bg-blue-50 text-blue-700 px-4 py-2.5 rounded-lg font-bold border border-blue-200 flex items-center gap-1 hover:bg-blue-100 transition-colors"><Plus size={14}/> STX</button>
                    </div>
                </div>
            )}

            {/* STEP 3: LABOR & WEIGHT */}
            {currentStep === 3 && (
                <div className="space-y-6 animate-in slide-in-from-right duration-300">
                    <h3 className="text-xl font-bold text-slate-800 border-b border-slate-100 pb-4">3. Εργατικά & Βάρος</h3>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-1.5">Βασικό Βάρος (g) *</label>
                            <input type="number" step="0.01" value={weight} onChange={e => setWeight(parseFloat(e.target.value) || 0)} className="w-full p-3 border border-slate-200 rounded-xl font-bold bg-white focus:ring-4 focus:ring-amber-500/20 outline-none"/>
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-1.5">{secondaryWeightLabel}</label>
                            <input type="number" step="0.01" value={secondaryWeight} onChange={e => setSecondaryWeight(parseFloat(e.target.value) || 0)} className="w-full p-3 border border-slate-200 rounded-xl font-bold bg-white focus:ring-4 focus:ring-amber-500/20 outline-none"/>
                        </div>
                    </div>
                    
                    <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
                        <h4 className="text-base font-bold text-slate-600 mb-4 flex items-center gap-2"><Hammer size={18}/> Κόστη Εργατικών</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <LaborCostCard icon={<Flame size={14}/>} label="Χυτήριο (€)" value={labor.casting_cost} readOnly hint="Από Συνολικό Βάρος"/>
                            <LaborCostCard icon={<Crown size={14}/>} label="Καρφωτής (€)" value={labor.setter_cost} onChange={val => setLabor({...labor, setter_cost: val})} />
                            <LaborCostCard icon={<Hammer size={14}/>} label="Τεχνίτης (€)" value={labor.technician_cost} onChange={val => setLabor({...labor, technician_cost: val})} isOverridden={labor.technician_cost_manual_override} onToggleOverride={() => setLabor(prev => ({...prev, technician_cost_manual_override: !prev.technician_cost_manual_override}))} />
                            <LaborCostCard icon={<Coins size={14}/>} label="Επιμετάλλωση X (€)" value={labor.plating_cost_x} onChange={val => setLabor({...labor, plating_cost_x: val})} isOverridden={labor.plating_cost_x_manual_override} onToggleOverride={() => setLabor(prev => ({...prev, plating_cost_x_manual_override: !prev.plating_cost_x_manual_override}))} hint="Από Βασικό Βάρος" />
                            <LaborCostCard icon={<Coins size={14}/>} label="Επιμετάλλωση D (€)" value={labor.plating_cost_d} onChange={val => setLabor({...labor, plating_cost_d: val})} isOverridden={labor.plating_cost_d_manual_override} onToggleOverride={() => setLabor(prev => ({...prev, plating_cost_d_manual_override: !prev.plating_cost_d_manual_override}))} hint="Από Β' Βάρος" />
                        </div>
                    </div>
                </div>
            )}
            
            {/* STEP 4: VARIANTS */}
            {currentStep === 4 && (
                <div className="space-y-6 animate-in slide-in-from-right duration-300">
                    <h3 className="text-xl font-bold text-slate-800 border-b border-slate-100 pb-4">4. Παραλλαγές</h3>
                    
                    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col">
                        <h4 className="font-bold text-sm text-slate-600 mb-2">Προσθήκη Νέας Παραλλαγής</h4>
                        <div className="grid grid-cols-[100px_1fr_120px_auto] gap-2 w-full items-end">
                            <div>
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Suffix *</label>
                                <input type="text" placeholder="π.χ. P, XKR" value={newVariantSuffix} onChange={e => setNewVariantSuffix(e.target.value.toUpperCase())} className="w-full p-2 border border-slate-200 rounded-lg font-mono text-sm uppercase min-w-0 bg-white text-slate-800"/>
                            </div>
                            <div>
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Περιγραφή</label>
                                <input type="text" placeholder="π.χ. Πατίνα, Επίχρυσο - Κορνεόλη" value={newVariantDesc} onChange={e => setNewVariantDesc(e.target.value)} className="w-full p-2 border border-slate-200 rounded-lg text-sm min-w-0 bg-white text-slate-800"/>
                            </div>
                            <div>
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Χονδρική (€)</label>
                                <input type="number" value={newVariantPrice} onChange={e => setNewVariantPrice(parseFloat(e.target.value))} className="w-full p-2 border border-slate-200 rounded-lg text-sm min-w-0 bg-white text-slate-800 font-bold"/>
                            </div>
                            <button onClick={handleAddVariant} className="bg-[#060b00] text-white px-3 py-2 rounded-lg font-bold text-sm hover:bg-black transition-colors flex items-center justify-center h-10"><Plus size={16}/></button>
                        </div>
                    </div>

                    <div className="space-y-3">
                        {variants.map((variant, index) => (
                            <div key={index} className="flex items-center gap-3 p-4 bg-white rounded-xl border border-slate-200 shadow-sm hover:border-emerald-300 transition-all">
                            <div className="font-mono font-bold text-lg text-emerald-600 w-16 text-center bg-emerald-50 rounded-lg py-2">{variant.suffix}</div>
                            <input 
                                type="text" 
                                value={variant.description}
                                onChange={e => updateVariant(index, 'description', e.target.value)}
                                placeholder="Περιγραφή"
                                className="flex-1 md:w-48 p-2 border border-slate-200 rounded-lg text-sm bg-white focus:border-emerald-500 outline-none text-slate-800"
                            />
                                <div className="text-xs text-slate-400">Κόστος: <span className="font-bold text-slate-600">{(variant.active_price || 0).toFixed(2)}€</span></div>
                                <div className="text-xs text-slate-400">Χονδρική: <span className="font-bold text-slate-600">{(variant.selling_price || 0).toFixed(2)}€</span></div>
                            <button onClick={() => removeVariant(index)} className="ml-auto md:ml-2 p-2.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors mt-auto">
                                <Trash2 size={18}/>
                            </button>
                            </div>
                        ))}
                        {variants.length === 0 && <div className="text-center text-slate-400 py-6 italic text-sm">Δεν υπάρχουν παραλλαγές.</div>}
                    </div>
                </div>
            )}
            
            {/* STEP 5: FINAL SUMMARY & SAVE */}
            {currentStep === 5 && (
                <div className="space-y-8 animate-in slide-in-from-right duration-300">
                    <h3 className="text-xl font-bold text-slate-800 border-b border-slate-100 pb-4">5. Τελική Σύνοψη & Έλεγχος</h3>
                    
                    {/* Product Header Card */}
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col md:flex-row gap-8">
                        <div className="w-40 h-40 bg-slate-50 rounded-xl overflow-hidden border border-slate-200 shrink-0">
                             {imagePreview ? <img src={imagePreview} className="w-full h-full object-cover"/> : <div className="w-full h-full flex items-center justify-center text-slate-300"><ImageIcon size={40}/></div>}
                        </div>
                        <div className="flex-1 space-y-4">
                            <div>
                                <div className="flex items-center gap-3 mb-1">
                                    <h2 className="text-3xl font-black text-slate-800 tracking-tight">{detectedMasterSku || sku}</h2>
                                    {isSTX && <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded-md text-xs font-bold uppercase">Component</span>}
                                </div>
                                <div className="flex gap-4 text-sm font-medium text-slate-500">
                                    <span className="flex items-center gap-1"><Tag size={14}/> {category}</span>
                                    <span className="flex items-center gap-1"><Users size={14}/> {gender}</span>
                                    <span className="flex items-center gap-1"><Palette size={14}/> {platingNoneLabel}</span>
                                </div>
                            </div>
                            
                            <div className="grid grid-cols-3 gap-4">
                                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                                    <div className="text-[10px] uppercase font-bold text-slate-400">Βαρος</div>
                                    <div className="text-lg font-black text-slate-700">{weight}g {secondaryWeight > 0 && <span className="text-xs font-medium text-slate-400">(+{secondaryWeight}g)</span>}</div>
                                </div>
                                <div className="bg-amber-50 p-3 rounded-xl border border-amber-100">
                                    <div className="text-[10px] uppercase font-bold text-amber-700">Χονδρικη (Master)</div>
                                    <div className="text-lg font-black text-amber-600">{sellingPrice.toFixed(2)}€</div>
                                </div>
                                <div className="bg-emerald-50 p-3 rounded-xl border border-emerald-100">
                                    <div className="text-[10px] uppercase font-bold text-emerald-700">Κοστος (Master)</div>
                                    <div className="text-lg font-black text-emerald-600">{masterEstimatedCost.toFixed(2)}€</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        {/* Left: Cost Breakdown */}
                        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 h-full">
                            <h4 className="font-bold text-slate-700 mb-4 flex items-center gap-2"><Calculator size={18} className="text-slate-400"/> Ανάλυση Κόστους (Master)</h4>
                            
                            <div className="space-y-3">
                                <SummaryRow label="Ασήμι" value={costBreakdown?.silver || 0} sub={`~${masterEstimatedCost > 0 ? ((costBreakdown?.silver || 0)/masterEstimatedCost * 100).toFixed(0) : 0}%`} color="bg-slate-300" />
                                <SummaryRow label="Υλικά & Εξαρτήματα" value={costBreakdown?.materials || 0} color="bg-purple-300" />
                                
                                <div className="pt-2 mt-2 border-t border-slate-50">
                                    <div className="text-xs font-bold text-slate-400 uppercase mb-2">Εργατικα</div>
                                    <div className="grid grid-cols-2 gap-2 text-sm">
                                        <div className="flex justify-between text-slate-600"><span>Χυτήριο:</span> <span className="font-mono font-bold">{labor.casting_cost.toFixed(2)}€</span></div>
                                        <div className="flex justify-between text-slate-600"><span>Καρφωτής:</span> <span className="font-mono font-bold">{labor.setter_cost.toFixed(2)}€</span></div>
                                        <div className="flex justify-between text-slate-600"><span>Τεχνίτης:</span> <span className="font-mono font-bold">{labor.technician_cost.toFixed(2)}€</span></div>
                                        <div className="flex justify-between text-slate-600"><span>Επιμετάλλωση:</span> <span className="font-mono font-bold">{(labor.plating_cost_x + labor.plating_cost_d).toFixed(2)}€</span></div>
                                    </div>
                                </div>
                                
                                <div className="pt-3 mt-3 border-t border-slate-100 flex justify-between items-center">
                                    <span className="font-bold text-slate-700">Σύνολο Κόστους</span>
                                    <span className="font-black text-xl text-slate-800">{masterEstimatedCost.toFixed(2)}€</span>
                                </div>
                            </div>
                        </div>

                        {/* Right: Recipe & Molds */}
                        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 h-full flex flex-col gap-6">
                            <div>
                                <h4 className="font-bold text-slate-700 mb-3 flex items-center gap-2"><Box size={18} className="text-purple-500"/> Συνταγή</h4>
                                {recipe.length > 0 ? (
                                    <div className="space-y-2">
                                        {recipe.map((r, i) => {
                                            const matName = r.type === 'raw' ? materials.find(m => m.id === r.id)?.name : `STX: ${r.sku}`;
                                            return (
                                                <div key={i} className="flex justify-between text-sm bg-slate-50 p-2 rounded-lg border border-slate-100">
                                                    <span className="text-slate-700 font-medium">{matName}</span>
                                                    <span className="font-mono font-bold text-slate-500">x{r.quantity}</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : <div className="text-sm text-slate-400 italic">Μόνο μέταλλο βάσης.</div>}
                            </div>

                            <div>
                                <h4 className="font-bold text-slate-700 mb-3 flex items-center gap-2"><MapPin size={18} className="text-amber-500"/> Λάστιχα</h4>
                                {selectedMolds.length > 0 ? (
                                    <div className="flex flex-wrap gap-2">
                                        {selectedMolds.map(m => (
                                            <span key={m} className="px-2 py-1 bg-amber-50 text-amber-800 text-xs font-bold rounded border border-amber-100">{m}</span>
                                        ))}
                                    </div>
                                ) : <div className="text-sm text-slate-400 italic">Δεν επιλέχθηκαν λάστιχα.</div>}
                            </div>
                        </div>
                    </div>

                    {/* Variants Section */}
                    {variants.length > 0 && (
                        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                            <h4 className="font-bold text-slate-700 mb-4 flex items-center gap-2"><Layers size={18} className="text-emerald-500"/> Παραλλαγές ({variants.length})</h4>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-xs">
                                        <tr>
                                            <th className="p-3 rounded-l-lg">Suffix</th>
                                            <th className="p-3">Περιγραφη</th>
                                            <th className="p-3 text-right">Εκτ. Κοστος</th>
                                            <th className="p-3 text-right">Χονδρικη</th>
                                            <th className="p-3 text-right rounded-r-lg">Κερδος</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50">
                                        {variants.map((v, idx) => {
                                            const cost = v.active_price || masterEstimatedCost;
                                            const price = v.selling_price || sellingPrice;
                                            const margin = price > 0 ? ((price - cost) / price) * 100 : 0;
                                            return (
                                                <tr key={idx}>
                                                    <td className="p-3 font-mono font-bold text-slate-700">{v.suffix}</td>
                                                    <td className="p-3 text-slate-600">{v.description}</td>
                                                    <td className="p-3 text-right font-mono text-slate-600">{cost.toFixed(2)}€</td>
                                                    <td className="p-3 text-right font-bold text-amber-600">{price.toFixed(2)}€</td>
                                                    <td className="p-3 text-right">
                                                        <span className={`px-2 py-1 rounded text-xs font-bold ${margin >= 50 ? 'bg-emerald-100 text-emerald-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                                            {margin.toFixed(0)}%
                                                        </span>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            )}
            </div>

            {/* FOOTER NAV */}
            <div className="p-6 border-t border-slate-100 bg-white/50 backdrop-blur-sm flex justify-between items-center">
                <button onClick={prevStep} disabled={currentStep === 1} className="flex items-center gap-2 px-5 py-3 rounded-xl text-slate-500 hover:bg-slate-100 font-bold disabled:opacity-50"><ArrowLeft size={16}/> Πίσω</button>
                
                <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-400">Βήμα {currentStep}/5: {STEPS[currentStep - 1].title}</span>
                </div>

                {currentStep < 5 && <button onClick={nextStep} className="flex items-center gap-2 px-5 py-3 rounded-xl bg-slate-800 text-white hover:bg-black font-bold shadow-md">Επόμενο <ArrowRight size={16}/></button>}
                {currentStep === 5 && (
                    <button onClick={handleSubmit} disabled={isUploading} className="flex items-center gap-2 px-6 py-3 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 font-bold shadow-lg shadow-emerald-200">
                    {isUploading ? <Loader2 size={16} className="animate-spin"/> : <CheckCircle size={16}/>} {isUploading ? 'Αποθήκευση...' : 'Ολοκλήρωση'}
                    </button>
                )}
            </div>
        </div>
      </div>
    </div>
  );
}

const CostBreakdownItem = ({label, value, total, color}: {label: string, value: number, total: number, color: string}) => {
    const percentage = total > 0 ? (value / total) * 100 : 0;
    return (
        <div className="space-y-1">
            <div className="flex justify-between items-center text-xs">
                <span className="font-bold text-slate-600">{label}</span>
                <span className="font-mono font-bold text-slate-800">{value.toFixed(2)}€</span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-1.5">
                <div className={`${color} h-1.5 rounded-full`} style={{width: `${percentage}%`}}></div>
            </div>
        </div>
    );
};
