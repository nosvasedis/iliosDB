import React, { useMemo } from 'react';
import { AggregatedData, ProductionType } from '../types';
import { APP_LOGO } from '../constants';
import { Box, MapPin, Coins, Factory, Package, DollarSign, Weight, StickyNote, Hammer } from 'lucide-react';
import { formatCurrency, formatDecimal } from '../utils/pricingEngine';
import { GlobalSettings } from '../types';
import { formatOrderId } from '../utils/orderUtils';
import { buildSkuKey, sortBySkuKey } from '../utils/skuSort';
import { getProductOptionColorLabel } from '../utils/xrOptions';

interface Props {
    data: AggregatedData;
    settings: GlobalSettings;
}

export default function AggregatedProductionView({ data, settings }: Props) {
    const inHouseBatches = useMemo(
        () => data.batches.filter(b => b.product_details?.production_type !== ProductionType.Imported),
        [data.batches]
    );

    const importedBatches = useMemo(
        () => (data.importedBatches && data.importedBatches.length > 0
            ? data.importedBatches
            : data.batches.filter(b => b.product_details?.production_type === ProductionType.Imported)),
        [data.importedBatches, data.batches]
    );

    const totalItems = inHouseBatches.reduce((sum, b) => sum + b.quantity, 0);

    const sortedInHouseBatches = useMemo(
        () => sortBySkuKey(inHouseBatches, (batch) => buildSkuKey(batch.sku, batch.variant_suffix)),
        [inHouseBatches]
    );

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString('el-GR', {
            day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
        });
    };

    // Calculate Technician Metal Breakdown (Excluding STX and Imported Items)
    const techMetal = useMemo(() => {
        const acc = { P: 0, X: 0, H: 0 };
        
        inHouseBatches.forEach(batch => {
            const p = batch.product_details;
            // CRITICAL: Exclude STX (Components) AND Imported items.
            // Only workshop (InHouse) manufactured products are calculated for technician metal delivery.
            if (!p || p.is_component || p.production_type === ProductionType.Imported) return; 

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
    }, [inHouseBatches]);

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
                                <span className="font-mono font-bold text-slate-600">#{formatOrderId(data.orderId)}</span>
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
                    <span className="font-bold text-slate-700">{formatDecimal(data.totalSilverWeight, 1)}g Ag (In-House)</span>
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
                        (Μόνο Εργαστηρίου) • Σύνολο: {formatDecimal(totalTechnicianSilver, 1)}g
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
            <div className="flex flex-wrap gap-4 text-[10px] text-slate-500 mb-4 px-1 border-b border-slate-100 pb-2">
                <span>Ασήμι (Εργαστηρίου): <b className="text-slate-800">{formatCurrency(data.totalSilverCost)}</b></span>
                <span>Υλικά (Εργαστηρίου): <b className="text-slate-800">{formatCurrency(data.totalMaterialsCost)}</b></span>
                <span>Εργ.(Εργ): <b className="text-slate-800">{formatCurrency(data.totalInHouseLaborCost - data.totalSubcontractCost)}</b></span>
                {data.totalImportedLaborCost > 0 && (
                    <span>Εργ.(Εισ): <b className="text-slate-800">{formatCurrency(data.totalImportedLaborCost)}</b></span>
                )}
                <span>Φασόν: <b className="text-slate-800">{formatCurrency(data.totalSubcontractCost)}</b></span>
                {data.importedTotalCost && data.importedTotalCost > 0 && (
                    <span>Κόστος Εισαγόμενων: <b className="text-slate-800">{formatCurrency(data.importedTotalCost)}</b></span>
                )}
            </div>

            {/* DUAL COLUMN ITEMS GRID */}
            <div>
                {/* Header Row (Duplicated for 2 Columns) */}
                <div className="flex border-b-2 border-slate-800 pb-1 mb-1 text-[9px] font-black text-slate-500 uppercase tracking-wider">
                    <div className="flex-1 flex items-center pr-3">
                        <div className="w-5 text-center text-slate-400">#</div>
                        <div className="w-7 text-center">Εικ.</div>
                        <div className="flex-1 px-1">Περιγραφη / SKU</div>
                        <div className="w-7 text-center">Ποσ.</div>
                        <div className="w-12 text-center">Βαρος</div>
                        <div className="w-14 text-right">Συνολο</div>
                    </div>
                    <div className="flex-1 flex items-center pl-3 border-l border-slate-300">
                        <div className="w-5 text-center text-slate-400">#</div>
                        <div className="w-7 text-center">Εικ.</div>
                        <div className="flex-1 px-1">Περιγραφη / SKU</div>
                        <div className="w-7 text-center">Ποσ.</div>
                        <div className="w-12 text-center">Βαρος</div>
                        <div className="w-14 text-right">Συνολο</div>
                    </div>
                </div>

                {/* Items Grid */}
                <div className="grid grid-cols-2 text-[11px] leading-snug auto-rows-min">
                    {sortedInHouseBatches.map((batch, idx) => {
                        const totalWeight = (batch.product_details?.weight_g || 0) * batch.quantity;
                        return (
                            <div
                                key={batch.id}
                                className={`flex items-center py-1 border-b border-slate-50 break-inside-avoid${idx % 2 === 0 ? ' pr-3 border-r border-dashed border-slate-200' : ' pl-3'}`}
                            >
                                {/* Index */}
                                <div className="w-5 text-center text-slate-400 font-mono text-[9px] shrink-0">{idx + 1}</div>

                                {/* Image */}
                                <div className="w-7 shrink-0">
                                    <div className="w-5 h-5 rounded bg-slate-100 overflow-hidden border border-slate-200 mx-auto">
                                        {batch.product_details?.image_url && (
                                            <img src={batch.product_details.image_url} className="w-full h-full object-cover" />
                                        )}
                                    </div>
                                </div>

                                {/* Description */}
                                <div className="flex-1 px-1 min-w-0">
                                    <div className="flex flex-wrap items-baseline gap-0.5">
                                        <span className="font-black text-slate-800 text-[12px]">{batch.sku}{batch.variant_suffix}</span>
                                        {batch.size_info && <span className="text-[8px] font-bold bg-slate-100 px-1 rounded text-slate-600 border border-slate-200 whitespace-nowrap">{batch.size_info}</span>}
                                        {batch.cord_color && <span className="text-[8px] font-bold bg-amber-50 px-0.5 rounded text-amber-700 border border-amber-100 whitespace-nowrap">Κ: {getProductOptionColorLabel(batch.cord_color)}</span>}
                                        {batch.enamel_color && <span className="text-[8px] font-bold bg-rose-50 px-0.5 rounded text-rose-700 border border-rose-100 whitespace-nowrap">Σ: {getProductOptionColorLabel(batch.enamel_color)}</span>}
                                        {batch.product_details?.is_component && <span className="text-[7px] font-bold bg-blue-50 text-blue-600 px-1 rounded border border-blue-100">STX</span>}
                                        {batch.product_details?.production_type === ProductionType.Imported && <span className="text-[7px] font-bold bg-purple-50 text-purple-600 px-1 rounded border border-purple-100 uppercase">IMP</span>}
                                    </div>
                                    {(batch.product_details?.supplier_sku || batch.notes) && (
                                        <div className="flex flex-wrap gap-1 text-[8px]">
                                            {batch.product_details?.supplier_sku && <span className="text-slate-400 font-mono">Ref: {batch.product_details.supplier_sku}</span>}
                                            {batch.notes && <span className="text-emerald-700 font-bold italic bg-emerald-50 px-1 rounded flex items-center gap-0.5"><StickyNote size={7}/> {batch.notes}</span>}
                                        </div>
                                    )}
                                </div>

                                {/* Quantity */}
                                <div className="w-7 text-center font-black text-slate-900 text-[12px] shrink-0">{batch.quantity}</div>

                                {/* Weight */}
                                <div className="w-12 text-center font-mono text-[9px] text-slate-600 shrink-0">
                                    {formatDecimal(totalWeight, 1)}g
                                </div>

                                {/* Total */}
                                <div className="w-14 text-right font-mono font-bold text-slate-800 text-[10px] shrink-0">{formatCurrency(batch.total_cost)}</div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {importedBatches.length > 0 && (
                <div className="mt-4 border border-amber-200 rounded-xl overflow-hidden">
                    <div className="bg-amber-50 px-3 py-1 border-b border-amber-200 flex justify-between items-center">
                        <span className="text-[9px] font-black text-amber-700 uppercase tracking-widest">
                            Εισαγόμενα Είδη (Εκτός Ενδοεργαστηριακής Ανάλυσης)
                        </span>
                        {data.importedTotalCost !== undefined && (
                            <span className="text-[9px] font-mono font-bold text-amber-700">
                                Σύνολο: {formatCurrency(data.importedTotalCost)}
                            </span>
                        )}
                    </div>
                    <table className="w-full text-left text-[10px] border-collapse">
                        <thead className="bg-amber-50/60 text-amber-700">
                            <tr>
                                <th className="py-1 px-2 w-8 text-center">#</th>
                                <th className="py-1 px-2">SKU</th>
                                <th className="py-1 px-2 text-center w-12">Ποσ.</th>
                                <th className="py-1 px-2 text-right w-20">Κόστος</th>
                            </tr>
                        </thead>
                        <tbody>
                            {importedBatches.map((batch, idx) => (
                                <tr key={batch.id} className="border-t border-amber-100">
                                    <td className="py-1 px-2 text-center text-slate-400 font-mono text-[9px]">{idx + 1}</td>
                                    <td className="py-1 px-2 font-bold text-slate-800">
                                        {batch.sku}{batch.variant_suffix}
                                        <span className="ml-1 text-[8px] font-bold text-purple-600 bg-purple-50 px-1 rounded border border-purple-100 uppercase">IMP</span>
                                    </td>
                                    <td className="py-1 px-2 text-center font-mono text-[10px] text-slate-700">{batch.quantity}</td>
                                    <td className="py-1 px-2 text-right font-mono text-[10px] text-slate-800">
                                        {formatCurrency(batch.total_cost)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            <footer className="mt-4 pt-2 border-t border-slate-200 text-center">
                <p className="text-[8px] text-slate-400 uppercase tracking-widest">Ilios Kosmima ERP • Σελίδα 1</p>
            </footer>
        </div>
    );
}
