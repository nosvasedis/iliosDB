import React, { useState, useMemo } from 'react';
import { Product, GlobalSettings, Order, ProductionBatch, OrderStatus, ProductionStage } from '../types';
import { 
  TrendingUp, 
  Package, 
  AlertTriangle, 
  Layers, 
  ArrowUpRight, 
  DollarSign, 
  Factory, 
  Activity, 
  PieChart, 
  BarChart3, 
  Coins, 
  Clock, 
  CheckCircle,
  Wallet,
  Scale,
  BrainCircuit,
  Sparkles,
  ArrowDownRight,
  Target,
  Zap,
  Loader2
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  PieChart as RePieChart, 
  Pie, 
  Cell, 
  AreaChart, 
  Area,
  Legend
} from 'recharts';
import { formatCurrency, formatDecimal } from '../utils/pricingEngine';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/supabase';
import { analyzeBusinessHealth } from '../lib/gemini';
import { useUI } from './UIProvider';

interface Props {
  products: Product[];
  settings: GlobalSettings;
}

const STATUS_LABELS: Record<string, string> = {
    [OrderStatus.Pending]: 'Εκκρεμεί',
    [OrderStatus.InProduction]: 'Σε Παραγωγή',
    [OrderStatus.Ready]: 'Έτοιμο',
    [OrderStatus.Delivered]: 'Παραδόθηκε',
    [OrderStatus.Cancelled]: 'Ακυρώθηκε',
};

const STAGE_LABELS: Record<string, string> = {
    [ProductionStage.AwaitingDelivery]: 'Αναμονή',
    [ProductionStage.Waxing]: 'Λάστιχα/Κεριά',
    [ProductionStage.Casting]: 'Χυτήριο',
    [ProductionStage.Setting]: 'Καρφωτής',
    [ProductionStage.Polishing]: 'Τεχνίτης',
    [ProductionStage.Labeling]: 'Πακετάρισμα',
    [ProductionStage.Ready]: 'Έτοιμα'
};

