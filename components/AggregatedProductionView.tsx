import React from 'react';
// @FIX: Corrected import path for AggregatedData
import { AggregatedData } from '../App';
// @FIX: Corrected import path for APP_LOGO
import { APP_LOGO } from '../constants';
// @FIX: Removed GlobalSettings from lucide-react import
import { Box, MapPin, Coins, Factory, Package, DollarSign, Weight } from 'lucide-react';
// @FIX: Corrected import path for formatCurrency and formatDecimal
import { formatCurrency, formatDecimal } from '../utils/pricingEngine';
// @FIX: Imported GlobalSettings from the correct types file
import { GlobalSettings } from '../types';

interface Props {
    data: AggregatedData;
    settings: GlobalSettings;
}

export default function AggregatedProductionView({ data, settings }: Props) {
    const sortedMolds = Array.from(data.molds.values()).sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
    const sortedMaterials = Array.from(data.materials.values()).sort((a, b) => a.name.localeCompare(b.name));
    const sortedComponents = Array.from(data.components.values()).sort((a, b) => a.sku.localeCompare(b.sku, undefined, { numeric: true }));
    
    const totalItems = data.batches.reduce((sum, b) => sum + b.quantity, 0);

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString('el-GR', {
            day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
        });
    };

    return (
        <div className="bg-white text-slate-900 font-sans w-[210mm] min-h-[297mm] p-8 mx-auto shadow-lg print:shadow-none print:p-10 page-break-inside-avoid break-inside-avoid">
            {/* HEADER */}
            <header className="flex justify-between items-start border-b border-slate-200 pb-4 mb-6">
                <div>
                    <img src={APP_LOGO} alt="ILIOS" className="w-24 object-contain" />
                </div>
                <div className="text-right">
                    {data.orderId ? (
                        <>
                            <h1 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Εντολη Παραγωγησ</h1>
                            <p className="text-slate-500 font-mono font-bold text-lg mt-1">#{data.orderId}</p>
                            <p className="text-slate-500 text-sm mt-1">Πελάτης: <span className="font-bold">{data.customerName}</span></p>
                        </>
                    ) : (
                        <>
                            <h1 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Συγκεντρωτικη Εντολη Παραγωγησ</h1>
                            <p className="text-slate-500 text-xs mt-1">Ημερομηνία Εκτύπωσης: <span className="font-bold">{formatDate(new Date().toISOString())}</span></p>
                        </>
                    )}
                </div>
            </header>

            {/* SUMMARY */}
            <section className="grid grid-cols-4 gap-4 mb-6">
                <SummaryCard title="Συνολικό Κόστος" value={formatCurrency(data.totalProductionCost)} icon={<DollarSign/>} color="emerald"/>
                <SummaryCard title="Τιμή Ασημιού" value={`${formatDecimal(settings.silver_price_gram, 3)}€/g`} icon={<Coins/>} color="blue"/>
                <SummaryCard title="Σύνολο Τεμαχίων" value={totalItems.toString()} icon={<Package/>} color="slate" />
                <SummaryCard title="Ασήμι (g)" value={`${formatDecimal(data.totalSilverWeight, 1)}g`} icon={<Weight/>} color="amber" />
            </section>

            {/* MAIN CONTENT */}
            <main className="grid grid-cols-12 gap-6 text-xs leading-normal">
                {/* LEFT: RESOURCES */}
                <div className="col-span-5 space-y-4">
                    <ResourceList title="Λάστιχα" data={sortedMolds} icon={<MapPin />} renderItem={item => <><span className="font-bold">{item.code}</span> - {item.location} ({item.description})</>}/>
                    <ResourceList title="Υλικά" data={sortedMaterials} icon={<Coins />} renderItem={item => `${item.name} (${item.totalQuantity.toFixed(0)} ${item.unit}) - ${formatCurrency(item.totalCost)}`}/>
                    <ResourceList title="Εξαρτήματα" data={sortedComponents} icon={<Box />} renderItem={item => `${item.sku} (${item.totalQuantity} τεμ) - ${formatCurrency(item.totalCost)}`}/>
                </div>

                {/* RIGHT: COSTS & BATCHES */}
                <div className="col-span-7 space-y-4">
                    <div className="bg-white rounded-xl border border-slate-100 p-4">
                        <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-2 pb-2 border-b border-slate-100">
                           Ανάλυση Κόστους
                        </h3>
                        <div className="space-y-2 text-sm">
                            <CostRow label="Κόστος Ασημιού" value={data.totalSilverCost} />
                            <CostRow label="Υλικά & Εξαρτήματα" value={data.totalMaterialsCost} />
                            <CostRow label="Εργατικά (Εργαστήριο)" value={data.totalInHouseLaborCost - data.totalSubcontractCost} />
                            {data.totalImportedLaborCost > 0 && <CostRow label="Εργατικά (Εισαγωγής)" value={data.totalImportedLaborCost} />}
                            <CostRow label="Φασόν" value={data.totalSubcontractCost} />
                            <div className="!mt-3 pt-3 border-t border-slate-200 flex justify-between items-center">
                                <span className="font-bold text-slate-800 text-base">Γενικό Σύνολο</span>
                                <span className="font-black text-lg text-emerald-700">{formatCurrency(data.totalProductionCost)}</span>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-xl border border-slate-100 p-4">
                        <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-2 pb-2 border-b border-slate-100">
                           <Factory size={16} /> Λίστα Παραγωγής ({data.batches.length})
                        </h3>
                        <table className="w-full text-left text-sm">
                            <thead>
                                <tr className="font-bold text-slate-400 text-xs">
                                    <th className="py-1 pr-2 w-12"></th>
                                    <th className="py-1 pr-2">SKU</th>
                                    <th className="py-1 px-2 text-center">Ποσότητα</th>
                                    <th className="py-1 px-2 text-right">Κόστος/τεμ</th>
                                    <th className="py-1 pl-2 text-right">Σύνολο</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.batches.sort((a,b) => (a.sku+(a.variant_suffix || '')).localeCompare(b.sku+(b.variant_suffix||''))).map(batch => (
                                    <tr key={batch.id} className="border-t border-slate-100">
                                        <td className="py-1.5 pr-2">
                                            <div className="w-12 h-12 rounded bg-slate-100 overflow-hidden border border-slate-200">
                                                {batch.product_image && <img src={batch.product_image} className="w-full h-full object-cover" />}
                                            </div>
                                        </td>
                                        <td className="py-1.5 pr-2 font-mono text-slate-700">
                                            <div className="font-bold text-base">{batch.sku}{batch.variant_suffix}</div>
                                            {batch.notes && <div className="text-xs text-blue-600 font-sans break-all">Σημ: {batch.notes}</div>}
                                        </td>
                                        <td className="py-1.5 px-2 text-center font-bold text-slate-900 text-base">{batch.quantity}</td>
                                        <td className="py-1.5 px-2 text-right font-mono text-slate-500">{formatCurrency(batch.cost_per_piece)}</td>
                                        <td className="py-1.5 pl-2 text-right font-mono font-bold text-slate-800">{formatCurrency(batch.total_cost)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </main>

            <footer className="mt-8 pt-4 border-t border-slate-200 text-center">
                <p className="text-xs text-slate-400">Συγκεντρωτική Εντολή Παραγωγής - Ilios Kosmima ERP</p>
            </footer>
        </div>
    );
}

// @FIX: Converted dynamic Tailwind classes to a static map to ensure compatibility with PurgeCSS in production builds.
const colorClasses = {
    emerald: {
      bg: 'bg-emerald-50',
      border: 'border-emerald-100',
      iconBg: 'bg-emerald-100',
      iconText: 'text-emerald-600',
      titleText: 'text-emerald-800/60',
      valueText: 'text-emerald-800',
    },
    blue: {
      bg: 'bg-blue-50',
      border: 'border-blue-100',
      iconBg: 'bg-blue-100',
      iconText: 'text-blue-600',
      titleText: 'text-blue-800/60',
      valueText: 'text-blue-800',
    },
    slate: {
      bg: 'bg-slate-50',
      border: 'border-slate-100',
      iconBg: 'bg-slate-100',
      iconText: 'text-slate-600',
      titleText: 'text-slate-800/60',
      valueText: 'text-slate-800',
    },
    amber: {
      bg: 'bg-amber-50',
      border: 'border-amber-100',
      iconBg: 'bg-amber-100',
      iconText: 'text-amber-600',
      titleText: 'text-amber-800/60',
      valueText: 'text-amber-800',
    }
};

const SummaryCard: React.FC<{ title: string; value: string | number; icon: React.ReactNode; color: keyof typeof colorClasses }> = ({ title, value, icon, color }) => {
    const classes = colorClasses[color] || colorClasses.slate;

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


const ResourceList = ({ title, data, icon, renderItem }: { title: string, data: any[], icon: React.ReactNode, renderItem: (item: any) => React.ReactNode }) => (
    <div className="bg-white rounded-xl border border-slate-100 p-4 break-inside-avoid">
        <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-2 pb-2 border-b border-slate-100">
            {icon} {title} ({data.length})
        </h3>
        {data.length > 0 ? (
            <ul className="space-y-1.5">
                {data.map((item, index) => (
                    <li key={index} className="flex items-start text-xs">
                        <span className="text-slate-400 mr-1.5 w-4 text-right">■</span>
                        <span className="flex-1 text-slate-700">{renderItem(item)}</span>
                    </li>
                ))}
            </ul>
        ) : <p className="text-center text-slate-400 text-xs italic py-2">Δεν απαιτούνται.</p>}
    </div>
);

const CostRow = ({ label, value }: { label: string, value: number }) => (
    <div className="flex justify-between items-center text-slate-600">
        <span className="font-medium">{label}</span>
        <span className="font-mono font-bold text-slate-800">{formatCurrency(value)}</span>
    </div>
);
