
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
  Calendar, PieChart as PieIcon, Award, ArrowUpRight 
} from 'lucide-react';
import { formatCurrency } from '../utils/pricingEngine';
import { APP_LOGO } from '../constants';

interface Props {
  products: Product[];
}

const COLORS = ['#059669', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#6366f1'];

export default function AnalyticsView({ products }: Props) {
  const { data: orders } = useQuery({ queryKey: ['orders'], queryFn: api.getOrders });

  // --- CORE ANALYTICS LOGIC ---
  const stats = useMemo(() => {
    if (!orders || !products) return null;

    // 1. Filter Valid Orders (Exclude Cancelled for Revenue, Keep for "Lost" metric)
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
            // Simplify category (e.g. "Ring Silver" -> "Ring")
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
        // Simple sort by date assumption (keys might need better sorting in real-world large datasets)
        .reverse(); 

    const topProducts = Object.values(skuPerformance)
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 10);

    return {
        totalRevenue,
        lostRevenue,
        totalOrders,
        avgOrderValue,
        totalItemsSold,
        categoryChartData,
        genderChartData,
        timeChartData,
        topProducts
    };
  }, [orders, products]);

  const handlePrint = () => {
    window.print();
  };

  if (!stats) return <div className="p-10 text-center">Φόρτωση δεδομένων...</div>;

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-20">
        
        {/* HEADER */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-3xl shadow-sm border border-slate-100 print:border-none print:shadow-none">
            <div>
                <h1 className="text-3xl font-bold text-slate-800 tracking-tight flex items-center gap-3">
                    <div className="p-2 bg-indigo-100 text-indigo-700 rounded-xl print:hidden">
                        <TrendingUp size={24} />
                    </div>
                    Οικονομική Ανάλυση
                </h1>
                <p className="text-slate-500 mt-2 ml-14 print:ml-0">Αναλυτική αναφορά πωλήσεων και απόδοσης προϊόντων.</p>
            </div>
            <button 
                onClick={handlePrint}
                className="flex items-center gap-2 bg-slate-900 text-white px-5 py-3 rounded-xl hover:bg-slate-800 font-bold transition-all shadow-lg print:hidden"
            >
                <Printer size={20}/> Εκτύπωση Αναφοράς
            </button>
            
            {/* PRINT ONLY HEADER LOGO */}
            <div className="hidden print:block absolute top-0 right-0">
                <img src={APP_LOGO} alt="Ilios" className="w-20 object-contain" />
            </div>
        </div>

        {/* KPI CARDS */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between h-32 relative overflow-hidden group">
                <div className="absolute right-0 top-0 p-4 opacity-10 text-emerald-600 transform scale-150 group-hover:scale-125 transition-transform"><DollarSign size={48}/></div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Συνολικα Εσοδα</p>
                <div>
                    <h3 className="text-3xl font-black text-slate-800">{formatCurrency(stats.totalRevenue)}</h3>
                    <p className="text-xs text-emerald-600 font-bold mt-1 flex items-center gap-1"><ArrowUpRight size={12}/> Net Volume</p>
                </div>
            </div>
            <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between h-32 relative overflow-hidden group">
                <div className="absolute right-0 top-0 p-4 opacity-10 text-blue-600 transform scale-150 group-hover:scale-125 transition-transform"><ShoppingBag size={48}/></div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Πωλησεις</p>
                <div>
                    <h3 className="text-3xl font-black text-slate-800">{stats.totalItemsSold} <span className="text-lg text-slate-400 font-medium">τεμ</span></h3>
                    <p className="text-xs text-blue-600 font-bold mt-1">{stats.totalOrders} Παραγγελίες</p>
                </div>
            </div>
            <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between h-32 relative overflow-hidden group">
                <div className="absolute right-0 top-0 p-4 opacity-10 text-amber-600 transform scale-150 group-hover:scale-125 transition-transform"><PieIcon size={48}/></div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Μεση Παραγγελια</p>
                <div>
                    <h3 className="text-3xl font-black text-slate-800">{formatCurrency(stats.avgOrderValue)}</h3>
                    <p className="text-xs text-amber-600 font-bold mt-1">AOV Metric</p>
                </div>
            </div>
            <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between h-32 relative overflow-hidden group border-l-4 border-l-red-400">
                <div className="absolute right-0 top-0 p-4 opacity-10 text-red-600 transform scale-150 group-hover:scale-125 transition-transform"><XCircle size={48}/></div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Απωλεια Τζιρου</p>
                <div>
                    <h3 className="text-3xl font-black text-red-600">{formatCurrency(stats.lostRevenue)}</h3>
                    <p className="text-xs text-red-400 font-bold mt-1">Ακυρωμένες Εντολές</p>
                </div>
            </div>
        </div>

        {/* CHARTS SECTION */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 print:block print:space-y-8">
            
            {/* Category Performance */}
            <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm print:break-inside-avoid">
                <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
                    <Award size={20} className="text-blue-500"/> Έσοδα ανά Κατηγορία
                </h3>
                <div className="h-72 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={stats.categoryChartData} layout="vertical" margin={{ left: 20 }}>
                            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                            <XAxis type="number" hide />
                            <YAxis dataKey="name" type="category" width={80} tick={{fontSize: 10, fontWeight: 'bold'}} />
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
            <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm print:break-inside-avoid">
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
             <div className="lg:col-span-2 bg-white p-6 rounded-3xl border border-slate-100 shadow-sm print:break-inside-avoid">
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
                            <XAxis dataKey="name" tick={{fontSize: 10}} minTickGap={30} />
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
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden print:break-inside-avoid print:border-2 print:border-slate-300">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                <h3 className="font-bold text-slate-800 flex items-center gap-2">
                    <Award size={20} className="text-amber-500"/> Top 10 Προϊόντα
                </h3>
                <span className="text-xs bg-amber-100 text-amber-800 px-3 py-1 rounded-full font-bold">Best Sellers</span>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-xs">
                        <tr>
                            <th className="p-4 w-16 text-center">#</th>
                            <th className="p-4">Προϊόν</th>
                            <th className="p-4">Κατηγορία</th>
                            <th className="p-4 text-center">Ποσότητα</th>
                            <th className="p-4 text-right">Συνολικά Έσοδα</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                        {stats.topProducts.map((p, idx) => (
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

        {/* Footer for Print */}
        <div className="hidden print:block text-center mt-10 pt-4 border-t border-slate-200">
            <p className="text-xs text-slate-500">Ilios Kosmima ERP - Οικονομική Αναφορά - {new Date().toLocaleDateString('el-GR')}</p>
        </div>
    </div>
  );
}
