
import React, { useState, useEffect, useMemo } from 'react';
import { Product, Material, Gender, PlatingType, RecipeItem, LaborCost, Mold, ProductVariant } from '../types';
import { parseSku, calculateProductCost, analyzeSku, calculateTechnicianCost, calculatePlatingCost, estimateVariantCost, analyzeSuffix } from '../utils/pricingEngine';
import { Plus, Trash2, Camera, Box, Upload, Loader2, ArrowRight, ArrowLeft, CheckCircle, Lightbulb, Wand2, Percent, Search, ImageIcon, Lock, Unlock, MapPin, Tag, Layers, RefreshCw, DollarSign, Calculator, Crown, Coins, Hammer, Flame } from 'lucide-react';
import { supabase, uploadProductImage } from '../lib/supabase';
import { compressImage } from '../utils/imageHelpers';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { api } from '../lib/supabase';
import { useUI } from './UIProvider';

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

export default function NewProduct({ products, materials, molds = [], onCancel }: Props) {
  const queryClient = useQueryClient();
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: api.getSettings });
  const [currentStep, setCurrentStep] = useState(1);
  const { showToast } = useUI();

  // Form State
  const [sku, setSku] = useState('');
  const [category, setCategory] = useState('');
  const [gender, setGender] = useState<Gender | ''>('');
  
  const [weight, setWeight] = useState(0);
  const [plating, setPlating] = useState<PlatingType>(PlatingType.None);
  const [isPlatingCostSuggested, setIsPlatingCostSuggested] = useState(false);
  const [isPlatingCostManuallySet, setIsPlatingCostManuallySet] = useState(false);

  const [sellingPrice, setSellingPrice] = useState(0); // Master Wholesale
  
  const [recipe, setRecipe] = useState<RecipeItem[]>([]);
  // Updated default Casting Cost to 0.20
  const [labor, setLabor] = useState<LaborCost>({ casting_cost: 0.20, setter_cost: 0, technician_cost: 0, plating_cost: 0, technician_cost_manual_override: false });
  
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

  // Auto-Suggest Logic & Smart SKU Analysis
  useEffect(() => {
    if (sku.length >= 2) {
      // 1. Analyze Category/Gender
      const meta = parseSku(sku);
      if (meta.category !== 'Γενικό' && !category) {
         setCategory(meta.category);
      }
      // Set gender if inferred and not manually set
      let currentGender = gender;
      if (meta.gender && !gender) {
         setGender(meta.gender as Gender);
         currentGender = meta.gender as Gender;
      }
      if (sku.startsWith('STX')) setIsSTX(true);
      
      // 2. Smart Suffix Analysis
      // We pass the current gender to help analyzeSku distinguish between codes like PAX (Women) vs P-AX (Men)
      const analysis = analyzeSku(sku, currentGender as Gender);
      if (analysis.isVariant) {
          setDetectedMasterSku(analysis.masterSku);
          setDetectedSuffix(analysis.suffix);
          setDetectedVariantDesc(analysis.variantDescription);
          setPlating(analysis.detectedPlating);
      } else {
          setDetectedMasterSku(sku.trim().toUpperCase());
          setDetectedSuffix('');
          setDetectedVariantDesc('');
          if (!plating || plating !== PlatingType.None) setPlating(PlatingType.None);
      }
    } else {
        setDetectedMasterSku(sku.trim().toUpperCase());
        setDetectedSuffix('');
    }
  }, [sku, gender, category]);

  // SMART PLATING COST SUGGESTION
  useEffect(() => {
    // Don't suggest if user has manually entered a value for the current config
    if (isPlatingCostManuallySet) return;

    if (weight > 0 && plating !== PlatingType.None && sku.length >= 2 && category) {
        const skuPrefix = sku.substring(0, 2).toUpperCase();
        
        const similarProducts = products.filter(p => 
            p.sku !== sku &&
            p.prefix === skuPrefix &&
            p.category === category &&
            p.weight_g > 0 &&
            p.labor.plating_cost > 0 &&
            Math.abs(p.weight_g - weight) / weight <= 0.25
        );
        
        let suggestedCost = 0;
        if (similarProducts.length > 0) { // Smart suggestion based on similar items
            const costPerGramRatios = similarProducts.map(p => p.labor.plating_cost / p.weight_g);
            const avgCostPerGram = costPerGramRatios.reduce((a, b) => a + b, 0) / costPerGramRatios.length;
            suggestedCost = avgCostPerGram * weight;
        } else { // Fallback to default formula
            suggestedCost = calculatePlatingCost(weight, plating);
        }

        if (suggestedCost > 0) {
            setLabor(prev => ({ ...prev, plating_cost: parseFloat(suggestedCost.toFixed(2)) }));
            setIsPlatingCostSuggested(true);
        }
    } else if (plating === PlatingType.None) {
        setLabor(prev => ({ ...prev, plating_cost: 0 }));
        setIsPlatingCostSuggested(false);
    }
  }, [weight, plating, sku, category, products, isPlatingCostManuallySet]);


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
  }, [sku, detectedMasterSku, category, gender, weight, plating, recipe, labor, materials, imagePreview, selectedMolds, isSTX, products, settings]);

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

      // STRICT COST LOGIC:
      const estimatedCost = estimateVariantCost(
          tempMaster, 
          upperSuffix, 
          settings!, 
          materials, 
          products, 
          labor.plating_cost 
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
      // Keep price as is or reset? Usually nicer to keep if adding similar items
      // setNewVariantPrice(sellingPrice); 
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

  // --- PREVALENT VARIANT HELPER (Local for this view) ---
  const getDisplayHero = () => {
      if (variants.length === 0) {
          return {
              fullSku: detectedMasterSku || sku,
              description: 'Βασικό Προϊόν (Μόνο Master)',
              cost: masterEstimatedCost,
              price: sellingPrice,
              isVariant: false
          };
      }

      // Priority: P > X > First
      const pVar = variants.find(v => v.suffix.includes('P') && !v.suffix.includes('X'));
      const xVar = variants.find(v => v.suffix.includes('X'));
      const hero = pVar || xVar || variants[0];

      return {
          fullSku: (detectedMasterSku || sku) + hero.suffix,
          description: hero.description || hero.suffix,
          cost: hero.active_price || 0,
          price: hero.selling_price || 0,
          isVariant: true,
          suffix: hero.suffix
      };
  };

  const hero = getDisplayHero();

  // --------------------------

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
            labor_plating: Number(labor.plating_cost),
            labor_technician_manual_override: labor.technician_cost_manual_override
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
            setSku(''); setWeight(0); setRecipe([]); setSellingPrice(0); setSelectedMolds([]); setSelectedImage(null); setImagePreview(''); setVariants([]); setCurrentStep(1);
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

  return (
    <div className="max-w-5xl mx-auto h-[calc(100vh-140px)] flex flex-col">
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

      <div className="bg-white rounded-3xl shadow-lg shadow-slate-200/50 border border-slate-100 flex-1 flex flex-col overflow-hidden relative">
        
        <div className="flex-1 overflow-y-auto p-8 scroll-smooth">
          
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
                                <select value={gender} onChange={(e) => setGender(e.target.value as Gender)} className="w-full p-3 border border-slate-200 rounded-xl bg-white focus:ring-4 focus:ring-amber-500/20 outline-none"><option value="" disabled>Επιλέξτε</option><option value={Gender.Women}>Γυναικείο</option><option value={Gender.Men}>Ανδρικό</option><option value={Gender.Unisex}>Unisex</option></select>
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1.5">Κατηγορία *</label>
                                <input type="text" value={category} onChange={(e) => setCategory(e.target.value)} className="w-full p-3 border border-slate-200 rounded-xl bg-white focus:ring-4 focus:ring-amber-500/20 outline-none" />
                            </div>
                        </div>
                        <div>
                            <label className="flex items-center gap-2 text-sm font-bold text-slate-700 mb-1.5">
                                Βασική Επιμετάλλωση (Master)
                            </label>
                            <select 
                                value={plating} 
                                onChange={(e) => {
                                    setPlating(e.target.value as PlatingType);
                                    setIsPlatingCostManuallySet(false); // Allow new cost suggestion
                                    setIsPlatingCostSuggested(false);
                                }} 
                                className="w-full p-3 border border-slate-200 rounded-xl bg-white focus:ring-4 focus:ring-amber-500/20 outline-none">
                                <option value={PlatingType.None}>Κανένα (Ασήμι/Πατίνα)</option>
                                <option value={PlatingType.GoldPlated}>Επίχρυσο (Gold)</option>
                                <option value={PlatingType.TwoTone}>Δίχρωμο (Two-Tone)</option>
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
                                disabled={isCreatingMold || !newMoldCode}
                                className="mt-auto bg-slate-900 text-white py-3 rounded-xl text-sm font-bold hover:bg-slate-800 transition-all flex items-center justify-center gap-2 shadow-sm disabled:opacity-50 hover:shadow-md hover:-translate-y-0.5 active:scale-95"
                            >
                                {isCreatingMold ? <Loader2 className="animate-spin" size={16}/> : <Plus size={16} />}
                                {isCreatingMold ? 'Δημιουργία...' : 'Προσθήκη Λάστιχου'}
                            </button>
                        </div>
                    </div>
                </div>
             </div>
          )}

          {/* STEP 2: RECIPE */}
          {currentStep === 2 && (
             <div className="space-y-6 animate-in slide-in-from-right duration-300 fade-in h-full flex flex-col">
                 <div className="flex justify-between items-center pb-4 border-b border-slate-100">
                    <h3 className="text-xl font-bold text-slate-800">2. Συνταγή (BOM)</h3>
                    <div className="flex gap-2">
                        <button type="button" onClick={addRawMaterial} className="text-xs bg-purple-50 text-purple-700 px-4 py-2.5 rounded-lg font-bold border border-purple-200 flex items-center gap-1"><Plus size={14}/> Υλικό</button>
                        <button type="button" onClick={addComponent} className="text-xs bg-blue-50 text-blue-700 px-4 py-2.5 rounded-lg font-bold border border-blue-200 flex items-center gap-1"><Plus size={14}/> STX</button>
                    </div>
                 </div>
                 <div className="flex-1 overflow-y-auto space-y-3">
                   {recipe.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-3 p-4 rounded-xl border bg-white shadow-sm">
                       <div className="flex-1">
                           <label className="block text-[10px] text-slate-400 uppercase font-bold mb-1">{item.type === 'raw' ? 'Υλικό' : 'Εξάρτημα'}</label>
                           {item.type === 'raw' ? (
                               <select value={item.id} onChange={(e) => updateRecipeItem(idx, 'id', e.target.value)} className="w-full text-sm font-bold outline-none cursor-pointer">{materials.map(m => (<option key={m.id} value={m.id}>{m.name}</option>))}</select>
                           ) : (
                               <select value={item.sku} onChange={(e) => updateRecipeItem(idx, 'sku', e.target.value)} className="w-full text-sm font-bold outline-none cursor-pointer">{products.filter(p => p.is_component).map(p => (<option key={p.sku} value={p.sku}>{p.sku}</option>))}</select>
                           )}
                       </div>
                       <div className="w-24"><input type="number" value={item.quantity} onChange={(e) => updateRecipeItem(idx, 'quantity', e.target.value)} className="w-full p-2 bg-slate-50 rounded font-bold text-center outline-none"/></div>
                       <button onClick={() => removeRecipeItem(idx)} className="p-2 text-slate-300 hover:text-red-500"><Trash2 size={18} /></button>
                    </div>
                   ))}
                   {recipe.length === 0 && <div className="text-center text-slate-400 py-12 border-2 border-dashed rounded-xl">Κενή Συνταγή</div>}
                 </div>
             </div>
          )}

          {/* STEP 3: LABOR */}
          {currentStep === 3 && (
             <div className="space-y-8 animate-in slide-in-from-right duration-300 fade-in">
                 <h3 className="text-xl font-bold text-slate-800 border-b border-slate-100 pb-4">3. Κόστος & Εργατικά</h3>
                 <div className="bg-amber-50 p-6 rounded-2xl border border-amber-100 shadow-sm flex items-center justify-between">
                    <label className="text-sm font-bold text-amber-800 uppercase tracking-wide">Βάρος Ασημιού (g) <span className="text-red-500">*</span></label>
                    <div className="relative w-40">
                        <input 
                            type="number" 
                            step="0.01" 
                            value={weight} 
                            onChange={e => {
                                setWeight(parseFloat(e.target.value) || 0);
                                setIsPlatingCostManuallySet(false);
                                setIsPlatingCostSuggested(false);
                            }} 
                            className="w-full p-3 border border-amber-200 rounded-xl bg-white text-3xl font-mono font-bold text-center outline-none"
                        />
                    </div>
                 </div>
                 <div className="grid grid-cols-2 gap-6">
                     <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Χύτευση €</label><input type="number" step="0.01" value={labor.casting_cost} onChange={e => setLabor({...labor, casting_cost: parseFloat(e.target.value) || 0})} className="w-full p-3 border rounded-xl font-mono"/></div>
                     <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Καρφωτικό €</label><input type="number" step="0.01" value={labor.setter_cost} onChange={e => setLabor({...labor, setter_cost: parseFloat(e.target.value) || 0})} className="w-full p-3 border rounded-xl font-mono"/></div>
                     <div className="relative">
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Τεχνίτης €</label>
                        <input type="number" step="0.01" readOnly={!labor.technician_cost_manual_override} value={labor.technician_cost} onChange={e => setLabor({...labor, technician_cost: parseFloat(e.target.value) || 0})} className={`w-full p-3 border rounded-xl font-mono ${!labor.technician_cost_manual_override ? 'bg-slate-100 text-slate-500' : 'bg-white'}`}/>
                        <button onClick={() => setLabor(prev => ({...prev, technician_cost_manual_override: !prev.technician_cost_manual_override}))} className="absolute right-3 top-8 text-slate-400">{labor.technician_cost_manual_override ? <Unlock size={14}/> : <Lock size={14}/>}</button>
                     </div>
                     <div className="relative">
                        <label className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase mb-1">
                            Κόστος Επιμετάλλωσης €
                            {isPlatingCostSuggested && (
                                <span className="flex items-center gap-1 text-xs font-normal text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200" title="Έξυπνη Πρόταση">
                                    <Lightbulb size={12} /> Πρόταση
                                </span>
                            )}
                        </label>
                        <input 
                            type="number" 
                            step="0.01" 
                            value={labor.plating_cost} 
                            onChange={e => {
                                setLabor({...labor, plating_cost: parseFloat(e.target.value) || 0});
                                setIsPlatingCostManuallySet(true);
                                setIsPlatingCostSuggested(false);
                            }} 
                            className="w-full p-3 border rounded-xl font-mono bg-white border-amber-300 ring-2 ring-amber-50"
                        />
                        <p className="text-[10px] text-amber-600 mt-1">Αυτό το ποσό θα προστεθεί αυτόματα στο κόστος των παραλλαγών X, D, H.</p>
                     </div>
                 </div>
             </div>
          )}

          {/* STEP 4: VARIANTS (NEW - SMART) */}
          {currentStep === 4 && (
              <div className="space-y-6 animate-in slide-in-from-right duration-300 fade-in h-full flex flex-col">
                  <h3 className="text-xl font-bold text-slate-800 border-b border-slate-100 pb-4">4. Διαχείριση Παραλλαγών</h3>
                  
                  {/* Add Variant Form */}
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
                      <div className="flex gap-3 items-end">
                          <div className="w-24">
                              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Καταληξη (Suffix)</label>
                              <input type="text" placeholder="X" value={newVariantSuffix} onChange={e => setNewVariantSuffix(e.target.value.toUpperCase())} className="w-full p-2.5 rounded-xl border border-slate-300 font-mono text-center uppercase font-bold outline-none focus:border-amber-500"/>
                          </div>
                          <div className="flex-1">
                              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Περιγραφη</label>
                              <input type="text" placeholder="Επίχρυσο" value={newVariantDesc} onChange={e => setNewVariantDesc(e.target.value)} className="w-full p-2.5 rounded-xl border border-slate-300 outline-none focus:border-amber-500"/>
                          </div>
                          <div className="w-24">
                              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Χονδρικη</label>
                              <input type="number" step="0.01" value={newVariantPrice} onChange={e => setNewVariantPrice(parseFloat(e.target.value) || 0)} className="w-full p-2.5 rounded-xl border border-slate-300 font-bold text-center outline-none focus:border-emerald-500 text-emerald-700"/>
                          </div>
                          <button onClick={handleAddVariant} className="bg-slate-800 text-white px-4 py-2.5 rounded-xl font-bold hover:bg-slate-700 flex items-center gap-2 transition-all"><Plus size={18}/> Προσθήκη</button>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-2 flex items-center gap-1"><Lightbulb size={12}/> Το κόστος υπολογίζεται αυτόματα. Για X, D, H προστίθεται το κόστος επιμετάλλωσης ({labor.plating_cost}€). Για P αφαιρείται.</p>
                  </div>

                  {/* Variant List - Fully Editable */}
                  <div className="flex-1 overflow-y-auto space-y-3">
                      {variants.map((v, idx) => {
                          const isPlated = v.suffix.includes('X') || v.suffix.includes('D') || v.suffix.includes('H');
                          
                          return (
                              <div key={idx} className="grid grid-cols-1 md:grid-cols-[auto_1fr_1fr_1fr_auto] gap-3 p-4 bg-white rounded-xl border border-slate-200 shadow-sm items-center">
                                  
                                  <div className="w-12 h-10 flex items-center justify-center bg-slate-100 rounded-lg font-mono font-bold text-slate-700">{v.suffix}</div>
                                  
                                  <div className="flex flex-col">
                                      <label className="text-[9px] font-bold text-slate-400 uppercase">Περιγραφη</label>
                                      <input 
                                        type="text" 
                                        value={v.description} 
                                        onChange={e => updateVariant(idx, 'description', e.target.value)}
                                        className="w-full p-1 border-b border-transparent focus:border-slate-300 outline-none font-bold text-slate-800"
                                      />
                                  </div>
                                  
                                  <div className="flex flex-col relative">
                                      <label className="text-[9px] font-bold text-slate-400 uppercase">Κοστος</label>
                                      <div className="flex items-center gap-1">
                                          <input 
                                            type="number" step="0.01" 
                                            value={v.active_price || 0} 
                                            onChange={e => updateVariant(idx, 'active_price', parseFloat(e.target.value))}
                                            className="w-full p-1 border-b border-slate-200 font-mono font-bold text-slate-700 outline-none focus:border-amber-500"
                                          />
                                          <span className="text-xs text-slate-400">€</span>
                                      </div>
                                      {isPlated && <span className="absolute -top-1 right-0 text-[9px] text-amber-600 bg-amber-50 px-1 rounded font-bold">Επιμετ.</span>}
                                  </div>

                                  <div className="flex flex-col">
                                      <label className="text-[9px] font-bold text-slate-400 uppercase">Χονδρικη</label>
                                      <div className="flex items-center gap-1">
                                          <input 
                                            type="number" step="0.01" 
                                            value={v.selling_price || 0} 
                                            onChange={e => updateVariant(idx, 'selling_price', parseFloat(e.target.value))}
                                            className="w-full p-1 border-b border-slate-200 font-mono font-bold text-emerald-700 outline-none focus:border-emerald-500"
                                          />
                                          <span className="text-xs text-slate-400">€</span>
                                      </div>
                                  </div>

                                  <button onClick={() => removeVariant(idx)} className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg"><Trash2 size={16}/></button>
                              </div>
                          );
                      })}
                      {variants.length === 0 && <div className="text-center text-slate-400 py-10 italic">Δεν έχουν προστεθεί παραλλαγές. Θα δημιουργηθεί μόνο το βασικό προϊόν.</div>}
                  </div>
              </div>
          )}

          {/* STEP 5: SUMMARY (REVAMPED) */}
          {currentStep === 5 && (
             <div className="space-y-8 animate-in slide-in-from-right duration-300 fade-in">
                 <h3 className="text-xl font-bold text-slate-800 border-b border-slate-100 pb-4">5. Σύνοψη & Τιμολόγηση</h3>
                 
                 {/* HERO CARD */}
                 <div className="bg-gradient-to-br from-slate-900 to-slate-800 text-white p-6 rounded-2xl shadow-xl flex flex-col md:flex-row gap-6 relative overflow-hidden">
                     <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/3 blur-3xl"></div>
                     
                     <div className="flex-1 relative z-10">
                         <div className="flex items-center gap-2 mb-2">
                             <span className="px-2 py-1 rounded bg-amber-500/20 text-amber-300 text-[10px] font-bold uppercase tracking-wider border border-amber-500/30 flex items-center gap-1">
                                 <Crown size={10} className="fill-current"/> Κύριο Προϊόν
                             </span>
                         </div>
                         <div className="text-4xl font-black tracking-tight mb-2 font-mono">{hero.fullSku}</div>
                         <div className="flex items-center gap-4 text-sm text-slate-300 font-medium">
                             <div className="flex items-center gap-1"><Tag size={14} className="text-indigo-400"/> {hero.description}</div>
                             <div className="w-1 h-1 rounded-full bg-slate-500"></div>
                             <div>{category}</div>
                             <div className="w-1 h-1 rounded-full bg-slate-500"></div>
                             <div>{weight}g</div>
                         </div>
                     </div>

                     <div className="relative z-10 bg-white/10 p-4 rounded-xl border border-white/10 backdrop-blur-sm min-w-[200px]">
                         <div className="text-[10px] font-bold text-slate-400 uppercase mb-1">Χονδρικη Τιμη</div>
                         <div className="text-3xl font-black text-emerald-400">{hero.price.toFixed(2)}€</div>
                         <div className="text-xs text-slate-400 mt-2 flex justify-between items-center border-b border-white/10 pb-1 mb-1">
                             <span>Συνολικό Κόστος:</span>
                             <span className="font-mono text-white font-bold">{hero.cost.toFixed(2)}€</span>
                         </div>
                         
                         {/* COST BREAKDOWN VISUALIZATION */}
                         {costBreakdown && (
                             <div className="space-y-1 mt-2">
                                 <div className="flex justify-between text-[10px] text-slate-400">
                                     <span className="flex items-center gap-1"><Coins size={10}/> Ασήμι</span>
                                     <span>{costBreakdown.silver.toFixed(2)}€</span>
                                 </div>
                                 <div className="flex justify-between text-[10px] text-slate-400">
                                     <span className="flex items-center gap-1"><Hammer size={10}/> Εργατικά</span>
                                     {/* Hero cost minus materials/silver to deduce specific labor/plating for this variant */}
                                     <span>{(hero.cost - costBreakdown.silver - costBreakdown.materials).toFixed(2)}€</span>
                                 </div>
                                 <div className={`flex justify-between text-[10px] font-bold ${costBreakdown.materials > 0 ? 'text-amber-300' : 'text-slate-500'}`}>
                                     <span className="flex items-center gap-1"><Box size={10}/> Υλικά</span>
                                     <span>{costBreakdown.materials.toFixed(2)}€</span>
                                 </div>
                             </div>
                         )}
                     </div>
                 </div>

                 {/* VARIANT TABLE (Only showing variants if they exist, or Master if none) */}
                 <div>
                     <h4 className="font-bold text-slate-600 mb-3 uppercase tracking-wide text-xs flex items-center gap-2">
                         <Layers size={14}/> Λίστα Κωδικών προς Δημιουργία ({variants.length > 0 ? variants.length : 1})
                     </h4>
                     <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                         <table className="w-full text-left text-sm">
                             <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-xs">
                                 <tr>
                                     <th className="p-4 pl-6">Κωδικός</th>
                                     <th className="p-4">Περιγραφή</th>
                                     <th className="p-4 text-right">Κόστος</th>
                                     <th className="p-4 text-right">Χονδρική</th>
                                     <th className="p-4 text-right pr-6">Margin</th>
                                 </tr>
                             </thead>
                             <tbody className="divide-y divide-slate-100">
                                 {/* Case 1: No Variants - Show Master Row */}
                                 {variants.length === 0 && (
                                     <tr className="bg-slate-50/50">
                                         <td className="p-4 pl-6 font-bold text-slate-700">{detectedMasterSku || sku}</td>
                                         <td className="p-4 text-slate-500">Βασικό Προϊόν</td>
                                         <td className="p-4 text-right font-mono font-bold text-slate-600">{masterEstimatedCost.toFixed(2)}€</td>
                                         <td className="p-4 text-right font-mono font-bold text-slate-800">{sellingPrice.toFixed(2)}€</td>
                                         <td className="p-4 text-right pr-6 font-bold text-emerald-600">
                                             {sellingPrice > 0 ? (((sellingPrice - masterEstimatedCost) / sellingPrice) * 100).toFixed(0) : 0}%
                                         </td>
                                     </tr>
                                 )}
                                 
                                 {/* Case 2: Variants Exist - Show ONLY Variants */}
                                 {variants.map((v, idx) => {
                                     const vCost = v.active_price || 0;
                                     const vPrice = v.selling_price || 0;
                                     const margin = vPrice > 0 ? ((vPrice - vCost) / vPrice * 100) : 0;
                                     const isPrevalent = v.suffix === hero.suffix; // Highlight hero in table too

                                     return (
                                         <tr key={idx} className={`transition-colors ${isPrevalent ? 'bg-indigo-50/60' : 'hover:bg-slate-50'}`}>
                                             <td className={`p-4 pl-6 font-bold font-mono ${isPrevalent ? 'text-indigo-700' : 'text-slate-700'}`}>
                                                 {(detectedMasterSku || sku) + v.suffix}
                                                 {isPrevalent && <span className="ml-2 text-[9px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded uppercase font-bold">Κύριο</span>}
                                             </td>
                                             <td className="p-4 text-slate-600">{v.description}</td>
                                             <td className="p-4 text-right font-mono text-slate-600">{vCost.toFixed(2)}€</td>
                                             <td className="p-4 text-right font-mono font-bold text-slate-800">{vPrice.toFixed(2)}€</td>
                                             <td className={`p-4 text-right pr-6 font-bold ${margin < 30 ? 'text-red-500' : 'text-emerald-600'}`}>{margin.toFixed(0)}%</td>
                                         </tr>
                                     );
                                 })}
                             </tbody>
                         </table>
                     </div>
                 </div>
             </div>
          )}

        </div>

        {/* FOOTER */}
        <div className="p-6 border-t border-slate-100 bg-white flex justify-between items-center z-10">
            {currentStep > 1 ? (
                <button onClick={prevStep} className="px-6 py-3 rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors font-bold flex items-center gap-2 text-slate-600">
                    <ArrowLeft size={18} /> Πίσω
                </button>
            ) : (<div />)}
            
            {currentStep < 5 ? (
                <button onClick={nextStep} className="px-8 py-3 rounded-xl bg-slate-900 text-white hover:bg-slate-800 transition-all hover:shadow-lg hover:-translate-y-0.5 font-bold flex items-center gap-2">
                    Επόμενο <ArrowRight size={18} />
                </button>
            ) : (
                <button onClick={handleSubmit} disabled={isUploading} className="px-10 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 text-white hover:from-emerald-600 hover:to-emerald-700 transition-all hover:shadow-lg hover:shadow-emerald-200 font-bold flex items-center gap-2 disabled:opacity-70">
                    {isUploading ? <Loader2 className="animate-spin" size={20} /> : <CheckCircle size={20} />} 
                    {isUploading ? 'Αποθήκευση...' : 'Ολοκλήρωση'}
                </button>
            )}
        </div>

      </div>
    </div>
  );
}
