










import React, { useState } from 'react';
import { Product, Material, RecipeItem, LaborCost, ProductVariant, Gender, GlobalSettings, Collection } from '../types';
import { calculateProductCost } from '../utils/pricingEngine';
import { INITIAL_SETTINGS, STONE_CODES_MEN, STONE_CODES_WOMEN, FINISH_CODES } from '../constants'; 
import { X, Save, Printer, Edit2, Box, Gem, Hammer, MapPin, Copy, Trash2, Plus, Info, Wand2, TrendingUp, Camera, Loader2, Upload, History, AlertTriangle, FolderKanban, CheckCircle, RefreshCcw, Tag, ImageIcon, Coins } from 'lucide-react';
import { uploadProductImage, supabase, recordStockMovement, deleteProduct, api } from '../lib/supabase';
import { compressImage } from '../utils/imageHelpers';
import { useQueryClient } from '@tanstack/react-query';
import { useUI } from './UIProvider';

interface PrintModalProps {
    product: Product;
    onClose: () => void;
    onPrint: (items: { product: Product, variant?: ProductVariant, quantity: number }[]) => void;
}

const PrintModal: React.FC<PrintModalProps> = ({ product, onClose, onPrint }) => {
    // Include Master in the list if it has no variants or just as an option
    // Actually, usually master is printed if no variants exist. 
    // If variants exist, we usually print specific variants.
    // Let's offer Master as an option always, labeled "(Master)"
    
    const allVariants = [{ suffix: '(Master)', description: 'Βασικό Προϊόν', stock_qty: product.stock_qty }, ...(product.variants || [])];
    
    // Initialize with 0
    const [quantities, setQuantities] = useState<Record<string, number>>(
        allVariants.reduce((acc, v) => ({ ...acc, [v.suffix]: 0 }), {})
    );

    // If no variants, default master to 1
    React.useEffect(() => {
        if (!product.variants || product.variants.length === 0) {
            setQuantities(prev => ({...prev, '(Master)': 1}));
        }
    }, [product]);

    const handleQuantityChange = (suffix: string, qty: number) => {
        setQuantities(prev => ({ ...prev, [suffix]: Math.max(0, qty) }));
    };

    const handlePrint = () => {
        const itemsToPrint: { product: Product, variant?: ProductVariant, quantity: number }[] = [];
        for (const suffix in quantities) {
            const qty = quantities[suffix];
            if (qty > 0) {
                // If suffix is (Master), pass undefined variant
                const variant = suffix === '(Master)' ? undefined : product.variants?.find(v => v.suffix === suffix);
                itemsToPrint.push({ product, variant, quantity: qty });
            }
        }
        
        if (itemsToPrint.length > 0) {
            onPrint(itemsToPrint);
            // Delay closing to ensure the print state propagates to the parent App and triggers the hidden print view
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
                    {allVariants.map((v) => (
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
  
  // If we are in Warehouse mode, default to Overview. If Registry, also Overview.
  const [activeTab, setActiveTab] = useState<'overview' | 'recipe' | 'labor' | 'variants'>('overview');
  const [showPrintModal, setShowPrintModal] = useState(false);
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

  // Cost Logic only needed if viewMode is 'registry' or we want to show it.
  const cost = calculateProductCost(editedProduct, settings, allMaterials, allProducts);
  const profit = editedProduct.selling_price - cost.total;
  const margin = editedProduct.selling_price > 0 ? ((profit / editedProduct.selling_price) * 100) : 0;
  
  // Retail Logic
  const retailPrice = editedProduct.selling_price * 3;
  
  // Silver Cost for display
  const lossMultiplier = 1 + (settings.loss_percentage / 100);
  const silverTotalCost = editedProduct.weight_g * (settings.silver_price_gram * lossMultiplier);


  // ... (Keep existing handlers: suggestSellingPrice, handleSave, requestDelete, handleStockChange, handleImageUpdate, etc.)
  const handleStockChange = async (newQty: number, variantIndex: number = -1) => {
      let diff = 0;
      let reason = 'Χειροκίνητη Διόρθωση';
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

  const suggestSellingPrice = () => {
      const suggested = cost.total * 2.5; 
      setEditedProduct(prev => ({...prev, selling_price: parseFloat(suggested.toFixed(2))}));
      showToast("Προτάθηκε νέα τιμή χονδρικής με markup 2.5x", "info");
  };

  const handleSave = async () => {
    await supabase.from('products').update({
        weight_g: editedProduct.weight_g,
        selling_price: editedProduct.selling_price,
        labor_casting: editedProduct.labor.casting_cost,
        labor_setter: editedProduct.labor.setter_cost,
        labor_technician: editedProduct.labor.technician_cost,
        labor_plating: editedProduct.labor.plating_cost
    }).eq('sku', editedProduct.sku);

    for (const variant of editedProduct.variants || []) {
        await supabase.from('product_variants').upsert({
            product_sku: editedProduct.sku,
            suffix: variant.suffix,
            description: variant.description,
            stock_qty: variant.stock_qty
        }, { onConflict: 'product_sku, suffix' });
    }
    
    queryClient.invalidateQueries({ queryKey: ['products'] });
    if (onSave) onSave(editedProduct);
    onClose();
  };

  const requestDelete = async () => {
      const confirmed = await confirm({
          title: 'Διαγραφή Προϊόντος',
          message: `Διαγραφή οριστικά ${editedProduct.sku};`,
          confirmText: 'Διαγραφή',
          isDestructive: true
      });
      if (!confirmed) return;
      setIsDeleting(true);
      const result = await deleteProduct(editedProduct.sku, editedProduct.image_url);
      setIsDeleting(false);
      if (result.success) {
          queryClient.invalidateQueries({ queryKey: ['products'] });
          onClose(); 
          showToast("Το προϊόν διαγράφηκε επιτυχώς.", "success");
      } else {
          showToast(`Σφάλμα: ${result.error}`, "error");
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

  const handleSmartAdd = async () => {
     // ... same as before
     const suffix = `${builderFinish}${builderStone}`;
     if (!suffix) { showToast("Επιλέξτε χαρακτηριστικό.", "error"); return; }
     
     const finishName = FINISH_CODES[builderFinish] || '';
     const stoneName = STONE_CODES_MEN[builderStone] || STONE_CODES_WOMEN[builderStone] || '';
     let description = [finishName, stoneName].filter(Boolean).join(' - ');
     const newVar: ProductVariant = { suffix, description, stock_qty: builderQty };

     await supabase.from('product_variants').insert({ product_sku: editedProduct.sku, ...newVar });
     if (builderQty > 0) recordStockMovement(editedProduct.sku, builderQty, 'Αρχικό Απόθεμα', suffix);
     setEditedProduct(prev => ({ ...prev, variants: [...(prev.variants || []), newVar] }));
     queryClient.invalidateQueries({ queryKey: ['products'] });
     setBuilderFinish(''); setBuilderStone(''); setBuilderQty(0);
     showToast("Η παραλλαγή προστέθηκε.", "success");
  };

  const addEmptyVariant = () => setEditedProduct({ ...editedProduct, variants: [...(editedProduct.variants || []), { suffix: '', description: '', stock_qty: 0 }] });
  const updateVariant = (index: number, field: keyof ProductVariant, value: any) => {
      const newVars = [...(editedProduct.variants || [])];
      newVars[index] = { ...newVars[index], [field]: value };
      setEditedProduct({ ...editedProduct, variants: newVars });
  };
  const removeVariant = async (index: number) => {
      // ... same as before
      const variantToRemove = (editedProduct.variants || [])[index];
      const yes = await confirm({ title: 'Διαγραφή', message: 'Διαγραφή παραλλαγής;', isDestructive: true });
      if (!yes) return;
      await supabase.from('product_variants').delete().match({ product_sku: editedProduct.sku, suffix: variantToRemove.suffix });
      const newVars = (editedProduct.variants || []).filter((_, i) => i !== index);
      setEditedProduct({ ...editedProduct, variants: newVars });
      queryClient.invalidateQueries({ queryKey: ['products'] });
  };

  const handleCollectionToggle = async (collectionId: number) => {
    // ... same as before
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
    <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-2 md:p-6 animate-in fade-in duration-300">
      
      {showPrintModal && <PrintModal product={editedProduct} onClose={() => setShowPrintModal(false)} onPrint={setPrintItems} />}

      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-5xl h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-300 border border-slate-100">
        
        {/* Header */}
        <div className="p-6 border-b border-slate-100 flex items-start justify-between bg-slate-50/50">
          <div className="flex gap-5">
            <div className="group relative w-28 h-28 bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm flex-shrink-0 cursor-pointer">
               {editedProduct.image_url ? (
                    <img src={editedProduct.image_url} alt={editedProduct.sku} className="w-full h-full object-cover transition-transform group-hover:scale-105 duration-500" />
               ) : (
                    <div className="w-full h-full bg-slate-100 flex items-center justify-center">
                        <ImageIcon size={40} className="text-slate-300" />
                    </div>
               )}
               <div className="absolute inset-0 bg-slate-900/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white text-[10px] font-bold pointer-events-none z-40 backdrop-blur-sm">
                  {isUploadingImage ? <Loader2 className="animate-spin mb-1" size={20} /> : <Camera size={20} className="mb-1" />} {isUploadingImage ? 'Uploading...' : 'Αλλαγή'}
               </div>
               {!isUploadingImage && <input type="file" accept="image/*" onChange={handleImageUpdate} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-50"/>}
            </div>
            <div>
              <div className="flex items-center gap-3 mb-1">
                 <h2 className="text-3xl font-black text-slate-800 tracking-tight">{editedProduct.sku}</h2>
                 {editedProduct.is_component && <span className="px-3 py-1 bg-blue-100 text-blue-700 text-xs font-bold rounded-lg shadow-sm">STX</span>}
              </div>
              <p className="text-slate-500 font-medium mb-3 flex items-center gap-2">
                <span className="bg-slate-100 px-2 py-0.5 rounded text-xs uppercase font-bold text-slate-600">{editedProduct.category}</span>
                <span className="w-1 h-1 rounded-full bg-slate-300" />
                <span className="text-sm">{editedProduct.gender}</span>
              </p>
              {viewMode === 'registry' && (
                <div className="flex items-center gap-4 text-sm">
                    <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-100 text-amber-900 px-3 py-1.5 rounded-lg shadow-sm"><MapPin size={14} /><span className="font-bold">Λάστιχο: {editedProduct.molds?.length ? editedProduct.molds.join(', ') : 'N/A'}</span></div>
                    <div className="flex items-center gap-2 text-slate-600 px-2">
                        <span className="font-mono font-bold text-lg">{cost.total.toFixed(2)}€</span>
                        <span className="text-xs text-slate-400 font-medium uppercase tracking-wide">Τρέχον Κόστος</span>
                    </div>
                </div>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-200/50 hover:text-red-500 rounded-full transition-all"><X size={28} className="text-slate-400" /></button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200 px-6 overflow-x-auto bg-white">
            <TabButton active={activeTab === 'overview'} onClick={() => setActiveTab('overview')} label="Επισκόπηση" icon={<Edit2 size={16}/>} />
            {viewMode === 'registry' && <TabButton active={activeTab === 'recipe'} onClick={() => setActiveTab('recipe')} label="Συνταγή (BOM)" icon={<Box size={16}/>} />}
            {viewMode === 'registry' && <TabButton active={activeTab === 'labor'} onClick={() => setActiveTab('labor')} label="Εργατικά" icon={<Hammer size={16}/>} />}
            <TabButton active={activeTab === 'variants'} onClick={() => setActiveTab('variants')} label="Παραλλαγές" icon={<Copy size={16}/>} />
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-8 bg-slate-50/50">
          
          {activeTab === 'overview' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-5xl">
               <div className="space-y-6">
                  <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm space-y-4 animate-in slide-in-from-left duration-300">
                      <h3 className="font-bold text-slate-800 border-b border-slate-50 pb-3 mb-1">Τεχνικά Στοιχεία</h3>
                      <div className="grid grid-cols-2 gap-4">
                         <div className="space-y-1"><label className="text-[10px] font-bold text-slate-400 uppercase">Λάστιχα</label><div className="p-3 border border-slate-200 rounded-xl bg-slate-50 text-slate-600 text-sm font-medium">{editedProduct.molds?.length ? editedProduct.molds.join(', ') : '-'}</div></div>
                         <div className="space-y-1"><label className="text-[10px] font-bold text-slate-400 uppercase">Βάρος (g)</label><input type="number" step="0.01" value={editedProduct.weight_g} onChange={(e) => setEditedProduct({...editedProduct, weight_g: parseFloat(e.target.value)})} className="w-full p-3 border border-slate-200 rounded-xl bg-white text-slate-900 font-mono font-bold focus:ring-2 focus:ring-amber-500/20 outline-none"/></div>
                      </div>
                      
                      {/* STOCK CONTROL: ONLY IN WAREHOUSE MODE */}
                      {viewMode === 'warehouse' && (
                          <div className="pt-2">
                             <label className="text-[10px] font-bold text-slate-400 uppercase">Κεντρικό Απόθεμα</label>
                             <div className="relative">
                                 <input type="number" value={editedProduct.stock_qty} onChange={(e) => handleStockChange(parseInt(e.target.value) || 0)} className="w-full p-3 border border-slate-200 rounded-xl bg-white text-slate-900 focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none pr-10 font-bold"/>
                                 <History size={16} className="absolute right-3 top-3.5 text-slate-400" />
                             </div>
                             <p className="text-[10px] text-slate-400 mt-1">Αλλάζοντας το νούμερο καταγράφεται κίνηση αποθήκης.</p>
                          </div>
                      )}
                  </div>
               </div>
               
               <div className="space-y-6">
                  {/* PRICING: ONLY REGISTRY */}
                  {viewMode === 'registry' && !editedProduct.is_component && (
                   <div className="bg-gradient-to-br from-amber-50 to-orange-50 p-6 rounded-2xl border border-amber-100/60 shadow-sm space-y-5 animate-in slide-in-from-right duration-300">
                       <h3 className="font-bold text-amber-900/80 border-b border-amber-200/50 pb-3 flex items-center justify-between">
                           <div className="flex items-center gap-2"><TrendingUp size={18} className="text-amber-600"/>Εμπορική Διαχείριση</div>
                           <button onClick={suggestSellingPrice} className="text-xs bg-white/60 hover:bg-white text-amber-700 px-2 py-1 rounded-lg border border-amber-200 transition-colors flex items-center gap-1"><RefreshCcw size={12}/> Πρόταση Τιμής</button>
                       </h3>
                       <div><label className="text-[10px] font-bold text-amber-700/60 uppercase">Τιμή Χονδρικής (€)</label><input type="number" step="0.1" value={editedProduct.selling_price} onChange={(e) => setEditedProduct({...editedProduct, selling_price: parseFloat(e.target.value)})} className="w-full p-4 border border-amber-300/50 rounded-xl bg-white text-slate-900 font-black text-2xl focus:ring-4 focus:ring-amber-500/20 outline-none shadow-sm"/></div>
                       
                       {/* Subtle Internal Retail Reference */}
                       <div className="flex justify-between items-center text-xs px-2 text-amber-800/50 font-medium">
                           <span>Εσωτερική Αναφορά: Προτ. Λιανική (x3):</span>
                           <span>{retailPrice.toFixed(2)}€</span>
                       </div>

                       <div className="bg-white/60 p-4 rounded-xl border border-amber-100/50 flex justify-between items-center">
                           <div className="flex items-center gap-2">
                               <div className="bg-amber-100 p-2 rounded-lg text-amber-600"><Tag size={16} /></div>
                               <div>
                                   <span className="block text-xs font-bold text-amber-700/60 uppercase tracking-wide">Περιθώριο</span>
                                   <span className={`block text-sm font-black ${margin >= 40 ? 'text-emerald-600' : 'text-orange-500'}`}>{margin.toFixed(1)}%</span>
                               </div>
                           </div>
                       </div>
                   </div>)}
                   
                   <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm space-y-4 animate-in slide-in-from-right duration-500">
                       <h3 className="font-bold text-slate-700 flex items-center gap-2"><FolderKanban size={18} className="text-blue-600"/>Οργάνωση</h3>
                       <div className="max-h-40 overflow-y-auto space-y-1 pr-2 custom-scrollbar">
                         {collections.map(c => (
                             <label key={c.id} className={`flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-colors ${(editedProduct.collections || []).includes(c.id) ? 'bg-blue-50 border border-blue-100' : 'hover:bg-slate-50 border border-transparent'}`}>
                               <div className={`w-5 h-5 rounded flex items-center justify-center transition-colors ${(editedProduct.collections || []).includes(c.id) ? 'bg-blue-500 text-white' : 'bg-slate-200 text-transparent'}`}>
                                   <CheckCircle size={14} />
                               </div>
                               <input type="checkbox" checked={(editedProduct.collections || []).includes(c.id)} onChange={() => handleCollectionToggle(c.id)} className="hidden" />
                               <span className={`text-sm font-medium ${(editedProduct.collections || []).includes(c.id) ? 'text-blue-800' : 'text-slate-600'}`}>{c.name}</span>
                             </label>
                         ))}
                         {isSavingCollections && <div className="text-xs text-blue-500 flex items-center gap-1.5 p-2 font-medium"><Loader2 size={12} className="animate-spin" />Ενημέρωση...</div>}
                       </div>
                   </div>
               </div>
            </div>
          )}

          {activeTab === 'variants' && (
              <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-300">
                  {viewMode === 'registry' && (
                    <div className="bg-amber-50 p-6 rounded-2xl border border-amber-100 shadow-sm">
                        <div className="flex items-center gap-2 mb-4 text-amber-900"><Wand2 size={20} /><h4 className="font-bold text-sm uppercase tracking-wide">Αυτόματη Δημιουργία Παραλλαγής</h4></div>
                        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
                            <div className="md:col-span-3">
                                <label className="block text-xs font-bold text-amber-800/70 mb-1.5 uppercase">Φινίρισμα</label>
                                <select value={builderFinish} onChange={(e) => setBuilderFinish(e.target.value)} className="w-full p-2.5 text-sm border border-amber-200 rounded-xl bg-white text-slate-900 outline-none focus:ring-2 focus:ring-amber-500 font-medium">
                                    {Object.entries(FINISH_CODES).map(([code, name]) => (<option key={code} value={code}>{name} {code ? `(${code})` : ''}</option>))}
                                </select>
                            </div>
                            <div className="md:col-span-4">
                                <label className="block text-xs font-bold text-amber-800/70 mb-1.5 uppercase">Πέτρα / Χρώμα</label>
                                <select value={builderStone} onChange={(e) => setBuilderStone(e.target.value)} className="w-full p-2.5 text-sm border border-amber-200 rounded-xl bg-white text-slate-900 outline-none focus:ring-2 focus:ring-amber-500 font-medium">
                                    <option value="">- Χωρίς Πέτρα -</option>{Object.entries(stoneOptions).map(([code, name]) => (<option key={code} value={code}>{name} ({code})</option>))}
                                </select>
                            </div>
                            {/* In Registry, usually initial stock is 0, but allow it */}
                            <div className="md:col-span-2">
                                <label className="block text-xs font-bold text-amber-800/70 mb-1.5 uppercase">Αρχικό Απόθεμα</label>
                                <input type="number" min="0" value={builderQty} onChange={(e) => setBuilderQty(parseInt(e.target.value) || 0)} className="w-full p-2.5 text-sm border border-amber-200 rounded-xl bg-white text-slate-900 outline-none focus:ring-2 focus:ring-amber-500 font-bold text-center"/>
                            </div>
                            <div className="md:col-span-3">
                                <button onClick={handleSmartAdd} className="w-full bg-amber-500 text-white p-2.5 rounded-xl font-bold text-sm hover:bg-amber-600 transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2"><Plus size={16} /> Προσθήκη</button>
                            </div>
                        </div>
                    </div>
                  )}
                  
                  <div>
                    <div className="flex justify-between items-center mb-4 px-2">
                        <h3 className="font-bold text-slate-700 text-lg">Λίστα Παραλλαγών</h3>
                        {viewMode === 'registry' && <button onClick={addEmptyVariant} className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg transition-colors"><Plus size={14} /> Νέα Κενή</button>}
                    </div>
                    <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-xs border-b border-slate-100"><tr><th className="p-4">Suffix</th><th className="p-4">Πλήρες SKU</th><th className="p-4">Περιγραφή</th><th className="p-4 text-right">Απόθεμα</th><th className="p-4 w-14"></th></tr></thead>
                            <tbody className="divide-y divide-slate-50">
                                {editedProduct.variants?.map((v, idx) => (<tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                                        <td className="p-3"><input type="text" disabled={viewMode==='warehouse'} placeholder="CODE" value={v.suffix} onChange={(e) => updateVariant(idx, 'suffix', e.target.value.toUpperCase())} className="w-20 p-2 border border-slate-200 rounded-lg text-center font-mono font-bold uppercase bg-white focus:ring-2 focus:ring-blue-400 outline-none text-slate-800 disabled:bg-slate-50 disabled:text-slate-500"/></td>
                                        <td className="p-3"><span className="bg-slate-100 px-2 py-1 rounded font-mono font-bold text-slate-600 text-xs">{editedProduct.sku}<span className="text-amber-600">{v.suffix}</span></span></td>
                                        <td className="p-3"><input type="text" disabled={viewMode==='warehouse'} placeholder="Περιγραφή..." value={v.description} onChange={(e) => updateVariant(idx, 'description', e.target.value)} className="w-full p-2 border border-slate-200 rounded-lg bg-white text-slate-700 focus:ring-2 focus:ring-blue-400 outline-none font-medium disabled:bg-slate-50 disabled:text-slate-500"/></td>
                                        <td className="p-3">
                                            {viewMode === 'warehouse' ? (
                                                <input type="number" value={v.stock_qty} onChange={(e) => handleStockChange(parseInt(e.target.value), idx)} className="w-20 p-2 border border-slate-200 rounded-lg text-right bg-white text-slate-900 ml-auto block focus:ring-2 focus:ring-blue-400 outline-none font-bold"/>
                                            ) : (
                                                <div className="text-right font-bold text-slate-500">{v.stock_qty}</div>
                                            )}
                                        </td>
                                        <td className="p-3 text-center">{viewMode === 'registry' && <button onClick={() => removeVariant(idx)} className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"><Trash2 size={18} /></button>}</td>
                                    </tr>))}
                                {(!editedProduct.variants || editedProduct.variants.length === 0) && (<tr><td colSpan={5} className="p-12 text-center text-slate-400 italic">Δεν υπάρχουν παραλλαγές.</td></tr>)}
                            </tbody>
                        </table>
                    </div>
                  </div>
              </div>
          )}

          {activeTab === 'recipe' && viewMode === 'registry' && (
            <div className="space-y-4 max-w-5xl animate-in slide-in-from-bottom-4 duration-300">
              <div className="flex justify-between items-center mb-2 px-1"><h3 className="font-bold text-slate-700 text-lg">Υλικά & Εξαρτήματα</h3><span className="text-xs bg-slate-100 px-3 py-1.5 rounded-full font-bold text-slate-600">Σύνολο Υλικών: {cost.breakdown.materials.toFixed(2)}€</span></div>
              <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm">
                 <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-xs border-b border-slate-100"><tr><th className="p-4 text-center w-16">#</th><th className="p-4">Περιγραφή / SKU</th><th className="p-4 text-right">Ποσότητα</th><th className="p-4 text-right">Κόστος Μον.</th><th className="p-4 text-right">Σύνολο</th></tr></thead>
                    <tbody className="divide-y divide-slate-50">
                       <tr className="bg-amber-50/40 font-medium italic">
                          <td className="p-4"><div className="flex justify-center bg-white p-2 rounded-lg border border-slate-200 shadow-sm"><Coins size={18} className="text-amber-500" /></div></td>
                          <td className="p-4 text-slate-700">Ασήμι 925 (Βάση)</td>
                          <td className="p-4 text-right font-mono text-slate-600">{editedProduct.weight_g.toFixed(2)}g</td>
                          <td className="p-4 text-right text-slate-500 font-mono">{settings.silver_price_gram.toFixed(3)}€</td>
                          <td className="p-4 text-right font-bold text-slate-800 font-mono">{cost.breakdown.silver.toFixed(2)}€</td>
                       </tr>
                       {editedProduct.recipe.map((item, idx) => {
                          let name = 'Άγνωστο', unitCost = 0, icon = <Box size={18} />;
                          if (item.type === 'raw') {
                             const mat = allMaterials.find(m => m.id === item.id);
                             name = mat ? mat.name : `Raw ID: ${item.id}`; unitCost = mat ? mat.cost_per_unit : 0; icon = <Gem size={18} className="text-purple-500" />;
                          } else {
                             const sub = allProducts.find(p => p.sku === item.sku);
                             name = sub ? `${sub.category} (${item.sku})` : `SKU: ${item.sku}`; unitCost = sub ? calculateProductCost(sub, settings, allMaterials, allProducts).total : 0; icon = <Box size={18} className="text-blue-500" />;
                          }
                          return (<tr key={idx} className="hover:bg-slate-50 transition-colors"><td className="p-4"><div className="flex justify-center bg-slate-50 p-2 rounded-lg">{icon}</div></td><td className="p-4 font-bold text-slate-700">{name}</td><td className="p-4 text-right font-mono font-medium">{item.quantity}</td><td className="p-4 text-right text-slate-500">{unitCost.toFixed(2)}€</td><td className="p-4 text-right font-bold text-slate-900">{(unitCost * item.quantity).toFixed(2)}€</td></tr>)
                       })}
                    </tbody>
                 </table>
              </div>
            </div>
          )}

          {activeTab === 'labor' && viewMode === 'registry' && (
             <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl animate-in slide-in-from-bottom-4 duration-300">
                <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm space-y-5">
                    <h3 className="font-bold text-slate-800 border-b pb-3 text-lg">Χρεώσεις Εργαστηρίου</h3>
                    <InputGroup label="Χύτευση (Casting)"><input type="number" step="0.01" value={editedProduct.labor.casting_cost} onChange={(e) => setEditedProduct({...editedProduct, labor: {...editedProduct.labor, casting_cost: parseFloat(e.target.value)}})} className="w-full p-3 border border-slate-200 rounded-xl bg-slate-50 text-slate-900 text-right focus:ring-4 focus:ring-amber-500/10 focus:border-amber-500 outline-none font-mono font-medium"/></InputGroup>
                    <InputGroup label="Καρφωτικό (Setting)"><input type="number" step="0.01" value={editedProduct.labor.setter_cost} onChange={(e) => setEditedProduct({...editedProduct, labor: {...editedProduct.labor, setter_cost: parseFloat(e.target.value)}})} className="w-full p-3 border border-slate-200 rounded-xl bg-slate-50 text-slate-900 text-right focus:ring-4 focus:ring-amber-500/10 focus:border-amber-500 outline-none font-mono font-medium"/></InputGroup>
                    <InputGroup label="Τεχνίτης (Finishing)"><input type="number" step="0.01" value={editedProduct.labor.technician_cost} onChange={(e) => setEditedProduct({...editedProduct, labor: {...editedProduct.labor, technician_cost: parseFloat(e.target.value)}})} className="w-full p-3 border border-slate-200 rounded-xl bg-slate-50 text-slate-900 text-right focus:ring-4 focus:ring-amber-500/10 focus:border-amber-500 outline-none font-mono font-medium"/></InputGroup>
                </div>
                <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm space-y-5 h-fit">
                    <h3 className="font-bold text-slate-800 border-b pb-3 text-lg">Εξωτερικές Εργασίες</h3>
                    <InputGroup label="Επιμετάλλωση (Plating)"><input type="number" step="0.01" value={editedProduct.labor.plating_cost} onChange={(e) => setEditedProduct({...editedProduct, labor: {...editedProduct.labor, plating_cost: parseFloat(e.target.value)}})} className="w-full p-3 border border-slate-200 rounded-xl bg-slate-50 text-slate-900 text-right focus:ring-4 focus:ring-amber-500/10 focus:border-amber-500 outline-none font-mono font-medium"/></InputGroup>
                </div>
             </div>
          )}

        </div>

        {/* Footer Actions */}
        <div className="p-6 border-t border-slate-100 bg-white flex justify-between items-center z-10">
            <div className="flex items-center gap-2">
               <button onClick={() => setShowPrintModal(true)} className="flex items-center gap-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 px-4 py-2 rounded-xl transition-colors font-medium"><Printer size={20} /> <span className="hidden sm:inline">Εκτύπωση</span></button>
               {viewMode === 'registry' && <button onClick={requestDelete} disabled={isDeleting} className="flex items-center gap-2 text-red-500 hover:text-red-600 hover:bg-red-50 px-4 py-2 rounded-xl transition-colors ml-2 font-medium"><Trash2 size={18} /> <span className="hidden sm:inline">Διαγραφή</span></button>}
            </div>
           <div className="flex gap-4">
              <button onClick={onClose} className="px-6 py-2.5 rounded-xl text-slate-600 hover:bg-slate-100 font-bold transition-colors">Ακύρωση</button>
              <button onClick={handleSave} className="px-8 py-2.5 rounded-xl bg-slate-900 text-white hover:bg-slate-800 font-bold flex items-center gap-2 shadow-lg shadow-slate-200 transform hover:-translate-y-0.5 transition-all"><Save size={18} /> Αποθήκευση</button>
           </div>
        </div>

      </div>
    </div>
  );
}

const TabButton = ({ active, onClick, label, icon }: any) => (
    <button onClick={onClick} className={`flex items-center gap-2 px-6 py-4 font-bold text-sm border-b-2 transition-all whitespace-nowrap ${active ? 'border-amber-500 text-amber-600 bg-amber-50/50' : 'border-transparent text-slate-400 hover:text-slate-700 hover:bg-slate-50'}`}>
        {icon} {label}
    </button>
);
const InputGroup = ({ label, children }: any) => (<div><label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wide">{label}</label>{children}</div>);