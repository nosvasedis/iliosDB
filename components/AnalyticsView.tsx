
import React, { useMemo } from 'react';
import { Order, Product, OrderStatus, Gender } from '../types';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/supabase';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, 
  PieChart, Pie, Cell, AreaChart, Area 
} from 'recharts';
import { 
  TrendingUp, DollarSign, ShoppingBag, XCircle, Printer, 
  Calendar, PieChart as PieIcon, Award, ArrowUpRight, ArrowLeft 
} from 'lucide-react';
import { formatCurrency } from '../utils/pricingEngine';
import { APP_LOGO } from '../constants';

interface Props {
  products: Product[];
  onBack?: () => void;
}

const COLORS = ['#059669', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#6366f1'];

// --- PRINT REPORT COMPONENT ---
// This component is only visible during print
const AnalyticsPrintReport = ({ stats }: { stats: any }) => {
    if (!stats) return null;

    return (
        <div className="hidden print:block bg-white text-slate-900 font-sans w-full max-w-[210mm] mx-auto p-8">
            {/* Header */}
            <header className="flex justify-between items-center border-b-2 border-slate-800 pb-4 mb-6">
                <div>
                    <img src={APP_LOGO} alt="Ilios" className="w-20 object-contain mb-2" />
                    <h1 className="text-xl font-black text-slate-900 uppercase tracking-tight">Οικονομικη Αναφορα</h1>
                </div>
                <div className="text-right">
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">ΗΜΕΡΟΜΗΝΙΑ</p>
                    <p className="text-sm font-bold">{new Date().toLocaleDateString('el-GR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
                </div>
            </header>

            {/* Executive Summary */}
            <section className="mb-8">
                <h2 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-3 border-b border-slate-200 pb-1">Συνοψη Αποδοσης</h2>
                <div className="grid grid-cols-4 gap-4">
                    <div className="p-3 border border-slate-200 rounded-lg bg-slate-50">
                        <p className="text-[9px] font-bold text-slate-500 uppercase">Καθαρα Εσοδα</p>
                        <p className="text-xl font-black text-slate-900">{formatCurrency(stats.totalRevenue)}</p>
                    </div>
                    <div className="p-3 border border-slate-200 rounded-lg">
                        <p className="text-[9px] font-bold text-slate-500 uppercase">Πωλησεις (Τεμ)</p>
                        <p className="text-xl font-black text-slate-900">{stats.totalItemsSold}</p>
                    </div>
                    <div className="p-3 border border-slate-200 rounded-lg">
                        <p className="text-[9px] font-bold text-slate-500 uppercase">Παραγγελιες</p>
                        <p className="text-xl font-black text-slate-900">{stats.totalOrders}</p>
                    </div>
                    <div className="p-3 border border-slate-200 rounded-lg">
                        <p className="text-[9px] font-bold text-slate-500 uppercase">Μεση Αξια (AOV)</p>
                        <p className="text-xl font-black text-slate-900">{formatCurrency(stats.avgOrderValue)}</p>
                    </div>
                </div>
            </section>

            {/* Category Breakdown (Linear Table for Print) */}
            <section className="mb-8 break-inside-avoid">
                <h2 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-3 border-b border-slate-200 pb-1">Αναλυση ανα Κατηγορια</h2>
                <table className="w-full text-xs text-left">
                    <thead className="bg-slate-100 font-bold uppercase text-slate-600">
                        <tr>
                            <th className="p-2 w-1/2">Κατηγορία</th>
                            <th className="p-2 text-right">Έσοδα</th>
                            <th className="p-2 text-right w-24">Ποσοστό</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {stats.categoryChartData.map((cat: any, idx: number) => (
                            <tr key={idx}>
                                <td className="p-2 font-bold text-slate-800">{cat.name}</td>
                                <td className="p-2 text-right font-mono">{formatCurrency(cat.value)}</td>
                                <td className="p-2 text-right text-slate-500">
                                    {stats.totalRevenue > 0 ? ((cat.value / stats.totalRevenue) * 100).toFixed(1) : 0}%
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </section>

            {/* Top Products Table */}
            <section className="break-inside-avoid">
                <h2 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-3 border-b border-slate-200 pb-1">Κορυφαια Προϊοντα (Top Performers)</h2>
                <table className="w-full text-xs text-left border-collapse">
                    <thead className="bg-slate-100 font-bold uppercase text-slate-600">
                        <tr>
                            <th className="p-2 text-center w-10">#</th>
                            <th className="p-2">SKU</th>
                            <th className="p-2">Κατηγορία</th>
                            <th className="p-2 text-center">Τεμάχια</th>
                            <th className="p-2 text-right">Σύνολο</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {stats.topProducts.map((p: any, idx: number) => (
                            <tr key={idx} className="break-inside-avoid">
                                <td className="p-2 text-center text-slate-500 font-bold">{idx + 1}</td>
                                <td className="p-2 font-black text-slate-800">{p.sku}</td>
                                <td className="p-2 text-slate-600">{p.name}</td>
                                <td className="p-2 text-center font-bold">{p.qty}</td>
                                <td className="p-2 text-right font-mono font-bold">{formatCurrency(p.revenue)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </section>

            <footer className="mt-8 pt-4 border-t border-slate-200 text-center text-[10px] text-slate-400">
                Ilios Kosmima ERP • Confidential Report • Generated {new Date().toLocaleTimeString()}
            </footer>
        </div>
    );
};

export default function AnalyticsView({ products, onBack }: Props) {
  const { data: orders } = useQuery({ queryKey: ['orders'], queryFn: api.getOrders });

  // --- CORE ANALYTICS LOGIC ---
  const stats = useMemo(() => {
    if (!orders || !products) return null;

    // 1. Filter Valid Orders
    const validOrders = orders.filter(o => o.status !== OrderStatus.Cancelled);
    const cancelledOrders = orders.filter(o => o.status === OrderStatus.Cancelled);

    // 2. High Level KPIs
    const totalRevenue = validOrders.reduce((sum, o) => sum + o.total_price, 0);
    const lostRevenue = cancelledOrders.reduce((sum, o) => sum + o.total_price, 0);
    const totalOrders = validOrders.length;
    const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;
    const totalItemsSold = validOrders.reduce((sum, o) => sum + o.items.reduce((is, i) => is + i.quantity, 0), 0);

    // 3. Aggregation Maps
    const categoryRevenue: Record<string, number> = {};
    const genderRevenue: Record<string, number> = { [Gender.Men]: 0, [Gender.Women]: 0, [Gender.Unisex]: 0, 'Unknown': 0 };
    const skuPerformance: Record<string, { sku: string, name: string, qty: number, revenue: number, img: string | null }> = {};
    const salesOverTime: Record<string, number> = {};

    validOrders.forEach(order => {
        // Time Series
        const dateKey = new Date(order.created_at).toLocaleDateString('el-GR', { month: 'short', day: 'numeric' });
        salesOverTime[dateKey] = (salesOverTime[dateKey] || 0) + order.total_price;

        order.items.forEach(item => {
            const product = products.find(p => p.sku === item.sku);
            const lineTotal = item.price_at_order * item.quantity;
            
            // Category Analysis
            const cat = product?.category || 'Άγνωστο';
            const mainCat = cat.split(' ')[0]; 
            categoryRevenue[mainCat] = (categoryRevenue[mainCat] || 0) + lineTotal;

            // Gender Analysis
            const gender = product?.gender || 'Unknown';
            genderRevenue[gender] = (genderRevenue[gender] || 0) + lineTotal;

            // SKU Performance
            const key = item.sku + (item.variant_suffix || '');
            if (!skuPerformance[key]) {
                skuPerformance[key] = {
                    sku: key,
                    name: product?.category || 'Unknown',
                    qty: 0,
                    revenue: 0,
                    img: product?.image_url || null
                };
            }
            skuPerformance[key].qty += item.quantity;
            skuPerformance[key].revenue += lineTotal;
        });
    });

    // 4. Format for Charts
    const categoryChartData = Object.entries(categoryRevenue)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value);

    const genderChartData = Object.entries(genderRevenue)
        .filter(([_, value]) => value > 0)
        .map(([name, value]) => {
            const labels: any = { [Gender.Men]: 'Ανδρικά', [Gender.Women]: 'Γυναικεία', [Gender.Unisex]: 'Unisex' };
            return { name: labels[name] || name, value };
        });

    const timeChartData = Object.entries(salesOverTime)
        .map(([name, value]) => ({ name, value }))
        .reverse(); 

    // Show top 50 products for print, top 15 for screen
    const allProductsSorted = Object.values(skuPerformance).sort((a, b) => b.revenue - a.revenue);
    const topProducts = allProductsSorted.slice(0, 50); 
    const screenTopProducts = allProductsSorted.slice(0, 15);

    return {
        totalRevenue,
        lostRevenue,
        totalOrders,
        avgOrderValue,
        totalItemsSold,
        categoryChartData,
        genderChartData,
        timeChartData,
        topProducts,
        screenTopProducts
    };
  }, [orders, products]);

  const handlePrint = () => {
    window.print();
  };

  if (!stats) return <div className="p-10 text-center">Φόρτωση δεδομένων...</div>;

  return (
    <>
    {/* PRINT ONLY REPORT */}
    <AnalyticsPrintReport stats={stats} />

    {/* SCREEN ONLY DASHBOARD */}
    <div className="max-w-7xl mx-auto space-y-8 pb-20 print:hidden">
        
        {/* HEADER */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
            <div className="flex items-center gap-4">
                {onBack && (
                  <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-full text-slate-500 transition-colors">
                    <ArrowLeft size={24}/>
                  </button>
                )}
                <div>
                    <h1 className="text-3xl font-bold text-slate-800 tracking-tight flex items-center gap-3">
                        <div className="p-2 bg-indigo-100 text-indigo-700 rounded-xl">
                            <TrendingUp size={24} />
                        </div>
                        Οικονομική Ανάλυση & Αναφορά
                    </h1>
                    <p className="text-slate-500 mt-1 ml-14">Αποτελέσματα πωλήσεων και απόδοσης προϊόντων για την περίοδο.</p>
                </div>
            </div>
            
            <div className="flex gap-2">
              <button 
                  onClick={handlePrint}
                  className="flex items-center gap-2 bg-slate-900 text-white px-5 py-3 rounded-xl hover:bg-slate-800 font-bold transition-all shadow-lg"
              >
                  <Printer size={20}/> Εκτύπωση PDF
              </button>
            </div>
        </div>

        {/* KPI CARDS */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between h-32 relative overflow-hidden group">
                <div className="absolute right-0 top-0 p-4 opacity-10 text-emerald-600 transform scale-150"><DollarSign size={48}/></div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Συνολικα Εσοδα</p>
                <div>
                    <h3 className="text-3xl font-black text-slate-800">{formatCurrency(stats.totalRevenue)}</h3>
                    <p className="text-xs text-emerald-600 font-bold mt-1 flex items-center gap-1"><ArrowUpRight size={12}/> Καθαρός Τζίρος</p>
                </div>
            </div>
            <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between h-32 relative overflow-hidden group">
                <div className="absolute right-0 top-0 p-4 opacity-10 text-blue-600 transform scale-150"><ShoppingBag size={48}/></div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Πωλησεις</p>
                <div>
                    <h3 className="text-3xl font-black text-slate-800">{stats.totalItemsSold} <span className="text-lg text-slate-400 font-medium">τεμ</span></h3>
                    <p className="text-xs text-blue-600 font-bold mt-1">{stats.totalOrders} Παραγγελίες</p>
                </div>
            </div>
            <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between h-32 relative overflow-hidden group">
                <div className="absolute right-0 top-0 p-4 opacity-10 text-amber-600 transform scale-150"><PieIcon size={48}/></div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Μεση Παραγγελια</p>
                <div>
                    <h3 className="text-3xl font-black text-slate-800">{formatCurrency(stats.avgOrderValue)}</h3>
                    <p className="text-xs text-amber-600 font-bold mt-1">AOV Metric</p>
                </div>
            </div>
            <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between h-32 relative overflow-hidden group border-l-4 border-l-red-400">
                <div className="absolute right-0 top-0 p-4 opacity-10 text-red-600 transform scale-150"><XCircle size={48}/></div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Απωλεια Τζιρου</p>
                <div>
                    <h3 className="text-3xl font-black text-red-600">{formatCurrency(stats.lostRevenue)}</h3>
                    <p className="text-xs text-red-400 font-bold mt-1">Ακυρωμένες Εντολές</p>
                </div>
            </div>
        </div>

        {/* CHARTS SECTION */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            
            {/* Category Performance */}
            <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
                <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
                    <Award size={20} className="text-blue-500"/> Έσοδα ανά Κατηγορία
                </h3>
                <div className="h-72 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={stats.categoryChartData} layout="vertical" margin={{ left: 10, right: 30 }}>
                            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                            <XAxis type="number" hide />
                            <YAxis dataKey="name" type="category" width={80} tick={{fontSize: 10, fontWeight: 'bold'}} stroke="#64748b" />
                            <Tooltip 
                                cursor={{fill: '#f8fafc'}}
                                formatter={(value: number) => [`${value.toFixed(2)}€`, 'Έσοδα']}
                                contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)'}}
                            />
                            <Bar dataKey="value" fill="#3b82f6" radius={[0, 6, 6, 0]} barSize={20}>
                                {stats.categoryChartData.map((_, index) => (
                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Gender Distribution */}
            <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
                <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
                    <PieIcon size={20} className="text-emerald-500"/> Δημογραφικά Πωλήσεων (Φύλο)
                </h3>
                <div className="h-72 w-full flex items-center justify-center">
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie
                                data={stats.genderChartData}
                                cx="50%"
                                cy="50%"
                                innerRadius={60}
                                outerRadius={80}
                                paddingAngle={5}
                                dataKey="value"
                            >
                                {stats.genderChartData.map((_, index) => (
                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                ))}
                            </Pie>
                            <Tooltip formatter={(value: number) => [`${value.toFixed(2)}€`, 'Έσοδα']} />
                            <Legend verticalAlign="bottom" height={36} iconType="circle" />
                        </PieChart>
                    </ResponsiveContainer>
                </div>
            </div>

             {/* Sales Trend */}
             <div className="lg:col-span-2 bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
                <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
                    <Calendar size={20} className="text-amber-500"/> Ροή Πωλήσεων (Timeline)
                </h3>
                <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={stats.timeChartData}>
                            <defs>
                                <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.2}/>
                                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9"/>
                            <XAxis dataKey="name" tick={{fontSize: 10}} minTickGap={30} stroke="#64748b" />
                            <YAxis hide />
                            <Tooltip 
                                formatter={(value: number) => [`${value.toFixed(2)}€`, 'Πωλήσεις']}
                                contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)'}}
                            />
                            <Area type="monotone" dataKey="value" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorSales)" />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>

        {/* BEST SELLERS TABLE */}
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                <h3 className="font-bold text-slate-800 flex items-center gap-2">
                    <Award size={20} className="text-amber-500"/> Κορυφαία Προϊόντα σε Πωλήσεις
                </h3>
                <span className="text-xs bg-amber-100 text-amber-800 px-3 py-1 rounded-full font-bold">Top 15 Best Sellers</span>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px]">
                        <tr>
                            <th className="p-4 w-12 text-center">#</th>
                            <th className="p-4">Προϊόν</th>
                            <th className="p-4">Κατηγορία</th>
                            <th className="p-4 text-center">Τεμάχια</th>
                            <th className="p-4 text-right">Τζίρος</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                        {stats.screenTopProducts.map((p: any, idx: number) => (
                            <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                                <td className="p-4 text-center font-black text-slate-400">{idx + 1}</td>
                                <td className="p-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 bg-slate-100 rounded-lg overflow-hidden shrink-0 border border-slate-100">
                                            {p.img && <img src={p.img} className="w-full h-full object-cover"/>}
                                        </div>
                                        <span className="font-black text-slate-800">{p.sku}</span>
                                    </div>
                                </td>
                                <td className="p-4 text-slate-500 font-medium">{p.name}</td>
                                <td className="p-4 text-center font-bold text-slate-700">{p.qty}</td>
                                <td className="p-4 text-right font-mono font-black text-emerald-600">{formatCurrency(p.revenue)}</td>
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
