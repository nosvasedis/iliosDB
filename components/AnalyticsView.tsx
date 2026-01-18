
import React, { useMemo } from 'react';
// @FIX: Added missing MaterialType import
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
  Scale, Gem, Users, ArrowDownRight, LayoutPanelTop, Wallet,
  // @FIX: Added missing Loader2 and Image as ImageIcon imports
  Loader2, Image as ImageIcon
} from 'lucide-react';
import { formatCurrency, formatDecimal } from '../utils/pricingEngine';
import { APP_LOGO } from '../constants';

interface Props {
  products: Product[];
  onBack?: () => void;
}

const COLORS = ['#059669', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#6366f1', '#14b8a6', '#f43f5e'];

// --- PRINT REPORT COMPONENT ---
const AnalyticsPrintReport = ({ stats }: { stats: any }) => {
    if (!stats) return null;

    return (
        <div className="hidden print:block bg-white text-slate-900 font-sans w-full max-w-[210mm] mx-auto p-10 pb-20">
            {/* Header */}
            <header className="flex justify-between items-center border-b-2 border-slate-800 pb-4 mb-8">
                <div className="flex items-center gap-4">
                    <img src={APP_LOGO} alt="Ilios" className="w-20 object-contain" />
                    <div>
                        <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">Οικονομικη Αναφορα Ilios</h1>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Business Intelligence Dashboard</p>
                    </div>
                </div>
                <div className="text-right">
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">ΕΚΔΟΣΗ ΑΝΑΦΟΡΑΣ</p>
                    <p className="text-sm font-bold">{new Date().toLocaleDateString('el-GR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
                </div>
            </header>

            {/* KPI Grid */}
            <section className="mb-10">
                <h2 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-4 border-b border-slate-200 pb-1 flex items-center gap-2">
                    <TrendingUp size={14}/> Συνοψη Αποδοσης
                </h2>
                <div className="grid grid-cols-4 gap-4">
                    <div className="p-4 border border-slate-200 rounded-xl bg-slate-50">
                        <p className="text-[9px] font-bold text-slate-500 uppercase">Καθαρα Εσοδα</p>
                        <p className="text-xl font-black text-slate-900">{formatCurrency(stats.totalRevenue)}</p>
                        <p className={`text-[10px] font-bold ${stats.revenueGrowth >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {stats.revenueGrowth >= 0 ? '+' : ''}{stats.revenueGrowth.toFixed(1)}% MoM
                        </p>
                    </div>
                    <div className="p-4 border border-slate-200 rounded-xl">
                        <p className="text-[9px] font-bold text-slate-500 uppercase">Μεικτο Κερδος</p>
                        <p className="text-xl font-black text-slate-900">{formatCurrency(stats.totalProfit)}</p>
                        <p className="text-[10px] font-bold text-slate-400">{((stats.totalProfit / stats.totalRevenue) * 100).toFixed(1)}% Margin</p>
                    </div>
                    <div className="p-4 border border-slate-200 rounded-xl">
                        <p className="text-[9px] font-bold text-slate-500 uppercase">Ασημι (Sold)</p>
                        <p className="text-xl font-black text-slate-900">{stats.silverSoldKg.toFixed(3)} kg</p>
                    </div>
                    <div className="p-4 border border-slate-200 rounded-xl">
                        <p className="text-[9px] font-bold text-slate-500 uppercase">Υλικα (Items)</p>
                        <p className="text-xl font-black text-slate-900">{stats.stonesSold}</p>
                    </div>
                </div>
            </section>

            {/* Material Forensics */}
            <section className="mb-10 break-inside-avoid">
                 <h2 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-4 border-b border-slate-200 pb-1 flex items-center gap-2">
                    <Scale size={14}/> Αναλυση Καταναλωσης Υλικων
                </h2>
                <table className="w-full text-xs text-left border border-slate-100 rounded-lg overflow-hidden">
                    <thead className="bg-slate-50 font-bold uppercase text-slate-600">
                        <tr>
                            <th className="p-3">Υλικό / Περιγραφή</th>
                            <th className="p-3 text-center">Κατανάλωση</th>
                            <th className="p-3 text-right">Εκτιμώμενο Κόστος</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        <tr>
                            <td className="p-3 font-bold">Ασήμι 925 (Fine equivalent)</td>
                            <td className="p-3 text-center font-black">{stats.silverSoldKg.toFixed(3)} kg</td>
                            <td className="p-3 text-right font-mono">{formatCurrency(stats.silverCostTotal)}</td>
                        </tr>
                        {stats.materialUsageData.map((m: any, idx: number) => (
                            <tr key={idx}>
                                <td className="p-3 text-slate-700">{m.name}</td>
                                <td className="p-3 text-center font-bold">{m.qty} {m.unit}</td>
                                <td className="p-3 text-right font-mono">{formatCurrency(m.cost)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </section>

            {/* Category Profitability Table */}
            <section className="mb-10 break-inside-avoid">
                <h2 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-4 border-b border-slate-200 pb-1 flex items-center gap-2">
                    <PieIcon size={14}/> Αποδοτικοτητα ανα Κατηγορια
                </h2>
                <table className="w-full text-xs text-left">
                    <thead className="bg-slate-800 text-white font-bold uppercase">
                        <tr>
                            <th className="p-3">Κατηγορία</th>
                            <th className="p-3 text-right">Έσοδα</th>
                            <th className="p-3 text-right">Κέρδος</th>
                            <th className="p-3 text-center">Margin %</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 border border-slate-100">
                        {stats.categoryChartData.map((cat: any, idx: number) => (
                            <tr key={idx}>
                                <td className="p-3 font-bold text-slate-800">{cat.name}</td>
                                <td className="p-3 text-right font-mono">{formatCurrency(cat.revenue)}</td>
                                <td className="p-3 text-right font-mono font-bold text-emerald-700">{formatCurrency(cat.profit)}</td>
                                <td className="p-3 text-center">
                                    <span className="bg-slate-100 px-2 py-0.5 rounded font-black">
                                        {cat.revenue > 0 ? ((cat.profit / cat.revenue) * 100).toFixed(1) : 0}%
                                    </span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </section>

            {/* Top Customers and Products */}
            <div className="grid grid-cols-2 gap-8 mb-10">
                <section className="break-inside-avoid">
                    <h2 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-4 border-b border-slate-200 pb-1">Top Customers</h2>
                    <table className="w-full text-[11px]">
                        <tbody className="divide-y divide-slate-50">
                            {stats.topCustomers.map((c: any, i: number) => (
                                <tr key={i}>
                                    <td className="py-2 font-bold text-slate-800">{c.name}</td>
                                    <td className="py-2 text-right font-black text-slate-900">{formatCurrency(c.revenue)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </section>
                <section className="break-inside-avoid">
                    <h2 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-4 border-b border-slate-200 pb-1">Top Products</h2>
                    <table className="w-full text-[11px]">
                        <tbody className="divide-y divide-slate-50">
                            {stats.screenTopProducts.slice(0, 10).map((p: any, i: number) => (
                                <tr key={i}>
                                    <td className="py-2 font-bold text-slate-800">{p.sku}</td>
                                    <td className="py-2 text-right font-black text-slate-900">{formatCurrency(p.revenue)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </section>
            </div>

            <footer className="mt-20 pt-4 border-t border-slate-200 text-center text-[10px] text-slate-400">
                Αυτή η αναφορά δημιουργήθηκε αυτόματα από το Ilios Kosmima ERP • Σελίδα 1
            </footer>
        </div>
    );
};

export default function AnalyticsView({ products, onBack }: Props) {
  const { data: orders } = useQuery({ queryKey: ['orders'], queryFn: api.getOrders });
  const { data: materials } = useQuery({ queryKey: ['materials'], queryFn: api.getMaterials });

  const stats = useMemo(() => {
    if (!orders || !products || !materials) return null;

    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1;
    const prevYear = currentMonth === 0 ? currentYear - 1 : currentYear;

    const validOrders = orders.filter(o => o.status !== OrderStatus.Cancelled);
    const cancelledOrders = orders.filter(o => o.status === OrderStatus.Cancelled);

    let totalRevenue = 0;
    let totalProfit = 0;
    let currMonthRevenue = 0;
    let prevMonthRevenue = 0;
    
    let silverSoldWeight = 0;
    let silverCostTotal = 0;
    let stonesSold = 0;
    
    const materialUsage: Record<string, { name: string, qty: number, unit: string, cost: number }> = {};
    const categoryStats: Record<string, { name: string, revenue: number, profit: number, cost: number }> = {};
    const genderRevenue: Record<string, number> = { [Gender.Men]: 0, [Gender.Women]: 0, [Gender.Unisex]: 0, 'Unknown': 0 };
    const skuPerformance: Record<string, { sku: string, name: string, qty: number, revenue: number, img: string | null }> = {};
    const customerPerformance: Record<string, { name: string, revenue: number, orderCount: number }> = {};
    const salesOverTime: Record<string, number> = {};

    validOrders.forEach(order => {
        const orderDate = new Date(order.created_at);
        const orderMonth = orderDate.getMonth();
        const orderYear = orderDate.getFullYear();

        // Growth metrics
        if (orderMonth === currentMonth && orderYear === currentYear) currMonthRevenue += order.total_price;
        if (orderMonth === prevMonth && orderYear === prevYear) prevMonthRevenue += order.total_price;

        totalRevenue += order.total_price;

        // Customer Rankings
        const custKey = order.customer_id || order.customer_name;
        if (!customerPerformance[custKey]) customerPerformance[custKey] = { name: order.customer_name, revenue: 0, orderCount: 0 };
        customerPerformance[custKey].revenue += order.total_price;
        customerPerformance[custKey].orderCount += 1;

        // Time Series
        const dateKey = orderDate.toLocaleDateString('el-GR', { month: 'short', day: 'numeric' });
        salesOverTime[dateKey] = (salesOverTime[dateKey] || 0) + order.total_price;

        order.items.forEach(item => {
            const product = products.find(p => p.sku === item.sku);
            if (!product) return;

            const lineRevenue = item.price_at_order * item.quantity;
            
            // Calculate actual cost for this line (respecting variants)
            let lineCost = 0;
            if (item.variant_suffix) {
                const variant = product.variants?.find(v => v.suffix === item.variant_suffix);
                lineCost = (variant?.active_price || product.active_price) * item.quantity;
            } else {
                lineCost = product.active_price * item.quantity;
            }
            
            const lineProfit = lineRevenue - lineCost;
            totalProfit += lineProfit;

            // Material Usage
            silverSoldWeight += (product.weight_g * item.quantity);
            silverCostTotal += (product.weight_g * (import.meta as any).silverPrice || 0.85) * item.quantity; // Heuristic silver cost if exact price snapshot not available

            product.recipe.forEach(ri => {
                if (ri.type === 'raw') {
                    const mat = materials.find(m => m.id === ri.id);
                    if (mat) {
                        const usageKey = mat.id;
                        if (!materialUsage[usageKey]) materialUsage[usageKey] = { name: mat.name, qty: 0, unit: mat.unit, cost: 0 };
                        materialUsage[usageKey].qty += (ri.quantity * item.quantity);
                        materialUsage[usageKey].cost += (ri.quantity * item.quantity * mat.cost_per_unit);
                        if (mat.type === MaterialType.Stone) stonesSold += (ri.quantity * item.quantity);
                    }
                }
            });

            // Category Analysis
            const cat = product.category || 'Άγνωστο';
            const mainCat = cat.split(' ')[0]; 
            if (!categoryStats[mainCat]) categoryStats[mainCat] = { name: mainCat, revenue: 0, profit: 0, cost: 0 };
            categoryStats[mainCat].revenue += lineRevenue;
            categoryStats[mainCat].profit += lineProfit;
            categoryStats[mainCat].cost += lineCost;

            // Gender Analysis
            const gender = product.gender || 'Unknown';
            genderRevenue[gender] = (genderRevenue[gender] || 0) + lineRevenue;

            // SKU Performance
            const skuKey = item.sku + (item.variant_suffix || '');
            if (!skuPerformance[skuKey]) {
                skuPerformance[skuKey] = { sku: skuKey, name: product.category, qty: 0, revenue: 0, img: product.image_url };
            }
            skuPerformance[skuKey].qty += item.quantity;
            skuPerformance[skuKey].revenue += lineRevenue;
        });
    });

    // Formatting for UI
    const revenueGrowth = prevMonthRevenue > 0 ? ((currMonthRevenue - prevMonthRevenue) / prevMonthRevenue) * 100 : 0;
    const categoryChartData = Object.values(categoryStats).sort((a, b) => b.revenue - a.revenue);
    const materialUsageData = Object.values(materialUsage).sort((a, b) => b.cost - a.cost).slice(0, 15);
    const topCustomers = Object.values(customerPerformance).sort((a, b) => b.revenue - a.revenue).slice(0, 10);
    const screenTopProducts = Object.values(skuPerformance).sort((a, b) => b.revenue - a.revenue).slice(0, 15);
    const timeChartData = Object.entries(salesOverTime).map(([name, value]) => ({ name, value })).reverse();
    const genderChartData = Object.entries(genderRevenue).filter(([_, v]) => v > 0).map(([name, value]) => {
        const labels: any = { [Gender.Men]: 'Ανδρικά', [Gender.Women]: 'Γυναικεία', [Gender.Unisex]: 'Unisex' };
        return { name: labels[name] || name, value };
    });

    return {
        totalRevenue,
        totalProfit,
        revenueGrowth,
        silverSoldKg: silverSoldWeight / 1000,
        silverCostTotal,
        stonesSold,
        totalOrders: validOrders.length,
        totalItemsSold: validOrders.reduce((s, o) => s + o.items.reduce((is, i) => is + i.quantity, 0), 0),
        avgOrderValue: validOrders.length > 0 ? totalRevenue / validOrders.length : 0,
        categoryChartData,
        genderChartData,
        timeChartData,
        materialUsageData,
        topCustomers,
        screenTopProducts,
        lostRevenue: cancelledOrders.reduce((sum, o) => sum + o.total_price, 0)
    };
  }, [orders, products, materials]);

  if (!stats) return <div className="p-20 text-center text-slate-400 flex flex-col items-center gap-4"><Loader2 className="animate-spin" size={32}/> Φόρτωση αναλυτικών...</div>;

  return (
    <>
    <AnalyticsPrintReport stats={stats} />

    <div className="max-w-7xl mx-auto space-y-8 pb-20 no-print animate-in fade-in duration-500">
        
        {/* HEADER */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100">
            <div className="flex items-center gap-4">
                {onBack && (
                  <button onClick={onBack} className="p-3 hover:bg-slate-100 rounded-2xl text-slate-400 hover:text-slate-800 transition-all border border-transparent hover:border-slate-200 active:scale-95">
                    <ArrowLeft size={20}/>
                  </button>
                )}
                <div>
                    <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-3">
                        <div className="p-2.5 bg-indigo-600 text-white rounded-2xl shadow-lg shadow-indigo-100">
                            <TrendingUp size={24} />
                        </div>
                        Οικονομική Ανάλυση
                    </h1>
                </div>
            </div>
            
            <button 
                onClick={() => window.print()}
                className="flex items-center gap-2 bg-[#060b00] text-white px-6 py-3.5 rounded-2xl hover:bg-black font-bold transition-all shadow-xl shadow-slate-200 active:scale-95"
            >
                <Printer size={20}/> Εκτύπωση Αναφοράς
            </button>
        </div>

        {/* MAIN KPI ROW */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm flex flex-col justify-between h-36 relative overflow-hidden group">
                <div className="absolute right-0 top-0 p-4 opacity-5 text-emerald-600 transform scale-150 group-hover:scale-110 transition-transform duration-500"><DollarSign size={80}/></div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Συνολικα Εσοδα</p>
                <div>
                    <h3 className="text-3xl font-black text-slate-900 tracking-tighter">{formatCurrency(stats.totalRevenue)}</h3>
                    <div className={`text-xs font-bold mt-1 flex items-center gap-1 ${stats.revenueGrowth >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {stats.revenueGrowth >= 0 ? <ArrowUpRight size={14}/> : <ArrowDownRight size={14}/>} 
                        {Math.abs(stats.revenueGrowth).toFixed(1)}% MoM
                    </div>
                </div>
            </div>
            <div className="bg-[#060b00] p-6 rounded-[2rem] shadow-xl flex flex-col justify-between h-36 relative overflow-hidden group">
                <div className="absolute right-0 top-0 p-4 opacity-10 text-white transform scale-150 group-hover:scale-110 transition-transform duration-500"><TrendingUp size={80}/></div>
                <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">Μεικτο Κερδος</p>
                <div>
                    <h3 className="text-3xl font-black text-white tracking-tighter">{formatCurrency(stats.totalProfit)}</h3>
                    <p className="text-xs text-emerald-500 font-bold mt-1">Margin: {((stats.totalProfit / stats.totalRevenue) * 100).toFixed(1)}%</p>
                </div>
            </div>
            <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm flex flex-col justify-between h-36 relative overflow-hidden group">
                <div className="absolute right-0 top-0 p-4 opacity-5 text-blue-600 transform scale-150 group-hover:scale-110 transition-transform duration-500"><Scale size={80}/></div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Καταναλωση Ασημιου</p>
                <div>
                    <h3 className="text-3xl font-black text-slate-900 tracking-tighter">{stats.silverSoldKg.toFixed(3)} <span className="text-lg text-slate-400 font-medium">kg</span></h3>
                    <p className="text-xs text-slate-400 font-bold mt-1">Συνολικό πωληθέν βάρος</p>
                </div>
            </div>
            <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm flex flex-col justify-between h-36 relative overflow-hidden group">
                <div className="absolute right-0 top-0 p-4 opacity-5 text-purple-600 transform scale-150 group-hover:scale-110 transition-transform duration-500"><Gem size={80}/></div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Υλικα & Πετρες</p>
                <div>
                    <h3 className="text-3xl font-black text-slate-900 tracking-tighter">{stats.stonesSold} <span className="text-lg text-slate-400 font-medium">τεμ</span></h3>
                    <p className="text-xs text-slate-400 font-bold mt-1">Από συνταγές πωλήσεων</p>
                </div>
            </div>
        </div>

        {/* MIDDLE SECTION: PROFITABILITY & TRENDS */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            
            {/* Category Profitability */}
            <div className="lg:col-span-8 bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
                <div className="flex justify-between items-center mb-8">
                    <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
                        <PieIcon size={20} className="text-indigo-500"/> Κερδοφορία ανά Κατηγορία
                    </h3>
                </div>
                <div className="h-[350px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={stats.categoryChartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                            <XAxis dataKey="name" tick={{fontSize: 11, fontWeight: 'bold'}} stroke="#94a3b8" />
                            <YAxis tick={{fontSize: 11}} stroke="#94a3b8" />
                            <Tooltip 
                                contentStyle={{borderRadius: '16px', border: 'none', boxShadow: '0 10px 25px rgba(0,0,0,0.1)'}}
                                formatter={(value: number, name: string) => [formatCurrency(value), name === 'revenue' ? 'Έσοδα' : 'Κέρδος']}
                            />
                            <Legend iconType="circle" wrapperStyle={{paddingTop: '20px'}} />
                            <Bar dataKey="revenue" name="Έσοδα" fill="#3b82f6" radius={[6, 6, 0, 0]} barSize={40} />
                            <Bar dataKey="profit" name="Κέρδος" fill="#10b981" radius={[6, 6, 0, 0]} barSize={30} />
                        </ComposedChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Top Customers Card */}
            <div className="lg:col-span-4 bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm flex flex-col h-full">
                <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
                    <Users size={20} className="text-amber-500"/> Top Πελάτες
                </h3>
                <div className="space-y-4 flex-1 overflow-y-auto custom-scrollbar pr-2">
                    {stats.topCustomers.map((c, i) => (
                        <div key={i} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 hover:bg-white hover:shadow-md transition-all group">
                            <div className="flex items-center gap-3">
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs ${i < 3 ? 'bg-amber-100 text-amber-600' : 'bg-white text-slate-400'}`}>
                                    {i + 1}
                                </div>
                                <div className="font-bold text-slate-700 text-sm truncate max-w-[120px]">{c.name}</div>
                            </div>
                            <div className="font-black text-slate-900 text-sm">{formatCurrency(c.revenue)}</div>
                        </div>
                    ))}
                    {stats.topCustomers.length === 0 && <div className="text-center py-20 text-slate-400 italic">Δεν υπάρχουν πωλήσεις.</div>}
                </div>
            </div>
        </div>

        {/* BOTTOM SECTION: MATERIAL CONSUMPTION & TOP PRODUCTS */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            
            {/* Material Consumption Breakdown */}
            <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden flex flex-col h-full">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
                        <Scale size={20} className="text-slate-500"/> Κατανάλωση Υλικών (Items Only)
                    </h3>
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-2">
                    {stats.materialUsageData.map((m, idx) => (
                        <div key={idx} className="flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 transition-colors border-b border-slate-50 last:border-0">
                            <div className="flex items-center gap-3 min-w-0">
                                <div className="p-2 bg-slate-100 text-slate-400 rounded-lg"><Gem size={14}/></div>
                                <div className="font-bold text-slate-700 text-sm truncate">{m.name}</div>
                            </div>
                            <div className="text-right">
                                <div className="font-black text-slate-900 text-sm">{m.qty} <span className="text-[10px] font-medium text-slate-400">{m.unit}</span></div>
                                <div className="text-[10px] font-bold text-slate-400 uppercase">{formatCurrency(m.cost)}</div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Sales Trend Line Chart */}
            <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
                <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
                    <Calendar size={20} className="text-blue-500"/> Ροή Πωλήσεων
                </h3>
                <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={stats.timeChartData}>
                            <defs>
                                <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1}/>
                                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9"/>
                            <XAxis dataKey="name" tick={{fontSize: 10}} minTickGap={30} stroke="#94a3b8" />
                            <YAxis hide />
                            <Tooltip 
                                contentStyle={{borderRadius: '16px', border: 'none', boxShadow: '0 10px 25px rgba(0,0,0,0.1)'}}
                                formatter={(value: number) => [formatCurrency(value), 'Πωλήσεις']}
                            />
                            <Area type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorSales)" dot={{r: 4, fill: '#3b82f6'}} />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>

        {/* SCREEN TOP PRODUCTS TABLE */}
        <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden">
            <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
                    <Award size={24} className="text-amber-500"/> Top Performers
                </h3>
                <span className="text-xs bg-amber-100 text-amber-800 px-4 py-1.5 rounded-full font-black uppercase tracking-wider">Top 15 SKU Efficiency</span>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-slate-400 font-bold uppercase text-[10px] tracking-widest">
                        <tr>
                            <th className="p-5 w-16 text-center">RANK</th>
                            <th className="p-5">PRODUCT / SKU</th>
                            <th className="p-5">CATEGORY</th>
                            <th className="p-5 text-center">QUANTITY</th>
                            <th className="p-5 text-right pr-8">REVENUE</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                        {stats.screenTopProducts.map((p: any, idx: number) => (
                            <tr key={idx} className="hover:bg-slate-50/80 transition-colors group">
                                <td className="p-5 text-center font-black text-slate-300 group-hover:text-amber-500 transition-colors">#{idx + 1}</td>
                                <td className="p-5">
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 bg-white rounded-2xl overflow-hidden shrink-0 border border-slate-100 shadow-sm">
                                            {p.img ? <img src={p.img} className="w-full h-full object-cover"/> : <div className="w-full h-full flex items-center justify-center text-slate-200"><ImageIcon size={18}/></div>}
                                        </div>
                                        <span className="font-black text-slate-900 text-base">{p.sku}</span>
                                    </div>
                                </td>
                                <td className="p-5 text-slate-500 font-bold uppercase text-xs">{p.name}</td>
                                <td className="p-5 text-center font-black text-slate-800">{p.qty}</td>
                                <td className="p-5 text-right pr-8 font-mono font-black text-emerald-600 text-lg">{formatCurrency(p.revenue)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    </div>
    </>
  );
}
