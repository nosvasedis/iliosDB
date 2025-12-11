import React, { useState, useEffect, useMemo } from 'react';
import { Product, Material, Gender, PlatingType, RecipeItem, LaborCost, Mold, ProductVariant, MaterialType, ProductionType } from '../types';
import { calculateProductCost, formatCurrency, formatDecimal, analyzeSku } from '../utils/pricingEngine';
import { Plus, Trash2, Box, ArrowRight, ArrowLeft, CheckCircle, Gem, Puzzle, Coins, Save, X, ImageIcon, Upload, Loader2, Info, Flame, Hammer, Tag } from 'lucide-react';
import { api, uploadProductImage, supabase } from '../lib/supabase';
import { useUI } from './UIProvider';
import { useQueryClient } from '@tanstack/react-query';

interface Props {
  products: Product[];
  materials: Material[];
  molds: Mold[];
  onCancel: () => void;
}

const INITIAL_LABOR: LaborCost = {
  casting_cost: 0,
  setter_cost: 0,
  technician_cost: 0,
  plating_cost_x: 0,
  plating_cost_d: 0,
  stone_setting_cost: 0,
  subcontract_cost: 0,
  casting_cost_manual_override: false,
  technician_cost_manual_override: false,
  plating_cost_x_manual_override: false,
  plating_cost_d_manual_override: false
};

