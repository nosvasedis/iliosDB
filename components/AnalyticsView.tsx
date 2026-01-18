
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

const AnalyticsPrintReport = ({ stats }: { stats: any }) => {
    if (!stats) return null;

    return (
        <div className="hidden print:block bg-white text-slate-900 font-sans w-full max-w-[210mm] mx-auto p-10">
            <style>{`
                @page { size: A4; margin: 15mm; }
                .break-avoid { break-inside: avoid; }
                .print-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; }
            `}</style>
            
            <header className="flex justify-between items-center border-b-4 border-slate-900 pb-6 mb-8">
                <div className="flex items-center gap-4">
                    <img src={APP_LOGO} alt="Ilios" className="w-24 object-contain" />
                    <div>
                        <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">Οικονομική Αναφορά Επιχείρησης</h1>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Ilios Kosmima • Σύστημα Επιχειρηματικής Ευφυΐας</p>
                    </div>
                </div>
                <div className="text-right">
                    <p className="text-[10px] text-slate-400 font-bold uppercase">Ημερομηνία Έκδοσης</p>
                    <p className="text-sm font-black">{new Date().toLocaleDateString('el-GR')}</p>
                </div>
            </header>

            <section className="mb-10 break-avoid">
                <h2 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4 border-b border-slate-100 pb-1">Βασικοί Δείκτες Απόδοσης (KPIs)</h2>
                <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                        <p className="text-[10px] font-bold text-slate-500 uppercase">Συνολικά Έσοδα (Τζίρος)</p>
                        <p className="text-2xl font-black text-slate-900">{formatCurrency(stats.totalRevenue)}</p>
                        <p className="text-[9px] text-slate-400 mt-1">Σύνολο πωλήσεων προ εξόδων</p>
                    </div>
                    <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-200">
                        <p className="text-[10px] font-bold text-emerald-600 uppercase">Μεικτό Κέρδος</p>
                        <p className="text-2xl font-black text-emerald-700">{formatCurrency(stats.totalProfit)}</p>
                        <p className="text-[9px] text-emerald-500 font-bold mt-1">Περιθώριο Κέρδους: {stats.avgMargin.toFixed(1)}%</p>
                    </div>
                    <div className="p-4 border border-slate-200 rounded-xl">
                        <p className="text-[10px] font-bold text-slate-500 uppercase">Μέση Αξία Παραγγελίας</p>
                        <p className="text-xl font-black text-slate-800">{formatCurrency(stats.avgOrderValue)}</p>
                    </div>
                    <div className="p-4 border border-slate-200 rounded-xl">
                        <p className="text-[10px] font-bold text-slate-500 uppercase">Κόστος Παραγωγής %</p>
                        <p className="text-xl font-black text-slate-800">{stats.cogsPercent.toFixed(1)}%</p>
                    </div>
                </div>
            </section>
            
            <section className="mb-10 break-avoid">
                <h2 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4 border-b border-slate-100 pb-1">Ανάλυση Κόστους (Statement of Operations)</h2>
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 text-sm">
                    <div className="flex justify-between py-1 border-b border-slate-200 font-bold mb-1">
                        <span>Έσοδα</span>
                        <span>{formatCurrency(stats.totalRevenue)}</span>
                    </div>
                    <div className="pl-4 space-y-1 text-xs">
                        <div className="flex justify-between text-slate-600">
                            <span>- Κόστος Ασημιού</span>
                            <span>{formatCurrency(stats.costBreakdown.silver)}</span>
                        </div>
                        <div className="flex justify-between text-slate-600">
                            <span>- Κόστος Υλικών</span>
                            <span>{formatCurrency(stats.costBreakdown.materials)}</span>
                        </div>
                        <div className="flex justify-between text-slate-600">
                            <span>- Κόστος Εργασίας</span>
                            <span>{formatCurrency(stats.costBreakdown.labor)}</span>
                        </div>
                    </div>
                    <div className="flex justify-between py-2 border-t-2 border-slate-300 font-black mt-2 text-emerald-700 text-base">
                        <span>Μεικτό Κέρδος</span>
                        <span>{formatCurrency(stats.totalProfit)}</span>
                    </div>
                </div>
            </section>

            <section className="mb-10 break-avoid">
                <h2 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4 border-b border-slate-100 pb-1">Ανάλυση ανά Κατηγορία Προϊόντων</h2>
                <table className="w-full text-xs text-left border-collapse">
                    <thead>
                        <tr className="bg-slate-900 text-white font-bold uppercase tracking-wider">
                            <th className="p-3 rounded-tl-lg">Κατηγορία</th>
                            <th className="p-3 text-right">Έσοδα</th>
                            <th className="p-3 text-right">Κόστος</th>
                            <th className="p-3 text-right">Κέρδος</th>
                            <th className="p-3 text-right rounded-tr-lg">Margin %</th>
                        </tr>
                    </thead>
                    <tbody className="border border-slate-200">
                        {stats.categoryChartData.map((cat: any, idx: number) => (
                            <tr key={idx} className="border-b border-slate-100 odd:bg-slate-50/50">
                                <td className="p-3 font-bold text-slate-800">{cat.name}</td>
                                <td className="p-3 text-right font-mono">{formatCurrency(cat.revenue)}</td>
                                <td className="p-3 text-right font-mono text-slate-400">{formatCurrency(cat.cost)}</td>
                                <td className="p-3 text-right font-mono font-bold text-emerald-600">{formatCurrency(cat.profit)}</td>
                                <td className="p-3 text-right font-black">
                                    {cat.revenue > 0 ? ((cat.profit / cat.revenue) * 100).toFixed(1) : 0}%
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </section>
            
            <section className="break-avoid">
                <h2 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4 border-b border-slate-100 pb-1">Top Προϊόντα & Πελάτες</h2>
                <div className="grid grid-cols-2 gap-6">
                    <div>
                        <h3 className="font-bold text-sm mb-2 text-slate-700">Top 5 Προϊόντα (Έσοδα)</h3>
                        <ul className="text-xs space-y-1">
                            {stats.topSkus.slice(0, 5).map((p: any, i: number) => (
                                <li key={i} className="flex justify-between border-b border-slate-100 pb-1">
                                    <span>{p.sku} (x{p.qty})</span>
                                    <span className="font-bold">{formatCurrency(p.revenue)}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                    <div>
                        <h3 className="font-bold text-sm mb-2 text-slate-700">Top 5 Πελάτες</h3>
                        <ul className="text-xs space-y-1">
                            {stats.topCustomers.map((c: any, i: number) => (
                                <li key={i} className="flex justify-between border-b border-slate-100 pb-1">
                                    <span>{c.name}</span>
                                    <span className="font-bold">{formatCurrency(c.revenue)}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            </section>

            <footer className="mt-20 pt-4 border-t border-slate-200 text-center text-[8px] text-slate-400 uppercase tracking-widest">
                Εμπιστευτικό Έγγραφο • Παραγωγή από Ilios Kosmima BI Engine • Σελίδα 1
            </footer>
        </div>
    );
};

export default function AnalyticsView({ products, onBack }: Props) {
  const { data: orders } = useQuery({ queryKey: ['orders'], queryFn: api.getOrders });
  const { data: materials } = useQuery({ queryKey: ['materials'], queryFn: api.getMaterials });
  const [showHelp, setShowHelp] = React.useState(false);

  const stats = useMemo(() => {
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

            // Simple approximation of breakdown based on product ratios if available
            // Assuming active_price is somewhat close to calculated cost.
            // For a perfect breakdown, we'd need to re-calculate per item, but let's approximate
            // using the product's defined weights.
            const w = product.weight_g + (product.secondary_weight_g || 0);
            const sCost = w * 0.85; // Using approx historical silver price or just ratio
            // Better: use weight * current settings price if available, but settings not in scope here.
            // We'll calculate totals based on item properties.
            
            // Actually, let's use the lineCost and weight.
            // Silver part
            silverSoldWeight += (product.weight_g * item.quantity);
            // We can infer silver cost portion if we know the price, but let's just sum up weights and use a standard rate for now or skip exact historical cost.
            // Instead, let's re-calculate cost breakdown for accurate P&L
            // NOTE: This uses current settings logic which might differ from historical, but it's the best estimation tool we have.
            
            // ... Assuming cost structure:
            // Silver: weight * ~0.85
            // Labor: ~Cost - Silver - Materials
            
            // Let's categorize simply based on item type
            const matCost = product.recipe.reduce((acc, r) => {
                if (r.type === 'raw') {
                    const m = materials.find(mat => mat.id === r.id);
                    return acc + ((m?.cost_per_unit || 0) * r.quantity);
                }
                return acc;
            }, 0) * item.quantity;
            materialCostSum += matCost;
            
            // Approximate silver cost (using 0.85 as a base average for reporting if exact not saved)
            const silverC = (w * 0.85) * item.quantity;
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
  }, [orders, products, materials]);

  if (!stats) return <div className="p-20 text-center flex flex-col items-center gap-4"><Loader2 className="animate-spin text-blue-500" size={40}/> <p className="font-bold text-slate-500">Φόρτωση Οικονομικών Δεδομένων...</p></div>;

  return (
    <>
    <AnalyticsPrintReport stats={stats} />

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
                                    formatter={(value: number, name: string) => [formatCurrency(value), name === 'revenue' ? 'Έσοδα' : 'Κέρδος']}
                                />
                                <Legend iconType="circle" />
                                <Area type="monotone" dataKey="revenue" stroke="#3b82f6" fillOpacity={1} fill="url(#colorRevenue)" name="revenue" />
                                <Area type="monotone" dataKey="profit" stroke="#10b981" fillOpacity={1} fill="url(#colorProfit)" name="profit" />
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
                             <div className="bg-blue-500 h-full flex items-center justify-center text-[10px] font-black uppercase text-white" style={{ width: `${(stats.costBreakdown.labor / stats.totalCost) * 100}%` }} title="Εργατικά">Lab</div>
                             <div className="bg-purple-500 h-full flex items-center justify-center text-[10px] font-black uppercase text-white" style={{ width: `${(stats.costBreakdown.materials / stats.totalCost) * 100}%` }} title="Υλικά">Mat</div>
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
                                    formatter={(value: number, name: string) => [formatCurrency(value), name === 'revenue' ? 'Έσοδα' : 'Κέρδος']}
                                />
                                <Bar dataKey="revenue" name="revenue" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={12} stackId="a" />
                                <Bar dataKey="profit" name="profit" fill="#10b981" radius={[0, 4, 4, 0]} barSize={12} stackId="b" />
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
                                        <div className="text-[9px] text-slate-400 font-bold uppercase">{c.orders} orders</div>
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
                        <Award size={28} className="text-amber-500"/> Top Performers
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
                            <h4 className="font-black text-emerald-900 uppercase text-xs mb-2 tracking-widest">Μεικτό Κέρδος (Gross Profit)</h4>
                            <p className="text-emerald-800 text-sm leading-relaxed">Το αποτέλεσμα της αφαίρεσης του <strong>Κόστους Παραγωγής</strong> (Ασήμι + Εργατικά + Υλικά) από τα Έσοδα. Δεν περιλαμβάνει γενικά έξοδα (ενοίκια, ρεύμα).</p>
                        </div>
                        <div className="bg-purple-50 p-5 rounded-2xl border border-purple-100">
                            <h4 className="font-black text-purple-900 uppercase text-xs mb-2 tracking-widest">Δομή Κόστους (Cost Breakdown)</h4>
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
