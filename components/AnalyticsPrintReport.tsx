
import React from 'react';
import { formatCurrency, formatDecimal } from '../utils/pricingEngine';
import { APP_LOGO } from '../constants';
import { TrendingUp, DollarSign, Wallet, Scale, Users, Award, PieChart } from 'lucide-react';

interface Props {
    stats: any;
    title?: string;
}

export default function AnalyticsPrintReport({ stats, title }: Props) {
    if (!stats) return null;

    return (
        <div className="bg-white text-slate-900 font-sans w-[210mm] min-h-[297mm] p-8 mx-auto page-break-after-always">
            <style>{`
                @page { size: A4; margin: 10mm 15mm; }
                .break-avoid { break-inside: avoid; }
            `}</style>
            
            {/* HEADER */}
            <div className="flex justify-between items-end border-b-2 border-slate-900 pb-2 mb-4 shrink-0">
                <div className="flex items-center gap-4">
                    <img src={APP_LOGO} alt="Ilios" className="h-8 w-auto object-contain" />
                    <div className="flex flex-col border-l border-slate-300 pl-3">
                         <h1 className="text-lg font-black text-slate-900 uppercase tracking-tighter leading-none">{title || "Οικονομική Αναφορά"}</h1>
                         <p className="text-[8px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">Ilios Kosmima • Business Intelligence</p>
                    </div>
                </div>
                <div className="text-right">
                    <p className="text-[8px] text-slate-400 font-bold uppercase">Ημερομηνία</p>
                    <p className="text-xs font-black">{new Date().toLocaleDateString('el-GR')}</p>
                </div>
            </div>

            {/* ROW 1: KPIs & COST STRUCTURE (SIDE BY SIDE) */}
            <div className="grid grid-cols-2 gap-6 mb-6 break-avoid">
                {/* Left: Key Metrics */}
                <div className="border border-slate-200 rounded-xl p-3 bg-slate-50/50">
                    <h3 className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-3 border-b border-slate-200 pb-1 flex items-center gap-1">
                        <TrendingUp size={10}/> Βασικοί Δείκτες
                    </h3>
                    <div className="grid grid-cols-2 gap-y-3 gap-x-2">
                        <div>
                            <p className="text-[8px] font-bold text-slate-400 uppercase">Συνολικά Έσοδα</p>
                            <p className="text-lg font-black text-slate-900">{formatCurrency(stats.totalRevenue)}</p>
                        </div>
                        <div>
                            <p className="text-[8px] font-bold text-emerald-600 uppercase">Μεικτό Κέρδος</p>
                            <p className="text-lg font-black text-emerald-700">{formatCurrency(stats.totalProfit)}</p>
                        </div>
                        <div>
                            <p className="text-[8px] font-bold text-slate-400 uppercase">Περιθώριο %</p>
                            <p className="text-sm font-bold text-slate-700">{stats.avgMargin.toFixed(1)}%</p>
                        </div>
                        <div>
                            <p className="text-[8px] font-bold text-slate-400 uppercase">Μέση Παραγγελία</p>
                            <p className="text-sm font-bold text-slate-700">{formatCurrency(stats.avgOrderValue)}</p>
                        </div>
                    </div>
                </div>

                {/* Right: Cost Breakdown */}
                <div className="border border-slate-200 rounded-xl p-3 bg-white">
                    <h3 className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-3 border-b border-slate-200 pb-1 flex items-center gap-1">
                        <Wallet size={10}/> Ανάλυση Κόστους
                    </h3>
                    <div className="space-y-1.5 text-xs">
                        <div className="flex justify-between items-center">
                            <span className="text-slate-500 text-[9px] uppercase font-bold flex items-center gap-1"><Scale size={8}/> Ασήμι</span>
                            <span className="font-mono font-bold text-slate-700">{formatCurrency(stats.costBreakdown.silver)}</span>
                        </div>
                        <div className="w-full bg-slate-100 h-1 rounded-full overflow-hidden">
                            <div className="bg-slate-400 h-full" style={{ width: `${(stats.costBreakdown.silver / stats.totalCost) * 100}%` }}></div>
                        </div>

                        <div className="flex justify-between items-center mt-1">
                            <span className="text-slate-500 text-[9px] uppercase font-bold">Υλικά</span>
                            <span className="font-mono font-bold text-slate-700">{formatCurrency(stats.costBreakdown.materials)}</span>
                        </div>
                        <div className="w-full bg-slate-100 h-1 rounded-full overflow-hidden">
                            <div className="bg-purple-400 h-full" style={{ width: `${(stats.costBreakdown.materials / stats.totalCost) * 100}%` }}></div>
                        </div>

                        <div className="flex justify-between items-center mt-1">
                            <span className="text-slate-500 text-[9px] uppercase font-bold">Εργατικά</span>
                            <span className="font-mono font-bold text-slate-700">{formatCurrency(stats.costBreakdown.labor)}</span>
                        </div>
                        <div className="w-full bg-slate-100 h-1 rounded-full overflow-hidden">
                            <div className="bg-blue-400 h-full" style={{ width: `${(stats.costBreakdown.labor / stats.totalCost) * 100}%` }}></div>
                        </div>
                        
                        <div className="flex justify-between pt-1 mt-1 border-t border-slate-100">
                             <span className="font-bold text-[9px] text-slate-400 uppercase">Κόστος Παραγωγής</span>
                             <span className="font-bold">{stats.cogsPercent.toFixed(1)}%</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* ROW 2: CATEGORY TABLE (FULL WIDTH) */}
            <div className="mb-6 break-avoid border border-slate-200 rounded-xl overflow-hidden">
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
            
            {/* ROW 3: TOP PERFORMERS (SIDE BY SIDE) */}
            <div className="grid grid-cols-2 gap-6 break-avoid">
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <div className="bg-slate-50 px-3 py-1.5 border-b border-slate-200">
                        <h3 className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1">
                            <Award size={10}/> Top Προϊόντα
                        </h3>
                    </div>
                    <table className="w-full text-[10px] text-left">
                        <tbody>
                            {stats.topSkus.slice(0, 8).map((p: any, i: number) => (
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

                <div className="border border-slate-200 rounded-xl overflow-hidden h-fit">
                    <div className="bg-slate-50 px-3 py-1.5 border-b border-slate-200">
                        <h3 className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1">
                            <Users size={10}/> Top Πελάτες
                        </h3>
                    </div>
                    <table className="w-full text-[10px] text-left">
                        <tbody>
                            {stats.topCustomers.slice(0, 8).map((c: any, i: number) => (
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

            <footer className="mt-4 pt-2 border-t border-slate-200 text-center">
                <p className="text-[7px] text-slate-400 uppercase tracking-widest">
                    Ilios Kosmima ERP • Σελίδα 1
                </p>
            </footer>
        </div>
    );
}
