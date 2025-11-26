

import React, { useState, useEffect } from 'react';
import { Product, Material, Gender, PlatingType, RecipeItem, LaborCost, Mold } from '../types';
import { parseSku, calculateProductCost, analyzeSku } from '../utils/pricingEngine';
import { Save, Plus, Trash2, Camera, Calculator, Box, Gem, MapPin, Upload, Loader2, Image as ImageIcon, ArrowRight, ArrowLeft, CheckCircle, Lightbulb } from 'lucide-react';
import { supabase, uploadProductImage } from '../lib/supabase';
import { compressImage } from '../utils/imageHelpers';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { api } from '../lib/supabase';

interface Props {
  products: Product[];
  materials: Material[];
  molds?: Mold[];
}

const STEPS = [
  { id: 1, title: 'Στοιχεία' },
  { id: 2, title: 'Συνταγή' },
  { id: 3, title: 'Εργατικά' },
  { id: 4, title: 'Σύνοψη' }
];

export default function NewProduct({ products, materials, molds = [] }: Props) {
  const queryClient = useQueryClient();
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: api.getSettings });
  const [currentStep, setCurrentStep] = useState(1);

  // Form State
  const [sku, setSku] = useState('');
  const [category, setCategory] = useState('');
  const [gender, setGender] = useState<Gender | ''>('');
  
  const [weight, setWeight] = useState(0);
  const [plating, setPlating] = useState<PlatingType>(PlatingType.None);
  const [sellingPrice, setSellingPrice] = useState(0);
  
  const [recipe, setRecipe] = useState<RecipeItem[]>([]);
  const [labor, setLabor] = useState<LaborCost>({ casting_cost: 0, setter_cost: 0, technician_cost: 0, plating_cost: 0 });
  
  // Image State
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>('');
  const [isUploading, setIsUploading] = useState(false);

  // Molds Multi-Select
  const [selectedMolds, setSelectedMolds] = useState<string[]>([]);
  
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
        alert("Δεν υπάρχουν διαθέσιμα εξαρτήματα (STX) στην αποθήκη.");
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

  const handleSubmit = async () => {
    if (!sku) return alert("Το SKU είναι υποχρεωτικό");
    
    setIsUploading(true);
    let finalImageUrl = 'https://picsum.photos/300/300'; 
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
          sample_qty: 1,
          molds: selectedMolds,
          is_component: isSTX,
          variants: [],
          recipe: recipe,
          labor: {
              casting_cost: Number(labor.casting_cost),
              setter_cost: Number(labor.setter_cost),
              technician_cost: Number(labor.technician_cost),
              plating_cost: Number(labor.plating_cost)
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
            sample_qty: 1,
            is_component: newProduct.is_component,
            labor_casting: newProduct.labor.casting_cost,
            labor_setter: newProduct.labor.setter_cost,
            labor_technician: newProduct.labor.technician_cost,
            labor_plating: newProduct.labor.plating_cost
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
        alert(`Το προϊόν αποθηκεύτηκε ως ${finalMasterSku}${detectedSuffix ? ` με παραλλαγή ${detectedSuffix}` : ''}!`);
        
        // Reset Form
        setSku(''); setWeight(0); setRecipe([]); setSellingPrice(0); setSelectedMolds([]); setSelectedImage(null); setImagePreview(''); setCurrentStep(1); setCategory(''); setGender('');

    } catch (error) {
        console.error("Save error:", error);
        alert("Σφάλμα κατά την αποθήκευση.");
    } finally {
        setIsUploading(false);
    }
  };

  const nextStep = () => setCurrentStep(prev => Math.min(prev + 1, 4));
  const prevStep = () => setCurrentStep(prev => Math.max(prev - 1, 1));

  return (
    <div className="max-w-3xl mx-auto h-full flex flex-col">
      <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Calculator className="text-amber-500" />
            Νέο Προϊόν
          </h1>
          {/* Progress Indicators */}
          <div className="flex gap-2">
             {STEPS.map(s => (
                 <div key={s.id} className={`h-2 w-8 rounded-full transition-colors ${currentStep >= s.id ? 'bg-amber-500' : 'bg-slate-200'}`} />
             ))}
          </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 flex-1 flex flex-col overflow-hidden">
        
        <div className="flex-1 overflow-y-auto p-6">
          
          {/* STEP 1: BASIC INFO & IMAGE */}
          {currentStep === 1 && (
             <div className="space-y-6 animate-in slide-in-from-right duration-300">
                <h3 className="text-lg font-semibold text-slate-700 pb-2 border-b">1. Βασικά Στοιχεία</h3>
                
                <div className="flex flex-col md:flex-row gap-6">
                    {/* Image Uploader - Fixed Click Area */}
                    <div className="w-full md:w-1/3">
                        <label className="block text-sm font-medium text-slate-600 mb-2">Φωτογραφία (Main SKU)</label>
                        <div className="relative group w-full aspect-square bg-slate-50 border-2 border-dashed border-slate-300 rounded-lg overflow-hidden hover:border-amber-400 transition-colors cursor-pointer">
                            {imagePreview ? (
                                <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                            ) : (
                                <div className="flex flex-col items-center justify-center h-full text-slate-400 pointer-events-none">
                                    <Camera size={32} className="mb-2 opacity-50" />
                                    <span className="text-xs font-medium">Επιλογή Φωτό</span>
                                </div>
                            )}
                            <input type="file" accept="image/*" onChange={handleImageSelect} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-50"/>
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white font-medium text-xs pointer-events-none z-40"><Upload size={16} className="mr-1" /> Αλλαγή</div>
                        </div>
                    </div>

                    <div className="flex-1 space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-slate-600 mb-1">SKU Εισαγωγής</label>
                          <input type="text" value={sku} onChange={(e) => setSku(e.target.value.toUpperCase())} className="w-full p-2 border border-slate-300 rounded-md font-mono uppercase bg-white text-slate-900 focus:ring-2 focus:ring-amber-500 outline-none" placeholder="π.χ. XR2050P"/>
                          {detectedSuffix && (
                              <div className="mt-2 p-2 bg-blue-50 border border-blue-100 rounded flex items-start gap-2 text-xs text-blue-700">
                                  <Lightbulb size={14} className="mt-0.5 shrink-0" />
                                  <div><span className="font-bold">Αυτόματη Αναγνώριση:</span><br/>Master SKU: <strong>{detectedMasterSku}</strong><br/>Παραλλαγή: <strong>{detectedSuffix} ({detectedVariantDesc})</strong></div>
                              </div>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-600 mb-1">Φύλο</label>
                                <select value={gender} onChange={(e) => setGender(e.target.value as Gender)} className="w-full p-2 border border-slate-300 rounded-md bg-white text-slate-900 focus:ring-2 focus:ring-amber-500 outline-none">
                                    <option value="" disabled>Επιλέξτε</option>
                                    <option value={Gender.Women}>Γυναικείο</option>
                                    <option value={Gender.Men}>Ανδρικό</option>
                                    <option value={Gender.Unisex}>Unisex</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-600 mb-1">Κατηγορία</label>
                                <input type="text" value={category} onChange={(e) => setCategory(e.target.value)} className="w-full p-2 border border-slate-300 rounded-md bg-white text-slate-900 focus:ring-2 focus:ring-amber-500 outline-none" />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-600 mb-1">Τύπος Επιμετάλλωσης</label>
                            <select value={plating} onChange={(e) => setPlating(e.target.value as PlatingType)} className={`w-full p-2 border border-slate-300 rounded-md bg-white text-slate-900 focus:ring-2 focus:ring-amber-500 outline-none transition-colors ${detectedSuffix ? 'bg-amber-50 border-amber-300 font-medium' : ''}`}>
                                <option value={PlatingType.None}>Κανένα (Ασήμι/Πατίνα)</option>
                                <option value={PlatingType.GoldPlated}>Επίχρυσο (Gold)</option>
                                <option value={PlatingType.TwoTone}>Δίχρωμο (Two-Tone)</option>
                                <option value={PlatingType.Platinum}>Πλατινωμένο (Platinum)</option>
                                <option value={PlatingType.RoseGold}>Ροζ Χρυσό (Rose)</option>
                            </select>
                            {detectedSuffix && <p className="text-[10px] text-amber-600 mt-1">*Επιλέχθηκε αυτόματα βάσει του SKU ({detectedSuffix}).</p>}
                        </div>

                        <div className="bg-slate-50 p-2 rounded-md flex items-center gap-2">
                             <input type="checkbox" checked={isSTX} onChange={(e) => setIsSTX(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500" />
                             <span className="text-sm font-medium text-slate-800">Είναι Εξάρτημα (STX);</span>
                        </div>
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1">Ανάθεση Λάστιχων</label>
                    <div className="p-3 border border-slate-300 rounded-md bg-white max-h-32 overflow-y-auto grid grid-cols-2 gap-2">
                        {molds.length > 0 ? molds.map(m => (<div key={m.code} onClick={() => toggleMold(m.code)} className={`flex items-center gap-2 text-sm p-1 rounded cursor-pointer select-none transition-colors ${selectedMolds.includes(m.code) ? 'bg-amber-100 text-amber-900 font-medium' : 'hover:bg-slate-50 text-slate-600'}`}><div className={`w-4 h-4 rounded border flex items-center justify-center ${selectedMolds.includes(m.code) ? 'bg-amber-500 border-amber-600' : 'border-slate-300'}`}>{selectedMolds.includes(m.code) && <div className="w-2 h-2 bg-white rounded-full" />}</div><span>{m.code}</span></div>)) : (<span className="text-slate-400 text-sm col-span-2 italic">Δεν υπάρχουν διαθέσιμα λάστιχα.</span>)}
                    </div>
                </div>
             </div>
          )}

          {currentStep === 2 && (
             <div className="space-y-6 animate-in slide-in-from-right duration-300">
                 <div className="flex justify-between items-center pb-2 border-b"><h3 className="text-lg font-semibold text-slate-700">2. Συνταγή (BOM)</h3><div className="flex gap-2"><button type="button" onClick={addRawMaterial} className="text-xs flex items-center gap-1 bg-purple-100 text-purple-700 px-3 py-2 rounded hover:bg-purple-200 transition-colors font-medium"><Plus size={14} /> Υλικό</button><button type="button" onClick={addComponent} className="text-xs flex items-center gap-1 bg-blue-100 text-blue-700 px-3 py-2 rounded hover:bg-blue-200 transition-colors font-medium"><Plus size={14} /> STX</button></div></div>
                 <div className="space-y-3">
                   {recipe.map((item, idx) => (<div key={idx} className={`flex items-center gap-2 p-3 rounded-lg border ${item.type === 'raw' ? 'bg-purple-50 border-purple-100' : 'bg-blue-50 border-blue-100'}`}><div className="flex-1"><label className="block text-[10px] text-slate-500 uppercase tracking-wide">{item.type === 'raw' ? 'Πρώτη Ύλη' : 'Εξάρτημα'}</label>{item.type === 'raw' ? (<select value={item.id} onChange={(e) => updateRecipeItem(idx, 'id', e.target.value)} className="w-full p-1 text-sm bg-transparent font-medium text-slate-900 outline-none">{materials.map(m => (<option key={m.id} value={m.id}>{m.name}</option>))}</select>) : (<select value={item.sku} onChange={(e) => updateRecipeItem(idx, 'sku', e.target.value)} className="w-full p-1 text-sm bg-transparent font-medium text-slate-900 outline-none">{products.filter(p => p.is_component).map(p => (<option key={p.sku} value={p.sku}>{p.sku} - {p.category}</option>))}</select>)}</div><div className="w-20"><label className="block text-[10px] text-slate-500">Ποσότητα</label><input type="number" value={item.quantity} onChange={(e) => updateRecipeItem(idx, 'quantity', e.target.value)} className="w-full p-1 text-sm bg-white border border-slate-300 rounded text-center outline-none focus:border-amber-500"/></div><button type="button" onClick={() => removeRecipeItem(idx)} className="p-2 text-slate-400 hover:text-red-500"><Trash2 size={18} /></button></div>))}
                   {recipe.length === 0 && <p className="text-center py-8 text-slate-400 italic bg-slate-50 rounded-lg">Δεν έχουν προστεθεί υλικά.</p>}
                 </div>
             </div>
          )}

          {currentStep === 3 && (
             <div className="space-y-6 animate-in slide-in-from-right duration-300">
                 <h3 className="text-lg font-semibold text-slate-700 pb-2 border-b">3. Κόστος & Εργατικά</h3>
                 <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 shadow-sm"><label className="block text-sm font-bold text-slate-700 mb-1">Βάρος Ασημιού (γραμμάρια)</label><input type="number" step="0.01" value={weight} onChange={e => setWeight(parseFloat(e.target.value))} className="w-full p-3 border border-slate-300 rounded-md bg-white text-slate-900 text-lg font-mono font-bold focus:ring-2 focus:ring-amber-500 outline-none shadow-sm transition-all"/></div>
                 <div className="grid grid-cols-2 gap-4">
                     <div><label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-wide">Χύτευση €</label><input type="number" step="0.01" value={labor.casting_cost} onChange={e => setLabor({...labor, casting_cost: parseFloat(e.target.value)})} className="w-full p-2.5 border border-slate-300 rounded-md bg-white text-slate-900 focus:ring-2 focus:ring-amber-500 outline-none shadow-sm transition-all"/></div>
                     <div><label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-wide">Καρφωτικό €</label><input type="number" step="0.01" value={labor.setter_cost} onChange={e => setLabor({...labor, setter_cost: parseFloat(e.target.value)})} className="w-full p-2.5 border border-slate-300 rounded-md bg-white text-slate-900 focus:ring-2 focus:ring-amber-500 outline-none shadow-sm transition-all"/></div>
                     <div><label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-wide">Τεχνίτης €</label><input type="number" step="0.01" value={labor.technician_cost} onChange={e => setLabor({...labor, technician_cost: parseFloat(e.target.value)})} className="w-full p-2.5 border border-slate-300 rounded-md bg-white text-slate-900 focus:ring-2 focus:ring-amber-500 outline-none shadow-sm transition-all"/></div>
                     <div><label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-wide">Επιμετάλλωση €</label><input type="number" step="0.01" value={labor.plating_cost} onChange={e => setLabor({...labor, plating_cost: parseFloat(e.target.value)})} className="w-full p-2.5 border border-slate-300 rounded-md bg-white text-slate-900 focus:ring-2 focus:ring-amber-500 outline-none shadow-sm transition-all"/></div>
                 </div>
             </div>
          )}

          {currentStep === 4 && (
             <div className="space-y-6 animate-in slide-in-from-right duration-300">
                 <h3 className="text-lg font-semibold text-slate-700 pb-2 border-b">4. Σύνοψη & Τιμολόγηση</h3>
                 <div className="grid grid-cols-2 gap-4"><div className="p-4 bg-slate-50 rounded-lg"><span className="text-sm text-slate-500">Εκτιμώμενο Κόστος</span><p className="text-2xl font-bold text-slate-800">{estimatedCost.toFixed(2)}€</p></div>{!isSTX && (<div className="p-4 bg-amber-50 rounded-lg border border-amber-100"><label className="text-sm font-bold text-amber-700 block mb-1">Τιμή Πώλησης</label><input type="number" step="0.1" value={sellingPrice} onChange={(e) => setSellingPrice(parseFloat(e.target.value))} className="w-full bg-white p-1 rounded border border-amber-200 font-bold text-lg text-amber-900 outline-none focus:ring-2 focus:ring-amber-500"/></div>)}</div>
                 {!isSTX && (<div className="flex gap-4"><div className={`flex-1 p-3 rounded text-center ${profit > 0 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}><span className="text-xs uppercase font-bold">Κέρδος</span><p className="font-bold text-lg">{profit.toFixed(2)}€</p></div><div className={`flex-1 p-3 rounded text-center ${margin > 30 ? 'bg-green-100 text-green-800' : 'bg-orange-100 text-orange-800'}`}><span className="text-xs uppercase font-bold">Margin</span><p className="font-bold text-lg">{margin.toFixed(1)}%</p></div></div>)}
                 <div className="bg-slate-50 p-4 rounded-lg text-sm space-y-2 text-slate-600"><p><strong>SKU:</strong> {detectedMasterSku || sku} {detectedSuffix ? `(${detectedSuffix} variant)` : ''}</p><p><strong>Κατηγορία:</strong> {category}</p><p><strong>Υλικά:</strong> {recipe.length} αντικείμενα</p><p><strong>Λάστιχα:</strong> {selectedMolds.join(', ') || '-'}</p></div>
             </div>
          )}

        </div>

        {/* FOOTER NAVIGATION */}
        <div className="p-4 border-t bg-slate-50 flex justify-between">
            {currentStep > 1 ? (<button onClick={prevStep} className="px-6 py-2 rounded-lg border border-slate-300 hover:bg-white transition-colors font-medium flex items-center gap-2 text-slate-600"><ArrowLeft size={16} /> Πίσω</button>) : (<div />)}
            {currentStep < 4 ? (<button onClick={nextStep} className="px-6 py-2 rounded-lg bg-slate-900 text-white hover:bg-slate-800 transition-colors font-medium flex items-center gap-2">Επόμενο <ArrowRight size={16} /></button>) : (<button onClick={handleSubmit} disabled={isUploading} className="px-8 py-2 rounded-lg bg-green-600 text-white hover:bg-green-700 transition-colors font-medium flex items-center gap-2 shadow-lg shadow-green-200">{isUploading ? <Loader2 className="animate-spin" size={18} /> : <CheckCircle size={18} />} {isUploading ? 'Αποθήκευση...' : 'Ολοκλήρωση'}</button>)}
        </div>

      </div>
    </div>
  );
}