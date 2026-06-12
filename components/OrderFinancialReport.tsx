import React, { useMemo } from 'react';
import { formatCurrency, formatDecimal } from '../utils/pricingEngine';
import { APP_LOGO } from '../constants';
import { AlertTriangle, Box, Coins, Hammer, Package, Target, Truck, Wallet, Weight } from 'lucide-react';
import { formatOrderId } from '../utils/orderUtils';
import { buildSkuKey, sortBySkuKey } from '../utils/skuSort';
import { printPageMarginWithBaseTop } from '../utils/printPageStyles';

interface Props {
    stats: any;
    orderId: string;
    customerName: string;
    date: string;
    silverPrice: number;
}

function percent(value: number) {
    return `${formatDecimal(value || 0, 1)}%`;
}

function safeWidth(value: number, total: number) {
    if (!total || total <= 0) return '0%';
    return `${Math.max(4, Math.min(100, (value / total) * 100))}%`;
}

function Kpi({ label, value, helper }: { label: string; value: string; helper: string }) {
    return (
        <div className="rounded-xl border border-slate-200 bg-white p-3 text-center">
            <p className="text-[8px] font-black uppercase tracking-widest text-slate-400">{label}</p>
            <p className="mt-1 text-lg font-black text-slate-900">{value}</p>
            <p className="mt-1 text-[8px] font-semibold leading-snug text-slate-500">{helper}</p>
        </div>
    );
}

