import React, { useMemo } from 'react';
import { formatCurrency, formatDecimal } from '../utils/pricingEngine';
import { APP_LOGO } from '../constants';
import { Award, Boxes, FileText, UserCheck, Users, Wallet } from 'lucide-react';
import { buildSkuKey, sortBySkuKey } from '../utils/skuSort';
import { printPageMarginWithBaseTop } from '../utils/printPageStyles';
import SpecialCreationNote from './SpecialCreationNote';

interface Props {
    stats: any;
    title?: string;
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
        <div className="rounded-xl border border-slate-200 bg-white p-3">
            <p className="text-[8px] font-black uppercase tracking-widest text-slate-400">{label}</p>
            <p className="mt-1 text-lg font-black text-slate-900">{value}</p>
            <p className="mt-1 text-[8px] font-semibold leading-snug text-slate-500">{helper}</p>
        </div>
    );
}

function RankingTable({
    title,
    icon,
    rows,
    empty,
    nameKey = 'name',
}: {
    title: string;
    icon: React.ReactNode;
    rows: any[];
    empty: string;
    nameKey?: string;
}) {
    return (
        <div className="break-avoid overflow-hidden rounded-xl border border-slate-200">
            <div className="flex items-center gap-1 border-b border-slate-200 bg-slate-50 px-3 py-2">
                {icon}
                <h3 className="text-[9px] font-black uppercase tracking-widest text-slate-600">{title}</h3>
            </div>
            {rows.length > 0 ? (
                <table className="w-full text-[10px]">
                    <tbody>
                        {rows.map((row, index) => (
                            <tr key={`${title}-${row.id ?? row.sku ?? row[nameKey]}-${index}`} className="border-b border-slate-50 last:border-0">
                                <td className="w-7 px-3 py-1.5 text-center font-black text-slate-400">{index + 1}</td>
                                <td className="max-w-[110px] px-2 py-1.5 font-bold text-slate-800">
                                    {row.sku || row[nameKey]}
                                    <SpecialCreationNote sku={row.sku} note={row.itemNote} compact className="mt-0.5" />
                                </td>
                                <td className="px-2 py-1.5 text-right text-slate-500">{row.quantity != null ? `${row.quantity} τεμ.` : row.orders != null ? `${row.orders} παρ.` : ''}</td>
                                <td className="px-3 py-1.5 text-right font-mono font-black text-slate-900">{formatCurrency(row.revenue)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            ) : (
                <p className="px-3 py-6 text-center text-[10px] font-semibold text-slate-400">{empty}</p>
            )}
        </div>
    );
}

export default function AnalyticsPrintReport({ stats, title }: Props) {
    const sortedItemsBreakdown = useMemo(
        () => sortBySkuKey(stats?.itemsBreakdown || [], (item: any) => buildSkuKey(item.sku, item.variantSuffix || item.variant)),
        [stats?.itemsBreakdown]
    );

    if (!stats) return null;

    const totals = stats.totals || {
        realizedNet: stats.totalRevenue || 0,
        realizedGross: stats.totalRevenue || 0,
        estimatedCost: stats.totalCost || 0,
        estimatedProfit: stats.totalProfit || 0,
        margin: stats.avgMargin || 0,
        backlogNet: 0,
        discount: 0,
        vat: 0,
        shippedPieces: stats.totalItems || 0,
        realizedOrderCount: stats.orderCount || 0,
    };
    const costBreakdown = stats.costBreakdown || { silver: 0, labor: 0, materials: 0 };
    const legal = stats.legal || { issuedNet: 0, issuedVat: 0, issuedGross: 0, issuedCount: 0, netGap: totals.realizedNet };
    const periodLabel = stats.period?.label || 'Όλες οι περίοδοι';
    return (
        <div className="page-break-after-always relative mx-auto min-h-[297mm] w-[210mm] bg-white p-8 font-sans text-slate-900">
            <style>{`
                @page { size: A4; margin: 10mm 15mm; }
                ${printPageMarginWithBaseTop('10mm')}
                .break-avoid { break-inside: avoid; }
                table { border-collapse: collapse; width: 100%; }
                th, td { padding: 4px 8px; }
            `}</style>

            <div className="mb-5 flex items-end justify-between border-b-2 border-slate-900 pb-3">
                <div className="flex items-center gap-4">
                    <img src={APP_LOGO} alt="Ilios" className="h-10 w-auto object-contain" />
                    <div className="border-l-2 border-slate-200 pl-3">
                        <h1 className="text-xl font-black uppercase leading-none tracking-tight text-slate-900">{title || 'Οικονομική αναφορά'}</h1>
                        <p className="mt-1 text-[9px] font-black uppercase tracking-widest text-slate-500">Περίοδος: {periodLabel}</p>
                    </div>
                </div>
                <div className="text-right">
                    <p className="text-[8px] font-black uppercase tracking-widest text-slate-400">Ημερομηνία</p>
                    <p className="text-sm font-black">{new Date().toLocaleDateString('el-GR')}</p>
                </div>
            </div>

            <div className="mb-5 grid grid-cols-4 gap-3 break-avoid">
                <Kpi label="Πραγματοποιημένα έσοδα" value={formatCurrency(totals.realizedNet)} helper="Αποσταλμένη καθαρή αξία, μετά την έκπτωση και χωρίς ΦΠΑ." />
                <Kpi label="Εκκρεμής αξία" value={formatCurrency(totals.backlogNet)} helper="Αξία τεμαχίων που δεν έχουν αποσταλεί. Δεν είναι έσοδο." />
                <Kpi label="Μικτό κέρδος" value={formatCurrency(totals.estimatedProfit)} helper={`Περιθώριο ${percent(totals.margin)} με εκτιμώμενο κόστος.`} />
                <Kpi label="Συμφωνία παραστατικών" value={formatCurrency(legal.netGap)} helper={`${legal.issuedCount} εκδομένα παραστατικά στην περίοδο.`} />
            </div>

            <div className="mb-5 rounded-xl border border-slate-200 bg-slate-50 p-3 break-avoid">
                <h3 className="mb-2 flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-slate-600">
                    <FileText size={11} /> Ορισμοί μετρικών
                </h3>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[9px] font-semibold leading-snug text-slate-600">
                    <p><b>Πραγματοποιημένα έσοδα:</b> όσα έχουν αποσταλεί ή παραδοθεί.</p>
                    <p><b>Εκκρεμής αξία:</b> όσα μένουν σε ανοιχτές παραγγελίες.</p>
                    <p><b>Έκπτωση:</b> αφαιρείται πριν τον υπολογισμό ΦΠΑ.</p>
                    <p><b>Εκτιμώμενο κόστος:</b> προϊόν, υλικά, εργασία και διαθέσιμη τιμή ασημιού.</p>
                </div>
            </div>

            <div className="mb-5 grid grid-cols-4 gap-3 break-avoid">
                <Kpi label="Εκτιμώμενο κόστος" value={formatCurrency(totals.estimatedCost)} helper="Κόστος για αποσταλμένα τεμάχια." />
                <Kpi label="Έκπτωση" value={formatCurrency(totals.discount)} helper="Σύνολο εκπτώσεων στην περίοδο." />
                <Kpi label="ΦΠΑ" value={formatCurrency(totals.vat)} helper={`Μικτή αξία ${formatCurrency(totals.realizedGross)}.`} />
                <Kpi label="Τεμάχια" value={String(totals.shippedPieces)} helper={`${totals.realizedOrderCount} παραγγελίες με αποστολή.`} />
            </div>

            <div className="mb-5 break-avoid">
                <h3 className="mb-2 flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-slate-500">
                    <Wallet size={12}/> Ανάλυση κόστους
                </h3>
                <div className="mb-2 flex h-7 w-full overflow-hidden rounded-lg border border-slate-200 text-center text-[9px] font-black uppercase leading-7 text-white">
                    <div className="bg-slate-500" style={{ width: safeWidth(costBreakdown.silver, totals.estimatedCost) }}>Ασήμι</div>
                    <div className="bg-blue-500" style={{ width: safeWidth(costBreakdown.labor, totals.estimatedCost) }}>Εργασία</div>
                    <div className="bg-purple-500" style={{ width: safeWidth(costBreakdown.materials, totals.estimatedCost) }}>Υλικά</div>
                </div>
                <div className="flex justify-between text-[10px] font-mono text-slate-600">
                    <span>Ασήμι: <b>{formatCurrency(costBreakdown.silver)}</b></span>
                    <span>Εργασία: <b>{formatCurrency(costBreakdown.labor)}</b></span>
                    <span>Υλικά: <b>{formatCurrency(costBreakdown.materials)}</b></span>
                </div>
            </div>

            {stats.isSingleOrder ? (
                <div className="mb-5 overflow-hidden rounded-xl border border-slate-200 break-avoid">
                    <div className="border-b border-slate-200 bg-slate-50 px-3 py-2">
                        <h3 className="text-[9px] font-black uppercase tracking-widest text-slate-600">Αποσταλμένα είδη</h3>
                    </div>
                    <table className="w-full text-xs">
                        <thead>
                            <tr className="border-b border-slate-200 bg-white text-[8px] uppercase tracking-wider text-slate-400">
                                <th className="text-left">SKU</th>
                                <th className="text-center">Ποσ.</th>
                                <th className="text-right">Έσοδα</th>
                                <th className="text-right">Κόστος</th>
                                <th className="text-right">Κέρδος</th>
                                <th className="text-right">Περιθώριο</th>
                            </tr>
                        </thead>
                        <tbody>
                            {sortedItemsBreakdown.map((item: any, index: number) => (
                                <tr key={`${item.sku}-${index}`} className="border-b border-slate-50 last:border-0">
                                    <td className="py-1.5 font-bold text-slate-800">{item.sku}{item.variantSuffix && <span className="ml-1 rounded bg-slate-100 px-1 text-[9px] text-slate-500">{item.variantSuffix}</span>}<SpecialCreationNote sku={item.sku} note={item.itemNote} compact className="mt-0.5" /></td>
                                    <td className="py-1.5 text-center">{item.quantity}</td>
                                    <td className="py-1.5 text-right font-mono">{formatCurrency(item.net ?? item.revenue)}</td>
                                    <td className="py-1.5 text-right font-mono text-slate-500">{formatCurrency(item.estimatedCost ?? item.cost)}</td>
                                    <td className="py-1.5 text-right font-mono font-bold text-emerald-600">{formatCurrency(item.profit)}</td>
                                    <td className="py-1.5 text-right font-black">{percent(item.margin)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : (
                <>
                    <div className="mb-5 grid grid-cols-2 gap-4">
                        <RankingTable title="Πιο δυνατά προϊόντα" icon={<Award size={11} />} rows={(stats.topProducts || []).slice(0, 10)} empty="Δεν υπάρχουν αποστολές προϊόντων για την περίοδο." />
                        <RankingTable title="Συλλογές που ξεχώρισαν" icon={<Boxes size={11} />} rows={(stats.topCollections || []).slice(0, 10)} empty="Δεν υπάρχουν αποστολές συλλογών για την περίοδο." />
                    </div>
                    <div className="mb-5 grid grid-cols-2 gap-4">
                        <RankingTable title="Πλασιέ" icon={<UserCheck size={11} />} rows={(stats.topSellers || []).slice(0, 10)} empty="Δεν υπάρχουν έσοδα πλασιέ για την περίοδο." />
                        <RankingTable title="Πελάτες" icon={<Users size={11} />} rows={(stats.topCustomers || []).slice(0, 10)} empty="Δεν υπάρχουν αρκετά στοιχεία πελατών." />
                    </div>
                </>
            )}

            <div className="mb-5 grid grid-cols-4 gap-3 break-avoid">
                <Kpi label="Παραστατικά καθαρά" value={formatCurrency(legal.issuedNet)} helper="Καθαρή αξία εκδομένων παραστατικών." />
                <Kpi label="Παραστατικά ΦΠΑ" value={formatCurrency(legal.issuedVat)} helper="ΦΠΑ εκδομένων παραστατικών." />
                <Kpi label="Παραστατικά μικτά" value={formatCurrency(legal.issuedGross)} helper="Καθαρή αξία μαζί με ΦΠΑ." />
                <Kpi label="Διαφορά" value={formatCurrency(legal.netGap)} helper="Πραγματοποιημένα έσοδα μείον παραστατικά." />
            </div>

            {stats.costWarnings?.length > 0 && (
                <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[9px] font-semibold text-amber-800 break-avoid">
                    <b>Σημείωση κόστους:</b> {stats.costWarnings.slice(0, 4).join(' · ')}
                </div>
            )}

            <div className="mt-auto border-t border-slate-200 pt-3 text-[8px] font-bold uppercase tracking-widest text-slate-400">
                Η αναφορά χρησιμοποιεί πραγματοποιημένα έσοδα από αποστολές. Οι εκκρεμότητες εμφανίζονται χωριστά και δεν προστίθενται στα έσοδα.
            </div>
        </div>
    );
}