export default function NewProduct({ products, materials, molds, onCancel }: Props) {
  const { showToast } = useUI();
  const queryClient = useQueryClient();
  const settings = queryClient.getQueryData<any>(['settings']); // Get settings from cache

  const [currentStep, setCurrentStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form Data
  const [sku, setSku] = useState('');
  const [category, setCategory] = useState('');
  const [gender, setGender] = useState<Gender>(Gender.Women);
  const [weight, setWeight] = useState<number>(0);
  const [secondaryWeight, setSecondaryWeight] = useState<number>(0);
  const [platingType, setPlatingType] = useState<PlatingType>(PlatingType.GoldPlated);
  const [productionType, setProductionType] = useState<ProductionType>(ProductionType.InHouse);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  
  // Production Data
  const [recipe, setRecipe] = useState<RecipeItem[]>([]);
  const [selectedMolds, setSelectedMolds] = useState<{code: string, quantity: number}[]>([]);
  const [labor, setLabor] = useState<LaborCost>(INITIAL_LABOR);
  const [supplierId, setSupplierId] = useState<string>('');
  const [supplierCost, setSupplierCost] = useState<number>(0);

  // Helper State
  const [isRecipeModalOpen, setIsRecipeModalOpen] = useState<'raw' | 'component' | null>(null);

  // Calculate Cost Preview
  const costBreakdown = useMemo(() => {
      if (!settings) return { total: 0, breakdown: {} };
      
      const tempProduct: Product = {
          sku: sku || 'TEMP',
          prefix: sku.substring(0, 2),
          category,
          gender,
          image_url: imageUrl,
          weight_g: weight,
          secondary_weight_g: secondaryWeight,
          plating_type: platingType,
          production_type: productionType,
          active_price: 0,
          draft_price: 0,
          selling_price: 0,
          stock_qty: 0,
          sample_qty: 0,
          molds: selectedMolds,
          is_component: false,
          recipe,
          labor,
          supplier_id: supplierId,
          supplier_cost: supplierCost
      };

      return calculateProductCost(tempProduct, settings, materials, products);
  }, [sku, category, gender, weight, secondaryWeight, platingType, productionType, recipe, labor, supplierId, supplierCost, settings, materials, products, selectedMolds]);

  // Handlers
  const handleNext = () => setCurrentStep(prev => prev + 1);
  const handleBack = () => setCurrentStep(prev => prev - 1);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0]) {
          const file = e.target.files[0];
          setImageFile(file);
          const reader = new FileReader();
          reader.onloadend = () => {
              setImageUrl(reader.result as string);
          };
          reader.readAsDataURL(file);
      }
  };

  const addRecipeItem = (type: 'raw' | 'component', idOrSku: string) => {
      if (type === 'raw') {
          setRecipe([...recipe, { type: 'raw', id: idOrSku, quantity: 1 }]);
      } else {
          setRecipe([...recipe, { type: 'component', sku: idOrSku, quantity: 1 }]);
      }
      setIsRecipeModalOpen(null);
  };

  const updateRecipeItem = (index: number, field: keyof RecipeItem, value: any) => {
      const updated = [...recipe];
      updated[index] = { ...updated[index], [field]: value };
      setRecipe(updated);
  };

  const removeRecipeItem = (index: number) => {
      setRecipe(recipe.filter((_, i) => i !== index));
  };

  const handleCreate = async () => {
      if (!sku) return showToast('Το SKU είναι υποχρεωτικό', 'error');
      
      setIsSubmitting(true);
      try {
          // 1. Upload Image if exists
          let finalImageUrl = imageUrl;
          if (imageFile) {
              const uploadedUrl = await uploadProductImage(imageFile, sku);
              if (uploadedUrl) finalImageUrl = uploadedUrl;
          }

          // 2. Prepare Product Object
          const newProduct: Product = {
              sku,
              prefix: sku.substring(0, 2),
              category,
              gender,
              image_url: finalImageUrl,
              weight_g: weight,
              secondary_weight_g: secondaryWeight,
              plating_type: platingType,
              production_type: productionType,
              active_price: costBreakdown.total,
              draft_price: costBreakdown.total,
              selling_price: costBreakdown.total * 2.5, // Default markup logic
              stock_qty: 0,
              sample_qty: 0,
              molds: selectedMolds,
              is_component: category.includes('Εξάρτημα'), // Heuristic
              recipe,
              labor,
              supplier_id: supplierId || undefined,
              supplier_cost: supplierCost
          };

          // 3. Save to DB (This logic should be in api.saveProduct ideally, but implementing inline for now as createProduct isn't in api object in snippets)
          const { error: prodError } = await supabase.from('products').insert({
              sku: newProduct.sku,
              prefix: newProduct.prefix,
              category: newProduct.category,
              gender: newProduct.gender,
              image_url: newProduct.image_url,
              weight_g: newProduct.weight_g,
              secondary_weight_g: newProduct.secondary_weight_g,
              plating_type: newProduct.plating_type,
              production_type: newProduct.production_type,
              active_price: newProduct.active_price,
              draft_price: newProduct.draft_price,
              selling_price: newProduct.selling_price,
              stock_qty: 0,
              sample_qty: 0,
              is_component: newProduct.is_component,
              supplier_id: newProduct.supplier_id,
              supplier_cost: newProduct.supplier_cost,
              // Labor columns
              labor_casting: newProduct.labor.casting_cost,
              labor_setter: newProduct.labor.setter_cost,
              labor_technician: newProduct.labor.technician_cost,
              labor_plating_x: newProduct.labor.plating_cost_x,
              labor_plating_d: newProduct.labor.plating_cost_d,
              labor_stone_setting: newProduct.labor.stone_setting_cost,
              labor_subcontract: newProduct.labor.subcontract_cost,
              labor_technician_manual_override: newProduct.labor.technician_cost_manual_override,
              labor_plating_x_manual_override: newProduct.labor.plating_cost_x_manual_override,
              labor_plating_d_manual_override: newProduct.labor.plating_cost_d_manual_override
          });
          
          if (prodError) throw prodError;

          // 4. Save Relations (Recipe, Molds)
          if (recipe.length > 0) {
              const recipeRows = recipe.map(r => ({
                  parent_sku: sku,
                  type: r.type,
                  material_id: r.type === 'raw' ? r.id : null,
                  component_sku: r.type === 'component' ? r.sku : null,
                  quantity: r.quantity
              }));
              await supabase.from('recipes').insert(recipeRows);
          }

          if (selectedMolds.length > 0) {
              const moldRows = selectedMolds.map(m => ({
                  product_sku: sku,
                  mold_code: m.code,
                  quantity: m.quantity
              }));
              await supabase.from('product_molds').insert(moldRows);
          }

          queryClient.invalidateQueries({ queryKey: ['products'] });
          showToast('Το προϊόν δημιουργήθηκε επιτυχώς!', 'success');
          onCancel();

      } catch (error: any) {
          console.error(error);
          showToast(`Σφάλμα: ${error.message}`, 'error');
      } finally {
          setIsSubmitting(false);
      }
  };

  const getMaterialIcon = (type?: MaterialType) => {
      switch(type) {
          case MaterialType.Stone: return <Gem size={16} className="text-emerald-500"/>;
          case MaterialType.Component: return <Puzzle size={16} className="text-blue-500"/>;
          default: return <Box size={16} className="text-slate-400"/>;
      }
  };

  return (
    <div className="bg-white rounded-3xl shadow-sm border border-slate-100 flex flex-col h-full animate-in fade-in">
        {/* Header */}
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 rounded-t-3xl">
            <div>
                <h2 className="text-xl font-bold text-slate-800">Νέο Προϊόν</h2>
                <div className="flex gap-2 mt-2">
                    {[1, 2, 3].map(step => (
                        <div key={step} className={`h-1.5 w-8 rounded-full ${currentStep >= step ? 'bg-[#060b00]' : 'bg-slate-200'}`} />
                    ))}
                </div>
            </div>
            <button onClick={onCancel} className="p-2 hover:bg-slate-200 rounded-full text-slate-500"><X size={20}/></button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-8">
            <div className="max-w-3xl mx-auto space-y-8">
                
                {/* STEP 1: BASIC INFO */}
                {currentStep === 1 && (
                    <div className="space-y-6 animate-in slide-in-from-right duration-300">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div className="space-y-4">
                                <div>
                                    <label className="text-xs font-bold text-slate-500 uppercase ml-1">SKU (Κωδικός)</label>
                                    <input 
                                        value={sku} 
                                        onChange={e => {
                                            setSku(e.target.value.toUpperCase());
                                            const analysis = analyzeSku(e.target.value);
                                            if (analysis.masterSku) {
                                                // Auto-detect gender/category?
                                            }
                                        }}
                                        className="w-full p-3 border border-slate-200 rounded-xl font-bold text-lg bg-slate-50 focus:bg-white focus:ring-2 focus:ring-emerald-500 outline-none transition-all uppercase"
                                        placeholder="π.χ. XR2020"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-slate-500 uppercase ml-1">Κατηγορία</label>
                                    <input 
                                        value={category}
                                        onChange={e => setCategory(e.target.value)}
                                        className="w-full p-3 border border-slate-200 rounded-xl bg-white focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                                        placeholder="π.χ. Δαχτυλίδι"
                                        list="categories"
                                    />
                                    <datalist id="categories">
                                        {Array.from(new Set(products.map(p => p.category))).map(c => <option key={c} value={c} />)}
                                    </datalist>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-xs font-bold text-slate-500 uppercase ml-1">Φύλο</label>
                                        <select 
                                            value={gender} 
                                            onChange={e => setGender(e.target.value as Gender)}
                                            className="w-full p-3 border border-slate-200 rounded-xl bg-white outline-none"
                                        >
                                            <option value={Gender.Women}>Γυναικείο</option>
                                            <option value={Gender.Men}>Ανδρικό</option>
                                            <option value={Gender.Unisex}>Unisex</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold text-slate-500 uppercase ml-1">Παραγωγή</label>
                                        <select 
                                            value={productionType} 
                                            onChange={e => setProductionType(e.target.value as ProductionType)}
                                            className="w-full p-3 border border-slate-200 rounded-xl bg-white outline-none"
                                        >
                                            <option value={ProductionType.InHouse}>Εργαστήριο (In-House)</option>
                                            <option value={ProductionType.Imported}>Εισαγωγή (Resale)</option>
                                        </select>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-xs font-bold text-slate-500 uppercase ml-1">Βάρος (g)</label>
                                        <input 
                                            type="number" 
                                            value={weight} 
                                            onChange={e => setWeight(parseFloat(e.target.value))}
                                            className="w-full p-3 border border-slate-200 rounded-xl bg-white outline-none font-mono"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold text-slate-500 uppercase ml-1">Β' Βάρος (g)</label>
                                        <input 
                                            type="number" 
                                            value={secondaryWeight} 
                                            onChange={e => setSecondaryWeight(parseFloat(e.target.value))}
                                            className="w-full p-3 border border-slate-200 rounded-xl bg-white outline-none font-mono"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-slate-500 uppercase ml-1">Επιμετάλλωση</label>
                                    <select 
                                        value={platingType} 
                                        onChange={e => setPlatingType(e.target.value as PlatingType)}
                                        className="w-full p-3 border border-slate-200 rounded-xl bg-white outline-none"
                                    >
                                        <option value={PlatingType.GoldPlated}>Επίχρυσο</option>
                                        <option value={PlatingType.Platinum}>Επιπλατινωμένο</option>
                                        <option value={PlatingType.TwoTone}>Δίχρωμο</option>
                                        <option value={PlatingType.None}>Κανένα (Λουστρέ/Πατίνα)</option>
                                    </select>
                                </div>
                            </div>
                            
                            <div className="flex flex-col gap-4">
                                <label className="text-xs font-bold text-slate-500 uppercase ml-1">Εικόνα</label>
                                <div className="aspect-square bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center relative overflow-hidden group hover:border-emerald-400 transition-colors">
                                    {imageUrl ? (
                                        <>
                                            <img src={imageUrl} className="w-full h-full object-cover" alt="Preview"/>
                                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                                <button onClick={() => { setImageUrl(null); setImageFile(null); }} className="p-2 bg-white rounded-full text-red-500"><Trash2 size={20}/></button>
                                            </div>
                                        </>
                                    ) : (
                                        <div className="text-center text-slate-400">
                                            <ImageIcon size={48} className="mx-auto mb-2 opacity-50"/>
                                            <span className="text-sm font-bold">Επιλέξτε Εικόνα</span>
                                            <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" accept="image/*" onChange={handleImageUpload} />
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* STEP 2: IN-HOUSE RECIPE */}
                {currentStep === 2 && productionType === ProductionType.InHouse && (
                    <div className="space-y-4 animate-in slide-in-from-right duration-300">
                        <div className="flex items-center gap-3 p-3 bg-slate-100 rounded-xl border border-slate-200 shadow-sm">
                            <div className="p-2 bg-white rounded-lg border border-slate-100 text-slate-600">
                                <Coins size={16} />
                            </div>
                            <div className="flex-1">
                                <div className="font-bold text-slate-800 text-sm">Ασήμι 925 (Βάση + Β')</div>
                                <div className="text-xs text-slate-400 font-mono">
                                    {formatDecimal((weight || 0) + (secondaryWeight || 0))}g @ {formatDecimal(settings?.silver_price_gram, 3)}€/g
                                </div>
                            </div>
                            <div className="text-right">
                                <div className="font-mono font-bold text-slate-800 text-lg">
                                    {formatCurrency(costBreakdown?.breakdown?.silver)}
                                </div>
                            </div>
                        </div>

                        {recipe.map((item, idx) => {
                            const itemDetails = item.type === 'raw' 
                                ? materials.find(m => m.id === item.id) 
                                : products.find(p => p.sku === item.sku);
                            const name = item.type === 'raw' 
                                ? (itemDetails as Material | undefined)?.name || "Άγνωστο"
                                : (itemDetails as Product | undefined)?.sku || "Άγνωστο";
                            const icon = item.type === 'raw' ? getMaterialIcon((itemDetails as Material)?.type) : getMaterialIcon(MaterialType.Component);
                            
                            return (
                            <div key={idx} className="flex items-center gap-3 p-3 rounded-xl border bg-white shadow-sm border-slate-100">
                                <div className="p-2 bg-slate-50 rounded-lg border border-slate-100">{icon}</div>
                                <div className="flex-1">
                                <div className="font-bold text-slate-800 text-sm">{name}</div>
                                </div>
                                <div className="w-24">
                                    <label className="block text-[10px] text-slate-400 uppercase font-bold mb-1 text-center">Ποσότητα</label>
                                    <input type="number" value={item.quantity} onChange={(e) => updateRecipeItem(idx, 'quantity', e.target.value)} className="w-full p-2 bg-slate-50 rounded-lg font-bold text-center outline-none border border-slate-200 focus:border-blue-400"/>
                                </div>
                                <button onClick={() => removeRecipeItem(idx)} className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors mt-auto"><Trash2 size={18} /></button>
                            </div>
                        )})}
                        
                        {recipe.length === 0 && <div className="text-center italic text-slate-400 py-4 text-xs">Μόνο Υλικό Βάσης (Ασήμι).</div>}

                        <div className="flex gap-2 pt-4 border-t border-slate-100">
                            <button type="button" onClick={() => setIsRecipeModalOpen('raw')} className="text-xs bg-purple-50 text-purple-700 px-4 py-3 rounded-xl font-bold border border-purple-200 flex items-center gap-2 hover:bg-purple-100 transition-all flex-1 justify-center"><Plus size={16}/> Προσθήκη Υλικού</button>
                            <button type="button" onClick={() => setIsRecipeModalOpen('component')} className="text-xs bg-blue-50 text-blue-700 px-4 py-3 rounded-xl font-bold border border-blue-200 flex items-center gap-2 hover:bg-blue-100 transition-all flex-1 justify-center"><Puzzle size={16}/> Προσθήκη STX</button>
                        </div>
                    </div>
                )}

                {/* STEP 2: IMPORTED CONFIG */}
                {currentStep === 2 && productionType === ProductionType.Imported && (
                    <div className="space-y-6 animate-in slide-in-from-right duration-300">
                        <div className="p-4 bg-purple-50 rounded-2xl border border-purple-100">
                            <h3 className="font-bold text-purple-800 mb-4 flex items-center gap-2"><Info size={18}/> Στοιχεία Προμηθευτή</h3>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs font-bold text-slate-500 uppercase ml-1">Τιμή Αγοράς (€)</label>
                                    <input 
                                        type="number" step="0.01"
                                        value={supplierCost}
                                        onChange={e => setSupplierCost(parseFloat(e.target.value))}
                                        className="w-full p-3 border border-purple-200 rounded-xl bg-white text-purple-900 font-bold outline-none"
                                    />
                                </div>
                                {/* Could add supplier selector here if list available in props */}
                            </div>
                        </div>
                        
                        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
                            <h3 className="font-bold text-slate-700 mb-4">Επιπλέον Επεξεργασία (Εργαστήριο)</h3>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs font-bold text-slate-500 uppercase ml-1">Καρφωτής (€)</label>
                                    <input 
                                        type="number" step="0.01"
                                        value={labor.stone_setting_cost}
                                        onChange={e => setLabor({...labor, stone_setting_cost: parseFloat(e.target.value)})}
                                        className="w-full p-3 border border-slate-200 rounded-xl bg-white outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-slate-500 uppercase ml-1">Επιμετάλλωση (€)</label>
                                    <input 
                                        type="number" step="0.01"
                                        value={labor.plating_cost_x}
                                        onChange={e => setLabor({...labor, plating_cost_x: parseFloat(e.target.value)})}
                                        className="w-full p-3 border border-slate-200 rounded-xl bg-white outline-none"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* STEP 3: LABOR (Only for InHouse) or REVIEW */}
                {currentStep === 3 && productionType === ProductionType.InHouse && (
                    <div className="space-y-6 animate-in slide-in-from-right duration-300">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                                <label className="flex items-center gap-2 text-sm font-bold text-slate-700 mb-2">
                                    <Flame size={16} className="text-orange-500"/> Χυτήριο
                                </label>
                                <input type="number" step="0.01" value={labor.casting_cost} onChange={e => setLabor({...labor, casting_cost: parseFloat(e.target.value)})} className="w-full p-2 border border-slate-200 rounded-lg outline-none"/>
                            </div>
                            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                                <label className="flex items-center gap-2 text-sm font-bold text-slate-700 mb-2">
                                    <Hammer size={16} className="text-blue-500"/> Τεχνίτης
                                </label>
                                <input type="number" step="0.01" value={labor.technician_cost} onChange={e => setLabor({...labor, technician_cost: parseFloat(e.target.value)})} className="w-full p-2 border border-slate-200 rounded-lg outline-none"/>
                            </div>
                            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                                <label className="flex items-center gap-2 text-sm font-bold text-slate-700 mb-2">
                                    <Gem size={16} className="text-purple-500"/> Καρφωτής
                                </label>
                                <input type="number" step="0.01" value={labor.setter_cost} onChange={e => setLabor({...labor, setter_cost: parseFloat(e.target.value)})} className="w-full p-2 border border-slate-200 rounded-lg outline-none"/>
                            </div>
                            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                                <label className="flex items-center gap-2 text-sm font-bold text-slate-700 mb-2">
                                    <Tag size={16} className="text-yellow-500"/> Φασόν / Λοιπά
                                </label>
                                <input type="number" step="0.01" value={labor.subcontract_cost} onChange={e => setLabor({...labor, subcontract_cost: parseFloat(e.target.value)})} className="w-full p-2 border border-slate-200 rounded-lg outline-none"/>
                            </div>
                        </div>
                    </div>
                )}

                {/* FINAL REVIEW & SAVE */}
                {((currentStep === 3 && productionType === ProductionType.Imported) || currentStep === 4) && (
                    <div className="space-y-6 animate-in slide-in-from-right duration-300">
                        <div className="bg-[#060b00] text-white p-8 rounded-3xl shadow-lg text-center">
                            <div className="text-sm text-slate-400 uppercase font-bold tracking-widest mb-2">Τελικο Κοστος</div>
                            <div className="text-5xl font-black mb-1">{formatCurrency(costBreakdown.total)}</div>
                            <div className="text-slate-400 text-xs">Ανά τεμάχιο</div>
                        </div>
                        
                        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                            <h3 className="font-bold text-slate-800 mb-4">Σύνοψη</h3>
                            <div className="space-y-2 text-sm">
                                <div className="flex justify-between"><span>SKU:</span> <span className="font-bold">{sku}</span></div>
                                <div className="flex justify-between"><span>Βάρος:</span> <span className="font-bold">{weight}g</span></div>
                                <div className="flex justify-between"><span>Υλικά:</span> <span className="font-bold">{recipe.length}</span></div>
                                <div className="flex justify-between pt-2 border-t border-slate-100">
                                    <span>Εργατικά:</span> 
                                    <span className="font-bold text-emerald-600">{formatCurrency(costBreakdown.breakdown.labor)}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

            </div>
        </div>

        {/* Footer Actions */}
        <div className="p-6 border-t border-slate-100 bg-slate-50 rounded-b-3xl flex justify-between">
            {currentStep > 1 ? (
                <button onClick={handleBack} className="px-6 py-3 rounded-xl border border-slate-300 text-slate-600 font-bold hover:bg-slate-100 transition-colors flex items-center gap-2">
                    <ArrowLeft size={18}/> Πίσω
                </button>
            ) : <div/>}
            
            {((currentStep < 3 && productionType === ProductionType.Imported) || (currentStep < 4 && productionType === ProductionType.InHouse)) ? (
                <button onClick={handleNext} className="px-8 py-3 rounded-xl bg-[#060b00] text-white font-bold hover:bg-slate-800 transition-colors flex items-center gap-2 shadow-lg">
                    Επόμενο <ArrowRight size={18}/>
                </button>
            ) : (
                <button onClick={handleCreate} disabled={isSubmitting} className="px-8 py-3 rounded-xl bg-emerald-600 text-white font-bold hover:bg-emerald-700 transition-colors flex items-center gap-2 shadow-lg disabled:opacity-50">
                    {isSubmitting ? <Loader2 className="animate-spin" size={18}/> : <Save size={18}/>} Ολοκλήρωση
                </button>
            )}
        </div>

        {/* Recipe Item Selector Modal */}
        {isRecipeModalOpen && (
            <div className="fixed inset-0 z-[200] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
                <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
                    <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                        <h3 className="font-bold text-slate-800">Επιλογή {isRecipeModalOpen === 'raw' ? 'Υλικού' : 'Εξαρτήματος'}</h3>
                        <button onClick={() => setIsRecipeModalOpen(null)}><X size={20}/></button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-2">
                        {isRecipeModalOpen === 'raw' ? (
                            materials.map(m => (
                                <div key={m.id} onClick={() => addRecipeItem('raw', m.id)} className="p-3 hover:bg-slate-50 cursor-pointer rounded-lg flex justify-between items-center border-b border-slate-50 last:border-0">
                                    <div className="font-bold text-slate-700">{m.name}</div>
                                    <div className="text-xs text-slate-400">{m.cost_per_unit}€ / {m.unit}</div>
                                </div>
                            ))
                        ) : (
                            products.filter(p => p.is_component).map(p => (
                                <div key={p.sku} onClick={() => addRecipeItem('component', p.sku)} className="p-3 hover:bg-slate-50 cursor-pointer rounded-lg flex justify-between items-center border-b border-slate-50 last:border-0">
                                    <div className="font-bold text-slate-700">{p.sku}</div>
                                    <div className="text-xs text-slate-400">{p.category}</div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        )}
    </div>
  );
}