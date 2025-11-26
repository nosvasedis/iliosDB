



import React, { useState, useEffect } from 'react';
import { Product, Material, RecipeItem, LaborCost, ProductVariant, Gender, GlobalSettings, Collection } from '../types';
import { calculateProductCost } from '../utils/pricingEngine';
import { INITIAL_SETTINGS, STONE_CODES_MEN, STONE_CODES_WOMEN, FINISH_CODES } from '../constants'; 
import { X, Save, Printer, Edit2, Box, Gem, Hammer, MapPin, Copy, Trash2, Plus, Info, Wand2, TrendingUp, Camera, Loader2, Upload, History, AlertTriangle, FolderKanban } from 'lucide-react';
import { uploadProductImage, supabase, recordStockMovement, deleteProduct, api } from '../lib/supabase';
import { compressImage } from '../utils/imageHelpers';
import { useQueryClient } from '@tanstack/react-query';

interface PrintModalProps {
    product: Product;
    onClose: () => void;
    // FIX: Update onPrint to expect items with a `quantity` property.
    onPrint: (items: { product: Product, variant?: ProductVariant, quantity: number }[]) => void;
}

const PrintModal: React.FC<PrintModalProps> = ({ product, onClose, onPrint }) => {
    const allVariants = [{ suffix: '(Master)', description: 'Βασικό Προϊόν', stock_qty: product.stock_qty }, ...(product.variants || [])];
    const [quantities, setQuantities] = useState<Record<string, number>>(
        allVariants.reduce((acc, v) => ({ ...acc, [v.suffix]: 0 }), {})
    );

    const handleQuantityChange = (suffix: string, qty: number) => {
        setQuantities(prev => ({ ...prev, [suffix]: Math.max(0, qty) }));
    };

    const handlePrint = () => {
        // FIX: Create an array of items with quantities, instead of a flattened array.
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
        }
    };

    return (
        <div className="fixed inset-0 z-[110] bg-black/50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-lg relative animate-in zoom-in-95 duration-200">
                <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600">
                    <X size={24} />
                </button>
                <h2 className="text-xl font-bold mb-4">Εκτύπωση Ετικετών για {product.sku}</h2>
                <p className="text-sm text-slate-500 mb-4">Καθορίστε τις ποσότητες για κάθε παραλλαγή που θέλετε να εκτυπώσετε.</p>
                
                <div className="max-h-64 overflow-y-auto space-y-2 pr-2">
                    {allVariants.map((v) => (
                        <div key={v.suffix} className="flex items-center justify-between p-2 bg-slate-50 rounded-lg">
                            <div>
                                <span className="font-mono font-bold">{product.sku}{v.suffix !== '(Master)' ? v.suffix : ''}</span>
                                <span className="text-xs text-slate-500 ml-2">{v.description}</span>
                            </div>
                            <input
                                type="number"
                                min="0"
                                value={quantities[v.suffix]}
                                onChange={(e) => handleQuantityChange(v.suffix, parseInt(e.target.value) || 0)}
                                className="w-20 p-1.5 border border-slate-300 rounded text-center bg-white text-slate-900 focus:ring-2 focus:ring-amber-500 outline-none"
                            />
                        </div>
                    ))}
                </div>
                
                <button onClick={handlePrint} className="mt-6 w-full bg-amber-500 text-white py-2.5 rounded-lg font-bold flex items-center justify-center gap-2 hover:bg-amber-600 transition-colors">
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
  // FIX: Update setPrintItems to expect items with a `quantity` property.
  setPrintItems: (items: { product: Product; variant?: ProductVariant; quantity: number }[]) => void;
  settings: GlobalSettings;
  collections: Collection[];
}

