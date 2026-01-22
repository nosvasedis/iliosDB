
import React, { useMemo } from 'react';
import { AggregatedData, ProductionType } from '../types';
import { APP_LOGO } from '../constants';
import { Box, MapPin, Coins, Factory, Package, DollarSign, Weight, StickyNote, Hammer } from 'lucide-react';
import { formatCurrency, formatDecimal } from '../utils/pricingEngine';
import { GlobalSettings } from '../types';

interface Props {
    data: AggregatedData;
    settings: GlobalSettings;
}

export default function AggregatedProductionView({ data, settings }: Props) {
    const totalItems = data.batches.reduce((sum, b) => sum + b.quantity, 0);

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString('el-GR', {
            day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
        });
    };

    // Calculate Technician Metal Breakdown (Excluding STX)
    const techMetal = useMemo(() => {
        const acc = { P: 0, X: 0, H: 0 };
        
        data.batches.forEach(batch => {
            const p = batch.product_details;
            // 1. Exclude STX (Components) and Imported items (if they don't go to technician)
            // Usually Imported items don't need metal calculation for casting, but request specifically mentioned STX.
            if (!p || p.is_component) return; 

            const qty = batch.quantity;
            const wMain = p.weight_g;
            const wSec = p.secondary_weight_g || 0;
            const suffix = batch.variant_suffix || '';

            // Detect Finish Type
            let type = 'P'; // Default
            
            if (suffix.includes('X')) type = 'X';
            else if (suffix.includes('H')) type = 'H';
            else if (suffix.includes('D')) type = 'D';
            else if (suffix.includes('P')) type = 'P';
            else {
                // Fallback to master plating type if suffix doesn't specify
                if (p.plating_type === 'Gold-Plated') type = 'X';
                else if (p.plating_type === 'Platinum') type = 'H';
                else if (p.plating_type === 'Two-Tone') type = 'D';
            }

            // Calculation Logic
            if (type === 'D') {
                // Two-Tone: Smart Split
                // Primary Weight -> Silver (P)
                // Secondary Weight -> Gold Plated (X)
                acc.P += wMain * qty;
                acc.X += wSec * qty;
            } else if (type === 'X') {
                // Full Gold Plated: Total Weight
                acc.X += (wMain + wSec) * qty;
            } else if (type === 'H') {
                // Full Platinum Plated: Total Weight
                acc.H += (wMain + wSec) * qty;
            } else {
                // Standard Silver/Patina: Total Weight
                acc.P += (wMain + wSec) * qty;
            }
        });

        return acc;
    }, [data.batches]);

    const totalTechnicianSilver = techMetal.P + techMetal.X + techMetal.H;

    return (
        <div className="bg-white text-slate-900 font-sans w-[210mm] p-6 mx-auto shadow-lg print:shadow-none print:p-6 print:w-full h-auto min-h-0">
            {/* HEADER */}
            <div className="flex justify-between items-start border-b border-slate-900 pb-2 mb-3">
                <div className="w-24">
                    <img src={APP_LOGO} alt="ILIOS" className="w-full h-auto object-contain block" />
                </div>
                <div className="text-right">
                    {data.orderId ? (
                        <>
                            <h1 className="text-xl font-black text-slate-800 uppercase tracking-tight">Εντολη Παραγωγησ</h1>
                            <div className="flex items-center justify-end gap-3 text-xs mt-1">
                                <span className="font-mono font-bold text-slate-600">#{data.orderId}</span>
                                <span className="text-slate-400">|</span>
                                <span className="font-bold text-slate-900">{data.customerName}</span>
                            </div>
                        </>
                    ) : (
                        <>
                            <h1 className="text-xl font-black text-slate-800 uppercase tracking-tight">Συγκεντρωτικη Εντολη</h1>
                            <p className="text-slate-600 text-[10px] font-bold mt-0.5">{formatDate(new Date().toISOString())}</p>
                        </>
                    )}
                </div>
            </div>

            {/* COMPACT METRICS BAR */}
            <div className="flex justify-between items-center bg-slate-50 rounded-lg p-2 border border-slate-100 mb-3 text-xs">
                <div className="flex gap-4">
                    <div className="flex items-center gap-1.5">
                        <Package size={14} className="text-slate-400"/>
                        <span className="font-bold text-slate-700">{totalItems} Τεμ.</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <Weight size={14} className="text-slate-400"/>
                        <span className="font-bold text-slate-700">{formatDecimal(data.totalSilverWeight, 1)}g Ag (Total)</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <Coins size={14} className="text-slate-400"/>
                        <span className="font-bold text-slate-700">{formatDecimal(settings.silver_price_gram, 3)}€/g</span>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-500 uppercase text-[10px]">Κοστος:</span>
                    <span className="font-black text-slate-900 text-sm">{formatCurrency(data.totalProductionCost)}</span>
                </div>
            </div>

            {/* NEW: TECHNICIAN METAL BREAKDOWN (P/X/H) */}
            <div className="mb-4 border border-slate-200 rounded-xl overflow-hidden">
                <div className="bg-slate-100 px-3 py-1 border-b border-slate-200 flex justify-between items-center">
                     <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1">
                        <Hammer size={10}/> Παράδοση Μετάλλου στον Τεχνίτη
                     </span>
                     <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                        (Εκτός STX) • Σύνολο: {formatDecimal(totalTechnicianSilver, 1)}g
                     </span>
                </div>
                <div className="grid grid-cols-3 divide-x divide-slate-200">
                    <div className="p-2 bg-slate-50 text-center">
                        <div className="text-[8px] font-bold text-slate-400 uppercase mb-0.5">Λευκο / Πατινα (P)</div>
                        <div className="text-lg font-black text-slate-700 leading-none">{formatDecimal(techMetal.P, 1)} <span className="text-[10px] font-medium text-slate-400">g</span></div>
                    </div>
                    <div className="p-2 bg-amber-50 text-center">
                        <div className="text-[8px] font-bold text-amber-600/70 uppercase mb-0.5">Για Επιχρυσωση (X)</div>
                        <div className="text-lg font-black text-amber-700 leading-none">{formatDecimal(techMetal.X, 1)} <span className="text-[10px] font-medium text-amber-500">g</span></div>
                    </div>
                    <div className="p-2 bg-cyan-50 text-center">
                        <div className="text-[8px] font-bold text-cyan-600/70 uppercase mb-0.5">Για Επιπλατινωση (H)</div>
                        <div className="text-lg font-black text-cyan-700 leading-none">{formatDecimal(techMetal.H, 1)} <span className="text-[10px] font-medium text-cyan-500">g</span></div>
                    </div>
                </div>
            </div>
            
            {/* HORIZONTAL COST BREAKDOWN */}
            <div className="flex gap-4 text-[10px] text-slate-500 mb-4 px-1 border-b border-slate-100 pb-2">
                <span>Ασήμι: <b className="text-slate-800">{formatCurrency(data.totalSilverCost)}</b></span>
                <span>Υλικά: <b className="text-slate-800">{formatCurrency(data.totalMaterialsCost)}</b></span>
                <span>Εργ.(Εργ): <b className="text-slate-800">{formatCurrency(data.totalInHouseLaborCost - data.totalSubcontractCost)}</b></span>
                {data.totalImportedLaborCost > 0 && <span>Εργ.(Εισ): <b className="text-slate-800">{formatCurrency(data.totalImportedLaborCost)}</b></span>}
                <span>Φασόν: <b className="text-slate-800">{formatCurrency(data.totalSubcontractCost)}</b></span>
            </div>

            {/* DENSE TABLE */}
            <table className="w-full text-left text-xs border-collapse">
                <thead className="text-[9px] font-black text-slate-500 uppercase tracking-wider bg-slate-50">
                    <tr>
                        <th className="py-1 px-1 w-8 text-center rounded-l-md">#</th>
                        <th className="py-1 px-1 w-10">Εικ.</th>
                        <th className="py-1 px-1">Περιγραφη / SKU</th>
                        <th className="py-1 px-1 text-center w-10">Ποσ.</th>
                        <th className="py-1 px-1 text-center w-16">Βαρος</th>
                        <th className="py-1 px-1 text-right w-16">Τιμη</th>
                        <th className="py-1 px-1 text-right w-16 rounded-r-md">Συνολο</th>
                    </tr>
                </thead>
                <tbody className="leading-tight">
                    {data.batches.sort((a,b) => (a.sku+(a.variant_suffix || '')).localeCompare(b.sku+(b.variant_suffix||''))).map((batch, idx) => {
                        const totalWeight = (batch.product_details?.weight_g || 0) * batch.quantity;
                        return (
                        <tr key={batch.id} className="border-b border-slate-50 break-inside-avoid">
                            <td className="py-1 px-1 text-center text-slate-400 font-mono text-[9px] align-middle">{idx + 1}</td>
                            <td className="py-1 px-1 align-middle">
                                <div className="w-6 h-6 rounded bg-slate-100 overflow-hidden border border-slate-200">
                                    {batch.product_details?.image_url && <img src={batch.product_details.image_url} className="w-full h-full object-cover" />}
                                </div>
                            </td>
                            <td className="py-1 px-1 align-middle">
                                <div className="flex items-baseline gap-1">
                                    <span className="font-black text-slate-800 text-sm">{batch.sku}{batch.variant_suffix}</span>
                                    {batch.size_info && <span className="text-[9px] font-bold bg-slate-100 px-1 rounded text-slate-600 border border-slate-200">{batch.size_info}</span>}
                                    {batch.product_details?.is_component && <span className="text-[8px] font-bold bg-blue-50 text-blue-600 px-1 rounded border border-blue-100">STX</span>}
                                </div>
                                {(batch.product_details?.supplier_sku || batch.notes) && (
                                    <div className="flex flex-wrap gap-2 text-[9px] mt-0.5">
                                        {batch.product_details?.supplier_sku && <span className="text-slate-400 font-mono">Ref: {batch.product_details.supplier_sku}</span>}
                                        {batch.notes && <span className="text-emerald-700 font-bold italic bg-emerald-50 px-1 rounded flex items-center gap-0.5"><StickyNote size={8}/> {batch.notes}</span>}
                                    </div>
                                )}
                            </td>
                            <td className="py-1 px-1 text-center font-black text-slate-900 text-sm align-middle">{batch.quantity}</td>
                            <td className="py-1 px-1 text-center font-mono text-[10px] text-slate-600 align-middle">
                                {formatDecimal(totalWeight, 1)}g
                            </td>
                            <td className="py-1 px-1 text-right font-mono text-[10px] text-slate-500 align-middle">{formatCurrency(batch.cost_per_piece)}</td>
                            <td className="py-1 px-1 text-right font-mono font-bold text-slate-800 align-middle">{formatCurrency(batch.total_cost)}</td>
                        </tr>
                    )})}
                </tbody>
            </table>

            <footer className="mt-4 pt-2 border-t border-slate-200 text-center">
                <p className="text-[8px] text-slate-400 uppercase tracking-widest">Ilios Kosmima ERP • Σελίδα 1</p>
            </footer>
        </div>
    );
}

const SummaryCard = ({ title, value, icon }: any) => (
    <div className="flex flex-col">
        <span className="text-[9px] text-slate-400 font-bold uppercase">{title}</span>
        <span className="text-sm font-black text-slate-800 flex items-center gap-1">{icon} {value}</span>
    </div>
);

const CostRow = ({ label, value }: { label: string, value: number }) => (
    <span>{label}: <b className="text-slate-900">{formatCurrency(value)}</b></span>
);
