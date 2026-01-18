
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
  HelpCircle, BarChart3, FileText, ChevronRight
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
            `}</style>
            
            <header className="flex justify-between items-center border-b-2 border-slate-800 pb-6 mb-8">
                <div className="flex items-center gap-4">
                    <img src={APP_LOGO} alt="Ilios" className="w-20 object-contain" />
                    <div>
                        <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">Οικονομικη Αναφορα</h1>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Business Intelligence • Ilios Kosmima</p>
                    </div>
                </div>
                <div className="text-right">
                    <p className="text-[10px] text-slate-400 font-bold uppercase">Ημερομηνια</p>
                    <p className="text-sm font-bold">{new Date().toLocaleDateString('el-GR')}</p>
                </div>
            </header>

            <section className="grid grid-cols-2 gap-8 mb-10 break-avoid">
                <div className="p-6 bg-slate-50 rounded-2xl border border-slate-200">
                    <p className="text-xs font-bold text-slate-400 uppercase mb-1">Συνολικα Εσοδα (Τζιρος)</p>
                    <p className="text-3xl font-black text-slate-900">{formatCurrency(stats.totalRevenue)}</p>
                </div>
                <div className="p-6 bg-emerald-50 rounded-2xl border border-emerald-200">
                    <p className="text-xs font-bold text-emerald-600 uppercase mb-1">Μεικτο Κερδος</p>
                    <p className="text-3xl font-black text-emerald-700">{formatCurrency(stats.totalProfit)}</p>
                    <p className="text-[10px] font-bold text-emerald-500">Περιθώριο: {stats.avgMargin.toFixed(1)}%</p>
                </div>
            </section>

            <section className="mb-10 break-avoid">
                <h2 className="text-sm font-black text-slate-800 uppercase border-l-4 border-blue-500 pl-3 mb-6">Αποδοση ανα Κατηγορια</h2>
                <table className="w-full text-xs text-left border-collapse">
                    <thead>
                        <tr className="bg-slate-100 font-bold text-slate-600 border-b border-slate-200">
                            <th className="p-3">Κατηγορία</th>
                            <th className="p-3 text-right">Έσοδα</th>
                            <th className="p-3 text-right">Κόστος Υλικών</th>
                            <th className="p-3 text-right">Μεικτό Κέρδος</th>
                            <th className="p-3 text-right">Margin %</th>
                        </tr>
                    </thead>
                    <tbody>
                        {stats.categoryChartData.map((cat: any, idx: number) => (
                            <tr key={idx} className="border-b border-slate-100">
                                <td className="p-3 font-bold">{cat.name}</td>
                                <td className="p-3 text-right font-mono">{formatCurrency(cat.revenue)}</td>
                                <td className="p-3 text-right font-mono text-slate-400">{formatCurrency(cat.cost)}</td>
                                <td className="p-3 text-right font-mono font-bold text-emerald-600">{formatCurrency(cat.profit)}</td>
                                <td className="p-3 text-right font-bold">{((cat.profit / cat.revenue) * 100).toFixed(1)}%</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </section>

            <section className="break-avoid">
                <h2 className="text-sm font-black text-slate-800 uppercase border-l-4 border-amber-500 pl-3 mb-6">Αναλυση Υλικων (Forensics)</h2>
                <div className="grid grid-cols-2 gap-6">
                    <div className="p-5 border border-slate-200 rounded-xl">
                        <p className="text-[10px] font-bold text-slate-400 uppercase">Συνολικό Ασήμι που Πουλήθηκε</p>
                        <p className="text-xl font-black">{stats.silverSoldKg.toFixed(3)} kg</p>
                    </div>
                    <div className="p-5 border border-slate-200 rounded-xl">
                        <p className="text-[10px] font-bold text-slate-400 uppercase">Σύνολο Πετρών/Υλικών</p>
                        <p className="text-xl font-black">{stats.stonesSold} τεμάχια</p>
                    </div>
                </div>
            </section>

            <footer className="mt-20 pt-4 border-t border-slate-200 text-center text-[8px] text-slate-400 uppercase tracking-widest">
                Παραγωγή Αναφοράς: Ilios Kosmima ERP BI Engine • Σελίδα 1
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
    let silverSoldWeight = 0;
    let stonesSold = 0;
    
    const categoryStats: Record<string, { name: string, revenue: number, profit: number, cost: number }> = {};
    const salesOverTime: Record<string, number> = {};
    const customerRanking: Record<string, { name: string, revenue: number, orders: number }> = {};
    const skuRanking: Record<string, { sku: string, qty: number, revenue: number, img: string | null }> = {};

    validOrders.forEach(order => {
        totalRevenue += order.total_price;
        
        // Customer ranking
        const cKey = order.customer_id || order.customer_name;
        if (!customerRanking[cKey]) customerRanking[cKey] = { name: order.customer_name, revenue: 0, orders: 0 };
        customerRanking[cKey].revenue += order.total_price;
        customerRanking[cKey].orders += 1;

        // Time series
        const dateKey = new Date(order.created_at).toLocaleDateString('el-GR', { month: 'short', day: 'numeric' });
        salesOverTime[dateKey] = (salesOverTime[dateKey] || 0) + order.total_price;

        order.items.forEach(item => {
            const product = products.find(p => p.sku === item.sku);
            if (!product) return;

            const revenue = item.price_at_order * item.quantity;
            
            // Find specific cost for this line
            let unitCost = product.active_price;
            if (item.variant_suffix) {
                const v = product.variants?.find(variant => variant.suffix === item.variant_suffix);
                if (v?.active_price) unitCost = v.active_price;
            }
            
            const lineCost = unitCost * item.quantity;
            const profit = revenue - lineCost;
            totalProfit += profit;

            // Material tracking
            silverSoldWeight += (product.weight_g * item.quantity);
            product.recipe.forEach(ri => {
                if (ri.type === 'raw') {
                    const mat = materials.find(m => m.id === ri.id);
                    if (mat?.type === MaterialType.Stone) stonesSold += (ri.quantity * item.quantity);
                }
            });

            // Category tracking
            const mainCat = product.category.split(' ')[0];
            if (!categoryStats[mainCat]) categoryStats[mainCat] = { name: mainCat, revenue: 0, profit: 0, cost: 0 };
            categoryStats[mainCat].revenue += revenue;
            categoryStats[mainCat].profit += profit;
            categoryStats[mainCat].cost += lineCost;

            // SKU Ranking
            const sKey = item.sku + (item.variant_suffix || '');
            if (!skuRanking[sKey]) skuRanking[sKey] = { sku: sKey, qty: 0, revenue: 0, img: product.image_url };
            skuRanking[sKey].qty += item.quantity;
            skuRanking[sKey].revenue += revenue;
        });
    });

    const categoryChartData = Object.values(categoryStats).sort((a, b) => b.revenue - a.revenue);
    const timeChartData = Object.entries(salesOverTime).map(([name, value]) => ({ name, value }));
    const topCustomers = Object.values(customerRanking).sort((a, b) => b.revenue - a.revenue).slice(0, 5);
    const topSkus = Object.values(skuRanking).sort((a, b) => b.revenue - a.revenue).slice(0, 10);

    return {
        totalRevenue,
        totalProfit,
        avgMargin: totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0,
        silverSoldKg: silverSoldWeight / 1000,
        stonesSold,
        categoryChartData,
        timeChartData,
        topCustomers,
        topSkus
    };
  }, [orders, products, materials]);

  if (!stats) return <div className="p-20 text-center flex flex-col items-center gap-4"><Loader2 className="animate-spin text-blue-500" size={40}/> <p className="font-bold text-slate-500">Υπολογισμός Οικονομικών Δεδομένων...</p></div>;

  return (
    <>
    <AnalyticsPrintReport stats={stats} />

    <div className="max-w-7xl mx-auto space-y-8 pb-20 no-print animate-in fade-in duration-500">
        
        {/* HEADER */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-[2.5rem] shadow-sm border border-slate-100">
            <div className="flex items-center gap-4">
                {onBack && (
                  <button onClick={onBack} className="p-3 hover:bg-slate-100 rounded-2xl text-slate-400 hover:text-slate-800 transition-all">
                    <ArrowLeft size={20}/>
                  </button>
                )}
                <div>
                    <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-3">
                        <div className="p-2.5 bg-blue-600 text-white rounded-2xl shadow-lg">
                            <TrendingUp size={24} />
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
            <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm flex flex-col justify-between h-40 relative overflow-hidden group">
                <div className="absolute right-0 top-0 p-6 opacity-5 text-blue-600 scale-150 group-hover:scale-110 transition-transform"><DollarSign size={80}/></div>
                <div className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    Συνολικα Εσοδα (Τζιρος) <HelpCircle size={10} title="Το σύνολο των πωλήσεων χωρίς αφαίρεση εξόδων."/>
                </div>
                <h3 className="text-4xl font-black text-slate-900 tracking-tighter">{formatCurrency(stats.totalRevenue)}</h3>
            </div>

            <div className="bg-[#060b00] p-8 rounded-[2.5rem] shadow-xl flex flex-col justify-between h-40 relative overflow-hidden group">
                <div className="absolute right-0 top-0 p-6 opacity-10 text-white scale-150 group-hover:scale-110 transition-transform"><TrendingUp size={80}/></div>
                <div className="flex items-center gap-2 text-[10px] font-black text-emerald-400 uppercase tracking-widest">
                    Μεικτο Κερδος <HelpCircle size={10} title="Έσοδα μείον το κόστος παραγωγής (Μέταλλο, Εργατικά, Πέτρες)."/>
                </div>
                <div>
                    <h3 className="text-4xl font-black text-white tracking-tighter">{formatCurrency(stats.totalProfit)}</h3>
                    <p className="text-xs text-emerald-500 font-bold mt-1">Απόδοση: {stats.avgMargin.toFixed(1)}%</p>
                </div>
            </div>

            <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm flex flex-col justify-between h-40 relative overflow-hidden group">
                <div className="absolute right-0 top-0 p-6 opacity-5 text-slate-600 scale-150 group-hover:scale-110 transition-transform"><Scale size={80}/></div>
                <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Καταναλωση Ασημιου</div>
                <h3 className="text-4xl font-black text-slate-900 tracking-tighter">{stats.silverSoldKg.toFixed(3)} <span className="text-xl text-slate-400 font-medium">kg</span></h3>
            </div>

            <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm flex flex-col justify-between h-40 relative overflow-hidden group">
                <div className="absolute right-0 top-0 p-6 opacity-5 text-purple-600 scale-150 group-hover:scale-110 transition-transform"><Gem size={80}/></div>
                <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Υλικα & Πετρες</div>
                <h3 className="text-4xl font-black text-slate-900 tracking-tighter">{stats.stonesSold} <span className="text-xl text-slate-400 font-medium">τεμ</span></h3>
            </div>
        </div>

        {/* MIDDLE SECTION: PROFITABILITY & TRENDS */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            
            {/* Category Profitability */}
            <div className="lg:col-span-8 bg-white p-10 rounded-[3rem] border border-slate-100 shadow-sm">
                <div className="flex justify-between items-center mb-10">
                    <div>
                        <h3 className="font-black text-slate-800 text-xl flex items-center gap-2">
                            <PieIcon size={24} className="text-blue-500"/> Ανάλυση Κερδοφορίας ανά Κατηγορία
                        </h3>
                        <p className="text-sm text-slate-400 font-medium mt-1">Σύγκριση εσόδων και πραγματικού κέρδους ανά είδος.</p>
                    </div>
                </div>
                <div className="h-[400px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={stats.categoryChartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                            <XAxis dataKey="name" tick={{fontSize: 11, fontWeight: 'bold'}} stroke="#94a3b8" />
                            <YAxis tick={{fontSize: 11}} stroke="#94a3b8" />
                            <Tooltip 
                                contentStyle={{borderRadius: '24px', border: 'none', boxShadow: '0 20px 40px rgba(0,0,0,0.1)', padding: '20px'}}
                                formatter={(value: number, name: string) => [formatCurrency(value), name === 'revenue' ? 'Συνολικά Έσοδα' : 'Καθαρό Κέρδος']}
                            />
                            <Legend iconType="circle" wrapperStyle={{paddingTop: '20px'}} />
                            <Bar dataKey="revenue" name="Έσοδα" fill="#3b82f6" radius={[8, 8, 0, 0]} barSize={40} />
                            <Bar dataKey="profit" name="Κέρδος" fill="#10b981" radius={[8, 8, 0, 0]} barSize={30} />
                        </ComposedChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Top Customers Card */}
            <div className="lg:col-span-4 bg-white p-10 rounded-[3rem] border border-slate-100 shadow-sm flex flex-col">
                <h3 className="font-black text-slate-800 text-xl mb-8 flex items-center gap-2">
                    <Users size={24} className="text-amber-500"/> Top Πελάτες
                </h3>
                <div className="space-y-4 flex-1 overflow-y-auto custom-scrollbar pr-2">
                    {stats.topCustomers.map((c, i) => (
                        <div key={i} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 group hover:bg-white hover:border-blue-200 transition-all">
                            <div className="flex items-center gap-3">
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm ${i === 0 ? 'bg-amber-100 text-amber-600' : 'bg-white text-slate-400'}`}>
                                    {i + 1}
                                </div>
                                <div>
                                    <div className="font-bold text-slate-800 text-sm truncate max-w-[120px]">{c.name}</div>
                                    <div className="text-[10px] text-slate-400 font-bold uppercase">{c.orders} παραγγελίες</div>
                                </div>
                            </div>
                            <div className="font-black text-slate-900">{formatCurrency(c.revenue)}</div>
                        </div>
                    ))}
                    {stats.topCustomers.length === 0 && <div className="text-center py-20 text-slate-400 italic">Δεν υπάρχουν δεδομένα.</div>}
                </div>
            </div>
        </div>

        {/* BOTTOM SECTION: TOP PRODUCTS */}
        <div className="bg-white rounded-[3rem] border border-slate-100 shadow-sm overflow-hidden">
            <div className="p-10 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                <div>
                    <h3 className="font-black text-slate-800 text-xl flex items-center gap-2">
                        <Award size={28} className="text-amber-500"/> Προϊόντα με την Μεγαλύτερη Απόδοση
                    </h3>
                    <p className="text-sm text-slate-400 font-medium mt-1">Κατάταξη βάσει συνολικών εσόδων.</p>
                </div>
                <span className="text-[10px] bg-[#060b00] text-white px-4 py-2 rounded-full font-black uppercase tracking-wider">Top 10 Performers</span>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-slate-400 font-black uppercase text-[10px] tracking-widest">
                        <tr>
                            <th className="p-6 w-20 text-center">Καταταξη</th>
                            <th className="p-6">Προϊον / SKU</th>
                            <th className="p-6 text-center">Ποσοτητα</th>
                            <th className="p-6 text-right pr-12">Συνολικα Εσοδα</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                        {stats.topSkus.map((p: any, idx: number) => (
                            <tr key={idx} className="hover:bg-slate-50/80 transition-colors group">
                                <td className="p-6 text-center font-black text-slate-300 group-hover:text-amber-500 transition-colors">#{idx + 1}</td>
                                <td className="p-6">
                                    <div className="flex items-center gap-4">
                                        <div className="w-14 h-14 bg-white rounded-2xl overflow-hidden shrink-0 border border-slate-100 shadow-sm">
                                            {p.img ? <img src={p.img} className="w-full h-full object-cover"/> : <div className="w-full h-full flex items-center justify-center text-slate-200"><ImageIcon size={20}/></div>}
                                        </div>
                                        <span className="font-black text-slate-900 text-lg">{p.sku}</span>
                                    </div>
                                </td>
                                <td className="p-6 text-center font-black text-slate-800 text-lg">{p.qty}</td>
                                <td className="p-6 text-right pr-12 font-mono font-black text-[#060b00] text-xl">{formatCurrency(p.revenue)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>

        {/* HELP MODAL */}
        {showHelp && (
            <div className="fixed inset-0 z-[200] bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-6" onClick={() => setShowHelp(false)}>
                <div className="bg-white rounded-[3rem] p-10 max-w-2xl w-full shadow-2xl animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
                    <div className="flex justify-between items-center mb-8 border-b border-slate-100 pb-6">
                        <h2 className="text-2xl font-black text-slate-800 flex items-center gap-2"><BarChart3 className="text-blue-500"/> Οικονομικό Λεξικό</h2>
                        <button onClick={() => setShowHelp(false)} className="p-2 hover:bg-slate-100 rounded-full"><XCircle size={24} className="text-slate-300"/></button>
                    </div>
                    
                    <div className="space-y-6">
                        <div>
                            <h4 className="font-black text-slate-900 uppercase text-xs mb-2 tracking-widest text-blue-600">Έσοδα (Τζίρος)</h4>
                            <p className="text-slate-600 text-sm leading-relaxed">Είναι το συνολικό ποσό που προκύπτει από τις πωλήσεις σας, χωρίς να αφαιρεθεί κανένα κόστος. Είναι η ένδειξη της εμπορικής σας κίνησης.</p>
                        </div>
                        <div>
                            <h4 className="font-black text-slate-900 uppercase text-xs mb-2 tracking-widest text-emerald-600">Μεικτό Κέρδος</h4>
                            <p className="text-slate-600 text-sm leading-relaxed">Το ποσό που μένει αφού αφαιρέσετε το <strong>Πραγματικό Κόστος Παραγωγής</strong> (Ασήμι + Εργατικά + Υλικά/Πέτρες). Δεν περιλαμβάνει λειτουργικά έξοδα όπως ενοίκια ή ρεύμα.</p>
                        </div>
                        <div>
                            <h4 className="font-black text-slate-900 uppercase text-xs mb-2 tracking-widest text-amber-600">Περιθώριο (Margin)</h4>
                            <p className="text-slate-600 text-sm leading-relaxed">Το ποσοστό του κέρδους επί της τιμής πώλησης. Για παράδειγμα, αν ένα κόσμημα πουλιέται 100€ και κερδίζετε 40€, το Margin είναι 40%.</p>
                        </div>
                        <div>
                            <h4 className="font-black text-slate-900 uppercase text-xs mb-2 tracking-widest text-purple-600">Forensics (Ανάλυση Υλικών)</h4>
                            <p className="text-slate-600 text-sm leading-relaxed">Η αναφορά υπολογίζει ακριβώς πόσο ασήμι και πόσες πέτρες έχουν φύγει από το εργαστήριο βάσει των "Συνταγών" που έχετε ορίσει για κάθε κωδικό.</p>
                        </div>
                    </div>
                    
                    <button onClick={() => setShowHelp(false)} className="w-full mt-10 bg-slate-900 text-white py-4 rounded-2xl font-bold">Έγινε Κατανοητό</button>
                </div>
            </div>
        )}
    </div>
    </>
  );
}
