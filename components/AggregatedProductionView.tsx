
import React from 'react';
import { AggregatedData } from '../types';
import { APP_LOGO } from '../constants';
import { Box, MapPin, Coins, Factory, Package, DollarSign, Weight, StickyNote } from 'lucide-react';
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

    return (
        <div className="bg-white text-slate-900 font-sans w-[210mm] min-h-[297mm] p-6 mx-auto shadow-lg print:shadow-none print:p-6 print:w-full page-break-inside-avoid break-inside-avoid">
            {/* HEADER */}
            <header className="flex justify-between items-start border-b border-slate-900 pb-4 mb-6">
                <div className="w-32">
                    <img src={APP_LOGO} alt="ILIOS" className="w-full h-auto object-contain block" />
                </div>
                <div className="text-right">
                    {data.orderId ? (
                        <>
                            <h1 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Εντολη Παραγωγησ</h1>
                            <p className="text-slate-600 font-mono font-bold text-lg mt-1">#{data.orderId}</p>
                            <p className="text-slate-600 text-sm mt-1">Πελάτης: <span className="font-bold">{data.customerName}</span></p>
                        </>
                    ) : (
                        <>
                            <h1 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Συγκεντρωτικη Εντολη Παραγωγησ</h1>
                            <p className="text-slate-600 text-xs mt-1">Ημερομηνία Εκτύπωσης: <span className="font-bold">{formatDate(new Date().toISOString())}</span></p>
                        </>
                    )}
                </div>
            </header>

            {/* SUMMARY */}
            <section className="grid grid-cols-4 gap-4 mb-6">
                <SummaryCard title="Συνολικό Κόστος" value={formatCurrency(data.totalProductionCost)} icon={<DollarSign/>} />
                <SummaryCard title="Τιμή Ασημιού" value={`${formatDecimal(settings.silver_price_gram, 3)}€/g`} icon={<Coins/>} />
                <SummaryCard title="Σύνολο Τεμαχίων" value={totalItems.toString()} icon={<Package/>} />
                <SummaryCard title="Ασήμι (g)" value={`${formatDecimal(data.totalSilverWeight, 1)}g`} icon={<Weight/>} />
            </section>

            {/* MAIN CONTENT */}
            <main className="grid grid-cols-12 gap-6 text-xs leading-normal">
                {/* RIGHT: COSTS & BATCHES (Expanded to Full Width) */}
                <div className="col-span-12 space-y-4">
                    <div className="bg-white rounded-xl border border-slate-100 p-4">
                        <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-2 pb-2 border-b border-slate-100">
                           Ανάλυση Κόστους
                        </h3>
                        <div className="space-y-2 text-sm grid grid-cols-2 gap-x-8">
                            <CostRow label="Κόστος Ασημιού" value={data.totalSilverCost} />
                            <CostRow label="Υλικά & Εξαρτήματα" value={data.totalMaterialsCost} />
                            <CostRow label="Εργατικά (Εργαστήριο)" value={data.totalInHouseLaborCost - data.totalSubcontractCost} />
                            {data.totalImportedLaborCost > 0 && <CostRow label="Εργατικά (Εισαγωγής)" value={data.totalImportedLaborCost} />}
                            <CostRow label="Φασόν" value={data.totalSubcontractCost} />
                        </div>
                        <div className="!mt-3 pt-3 border-t border-slate-200 flex justify-between items-center">
                            <span className="font-bold text-slate-800 text-base">Γενικό Σύνολο</span>
                            <span className="font-black text-lg text-slate-900">{formatCurrency(data.totalProductionCost)}</span>
                        </div>
                    </div>

                    <div className="bg-white rounded-xl border border-slate-100 p-4">
                        <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-2 pb-2 border-b border-slate-100">
                           <Factory size={16} /> Λίστα Παραγωγής ({data.batches.length})
                        </h3>
                        <table className="w-full text-left text-sm">
                            <thead className="font-bold text-slate-800 text-xs">
                                <tr className="font-bold text-slate-800 text-xs border-b border-slate-100">
                                    <th className="py-2 pr-2 w-12"></th>
                                    <th className="py-2 pr-2">SKU</th>
                                    <th className="py-2 px-2 text-center">Ποσ.</th>
                                    <th className="py-2 px-2 text-center">Βάρος (g)</th>
                                    <th className="py-2 px-2 text-right">Κόστος</th>
                                    <th className="py-2 pl-2 text-right">Σύνολο</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.batches.sort((a,b) => (a.sku+(a.variant_suffix || '')).localeCompare(b.sku+(b.variant_suffix||''))).map(batch => {
                                    const totalWeight = (batch.product_details?.weight_g || 0) * batch.quantity;
                                    return (
                                    <tr key={batch.id} className="border-t border-slate-50 break-inside-avoid">
                                        <td className="py-2 pr-2">
                                            <div className="w-10 h-10 rounded bg-slate-100 overflow-hidden border border-slate-200">
                                                {batch.product_details?.image_url && <img src={batch.product_details.image_url} className="w-full h-full object-cover" />}
                                            </div>
                                        </td>
                                        <td className="py-2 pr-2 font-mono text-slate-700">
                                            <div className="font-bold text-base flex items-center gap-1">
                                                {batch.sku}{batch.variant_suffix}
                                                {batch.size_info && <span className="text-xs bg-slate-100 text-slate-600 px-1.5 rounded border border-slate-200">{batch.size_info}</span>}
                                            </div>
                                            {batch.product_details?.supplier_sku && (
                                                <div className="text-[10px] text-slate-500 font-sans">Code: {batch.product_details.supplier_sku}</div>
                                            )}
                                            {batch.notes && (
                                                <div className="text-[11px] text-emerald-800 font-black italic flex items-center gap-1 mt-1">
                                                    <StickyNote size={10}/> {batch.notes}
                                                </div>
                                            )}
                                        </td>
                                        <td className="py-2 px-2 text-center font-bold text-slate-900 text-base">{batch.quantity}</td>
                                        <td className="py-2 px-2 text-center text-slate-700 font-mono">
                                            <span className="font-bold">{formatDecimal(totalWeight, 1)}</span>
                                            <span className="text-[9px] block text-slate-500">({formatDecimal(batch.product_details?.weight_g)}/τ)</span>
                                        </td>
                                        <td className="py-2 px-2 text-right font-mono text-slate-600">{formatCurrency(batch.cost_per_piece)}</td>
                                        <td className="py-2 pl-2 text-right font-mono font-bold text-slate-800">{formatCurrency(batch.total_cost)}</td>
                                    </tr>
                                )})}
                            </tbody>
                        </table>
                    </div>
                </div>
            </main>

            <footer className="mt-8 pt-4 border-t border-slate-200 text-center">
                <p className="text-xs text-slate-500">Συγκεντρωτική Εντολή Παραγωγής - Ilios Kosmima ERP</p>
            </footer>
        </div>
    );
}

const SummaryCard: React.FC<{ title: string; value: string | number; icon: React.ReactNode; }> = ({ title, value, icon }) => {
    const classes = {
      bg: 'bg-slate-50',
      border: 'border-slate-100',
      iconBg: 'bg-slate-100',
      iconText: 'text-slate-600',
      titleText: 'text-slate-700',
      valueText: 'text-slate-800',
    };

    return (
        <div className={`rounded-lg p-3 text-left flex items-center gap-3 ${classes.bg} ${classes.border}`}>
            <div className={`p-2 rounded-md ${classes.iconBg} ${classes.iconText}`}>{icon}</div>
            <div>
                <p className={`text-xs font-bold uppercase tracking-wider ${classes.titleText}`}>{title}</p>
                <p className={`text-2xl font-black ${classes.valueText}`}>{value}</p>
            </div>
        </div>
    );
};

const CostRow = ({ label, value }: { label: string, value: number }) => (
    <div className="flex justify-between items-center text-slate-600 py-1">
        <span className="font-medium">{label}</span>
        <span className="font-mono font-bold text-slate-800">{formatCurrency(value)}</span>
    </div>
);
