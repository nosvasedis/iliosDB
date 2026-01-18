
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

export default function AnalyticsView({ products, onBack }: Props) {
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
        // Reverse for chronological
        .reverse(); 

    const topProducts = Object.values(skuPerformance)
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 15); // Show more on print

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
    <div className="max-w-7xl mx-auto space-y-8 pb-20 print:p-0 print:m-0 print:max-w-none print:w-[210mm] print:mx-auto">
        <style>{`
          @media print {
            @page { size: A4; margin: 15mm; }
            body { background: white; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .print-hide { display: none !important; }
            .print-card { border: 1px solid #e2e8f0; box-shadow: none; break-inside: avoid; border-radius: 12px; }
            .print-report-container { width: 210mm; margin: 0 auto; }
            .print-chart-container { height: 250px !important; }
          }
        `}</style>
        
        {/* HEADER */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-3xl shadow-sm border border-slate-100 print:border-none print:shadow-none print:p-0 print:mb-8 print:border-b-2 print:border-slate-800 print:rounded-none">
            <div className="flex items-center gap-4">
                {onBack && (
                  <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-full text-slate-500 print-hide transition-colors">
                    <ArrowLeft size={24}/>
                  </button>
                )}
                <div>
                    <h1 className="text-3xl font-bold text-slate-800 tracking-tight flex items-center gap-3 print:text-2xl">
                        <div className="p-2 bg-indigo-100 text-indigo-700 rounded-xl print-hide">
                            <TrendingUp size={24} />
                        </div>
                        Οικονομική Ανάλυση & Αναφορά
                    </h1>
                    <p className="text-slate-500 mt-1 ml-14 print:ml-0 print:text-xs">Αποτελέσματα πωλήσεων και απόδοσης προϊόντων για την περίοδο.</p>
                </div>
            </div>
            
            <div className="flex gap-2 print-hide">
              <button 
                  onClick={handlePrint}
                  className="flex items-center gap-2 bg-slate-900 text-white px-5 py-3 rounded-xl hover:bg-slate-800 font-bold transition-all shadow-lg"
              >
                  <Printer size={20}/> Εκτύπωση PDF
              </button>
            </div>
            
            {/* PRINT ONLY HEADER BRANDING */}
            <div className="hidden print:block absolute top-0 right-0">
                <img src={APP_LOGO} alt="Ilios" className="w-16 object-contain" />
                <p className="text-[10px] text-right text-slate-400 mt-1 uppercase font-bold tracking-widest">{new Date().toLocaleDateString('el-GR')}</p>
            </div>
        </div>

        {/* KPI CARDS */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 print:grid-cols-4 print:gap-4">
            <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between h-32 relative overflow-hidden group print-card">
                <div className="absolute right-0 top-0 p-4 opacity-10 text-emerald-600 transform scale-150 print-hide"><DollarSign size={48}/></div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Συνολικα Εσοδα</p>
                <div>
                    <h3 className="text-3xl font-black text-slate-800 print:text-xl">{formatCurrency(stats.totalRevenue)}</h3>
                    <p className="text-xs text-emerald-600 font-bold mt-1 flex items-center gap-1"><ArrowUpRight size={12}/> Καθαρός Τζίρος</p>
                </div>
            </div>
            <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between h-32 relative overflow-hidden group print-card">
                <div className="absolute right-0 top-0 p-4 opacity-10 text-blue-600 transform scale-150 print-hide"><ShoppingBag size={48}/></div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Πωλησεις</p>
                <div>
                    <h3 className="text-3xl font-black text-slate-800 print:text-xl">{stats.totalItemsSold} <span className="text-lg text-slate-400 font-medium">τεμ</span></h3>
                    <p className="text-xs text-blue-600 font-bold mt-1">{stats.totalOrders} Παραγγελίες</p>
                </div>
            </div>
            <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between h-32 relative overflow-hidden group print-card">
                <div className="absolute right-0 top-0 p-4 opacity-10 text-amber-600 transform scale-150 print-hide"><PieIcon size={48}/></div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Μεση Παραγγελια</p>
                <div>
                    <h3 className="text-3xl font-black text-slate-800 print:text-xl">{formatCurrency(stats.avgOrderValue)}</h3>
                    <p className="text-xs text-amber-600 font-bold mt-1">AOV Metric</p>
                </div>
            </div>
            <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between h-32 relative overflow-hidden group border-l-4 border-l-red-400 print-card">
                <div className="absolute right-0 top-0 p-4 opacity-10 text-red-600 transform scale-150 print-hide"><XCircle size={48}/></div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Απωλεια Τζιρου</p>
                <div>
                    <h3 className="text-3xl font-black text-red-600 print:text-xl">{formatCurrency(stats.lostRevenue)}</h3>
                    <p className="text-xs text-red-400 font-bold mt-1">Ακυρωμένες Εντολές</p>
                </div>
            </div>
        </div>

        {/* CHARTS SECTION */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 print:block print:space-y-6">
            
            {/* Category Performance */}
            <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm print-card">
                <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2 print:text-sm">
                    <Award size={20} className="text-blue-500 print-hide"/> Έσοδα ανά Κατηγορία
                </h3>
                <div className="h-72 w-full print-chart-container">
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
            <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm print-card">
                <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2 print:text-sm">
                    <PieIcon size={20} className="text-emerald-500 print-hide"/> Δημογραφικά Πωλήσεων (Φύλο)
                </h3>
                <div className="h-72 w-full flex items-center justify-center print-chart-container">
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
             <div className="lg:col-span-2 bg-white p-6 rounded-3xl border border-slate-100 shadow-sm print-card">
                <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2 print:text-sm">
                    <Calendar size={20} className="text-amber-500 print-hide"/> Ροή Πωλήσεων (Timeline)
                </h3>
                <div className="h-64 w-full print-chart-container">
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
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden print-card">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 print:bg-white">
                <h3 className="font-bold text-slate-800 flex items-center gap-2 print:text-sm">
                    <Award size={20} className="text-amber-500 print-hide"/> Κορυφαία Προϊόντα σε Πωλήσεις
                </h3>
                <span className="text-xs bg-amber-100 text-amber-800 px-3 py-1 rounded-full font-bold print:text-[10px]">Top 15 Best Sellers</span>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-left text-sm print:text-xs">
                    <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] print:bg-slate-100 print:text-slate-800">
                        <tr>
                            <th className="p-4 w-12 text-center">#</th>
                            <th className="p-4">Προϊόν</th>
                            <th className="p-4">Κατηγορία</th>
                            <th className="p-4 text-center">Τεμάχια</th>
                            <th className="p-4 text-right">Τζίρος</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50 print:divide-slate-200">
                        {stats.topProducts.map((p, idx) => (
                            <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                                <td className="p-4 text-center font-black text-slate-400 print:text-slate-800">{idx + 1}</td>
                                <td className="p-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 bg-slate-100 rounded-lg overflow-hidden shrink-0 border border-slate-100 print:w-8 print:h-8">
                                            {p.img && <img src={p.img} className="w-full h-full object-cover"/>}
                                        </div>
                                        <span className="font-black text-slate-800">{p.sku}</span>
                                    </div>
                                </td>
                                <td className="p-4 text-slate-500 font-medium">{p.name}</td>
                                <td className="p-4 text-center font-bold text-slate-700">{p.qty}</td>
                                <td className="p-4 text-right font-mono font-black text-emerald-600 print:text-slate-900">{formatCurrency(p.revenue)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>

        {/* Footer for Print */}
        <div className="hidden print:block text-center mt-12 pt-6 border-t border-slate-200">
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em]">Ilios Kosmima ERP • Οικονομική Αναφορά • {new Date().toLocaleDateString('el-GR')}</p>
        </div>
    </div>
  );
}