export default function ProductDetails({ product, allProducts, allMaterials, onClose, onSave, setPrintItems, settings, collections }: Props) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'overview' | 'recipe' | 'labor' | 'variants'>('overview');
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  
  const [editedProduct, setEditedProduct] = useState<Product>({ 
      ...product,
      variants: product.variants || [],
      selling_price: product.selling_price || 0,
      molds: product.molds || [],
      collections: product.collections || []
  });

  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isSavingCollections, setIsSavingCollections] = useState(false);

  // Smart Builder State
  const [builderFinish, setBuilderFinish] = useState('');
  const [builderStone, setBuilderStone] = useState('');
  const [builderQty, setBuilderQty] = useState(0);

  // Recalculate cost dynamically for display
  const cost = calculateProductCost(editedProduct, settings, allMaterials, allProducts);
  
  // Profit & Margin Calc
  const profit = editedProduct.selling_price - cost.total;
  const margin = editedProduct.selling_price > 0 ? ((profit / editedProduct.selling_price) * 100) : 0;

  const handleSave = async () => {
    // 1. Update Product Basic Info
    await supabase.from('products').update({
        weight_g: editedProduct.weight_g,
        selling_price: editedProduct.selling_price,
        labor_casting: editedProduct.labor.casting_cost,
        labor_setter: editedProduct.labor.setter_cost,
        labor_technician: editedProduct.labor.technician_cost,
        labor_plating: editedProduct.labor.plating_cost
    }).eq('sku', editedProduct.sku);

    // 2. Update Variants
    for (const variant of editedProduct.variants || []) {
        await supabase.from('product_variants').upsert({
            product_sku: editedProduct.sku,
            suffix: variant.suffix,
            description: variant.description,
            stock_qty: variant.stock_qty
        }, { onConflict: 'product_sku, suffix' });
    }
    
    // Invalidate Cache
    queryClient.invalidateQueries({ queryKey: ['products'] });

    if (onSave) onSave(editedProduct);
    onClose();
  };

  const handleDelete = async () => {
      setIsDeleting(true);
      const result = await deleteProduct(editedProduct.sku, editedProduct.image_url);
      setIsDeleting(false);

      if (result.success) {
          queryClient.invalidateQueries({ queryKey: ['products'] });
          onClose(); // Close the main modal
          alert("Το προϊόν διαγράφηκε επιτυχώς.");
      } else {
          alert(`Σφάλμα: ${result.error}`);
          setShowDeleteConfirm(false); // Close the confirmation but keep the details open so user can fix issues
      }
  };

  // Special handler for Stock Changes to log movement
  const handleStockChange = async (newQty: number, variantIndex: number = -1) => {
      let diff = 0;
      let reason = 'Manual Adjustment';
      let variantSuffix = undefined;

      if (variantIndex === -1) { // Master Stock
          diff = newQty - editedProduct.stock_qty;
          setEditedProduct({ ...editedProduct, stock_qty: newQty });
          await supabase.from('products').update({ stock_qty: newQty }).eq('sku', editedProduct.sku);
      } else { // Variant Stock
          const vars = [...(editedProduct.variants || [])];
          diff = newQty - vars[variantIndex].stock_qty;
          variantSuffix = vars[variantIndex].suffix;
          vars[variantIndex].stock_qty = newQty;
          setEditedProduct({ ...editedProduct, variants: vars });
          await supabase.from('product_variants').update({ stock_qty: newQty })
              .match({ product_sku: editedProduct.sku, suffix: variantSuffix });
      }

      if (diff !== 0) {
          recordStockMovement(editedProduct.sku, diff, reason, variantSuffix);
          queryClient.invalidateQueries({ queryKey: ['products'] });
      }
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
              }
          } catch (error) {
              console.error("Image update failed:", error);
              alert("Σφάλμα κατά την ενημέρωση της φωτογραφίας.");
          } finally {
              setIsUploadingImage(false);
          }
      }
  };

  const handleSmartAdd = async () => {
     const suffix = `${builderFinish}${builderStone}`;
     if (!suffix) return alert("Επιλέξτε τουλάχιστον ένα χαρακτηριστικό.");
     
     const finishName = FINISH_CODES[builderFinish] || '';
     const stoneName = STONE_CODES_MEN[builderStone] || STONE_CODES_WOMEN[builderStone] || '';
     
     let description = [finishName, stoneName].filter(Boolean).join(' - ');

     const newVar: ProductVariant = { suffix, description, stock_qty: builderQty };

     await supabase.from('product_variants').insert({
         product_sku: editedProduct.sku, ...newVar
     });

     if (builderQty > 0) {
         recordStockMovement(editedProduct.sku, builderQty, 'Initial Variant Stock', suffix);
     }
     
     setEditedProduct(prev => ({ ...prev, variants: [...(prev.variants || []), newVar] }));
     queryClient.invalidateQueries({ queryKey: ['products'] });
     setBuilderFinish(''); setBuilderStone(''); setBuilderQty(0);
  };
  
  const addEmptyVariant = () => setEditedProduct({ ...editedProduct, variants: [...(editedProduct.variants || []), { suffix: '', description: '', stock_qty: 0 }] });
  const updateVariant = (index: number, field: keyof ProductVariant, value: any) => {
      const newVars = [...(editedProduct.variants || [])];
      newVars[index] = { ...newVars[index], [field]: value };
      setEditedProduct({ ...editedProduct, variants: newVars });
  };
  const removeVariant = async (index: number) => {
      const variantToRemove = (editedProduct.variants || [])[index];
      await supabase.from('product_variants').delete().match({ product_sku: editedProduct.sku, suffix: variantToRemove.suffix });
      const newVars = (editedProduct.variants || []).filter((_, i) => i !== index);
      setEditedProduct({ ...editedProduct, variants: newVars });
      queryClient.invalidateQueries({ queryKey: ['products'] });
  };

  const handleCollectionToggle = async (collectionId: number) => {
    setIsSavingCollections(true);
    const currentCollections = editedProduct.collections || [];
    const newCollections = currentCollections.includes(collectionId)
      ? currentCollections.filter(id => id !== collectionId)
      : [...currentCollections, collectionId];
    
    setEditedProduct(prev => ({ ...prev, collections: newCollections }));
    await api.setProductCollections(editedProduct.sku, newCollections);
    queryClient.invalidateQueries({ queryKey: ['products'] });
    setIsSavingCollections(false);
  };

  const stoneOptions = product.gender === Gender.Men 
      ? STONE_CODES_MEN 
      : (product.gender === Gender.Women ? STONE_CODES_WOMEN : {...STONE_CODES_WOMEN, ...STONE_CODES_MEN});

  return (
    <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-2 md:p-6">
      
      {showPrintModal && <PrintModal product={editedProduct} onClose={() => setShowPrintModal(false)} onPrint={setPrintItems} />}

      {showDeleteConfirm && (
        <div className="absolute inset-0 z-[120] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
            <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full p-6 animate-in zoom-in-95 duration-200 border-t-4 border-red-600">
                <div className="flex items-center gap-3 text-red-600 mb-4"><div className="p-3 bg-red-100 rounded-full"><AlertTriangle size={24} /></div><h3 className="text-lg font-bold">Διαγραφή Προϊόντος</h3></div>
                <p className="text-slate-700 font-medium mb-2">Είστε σίγουροι ότι θέλετε να διαγράψετε το προϊόν <strong>{editedProduct.sku}</strong>;</p>
                <p className="text-sm text-slate-500 mb-6 leading-relaxed">Αυτή η ενέργεια είναι μόνιμη. Θα διαγραφούν όλες οι παραλλαγές, το ιστορικό και η φωτογραφία του.</p>
                <div className="flex justify-end gap-3">
                    <button onClick={() => setShowDeleteConfirm(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium" disabled={isDeleting}>Ακύρωση</button>
                    <button onClick={handleDelete} className="px-4 py-2 bg-red-600 text-white hover:bg-red-700 rounded-lg font-medium flex items-center gap-2" disabled={isDeleting}>
                        {isDeleting && <Loader2 className="animate-spin" size={16} />} {isDeleting ? 'Διαγραφή...' : 'Οριστική Διαγραφή'}
                    </button>
                </div>
            </div>
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="p-6 border-b border-slate-100 flex items-start justify-between bg-slate-50">
          <div className="flex gap-4">
            <div className="group relative w-24 h-24 bg-white rounded-lg border border-slate-200 overflow-hidden shadow-sm flex-shrink-0 cursor-pointer">
               <img src={editedProduct.image_url} alt={editedProduct.sku} className="w-full h-full object-cover" />
               <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white text-[10px] font-medium pointer-events-none z-40">
                  {isUploadingImage ? <Loader2 className="animate-spin mb-1" size={20} /> : <Camera size={20} className="mb-1" />} {isUploadingImage ? 'Uploading...' : 'Αλλαγή'}
               </div>
               {!isUploadingImage && <input type="file" accept="image/*" onChange={handleImageUpdate} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-50"/>}
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                 <h2 className="text-2xl font-black text-slate-800">{editedProduct.sku}</h2>
                 {editedProduct.is_component && <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-bold rounded-full">ΕΞΑΡΤΗΜΑ (STX)</span>}
              </div>
              <p className="text-slate-500 font-medium mb-2">{editedProduct.category} • {editedProduct.gender}</p>
              <div className="flex items-center gap-4 text-sm">
                <div className="flex items-center gap-1 bg-amber-100 text-amber-800 px-3 py-1 rounded-md"><MapPin size={16} /><span className="font-bold">Λάστιχο: {editedProduct.molds?.length ? editedProduct.molds.join(', ') : 'N/A'}</span></div>
                <div className="flex items-center gap-1 text-slate-600"><span className="font-mono font-bold text-lg">{cost.total.toFixed(2)}€</span><span className="text-xs text-slate-400">(Τιμή Κόστους)</span></div>
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors"><X size={24} className="text-slate-500" /></button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200 px-6 overflow-x-auto"><TabButton active={activeTab === 'overview'} onClick={() => setActiveTab('overview')} label="Επισκόπηση" icon={<Edit2 size={16}/>} /><TabButton active={activeTab === 'variants'} onClick={() => setActiveTab('variants')} label="Παραλλαγές" icon={<Copy size={16}/>} /><TabButton active={activeTab === 'recipe'} onClick={() => setActiveTab('recipe')} label="Συνταγή (BOM)" icon={<Box size={16}/>} /><TabButton active={activeTab === 'labor'} onClick={() => setActiveTab('labor')} label="Εργατικά" icon={<Hammer size={16}/>} /></div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50">
          
          {activeTab === 'overview' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl">
               <div className="space-y-4">
                  <h3 className="font-bold text-slate-700 border-b pb-2">Στοιχεία Αποθήκης</h3>
                  <div className="grid grid-cols-2 gap-4">
                     <InputGroup label="Λάστιχα"><div className="p-2 border border-slate-300 rounded bg-slate-100 text-slate-600 text-sm">{editedProduct.molds?.length ? editedProduct.molds.join(', ') : 'Κανένα Λάστιχο'}</div></InputGroup>
                     <InputGroup label="Απόθεμα (Master)"><div className="relative"><input type="number" value={editedProduct.stock_qty} onChange={(e) => handleStockChange(parseInt(e.target.value) || 0)} className="w-full p-2 border border-slate-300 rounded bg-white text-slate-900 focus:ring-2 focus:ring-amber-500 outline-none pr-8"/><History size={16} className="absolute right-2 top-3 text-slate-400" /></div></InputGroup>
                  </div>
                   <div className="pt-4"><h3 className="font-bold text-slate-700 border-b pb-2">Μεταλλικά Στοιχεία</h3><div className="mt-2"><InputGroup label="Βάρος Ασημιού (γραμμάρια)"><input type="number" step="0.01" value={editedProduct.weight_g} onChange={(e) => setEditedProduct({...editedProduct, weight_g: parseFloat(e.target.value)})} className="w-full p-2 border border-slate-300 rounded bg-white text-slate-900 font-mono focus:ring-2 focus:ring-amber-500 outline-none"/></InputGroup></div></div>
               </div>
               <div className="space-y-4">
                  {!editedProduct.is_component && (
                   <div className="bg-white p-5 rounded-lg border border-amber-100 shadow-sm space-y-4">
                       <h3 className="font-bold text-slate-700 border-b pb-2 flex items-center gap-2"><TrendingUp size={18} className="text-green-600"/>Εμπορική Διαχείριση</h3>
                       <InputGroup label="Τιμή Πώλησης (€)"><input type="number" step="0.1" value={editedProduct.selling_price} onChange={(e) => setEditedProduct({...editedProduct, selling_price: parseFloat(e.target.value)})} className="w-full p-2 border border-amber-300 rounded bg-amber-50 text-slate-900 font-bold text-lg focus:ring-2 focus:ring-amber-500 outline-none"/></InputGroup>
                       <div className="grid grid-cols-2 gap-4 pt-2">
                           <div className="bg-slate-50 p-3 rounded-lg border border-slate-200"><span className="block text-xs font-bold text-slate-500 uppercase">Κέρδος</span><span className={`block text-lg font-bold ${profit >= 0 ? 'text-green-600' : 'text-red-500'}`}>{profit.toFixed(2)}€</span></div>
                           <div className="bg-slate-50 p-3 rounded-lg border border-slate-200"><span className="block text-xs font-bold text-slate-500 uppercase">Margin</span><span className={`block text-lg font-bold ${margin >= 40 ? 'text-green-600' : (margin >= 20 ? 'text-orange-500' : 'text-red-500')}`}>{margin.toFixed(1)}%</span></div>
                       </div>
                   </div>)}
                   <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm space-y-3">
                       <h3 className="font-bold text-slate-700 flex items-center gap-2"><FolderKanban size={18} className="text-blue-600"/>Οργάνωση</h3>
                       <div className="max-h-32 overflow-y-auto space-y-2 pr-2">
                         {collections.map(c => (
                             <label key={c.id} className="flex items-center gap-2 p-2 rounded hover:bg-slate-50 cursor-pointer">
                               <input type="checkbox" checked={(editedProduct.collections || []).includes(c.id)} onChange={() => handleCollectionToggle(c.id)} className="h-4 w-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500" />
                               <span className="text-sm font-medium text-slate-700">{c.name}</span>
                             </label>
                         ))}
                         {isSavingCollections && <div className="text-xs text-slate-400 flex items-center gap-1"><Loader2 size={12} className="animate-spin" /><span>Saving...</span></div>}
                       </div>
                   </div>
               </div>
            </div>
          )}

          {activeTab === 'variants' && (
              <div className="space-y-6">
                  <div className="bg-white p-5 rounded-lg border border-amber-100 shadow-sm">
                      <div className="flex items-center gap-2 mb-3 text-amber-800"><Wand2 size={18} /><h4 className="font-bold text-sm uppercase">Αυτόματη Δημιουργία Κωδικού</h4></div>
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
                          <div><label className="block text-xs font-bold text-slate-500 mb-1">Φινίρισμα</label><select value={builderFinish} onChange={(e) => setBuilderFinish(e.target.value)} className="w-full p-2 text-sm border border-slate-300 rounded bg-white text-slate-900 outline-none focus:ring-2 focus:ring-amber-500">{Object.entries(FINISH_CODES).map(([code, name]) => (<option key={code} value={code}>{name} {code ? `(${code})` : ''}</option>))}</select></div>
                          <div className="md:col-span-2"><label className="block text-xs font-bold text-slate-500 mb-1">Πέτρα / Χρώμα</label><select value={builderStone} onChange={(e) => setBuilderStone(e.target.value)} className="w-full p-2 text-sm border border-slate-300 rounded bg-white text-slate-900 outline-none focus:ring-2 focus:ring-amber-500"><option value="">- Χωρίς Πέτρα -</option>{Object.entries(stoneOptions).map(([code, name]) => (<option key={code} value={code}>{name} ({code})</option>))}</select></div>
                          <div><label className="block text-xs font-bold text-slate-500 mb-1">Απόθεμα</label><input type="number" min="0" value={builderQty} onChange={(e) => setBuilderQty(parseInt(e.target.value) || 0)} className="w-full p-2 text-sm border border-slate-300 rounded bg-white text-slate-900 outline-none focus:ring-2 focus:ring-amber-500"/></div>
                      </div>
                      <div className="mt-4 flex items-center justify-between">
                          <div className="text-sm"><span className="text-slate-500">Preview Suffix: </span><span className="font-mono font-bold bg-slate-100 px-2 py-1 rounded ml-1">{builderFinish}{builderStone}</span></div>
                          <button onClick={handleSmartAdd} className="bg-amber-500 text-white px-4 py-2 rounded font-medium text-sm hover:bg-amber-600 transition-colors flex items-center gap-2"><Plus size={16} /> Προσθήκη</button>
                      </div>
                  </div>
                  <div className="flex justify-between items-center mt-6"><h3 className="font-bold text-slate-700">Λίστα Παραλλαγών</h3><button onClick={addEmptyVariant} className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600"><Plus size={14} /> Custom</button></div>
                  <div className="bg-white rounded-lg border border-slate-200 overflow-hidden shadow-sm">
                      <table className="w-full text-sm text-left">
                          <thead className="bg-slate-50 text-slate-500 font-medium uppercase text-xs"><tr><th className="p-3">Suffix</th><th className="p-3">Πλήρες SKU</th><th className="p-3">Περιγραφή (Πέτρα/Χρώμα)</th><th className="p-3 text-right">Απόθεμα</th><th className="p-3 w-10"></th></tr></thead>
                          <tbody className="divide-y divide-slate-100">
                              {editedProduct.variants?.map((v, idx) => (<tr key={idx} className="hover:bg-slate-50">
                                      <td className="p-2"><input type="text" placeholder="π.χ. PTG" value={v.suffix} onChange={(e) => updateVariant(idx, 'suffix', e.target.value.toUpperCase())} className="w-24 p-1.5 border border-slate-200 rounded text-center font-mono font-bold uppercase bg-white text-slate-900 focus:ring-2 focus:ring-blue-400 outline-none"/></td>
                                      <td className="p-2"><span className="bg-slate-100 px-2 py-1 rounded font-mono font-bold text-slate-700">{editedProduct.sku}<span className="text-amber-600">{v.suffix}</span></span></td>
                                      <td className="p-2"><input type="text" placeholder="π.χ. Πατίνα - Tiger Eye" value={v.description} onChange={(e) => updateVariant(idx, 'description', e.target.value)} className="w-full p-1.5 border border-slate-200 rounded bg-white text-slate-900 focus:ring-2 focus:ring-blue-400 outline-none"/></td>
                                      <td className="p-2"><input type="number" value={v.stock_qty} onChange={(e) => handleStockChange(parseInt(e.target.value), idx)} className="w-20 p-1.5 border border-slate-200 rounded text-right bg-white text-slate-900 ml-auto block focus:ring-2 focus:ring-blue-400 outline-none"/></td>
                                      <td className="p-2 text-center"><button onClick={() => removeVariant(idx)} className="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"><Trash2 size={16} /></button></td>
                                  </tr>))}
                              {(!editedProduct.variants || editedProduct.variants.length === 0) && (<tr><td colSpan={5} className="p-8 text-center text-slate-400 italic">Δεν υπάρχουν παραλλαγές. Χρησιμοποιήστε τον Builder παραπάνω.</td></tr>)}
                          </tbody>
                      </table>
                  </div>
              </div>
          )}

          {activeTab === 'recipe' && (
            <div className="space-y-4 max-w-4xl">
              <div className="flex justify-between items-center mb-2"><h3 className="font-bold text-slate-700">Υλικά & Εξαρτήματα</h3><span className="text-xs bg-slate-200 px-2 py-1 rounded text-slate-600">Σύνολο Υλικών: {cost.breakdown.materials.toFixed(2)}€</span></div>
              <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                 <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 text-slate-500 font-medium"><tr><th className="p-3">Τύπος</th><th className="p-3">Περιγραφή / SKU</th><th className="p-3 text-right">Ποσότητα</th><th className="p-3 text-right">Κόστος Μον.</th><th className="p-3 text-right">Σύνολο</th></tr></thead>
                    <tbody className="divide-y divide-slate-100">
                       {editedProduct.recipe.map((item, idx) => {
                          let name = 'Άγνωστο', unitCost = 0, icon = <Box size={16} />;
                          if (item.type === 'raw') {
                             const mat = allMaterials.find(m => m.id === item.id);
                             name = mat ? mat.name : `Raw ID: ${item.id}`; unitCost = mat ? mat.cost_per_unit : 0; icon = <Gem size={16} className="text-purple-500" />;
                          } else {
                             const sub = allProducts.find(p => p.sku === item.sku);
                             name = sub ? `${sub.category} (${item.sku})` : `SKU: ${item.sku}`; unitCost = sub ? calculateProductCost(sub, settings, allMaterials, allProducts).total : 0; icon = <Box size={16} className="text-blue-500" />;
                          }
                          return (<tr key={idx} className="hover:bg-slate-50"><td className="p-3"><div className="flex justify-center">{icon}</div></td><td className="p-3 font-medium text-slate-700">{name}</td><td className="p-3 text-right font-mono">{item.quantity}</td><td className="p-3 text-right text-slate-500">{unitCost.toFixed(2)}€</td><td className="p-3 text-right font-bold text-slate-800">{(unitCost * item.quantity).toFixed(2)}€</td></tr>)
                       })}
                       {editedProduct.recipe.length === 0 && (<tr><td colSpan={5} className="p-8 text-center text-slate-400 italic">Δεν υπάρχουν υλικά στη συνταγή.</td></tr>)}
                    </tbody>
                 </table>
              </div>
            </div>
          )}

          {activeTab === 'labor' && (
             <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl">
                <div className="bg-white p-6 rounded-lg border border-slate-200 space-y-4"><h3 className="font-bold text-slate-700">Χρεώσεις Εργαστηρίου</h3><InputGroup label="Χύτευση (Casting)"><input type="number" step="0.01" value={editedProduct.labor.casting_cost} onChange={(e) => setEditedProduct({...editedProduct, labor: {...editedProduct.labor, casting_cost: parseFloat(e.target.value)}})} className="w-full p-2 border border-slate-300 rounded bg-white text-slate-900 text-right focus:ring-2 focus:ring-amber-500 outline-none"/></InputGroup><InputGroup label="Καρφωτικό (Setting)"><input type="number" step="0.01" value={editedProduct.labor.setter_cost} onChange={(e) => setEditedProduct({...editedProduct, labor: {...editedProduct.labor, setter_cost: parseFloat(e.target.value)}})} className="w-full p-2 border border-slate-300 rounded bg-white text-slate-900 text-right focus:ring-2 focus:ring-amber-500 outline-none"/></InputGroup><InputGroup label="Τεχνίτης (Finishing)"><input type="number" step="0.01" value={editedProduct.labor.technician_cost} onChange={(e) => setEditedProduct({...editedProduct, labor: {...editedProduct.labor, technician_cost: parseFloat(e.target.value)}})} className="w-full p-2 border border-slate-300 rounded bg-white text-slate-900 text-right focus:ring-2 focus:ring-amber-500 outline-none"/></InputGroup></div>
                <div className="bg-white p-6 rounded-lg border border-slate-200 space-y-4"><h3 className="font-bold text-slate-700">Εξωτερικές Εργασίες</h3><InputGroup label="Επιμετάλλωση (Plating)"><input type="number" step="0.01" value={editedProduct.labor.plating_cost} onChange={(e) => setEditedProduct({...editedProduct, labor: {...editedProduct.labor, plating_cost: parseFloat(e.target.value)}})} className="w-full p-2 border border-slate-300 rounded bg-white text-slate-900 text-right focus:ring-2 focus:ring-amber-500 outline-none"/></InputGroup></div>
             </div>
          )}

        </div>

        {/* Footer Actions */}
        <div className="p-6 border-t border-slate-200 bg-white flex justify-between items-center">
            <div className="flex items-center gap-2">
               <button onClick={() => setShowPrintModal(true)} className="flex items-center gap-2 text-slate-600 hover:text-slate-900 transition-colors"><Printer size={20} /> <span className="hidden sm:inline">Εκτύπωση Ετικέτας</span></button>
               <button onClick={() => setShowDeleteConfirm(true)} className="flex items-center gap-2 text-red-400 hover:text-red-600 hover:bg-red-50 px-3 py-1.5 rounded transition-colors ml-4"><Trash2 size={18} /> <span className="hidden sm:inline">Διαγραφή</span></button>
            </div>
           <div className="flex gap-4">
              <button onClick={onClose} className="px-6 py-2 rounded-lg text-slate-600 hover:bg-slate-100 font-medium">Ακύρωση</button>
              <button onClick={handleSave} className="px-6 py-2 rounded-lg bg-slate-900 text-white hover:bg-slate-800 font-medium flex items-center gap-2"><Save size={18} /> Αποθήκευση</button>
           </div>
        </div>

      </div>
    </div>
  );
}

const TabButton = ({ active, onClick, label, icon }: any) => (<button onClick={onClick} className={`flex items-center gap-2 px-6 py-4 font-medium text-sm border-b-2 transition-colors whitespace-nowrap ${active ? 'border-amber-500 text-amber-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>{icon} {label}</button>);
const InputGroup = ({ label, children }: any) => (<div><label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-wide">{label}</label>{children}</div>);
