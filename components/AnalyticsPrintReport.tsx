
import React from 'react';
import { formatCurrency, formatDecimal } from '../utils/pricingEngine';
import { APP_LOGO } from '../constants';
import { TrendingUp, DollarSign, Wallet, Scale, Users, Award, PieChart, ShoppingCart, Tag } from 'lucide-react';

interface Props {
    stats: any;
    title?: string;
}

export default function AnalyticsPrintReport({ stats, title }: Props) {
    if (!stats) return null;

    const isSingleOrder = stats.isSingleOrder;

    return (
        <div className="bg-white text-slate-900 font-sans w-[210mm] min-h-[297mm] p-8 mx-auto page-break-after-always relative">
            <style>{`
                @page { size: A4; margin: 10mm 15mm; }
                .break-avoid { break-inside: avoid; }
                table { border-collapse: collapse; width: 100%; }
                th, td { padding: 4px 8px; }
            `}</style>
            
            {/* HEADER */}
            <div className="flex justify-between items-end border-b-2 border-slate-900 pb-2 mb-6 shrink-0">
                <div className="flex items-center gap-4">
                    <img src={APP_LOGO} alt="Ilios" className="h-10 w-auto object-contain" />
                    <div className="flex flex-col border-l-2 border-slate-200 pl-3">
                         <h1 className="text-xl font-black text-slate-900 uppercase tracking-tighter leading-none">{title || "Οικονομική Αναφορά"}</h1>
                         <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">Ilios Kosmima • Business Intelligence</p>
                    </div>
                </div>
                <div className="text-right">
                    <p className="text-[8px] text-slate-400 font-bold uppercase tracking-widest">Ημερομηνία</p>
                    <p className="text-sm font-black">{new Date().toLocaleDateString('el-GR')}</p>
                </div>
            </div>

            {/* SECTION 1: EXECUTIVE SUMMARY (KPIs) */}
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 mb-6 break-avoid">
                <div className="flex justify-between items-center mb-3 border-b border-slate-200 pb-2">
                    <h3 className="text-xs font-black text-slate-600 uppercase tracking-widest flex items-center gap-2">
                        <TrendingUp size={14}/> {isSingleOrder ? "Απόδοση Παραγγελίας" : "Συνολική Απόδοση"}
                    </h3>
                    <div className="text-[9px] font-bold text-slate-400 uppercase">
                        {isSingleOrder ? `${stats.orderCount} Παραγγελία • ${stats.totalItems} Είδη` : `${stats.orderCount} Παραγγελίες`}
                    </div>
                </div>
                
                <div className="grid grid-cols-4 gap-4 text-center divide-x divide-slate-200">
                    <div>
                        <p className="text-[9px] font-bold text-slate-400 uppercase mb-1">Έσοδα (Τζίρος)</p>
                        <p className="text-2xl font-black text-slate-900">{formatCurrency(stats.totalRevenue)}</p>
                    </div>
                    <div>
                        <p className="text-[9px] font-bold text-slate-400 uppercase mb-1">Κόστος Παραγωγής</p>
                        <p className="text-2xl font-black text-slate-600">{formatCurrency(stats.totalCost)}</p>
                    </div>
                    <div>
                        <p className="text-[9px] font-bold text-emerald-600 uppercase mb-1">Καθαρό Κέρδος</p>
                        <p className="text-2xl font-black text-emerald-600">{formatCurrency(stats.totalProfit)}</p>
                    </div>
                    <div>
                        <p className="text-[9px] font-bold text-slate-400 uppercase mb-1">Περιθώριο (Margin)</p>
                        <div className="flex items-center justify-center gap-1">
                            <p className={`text-xl font-black ${stats.avgMargin < 30 ? 'text-red-500' : 'text-slate-800'}`}>{stats.avgMargin.toFixed(1)}%</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* SECTION 2: COST STRUCTURE ANALYSIS */}
            <div className="mb-6 break-avoid">
                 <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-1">
                    <Wallet size={12}/> Ανάλυση Κόστους
                </h3>
                <div className="border border-slate-200 rounded-lg overflow-hidden flex h-8 w-full mb-2 text-[10px] font-bold text-white uppercase text-center leading-8">
                    <div className="bg-slate-500" style={{ width: `${(stats.costBreakdown.silver / stats.totalCost) * 100}%` }}>Ασήμι</div>
                    <div className="bg-blue-500" style={{ width: `${(stats.costBreakdown.labor / stats.totalCost) * 100}%` }}>Εργατικά</div>
                    <div className="bg-purple-500" style={{ width: `${(stats.costBreakdown.materials / stats.totalCost) * 100}%` }}>Υλικά</div>
                </div>
                <div className="flex justify-between text-[10px] font-mono text-slate-600">
                    <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-slate-500"/> Ασήμι: <b>{formatCurrency(stats.costBreakdown.silver)}</b></span>
                    <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-blue-500"/> Εργατικά: <b>{formatCurrency(stats.costBreakdown.labor)}</b></span>
                    <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-purple-500"/> Υλικά: <b>{formatCurrency(stats.costBreakdown.materials)}</b></span>
                </div>
            </div>

            {/* SECTION 3: CONDITIONAL CONTENT */}
            {isSingleOrder ? (
                /* SINGLE ORDER: ITEM PROFITABILITY TABLE */
                <div className="border border-slate-200 rounded-xl overflow-hidden mb-6 break-avoid">
                    <div className="bg-slate-100 px-4 py-2 border-b border-slate-200 flex justify-between items-center">
                        <h3 className="text-[10px] font-black text-slate-600 uppercase tracking-widest flex items-center gap-1">
                            <Tag size={12}/> Κερδοφορία ανά Είδος
                        </h3>
                    </div>
                    <table className="w-full text-xs">
                        <thead>
                            <tr className="bg-slate-50 text-slate-500 text-[8px] uppercase tracking-wider border-b border-slate-200">
                                <th className="text-left font-bold pl-4">Προϊόν / SKU</th>
                                <th className="text-center">Ποσ.</th>
                                <th className="text-right">Τιμή Πώλ.</th>
                                <th className="text-right text-slate-400">Κόστος</th>
                                <th className="text-right font-bold text-emerald-600">Κέρδος</th>
                                <th className="text-right pr-4">Margin</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {stats.itemsBreakdown?.map((item: any, idx: number) => (
                                <tr key={idx} className="break-inside-avoid">
                                    <td className="font-bold text-slate-800 pl-4 py-2">
                                        {item.sku}
                                        {item.variant && <span className="text-[9px] text-slate-500 ml-1 font-normal bg-slate-100 px-1 rounded">{item.variant}</span>}
                                    </td>
                                    <td className="text-center py-2">{item.quantity}</td>
                                    <td className="text-right font-mono py-2">{formatCurrency(item.revenue)}</td>
                                    <td className="text-right font-mono text-slate-400 py-2">{formatCurrency(item.cost)}</td>
                                    <td className="text-right font-mono font-bold text-emerald-600 py-2">{formatCurrency(item.profit)}</td>
                                    <td className="text-right font-black pr-4 py-2">
                                        <span className={`px-1.5 py-0.5 rounded text-[9px] ${item.margin < 30 ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-700'}`}>
                                            {item.margin.toFixed(0)}%
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : (
                /* GENERAL REPORT: TOP LISTS */
                <div className="grid grid-cols-2 gap-6 break-avoid">
                    {/* Top Products */}
                    <div className="border border-slate-200 rounded-xl overflow-hidden h-fit">
                        <div className="bg-slate-50 px-3 py-1.5 border-b border-slate-200">
                            <h3 className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1">
                                <Award size={10}/> Top Προϊόντα
                            </h3>
                        </div>
                        <table className="w-full text-[10px] text-left">
                            <tbody>
                                {stats.topSkus.slice(0, 10).map((p: any, i: number) => (
                                    <tr key={i} className="border-b border-slate-50 last:border-0">
                                        <td className="py-1 px-3 w-4 text-center font-bold text-slate-400">{i + 1}</td>
                                        <td className="py-1 px-2 font-bold text-slate-800">{p.sku}</td>
                                        <td className="py-1 px-2 text-right text-slate-500">x{p.qty}</td>
                                        <td className="py-1 px-3 text-right font-mono font-bold">{formatCurrency(p.revenue)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Top Customers */}
                    <div className="border border-slate-200 rounded-xl overflow-hidden h-fit">
                        <div className="bg-slate-50 px-3 py-1.5 border-b border-slate-200">
                            <h3 className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1">
                                <Users size={10}/> Top Πελάτες
                            </h3>
                        </div>
                        <table className="w-full text-[10px] text-left">
                            <tbody>
                                {stats.topCustomers.slice(0, 10).map((c: any, i: number) => (
                                    <tr key={i} className="border-b border-slate-50 last:border-0">
                                        <td className="py-1 px-3 w-4 text-center font-bold text-slate-400">{i + 1}</td>
                                        <td className="py-1 px-2 font-bold text-slate-800 truncate max-w-[100px]">{c.name}</td>
                                        <td className="py-1 px-3 text-right font-mono font-bold">{formatCurrency(c.revenue)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* SECTION 4: CATEGORY BREAKDOWN (Always Show) */}
            {!isSingleOrder && (
            <div className="mt-6 border border-slate-200 rounded-xl overflow-hidden break-avoid">
                <div className="bg-slate-50 px-3 py-1.5 border-b border-slate-200">
                    <h3 className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1">
                        <PieChart size={10}/> Ανάλυση ανά Κατηγορία
                    </h3>
                </div>
                <table className="w-full text-xs text-left border-collapse">
                    <thead>
                        <tr className="bg-white text-slate-400 border-b border-slate-100 text-[8px] uppercase tracking-wider">
                            <th className="py-1.5 px-3 font-bold">Κατηγορία</th>
                            <th className="py-1.5 px-3 text-right">Έσοδα</th>
                            <th className="py-1.5 px-3 text-right">Κόστος</th>
                            <th className="py-1.5 px-3 text-right">Κέρδος</th>
                            <th className="py-1.5 px-3 text-right">Margin</th>
                        </tr>
                    </thead>
                    <tbody>
                        {stats.categoryChartData.map((cat: any, idx: number) => (
                            <tr key={idx} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                                <td className="py-1.5 px-3 font-bold text-slate-800">{cat.name}</td>
                                <td className="py-1.5 px-3 text-right font-mono">{formatCurrency(cat.revenue)}</td>
                                <td className="py-1.5 px-3 text-right font-mono text-slate-400">{formatCurrency(cat.cost)}</td>
                                <td className="py-1.5 px-3 text-right font-mono font-bold text-emerald-600">{formatCurrency(cat.profit)}</td>
                                <td className="py-1.5 px-3 text-right font-black text-[10px]">
                                    {cat.revenue > 0 ? ((cat.profit / cat.revenue) * 100).toFixed(1) : 0}%
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            )}

            <div className="absolute bottom-6 left-0 right-0 text-center">
                 <p className="text-[7px] text-slate-300 uppercase tracking-widest">System Generated Report • {new Date().toLocaleTimeString()}</p>
            </div>
        </div>
    );
}
