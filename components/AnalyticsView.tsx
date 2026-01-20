
import React, { useMemo } from 'react';
import { Order, Product, OrderStatus, Gender, MaterialType } from '../types';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/supabase';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, 
  PieChart, Pie, Cell, AreaChart, Area, ComposedChart, Line
} from 'recharts';
import { 
  TrendingUp, DollarSign, ShoppingBag, XCircle, Printer, 
  Calendar, PieChart as PieIcon, Award, ArrowUpRight, ArrowLeft,
  Scale, Gem, Users, ArrowDownRight, Info, Wallet, Loader2, Image as ImageIcon,
  HelpCircle, BarChart3, FileText, ChevronRight, Calculator, Hash, Coins
} from 'lucide-react';
import { formatCurrency, formatDecimal } from '../utils/pricingEngine';
import { APP_LOGO } from '../constants';

interface Props {
  products: Product[];
  onBack?: () => void;
}

const COLORS = ['#059669', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#6366f1', '#14b8a6'];

export const AnalyticsPrintReport = ({ stats, title }: { stats: any, title?: string }) => {
    if (!stats) return null;

    return (
        <div className="bg-white text-slate-900 font-sans w-[210mm] min-h-[297mm] p-6 mx-auto shadow-lg print:shadow-none print:p-6 flex flex-col page-break-after-always">
            
            {/* COMPACT HEADER */}
            <div className="flex justify-between items-end border-b-2 border-slate-900 pb-2 mb-4 shrink-0">
                <div className="flex items-center gap-3">
                    <img src={APP_LOGO} alt="ILIOS" className="h-8 w-auto object-contain" />
                    <div className="text-[7px] text-slate-500 leading-tight border-l border-slate-300 pl-2">
                        <p className="font-bold text-slate-900 uppercase tracking-wide">ILIOS KOSMIMA</p>
                        <p>Business Intelligence</p>
                        <p>Report ID: {Math.random().toString(36).substr(2, 6).toUpperCase()}</p>
                    </div>
                </div>
                <div className="text-right">
                    <h1 className="text-lg font-black text-slate-900 uppercase tracking-tight leading-none mb-0.5">{title || "Οικονομικη Αναλυση"}</h1>
                    <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">{new Date().toLocaleDateString('el-GR', { dateStyle: 'full' })}</p>
                </div>
            </div>

            {/* CONTENT */}
            <div className="flex-1 space-y-4">
                
                {/* 1. KPIs - Single Row */}
                <section className="grid grid-cols-4 gap-3 break-inside-avoid">
                    <div className="p-2 rounded border border-slate-200 bg-slate-50">
                        <p className="text-[8px] font-bold text-slate-400 uppercase tracking-wider">Εσοδα</p>
                        <p className="text-xl font-black text-slate-900 leading-none mt-1">{formatCurrency(stats.totalRevenue)}</p>
                    </div>
                    <div className="p-2 rounded border border-emerald-200 bg-emerald-50">
                        <p className="text-[8px] font-bold text-emerald-600 uppercase tracking-wider">Μεικτο Κερδος</p>
                        <p className="text-xl font-black text-emerald-700 leading-none mt-1">{formatCurrency(stats.totalProfit)}</p>
                        <p className="text-[8px] font-bold text-emerald-600 mt-0.5">{stats.avgMargin.toFixed(1)}% Yield</p>
                    </div>
                    <div className="p-2 rounded border border-slate-200">
                        <p className="text-[8px] font-bold text-slate-400 uppercase tracking-wider">Avg Order</p>
                        <p className="text-xl font-black text-slate-800 leading-none mt-1">{formatCurrency(stats.avgOrderValue)}</p>
                    </div>
                    <div className="p-2 rounded border border-slate-200">
                        <p className="text-[8px] font-bold text-slate-400 uppercase tracking-wider">Cost Ratio</p>
                        <p className="text-xl font-black text-slate-800 leading-none mt-1">{stats.cogsPercent.toFixed(1)}%</p>
                    </div>
                </section>

                {/* 2. Cost Analysis & Breakdown (Horizontal) */}
                <section className="break-inside-avoid border border-slate-200 rounded-lg p-3">
                    <h3 className="text-[9px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-100 pb-1 mb-2">Αναλυση Κοστους</h3>
                    <div className="flex justify-between items-end text-xs">
                        <div>
                            <p className="text-slate-500 text-[9px] uppercase font-bold">Ασήμι</p>
                            <p className="font-bold text-slate-900">{formatCurrency(stats.costBreakdown.silver)}</p>
                        </div>
                        <div>
                            <p className="text-slate-500 text-[9px] uppercase font-bold">Υλικά</p>
                            <p className="font-bold text-slate-900">{formatCurrency(stats.costBreakdown.materials)}</p>
                        </div>
                        <div>
                            <p className="text-slate-500 text-[9px] uppercase font-bold">Εργατικά</p>
                            <p className="font-bold text-slate-900">{formatCurrency(stats.costBreakdown.labor)}</p>
                        </div>
                        <div className="w-px h-6 bg-slate-200 mx-2"></div>
                        <div className="text-right">
                            <p className="text-slate-500 text-[9px] uppercase font-bold">Σύνολο Εξόδων</p>
                            <p className="font-bold text-slate-900">{formatCurrency(stats.totalCost)}</p>
                        </div>
                    </div>
                </section>

                {/* 3. Category Analysis Table */}
                <section className="break-inside-avoid">
                     <h3 className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Αναλυση Κατηγοριων</h3>
                     <table className="w-full text-left border-collapse text-[10px]">
                        <thead>
                            <tr className="border-b-2 border-slate-800 text-slate-600">
                                <th className="py-1 px-1 font-bold">Κατηγορία</th>
                                <th className="py-1 px-1 text-right">Έσοδα</th>
                                <th className="py-1 px-1 text-right">Κόστος</th>
                                <th className="py-1 px-1 text-right text-emerald-700">Κέρδος</th>
                                <th className="py-1 px-1 text-right">%</th>
                            </tr>
                        </thead>
                        <tbody>
                            {stats.categoryChartData.map((cat: any, idx: number) => (
                                <tr key={idx} className="border-b border-slate-100">
                                    <td className="py-1 px-1 font-bold text-slate-800">{cat.name}</td>
                                    <td className="py-1 px-1 text-right text-slate-600 font-mono">{formatCurrency(cat.revenue)}</td>
                                    <td className="py-1 px-1 text-right text-slate-400 font-mono">{formatCurrency(cat.cost)}</td>
                                    <td className="py-1 px-1 text-right font-bold text-emerald-700 font-mono">{formatCurrency(cat.profit)}</td>
                                    <td className="py-1 px-1 text-right font-black text-slate-800">
                                        {cat.revenue > 0 ? ((cat.profit / cat.revenue) * 100).toFixed(1) : 0}%
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                     </table>
                </section>
                
                {/* 4. Top Lists (Side by Side) */}
                <section className="grid grid-cols-2 gap-6 break-inside-avoid">
                    <div>
                        <h3 className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1 border-b border-slate-200 pb-1">Top Products</h3>
                        <table className="w-full text-[9px]">
                            <tbody>
                                {stats.topSkus.slice(0, 8).map((p: any, i: number) => (
                                    <tr key={i} className="border-b border-slate-50">
                                        <td className="py-1 font-bold text-slate-700">{p.sku}</td>
                                        <td className="py-1 text-right text-slate-500">x{p.qty}</td>
                                        <td className="py-1 text-right font-bold font-mono">{formatCurrency(p.revenue)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <div>
                        <h3 className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1 border-b border-slate-200 pb-1">Top Customers</h3>
                        <table className="w-full text-[9px]">
                            <tbody>
                                {stats.topCustomers.slice(0, 8).map((c: any, i: number) => (
                                    <tr key={i} className="border-b border-slate-50">
                                        <td className="py-1 font-bold text-slate-700 truncate max-w-[100px]">{c.name}</td>
                                        <td className="py-1 text-right text-slate-500">{c.orders} ord</td>
                                        <td className="py-1 text-right font-bold font-mono">{formatCurrency(c.revenue)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>
            </div>

            {/* Footer */}
            <div className="mt-4 pt-2 border-t-2 border-slate-900 text-center text-[7px] text-slate-300 uppercase tracking-widest shrink-0">
                System Generated • Ilios Kosmima ERP • {new Date().toLocaleTimeString()}
            </div>
        </div>
    );
};

export const calculateBusinessStats = (orders: Order[], products: Product[], materials: any[]) => {
    if (!orders || !products || !materials) return null;

    const validOrders = orders.filter(o => o.status !== OrderStatus.Cancelled);
    
    let totalRevenue = 0;
    let totalProfit = 0;
    let totalCost = 0;
    let silverSoldWeight = 0;
    let stonesSold = 0;
    
    // Breakdown
    let silverCostSum = 0;
    let laborCostSum = 0;
    let materialCostSum = 0;
    let totalItemsSold = 0;
    
    const categoryStats: Record<string, { name: string, revenue: number, profit: number, cost: number }> = {};
    const salesOverTime: Record<string, { revenue: number, profit: number }> = {};
    const customerRanking: Record<string, { name: string, revenue: number, orders: number }> = {};
    const skuRanking: Record<string, { sku: string, qty: number, revenue: number, img: string | null }> = {};

    validOrders.forEach(order => {
        totalRevenue += order.total_price;
        
        const cKey = order.customer_id || order.customer_name;
        if (!customerRanking[cKey]) customerRanking[cKey] = { name: order.customer_name, revenue: 0, orders: 0 };
        customerRanking[cKey].revenue += order.total_price;
        customerRanking[cKey].orders += 1;
        
        // Time Grouping (Monthly)
        const date = new Date(order.created_at);
        const monthKey = date.toLocaleDateString('el-GR', { month: 'short', year: '2-digit' }); // e.g. "Ιαν 25"
        if (!salesOverTime[monthKey]) salesOverTime[monthKey] = { revenue: 0, profit: 0 };
        salesOverTime[monthKey].revenue += order.total_price;

        order.items.forEach(item => {
            totalItemsSold += item.quantity;
            const product = products.find(p => p.sku === item.sku);
            if (!product) return;

            const revenue = item.price_at_order * item.quantity;
            
            let unitCost = product.active_price;
            if (item.variant_suffix) {
                const v = product.variants?.find(variant => variant.suffix === item.variant_suffix);
                if (v?.active_price) unitCost = v.active_price;
            }
            
            const lineCost = unitCost * item.quantity;
            const profit = revenue - lineCost;
            totalProfit += profit;
            totalCost += lineCost;
            
            // Add profit to time grouping
            salesOverTime[monthKey].profit += profit;

            const w = product.weight_g + (product.secondary_weight_g || 0);
            
            silverSoldWeight += (product.weight_g * item.quantity);
            
            const matCost = product.recipe.reduce((acc, r) => {
                if (r.type === 'raw') {
                    const m = materials.find(mat => mat.id === r.id);
                    return acc + ((m?.cost_per_unit || 0) * r.quantity);
                }
                return acc;
            }, 0) * item.quantity;
            materialCostSum += matCost;
            
            const silverC = (w * 0.85) * item.quantity; // Est silver cost
            silverCostSum += silverC;
            
            // The rest is labor/overhead
            laborCostSum += Math.max(0, lineCost - matCost - silverC);

            product.recipe.forEach(ri => {
                if (ri.type === 'raw') {
                    const mat = materials.find(m => m.id === ri.id);
                    if (mat?.type === MaterialType.Stone) stonesSold += (ri.quantity * item.quantity);
                }
            });

            const mainCat = product.category.split(' ')[0];
            if (!categoryStats[mainCat]) categoryStats[mainCat] = { name: mainCat, revenue: 0, profit: 0, cost: 0 };
            categoryStats[mainCat].revenue += revenue;
            categoryStats[mainCat].profit += profit;
            categoryStats[mainCat].cost += lineCost;

            const sKey = item.sku + (item.variant_suffix || '');
            if (!skuRanking[sKey]) skuRanking[sKey] = { sku: sKey, qty: 0, revenue: 0, img: product.image_url };
            skuRanking[sKey].qty += item.quantity;
            skuRanking[sKey].revenue += revenue;
        });
    });

    const categoryChartData = Object.values(categoryStats).sort((a, b) => b.revenue - a.revenue);
    const timeChartData = Object.entries(salesOverTime).map(([name, val]) => ({ name, revenue: val.revenue, profit: val.profit }));
    const topCustomers = Object.values(customerRanking).sort((a, b) => b.revenue - a.revenue).slice(0, 5);
    const topSkus = Object.values(skuRanking).sort((a, b) => b.revenue - a.revenue).slice(0, 10);

    return {
        totalRevenue,
        totalProfit,
        totalCost,
        avgOrderValue: validOrders.length > 0 ? totalRevenue / validOrders.length : 0,
        avgBasketSize: validOrders.length > 0 ? totalItemsSold / validOrders.length : 0,
        cogsPercent: totalRevenue > 0 ? (totalCost / totalRevenue) * 100 : 0,
        orderCount: validOrders.length,
        avgMargin: totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0,
        silverSoldKg: silverSoldWeight / 1000,
        stonesSold,
        costBreakdown: {
            silver: silverCostSum,
            labor: laborCostSum,
            materials: materialCostSum
        },
        categoryChartData,
        timeChartData,
        topCustomers,
        topSkus
    };
};

export default function AnalyticsView({ products, onBack }: Props) {
  const { data: orders } = useQuery({ queryKey: ['orders'], queryFn: api.getOrders });
  const { data: materials } = useQuery({ queryKey: ['materials'], queryFn: api.getMaterials });
  const [showHelp, setShowHelp] = React.useState(false);

  const stats = useMemo(() => {
     return calculateBusinessStats(orders || [], products, materials || []);
  }, [orders, products, materials]);

  if (!stats) return <div className="p-20 text-center flex flex-col items-center gap-4"><Loader2 className="animate-spin text-blue-500" size={40}/> <p className="font-bold text-slate-500">Φόρτωση Οικονομικών Δεδομένων...</p></div>;

  return (
    <>
    <div className="hidden print:block">
        <AnalyticsPrintReport stats={stats} />
    </div>

    <div className="max-w-7xl mx-auto space-y-8 pb-20 no-print animate-in fade-in duration-500">
        
        {/* HEADER */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-[2.5rem] shadow-sm border border-slate-100">
            <div className="flex items-center gap-4">
                {onBack && (
                  <button onClick={onBack} className="p-3 hover:bg-slate-100 rounded-2xl text-slate-400 hover:text-slate-800 transition-all active:scale-95">
                    <ArrowLeft size={20}/>
                  </button>
                )}
                <div>
                    <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-3">
                        <div className="p-2.5 bg-blue-600 text-white rounded-2xl shadow-lg">
                            <BarChart3 size={24} />
                        </div>
                        Επιχειρηματική Ανάλυση
                    </h1>
                </div>
            </div>
            
            <div className="flex gap-2">
                <button 
                    onClick={() => setShowHelp(true)}
                    className="p-3 bg-slate-100 text-slate-600 rounded-2xl hover:bg-slate-200 transition-colors"
                    title="Εξήγηση Όρων"
                >
                    <HelpCircle size={20}/>
                </button>
                <button 
                    onClick={() => window.print()}
                    className="flex items-center gap-2 bg-[#060b00] text-white px-6 py-3.5 rounded-2xl hover:bg-black font-bold transition-all shadow-xl active:scale-95"
                >
                    <Printer size={20}/> Εκτύπωση PDF
                </button>
            </div>
        </div>

        {/* MAIN KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm flex flex-col justify-between h-40 relative overflow-hidden group" title="Συνολικός τζίρος προ φόρων και εξόδων.">
                <div className="absolute right-0 top-0 p-6 opacity-5 text-blue-600 scale-150 group-hover:scale-110 transition-transform"><DollarSign size={80}/></div>
                <div className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest cursor-help">
                    Συνολικά Έσοδα <HelpCircle size={10} className="text-slate-300 pointer-events-none"/>
                </div>
                <div>
                    <h3 className="text-4xl font-black text-slate-900 tracking-tighter">{formatCurrency(stats.totalRevenue)}</h3>
                    <p className="text-[10px] text-slate-400 font-bold mt-1 uppercase">{stats.orderCount} Παραγγελίες</p>
                </div>
            </div>

            <div className="bg-[#060b00] p-8 rounded-[2.5rem] shadow-xl flex flex-col justify-between h-40 relative overflow-hidden group" title="Έσοδα μείον κόστος παραγωγής (Υλικά & Εργατικά).">
                <div className="absolute right-0 top-0 p-6 opacity-10 text-white scale-150 group-hover:scale-110 transition-transform"><TrendingUp size={80}/></div>
                <div className="flex items-center gap-2 text-[10px] font-black text-emerald-400 uppercase tracking-widest cursor-help">
                    Μεικτό Κέρδος <HelpCircle size={10} className="text-emerald-900 pointer-events-none"/>
                </div>
                <div>
                    <h3 className="text-4xl font-black text-white tracking-tighter">{formatCurrency(stats.totalProfit)}</h3>
                    <p className="text-xs text-emerald-500 font-bold mt-1">Απόδοση: {stats.avgMargin.toFixed(1)}%</p>
                </div>
            </div>

            <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm flex flex-col justify-between h-40 relative overflow-hidden group">
                <div className="absolute right-0 top-0 p-6 opacity-5 text-amber-600 scale-150 group-hover:scale-110 transition-transform"><Calculator size={80}/></div>
                <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Μέση Παραγγελία</div>
                <div>
                    <h3 className="text-4xl font-black text-slate-900 tracking-tighter">{formatCurrency(stats.avgOrderValue)}</h3>
                    <p className="text-[10px] text-slate-400 font-bold mt-1 uppercase">{stats.avgBasketSize.toFixed(1)} είδη / παραγγελία</p>
                </div>
            </div>

            <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm flex flex-col justify-between h-40 relative overflow-hidden group">
                <div className="absolute right-0 top-0 p-6 opacity-5 text-slate-600 scale-150 group-hover:scale-110 transition-transform"><Scale size={80}/></div>
                <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Ασήμι 925° (Πωληθέν)</div>
                <h3 className="text-4xl font-black text-slate-900 tracking-tighter">{stats.silverSoldKg.toFixed(3)} <span className="text-xl text-slate-400 font-medium">kg</span></h3>
                <p className="text-[10px] text-slate-400 font-bold mt-1 uppercase">Κόστος: {formatCurrency(stats.costBreakdown.silver)}</p>
            </div>
        </div>

        {/* MIDDLE SECTION: DETAILED BREAKDOWN & TRENDS */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            
            {/* Cost Breakdown & Trends */}
            <div className="lg:col-span-8 space-y-6">
                
                {/* Monthly Trend Chart */}
                <div className="bg-white p-8 rounded-[3rem] border border-slate-100 shadow-sm">
                    <h3 className="font-black text-slate-800 text-xl mb-6 flex items-center gap-2">
                        <TrendingUp size={24} className="text-emerald-500"/> Τάση Πωλήσεων & Κερδοφορίας
                    </h3>
                    <div className="h-[300px] w-full">
                         <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={stats.timeChartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8}/>
                                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                                    </linearGradient>
                                    <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.8}/>
                                        <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                                    </linearGradient>
                                </defs>
                                <XAxis dataKey="name" tick={{fontSize: 10}} stroke="#94a3b8" />
                                <YAxis tick={{fontSize: 10}} stroke="#94a3b8" tickFormatter={(v) => `${v}€`} />
                                <Tooltip 
                                    contentStyle={{borderRadius: '16px', border: 'none', boxShadow: '0 10px 30px rgba(0,0,0,0.1)', fontSize: '12px'}} 
                                    formatter={(value: number, name: string) => [formatCurrency(value), name]}
                                />
                                <Legend iconType="circle" />
                                <Area type="monotone" dataKey="revenue" stroke="#3b82f6" fillOpacity={1} fill="url(#colorRevenue)" name="Έσοδα" />
                                <Area type="monotone" dataKey="profit" stroke="#10b981" fillOpacity={1} fill="url(#colorProfit)" name="Κέρδος" />
                            </AreaChart>
                         </ResponsiveContainer>
                    </div>
                </div>

                {/* Cost Structure (Waterfall style breakdown) */}
                <div className="bg-slate-900 text-white p-8 rounded-[3rem] shadow-xl relative overflow-hidden">
                     <div className="absolute right-0 bottom-0 p-10 opacity-5"><Coins size={150}/></div>
                     <h3 className="font-black text-xl mb-6 flex items-center gap-2 relative z-10">
                        <Wallet size={24} className="text-amber-400"/> Δομή Κόστους Παραγωγής
                     </h3>
                     
                     <div className="space-y-4 relative z-10">
                         {/* Bar Container */}
                         <div className="flex h-12 w-full rounded-2xl overflow-hidden shadow-inner bg-slate-800">
                             <div className="bg-slate-400 h-full flex items-center justify-center text-[10px] font-black uppercase text-slate-900" style={{ width: `${(stats.costBreakdown.silver / stats.totalCost) * 100}%` }} title="Ασήμι">Ag</div>
                             <div className="bg-blue-500 h-full flex items-center justify-center text-[10px] font-black uppercase text-white" style={{ width: `${(stats.costBreakdown.labor / stats.totalCost) * 100}%` }} title="Εργατικά">Εργ</div>
                             <div className="bg-purple-500 h-full flex items-center justify-center text-[10px] font-black uppercase text-white" style={{ width: `${(stats.costBreakdown.materials / stats.totalCost) * 100}%` }} title="Υλικά">Υλ</div>
                         </div>
                         
                         <div className="grid grid-cols-3 gap-4 text-center">
                             <div>
                                 <div className="text-[10px] text-slate-400 uppercase font-bold">Ασήμι</div>
                                 <div className="text-xl font-black">{formatCurrency(stats.costBreakdown.silver)}</div>
                             </div>
                             <div>
                                 <div className="text-[10px] text-blue-400 uppercase font-bold">Εργατικά</div>
                                 <div className="text-xl font-black">{formatCurrency(stats.costBreakdown.labor)}</div>
                             </div>
                             <div>
                                 <div className="text-[10px] text-purple-400 uppercase font-bold">Υλικά</div>
                                 <div className="text-xl font-black">{formatCurrency(stats.costBreakdown.materials)}</div>
                             </div>
                         </div>
                     </div>
                </div>
            </div>

            {/* Category Profitability & Top Customers */}
            <div className="lg:col-span-4 space-y-6">
                 {/* Category Chart */}
                 <div className="bg-white p-8 rounded-[3rem] border border-slate-100 shadow-sm flex flex-col h-[420px]">
                    <h3 className="font-black text-slate-800 text-lg mb-6 flex items-center gap-2">
                        <PieIcon size={20} className="text-blue-500"/> Κερδοφορία ανά Είδος
                    </h3>
                    <div className="flex-1 w-full min-h-0">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart layout="vertical" data={stats.categoryChartData.slice(0, 5)} margin={{ top: 0, right: 30, left: 30, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                                <XAxis type="number" hide />
                                <YAxis dataKey="name" type="category" tick={{fontSize: 10, fontWeight: 'bold'}} width={60} />
                                <Tooltip 
                                    cursor={{fill: '#f8fafc'}}
                                    contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 10px 30px rgba(0,0,0,0.1)', fontSize: '11px'}}
                                    formatter={(value: number, name: string) => [formatCurrency(value), name]}
                                />
                                <Bar dataKey="revenue" name="Έσοδα" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={12} stackId="a" />
                                <Bar dataKey="profit" name="Κέρδος" fill="#10b981" radius={[0, 4, 4, 0]} barSize={12} stackId="b" />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Top Customers List */}
                <div className="bg-white p-8 rounded-[3rem] border border-slate-100 shadow-sm flex flex-col">
                    <h3 className="font-black text-slate-800 text-lg mb-6 flex items-center gap-2">
                        <Users size={20} className="text-amber-500"/> Κορυφαίοι Πελάτες
                    </h3>
                    <div className="space-y-4 flex-1 overflow-y-auto custom-scrollbar pr-2">
                        {stats.topCustomers.map((c, i) => (
                            <div key={i} className="flex items-center justify-between p-3 bg-slate-50 rounded-2xl border border-slate-100 group hover:bg-white hover:border-blue-200 transition-all">
                                <div className="flex items-center gap-3">
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-black text-xs ${i === 0 ? 'bg-amber-100 text-amber-600' : 'bg-white text-slate-400'}`}>
                                        {i + 1}
                                    </div>
                                    <div>
                                        <div className="font-bold text-slate-800 text-xs truncate max-w-[100px]">{c.name}</div>
                                        <div className="text-[9px] text-slate-400 font-bold uppercase">{c.orders} παραγγελίες</div>
                                    </div>
                                </div>
                                <div className="font-black text-slate-900 text-sm">{formatCurrency(c.revenue)}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>

        {/* BOTTOM SECTION: TOP PRODUCTS */}
        <div className="bg-white rounded-[3rem] border border-slate-100 shadow-sm overflow-hidden">
            <div className="p-10 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                <div>
                    <h3 className="font-black text-slate-800 text-xl flex items-center gap-2">
                        <Award size={28} className="text-amber-500"/> Κορυφαία Προϊόντα
                    </h3>
                    <p className="text-sm text-slate-400 font-medium mt-1">Τα 10 προϊόντα με τον υψηλότερο τζίρο.</p>
                </div>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-slate-400 font-black uppercase text-[10px] tracking-widest">
                        <tr>
                            <th className="p-6 w-20 text-center">#</th>
                            <th className="p-6">Προϊόν</th>
                            <th className="p-6 text-center">Τεμάχια</th>
                            <th className="p-6 text-right pr-12">Τζίρος</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                        {stats.topSkus.map((p: any, idx: number) => (
                            <tr key={idx} className="hover:bg-slate-50/80 transition-colors group">
                                <td className="p-6 text-center font-black text-slate-300 group-hover:text-amber-500 transition-colors">#{idx + 1}</td>
                                <td className="p-6">
                                    <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 bg-white rounded-xl overflow-hidden shrink-0 border border-slate-100 shadow-sm">
                                            {p.img ? <img src={p.img} className="w-full h-full object-cover"/> : <div className="w-full h-full flex items-center justify-center text-slate-200"><ImageIcon size={16}/></div>}
                                        </div>
                                        <span className="font-black text-slate-900 text-base">{p.sku}</span>
                                    </div>
                                </td>
                                <td className="p-6 text-center font-black text-slate-800 text-base">{p.qty}</td>
                                <td className="p-6 text-right pr-12 font-mono font-black text-[#060b00] text-lg">{formatCurrency(p.revenue)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>

        {/* HELP MODAL */}
        {showHelp && (
            <div className="fixed inset-0 z-[200] bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in" onClick={() => setShowHelp(false)}>
                <div className="bg-white rounded-[3rem] p-10 max-w-2xl w-full shadow-2xl animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
                    <div className="flex justify-between items-center mb-8 border-b border-slate-100 pb-6">
                        <h2 className="text-2xl font-black text-slate-800 flex items-center gap-2"><BarChart3 className="text-blue-500"/> Οικονομικό Λεξικό</h2>
                        <button onClick={() => setShowHelp(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors"><XCircle size={24} className="text-slate-300 hover:text-slate-600"/></button>
                    </div>
                    
                    <div className="space-y-6">
                        <div className="bg-blue-50 p-5 rounded-2xl border border-blue-100">
                            <h4 className="font-black text-blue-900 uppercase text-xs mb-2 tracking-widest">Έσοδα (Τζίρος)</h4>
                            <p className="text-blue-800 text-sm leading-relaxed">Είναι το συνολικό ποσό που εισπράττει η επιχείρηση από τις πωλήσεις της, χωρίς καμία αφαίρεση εξόδων ή φόρων.</p>
                        </div>
                        <div className="bg-emerald-50 p-5 rounded-2xl border border-emerald-100">
                            <h4 className="font-black text-emerald-900 uppercase text-xs mb-2 tracking-widest">Μεικτό Κέρδος</h4>
                            <p className="text-emerald-800 text-sm leading-relaxed">Το αποτέλεσμα της αφαίρεσης του <strong>Κόστους Παραγωγής</strong> (Ασήμι + Εργατικά + Υλικά) από τα Έσοδα. Δεν περιλαμβάνει γενικά έξοδα (ενοίκια, ρεύμα).</p>
                        </div>
                        <div className="bg-purple-50 p-5 rounded-2xl border border-purple-100">
                            <h4 className="font-black text-purple-900 uppercase text-xs mb-2 tracking-widest">Δομή Κόστους</h4>
                            <p className="text-purple-800 text-sm leading-relaxed">Ανάλυση του πού πηγαίνουν τα χρήματα της παραγωγής: Αγορά Ασημιού, Πληρωμές Εργατικών/Φασόν και Αγορά Υλικών/Πετρών.</p>
                        </div>
                    </div>
                    
                    <button onClick={() => setShowHelp(false)} className="w-full mt-10 bg-slate-900 text-white py-4 rounded-2xl font-bold hover:bg-black transition-all shadow-lg active:scale-95">Κατάλαβα</button>
                </div>
            </div>
        )}
    </div>
    </>
  );
}
