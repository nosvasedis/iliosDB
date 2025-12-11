import React, { useState, useEffect } from 'react';
import { Product, Material, Mold, GlobalSettings, Collection, ProductVariant, RecipeItem, ProductionType, MaterialType, LaborCost } from '../types';
import { calculateProductCost, formatCurrency, formatDecimal, getVariantComponents } from '../utils/pricingEngine';
import { X, Save, Trash2, Plus, Coins, Gem, Puzzle, Edit, Printer, Copy, ExternalLink, Image as ImageIcon, Box } from 'lucide-react';
import { supabase, api, uploadProductImage, deleteProduct } from '../lib/supabase';
import { useUI } from './UIProvider';
import { useQueryClient } from '@tanstack/react-query';
import BarcodeView from './BarcodeView';

interface Props {
    product: Product;
    allProducts: Product[];
    allMaterials: Material[];
    onClose: () => void;
    setPrintItems: (items: any[]) => void;
    settings: GlobalSettings;
    collections: Collection[];
    allMolds: Mold[];
    viewMode?: 'registry' | 'warehouse';
}

export default function ProductDetails({ product, allProducts, allMaterials, onClose, setPrintItems, settings, collections, allMolds, viewMode = 'registry' }: Props) {
    const queryClient = useQueryClient();
    const { showToast, confirm } = useUI();
    
    const [activeTab, setActiveTab] = useState<'info' | 'recipe' | 'stock' | 'variants'>('info');
    const [isEditing, setIsEditing] = useState(false);
    const [editedProduct, setEditedProduct] = useState<Product>(JSON.parse(JSON.stringify(product)));
    const [currentCostCalc, setCurrentCostCalc] = useState(calculateProductCost(product, settings, allMaterials, allProducts));

    // Recalculate cost when editedProduct changes
    useEffect(() => {
        setCurrentCostCalc(calculateProductCost(editedProduct, settings, allMaterials, allProducts));
    }, [editedProduct, settings, allMaterials, allProducts]);

    const handleSave = async () => {
        try {
            // Update product logic
            const { error } = await supabase.from('products').update({
                category: editedProduct.category,
                weight_g: editedProduct.weight_g,
                plating_type: editedProduct.plating_type,
                active_price: currentCostCalc.total, // Update cost
                // ... map other fields
            }).eq('sku', editedProduct.sku);

            if (error) throw error;

            // Save recipe
            if (activeTab === 'recipe') {
                await supabase.from('recipes').delete().eq('parent_sku', editedProduct.sku);
                if (editedProduct.recipe.length > 0) {
                    await supabase.from('recipes').insert(editedProduct.recipe.map(r => ({
                        parent_sku: editedProduct.sku,
                        type: r.type,
                        material_id: r.type === 'raw' ? r.id : null,
                        component_sku: r.type === 'component' ? r.sku : null,
                        quantity: r.quantity
                    })));
                }
                
                // Update Labor
                await supabase.from('products').update({
                    labor_casting: editedProduct.labor.casting_cost,
                    labor_setter: editedProduct.labor.setter_cost,
                    labor_technician: editedProduct.labor.technician_cost,
                    // ... other labor fields
                }).eq('sku', editedProduct.sku);
            }

            queryClient.invalidateQueries({ queryKey: ['products'] });
            showToast('Αποθηκεύτηκε επιτυχώς!', 'success');
            setIsEditing(false);
        } catch (e: any) {
            showToast(`Σφάλμα: ${e.message}`, 'error');
        }
    };

    const handleDelete = async () => {
        if (!await confirm({ title: 'Διαγραφή', message: 'Είστε σίγουροι; Η ενέργεια δεν αναιρείται.', isDestructive: true })) return;
        const res = await deleteProduct(product.sku, product.image_url);
        if (res.success) {
            queryClient.invalidateQueries({ queryKey: ['products'] });
            onClose();
            showToast('Διαγράφηκε.', 'info');
        } else {
            showToast(res.error || 'Σφάλμα', 'error');
        }
    };

    const updateRecipeItem = (index: number, field: any, value: any) => {
        const newRecipe = [...editedProduct.recipe];
        newRecipe[index] = { ...newRecipe[index], [field]: value } as RecipeItem;
        setEditedProduct({ ...editedProduct, recipe: newRecipe });
    };

    const removeRecipeItem = (index: number) => {
        const newRecipe = editedProduct.recipe.filter((_, i) => i !== index);
        setEditedProduct({ ...editedProduct, recipe: newRecipe });
    };

    const addRecipeItem = (type: 'raw' | 'component') => {
        const newItem: RecipeItem = type === 'raw' 
            ? { type: 'raw', id: allMaterials[0]?.id || '', quantity: 1 }
            : { type: 'component', sku: allProducts.find(p=>p.is_component)?.sku || '', quantity: 1 };
        setEditedProduct({ ...editedProduct, recipe: [...editedProduct.recipe, newItem] });
    };

    return (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
            <div className="bg-white w-full max-w-5xl h-[90vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden">
                {/* Header */}
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                    <div className="flex items-center gap-4">
                        <div className="w-16 h-16 bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden flex items-center justify-center">
                            {editedProduct.image_url ? <img src={editedProduct.image_url} className="w-full h-full object-cover" /> : <ImageIcon className="text-slate-300"/>}
                        </div>
                        <div>
                            <h2 className="text-2xl font-black text-slate-800 tracking-tight">{editedProduct.sku}</h2>
                            <p className="text-slate-500 text-sm font-medium">{editedProduct.category}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {!isEditing ? (
                            <>
                                <button onClick={() => setIsEditing(true)} className="p-2.5 bg-white border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 transition-colors font-bold flex items-center gap-2">
                                    <Edit size={18}/> Επεξεργασία
                                </button>
                                <button onClick={handleDelete} className="p-2.5 bg-red-50 text-red-500 rounded-xl hover:bg-red-100 transition-colors">
                                    <Trash2 size={18}/>
                                </button>
                            </>
                        ) : (
                            <button onClick={handleSave} className="p-2.5 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-colors font-bold flex items-center gap-2 shadow-lg shadow-emerald-200">
                                <Save size={18}/> Αποθήκευση
                            </button>
                        )}
                        <button onClick={onClose} className="p-2.5 hover:bg-slate-200 rounded-full text-slate-500"><X size={24}/></button>
                    </div>
                </div>

                {/* Tabs */}
                <div className="px-6 pt-4 flex gap-6 border-b border-slate-100 text-sm font-bold text-slate-400">
                    <button onClick={() => setActiveTab('info')} className={`pb-3 border-b-2 transition-colors ${activeTab === 'info' ? 'border-[#060b00] text-[#060b00]' : 'border-transparent hover:text-slate-600'}`}>Πληροφορίες</button>
                    <button onClick={() => setActiveTab('recipe')} className={`pb-3 border-b-2 transition-colors ${activeTab === 'recipe' ? 'border-[#060b00] text-[#060b00]' : 'border-transparent hover:text-slate-600'}`}>Παραγωγή & Υλικά</button>
                    <button onClick={() => setActiveTab('stock')} className={`pb-3 border-b-2 transition-colors ${activeTab === 'stock' ? 'border-[#060b00] text-[#060b00]' : 'border-transparent hover:text-slate-600'}`}>Απόθεμα</button>
                    <button onClick={() => setActiveTab('variants')} className={`pb-3 border-b-2 transition-colors ${activeTab === 'variants' ? 'border-[#060b00] text-[#060b00]' : 'border-transparent hover:text-slate-600'}`}>Παραλλαγές</button>
                </div>

                {/* Content Area */}
                <div className="flex-1 overflow-y-auto p-8 bg-white relative">
                    
                    {/* INFO TAB */}
                    {activeTab === 'info' && (
                        <div className="grid grid-cols-2 gap-8 animate-in slide-in-from-bottom-2">
                            <div className="space-y-4">
                                <div>
                                    <label className="text-xs font-bold text-slate-400 uppercase">Κατηγορία</label>
                                    <input 
                                        disabled={!isEditing} 
                                        value={editedProduct.category} 
                                        onChange={e => setEditedProduct({...editedProduct, category: e.target.value})}
                                        className="w-full p-3 border border-slate-200 rounded-xl mt-1 disabled:bg-slate-50 disabled:text-slate-500 font-bold text-slate-800"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-xs font-bold text-slate-400 uppercase">Βάρος (g)</label>
                                        <input 
                                            type="number"
                                            disabled={!isEditing} 
                                            value={editedProduct.weight_g} 
                                            onChange={e => setEditedProduct({...editedProduct, weight_g: parseFloat(e.target.value)})}
                                            className="w-full p-3 border border-slate-200 rounded-xl mt-1 disabled:bg-slate-50 font-mono"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold text-slate-400 uppercase">Επιμετάλλωση</label>
                                        <select
                                            disabled={!isEditing} 
                                            value={editedProduct.plating_type}
                                            onChange={e => setEditedProduct({...editedProduct, plating_type: e.target.value as any})}
                                            className="w-full p-3 border border-slate-200 rounded-xl mt-1 disabled:bg-slate-50"
                                        >
                                            <option value="None">Λουστρέ</option>
                                            <option value="Gold-Plated">Επίχρυσο</option>
                                            <option value="Platinum">Επιπλατινωμένο</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                            
                            <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 h-fit">
                                <h3 className="font-bold text-slate-700 mb-4">Οικονομικά</h3>
                                <div className="space-y-3 text-sm">
                                    <div className="flex justify-between items-center">
                                        <span className="text-slate-500">Κόστος Παραγωγής</span>
                                        <span className="font-mono font-bold text-slate-800">{formatCurrency(currentCostCalc.total)}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-slate-500">Τιμή Χονδρικής</span>
                                        {isEditing ? (
                                            <input type="number" className="w-24 text-right p-1 rounded border" value={editedProduct.selling_price} onChange={e => setEditedProduct({...editedProduct, selling_price: parseFloat(e.target.value)})}/>
                                        ) : (
                                            <span className="font-mono font-black text-xl text-emerald-600">{formatCurrency(editedProduct.selling_price)}</span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* RECIPE TAB */}
                    {activeTab === 'recipe' && (
                       <div className="space-y-6 animate-in slide-in-from-bottom-2">
                           {/* Silver Base */}
                           <div className="flex items-center gap-3 p-3 bg-slate-100 rounded-xl border border-slate-200 shadow-sm">
                               <div className="p-2 bg-white rounded-lg border border-slate-100 text-slate-600">
                                   <Coins size={16} />
                               </div>
                               <div className="flex-1">
                                   <div className="font-bold text-slate-800 text-sm">Ασήμι 925 (Βάση + Β')</div>
                                   <div className="text-xs text-slate-400 font-mono">
                                       {formatDecimal((editedProduct.weight_g || 0) + (editedProduct.secondary_weight_g || 0))}g @ {formatDecimal(settings.silver_price_gram, 3)}€/g
                                   </div>
                               </div>
                               <div className="text-right">
                                   <div className="font-mono font-bold text-slate-800 text-lg">
                                       {formatCurrency(currentCostCalc.breakdown.silver)}
                                   </div>
                               </div>
                           </div>

                           {/* Ingredients */}
                           <div className="space-y-2">
                               {editedProduct.recipe.map((item, idx) => {
                                   const isRaw = item.type === 'raw';
                                   const details = isRaw ? allMaterials.find(m => m.id === item.id) : allProducts.find(p => p.sku === item.sku);
                                   
                                   let itemCost = 0;
                                   if (isRaw) {
                                       itemCost = ((details as Material)?.cost_per_unit || 0) * item.quantity;
                                   } else {
                                       itemCost = ((details as Product)?.active_price || 0) * item.quantity;
                                   }

                                   return (
                                       <div key={idx} className="flex items-center gap-3 p-3 bg-white rounded-xl border border-slate-100 shadow-sm">
                                           <div className="p-2 bg-slate-50 rounded-lg border border-slate-100">
                                               {isRaw ? <Gem size={16} className="text-emerald-500"/> : <Puzzle size={16} className="text-blue-500"/>}
                                           </div>
                                           <div className="flex-1">
                                               {isEditing ? (
                                                   isRaw ? (
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
                                                   )
                                               ) : (
                                                   <span className="font-bold text-slate-800">{isRaw ? (details as Material)?.name : (details as Product)?.sku}</span>
                                               )}
                                           </div>
                                            <div className="font-mono font-bold text-slate-700 text-sm">{formatCurrency(itemCost)}</div>
                                           <div className="flex items-center gap-2">
                                               <input disabled={!isEditing} type="number" className="w-16 p-1 text-center font-bold bg-slate-50 rounded border border-slate-200 outline-none" value={item.quantity} onChange={e => updateRecipeItem(idx, 'quantity', e.target.value)}/>
                                               <span className="text-xs text-slate-400 font-bold w-8">{isRaw ? (details as Material)?.unit : 'τεμ'}</span>
                                           </div>
                                           {isEditing && <button onClick={() => removeRecipeItem(idx)} className="text-slate-400 hover:text-red-500"><Trash2 size={18}/></button>}
                                       </div>
                                   );
                               })}
                           </div>
                           
                           {isEditing && (
                               <div className="flex gap-2 pt-2">
                                   <button onClick={() => addRecipeItem('raw')} className="flex-1 py-2 bg-slate-50 hover:bg-slate-100 rounded-xl text-xs font-bold text-slate-600 transition-colors flex items-center justify-center gap-2 border border-slate-200"><Plus size={14}/> Υλικό</button>
                                   <button onClick={() => addRecipeItem('component')} className="flex-1 py-2 bg-slate-50 hover:bg-slate-100 rounded-xl text-xs font-bold text-slate-600 transition-colors flex items-center justify-center gap-2 border border-slate-200"><Plus size={14}/> Εξάρτημα</button>
                               </div>
                           )}
                       </div>
                    )}

                    {/* OTHER TABS Placeholder */}
                    {(activeTab === 'stock' || activeTab === 'variants') && (
                        <div className="flex flex-col items-center justify-center h-full text-slate-400">
                            <Box size={48} className="mb-4 opacity-20"/>
                            <p>Η καρτέλα αυτή είναι υπό κατασκευή.</p>
                        </div>
                    )}

                </div>
            </div>
        </div>
    );
}