function LineTable({ title, rows, empty, backlog = false }: { title: string; rows: any[]; empty: string; backlog?: boolean }) {
    return (
        <div className="break-avoid overflow-hidden rounded-xl border border-slate-200">
            <div className={`border-b border-slate-200 px-4 py-2 ${backlog ? 'bg-indigo-50' : 'bg-emerald-50'}`}>
                <h3 className={`text-[9px] font-black uppercase tracking-widest ${backlog ? 'text-indigo-700' : 'text-emerald-700'}`}>{title}</h3>
            </div>
            {rows.length > 0 ? (
                <table className="w-full text-xs">
                    <thead>
                        <tr className="border-b border-slate-200 bg-white text-[8px] uppercase tracking-wider text-slate-400">
                            <th className="text-left">SKU</th>
                            <th className="text-center">Ποσ.</th>
                            <th className="text-right">Καθαρή αξία</th>
                            <th className="text-right">Κόστος</th>
                            <th className="text-right">Κέρδος</th>
                            <th className="text-right">Περιθώριο</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((item, index) => (
                            <tr key={`${title}-${item.sku}-${item.variantSuffix || ''}-${index}`} className="border-b border-slate-50 last:border-0">
                                <td className="py-1.5 font-bold text-slate-800">
                                    {item.sku}
                                    {item.variantSuffix && <span className="ml-1 rounded bg-slate-100 px-1 text-[9px] text-slate-500">{item.variantSuffix}</span>}
                                    {item.priceOverride && <span className="ml-1 font-black text-amber-700">*</span>}
                                </td>
                                <td className="py-1.5 text-center">{item.quantity}</td>
                                <td className="py-1.5 text-right font-mono">{formatCurrency(item.net)}</td>
                                <td className="py-1.5 text-right font-mono text-slate-500">{formatCurrency(item.estimatedCost)}</td>
                                <td className="py-1.5 text-right font-mono font-bold text-emerald-600">{formatCurrency(item.profit)}</td>
                                <td className="py-1.5 text-right font-black">{percent(item.margin)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            ) : (
                <p className="px-4 py-6 text-center text-[10px] font-semibold text-slate-400">{empty}</p>
            )}
        </div>
    );
}

export default function OrderFinancialReport({ stats, orderId, customerName, date, silverPrice }: Props) {
    const shippedRows = useMemo(
        () => sortBySkuKey(stats?.itemsBreakdown || [], (item: any) => buildSkuKey(item.sku, item.variantSuffix || item.variant)),
        [stats?.itemsBreakdown]
    );
    const backlogRows = useMemo(
        () => sortBySkuKey(stats?.backlogBreakdown || [], (item: any) => buildSkuKey(item.sku, item.variantSuffix || item.variant)),
        [stats?.backlogBreakdown]
    );

    if (!stats) return null;

    const totals = stats.totals || {};
    const realizedNet = totals.realizedNet ?? stats.totalRevenue ?? 0;
    const realizedGross = totals.realizedGross ?? realizedNet;
    const estimatedCost = totals.estimatedCost ?? stats.totalCost ?? 0;
    const estimatedProfit = totals.estimatedProfit ?? stats.totalProfit ?? 0;
    const margin = totals.margin ?? stats.avgMargin ?? 0;
    const backlogNet = totals.backlogNet ?? 0;
    const backlogGross = totals.backlogGross ?? 0;
    const bookedNet = realizedNet + backlogNet;
    const bookedGross = realizedGross + backlogGross;
    const shippedPieces = totals.shippedPieces ?? stats.totalItems ?? 0;
    const backlogPieces = totals.backlogPieces ?? 0;
    const costBreakdown = stats.costBreakdown || { silver: 0, labor: 0, materials: 0 };
    const orderWeightGrams = totals.silverWeightGrams ?? ((stats.silverSoldKg || 0) * 1000);
    const hasOverriddenPrices = [...shippedRows, ...backlogRows].some((item: any) => item.priceOverride);

    return (
        <div className="page-break-after-always relative mx-auto flex min-h-[297mm] w-[210mm] flex-col bg-white p-8 font-sans text-slate-900">
            <style>{`
                @page { size: A4; margin: 10mm 15mm; }
                ${printPageMarginWithBaseTop('10mm')}
                .break-avoid { break-inside: avoid; }
                table { border-collapse: collapse; width: 100%; }
                th, td { padding: 6px 8px; }
            `}</style>

            <div className="mb-6 flex items-end justify-between border-b-2 border-slate-900 pb-4">
                <div className="flex items-center gap-4">
                    <img src={APP_LOGO} alt="Ilios" className="h-10 w-auto object-contain" />
                    <div className="border-l-2 border-slate-200 pl-4">
                        <h1 className="text-xl font-black uppercase leading-none tracking-tight text-slate-900">Οικονομική ανάλυση παραγγελίας</h1>
                        <p className="mt-1 text-[9px] font-black uppercase tracking-widest text-slate-500">Αποσταλμένα · Εκκρεμή · Σύνολο κράτησης</p>
                    </div>
                </div>
                <div className="text-right">
                    <div className="mb-1 flex items-center justify-end gap-2">
                        <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Εντολή</span>
                        <span className="rounded bg-slate-100 px-2 font-mono text-sm font-bold">#{formatOrderId(orderId)}</span>
                    </div>
                    <div className="flex items-center justify-end gap-2">
                        <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Πελάτης</span>
                        <span className="text-sm font-bold">{customerName}</span>
                    </div>
                    <div className="mt-1 flex items-center justify-end gap-2">
                        <div className="inline-flex items-center gap-2 rounded border border-slate-100 bg-slate-50 px-1.5 py-0.5">
                            <Coins size={10} className="text-slate-400"/>
                            <span className="text-[8px] font-bold uppercase tracking-wider text-slate-500">Τιμή ασημιού</span>
                            <span className="font-mono text-[10px] font-black text-slate-900">{formatDecimal(silverPrice, 2)} €/g</span>
                        </div>
                        <div className="inline-flex items-center gap-2 rounded border border-slate-100 bg-slate-50 px-1.5 py-0.5">
                            <Weight size={10} className="text-slate-400"/>
                            <span className="text-[8px] font-bold uppercase tracking-wider text-slate-500">Βάρος</span>
                            <span className="font-mono text-[10px] font-black text-slate-900">{formatDecimal(orderWeightGrams, 1)} g</span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="mb-6 grid grid-cols-4 gap-3 break-avoid">
                <Kpi label="Πραγματοποιημένα έσοδα" value={formatCurrency(realizedNet)} helper={`${shippedPieces} τεμ. έχουν αποσταλεί, χωρίς ΦΠΑ.`} />
                <Kpi label="Εκκρεμής αξία" value={formatCurrency(backlogNet)} helper={`${backlogPieces} τεμ. μένουν για αποστολή.`} />
                <Kpi label="Μικτό κέρδος" value={formatCurrency(estimatedProfit)} helper={`Περιθώριο ${percent(margin)} στα αποσταλμένα.`} />
                <Kpi label="Σύνολο παραγγελίας" value={formatCurrency(bookedNet)} helper={`Μικτή αξία ${formatCurrency(bookedGross)}.`} />
            </div>

            <div className="mb-6 grid grid-cols-3 gap-4 break-avoid">
                <div className="rounded-xl border border-slate-200 p-3">
                    <div className="mb-2 flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-slate-500">
                        <Truck size={12} /> Απόδοση αποστολών
                    </div>
                    <p className="text-[10px] font-semibold leading-snug text-slate-600">
                        Μετρά μόνο όσα έχουν αποσταλεί ή παραδοθεί. Η ημερομηνία αναφοράς είναι η ημερομηνία αποστολής.
                    </p>
                </div>
                <div className="rounded-xl border border-slate-200 p-3">
                    <div className="mb-2 flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-slate-500">
                        <Package size={12} /> Υπόλοιπο παραγγελίας
                    </div>
                    <p className="text-[10px] font-semibold leading-snug text-slate-600">
                        Η εκκρεμής αξία δεν προστίθεται στα έσοδα μέχρι να φύγουν τα τεμάχια.
                    </p>
                </div>
                <div className="rounded-xl border border-slate-200 p-3">
                    <div className="mb-2 flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-slate-500">
                        <Target size={12} /> Βάση κόστους
                    </div>
                    <p className="text-[10px] font-semibold leading-snug text-slate-600">
                        Το κόστος είναι εκτίμηση από προϊόν, υλικά, εργασία και την καλύτερη διαθέσιμη τιμή ασημιού.
                    </p>
                </div>
            </div>

            <div className="mb-6 break-avoid">
                <div className="mb-2 flex items-end justify-between">
                    <h3 className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-slate-500">
                        <Wallet size={12}/> Δομή κόστους αποσταλμένων
                    </h3>
                    <span className="font-mono text-[9px] font-bold text-slate-400">Σύνολο: {formatCurrency(estimatedCost)}</span>
                </div>
                <div className="mb-3 flex h-6 w-full overflow-hidden rounded-lg text-center text-[9px] font-bold uppercase leading-6 text-white">
                    <div className="bg-slate-500" style={{ width: safeWidth(costBreakdown.silver, estimatedCost) }}></div>
                    <div className="bg-blue-500" style={{ width: safeWidth(costBreakdown.labor, estimatedCost) }}></div>
                    <div className="bg-purple-500" style={{ width: safeWidth(costBreakdown.materials, estimatedCost) }}></div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                    <div className="flex items-center gap-3 rounded-lg border border-slate-100 p-2">
                        <div className="rounded bg-slate-100 p-1.5 text-slate-600"><Coins size={14}/></div>
                        <div><div className="text-[8px] font-bold uppercase text-slate-400">Ασήμι</div><div className="font-mono text-xs font-bold">{formatCurrency(costBreakdown.silver)}</div></div>
                    </div>
                    <div className="flex items-center gap-3 rounded-lg border border-slate-100 p-2">
                        <div className="rounded bg-blue-50 p-1.5 text-blue-600"><Hammer size={14}/></div>
                        <div><div className="text-[8px] font-bold uppercase text-blue-400">Εργασία</div><div className="font-mono text-xs font-bold">{formatCurrency(costBreakdown.labor)}</div></div>
                    </div>
                    <div className="flex items-center gap-3 rounded-lg border border-slate-100 p-2">
                        <div className="rounded bg-purple-50 p-1.5 text-purple-600"><Box size={14}/></div>
                        <div><div className="text-[8px] font-bold uppercase text-purple-400">Υλικά</div><div className="font-mono text-xs font-bold">{formatCurrency(costBreakdown.materials)}</div></div>
                    </div>
                </div>
            </div>

            <div className="space-y-5">
                <LineTable title="Αποσταλμένη απόδοση" rows={shippedRows} empty="Δεν υπάρχουν αποστολές για αυτή την παραγγελία." />
                <LineTable title="Υπόλοιπο προς αποστολή" rows={backlogRows} empty="Δεν υπάρχει εκκρεμές υπόλοιπο για αυτή την παραγγελία." backlog />
            </div>

            {stats.costWarnings?.length > 0 && (
                <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[9px] font-semibold text-amber-800 break-avoid">
                    <div className="mb-1 flex items-center gap-1 font-black"><AlertTriangle size={11} /> Σημείωση κόστους</div>
                    {stats.costWarnings.slice(0, 4).join(' · ')}
                </div>
            )}

            {hasOverriddenPrices && (
                <div className="pt-3 text-[8px] font-bold uppercase tracking-wide text-amber-700">
                    * Γραμμή με τιμή πώλησης κατ' εξαίρεση για τη συγκεκριμένη παραγγελία.
                </div>
            )}

            <div className="mt-auto flex items-center justify-between border-t border-slate-200 pt-4 text-[8px] font-bold uppercase tracking-widest text-slate-400">
                <span>Οικονομική αναφορά παραγγελίας</span>
                <span>{date} · {new Date().toLocaleTimeString('el-GR')}</span>
            </div>
        </div>
    );
}
