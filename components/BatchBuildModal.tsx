
import React, { useMemo, useState } from 'react';
import { ProductionBatch, Product, Material, Mold, ProductionType, ProductionStage } from '../types';
import { X, Box, MapPin, Info, Image as ImageIcon, Scale, Calculator, StickyNote, MoveRight, Check, PauseCircle, AlertTriangle } from 'lucide-react';
import { formatCurrency, formatDecimal, getVariantComponents } from '../utils/pricingEngine';

interface Props {
    batch: ProductionBatch;
    allMaterials: Material[];
    allMolds: Mold[];
    allProducts: Product[];
    onClose: () => void;
    onMove?: (batch: ProductionBatch, stage: ProductionStage) => void;
}

const STAGES = [
    { id: ProductionStage.AwaitingDelivery, label: 'Αναμονή' },
    { id: ProductionStage.Waxing, label: 'Λάστιχα/Κεριά' },
    { id: ProductionStage.Casting, label: 'Χυτήριο' },
    { id: ProductionStage.Setting, label: 'Καρφωτής' },
    { id: ProductionStage.Polishing, label: 'Τεχνίτης' },
    { id: ProductionStage.Labeling, label: 'Συσκευασία' },
    { id: ProductionStage.Ready, label: 'Έτοιμα' }
];

