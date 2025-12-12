import React from 'react';
import { ProductionBatch, Product, Material, RecipeItem, MaterialType, ProductionType, Mold } from '../types';
import { APP_LOGO } from '../constants';
import { Box, Coins, Gem, Puzzle, Globe, MapPin } from 'lucide-react';

interface Props {
    batches: ProductionBatch[];
    allMaterials: Material[];
    allProducts: Product[];
    allMolds: Mold[];
}

interface AggregatedResource {
    name: string;
    unit: string;
    totalQuantity: number;
    type: 'material' | 'component' | 'stone';
}

export default function PreparationView({ batches, allMaterials, allProducts, allMolds }: Props) {
    
    const aggregatedResources = new Map<string, AggregatedResource>();

    // Filter batches into In-House and Imported
    const inHouseBatches = batches.filter(b => b.product_details?.production_type !== ProductionType.Imported);
    const importedBatches = batches.filter(b => b.product_details?.production_type === ProductionType.Imported);

    // Only aggregate resources for in-house production
    inHouseBatches.forEach(batch => {
        const product = batch.product_details;
        if (!product) return;

        product.recipe.forEach(item => {
            const requiredQuantity = item.quantity * batch.quantity;
            if (item.type === 'raw') {
                const details = allMaterials.find(m => m.id === item.id);
                if (!details) return;

                const key = `raw-${details.id}`;
                const isStone = details.type === MaterialType.Stone;

                if (aggregatedResources.has(key)) {
                    aggregatedResources.get(key)!.totalQuantity += requiredQuantity;
                } else {
                    aggregatedResources.set(key, {
                        name: details.name,
                        unit: details.unit,
                        totalQuantity: requiredQuantity,
                        type: isStone ? 'stone' : 'material'
                    });
                }
            } else { // component
                const details = allProducts.find(p => p.sku === item.sku);
                if (!details) return;

                const key = `comp-${details.sku}`;
                if (aggregatedResources.has(key)) {
                    aggregatedResources.get(key)!.totalQuantity += requiredQuantity;
                } else {
                    aggregatedResources.set(key, {
                        name: details.sku,
                        unit: 'τεμ',
                        totalQuantity: requiredQuantity,
                        type: 'component'
                    });
                }
            }
        });
    });

    const sortedMaterials = Array.from(aggregatedResources.values()).filter(r => r.type === 'material').sort((a,b) => a.name.localeCompare(b.name));
    const sortedStones = Array.from(aggregatedResources.values()).filter(r => r.type === 'stone').sort((a,b) => a.name.localeCompare(b.name));
    const sortedComponents = Array.from(aggregatedResources.values()).filter(r => r.type === 'component').sort((a,b) => a.name.localeCompare(b.name));

    return (
        <div className="bg-white text-slate-900 font-sans w-[210mm] min-h-[297mm] p-6 mx-auto shadow-lg print:shadow-none print:p-6">
            <header className="flex justify-between items-start border-b border-slate-200 pb-3 mb-4">
                <img src={APP_LOGO} alt="ILIOS" className="w-20 object-contain" />
                <div className="text-right">
                    <h1 className="text-xl font-black text-slate-800 uppercase tracking-tight">Φύλλο Προετοιμασίας</h1>
                    <p className="text-slate-500 text-xs mt-1">Ημερομηνία: {new Date().toLocaleDateString('el-GR')}</p>
                </div>
            </header>
            
            <main>
                {/* In-House Production Section */}
                {inHouseBatches.length > 0 && (
                    <div className="space-y-4">
                        <h2 className="text-base font-bold text-slate-800 uppercase border-b-2 border-slate-300 pb-1">Είδη Παραγωγής</h2>
                        <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                            {inHouseBatches.map(batch => {
                                const product = batch.product_details;
                                if (!product) return null;
                                
                                const variant = product.variants?.find(v => v.suffix === batch.variant_suffix);
                                const platingDesc = variant?.description || product.category;

                                return (
                                    <div key={batch.id} className="border border-slate-200 rounded-xl p-2 flex flex-col break-inside-avoid">
                                        <div className="flex justify-between items-start">
                                            <div className="flex-1">
                                                <p className="text-lg font-black text-slate-800 tracking-tight leading-tight">{batch.sku}{batch.variant_suffix || ''}</p>
                                                <p className="font-semibold text-blue-600 text-xs">{platingDesc}</p>
                                            </div>
                                            <p className="font-black text-slate-500 text-xl ml-2">x {batch.quantity}</p>
                                        </div>
                                        
                                        <div className="w-full aspect-square bg-slate-100 rounded-lg overflow-hidden border border-slate-200 my-2">
                                            {product.image_url && <img src={product.image_url} className="w-full h-full object-cover"/>}
                                        </div>

                                        <div className="space-y-2 text-xs">
                                            <div>
                                                <h4 className="font-semibold text-slate-600 text-[10px] uppercase mb-1 border-b">Υλικά / τεμ.</h4>
                                                <ul className="space-y-0.5 list-disc list-inside marker:text-slate-300">
                                                    {product.recipe.length > 0 ? product.recipe.map((item, idx) => {
                                                        const details = item.type === 'raw' ? allMaterials.find(m => m.id === item.id) : allProducts.find(p => p.sku === item.sku);
                                                        const name = item.type === 'raw' ? (details as Material)?.name : `Εξάρτημα: ${item.sku}`;
                                                        const unit = item.type === 'raw' ? (details as Material)?.unit : 'τεμ.';
                                                        return ( <li key={idx} className="text-slate-700">{name}: <span className="font-bold">{item.quantity} {unit}</span></li> );
                                                    }) : ( <li className="text-xs italic text-slate-400">Μόνο ασήμι.</li> )}
                                                </ul>
                                            </div>
                                            <div>
                                                <h4 className="font-semibold text-slate-600 text-[10px] uppercase mb-1 border-b">Λάστιχα / τεμ.</h4>
                                                 <ul className="space-y-0.5 list-disc list-inside marker:text-slate-300">
                                                    {product.molds.length > 0 ? product.molds.map((mold, idx) => {
                                                        const moldDetails = allMolds.find(m => m.code === mold.code);
                                                        return (
                                                            <li key={idx} className="text-slate-700">
                                                                <span className="font-mono font-bold">{mold.code}</span> (x{mold.quantity})
                                                                {moldDetails && <span className="text-slate-500 text-[10px] ml-1"> - {moldDetails.description} {moldDetails.location && `(${moldDetails.location})`}</span>}
                                                            </li>
                                                        );
                                                    }) : ( <li className="text-xs italic text-slate-400">Δεν απαιτούνται.</li> )}
                                                </ul>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
                
                {/* Imported Products Section */}
                {importedBatches.length > 0 && (
                    <div className="space-y-4 mt-6 pt-4 border-t-2 border-slate-800">
                        <h2 className="text-base font-bold text-slate-800 uppercase border-b-2 border-slate-300 pb-1">Είδη Εισαγωγής</h2>
                        <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                        {importedBatches.map(batch => {
                            const product = batch.product_details;
                            if (!product) return null;
                            
                            return (
                                <div key={batch.id} className="border border-slate-200 rounded-xl p-3 flex flex-col break-inside-avoid">
                                     <div className="flex justify-between items-start">
                                        <p className="text-lg font-black text-slate-800 tracking-tight leading-tight">{batch.sku}{batch.variant_suffix || ''}</p>
                                        <p className="font-black text-slate-500 text-xl ml-2">x {batch.quantity}</p>
                                    </div>
                                    <div className="w-full aspect-square bg-slate-100 rounded-lg overflow-hidden border border-slate-200 my-2">
                                        {product.image_url && <img src={product.image_url} className="w-full h-full object-cover"/>}
                                    </div>
                                    <div className="mt-auto bg-purple-50 text-purple-800 p-2 rounded-lg border border-purple-200 text-xs">
                                        <p className="font-bold flex items-center gap-1.5"><Globe size={14}/> Εισαγόμενο</p>
                                        <p className="mt-1">Προμηθευτής: <span className="font-bold">{product.supplier_details?.name || 'Άγνωστος'}</span></p>
                                    </div>
                                </div>
                            );
                        })}
                        </div>
                    </div>
                )}


                {/* Aggregated List only if there are in-house items */}
                {inHouseBatches.length > 0 && (
                    <div className="mt-6 pt-4 border-t-2 border-slate-800 break-before-page">
                        <h2 className="text-lg font-bold text-slate-800 uppercase mb-4">Συγκεντρωτική Λίστα Υλικών</h2>
                        <div className="grid grid-cols-3 gap-6 text-sm">
                            <ResourceList title="Υλικά" items={sortedMaterials} icon={<Coins />} />
                            <ResourceList title="Πέτρες" items={sortedStones} icon={<Gem />} />
                            <ResourceList title="Εξαρτήματα" items={sortedComponents} icon={<Puzzle />} />
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}

const ResourceList = ({ title, items, icon }: { title: string, items: AggregatedResource[], icon: React.ReactNode }) => (
    <div className="space-y-2 break-inside-avoid">
        <h3 className="font-bold text-base flex items-center gap-2 border-b border-slate-200 pb-2 mb-2">{icon} {title}</h3>
        {items.length > 0 ? (
            <ul className="space-y-1">
                {items.map(item => (
                    <li key={item.name} className="flex justify-between">
                        <span>{item.name}</span>
                        <span className="font-bold">{parseFloat(item.totalQuantity.toFixed(2)).toString().replace('.', ',')} {item.unit}</span>
                    </li>
                ))}
            </ul>
        ) : <p className="text-xs text-slate-400 italic">Κανένα.</p>}
    </div>
);