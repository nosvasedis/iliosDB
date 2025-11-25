import React, { useState } from 'react';
import { Product, Material, RecipeItem, LaborCost, ProductVariant, Gender } from '../types';
import { calculateProductCost } from '../utils/pricingEngine';
import { INITIAL_SETTINGS, STONE_CODES_MEN, STONE_CODES_WOMEN, FINISH_CODES } from '../constants'; 
import { X, Save, Printer, Edit2, Box, Gem, Hammer, MapPin, Copy, Trash2, Plus, Info, Wand2, TrendingUp } from 'lucide-react';
import BarcodeView from './BarcodeView';

interface Props {
  product: Product;
  allProducts: Product[];
  allMaterials: Material[];
  onClose: () => void;
  onSave?: (updatedProduct: Product) => void;
}

export default function ProductDetails({ product, allProducts, allMaterials, onClose, onSave }: Props) {
  const [activeTab, setActiveTab] = useState<'overview' | 'recipe' | 'labor' | 'variants'>('overview');
  const [showBarcode, setShowBarcode] = useState(false);
  const [selectedVariantForBarcode, setSelectedVariantForBarcode] = useState<ProductVariant | undefined>(undefined);
  const [editedProduct, setEditedProduct] = useState<Product>({ 
      ...product,
      variants: product.variants || [],
      selling_price: product.selling_price || 0,
      molds: product.molds || []
  });

  // Smart Builder State
  const [builderFinish, setBuilderFinish] = useState('');
  const [builderStone, setBuilderStone] = useState('');
  const [builderQty, setBuilderQty] = useState(0);

  // Recalculate cost dynamically for display
  const cost = calculateProductCost(editedProduct, INITIAL_SETTINGS, allMaterials, allProducts);
  
  // Profit & Margin Calc
  const profit = editedProduct.selling_price - cost.total;
  const margin = editedProduct.selling_price > 0 ? ((profit / editedProduct.selling_price) * 100) : 0;

  const handleSave = () => {
    if (onSave) onSave(editedProduct);
    onClose();
  };

  const handleSmartAdd = () => {
     const suffix = `${builderFinish}${builderStone}`;
     const finishName = FINISH_CODES[builderFinish] || '';
     const stoneName = STONE_CODES_MEN[builderStone] || STONE_CODES_WOMEN[builderStone] || '';
     
     let description = '';
     if (finishName && stoneName) description = `${finishName} - ${stoneName}`;
     else if (finishName) description = finishName;
     else if (stoneName) description = stoneName;
     else description = 'Βασικό';

     if (!suffix && !stoneName && !finishName) {
         alert("Επιλέξτε τουλάχιστον ένα χαρακτηριστικό (Φινίρισμα ή Πέτρα).");
         return;
     }

     const newVar: ProductVariant = {
         suffix: suffix,
         description: description,
         stock_qty: builderQty
     };

     setEditedProduct({
         ...editedProduct,
         variants: [...(editedProduct.variants || []), newVar]
     });

     setBuilderFinish('');
     setBuilderStone('');
     setBuilderQty(0);
  };

  const addEmptyVariant = () => {
      const newVar: ProductVariant = { suffix: '', description: '', stock_qty: 0 };
      setEditedProduct({
          ...editedProduct,
          variants: [...(editedProduct.variants || []), newVar]
      });
  };

  const updateVariant = (index: number, field: keyof ProductVariant, value: any) => {
      const newVars = [...(editedProduct.variants || [])];
      newVars[index] = { ...newVars[index], [field]: value };
      setEditedProduct({ ...editedProduct, variants: newVars });
  };

  const removeVariant = (index: number) => {
      const newVars = (editedProduct.variants || []).filter((_, i) => i !== index);
      setEditedProduct({ ...editedProduct, variants: newVars });
  };

  const availableStones = product.gender === Gender.Men ? STONE_CODES_MEN : STONE_CODES_WOMEN;
  const stoneOptions = product.gender === Gender.Men 
      ? STONE_CODES_MEN 
      : (product.gender === Gender.Women ? STONE_CODES_WOMEN : {...STONE_CODES_WOMEN, ...STONE_CODES_MEN});

  if (showBarcode) {
    return (
      <div className="fixed inset-0 z-[110] bg-black/50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md relative">
          <button onClick={() => setShowBarcode(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600">
            <X size={24} />
          </button>
          <h2 className="text-xl font-bold mb-4">Εκτύπωση Ετικέτας</h2>
          
          <div className="mb-4">
             <label className="block text-sm font-medium text-slate-700 mb-1">Επιλογή Παραλλαγής</label>
             <select 
                onChange={(e) => {
                    const idx = parseInt(e.target.value);
                    if (idx === -1) setSelectedVariantForBarcode(undefined);
                    else setSelectedVariantForBarcode(editedProduct.variants?.[idx]);
                }}
                className="w-full p-2 border border-slate-300 rounded bg-white text-slate-900"
             >
                <option value="-1">Βασικό (Master SKU)</option>
                {editedProduct.variants?.map((v, i) => (
                    <option key={i} value={i}>{editedProduct.sku}{v.suffix} - {v.description}</option>
                ))}
             </select>
          </div>

          <div className="border border-slate-200 rounded p-4 bg-slate-50 flex justify-center">
             <BarcodeView product={editedProduct} variant={selectedVariantForBarcode} />
          </div>
          
          <button onClick={() => window.print()} className="mt-4 w-full bg-amber-500 text-white py-2 rounded-lg font-bold">
             Εκτύπωση
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-2 md:p-6">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="p-6 border-b border-slate-100 flex items-start justify-between bg-slate-50">
          <div className="flex gap-4">
            <div className="w-24 h-24 bg-white rounded-lg border border-slate-200 overflow-hidden shadow-sm flex-shrink-0">
               <img src={editedProduct.image_url} alt={editedProduct.sku} className="w-full h-full object-cover" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                 <h2 className="text-2xl font-black text-slate-800">{editedProduct.sku}</h2>
                 {editedProduct.is_component && <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-bold rounded-full">ΕΞΑΡΤΗΜΑ (STX)</span>}
              </div>
              <p className="text-slate-500 font-medium mb-2">{editedProduct.category} • {editedProduct.gender}</p>
              
              <div className="flex items-center gap-4 text-sm">
                <div className="flex items-center gap-1 bg-amber-100 text-amber-800 px-3 py-1 rounded-md">
                   <MapPin size={16} />
                   <span className="font-bold">Λάστιχο: {editedProduct.molds?.length ? editedProduct.molds.join(', ') : 'N/A'}</span>
                </div>
                <div className="flex items-center gap-1 text-slate-600">
                   <span className="font-mono font-bold text-lg">{cost.total.toFixed(2)}€</span>
                   <span className="text-xs text-slate-400">(Τιμή Κόστους)</span>
                </div>
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
            <X size={24} className="text-slate-500" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200 px-6 overflow-x-auto">
          <TabButton active={activeTab === 'overview'} onClick={() => setActiveTab('overview')} label="Επισκόπηση" icon={<Edit2 size={16}/>} />
          <TabButton active={activeTab === 'variants'} onClick={() => setActiveTab('variants')} label="Παραλλαγές" icon={<Copy size={16}/>} />
          <TabButton active={activeTab === 'recipe'} onClick={() => setActiveTab('recipe')} label="Συνταγή (BOM)" icon={<Box size={16}/>} />
          <TabButton active={activeTab === 'labor'} onClick={() => setActiveTab('labor')} label="Εργατικά" icon={<Hammer size={16}/>} />
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50">
          
          {/* TAB: OVERVIEW */}
          {activeTab === 'overview' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl">
               <div className="space-y-4">
                  <h3 className="font-bold text-slate-700 border-b pb-2">Στοιχεία Αποθήκης</h3>
                  <div className="grid grid-cols-2 gap-4">
                     <InputGroup label="Λάστιχα (Molds Codes)">
                        <div className="p-2 border border-slate-300 rounded bg-slate-100 text-slate-600 text-sm">
                            {editedProduct.molds?.length ? editedProduct.molds.join(', ') : 'Κανένα Λάστιχο'}
                        </div>
                        <p className="text-[10px] text-slate-400 mt-1">Για αλλαγή, επεξεργαστείτε τη βάση δεδομένων ή χρησιμοποιήστε τη σελίδα Molds.</p>
                     </InputGroup>
                     <InputGroup label="Απόθεμα (Master)">
                        <input 
                          type="number" 
                          value={editedProduct.stock_qty} 
                          onChange={(e) => setEditedProduct({...editedProduct, stock_qty: parseInt(e.target.value)})}
                          className="w-full p-2 border border-slate-300 rounded bg-white text-slate-900 focus:ring-2 focus:ring-amber-500 outline-none"
                        />
                     </InputGroup>
                  </div>
                  
                  <div className="pt-4">
                     <h3 className="font-bold text-slate-700 border-b pb-2">Μεταλλικά Στοιχεία</h3>
                     <div className="mt-2">
                         <InputGroup label="Βάρος Ασημιού (γραμμάρια)">
                            <input 
                                type="number" step="0.01"
                                value={editedProduct.weight_g} 
                                onChange={(e) => setEditedProduct({...editedProduct, weight_g: parseFloat(e.target.value)})}
                                className="w-full p-2 border border-slate-300 rounded bg-white text-slate-900 font-mono focus:ring-2 focus:ring-amber-500 outline-none"
                            />
                         </InputGroup>
                         <p className="text-xs text-slate-500 mt-2">
                            *Το κόστος ασημιού υπολογίζεται αυτόματα βάσει της τρέχουσας τιμής Fix.
                         </p>
                     </div>
                  </div>
               </div>

               {/* Commercial Management Column */}
               {!editedProduct.is_component && (
                   <div className="bg-white p-5 rounded-lg border border-amber-100 shadow-sm space-y-4">
                       <h3 className="font-bold text-slate-700 border-b pb-2 flex items-center gap-2">
                           <TrendingUp size={18} className="text-green-600"/>
                           Εμπορική Διαχείριση
                       </h3>
                       
                       <InputGroup label="Τιμή Πώλησης (€)">
                          <input 
                            type="number" step="0.1"
                            value={editedProduct.selling_price} 
                            onChange={(e) => setEditedProduct({...editedProduct, selling_price: parseFloat(e.target.value)})}
                            className="w-full p-2 border border-amber-300 rounded bg-amber-50 text-slate-900 font-bold text-lg focus:ring-2 focus:ring-amber-500 outline-none"
                          />
                       </InputGroup>

                       <div className="grid grid-cols-2 gap-4 pt-2">
                           <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                               <span className="block text-xs font-bold text-slate-500 uppercase">Κέρδος</span>
                               <span className={`block text-lg font-bold ${profit >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                                   {profit.toFixed(2)}€
                               </span>
                           </div>
                           <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                               <span className="block text-xs font-bold text-slate-500 uppercase">Margin</span>
                               <span className={`block text-lg font-bold ${margin >= 40 ? 'text-green-600' : (margin >= 20 ? 'text-orange-500' : 'text-red-500')}`}>
                                   {margin.toFixed(1)}%
                               </span>
                           </div>
                       </div>
                       
                       <div className="text-xs text-slate-400 mt-2 italic">
                           * Margin = (Κέρδος / Τιμή Πώλησης) x 100
                       </div>
                   </div>
               )}
            </div>
          )}

          {/* TAB: VARIANTS */}
          {activeTab === 'variants' && (
              <div className="space-y-6">
                  {/* Smart Builder Section */}
                  <div className="bg-white p-5 rounded-lg border border-amber-100 shadow-sm">
                      <div className="flex items-center gap-2 mb-3 text-amber-800">
                          <Wand2 size={18} />
                          <h4 className="font-bold text-sm uppercase">Αυτόματη Δημιουργία Κωδικού</h4>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
                          <div>
                              <label className="block text-xs font-bold text-slate-500 mb-1">Φινίρισμα</label>
                              <select 
                                value={builderFinish}
                                onChange={(e) => setBuilderFinish(e.target.value)}
                                className="w-full p-2 text-sm border border-slate-300 rounded bg-white text-slate-900 outline-none focus:ring-2 focus:ring-amber-500"
                              >
                                  {Object.entries(FINISH_CODES).map(([code, name]) => (
                                      <option key={code} value={code}>{name} {code ? `(${code})` : ''}</option>
                                  ))}
                              </select>
                          </div>
                          <div className="md:col-span-2">
                              <label className="block text-xs font-bold text-slate-500 mb-1">Πέτρα / Χρώμα</label>
                              <select 
                                value={builderStone}
                                onChange={(e) => setBuilderStone(e.target.value)}
                                className="w-full p-2 text-sm border border-slate-300 rounded bg-white text-slate-900 outline-none focus:ring-2 focus:ring-amber-500"
                              >
                                  <option value="">- Χωρίς Πέτρα -</option>
                                  {Object.entries(stoneOptions).map(([code, name]) => (
                                      <option key={code} value={code}>{name} ({code})</option>
                                  ))}
                              </select>
                          </div>
                          <div>
                               <label className="block text-xs font-bold text-slate-500 mb-1">Απόθεμα</label>
                               <input 
                                  type="number" min="0"
                                  value={builderQty}
                                  onChange={(e) => setBuilderQty(parseInt(e.target.value) || 0)}
                                  className="w-full p-2 text-sm border border-slate-300 rounded bg-white text-slate-900 outline-none focus:ring-2 focus:ring-amber-500"
                               />
                          </div>
                      </div>
                      
                      <div className="mt-4 flex items-center justify-between">
                          <div className="text-sm">
                              <span className="text-slate-500">Preview Suffix: </span>
                              <span className="font-mono font-bold bg-slate-100 px-2 py-1 rounded ml-1">
                                  {builderFinish}{builderStone}
                              </span>
                          </div>
                          <button 
                              onClick={handleSmartAdd}
                              className="bg-amber-500 text-white px-4 py-2 rounded font-medium text-sm hover:bg-amber-600 transition-colors flex items-center gap-2"
                          >
                              <Plus size={16} /> Προσθήκη
                          </button>
                      </div>
                  </div>

                  <div className="flex justify-between items-center mt-6">
                      <h3 className="font-bold text-slate-700">Λίστα Παραλλαγών</h3>
                      <button onClick={addEmptyVariant} className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600">
                          <Plus size={14} /> Custom
                      </button>
                  </div>
                  
                  <div className="bg-white rounded-lg border border-slate-200 overflow-hidden shadow-sm">
                      <table className="w-full text-sm text-left">
                          <thead className="bg-slate-50 text-slate-500 font-medium uppercase text-xs">
                              <tr>
                                  <th className="p-3">Suffix</th>
                                  <th className="p-3">Πλήρες SKU</th>
                                  <th className="p-3">Περιγραφή (Πέτρα/Χρώμα)</th>
                                  <th className="p-3 text-right">Απόθεμα</th>
                                  <th className="p-3 w-10"></th>
                              </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                              {editedProduct.variants?.map((v, idx) => (
                                  <tr key={idx} className="hover:bg-slate-50">
                                      <td className="p-2">
                                          <input 
                                            type="text" placeholder="π.χ. PTG"
                                            value={v.suffix}
                                            onChange={(e) => updateVariant(idx, 'suffix', e.target.value.toUpperCase())}
                                            className="w-24 p-1.5 border border-slate-200 rounded text-center font-mono font-bold uppercase bg-white text-slate-900 focus:ring-2 focus:ring-blue-400 outline-none"
                                          />
                                      </td>
                                      <td className="p-2">
                                          <span className="bg-slate-100 px-2 py-1 rounded font-mono font-bold text-slate-700">
                                              {editedProduct.sku}<span className="text-amber-600">{v.suffix}</span>
                                          </span>
                                      </td>
                                      <td className="p-2">
                                          <input 
                                            type="text" placeholder="π.χ. Πατίνα - Tiger Eye"
                                            value={v.description}
                                            onChange={(e) => updateVariant(idx, 'description', e.target.value)}
                                            className="w-full p-1.5 border border-slate-200 rounded bg-white text-slate-900 focus:ring-2 focus:ring-blue-400 outline-none"
                                          />
                                      </td>
                                      <td className="p-2">
                                          <input 
                                            type="number"
                                            value={v.stock_qty}
                                            onChange={(e) => updateVariant(idx, 'stock_qty', parseInt(e.target.value))}
                                            className="w-20 p-1.5 border border-slate-200 rounded text-right bg-white text-slate-900 ml-auto block focus:ring-2 focus:ring-blue-400 outline-none"
                                          />
                                      </td>
                                      <td className="p-2 text-center">
                                          <button onClick={() => removeVariant(idx)} className="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors">
                                              <Trash2 size={16} />
                                          </button>
                                      </td>
                                  </tr>
                              ))}
                              {(!editedProduct.variants || editedProduct.variants.length === 0) && (
                                  <tr><td colSpan={5} className="p-8 text-center text-slate-400 italic">Δεν υπάρχουν παραλλαγές. Χρησιμοποιήστε τον Builder παραπάνω.</td></tr>
                              )}
                          </tbody>
                      </table>
                  </div>
              </div>
          )}

          {/* TAB: RECIPE */}
          {activeTab === 'recipe' && (
            <div className="space-y-4 max-w-4xl">
              <div className="flex justify-between items-center mb-2">
                 <h3 className="font-bold text-slate-700">Υλικά & Εξαρτήματα</h3>
                 <span className="text-xs bg-slate-200 px-2 py-1 rounded text-slate-600">
                    Σύνολο Υλικών: {cost.breakdown.materials.toFixed(2)}€
                 </span>
              </div>
              
              <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                 <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 text-slate-500 font-medium">
                       <tr>
                          <th className="p-3">Τύπος</th>
                          <th className="p-3">Περιγραφή / SKU</th>
                          <th className="p-3 text-right">Ποσότητα</th>
                          <th className="p-3 text-right">Κόστος Μον.</th>
                          <th className="p-3 text-right">Σύνολο</th>
                       </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                       {editedProduct.recipe.map((item, idx) => {
                          let name = 'Άγνωστο';
                          let unitCost = 0;
                          let icon = <Box size={16} />;
                          
                          if (item.type === 'raw') {
                             const mat = allMaterials.find(m => m.id === item.id);
                             name = mat ? mat.name : `Raw ID: ${item.id}`;
                             unitCost = mat ? mat.cost_per_unit : 0;
                             icon = <Gem size={16} className="text-purple-500" />;
                          } else {
                             const sub = allProducts.find(p => p.sku === item.sku);
                             name = sub ? `${sub.category} (${item.sku})` : `SKU: ${item.sku}`;
                             // Recursive cost for display
                             unitCost = sub ? calculateProductCost(sub, INITIAL_SETTINGS, allMaterials, allProducts).total : 0;
                             icon = <Box size={16} className="text-blue-500" />;
                          }

                          return (
                             <tr key={idx} className="hover:bg-slate-50">
                                <td className="p-3"><div className="flex justify-center">{icon}</div></td>
                                <td className="p-3 font-medium text-slate-700">{name}</td>
                                <td className="p-3 text-right font-mono">{item.quantity}</td>
                                <td className="p-3 text-right text-slate-500">{unitCost.toFixed(2)}€</td>
                                <td className="p-3 text-right font-bold text-slate-800">{(unitCost * item.quantity).toFixed(2)}€</td>
                             </tr>
                          )
                       })}
                       {editedProduct.recipe.length === 0 && (
                          <tr><td colSpan={5} className="p-8 text-center text-slate-400 italic">Δεν υπάρχουν υλικά στη συνταγή.</td></tr>
                       )}
                    </tbody>
                 </table>
              </div>
            </div>
          )}

          {/* TAB: LABOR */}
          {activeTab === 'labor' && (
             <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl">
                <div className="bg-white p-6 rounded-lg border border-slate-200 space-y-4">
                   <h3 className="font-bold text-slate-700">Χρεώσεις Εργαστηρίου</h3>
                   <InputGroup label="Χύτευση (Casting)">
                      <input 
                         type="number" step="0.01"
                         value={editedProduct.labor.casting_cost}
                         onChange={(e) => setEditedProduct({...editedProduct, labor: {...editedProduct.labor, casting_cost: parseFloat(e.target.value)}})}
                         className="w-full p-2 border border-slate-300 rounded bg-white text-slate-900 text-right focus:ring-2 focus:ring-amber-500 outline-none"
                      />
                   </InputGroup>
                   <InputGroup label="Καρφωτικό (Setting)">
                      <input 
                         type="number" step="0.01"
                         value={editedProduct.labor.setter_cost}
                         onChange={(e) => setEditedProduct({...editedProduct, labor: {...editedProduct.labor, setter_cost: parseFloat(e.target.value)}})}
                         className="w-full p-2 border border-slate-300 rounded bg-white text-slate-900 text-right focus:ring-2 focus:ring-amber-500 outline-none"
                      />
                   </InputGroup>
                   <InputGroup label="Τεχνίτης (Finishing)">
                      <input 
                         type="number" step="0.01"
                         value={editedProduct.labor.technician_cost}
                         onChange={(e) => setEditedProduct({...editedProduct, labor: {...editedProduct.labor, technician_cost: parseFloat(e.target.value)}})}
                         className="w-full p-2 border border-slate-300 rounded bg-white text-slate-900 text-right focus:ring-2 focus:ring-amber-500 outline-none"
                      />
                   </InputGroup>
                </div>
                <div className="bg-white p-6 rounded-lg border border-slate-200 space-y-4">
                   <h3 className="font-bold text-slate-700">Εξωτερικές Εργασίες</h3>
                   <InputGroup label="Επιμετάλλωση (Plating)">
                      <input 
                         type="number" step="0.01"
                         value={editedProduct.labor.plating_cost}
                         onChange={(e) => setEditedProduct({...editedProduct, labor: {...editedProduct.labor, plating_cost: parseFloat(e.target.value)}})}
                         className="w-full p-2 border border-slate-300 rounded bg-white text-slate-900 text-right focus:ring-2 focus:ring-amber-500 outline-none"
                      />
                   </InputGroup>
                </div>
             </div>
          )}

        </div>

        {/* Footer Actions */}
        <div className="p-6 border-t border-slate-200 bg-white flex justify-between items-center">
           <button 
             onClick={() => setShowBarcode(true)}
             className="flex items-center gap-2 text-slate-600 hover:text-slate-900 transition-colors"
           >
              <Printer size={20} /> <span className="hidden sm:inline">Εκτύπωση Ετικέτας</span>
           </button>
           
           <div className="flex gap-4">
              <button onClick={onClose} className="px-6 py-2 rounded-lg text-slate-600 hover:bg-slate-100 font-medium">
                 Ακύρωση
              </button>
              <button onClick={handleSave} className="px-6 py-2 rounded-lg bg-slate-900 text-white hover:bg-slate-800 font-medium flex items-center gap-2">
                 <Save size={18} /> Αποθήκευση
              </button>
           </div>
        </div>

      </div>
    </div>
  );
}

const TabButton = ({ active, onClick, label, icon }: any) => (
  <button 
    onClick={onClick}
    className={`flex items-center gap-2 px-6 py-4 font-medium text-sm border-b-2 transition-colors whitespace-nowrap ${active ? 'border-amber-500 text-amber-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
  >
    {icon} {label}
  </button>
);

const InputGroup = ({ label, children }: any) => (
   <div>
      <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-wide">{label}</label>
      {children}
   </div>
);