export default function BatchBuildModal({ batch, allMaterials, allMolds, allProducts, onClose, onMove }: Props) {
    const product = batch.product_details;
    const [isMoving, setIsMoving] = useState(false);

    const buildData = useMemo(() => {
        if (!product) return null;

        // 1. Molds
        const requiredMolds = product.molds.map(pm => {
            const details = allMolds.find(m => m.code === pm.code);
            return {
                code: pm.code,
                quantity: pm.quantity,
                location: details?.location || '-',
                description: details?.description
            };
        });

        // 2. Recipe (With Totals and Descriptions)
        const recipeItems = product.recipe.map(item => {
            let name = '';
            let description = '';
            let unit = 'τεμ';

            if (item.type === 'raw') {
                const mat = allMaterials.find(m => m.id === item.id);
                name = mat?.name || `Material #${item.id}`;
                description = mat?.description || '';
                unit = mat?.unit || 'τεμ';
            } else {
                const comp = allProducts.find(p => p.sku === item.sku);
                name = item.sku; 
                description = comp?.description || comp?.category || '';
            }

            return {
                type: item.type,
                name,
                description,
                unit,
                qtyPerUnit: item.quantity,
                totalQtyRequired: item.quantity * batch.quantity
            };
        });

        // 3. Variant Info
        const { finish, stone } = getVariantComponents(batch.variant_suffix || '', product.gender);
        const fullDescription = [
            product.category,
            finish.name,
            stone.name
        ].filter(Boolean).join(' • ');

        return {
            molds: requiredMolds,
            recipe: recipeItems,
            description: fullDescription,
            totalSilverWeight: (product.weight_g + (product.secondary_weight_g || 0)) * batch.quantity
        };

    }, [product, batch, allMaterials, allMolds, allProducts]);

    const handleStageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        if (onMove) {
            setIsMoving(true);
            onMove(batch, e.target.value as ProductionStage);
            setTimeout(() => {
                setIsMoving(false);
                onClose();
            }, 500);
        }
    };

    if (!product || !buildData) return null;

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
            <div className="bg-white w-full max-w-4xl max-h-[90vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                
                {/* Header */}
                <div className="p-6 border-b border-slate-100 flex justify-between items-start bg-slate-50/50">
                    <div className="flex items-center gap-4">
                        <div className="w-16 h-16 bg-white rounded-xl border border-slate-200 flex items-center justify-center overflow-hidden shrink-0 shadow-sm">
                            {product.image_url ? (
                                <img src={product.image_url} className="w-full h-full object-cover" alt={product.sku} />
                            ) : (
                                <ImageIcon size={24} className="text-slate-300" />
                            )}
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h2 className="text-2xl font-black text-slate-800 tracking-tight">{batch.sku}</h2>
                                {batch.variant_suffix && (
                                    <span className="bg-slate-800 text-white px-2 py-0.5 rounded-lg text-lg font-mono font-bold">
                                        {batch.variant_suffix}
                                    </span>
                                )}
                            </div>
                            <p className="text-sm text-slate-500 font-medium mt-1">{buildData.description}</p>
                            <div className="flex gap-2 mt-2">
                                {batch.size_info && (
                                    <div className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 px-2 py-0.5 rounded text-xs font-bold border border-blue-100">
                                        <Scale size={12}/> Μέγεθος: {batch.size_info}
                                    </div>
                                )}
                                {batch.on_hold && (
                                    <div className="bg-amber-100 text-amber-700 border border-amber-200 text-[10px] font-black px-2 py-0.5 rounded-lg flex items-center gap-1 animate-pulse">
                                        <PauseCircle size={12} className="fill-current" />
                                        <span>ΣΕ ΑΝΑΜΟΝΗ</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-4">
                        {/* Stage Mover */}
                        {onMove && (
                            <div className="hidden md:flex flex-col items-end mr-4">
                                <label className="text-[10px] font-bold text-slate-400 uppercase mb-1">Στάδιο Παραγωγής</label>
                                <div className="relative group">
                                    <div className={`flex items-center gap-2 px-4 py-2 rounded-xl border cursor-pointer transition-all ${isMoving ? 'bg-emerald-100 border-emerald-200 text-emerald-700' : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'}`}>
                                        {isMoving ? <Check size={16} className="animate-bounce"/> : <MoveRight size={16}/>}
                                        <span className="font-bold text-sm">
                                            {isMoving ? 'Μετακίνηση...' : (STAGES.find(s => s.id === batch.current_stage)?.label || batch.current_stage)}
                                        </span>
                                    </div>
                                    <select 
                                        className="absolute inset-0 opacity-0 cursor-pointer"
                                        value={batch.current_stage}
                                        onChange={handleStageChange}
                                        disabled={isMoving}
                                    >
                                        {STAGES.map(s => (
                                            <option key={s.id} value={s.id}>{s.label}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        )}

                        <div className="text-right bg-emerald-50 px-5 py-3 rounded-2xl border border-emerald-100">
                            <div className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider mb-1">Ποσοτητα Παρτιδας</div>
                            <div className="text-4xl font-black text-emerald-700 leading-none">{batch.quantity}</div>
                        </div>
                        <button onClick={onClose} className="p-3 bg-slate-100 hover:bg-slate-200 rounded-full text-slate-500 transition-colors">
                            <X size={24}/>
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                    {/* Mobile Stage Mover (Visible only on small screens) */}
                    {onMove && (
                        <div className="md:hidden mb-6 p-4 bg-slate-50 rounded-2xl border border-slate-200">
                             <label className="text-xs font-bold text-slate-500 uppercase mb-2 block">Μετακίνηση Σταδίου</label>
                             <select 
                                className="w-full p-3 bg-white border border-slate-300 rounded-xl font-bold text-slate-800"
                                value={batch.current_stage}
                                onChange={handleStageChange}
                             >
                                 {STAGES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                             </select>
                        </div>
                    )}

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        
                        {/* LEFT COLUMN: RESOURCES */}
                        <div className="space-y-6">
                            
                            {/* Notes Alert */}
                            {batch.notes && (
                                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex gap-3 shadow-sm">
                                    <StickyNote className="text-amber-500 shrink-0" size={24}/>
                                    <div>
                                        <h4 className="font-bold text-amber-800 text-sm uppercase tracking-wide mb-1">Σημειωση Παραγωγης</h4>
                                        <p className="text-amber-900 font-medium text-sm leading-relaxed">{batch.notes}</p>
                                    </div>
                                </div>
                            )}

                            {/* Molds */}
                            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                                <div className="bg-slate-50 px-5 py-3 border-b border-slate-200 flex justify-between items-center">
                                    <h3 className="font-bold text-slate-700 flex items-center gap-2">
                                        <MapPin size={18} className="text-orange-500"/> Απαιτούμενα Λάστιχα
                                    </h3>
                                </div>
                                <div className="p-2">
                                    {buildData.molds.length > 0 ? (
                                        <div className="space-y-2">
                                            {buildData.molds.map(m => (
                                                <div key={m.code} className="flex justify-between items-center p-3 rounded-xl bg-orange-50/50 border border-orange-100">
                                                    <div className="flex flex-col">
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-black text-slate-800 text-lg">{m.code}</span>
                                                            <span className="text-xs font-bold bg-white text-orange-600 px-2 py-0.5 rounded-md border border-orange-200">
                                                                x{m.quantity}
                                                            </span>
                                                        </div>
                                                        <span className="text-xs text-slate-500">{m.description}</span>
                                                    </div>
                                                    <div className="text-right">
                                                        <span className="block text-[10px] font-bold text-slate-400 uppercase">Τοποθεσια</span>
                                                        <span className="text-sm font-bold text-orange-700">{m.location}</span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="p-4 text-center text-slate-400 text-sm italic">Δεν απαιτούνται λάστιχα.</div>
                                    )}
                                </div>
                            </div>

                            {/* Metal Estimation */}
                            <div className="bg-slate-100 rounded-2xl p-5 flex justify-between items-center border border-slate-200">
                                <div>
                                    <h4 className="font-bold text-slate-700 text-sm uppercase tracking-wide">Εκτιμηση Μεταλλου</h4>
                                    <p className="text-xs text-slate-500">Ασήμι 925 (χωρίς απώλεια)</p>
                                </div>
                                <div className="text-2xl font-black text-slate-600">
                                    {formatDecimal(buildData.totalSilverWeight, 1)} <span className="text-sm text-slate-400 font-bold">gr</span>
                                </div>
                            </div>
                        </div>

                        {/* RIGHT COLUMN: RECIPE / BOM */}
                        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col overflow-hidden h-full min-h-[400px]">
                            <div className="bg-slate-50 px-5 py-4 border-b border-slate-200">
                                <h3 className="font-bold text-slate-700 flex items-center gap-2">
                                    <Box size={18} className="text-blue-500"/> Υλικά & Εξαρτήματα
                                </h3>
                                <p className="text-xs text-slate-400 mt-1">Λίστα συλλογής για {batch.quantity} τεμάχια.</p>
                            </div>
                            
                            <div className="flex-1 overflow-auto">
                                <table className="w-full text-left text-sm">
                                    <thead className="bg-white text-slate-400 text-[10px] uppercase font-black tracking-wider sticky top-0 shadow-sm z-10">
                                        <tr>
                                            <th className="p-4 border-b border-slate-100">Υλικο</th>
                                            <th className="p-4 border-b border-slate-100 text-center">Ανα Τμχ</th>
                                            <th className="p-4 border-b border-slate-100 text-right bg-blue-50/30 text-blue-600">Συνολο</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50">
                                        {buildData.recipe.length > 0 ? buildData.recipe.map((item, idx) => (
                                            <tr key={idx} className="hover:bg-slate-50 transition-colors">
                                                <td className="p-4">
                                                    <span className={`font-bold ${item.type === 'raw' ? 'text-slate-700' : 'text-purple-700'}`}>
                                                        {item.name}
                                                    </span>
                                                    {item.type === 'component' && <span className="ml-2 text-[9px] bg-purple-100 text-purple-600 px-1.5 py-0.5 rounded font-bold">STX</span>}
                                                    {item.description && (
                                                        <div className="text-[10px] text-slate-500 font-medium mt-0.5 italic leading-tight">
                                                            {item.description}
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="p-4 text-center font-mono text-slate-500">
                                                    {formatDecimal(item.qtyPerUnit, 2)}
                                                </td>
                                                <td className="p-4 text-right bg-blue-50/10">
                                                    <span className="font-black text-lg text-blue-900">{formatDecimal(item.totalQtyRequired, 2)}</span>
                                                    <span className="text-xs text-blue-400 font-medium ml-1">{item.unit}</span>
                                                </td>
                                            </tr>
                                        )) : (
                                            <tr>
                                                <td colSpan={3} className="p-12 text-center text-slate-400 italic">
                                                    Δεν απαιτούνται επιπλέον υλικά.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                    </div>
                </div>

                <div className="p-6 bg-slate-50 border-t border-slate-200 flex justify-end">
                    <button onClick={onClose} className="bg-slate-900 text-white px-8 py-3 rounded-xl font-bold hover:bg-black transition-colors shadow-lg active:scale-95">
                        Κλείσιμο
                    </button>
                </div>
            </div>
        </div>
    );
}