const COLORS = ['#059669', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#6366f1', '#ec4899', '#14b8a6'];

export default function Dashboard({ products, settings }: Props) {
  const [activeTab, setActiveTab] = useState<'overview' | 'financials' | 'production' | 'inventory' | 'smart'>('overview');
  const [aiReport, setAiReport] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const { showToast } = useUI();

  const { data: orders } = useQuery({ queryKey: ['orders'], queryFn: api.getOrders });
  const { data: batches } = useQuery({ queryKey: ['batches'], queryFn: api.getProductionBatches });

  // --- 1. AGGREGATE DATA CALCULATIONS ---
  const stats = useMemo(() => {
    const sellableProducts = products.filter(p => !p.is_component);
    const totalStockQty = products.reduce((acc, p) => acc + p.stock_qty, 0);
    const lowStockCount = products.filter(p => p.stock_qty < 5).length;
    
    let totalCostValue = 0; 
    let totalPotentialRevenue = 0; 
    let totalSilverWeight = 0;

    products.forEach(p => {
        totalCostValue += (p.active_price * p.stock_qty);
        if (!p.is_component) {
            totalPotentialRevenue += (p.selling_price * p.stock_qty);
        }
        totalSilverWeight += (p.weight_g * p.stock_qty);
    });

    // Margin Analysis Extremes
    const pricedItems = sellableProducts.filter(p => p.selling_price > 0);
    const sortedByMargin = [...pricedItems].sort((a, b) => {
        const marginA = (a.selling_price - a.active_price) / a.selling_price;
        const marginB = (b.selling_price - b.active_price) / b.selling_price;
        return marginB - marginA;
    });

    const potentialMargin = totalPotentialRevenue - totalCostValue;
    const marginPercent = totalPotentialRevenue > 0 ? (potentialMargin / totalPotentialRevenue) * 100 : 0;

    const activeOrders = orders?.filter(o => o.status === OrderStatus.Pending || o.status === OrderStatus.InProduction) || [];
    const completedOrders = orders?.filter(o => o.status === OrderStatus.Delivered) || [];
    const pendingRevenue = activeOrders.reduce((acc, o) => acc + o.total_price, 0);
    const totalRevenue = completedOrders.reduce((acc, o) => acc + o.total_price, 0);

    const activeBatches = batches?.filter(b => b.current_stage !== ProductionStage.Ready) || [];
    
    return {
        totalStockQty,
        lowStockCount,
        totalCostValue,
        totalPotentialRevenue,
        totalSilverWeight,
        potentialMargin,
        marginPercent,
        activeOrdersCount: activeOrders.length,
        pendingRevenue,
        totalRevenue,
        activeBatchesCount: activeBatches.length,
        totalItemsInProduction: activeBatches.reduce((acc, b) => acc + b.quantity, 0),
        bestMargins: sortedByMargin.slice(0, 3),
        worstMargins: sortedByMargin.slice(-3).reverse()
    };
  }, [products, orders, batches]);

  // --- 2. AI ANALYSIS TRIGGER ---
  const handleRunAiAudit = async () => {
      setIsAnalyzing(true);
      try {
          const report = await analyzeBusinessHealth({
              products: products.filter(p => !p.is_component),
              orders: orders || [],
              silverPrice: settings.silver_price_gram
          });
          setAiReport(report);
          showToast("Η ανάλυση ολοκληρώθηκε!", "success");
      } catch (err: any) {
          showToast(err.message, "error");
      } finally {
          setIsAnalyzing(false);
      }
  };

  // --- 3. CHART DATA ---
  const categoryData = useMemo(() => {
      const counts: Record<string, number> = {};
      products.filter(p => !p.is_component).forEach(p => {
          const cat = p.category.split(' ')[0]; 
          counts[cat] = (counts[cat] || 0) + 1;
      });
      return Object.entries(counts).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 8);
  }, [products]);

  const productionStageData = useMemo(() => {
      if (!batches) return [];
      const stages: Record<string, number> = {};
      batches.forEach(b => {
          if (b.current_stage !== ProductionStage.Ready) {
              const label = STAGE_LABELS[b.current_stage] || b.current_stage;
              stages[label] = (stages[label] || 0) + b.quantity;
          }
      });
      return Object.entries(stages).map(([name, value]) => ({ name, value }));
  }, [batches]);

  // --- RENDER HELPERS ---
  const KPICard = ({ title, value, subValue, icon, colorClass }: { title: string, value: string, subValue?: string, icon: React.ReactNode, colorClass: string }) => (
      <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between hover:shadow-md transition-all relative overflow-hidden group">
          <div className={`absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform duration-500 ${colorClass}`}>
              {React.cloneElement(icon as React.ReactElement<any>, { size: 64 })}
          </div>
          <div>
              <p className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-2">{title}</p>
              <h3 className="text-3xl font-black text-slate-800 tracking-tight">{value}</h3>
          </div>
          {subValue && (
              <div className="mt-4">
                  <div className={`text-xs font-bold px-2 py-1 rounded-full bg-slate-50 inline-flex items-center gap-1 ${colorClass}`}>
                      {subValue}
                  </div>
              </div>
          )}
      </div>
  );

  return (
    <div className="space-y-8 pb-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-bold text-[#060b00] tracking-tight">Πίνακας Ελέγχου</h1>
          <p className="text-slate-500 mt-2 font-medium">Έξυπνη επισκόπηση και ανάλυση κερδοφορίας.</p>
        </div>
        
        <div className="bg-white p-1.5 rounded-2xl border border-slate-100 shadow-sm flex overflow-x-auto scrollbar-hide">
            {[
                { id: 'overview', label: 'Επισκόπηση', icon: Activity },
                { id: 'financials', label: 'Οικονομικά', icon: DollarSign },
                { id: 'production', label: 'Παραγωγή', icon: Factory },
                { id: 'inventory', label: 'Αποθήκη', icon: Package },
                { id: 'smart', label: 'Ilios AI', icon: BrainCircuit },
            ].map(tab => (
                <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`
                        flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all whitespace-nowrap
                        ${activeTab === tab.id 
                            ? (tab.id === 'smart' ? 'bg-emerald-600 text-white shadow-emerald-200' : 'bg-[#060b00] text-white shadow-md') 
                            : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'}
                    `}
                >
                    <tab.icon size={16} className={activeTab === tab.id && tab.id === 'smart' ? 'animate-pulse' : ''} />
                    {tab.label}
                </button>
            ))}
        </div>
      </div>

      {activeTab === 'overview' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  <KPICard title="Αξία Αποθήκης" value={formatCurrency(stats.totalCostValue)} subValue={`${stats.totalStockQty} Τεμάχια`} icon={<Wallet />} colorClass="text-emerald-600" />
                  <KPICard title="Εκκρεμής Τζίρος" value={formatCurrency(stats.pendingRevenue)} subValue={`${stats.activeOrdersCount} Παραγγελίες`} icon={<Activity />} colorClass="text-blue-600" />
                  <KPICard title="Σε Παραγωγή" value={stats.totalItemsInProduction.toString()} subValue={`${stats.activeBatchesCount} Παρτίδες`} icon={<Factory />} colorClass="text-amber-600" />
                  <KPICard title="Τιμή Ασημιού" value={`${formatDecimal(settings.silver_price_gram, 3)} €/g`} subValue="Τρέχουσα Αγορά" icon={<Coins />} colorClass="text-slate-600" />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <div className="lg:col-span-2 bg-white p-8 rounded-3xl border border-slate-100 shadow-sm">
                      <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2 mb-6">
                          <PieChart size={20} className="text-blue-500"/> Κατανομή Κατηγοριών
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
                          <div className="h-64">
                              <ResponsiveContainer width="100%" height="100%">
                                  <RePieChart>
                                      <Pie data={categoryData} innerRadius={0} outerRadius={80} dataKey="value" stroke="white" strokeWidth={2}>
                                          {categoryData.map((_, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                                      </Pie>
                                      <Tooltip contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)'}} />
                                  </RePieChart>
                              </ResponsiveContainer>
                          </div>
                          <div className="space-y-2">
                              {categoryData.map((item, idx) => (
                                  <div key={item.name} className="flex items-center justify-between text-sm">
                                      <div className="flex items-center gap-2">
                                          <div className="w-2.5 h-2.5 rounded-full" style={{backgroundColor: COLORS[idx % COLORS.length]}}></div>
                                          <span className="font-bold text-slate-600">{item.name}</span>
                                      </div>
                                      <span className="font-black text-slate-400">{item.value}</span>
                                  </div>
                              ))}
                          </div>
                      </div>
                  </div>

                  <div className="bg-gradient-to-br from-[#060b00] to-emerald-900 p-8 rounded-3xl text-white shadow-xl flex flex-col justify-center gap-6 relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -mr-10 -mt-10 blur-2xl"></div>
                        <div className="text-center relative z-10">
                            <p className="text-emerald-200/60 text-[10px] font-bold uppercase tracking-widest mb-2">Κεφάλαιο σε Μέταλλο</p>
                            <h3 className="text-4xl font-black tracking-tight">{formatDecimal(stats.totalSilverWeight / 1000, 2)} <span className="text-lg opacity-40 font-medium">kg</span></h3>
                            <div className="bg-emerald-500/20 rounded-xl py-2 px-4 mt-4 inline-block border border-emerald-500/30">
                                <p className="text-emerald-300 font-bold text-lg">≈ {formatCurrency(stats.totalSilverWeight * settings.silver_price_gram)}</p>
                            </div>
                        </div>
                  </div>
              </div>
          </div>
      )}

      {activeTab === 'financials' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <KPICard title="Συνολικά Έσοδα" value={formatCurrency(stats.totalRevenue)} icon={<DollarSign/>} colorClass="text-emerald-600" />
                  <KPICard title="Εκτιμώμενο Κέρδος" value={formatCurrency(stats.potentialMargin)} subValue={`${stats.marginPercent.toFixed(1)}% Περιθώριο`} icon={<TrendingUp/>} colorClass="text-blue-600" />
                  <KPICard title="Αξία Αποθέματος (Retail)" value={formatCurrency(stats.totalPotentialRevenue * 3)} icon={<Target/>} colorClass="text-purple-600" />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm">
                      <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
                          <ArrowUpRight size={20} className="text-emerald-500" /> Υψηλότερο Περιθώριο (%)
                      </h3>
                      <div className="space-y-4">
                          {stats.bestMargins.map(p => {
                              const m = ((p.selling_price - p.active_price) / p.selling_price * 100).toFixed(0);
                              return (
                                  <div key={p.sku} className="flex items-center justify-between p-4 bg-emerald-50/50 rounded-2xl border border-emerald-100">
                                      <div className="font-bold text-slate-800">{p.sku} <span className="text-xs font-medium text-slate-500 ml-2">{p.category}</span></div>
                                      <div className="flex items-center gap-3">
                                          <div className="text-right">
                                              <div className="text-xs font-bold text-emerald-700">{m}%</div>
                                              <div className="text-[10px] text-slate-400">Profit: {formatCurrency(p.selling_price - p.active_price)}</div>
                                          </div>
                                      </div>
                                  </div>
                              );
                          })}
                      </div>
                  </div>
                  
                  <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm">
                      <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
                          <ArrowDownRight size={20} className="text-rose-500" /> Χαμηλότερο Περιθώριο (%)
                      </h3>
                      <div className="space-y-4">
                          {stats.worstMargins.map(p => {
                              const m = ((p.selling_price - p.active_price) / p.selling_price * 100).toFixed(0);
                              return (
                                  <div key={p.sku} className="flex items-center justify-between p-4 bg-rose-50/50 rounded-2xl border border-rose-100">
                                      <div className="font-bold text-slate-800">{p.sku} <span className="text-xs font-medium text-slate-500 ml-2">{p.category}</span></div>
                                      <div className="flex items-center gap-3">
                                          <div className="text-right">
                                              <div className="text-xs font-bold text-rose-700">{m}%</div>
                                              <div className="text-[10px] text-slate-400">Profit: {formatCurrency(p.selling_price - p.active_price)}</div>
                                          </div>
                                      </div>
                                  </div>
                              );
                          })}
                      </div>
                  </div>
              </div>
          </div>
      )}

      {activeTab === 'production' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
              <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm">
                  <h3 className="font-bold text-slate-800 mb-8 flex items-center gap-2">
                      <Factory size={20} className="text-amber-500" /> Φόρτος Εργασίας ανά Στάδιο
                  </h3>
                  <div className="h-80">
                      <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={productionStageData}>
                              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9"/>
                              <XAxis dataKey="name" tick={{fontSize: 11, fontWeight: 'bold'}} interval={0} height={50}/>
                              <YAxis tick={{fontSize: 12}} allowDecimals={false} />
                              <Tooltip cursor={{fill: '#f8fafc'}} contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)'}} />
                              <Bar dataKey="value" fill="#f59e0b" radius={[6, 6, 0, 0]} name="Τεμάχια" barSize={60} />
                          </BarChart>
                      </ResponsiveContainer>
                  </div>
              </div>
          </div>
      )}

      {activeTab === 'inventory' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  <KPICard title="Σύνολο Κωδικών" value={products.length.toString()} icon={<Layers/>} colorClass="text-slate-600" />
                  <KPICard title="Σύνολο Τεμαχίων" value={stats.totalStockQty.toString()} icon={<Package/>} colorClass="text-blue-600" />
                  <KPICard title="Κόστος Αποθέματος" value={formatCurrency(stats.totalCostValue)} icon={<Scale/>} colorClass="text-amber-600" />
                  <KPICard title="Silver Weight" value={`${formatDecimal(stats.totalSilverWeight, 0)}g`} icon={<Coins/>} colorClass="text-slate-500" />
              </div>

              <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm">
                  <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
                      <AlertTriangle size={20} className="text-amber-500" /> Χαμηλό Απόθεμα
                  </h3>
                  <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                          <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-xs">
                              <tr>
                                  <th className="p-4 rounded-l-xl">SKU</th>
                                  <th className="p-4">Κατηγορία</th>
                                  <th className="p-4 text-center">Στοκ</th>
                                  <th className="p-4 rounded-r-xl">Κατάσταση</th>
                              </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-50">
                              {products.filter(p => p.stock_qty < 5).slice(0, 5).map(p => (
                                  <tr key={p.sku} className="hover:bg-slate-50/50 transition-colors">
                                      <td className="p-4 font-bold text-slate-800">{p.sku}</td>
                                      <td className="p-4 text-slate-500">{p.category}</td>
                                      <td className="p-4 text-center font-black">{p.stock_qty}</td>
                                      <td className="p-4">
                                          <span className={`px-2 py-1 rounded-md text-[10px] font-black uppercase ${p.stock_qty === 0 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                                              {p.stock_qty === 0 ? 'Εξαντλημένο' : 'Χαμηλό'}
                                          </span>
                                      </td>
                                  </tr>
                              ))}
                          </tbody>
                      </table>
                  </div>
              </div>
          </div>
      )}

      {activeTab === 'smart' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="bg-gradient-to-br from-emerald-600 to-teal-800 rounded-[2.5rem] p-10 text-white shadow-2xl relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-10 opacity-10 rotate-12">
                      <BrainCircuit size={200} />
                  </div>
                  
                  <div className="max-w-2xl relative z-10">
                      <div className="flex items-center gap-3 mb-4">
                          <div className="p-3 bg-white/20 rounded-2xl backdrop-blur-md">
                              <Sparkles className="text-yellow-300" size={28} />
                          </div>
                          <h2 className="text-3xl font-black tracking-tight">Ilios Business Intelligence</h2>
                      </div>
                      <p className="text-emerald-50 text-lg leading-relaxed mb-8 opacity-90">
                          Το Ilios AI αναλύει το μητρώο σας, τις τιμές του ασημιού και το ιστορικό πωλήσεων για να εντοπίσει ευκαιρίες κέρδους και κρυφούς κινδύνους.
                      </p>
                      <button 
                        onClick={handleRunAiAudit}
                        disabled={isAnalyzing}
                        className="bg-white text-emerald-800 px-8 py-4 rounded-2xl font-black text-lg shadow-xl hover:bg-emerald-50 transition-all flex items-center gap-3 disabled:opacity-50"
                      >
                          {isAnalyzing ? <Loader2 size={24} className="animate-spin" /> : <Zap size={24} className="fill-current" />}
                          {isAnalyzing ? 'Ανάλυση σε εξέλιξη...' : 'Δημιουργία Smart Report'}
                      </button>
                  </div>
              </div>

              {aiReport && (
                  <div className="bg-white p-10 rounded-[2.5rem] border border-slate-100 shadow-sm animate-in zoom-in-95 duration-500">
                      <div className="prose prose-slate max-w-none prose-headings:font-black prose-p:leading-relaxed prose-li:font-medium">
                          {aiReport.split('\n').map((line, i) => (
                              <p key={i} className="mb-2">{line}</p>
                          ))}
                      </div>
                      <div className="mt-10 pt-8 border-t border-slate-100 flex items-center gap-2 text-slate-400 text-xs font-bold uppercase tracking-widest">
                          <CheckCircle size={14} className="text-emerald-500" /> Verified by Gemini 3 Flash Intelligence
                      </div>
                  </div>
              )}

              {!aiReport && !isAnalyzing && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 opacity-60 grayscale transition-all hover:grayscale-0 hover:opacity-100">
                      <div className="bg-white p-8 rounded-3xl border border-slate-200 border-dashed text-center space-y-4">
                          <div className="w-12 h-12 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center mx-auto"><Target size={24}/></div>
                          <h4 className="font-bold text-slate-700">Audit Τιμών</h4>
                          <p className="text-xs text-slate-500">Εντοπισμός προϊόντων με λάθος περιθώρια.</p>
                      </div>
                      <div className="bg-white p-8 rounded-3xl border border-slate-200 border-dashed text-center space-y-4">
                          <div className="w-12 h-12 bg-amber-50 text-amber-500 rounded-full flex items-center justify-center mx-auto"><Scale size={24}/></div>
                          <h4 className="font-bold text-slate-700">Risk Management</h4>
                          <p className="text-xs text-slate-500">Πρόβλεψη επιπτώσεων από άνοδο ασημιού.</p>
                      </div>
                      <div className="bg-white p-8 rounded-3xl border border-slate-200 border-dashed text-center space-y-4">
                          <div className="w-12 h-12 bg-emerald-50 text-emerald-500 rounded-full flex items-center justify-center mx-auto"><TrendingUp size={24}/></div>
                          <h4 className="font-bold text-slate-700">Growth Strategy</h4>
                          <p className="text-xs text-slate-500">Προτάσεις για βελτίωση του product mix.</p>
                      </div>
                  </div>
              )}
          </div>
      )}
    </div>
  );
}
