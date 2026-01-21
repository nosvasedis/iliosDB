
import React from 'react';
import { formatCurrency, formatDecimal } from '../utils/pricingEngine';
import { APP_LOGO } from '../constants';
import { TrendingUp, Wallet, Tag, Target, Calendar, User, Coins, Hammer, Box, AlertTriangle } from 'lucide-react';

interface Props {
    stats: any; // Result from calculateBusinessStats
    orderId: string;
    customerName: string;
    date: string;
}

export default function OrderFinancialReport({ stats, orderId, customerName, date }: Props) {
    if (!stats) return null;

    // Calculate percentages for the cost bar
    const silverPct = (stats.costBreakdown.silver / stats.totalCost) * 100;
    const laborPct = (stats.costBreakdown.labor / stats.totalCost) * 100;
    const matPct = (stats.costBreakdown.materials / stats.totalCost) * 100;

    return (
        <div className="bg-white text-slate-900 font-sans w-[210mm] min-h-[297mm] p-8 mx-auto page-break-after-always relative flex flex-col">
            <style>{`
                @page { size: A4; margin: 10mm 15mm; }
                .break-avoid { break-inside: avoid; }
                table { border-collapse: collapse; width: 100%; }
                th, td { padding: 6px 8px; }
            `}</style>
            
            {/* HEADER */}
            <div className="flex justify-between items-end border-b-2 border-slate-900 pb-4 mb-6 shrink-0">
                <div className="flex items-center gap-4">
                    <img src={APP_LOGO} alt="Ilios" className="h-10 w-auto object-contain" />
                    <div className="flex flex-col border-l-2 border-slate-200 pl-4">
                         <h1 className="text-xl font-black text-slate-900 uppercase tracking-tighter leading-none">Αναλυση Κερδοφοριας</h1>
                         <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mt-1">Order Job Costing</p>
                    </div>
                </div>
                <div className="text-right">
                    <div className="flex items-center justify-end gap-2 mb-1">
                        <span className="text-[9px] text-slate-400 uppercase font-bold tracking-widest">Εντολη</span>
                        <span className="font-mono font-bold text-sm bg-slate-100 px-2 rounded">#{orderId.slice(0, 8)}</span>
                    </div>
                    <div className="flex items-center justify-end gap-2">
                         <span className="text-[9px] text-slate-400 uppercase font-bold tracking-widest">Πελατης</span>
                         <span className="font-bold text-sm">{customerName}</span>
                    </div>
                </div>
            </div>

            {/* EXECUTIVE SUMMARY */}
            <div className="bg-slate-50 rounded-2xl p-5 border border-slate-200 mb-8 break-avoid shadow-sm">
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                    <Target size={12}/> Οικονομική Επισκόπηση (Net)
                </h3>
                
                <div className="grid grid-cols-4 gap-6 text-center divide-x divide-slate-200">
                    <div>
                        <p className="text-[9px] font-bold text-slate-400 uppercase mb-1">Έσοδα (Χωρίς ΦΠΑ)</p>
                        <p className="text-2xl font-black text-slate-900">{formatCurrency(stats.totalRevenue)}</p>
                    </div>
                    <div>
                        <p className="text-[9px] font-bold text-slate-400 uppercase mb-1">Κόστος Παραγωγής</p>
                        <p className="text-2xl font-black text-slate-600">{formatCurrency(stats.totalCost)}</p>
                    </div>
                    <div>
                        <p className="text-[9px] font-bold text-slate-400 uppercase mb-1">Καθαρό Κέρδος</p>
                        <p className="text-2xl font-black text-emerald-600">{formatCurrency(stats.totalProfit)}</p>
                    </div>
                    <div>
                        <p className="text-[9px] font-bold text-slate-400 uppercase mb-1">Περιθώριο (Margin)</p>
                        <p className={`text-2xl font-black ${stats.avgMargin < 30 ? 'text-red-500' : 'text-slate-800'}`}>
                            {stats.avgMargin.toFixed(1)}%
                        </p>
                    </div>
                </div>
            </div>

            {/* COST BREAKDOWN VISUAL */}
            <div className="mb-8 break-avoid">
                 <div className="flex justify-between items-end mb-2">
                    <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1">
                        <Wallet size={12}/> Δομή Κόστους
                    </h3>
                    <span className="text-[9px] font-mono font-bold text-slate-400">Σύνολο: {formatCurrency(stats.totalCost)}</span>
                 </div>
                
                <div className="flex h-6 w-full rounded-lg overflow-hidden text-[9px] font-bold text-white uppercase text-center leading-6 mb-3">
                    <div className="bg-slate-500 flex items-center justify-center border-r border-white/20" style={{ width: `${silverPct}%` }}></div>
                    <div className="bg-blue-500 flex items-center justify-center border-r border-white/20" style={{ width: `${laborPct}%` }}></div>
                    <div className="bg-purple-500 flex items-center justify-center" style={{ width: `${matPct}%` }}></div>
                </div>
                
                <div className="grid grid-cols-3 gap-4">
                    <div className="flex items-center gap-3 p-2 border border-slate-100 rounded-lg">
                        <div className="p-1.5 bg-slate-100 rounded text-slate-600"><Coins size={14}/></div>
                        <div>
                            <div className="text-[8px] font-bold text-slate-400 uppercase">Ασημι</div>
                            <div className="font-mono font-bold text-xs">{formatCurrency(stats.costBreakdown.silver)}</div>
                        </div>
                    </div>
                    <div className="flex items-center gap-3 p-2 border border-slate-100 rounded-lg">
                        <div className="p-1.5 bg-blue-50 rounded text-blue-600"><Hammer size={14}/></div>
                        <div>
                            <div className="text-[8px] font-bold text-blue-400 uppercase">Εργατικα</div>
                            <div className="font-mono font-bold text-xs">{formatCurrency(stats.costBreakdown.labor)}</div>
                        </div>
                    </div>
                    <div className="flex items-center gap-3 p-2 border border-slate-100 rounded-lg">
                        <div className="p-1.5 bg-purple-50 rounded text-purple-600"><Box size={14}/></div>
                        <div>
                            <div className="text-[8px] font-bold text-purple-400 uppercase">Υλικα</div>
                            <div className="font-mono font-bold text-xs">{formatCurrency(stats.costBreakdown.materials)}</div>
                        </div>
                    </div>
                </div>
            </div>

            {/* ITEMIZED TABLE */}
            <div className="flex-1">
                <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-200">
                    <Tag size={14} className="text-slate-400"/>
                    <h3 className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Αναλυση ανα Ειδος</h3>
                </div>

                <table className="w-full text-xs">
                    <thead>
                        <tr className="bg-slate-100 text-slate-500 text-[8px] uppercase tracking-wider">
                            <th className="text-left font-bold pl-4 rounded-l-lg py-2">Κωδικος</th>
                            <th className="text-center py-2">Ποσ.</th>
                            <th className="text-right py-2">Τιμη Πωλ. (Net)</th>
                            <th className="text-right text-slate-400 py-2">Κοστος</th>
                            <th className="text-right font-bold text-emerald-600 py-2">Κερδος</th>
                            <th className="text-right pr-4 rounded-r-lg py-2">Margin</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {stats.itemsBreakdown?.map((item: any, idx: number) => {
                            const isLowMargin = item.margin < 30;
                            return (
                                <tr key={idx} className="break-inside-avoid">
                                    <td className="font-bold text-slate-800 pl-4 py-2.5">
                                        {item.sku}
                                        {item.variant && <span className="text-[9px] text-slate-500 ml-1 font-normal bg-slate-50 border border-slate-200 px-1 rounded">{item.variant}</span>}
                                    </td>
                                    <td className="text-center py-2.5 font-medium">{item.quantity}</td>
                                    <td className="text-right font-mono py-2.5 font-bold">{formatCurrency(item.revenue / item.quantity)}</td>
                                    <td className="text-right font-mono text-slate-500 py-2.5">{formatCurrency(item.cost / item.quantity)}</td>
                                    <td className="text-right font-mono font-bold text-emerald-600 py-2.5">{formatCurrency(item.profit)}</td>
                                    <td className="text-right font-black pr-4 py-2.5">
                                        <div className="flex items-center justify-end gap-1">
                                            {isLowMargin && <AlertTriangle size={10} className="text-red-500"/>}
                                            <span className={`px-1.5 py-0.5 rounded text-[9px] ${isLowMargin ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-700'}`}>
                                                {item.margin.toFixed(0)}%
                                            </span>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* FOOTER */}
            <div className="mt-auto pt-4 border-t border-slate-200 flex justify-between items-center text-[8px] text-slate-400 uppercase tracking-widest font-bold">
                <span>Business Intelligence Report</span>
                <span>{date} • {new Date().toLocaleTimeString()}</span>
            </div>
        </div>
    );
}
