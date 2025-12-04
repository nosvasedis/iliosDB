

import React from 'react';
import { ProductionBatch } from '../types';
import { APP_LOGO } from '../constants';
import { Box, MapPin, Coins, Factory } from 'lucide-react';

interface AggregatedData {
  molds: Map<string, { code: string; location: string; description: string; usedIn: Set<string> }>;
  materials: Map<string, { name: string; unit: string; totalQuantity: number; usedIn: Map<string, number> }>;
  components: Map<string, { sku: string; totalQuantity: number; usedIn: Map<string, number> }>;
  totalSilver: number;
  batches: ProductionBatch[];
}

interface Props {
    data: AggregatedData;
}

export default function AggregatedProductionView({ data }: Props) {
    const sortedMolds = Array.from(data.molds.values()).sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
    const sortedMaterials = Array.from(data.materials.entries()).sort((a, b) => a[1].name.localeCompare(b[1].name));
    const sortedComponents = Array.from(data.components.values()).sort((a, b) => a.sku.localeCompare(b.sku, undefined, { numeric: true }));
    const uniqueSkus = new Set(data.batches.map(b => b.sku + (b.variant_suffix || '')));

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString('el-GR', {
            day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
        });
    };

    return (
        <div className="w-full bg-white text-slate-900 p-8 font-sans text-xs leading-normal h-full flex flex-col page-break-inside-avoid break-inside-avoid">
            {/* HEADER */}
            <header className="flex justify-between items-start border-b border-slate-200 pb-4 mb-6">
                <div>
                    <img src={APP_LOGO} alt="ILIOS" className="w-24 object-contain" />
                </div>
                <div className="text-right">
                    <h1 className="text-xl font-black text-slate-800 uppercase tracking-tight">Συγκεντρωτικη Εντολη Παραγωγησ</h1>
                    <p className="text-slate-500 text-xs mt-1">Ημερομηνία Εκτύπωσης: <span className="font-bold">{formatDate(new Date().toISOString())}</span></p>
                </div>
            </header>

            {/* SUMMARY */}
            <section className="grid grid-cols-4 gap-4 mb-6">
                <SummaryCard title="Σύνολο Παρτίδων" value={data.batches.length} />
                <SummaryCard title="Μοναδικοί Κωδικοί" value={uniqueSkus.size} />
                <SummaryCard title="Σύνολο Τεμαχίων" value={data.batches.reduce((sum, b) => sum + b.quantity, 0)} />
                <SummaryCard title="Ασήμι (g)" value={data.totalSilver.toFixed(2).replace('.', ',')} />
            </section>

            {/* MAIN CONTENT */}
            <main className="flex-1 grid grid-cols-2 gap-6">
                <div className="space-y-6">
                    {/* MOLDS */}
                    <div className="bg-white rounded-xl border border-slate-100 p-4 break-inside-avoid">
                        <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-2 pb-2 border-b border-slate-100">
                            <MapPin size={16} className="text-amber-500" /> Λάστιχα ({sortedMolds.length})
                        </h3>
                        {sortedMolds.length > 0 ? (
                            <table className="w-full text-left text-[10px]">
                                <thead className="font-bold text-slate-400">
                                    <tr>
                                        <th className="py-1 pr-2 w-1/4">Κωδ.</th>
                                        <th className="py-1 px-2 w-1/4">Τοποθεσία</th>
                                        <th className="py-1 pl-2 w-1/2">Περιγραφή</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {sortedMolds.map(mold => (
                                        <tr key={mold.code} className="border-t border-slate-100">
                                            <td className="py-1.5 pr-2 font-mono font-bold text-slate-700">{mold.code}</td>
                                            <td className="py-1.5 px-2 text-slate-600 font-medium">{mold.location}</td>
                                            <td className="py-1.5 pl-2 text-slate-500">{mold.description}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        ) : <p className="text-center text-slate-400 text-xs italic py-4">Δεν απαιτούνται λάστιχα.</p>}
                    </div>

                    {/* BATCH CHECKLIST */}
                     <div className="bg-white rounded-xl border border-slate-100 p-4 break-inside-avoid">
                        <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-2 pb-2 border-b border-slate-100">
                            <Factory size={16} className="text-slate-500" /> Λίστα Παραγωγής
                        </h3>
                         <table className="w-full text-left text-[10px]">
                            <thead className="font-bold text-slate-400">
                                <tr>
                                    <th className="py-1 pr-2">SKU</th>
                                    <th className="py-1 px-2">Στάδιο</th>
                                    <th className="py-1 pl-2 text-right">Ποσότητα</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.batches.sort((a,b) => (a.sku+a.variant_suffix).localeCompare(b.sku+b.variant_suffix)).map(batch => (
                                    <tr key={batch.id} className="border-t border-slate-100">
                                        <td className="py-1.5 pr-2 font-mono font-bold text-slate-700">{batch.sku}{batch.variant_suffix}</td>
                                        <td className="py-1.5 px-2 text-slate-500">{batch.current_stage}</td>
                                        <td className="py-1.5 pl-2 text-right font-bold text-slate-900">{batch.quantity}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* MATERIALS & COMPONENTS */}
                <div className="bg-white rounded-xl border border-slate-100 p-4 break-inside-avoid">
                    <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-2 pb-2 border-b border-slate-100">
                        <Box size={16} className="text-purple-500" /> Υλικά & Εξαρτήματα
                    </h3>
                    <table className="w-full text-left text-[10px]">
                        <thead className="font-bold text-slate-400">
                            <tr>
                                <th className="py-1 pr-2">Περιγραφή</th>
                                <th className="py-1 pl-2 text-right">Σύνολο</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr className="border-t border-slate-100 font-bold">
                                <td className="py-1.5 pr-2 text-slate-600 flex items-center gap-1.5"><Coins size={10} /> Ασήμι 925 (Βάση)</td>
                                <td className="py-1.5 pl-2 text-right text-slate-800">{data.totalSilver.toFixed(2).replace('.', ',')} g</td>
                            </tr>
                            {sortedMaterials.map(([id, mat]) => (
                                <tr key={id} className="border-t border-slate-100">
                                    <td className="py-1.5 pr-2 text-slate-600">{mat.name}</td>
                                    <td className="py-1.5 pl-2 text-right font-bold text-slate-800">{mat.totalQuantity.toFixed(0)} {mat.unit}</td>
                                </tr>
                            ))}
                            {sortedComponents.map(comp => (
                                <tr key={comp.sku} className="border-t border-slate-100">
                                    <td className="py-1.5 pr-2 text-slate-600">Εξάρτημα: <span className="font-mono font-medium text-slate-800">{comp.sku}</span></td>
                                    <td className="py-1.5 pl-2 text-right font-bold text-slate-800">{comp.totalQuantity} τεμ</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </main>

            <footer className="mt-8 pt-4 border-t border-slate-200 text-center">
                <p className="text-[9px] text-slate-400">Συγκεντρωτική Εντολή Παραγωγής - Ilios Kosmima ERP</p>
            </footer>
        </div>
    );
}

const SummaryCard: React.FC<{ title: string; value: string | number }> = ({ title, value }) => (
    <div className="bg-slate-50 rounded-lg p-3 text-center border border-slate-100">
        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">{title}</p>
        <p className="text-xl font-black text-slate-800">{value}</p>
    </div>
);
