
import React, { useState, useMemo } from 'react';
import { Product, GlobalSettings, Order, ProductionBatch, OrderStatus, ProductionStage, Gender } from '../types';
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
  Loader2,
  FileText,
  Lightbulb,
  ShieldCheck,
  Rocket,
  Filter
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

/**
 * Premium UI Renderer for AI Business Audit.
 * Replaces ugly markdown with functional UI cards.
 */
const SmartReportRenderer = ({ text }: { text: string }) => {
    // Split by [TITLE] and [/TITLE] tags
    const parts = text.split(/\[TITLE\]|\[\/TITLE\]/).filter(p => p.trim());
    
    // Fallback if AI didn't follow the specific tagging format perfectly
    if (parts.length < 2) {
        return (
            <div className="p-8 bg-slate-50 rounded-[2rem] text-slate-700 leading-relaxed whitespace-pre-wrap border border-slate-100">
                {text.replace(/\*/g, '').replace(/#/g, '')}
            </div>
        );
    }

    const sections: { title: string; content: string[] }[] = [];
    for (let i = 0; i < parts.length; i += 2) {
        if (parts[i] && parts[i+1]) {
            sections.push({
                title: parts[i].trim(),
                content: parts[i+1].trim().split('\n').filter(l => l.trim())
            });
        }
    }

    const getIcon = (title: string) => {
        const t = title.toLowerCase();
        if (t.includes('κερδ') || t.includes('τιμ')) return <Target className="text-rose-500" size={18}/>;
        if (t.includes('αποθ') || t.includes('risk') || t.includes('κίνδ')) return <Scale className="text-amber-500" size={18}/>;
        if (t.includes('στρατ') || t.includes('πρότ') || t.includes('growth')) return <Rocket className="text-emerald-500" size={18}/>;
        return <Activity className="text-blue-500" size={18}/>;
    };

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {sections.map((sec, idx) => (
                <div key={idx} className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm hover:shadow-md transition-all group">
                    <div className="flex items-center gap-3 mb-5 border-b border-slate-50 pb-3">
                        <div className="p-2.5 bg-slate-50 rounded-xl group-hover:scale-110 transition-transform duration-300">
                            {getIcon(sec.title)}
                        </div>
                        <h4 className="font-black text-slate-800 uppercase text-xs tracking-widest">{sec.title}</h4>
                    </div>
                    <ul className="space-y-3.5">
                        {sec.content.map((line, lidx) => (
                            <li key={lidx} className="flex gap-3 items-start">
                                <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-slate-200 shrink-0 group-hover:bg-emerald-400 transition-colors" />
                                <p className="text-slate-600 text-sm leading-relaxed">
                                    {line.replace(/^- |^\* /g, '').replace(/\*\*/g, '')}
                                </p>
                            </li>
                        ))}
                    </ul>
                </div>
            ))}
        </div>
    );
};

export default function Dashboard({ products, settings }: Props) {
  const [activeTab, setActiveTab] = useState<'overview' | 'financials' | 'production' | 'inventory' | 'smart'>('overview');
  const [aiReport, setAiReport] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [categoryGenderFilter, setCategoryGenderFilter] = useState<'All' | Gender>('All');
  const { showToast } = useUI();

  const { data: orders } = useQuery({ queryKey: ['orders'], queryFn: api.getOrders });
  const { data: batches } = useQuery({ queryKey: ['batches'], queryFn: api.getProductionBatches });

  // --- Aggregate Stats ---
  const stats = useMemo(() => {
    const sellableProducts = products.filter(p => !p.is_component);
    const totalStockQty = products.reduce((acc, p) => acc + p.stock_qty, 0);
    
    let totalCostValue = 0; 
    let totalPotentialRevenue = 0; 
    let totalSilverWeight = 0;

    products.forEach(p => {
        totalCostValue += (p.active_price * p.stock_qty);
        totalSilverWeight += (p.weight_g * p.stock_qty);
        
        // Handle Potential Revenue (Summing highest of master or variants for commercial accuracy)
        if (!p.is_component) {
            if (p.variants && p.variants.length > 0) {
                // Find highest variant price or use master price
                const maxVarPrice = Math.max(...p.variants.map(v => v.selling_price || 0));
                totalPotentialRevenue += (maxVarPrice > 0 ? maxVarPrice : p.selling_price) * p.stock_qty;
            } else {
                totalPotentialRevenue += p.selling_price * p.stock_qty;
            }
        }
    });

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
    const activeBatches = batches?.filter(b => b.current_stage !== ProductionStage.Ready) || [];
    
    return {
        totalStockQty,
        totalCostValue,
        totalPotentialRevenue,
        totalSilverWeight,
        potentialMargin,
        marginPercent,
        activeOrdersCount: activeOrders.length,
        pendingRevenue: activeOrders.reduce((acc, o) => acc + o.total_price, 0),
        totalRevenue: completedOrders.reduce((acc, o) => acc + o.total_price, 0),
        activeBatchesCount: activeBatches.length,
        totalItemsInProduction: activeBatches.reduce((acc, b) => acc + b.quantity, 0),
        bestMargins: sortedByMargin.slice(0, 3),
        worstMargins: sortedByMargin.slice(-3).reverse()
    };
  }, [products, orders, batches]);

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

  const categoryData = useMemo(() => {
      const counts: Record<string, number> = {};
      products.filter(p => !p.is_component).forEach(p => {
          if (categoryGenderFilter !== 'All' && p.gender !== categoryGenderFilter) return;
          const cat = p.category.split(' ')[0]; 
          counts[cat] = (counts[cat] || 0) + 1;
      });
      return Object.entries(counts).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 8);
  }, [products, categoryGenderFilter]);

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
                  <KPICard title="Σε Παραγωγή" value={stats.totalItemsInProduction.toString()} icon={<Factory />} colorClass="text-amber-600" />
                  <KPICard title="Τιμή Ασημιού" value={`${formatDecimal(settings.silver_price_gram, 3)} €/g`} subValue="Τρέχουσα Αγορά" icon={<Coins />} colorClass="text-slate-600" />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <div className="lg:col-span-2 bg-white p-8 rounded-3xl border border-slate-100 shadow-sm">
                      <div className="flex justify-between items-center mb-6">
                          <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
                              <PieChart size={20} className="text-blue-500"/> Κατανομή Κατηγοριών
                          </h3>
                          <div className="relative">
                              <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={12} />
                              <select 
                                  value={categoryGenderFilter} 
                                  onChange={(e) => setCategoryGenderFilter(e.target.value as any)}
                                  className="bg-slate-50 border border-slate-200 text-slate-600 text-xs font-bold rounded-lg py-2 pl-7 pr-3 outline-none cursor-pointer hover:border-blue-300 transition-all appearance-none"
                              >
                                  <option value="All">Όλα τα Φύλα</option>
                                  <option value={Gender.Women}>Γυναικεία</option>
                                  <option value={Gender.Men}>Ανδρικά</option>
                                  <option value={Gender.Unisex}>Unisex</option>
                              </select>
                          </div>
                      </div>
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
                              {categoryData.length === 0 && <div className="text-slate-400 text-xs italic">Δεν βρέθηκαν δεδομένα για αυτή την επιλογή.</div>}
                          </div>
                      </div>
                  </div>

                  <div className="bg-gradient-to-br from-[#060b00] to-emerald-900 p-8 rounded-3xl text-white shadow-xl flex flex-col justify-center gap-8 relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -mr-10 -mt-10 blur-2xl"></div>
                        
                        <div className="text-center relative z-10">
                            <p className="text-emerald-200/60 text-[10px] font-bold uppercase tracking-widest mb-2">Κεφάλαιο σε Μέταλλο</p>
                            <h3 className="text-4xl font-black tracking-tight">{formatDecimal(stats.totalSilverWeight / 1000, 2)} <span className="text-lg opacity-40 font-medium">kg</span></h3>
                            <div className="bg-emerald-500/20 rounded-xl py-2 px-4 mt-4 inline-block border border-emerald-500/30">
                                <p className="text-emerald-300 font-bold text-lg">≈ {formatCurrency(stats.totalSilverWeight * settings.silver_price_gram)}</p>
                            </div>
                        </div>

                        <div className="h-px bg-white/10 w-full"></div>

                        <div className="text-center relative z-10">
                            <p className="text-emerald-200/60 text-[10px] font-bold uppercase tracking-widest mb-2">Δυνητικός Τζίρος</p>
                            <h3 className="text-3xl font-black tracking-tight text-amber-400">{formatCurrency(stats.totalPotentialRevenue)}</h3>
                            <p className="text-emerald-200/40 text-[10px] mt-1 italic">Αν πουληθεί όλο το στοκ (Χονδρική)</p>
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
                                              <div className="text-[10px] text-slate-400">Κέρδος: {formatCurrency(p.selling_price - p.active_price)}</div>
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
                                              <div className="text-[10px] text-slate-400">Κέρδος: {formatCurrency(p.selling_price - p.active_price)}</div>
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
                  <KPICard title="Μέταλλο σε Στοκ" value={`${formatDecimal(stats.totalSilverWeight, 0)}g`} icon={<Coins/>} colorClass="text-slate-500" />
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
                                          <span className={`px-2.5 py-1 rounded-md text-[10px] font-black uppercase ${p.stock_qty === 0 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
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
                          Το Ilios AI αναλύει το μητρώο σας (συμπεριλαμβανομένων των παραλλαγών), τις τιμές του ασημιού και το ιστορικό πωλήσεων για να εντοπίσει ευκαιρίες κέρδους.
                      </p>
                      <button 
                        onClick={handleRunAiAudit}
                        disabled={isAnalyzing}
                        className="bg-white text-emerald-800 px-8 py-4 rounded-2xl font-black text-lg shadow-xl hover:bg-emerald-50 transition-all flex items-center gap-3 disabled:opacity-50"
                      >
                          {isAnalyzing ? <Loader2 size={24} className="animate-spin" /> : <Zap size={24} className="fill-current" />}
                          {isAnalyzing ? 'Ανάλυση σε εξέλιξη...' : 'Δημιουργία Έξυπνης Αναφοράς'}
                      </button>
                  </div>
              </div>

              {aiReport && (
                  <div className="bg-white p-10 rounded-[2.5rem] border border-slate-200 shadow-sm animate-in zoom-in-95 duration-500">
                      <div className="flex items-center gap-3 mb-8 border-b border-slate-100 pb-6">
                          <FileText size={24} className="text-slate-400" />
                          <h3 className="text-xl font-black text-slate-800">Αποτελέσματα Επιχειρησιακού Ελέγχου</h3>
                      </div>
                      
                      <SmartReportRenderer text={aiReport} />

                      <div className="mt-12 pt-8 border-t border-slate-100 flex items-center gap-2 text-slate-400 text-xs font-bold uppercase tracking-widest">
                          <ShieldCheck size={14} className="text-emerald-500" /> Επαληθεύτηκε από Gemini 3 Flash Intelligence
                      </div>
                  </div>
              )}

              {!aiReport && !isAnalyzing && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 opacity-60 grayscale transition-all hover:grayscale-0 hover:opacity-100">
                      <div className="bg-white p-8 rounded-3xl border border-slate-200 border-dashed text-center space-y-4">
                          <div className="w-12 h-12 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center mx-auto"><Target size={24}/></div>
                          <h4 className="font-bold text-slate-700">Έλεγχος Κερδοφορίας</h4>
                          <p className="text-xs text-slate-500">Εντοπισμός προϊόντων με λάθος περιθώρια.</p>
                      </div>
                      <div className="bg-white p-8 rounded-3xl border border-slate-200 border-dashed text-center space-y-4">
                          <div className="w-12 h-12 bg-amber-50 text-amber-500 rounded-full flex items-center justify-center mx-auto"><Scale size={24}/></div>
                          <h4 className="font-bold text-slate-700">Διαχείριση Κινδύνου</h4>
                          <p className="text-xs text-slate-500">Πρόβλεψη επιπτώσεων από άνοδο ασημιού.</p>
                      </div>
                      <div className="bg-white p-8 rounded-3xl border border-slate-200 border-dashed text-center space-y-4">
                          <div className="w-12 h-12 bg-emerald-50 text-emerald-500 rounded-full flex items-center justify-center mx-auto"><TrendingUp size={24}/></div>
                          <h4 className="font-bold text-slate-700">Στρατηγική Ανάπτυξης</h4>
                          <p className="text-xs text-slate-500">Προτάσεις για βελτίωση του product mix.</p>
                      </div>
                  </div>
              )}
          </div>
      )}
    </div>
  );
}
