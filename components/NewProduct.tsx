
import React, { useState, useEffect } from 'react';
import { Product, Material, Gender, PlatingType, RecipeItem, LaborCost, Mold } from '../types';
import { parseSku, calculateProductCost } from '../utils/pricingEngine';
import { Save, Plus, Trash2, Camera, Calculator, Box, Gem, TrendingUp, MapPin, Upload, Loader2, Image as ImageIcon } from 'lucide-react';
import { INITIAL_SETTINGS } from '../constants';
import { supabase, uploadProductImage } from '../lib/supabase';
import { compressImage } from '../utils/imageHelpers';

interface Props {
  products: Product[];
  materials: Material[];
  molds?: Mold[];
  setProducts: React.Dispatch<React.SetStateAction<Product[]>>;
}

export default function NewProduct({ products, materials, molds = [], setProducts }: Props) {
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

  // Auto-Suggest Logic
  useEffect(() => {
    if (sku.length >= 2) {
      const meta = parseSku(sku);
      if (meta.category !== 'Γενικό') {
         setCategory(meta.category);
         setGender(meta.gender as Gender);
      }
      if (sku.startsWith('STX')) setIsSTX(true);
      else setIsSTX(false);
    }
  }, [sku]);

  // Cost Calculator Effect
  useEffect(() => {
    const tempProduct: Product = {
      sku,
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
    const cost = calculateProductCost(tempProduct, INITIAL_SETTINGS, materials, products);
    setEstimatedCost(cost.total);
  }, [sku, category, gender, weight, plating, recipe, labor, materials, imagePreview, selectedMolds, isSTX, products]);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sku) return alert("Το SKU είναι υποχρεωτικό");
    
    setIsUploading(true);
    let finalImageUrl = 'https://picsum.photos/300/300'; // Fallback

    try {
        // 1. Handle Image Upload (Compress -> Upload to Supabase)
        if (selectedImage) {
            const compressedBlob = await compressImage(selectedImage);
            const uploadedUrl = await uploadProductImage(compressedBlob, sku);
            if (uploadedUrl) {
                finalImageUrl = uploadedUrl;
            }
        }

        const newProduct: Product = {
          sku: sku.toUpperCase(),
          prefix: sku.substring(0, 2).toUpperCase(),
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
          variants: [], // New products start with no variants
          recipe: recipe,
          labor: {
              casting_cost: Number(labor.casting_cost),
              setter_cost: Number(labor.setter_cost),
              technician_cost: Number(labor.technician_cost),
              plating_cost: Number(labor.plating_cost)
          }
        };
        
        // 2. Persist to DB (if implemented in App context) or just Local State
        // For now, we update local state as per previous pattern
        setProducts(prev => [...prev, newProduct]);
        
        // Optional: Trigger a real Supabase insert here if needed in future
        /*
        await supabase.from('products').insert({
            sku: newProduct.sku,
            // ... map other fields
            image_url: finalImageUrl
        });
        */

        alert("Το προϊόν αποθηκεύτηκε επιτυχώς!");
        
        // Reset Form
        setSku('');
        setWeight(0);
        setRecipe([]);
        setSellingPrice(0);
        setSelectedMolds([]);
        setSelectedImage(null);
        setImagePreview('');

    } catch (error) {
        console.error("Save error:", error);
        alert("Σφάλμα κατά την αποθήκευση.");
    } finally {
        setIsUploading(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-slate-800 mb-6 flex items-center gap-2">
        <Calculator className="text-amber-500" />
        Δημιουργία Συνταγής (Νέο Προϊόν)
      </h1>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Identity */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
            <h3 className="text-lg font-semibold mb-4 text-slate-700 border-b pb-2">1. Βασικά Στοιχεία & Φωτογραφία</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              
              {/* Image Uploader */}
              <div className="md:col-span-1">
                  <label className="block text-sm font-medium text-slate-600 mb-2">Φωτογραφία</label>
                  <div className="relative group w-full aspect-square bg-slate-50 border-2 border-dashed border-slate-300 rounded-lg overflow-hidden hover:border-amber-400 transition-colors cursor-pointer">
                      {imagePreview ? (
                          <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                      ) : (
                          <div className="flex flex-col items-center justify-center h-full text-slate-400">
                              <Camera size={32} className="mb-2 opacity-50" />
                              <span className="text-xs font-medium">Επιλογή Φωτό</span>
                          </div>
                      )}
                      
                      {/* Overlay Input */}
                      <input 
                          type="file" 
                          accept="image/*"
                          onChange={handleImageSelect}
                          className="absolute inset-0 opacity-0 cursor-pointer"
                      />
                      
                      {/* Hover Overlay */}
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white font-medium text-xs">
                          <Upload size={16} className="mr-1" /> Αλλαγή
                      </div>
                  </div>
              </div>

              {/* Basic Fields */}
              <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-slate-600 mb-1">SKU (Κωδικός)</label>
                    <input 
                      type="text" 
                      value={sku}
                      onChange={(e) => setSku(e.target.value.toUpperCase())}
                      className="w-full p-2 border border-slate-300 rounded-md font-mono uppercase bg-white text-slate-900 focus:ring-2 focus:ring-amber-500 outline-none"
                      placeholder="π.χ. XR2050"
                      required
                    />
                  </div>
                   
                  {/* Dropdowns */}
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1">Φύλο</label>
                    <select 
                        value={gender} 
                        onChange={(e) => setGender(e.target.value as Gender)}
                        className="w-full p-2 border border-slate-300 rounded-md bg-white text-slate-900 focus:ring-2 focus:ring-amber-500 outline-none"
                        required
                    >
                        <option value="" disabled>Επιλέξτε</option>
                        <option value={Gender.Women}>Γυναικείο</option>
                        <option value={Gender.Men}>Ανδρικό</option>
                        <option value={Gender.Unisex}>Unisex</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1">Κατηγορία</label>
                    <select 
                        value={category} 
                        onChange={(e) => setCategory(e.target.value)}
                        className="w-full p-2 border border-slate-300 rounded-md bg-white text-slate-900 focus:ring-2 focus:ring-amber-500 outline-none"
                        required
                    >
                        <option value="" disabled>Επιλέξτε</option>
                        <option value="Δαχτυλίδι">Δαχτυλίδι</option>
                        <option value="Σκουλαρίκια">Σκουλαρίκια</option>
                        <option value="Μενταγιόν">Μενταγιόν</option>
                        <option value="Βραχιόλι">Βραχιόλι</option>
                        <option value="Σταυρός">Σταυρός</option>
                        <option value="Εξάρτημα (STX)">Εξάρτημα (STX)</option>
                        <option value="Άλλο">Άλλο</option>
                    </select>
                  </div>

                  {/* STX Toggle */}
                  <div className="md:col-span-2">
                     <div className="bg-slate-50 p-2 rounded-md flex items-center gap-2">
                        <input type="checkbox" checked={isSTX} onChange={(e) => setIsSTX(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500" />
                        <span className="text-sm font-medium text-slate-800">Είναι Εξάρτημα (STX);</span>
                     </div>
                  </div>
              </div>
              
              {/* Molds Multi Select */}
              <div className="md:col-span-3">
                  <label className="block text-sm font-medium text-slate-600 mb-1">Ανάθεση Λάστιχων</label>
                  <div className="p-3 border border-slate-300 rounded-md bg-white max-h-32 overflow-y-auto grid grid-cols-2 gap-2">
                      {molds.length > 0 ? molds.map(m => (
                          <div 
                             key={m.code} 
                             onClick={() => toggleMold(m.code)}
                             className={`flex items-center gap-2 text-sm p-1 rounded cursor-pointer select-none transition-colors ${selectedMolds.includes(m.code) ? 'bg-amber-100 text-amber-900 font-medium' : 'hover:bg-slate-50 text-slate-600'}`}
                          >
                              <div className={`w-4 h-4 rounded border flex items-center justify-center ${selectedMolds.includes(m.code) ? 'bg-amber-500 border-amber-600' : 'border-slate-300'}`}>
                                  {selectedMolds.includes(m.code) && <div className="w-2 h-2 bg-white rounded-full" />}
                              </div>
                              <span>{m.code} - {m.description}</span>
                          </div>
                      )) : (
                          <span className="text-slate-400 text-sm col-span-2 italic">Δεν υπάρχουν διαθέσιμα λάστιχα.</span>
                      )}
                  </div>
              </div>

            </div>
          </div>

          {/* Recipe Builder */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
            <div className="flex justify-between items-center mb-4 border-b pb-2">
              <h3 className="text-lg font-semibold text-slate-700">2. Συνταγή (BOM)</h3>
              <div className="flex gap-2">
                 <button type="button" onClick={addRawMaterial} className="text-sm flex items-center gap-1 bg-purple-50 text-purple-700 px-3 py-1 rounded hover:bg-purple-100 transition-colors">
                    <Gem size={14} /> Υλικό
                 </button>
                 <button type="button" onClick={addComponent} className="text-sm flex items-center gap-1 bg-blue-50 text-blue-700 px-3 py-1 rounded hover:bg-blue-100 transition-colors">
                    <Box size={14} /> Εξάρτημα (STX)
                 </button>
              </div>
            </div>
            
            <div className="space-y-3">
              {recipe.map((item, idx) => (
                <div key={idx} className={`flex items-end gap-3 p-3 rounded-lg ${item.type === 'raw' ? 'bg-purple-50' : 'bg-blue-50'}`}>
                  <div className="flex-1">
                    <label className="block text-[10px] text-slate-500 mb-1 uppercase tracking-wide">
                        {item.type === 'raw' ? 'Πρώτη Ύλη' : 'Εξάρτημα (STX)'}
                    </label>
                    {item.type === 'raw' ? (
                         <select 
                           value={item.id}
                           onChange={(e) => updateRecipeItem(idx, 'id', e.target.value)}
                           className="w-full p-2 text-sm border border-slate-300 rounded-md bg-white text-slate-900 focus:ring-2 focus:ring-amber-500 outline-none"
                         >
                           {materials.map(m => (
                             <option key={m.id} value={m.id}>{m.name} ({m.cost_per_unit}€)</option>
                           ))}
                         </select>
                    ) : (
                         <select 
                           value={item.sku}
                           onChange={(e) => updateRecipeItem(idx, 'sku', e.target.value)}
                           className="w-full p-2 text-sm border border-slate-300 rounded-md bg-white text-slate-900 focus:ring-2 focus:ring-amber-500 outline-none"
                         >
                           {products.filter(p => p.is_component).map(p => (
                             <option key={p.sku} value={p.sku}>{p.sku} - {p.category}</option>
                           ))}
                         </select>
                    )}
                  </div>
                  <div className="w-24">
                    <label className="block text-[10px] text-slate-500 mb-1">Ποσότητα</label>
                    <input 
                      type="number" 
                      value={item.quantity}
                      onChange={(e) => updateRecipeItem(idx, 'quantity', e.target.value)}
                      className="w-full p-2 text-sm border border-slate-300 rounded-md bg-white text-slate-900 focus:ring-2 focus:ring-amber-500 outline-none"
                    />
                  </div>
                  <button type="button" onClick={() => removeRecipeItem(idx)} className="p-2 text-red-500 hover:bg-red-100 rounded-md">
                    <Trash2 size={18} />
                  </button>
                </div>
              ))}
              {recipe.length === 0 && <p className="text-sm text-slate-400 italic">Προσθέστε υλικά ή εξαρτήματα.</p>}
            </div>
          </div>
          
           {/* Labor Costs */}
           <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
             <h3 className="text-lg font-semibold mb-4 text-slate-700">3. Κόστος Εργασίας</h3>
             <div className="grid grid-cols-2 gap-4">
                 <div>
                    <label className="text-xs font-bold text-slate-500">Χύτευση (Casting) €</label>
                    <input 
                      type="number" step="0.01" 
                      value={labor.casting_cost} 
                      onChange={e => setLabor({...labor, casting_cost: parseFloat(e.target.value)})} 
                      className="w-full p-2 border border-slate-300 rounded bg-white text-slate-900 focus:ring-2 focus:ring-amber-500 outline-none" 
                    />
                 </div>
                 <div>
                    <label className="text-xs font-bold text-slate-500">Καρφωτικό (Setting) €</label>
                    <input 
                      type="number" step="0.01" 
                      value={labor.setter_cost} 
                      onChange={e => setLabor({...labor, setter_cost: parseFloat(e.target.value)})} 
                      className="w-full p-2 border border-slate-300 rounded bg-white text-slate-900 focus:ring-2 focus:ring-amber-500 outline-none" 
                    />
                 </div>
                 <div>
                    <label className="text-xs font-bold text-slate-500">Τεχνίτης (Finishing) €</label>
                    <input 
                      type="number" step="0.01" 
                      value={labor.technician_cost} 
                      onChange={e => setLabor({...labor, technician_cost: parseFloat(e.target.value)})} 
                      className="w-full p-2 border border-slate-300 rounded bg-white text-slate-900 focus:ring-2 focus:ring-amber-500 outline-none" 
                    />
                 </div>
                 <div>
                    <label className="text-xs font-bold text-slate-500">Επιμετάλλωση (Plating) €</label>
                    <input 
                      type="number" step="0.01" 
                      value={labor.plating_cost} 
                      onChange={e => setLabor({...labor, plating_cost: parseFloat(e.target.value)})} 
                      className="w-full p-2 border border-slate-300 rounded bg-white text-slate-900 focus:ring-2 focus:ring-amber-500 outline-none" 
                    />
                 </div>
             </div>
           </div>

        </div>

        {/* Right Column: Preview */}
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 sticky top-4">
            <h3 className="text-lg font-semibold mb-4 text-slate-700">Σύνοψη</h3>
             <div className="space-y-4">
                <div>
                   <label className="block text-sm font-medium text-slate-600 mb-1">Βάρος Ασημιού (g)</label>
                   <input 
                     type="number" step="0.01" value={weight}
                     onChange={(e) => setWeight(parseFloat(e.target.value))}
                     className="w-full p-2 border border-slate-300 rounded-md bg-white text-slate-900 focus:ring-2 focus:ring-amber-500 outline-none"
                   />
                </div>
                
                {!isSTX && (
                  <div>
                    <label className="block text-sm font-bold text-amber-700 mb-1">Τιμή Πώλησης (€)</label>
                    <input 
                      type="number" step="0.1" value={sellingPrice}
                      onChange={(e) => setSellingPrice(parseFloat(e.target.value))}
                      className="w-full p-2 border border-amber-300 rounded-md bg-amber-50 text-slate-900 focus:ring-2 focus:ring-amber-500 outline-none font-bold"
                    />
                  </div>
                )}
             </div>

             <div className="mt-6 pt-6 border-t border-slate-200">
               <div className="flex justify-between items-end mb-2">
                <span className="text-slate-600 font-medium">Κόστος</span>
                <span className="text-2xl font-bold text-slate-600">{estimatedCost.toFixed(2)}€</span>
              </div>
              {!isSTX && (
                  <>
                      <div className="flex justify-between items-end mb-4">
                        <span className="text-slate-800 font-bold">Πώληση</span>
                        <span className="text-3xl font-bold text-amber-600">{sellingPrice.toFixed(2)}€</span>
                      </div>
                      
                      <div className={`p-4 rounded-lg flex justify-between items-center ${profit > 0 ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                          <div className="flex flex-col">
                              <span className="text-xs font-bold uppercase tracking-wide">Κέρδος</span>
                              <span className="font-bold text-xl">{profit.toFixed(2)}€</span>
                          </div>
                          <div className="flex flex-col items-end">
                              <span className="text-xs font-bold uppercase tracking-wide">Margin</span>
                              <span className="font-bold text-xl">{margin.toFixed(1)}%</span>
                          </div>
                      </div>
                  </>
              )}
            </div>
            <button 
                type="submit" 
                disabled={isUploading}
                className="w-full mt-6 bg-slate-900 text-white py-3 rounded-lg font-medium hover:bg-slate-800 flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isUploading ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />} 
              {isUploading ? 'Αποστολή...' : 'Αποθήκευση'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
