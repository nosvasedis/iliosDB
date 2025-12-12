import React from 'react';
import { ProductionBatch, Product, Material, RecipeItem, MaterialType } from '../types';
import { APP_LOGO } from '../constants';
import { Box, Coins, Gem, Puzzle } from 'lucide-react';

interface Props {
    batches: ProductionBatch[];
    allMaterials: Material[];
    allProducts: Product[];
}

interface AggregatedResource {
    name: string;
    unit: string;
    totalQuantity: number;
    type: 'material' | 'component' | 'stone';
}

export default function PreparationView({ batches, allMaterials, allProducts }: Props) {
    
    const aggregatedResources = new Map<string, AggregatedResource>();

    batches.forEach(batch => {
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
        <div className="bg-white text-slate-900 font-sans w-[210mm] min-h-[297mm] p-8 mx-auto shadow-lg print:shadow-none print:p-10">
            <header className="flex justify-between items-start border-b border-slate-200 pb-4 mb-6">
                <img src={APP_LOGO} alt="ILIOS" className="w-24 object-contain" />
                <div className="text-right">
                    <h1 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Φύλλο Προετοιμασίας</h1>
                    <p className="text-slate-500 text-xs mt-1">Ημερομηνία: {new Date().toLocaleDateString('el-GR')}</p>
                </div>
            </header>
            
            <main>
                <div className="space-y-6">
                    {batches.map(batch => {
                        const product = batch.product_details;
                        if (!product) return null;
                        
                        const variant = product.variants?.find(v => v.suffix === batch.variant_suffix);
                        const platingDesc = variant?.description || product.category;

                        return (
                            <div key={batch.id} className="grid grid-cols-12 gap-4 border-b border-slate-200 pb-4 break-inside-avoid">
                                <div className="col-span-3">
                                    <div className="w-full aspect-square bg-slate-100 rounded-lg overflow-hidden border border-slate-200">
                                        {product.image_url && <img src={product.image_url} className="w-full h-full object-cover"/>}
                                    </div>
                                </div>
                                <div className="col-span-9">
                                    <p className="text-2xl font-black text-slate-800 tracking-tight">{batch.sku}{batch.variant_suffix || ''} <span className="font-bold text-slate-500 text-xl">x {batch.quantity}</span></p>
                                    <p className="font-semibold text-blue-600 mb-2">{platingDesc}</p>
                                    
                                    <table className="w-full text-sm">
                                        <tbody>
                                            {product.recipe.map((item, idx) => {
                                                const details = item.type === 'raw' ? allMaterials.find(m => m.id === item.id) : allProducts.find(p => p.sku === item.sku);
                                                const name = item.type === 'raw' ? (details as Material)?.name : `Εξάρτημα: ${item.sku}`;
                                                const unit = item.type === 'raw' ? (details as Material)?.unit : 'τεμ.';
                                                return (
                                                    <tr key={idx} className="border-t border-slate-100">
                                                        <td className="py-1 pr-2 text-slate-700">{name}</td>
                                                        <td className="py-1 pl-2 text-right font-bold">{item.quantity} {unit} / τεμ.</td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        );
                    })}
                </div>

                <div className="mt-8 pt-6 border-t-2 border-slate-800 break-before-page">
                    <h2 className="text-xl font-bold text-slate-800 uppercase mb-4">Συγκεντρωτική Λίστα Υλικών</h2>
                    <div className="grid grid-cols-3 gap-6 text-sm">
                        <ResourceList title="Υλικά" items={sortedMaterials} icon={<Coins />} />
                        <ResourceList title="Πέτρες" items={sortedStones} icon={<Gem />} />
                        <ResourceList title="Εξαρτήματα" items={sortedComponents} icon={<Puzzle />} />
                    </div>
                </div>
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
