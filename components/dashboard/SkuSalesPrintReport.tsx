import React from 'react';
import { Award, Filter } from 'lucide-react';
import { formatCurrency } from '../../utils/pricingEngine';
import { APP_LOGO } from '../../constants';
import { printPageMarginWithBaseTop } from '../../utils/printPageStyles';
import type { SkuSalesPrintData } from '../../features/dashboard/skuSalesPrint';

function Kpi({ label, value, helper }: { label: string; value: string; helper: string }) {
    return (
        <div className="rounded-xl border border-slate-200 bg-white p-3">
            <p className="text-[8px] font-black uppercase tracking-widest text-slate-400">{label}</p>
            <p className="mt-1 text-lg font-black text-slate-900">{value}</p>
            <p className="mt-1 text-[8px] font-semibold leading-snug text-slate-500">{helper}</p>
        </div>
    );
}

export default function SkuSalesPrintReport({ data }: { data: SkuSalesPrintData | null }) {
    if (!data) return null;
    const isDesigns = data.view === 'designs';

    return (
        <div className="page-break-after-always relative mx-auto min-h-[297mm] w-[210mm] bg-white p-8 font-sans text-slate-900">
            <style>{`
                @page { size: A4; margin: 10mm 15mm; }
                ${printPageMarginWithBaseTop('10mm')}
                .break-avoid { break-inside: avoid; }
                table { border-collapse: collapse; width: 100%; }
            `}</style>

            <div className="mb-5 flex items-end justify-between border-b-2 border-slate-900 pb-3">
                <div className="flex items-center gap-4">
                    <img src={APP_LOGO} alt="Ilios" className="h-10 w-auto object-contain" />
                    <div className="border-l-2 border-slate-200 pl-3">
                        <h1 className="text-xl font-black uppercase leading-none tracking-tight text-slate-900">
                            {data.title}
                        </h1>
                        <p className="mt-1 text-[9px] font-black uppercase tracking-widest text-slate-500">
                            Περίοδος: {data.periodLabel}
                        </p>
                    </div>
                </div>
                <div className="text-right">
                    <p className="text-[8px] font-black uppercase tracking-widest text-slate-400">Ημερομηνία</p>
                    <p className="text-sm font-black">{new Date().toLocaleDateString('el-GR')}</p>
                </div>
            </div>

            <div className="mb-4 flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 break-avoid">
                <Filter size={11} className="mt-0.5 text-slate-400" />
                <div>
                    <p className="text-[8px] font-black uppercase tracking-widest text-slate-400">Φίλτρα · Ταξινόμηση {data.sortLabel}</p>
                    <p className="mt-0.5 text-[10px] font-semibold text-slate-600">{data.filterSummary}</p>
                </div>
            </div>

            <div className="mb-5 grid grid-cols-4 gap-3 break-avoid">
                <Kpi label="Τεμάχια" value={String(data.kpis.quantity)} helper="Σύνολο τεμαχίων στην τρέχουσα προβολή." />
                <Kpi label="Έσοδα" value={formatCurrency(data.kpis.revenue)} helper="Καθαρή αξία αποστολών, χωρίς ΦΠΑ." />
                <Kpi label="Κέρδος" value={formatCurrency(data.kpis.profit)} helper="Έσοδα μείον εκτιμώμενο κόστος." />
                <Kpi
                    label={isDesigns ? 'Παραστάσεις' : 'Κωδικοί'}
                    value={String(data.kpis.skuCount)}
                    helper={isDesigns ? 'Διακριτές παραστάσεις στην προβολή.' : 'Διακριτές παραλλαγές στην προβολή.'}
                />
            </div>

            <div className="overflow-hidden rounded-xl border border-slate-200">
                <div className="flex items-center gap-1 border-b border-slate-200 bg-slate-50 px-3 py-2">
                    <Award size={11} />
                    <h3 className="text-[9px] font-black uppercase tracking-widest text-slate-600">
                        {isDesigns ? 'Κατάταξη παραστάσεων' : 'Κατάταξη SKU'}
                    </h3>
                </div>
                {data.rows.length > 0 ? (
                    <table className="w-full text-[10px]">
                        <thead>
                            <tr className="border-b border-slate-200 bg-white text-[8px] uppercase tracking-wider text-slate-400">
                                <th className="w-7 px-2 py-1.5 text-center">#</th>
                                <th className="px-2 py-1.5 text-left">{isDesigns ? 'Παράσταση' : 'SKU'}</th>
                                <th className="px-2 py-1.5 text-right">Τεμ.</th>
                                <th className="px-2 py-1.5 text-right">Έσοδα</th>
                                <th className="px-3 py-1.5 text-right">Κέρδος</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.rows.map((row) => (
                                <tr key={`${row.rank}-${row.sku}-${row.variantSuffix}`} className="border-b border-slate-50 last:border-0">
                                    <td className="px-2 py-1.5 text-center font-black text-slate-400">{row.rank}</td>
                                    <td className="px-2 py-1.5 font-bold text-slate-800">
                                        {isDesigns ? (
                                            <span>{row.sku} · {row.name}</span>
                                        ) : (
                                            <span>{row.sku}{row.variantSuffix ? ` ${row.variantSuffix}` : ''}</span>
                                        )}
                                    </td>
                                    <td className="px-2 py-1.5 text-right text-slate-500">{row.quantity} τεμ.</td>
                                    <td className="px-2 py-1.5 text-right font-mono font-black text-slate-900">{formatCurrency(row.revenue)}</td>
                                    <td className="px-3 py-1.5 text-right font-mono font-black text-slate-900">{formatCurrency(row.profit)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                ) : (
                    <p className="px-3 py-6 text-center text-[10px] font-semibold text-slate-400">
                        Δεν υπάρχουν γραμμές για εκτύπωση με τα τρέχοντα φίλτρα.
                    </p>
                )}
            </div>

            <div className="mt-auto border-t border-slate-200 pt-3 text-[8px] font-bold uppercase tracking-widest text-slate-400">
                Η αναφορά ακολουθεί την προβολή στην οθόνη: περίοδο, φίλτρα, ταξινόμηση και {isDesigns ? 'παραστάσεις' : 'κωδικούς'}.
            </div>
        </div>
    );
}
