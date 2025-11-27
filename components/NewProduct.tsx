import React, { useState, useEffect } from 'react';
import { Product, Material, Gender, PlatingType, RecipeItem, LaborCost, Mold } from '../types';
import { parseSku, calculateProductCost, analyzeSku, calculateTechnicianCost } from '../utils/pricingEngine';
import { Plus, Trash2, Camera, Box, Upload, Loader2, ArrowRight, ArrowLeft, CheckCircle, Lightbulb, Wand2, Percent, Search, ImageIcon, Lock, Unlock } from 'lucide-react';
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
  { id: 4, title: 'Σύνοψη' }
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
  const [sellingPrice, setSellingPrice] = useState(0); // Wholesale
  
  const [recipe, setRecipe] = useState<RecipeItem[]>([]);
  const [labor, setLabor] = useState<LaborCost>({ casting_cost: 0, setter_cost: 0, technician_cost: 0, plating_cost: 0, technician_cost_manual_override: false });
  
  // Image State
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>('');
  const [isUploading, setIsUploading] = useState(false);

  // Molds Multi-Select
  const [selectedMolds, setSelectedMolds] = useState<string[]>([]);
  const [moldSearch, setMoldSearch] = useState(''); // Mold Search State
  
  const [isSTX, setIsSTX] = useState(false);
  const [estimatedCost, setEstimatedCost] = useState(0);

  // Smart SKU Detection State
  const [detectedMasterSku, setDetectedMasterSku] = useState('');
  const [detectedSuffix, setDetectedSuffix] = useState('');
  const [detectedVariantDesc, setDetectedVariantDesc] = useState('');

  // Auto-Suggest Logic & Smart SKU Analysis
  useEffect(() => {
    if (sku.length >= 2) {
      // 1. Analyze Category/Gender
      const meta = parseSku(sku);
      if (meta.category !== 'Γενικό') {
         setCategory(meta.category);
         setGender(meta.gender as Gender);
      }
      if (sku.startsWith('STX')) setIsSTX(true);
      
      // 2. Smart Suffix Analysis
      const analysis = analyzeSku(sku);
      if (analysis.isVariant) {
          setDetectedMasterSku(analysis.masterSku);
          setDetectedSuffix(analysis.suffix);
          setDetectedVariantDesc(analysis.variantDescription);
          setPlating(analysis.detectedPlating);
      } else {
          setDetectedMasterSku(sku.trim().toUpperCase());
          setDetectedSuffix('');
          setDetectedVariantDesc('');
      }
    } else {
        setDetectedMasterSku(sku.trim().toUpperCase());
        setDetectedSuffix('');
    }
  }, [sku]);

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
      sku: detectedMasterSku || sku, // Use Master for calculation context
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
    setEstimatedCost(cost.total);
  }, [sku, detectedMasterSku, category, gender, weight, plating, recipe, labor, materials, imagePreview, selectedMolds, isSTX, products, settings]);

  // Derived Profit Calculations
  const profit = sellingPrice - estimatedCost;
  const margin = sellingPrice > 0 ? ((profit / sellingPrice) * 100) : 0;
  
  // Retail
  const retailPrice = sellingPrice * 3;

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedImage(file);
      // Create local preview
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
        showToast("Δεν υπάρχουν διαθέσιμα εξαρτήματα (STX) στην αποθήκη.", "error");
    }
  };

  const updateRecipeItem = (index: number, field: string, value: any) => {
    const newRecipe = [...recipe];
    const item = newRecipe[index];
    
    if (field === 'quantity') {
      item.quantity = parseFloat(value);
    } else if (field === 'id' && item.type === 'raw') {
      item.id = value;
    } else if (field === 'sku' && item.type === 'component') {
      item.sku = value;
    }
    
    setRecipe(newRecipe);
  };

  const removeRecipeItem = (index: number) => {
    setRecipe(recipe.filter((_, i) => i !== index));
  };

  const toggleMold = (code: string) => {
      if (selectedMolds.includes(code)) {
          setSelectedMolds(selectedMolds.filter(m => m !== code));
      } else {
          setSelectedMolds([...selectedMolds, code]);
      }
  };

  const filteredMolds = molds.filter(m => 
      m.code.includes(moldSearch.toUpperCase()) || 
      m.description.toLowerCase().includes(moldSearch.toLowerCase())
  );

  const handleSubmit = async () => {
    if (!sku) {
        showToast("Το SKU είναι υποχρεωτικό", "error");
        return;
    }
    
    setIsUploading(true);
    let finalImageUrl: string | null = null; 
    const finalMasterSku = detectedMasterSku || sku;

    try {
        // 1. Handle Image Upload (Always attached to Master SKU)
        if (selectedImage) {
            const compressedBlob = await compressImage(selectedImage);
            const uploadedUrl = await uploadProductImage(compressedBlob, finalMasterSku);
            if (uploadedUrl) {
                finalImageUrl = uploadedUrl;
            }
        }

        const newProduct: Product = {
          sku: finalMasterSku.toUpperCase(),
          prefix: finalMasterSku.substring(0, 2).toUpperCase(),
          category: category,
          gender: gender as Gender,
          image_url: finalImageUrl,
          weight_g: Number(weight),
          plating_type: plating,
          active_price: estimatedCost,
          draft_price: estimatedCost,
          selling_price: sellingPrice,
          stock_qty: 0,
          sample_qty: 0,
          molds: selectedMolds,
          is_component: isSTX,
          variants: [],
          recipe: recipe,
          labor: {
              casting_cost: Number(labor.casting_cost),
              setter_cost: Number(labor.setter_cost),
              technician_cost: Number(labor.technician_cost),
              plating_cost: Number(labor.plating_cost),
              technician_cost_manual_override: labor.technician_cost_manual_override
          }
        };
        
        // 2. Persist to DB (Master Product)
        await supabase.from('products').upsert({
            sku: newProduct.sku,
            prefix: newProduct.prefix,
            category: newProduct.category,
            gender: newProduct.gender,
            image_url: finalImageUrl,
            weight_g: newProduct.weight_g,
            plating_type: newProduct.plating_type,
            active_price: newProduct.active_price,
            draft_price: newProduct.draft_price,
            selling_price: newProduct.selling_price,
            stock_qty: 0,
            sample_qty: 0,
            is_component: newProduct.is_component,
            labor_casting: newProduct.labor.casting_cost,
            labor_setter: newProduct.labor.setter_cost,
            labor_technician: newProduct.labor.technician_cost,
            labor_plating: newProduct.labor.plating_cost,
            labor_technician_manual_override: newProduct.labor.technician_cost_manual_override
        });

        // 3. Create Variant if detected
        if (detectedSuffix) {
            await supabase.from('product_variants').insert({
                product_sku: newProduct.sku,
                suffix: detectedSuffix,
                description: detectedVariantDesc,
                stock_qty: 0 // Initial stock 0
            });
        }
        
        await supabase.from('recipes').delete().eq('parent_sku', newProduct.sku);
        for (const r of recipe) {
             if (r.type === 'raw') {
                 await supabase.from('recipes').insert({ parent_sku: newProduct.sku, type: 'raw', material_id: r.id, quantity: r.quantity });
             } else {
                 await supabase.from('recipes').insert({ parent_sku: newProduct.sku, type: 'component', component_sku: r.sku, quantity: r.quantity });
             }
        }
        
        await supabase.from('product_molds').delete().eq('product_sku', newProduct.sku);
        for (const m of selectedMolds) {
             await supabase.from('product_molds').insert({ product_sku: newProduct.sku, mold_code: m });
        }

        queryClient.invalidateQueries({ queryKey: ['products'] });
        showToast(`Το προϊόν αποθηκεύτηκε ως ${finalMasterSku}${detectedSuffix ? ` με παραλλαγή ${detectedSuffix}` : ''}!`, "success");
        
        // Return to registry list if callback exists
        if (onCancel) {
            onCancel();
        } else {
             // Reset Form
            setSku(''); setWeight(0); setRecipe([]); setSellingPrice(0); setSelectedMolds([]); setSelectedImage(null); setImagePreview(''); setCurrentStep(1); setCategory(''); setGender('');
        }

    } catch (error) {
        console.error("Save error:", error);
        showToast("Σφάλμα κατά την αποθήκευση.", "error");
    } finally {
        setIsUploading(false);
    }
  };

  const nextStep = () => setCurrentStep(prev => Math.min(prev + 1, 4));
  const prevStep = () => setCurrentStep(prev => Math.max(prev - 1, 1));

  return (
    <div className="max-w-4xl mx-auto h-[calc(100vh-140px)] flex flex-col">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
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
          
          {/* Progress Indicators */}
          <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-full shadow-sm border border-slate-100">
             {STEPS.map(s => (
                 <div key={s.id} className="flex items-center">
                    <div className={`
                        flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold transition-all duration-300
                        ${currentStep >= s.id ? 'bg-amber-500 text-white shadow-md shadow-amber-200' : 'bg-slate-100 text-slate-400'}
                    `}>
                        {currentStep > s.id ? <CheckCircle size={14} /> : s.id}
                    </div>
                    {s.id !== 4 && <div className={`w-6 h-1 mx-1 rounded-full ${currentStep > s.id ? 'bg-amber-500' : 'bg-slate-100'}`} />}
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
                    {/* Image Uploader */}
                    <div className="w-full lg:w-1/3">
                        <label className="block text-sm font-bold text-slate-700 mb-2">Φωτογραφία (Main SKU)</label>
                        <div className="relative group w-full aspect-square bg-slate-50 border-2 border-dashed border-slate-300 rounded-2xl overflow-hidden hover:border-amber-400 transition-all cursor-pointer shadow-inner">
                            {imagePreview ? (
                                <img src={imagePreview} alt="Preview" className="w-full h-full object-cover transition-transform group-hover:scale-105 duration-500" />
                            ) : (
                                <div className="flex flex-col items-center justify-center h-full text-slate-400 pointer-events-none">
                                    <div className="p-4 bg-white rounded-full shadow-sm mb-3">
                                        <ImageIcon size={32} className="opacity-50 text-slate-500" />
                                    </div>
                                    <span className="text-xs font-bold uppercase tracking-wide opacity-70">Επιλογή Φωτό</span>
                                </div>
                            )}
                            <input type="file" accept="image/*" onChange={handleImageSelect} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-50"/>
                            <div className="absolute inset-0 bg-slate-900/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white font-bold text-sm pointer-events-none z-40 backdrop-blur-sm"><Upload size={18} className="mr-2" /> Μεταφόρτωση</div>
                        </div>
                    </div>

                    <div className="flex-1 space-y-5">
                        <div className="relative">
                          <label className="block text-sm font-bold text-slate-700 mb-1.5">SKU Εισαγωγής</label>
                          <input type="text" value={sku} onChange={(e) => setSku(e.target.value.toUpperCase())} className="w-full p-3 border border-slate-200 rounded-xl font-mono uppercase bg-slate-50 text-slate-900 focus:ring-4 focus:ring-amber-500/20 focus:border-amber-500 outline-none transition-all text-lg tracking-wider placeholder:text-slate-300" placeholder="π.χ. XR2050P"/>
                          {detectedSuffix && (
                              <div className="mt-3 p-3 bg-blue-50 border border-blue-100 rounded-xl flex items-start gap-3 text-sm text-blue-800 animate-in fade-in slide-in-from-top-2">
                                  <Lightbulb size={18} className="mt-0.5 shrink-0 text-blue-600" />
                                  <div>
                                    <span className="font-bold block text-blue-700 mb-1">Αυτόματη Αναγνώριση</span>
                                    Κύριος Κωδικός: <strong className="font-mono bg-white/50 px-1 rounded">{detectedMasterSku}</strong><br/>
                                    Παραλλαγή: <strong className="font-mono bg-white/50 px-1 rounded">{detectedSuffix}</strong> ({detectedVariantDesc})
                                  </div>
                              </div>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-5">
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1.5">Φύλο</label>
                                <select value={gender} onChange={(e) => setGender(e.target.value as Gender)} className="w-full p-3 border border-slate-200 rounded-xl bg-white text-slate-900 focus:ring-4 focus:ring-amber-500/20 focus:border-amber-500 outline-none transition-all appearance-none cursor-pointer">
                                    <option value="" disabled>Επιλέξτε</option>
                                    <option value={Gender.Women}>Γυναικείο</option>
                                    <option value={Gender.Men}>Ανδρικό</option>
                                    <option value={Gender.Unisex}>Unisex</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1.5">Κατηγορία</label>
                                <input type="text" value={category} onChange={(e) => setCategory(e.target.value)} className="w-full p-3 border border-slate-200 rounded-xl bg-white text-slate-900 focus:ring-4 focus:ring-amber-500/20 focus:border-amber-500 outline-none transition-all" />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-1.5">Τύπος Επιμετάλλωσης</label>
                            <div className="relative">
                                <select value={plating} onChange={(e) => setPlating(e.target.value as PlatingType)} className={`w-full p-3 border border-slate-200 rounded-xl bg-white text-slate-900 focus:ring-4 focus:ring-amber-500/20 focus:border-amber-500 outline-none transition-all appearance-none cursor-pointer ${detectedSuffix ? 'border-amber-300 bg-amber-50/50 text-amber-900' : ''}`}>
                                    <option value={PlatingType.None}>Κανένα (Ασήμι/Πατίνα)</option>
                                    <option value={PlatingType.GoldPlated}>Επίχρυσο (Gold)</option>
                                    <option value={PlatingType.TwoTone}>Δίχρωμο (Two-Tone)</option>
                                    <option value={PlatingType.Platinum}>Επιπλατινωμένο (Platinum)</option>
                                </select>
                            </div>
                            {detectedSuffix && <p className="text-[11px] font-medium text-amber-600 mt-1.5 flex items-center gap-1"><Wand2 size={12}/> Επιλέχθηκε αυτόματα βάσει του SKU.</p>}
                        </div>

                        <label className="flex items-center gap-3 p-3 border border-slate-200 rounded-xl bg-slate-50 cursor-pointer hover:bg-white transition-colors">
                             <input type="checkbox" checked={isSTX} onChange={(e) => setIsSTX(e.target.checked)} className="h-5 w-5 rounded border-slate-300 text-amber-600 focus:ring-amber-500" />
                             <span className="text-sm font-bold text-slate-700">Είναι Εξάρτημα (STX);</span>
                        </label>
                    </div>
                </div>

                <div className="pt-4 border-t border-slate-100">
                    <div className="flex justify-between items-end mb-3">
                        <label className="block text-sm font-bold text-slate-700">Ανάθεση Λάστιχων</label>
                        <div className="relative w-48">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input 
                                type="text" 
                                placeholder="Αναζήτηση..." 
                                value={moldSearch}
                                onChange={(e) => setMoldSearch(e.target.value)}
                                className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-slate-50 focus:bg-white outline-none focus:ring-2 focus:ring-amber-500/20"
                            />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 max-h-48 overflow-y-auto pr-1 custom-scrollbar">
                        {filteredMolds.length > 0 ? filteredMolds.map(m => (
                            <div key={m.code} onClick={() => toggleMold(m.code)} className={`flex items-center gap-2 text-sm p-2 rounded-lg cursor-pointer select-none transition-all border ${selectedMolds.includes(m.code) ? 'bg-amber-50 border-amber-200 text-amber-900 font-bold shadow-sm' : 'border-transparent hover:bg-slate-50 text-slate-600'}`}>
                                <div className={`w-5 h-5 rounded flex items-center justify-center transition-colors ${selectedMolds.includes(m.code) ? 'bg-amber-500 text-white' : 'bg-slate-200 text-transparent'}`}>
                                    <CheckCircle size={14} />
                                </div>
                                <span>{m.code}</span>
                            </div>
                        )) : (<span className="text-slate-400 text-sm col-span-4 italic text-center py-2">Δεν βρέθηκαν λάστιχα.</span>)}
                    </div>
                </div>
             </div>
          )}

          {currentStep === 2 && (
             <div className="space-y-6 animate-in slide-in-from-right duration-300 fade-in h-full flex flex-col">
                 <div className="flex justify-between items-center pb-4 border-b border-slate-100">
                    <h3 className="text-xl font-bold text-slate-800">2. Συνταγή (BOM)</h3>
                    <div className="flex gap-2">
                        <button type="button" onClick={addRawMaterial} className="text-xs flex items-center gap-1.5 bg-purple-50 text-purple-700 px-4 py-2.5 rounded-lg hover:bg-purple-100 transition-colors font-bold border border-purple-200">
                            <Plus size={16} /> Υλικό
                        </button>
                        <button type="button" onClick={addComponent} className="text-xs flex items-center gap-1.5 bg-blue-50 text-blue-700 px-4 py-2.5 rounded-lg hover:bg-blue-100 transition-colors font-bold border border-blue-200">
                            <Plus size={16} /> STX
                        </button>
                    </div>
                 </div>
                 
                 <div className="flex-1 overflow-y-auto space-y-3">
                   {recipe.map((item, idx) => (
                    <div key={idx} className={`flex items-center gap-3 p-4 rounded-xl border shadow-sm transition-all hover:shadow-md ${item.type === 'raw' ? 'bg-white border-purple-100' : 'bg-white border-blue-100'}`}>
                       <div className={`p-2 rounded-lg ${item.type === 'raw' ? 'bg-purple-100 text-purple-600' : 'bg-blue-100 text-blue-600'}`}>
                           {item.type === 'raw' ? <Box size={20} /> : <Box size={20} />}
                       </div>
                       <div className="flex-1">
                           <label className="block text-[10px] text-slate-400 uppercase font-bold tracking-wider mb-1">{item.type === 'raw' ? 'Πρώτη Ύλη' : 'Εξάρτημα'}</label>
                           {item.type === 'raw' ? (
                               <select value={item.id} onChange={(e) => updateRecipeItem(idx, 'id', e.target.value)} className="w-full text-sm bg-transparent font-bold text-slate-800 outline-none cursor-pointer">
                                   {materials.map(m => (<option key={m.id} value={m.id}>{m.name}</option>))}
                               </select>
                           ) : (
                               <select value={item.sku} onChange={(e) => updateRecipeItem(idx, 'sku', e.target.value)} className="w-full text-sm bg-transparent font-bold text-slate-800 outline-none cursor-pointer">
                                   {products.filter(p => p.is_component).map(p => (<option key={p.sku} value={p.sku}>{p.sku} - {p.category}</option>))}
                               </select>
                           )}
                       </div>
                       <div className="w-24">
                           <label className="block text-[10px] text-slate-400 uppercase font-bold text-center mb-1">Ποσότητα</label>
                           <input type="number" value={item.quantity} onChange={(e) => updateRecipeItem(idx, 'quantity', e.target.value)} className="w-full p-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-center outline-none focus:border-amber-500 focus:bg-white font-mono font-bold"/>
                       </div>
                       <button type="button" onClick={() => removeRecipeItem(idx)} className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                           <Trash2 size={18} />
                       </button>
                    </div>
                   ))}
                   {recipe.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-12 text-slate-400 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
                            <Box size={32} className="mb-2 opacity-50"/>
                            <p className="font-medium">Δεν έχουν προστεθεί υλικά.</p>
                        </div>
                   )}
                 </div>
             </div>
          )}

          {currentStep === 3 && (
             <div className="space-y-8 animate-in slide-in-from-right duration-300 fade-in">
                 <h3 className="text-xl font-bold text-slate-800 border-b border-slate-100 pb-4">3. Κόστος & Εργατικά</h3>
                 
                 <div className="bg-amber-50 p-6 rounded-2xl border border-amber-100 shadow-sm">
                    <label className="block text-sm font-bold text-amber-800 mb-2 uppercase tracking-wide">Βάρος Ασημιού (γραμμάρια)</label>
                    <div className="relative">
                        <input type="number" step="0.01" value={weight} onChange={e => setWeight(parseFloat(e.target.value) || 0)} className="w-full p-4 border border-amber-200 rounded-xl bg-white text-slate-900 text-3xl font-mono font-bold focus:ring-4 focus:ring-amber-500/20 outline-none shadow-sm transition-all text-center"/>
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">gr</span>
                    </div>
                 </div>

                 <div className="grid grid-cols-2 gap-6">
                     <div className="space-y-1">
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide pl-1">Χύτευση €</label>
                        <input type="number" step="0.01" value={labor.casting_cost} onChange={e => setLabor({...labor, casting_cost: parseFloat(e.target.value) || 0})} className="w-full p-3 border border-slate-200 rounded-xl bg-white text-slate-900 focus:ring-4 focus:ring-amber-500/20 focus:border-amber-500 outline-none transition-all font-mono"/>
                     </div>
                     <div className="space-y-1">
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide pl-1">Καρφωτικό €</label>
                        <input type="number" step="0.01" value={labor.setter_cost} onChange={e => setLabor({...labor, setter_cost: parseFloat(e.target.value) || 0})} className="w-full p-3 border border-slate-200 rounded-xl bg-white text-slate-900 focus:ring-4 focus:ring-amber-500/20 focus:border-amber-500 outline-none transition-all font-mono"/>
                     </div>
                     <div className="space-y-1">
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide pl-1">Τεχνίτης €</label>
                        <div className="relative">
                          <input 
                            type="number" 
                            step="0.01" 
                            readOnly={!labor.technician_cost_manual_override} 
                            value={labor.technician_cost} 
                            onChange={e => setLabor({...labor, technician_cost: parseFloat(e.target.value) || 0})} 
                            className={`w-full p-3 border rounded-xl font-mono transition-all
                              ${labor.technician_cost_manual_override 
                                ? 'bg-white text-slate-900 border-slate-200 focus:ring-4 focus:ring-amber-500/20 focus:border-amber-500 outline-none' 
                                : 'bg-slate-100 text-slate-600 border-slate-200 outline-none'}`
                            }
                          />
                          <button 
                            type="button" 
                            onClick={() => setLabor(prev => ({...prev, technician_cost_manual_override: !prev.technician_cost_manual_override}))}
                            title="Εναλλαγή χειροκίνητης εισαγωγής"
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition-colors"
                          >
                            {labor.technician_cost_manual_override ? <Unlock size={14} /> : <Lock size={14} />}
                          </button>
                        </div>
                     </div>
                     <div className="space-y-1">
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide pl-1">Επιμετάλλωση €</label>
                        <input type="number" step="0.01" value={labor.plating_cost} onChange={e => setLabor({...labor, plating_cost: parseFloat(e.target.value) || 0})} className="w-full p-3 border border-slate-200 rounded-xl bg-white text-slate-900 focus:ring-4 focus:ring-amber-500/20 focus:border-amber-500 outline-none transition-all font-mono"/>
                     </div>
                 </div>
             </div>
          )}

          {currentStep === 4 && (
             <div className="space-y-8 animate-in slide-in-from-right duration-300 fade-in">
                 <h3 className="text-xl font-bold text-slate-800 border-b border-slate-100 pb-4">4. Σύνοψη & Τιμολόγηση</h3>
                 
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="p-6 bg-slate-50 rounded-2xl border border-slate-200">
                        <span className="text-sm font-bold text-slate-500 uppercase tracking-wide">Εκτιμώμενο Κόστος</span>
                        <p className="text-4xl font-black text-slate-800 mt-2">{estimatedCost.toFixed(2)}€</p>
                        <div className="mt-4 pt-4 border-t border-slate-200/60 text-sm space-y-1 text-slate-500">
                            <p>Ασήμι: {(estimatedCost * 0.4).toFixed(2)}€ (εκτίμηση)</p>
                            <p>Εργατικά: {(labor.casting_cost + labor.setter_cost + labor.technician_cost + labor.plating_cost).toFixed(2)}€</p>
                        </div>
                    </div>
                    
                    {!isSTX && (
                        <div className="p-6 bg-amber-50 rounded-2xl border border-amber-100 shadow-sm flex flex-col justify-center">
                            <label className="text-sm font-bold text-amber-800 uppercase tracking-wide mb-2 block">Τιμή Χονδρικής</label>
                            <div className="relative">
                                <input type="number" step="0.1" value={sellingPrice} onChange={(e) => setSellingPrice(parseFloat(e.target.value))} className="w-full bg-white p-4 rounded-xl border border-amber-200 font-black text-3xl text-amber-600 outline-none focus:ring-4 focus:ring-amber-500/20 text-center"/>
                                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-amber-300 font-bold text-xl">€</span>
                            </div>
                            
                            {/* Subtle Retail Reference */}
                            <div className="mt-3 flex items-center justify-between text-[10px] text-amber-800/40 px-2 font-medium">
                                <span>Αναφορά: Προτ. Λιανική (x3)</span>
                                <span>{retailPrice.toFixed(2)}€</span>
                            </div>
                        </div>
                    )}
                 </div>
                 
                 {!isSTX && (
                    <div className="flex gap-6">
                        <div className={`flex-1 p-4 rounded-xl text-center border transition-colors ${profit > 0 ? 'bg-emerald-50 border-emerald-100 text-emerald-800' : 'bg-red-50 border-red-100 text-red-800'}`}>
                            <span className="text-xs uppercase font-bold opacity-70">Κέρδος</span>
                            <p className="font-black text-2xl mt-1">{profit.toFixed(2)}€</p>
                        </div>
                        <div className={`flex-1 p-4 rounded-xl text-center border transition-colors ${margin > 30 ? 'bg-emerald-50 border-emerald-100 text-emerald-800' : 'bg-orange-50 border-orange-100 text-orange-800'}`}>
                            <span className="text-xs uppercase font-bold opacity-70 flex items-center justify-center gap-1"><Percent size={10} /> Περιθώριο</span>
                            <p className="font-black text-2xl mt-1">{margin.toFixed(1)}%</p>
                        </div>
                    </div>
                 )}
                 
                 <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm text-sm space-y-2 text-slate-600">
                    <p className="flex justify-between"><span className="font-bold text-slate-400">SKU</span> <span className="font-mono font-bold text-slate-800">{detectedMasterSku || sku} {detectedSuffix ? `(${detectedSuffix})` : ''}</span></p>
                    <p className="flex justify-between"><span className="font-bold text-slate-400">Κατηγορία</span> <span className="font-bold text-slate-800">{category}</span></p>
                    <p className="flex justify-between"><span className="font-bold text-slate-400">Συστατικά</span> <span className="font-bold text-slate-800">{recipe.length} είδη</span></p>
                 </div>
             </div>
          )}

        </div>

        {/* FOOTER NAVIGATION */}
        <div className="p-6 border-t border-slate-100 bg-white flex justify-between items-center z-10">
            {currentStep > 1 ? (
                <button onClick={prevStep} className="px-6 py-3 rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors font-bold flex items-center gap-2 text-slate-600">
                    <ArrowLeft size={18} /> Πίσω
                </button>
            ) : (<div />)}
            
            {currentStep < 4 ? (
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