
import React, { useState, useMemo } from 'react';
import { Product, GlobalSettings, Order, ProductionBatch, OrderStatus, ProductionStage, Gender, MaterialType } from '../types';
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
  Filter,
  Trophy,
  Crown,
  Gem,
  Hammer,
  HelpCircle
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
  onNavigate?: (page: 'dashboard' | 'registry' | 'inventory' | 'pricing' | 'settings' | 'resources' | 'collections' | 'batch-print' | 'orders' | 'production' | 'customers' | 'ai-studio' | 'pricelist' | 'analytics') => void;
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

const SmartReportRenderer = ({ text }: { text: string }) => {
    const parts = text.split(/\[TITLE\]|\[\/TITLE\]/).filter(p => p.trim());
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

export default function Dashboard({ products, settings, onNavigate }: Props) {
  const [activeTab, setActiveTab] = useState<'overview' | 'financials' | 'production' | 'inventory' | 'smart'>('overview');
  const [aiReport, setAiReport] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [categoryGenderFilter, setCategoryGenderFilter] = useState<'All' | Gender>('All');
  const { showToast } = useUI();

  const { data: orders } = useQuery({ queryKey: ['orders'], queryFn: api.getOrders });
  const { data: batches } = useQuery({ queryKey: ['batches'], queryFn: api.getProductionBatches });

  const stats = useMemo(() => {
    const totalStockQty = products.reduce((acc, p) => acc + p.stock_qty, 0);
    
    let totalCostValue = 0; 
    let totalPotentialRevenue = 0; 
    let totalSilverWeight = 0;

    products.forEach(p => {
        totalCostValue += (p.active_price * p.stock_qty);
        totalSilverWeight += (p.weight_g * p.stock_qty);
        if (!p.is_component) {
            if (p.variants && p.variants.length > 0) {
                const maxVarPrice = Math.max(...p.variants.map(v => v.selling_price || 0));
                totalPotentialRevenue += (maxVarPrice > 0 ? maxVarPrice : p.selling_price) * p.stock_qty;
            } else {
                totalPotentialRevenue += p.selling_price * p.stock_qty;
            }
        }
    });

    const potentialMargin = totalPotentialRevenue - totalCostValue;
    const marginPercent = totalPotentialRevenue > 0 ? (potentialMargin / totalPotentialRevenue) * 100 : 0;

    const activeOrders = orders?.filter(o => o.status === OrderStatus.Pending || o.status === OrderStatus.InProduction || o.status === OrderStatus.Ready) || [];
    const completedOrders = orders?.filter(o => o.status === OrderStatus.Delivered) || [];
    const activeBatches = batches?.filter(b => b.current_stage !== ProductionStage.Ready) || [];
    
    // --- MATERIAL USAGE LOGIC ---
    let silverSold = 0;
    let stonesSold = 0;
    completedOrders.forEach(o => {
        o.items.forEach(i => {
            const p = products.find(prod => prod.sku === i.sku);
            if (p) {
                silverSold += (p.weight_g * i.quantity);
                p.recipe.forEach(ri => {
                   if (ri.type === 'raw') stonesSold += (ri.quantity * i.quantity);
                });
            }
        });
    });

    const stockValueBySku = products
        .filter(p => !p.is_component)
        .flatMap(p => {
            if (p.variants && p.variants.length > 0) {
                return p.variants.map(v => ({
                    sku: p.sku + v.suffix,
                    category: p.category,
                    value: (v.active_price || p.active_price) * v.stock_qty,
                    qty: v.stock_qty
                }));
            }
            return [{
                sku: p.sku,
                category: p.category,
                value: p.active_price * p.stock_qty,
                qty: p.stock_qty
            }];
        })
        .filter(i => i.value > 0)
        .sort((a, b) => b.value - a.value)
        .slice(0, 5);

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
        topStockValue: stockValueBySku,
        silverSold: silverSold / 1000, // to kg
        stonesSold
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

  const KPICard = ({ title, value, subValue, icon, colorClass, hint }: { title: string, value: string, subValue?: string, icon: React.ReactNode, colorClass: string, hint?: string }) => (
      <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between hover:shadow-md transition-all relative overflow-hidden group">
          <div className={`absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform duration-500 ${colorClass}`}>
              {React.cloneElement(icon as React.ReactElement<any>, { size: 64 })}
          </div>
          <div>
              <p className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-2 flex items-center gap-1.5">
                {title}
                {hint && <HelpCircle size={12} className="text-slate-300 group-hover:text-slate-500 transition-colors" title={hint} />}
              </p>
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
          <h1 className="text-3xl font-black text-[#060b00] tracking-tight">Πίνακας Ελέγχου</h1>
          <p className="text-slate-500 mt-2 font-medium">Έξυπνη επισκόπηση και ανάλυση κερδοφορίας της επιχείρησης.</p>
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
                  <KPICard title="Αξία Αποθήκης" value={formatCurrency(stats.totalCostValue)} subValue={`${stats.totalStockQty} Τεμάχια`} icon={<Wallet />} colorClass="text-emerald-600" hint="Η συνολική αξία κόστους των προϊόντων που βρίσκονται στην αποθήκη." />
                  <KPICard title="Εκκρεμής Τζίρος" value={formatCurrency(stats.pendingRevenue)} subValue={`${stats.activeOrdersCount} Παραγγελίες`} icon={<Activity />} colorClass="text-blue-600" hint="Τα αναμενόμενα έσοδα από παραγγελίες που δεν έχουν ακόμη παραδοθεί." />
                  <KPICard title="Σε Παραγωγή" value={stats.totalItemsInProduction.toString()} icon={<Factory />} colorClass="text-amber-600" hint="Συνολικά τεμάχια που βρίσκονται αυτή τη στιγμή στα διάφορα στάδια της παραγωγής." />
                  <KPICard title="Τιμή Ασημιού" value={`${formatDecimal(settings.silver_price_gram, 3)} €/g`} subValue="Τρέχουσα Αγορά" icon={<Coins />} colorClass="text-slate-600" hint="Η τρέχουσα τιμή αγοράς του ασημιού ανά γραμμάριο." />
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
                            <p className="text-emerald-200/60 text-[10px] font-bold uppercase tracking-widest mb-2 flex items-center justify-center gap-1">
                                Δυνητικός Τζίρος <HelpCircle size={10} title="Η συνολική αξία πώλησης (χονδρική) αν πουληθεί όλο το υπάρχον στοκ." />
                            </p>
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
                  <KPICard title="Συνολικά Έσοδα" value={formatCurrency(stats.totalRevenue)} icon={<DollarSign/>} colorClass="text-emerald-600" hint="Ο συνολικός τζίρος από όλες τις ολοκληρωμένες παραγγελίες." />
                  <KPICard title="Εκτιμώμενο Κέρδος" value={formatCurrency(stats.potentialMargin)} subValue={`${stats.marginPercent.toFixed(1)}% Περιθώριο`} icon={<TrendingUp/>} colorClass="text-blue-600" hint="Το μεικτό κέρδος μετά την αφαίρεση του κόστους παραγωγής (Μέταλλο + Εργατικά + Υλικά)." />
                  <KPICard title="Αξία Αποθέματος (Retail)" value={formatCurrency(stats.totalPotentialRevenue * 3)} icon={<Target/>} colorClass="text-purple-600" hint="Η συνολική αξία του αποθέματος σε τιμές λιανικής (εκτίμηση x3)." />
              </div>

              <div className="bg-indigo-50 border border-indigo-100 rounded-3xl p-6 flex flex-col md:flex-row items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                      <div className="p-4 bg-indigo-100 text-indigo-600 rounded-2xl">
                          <BarChart3 size={32} />
                      </div>
                      <div>
                          <h3 className="font-black text-indigo-900 text-lg">Προηγμένη Ανάλυση Δεδομένων</h3>
                          <p className="text-sm text-indigo-600/80">Δείτε αναλυτικά γραφήματα, τάσεις πωλήσεων και κερδοφορία ανά κατηγορία.</p>
                      </div>
                  </div>
                  <button 
                    onClick={() => onNavigate?.('analytics')}
                    className="bg-indigo-600 text-white px-6 py-3 rounded-xl font-bold shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition-all flex items-center gap-2 whitespace-nowrap"
                  >
                      Άνοιγμα Αναλυτικών <ArrowUpRight size={18}/>
                  </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm">
                      <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
                          <Gem size={20} className="text-emerald-500" /> Ανάλυση Κατανάλωσης Υλικών
                      </h3>
                      <div className="space-y-4">
                          <div className="flex items-center justify-between p-4 bg-emerald-50/50 rounded-2xl border border-emerald-100">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-emerald-100 text-emerald-600 rounded-xl flex items-center justify-center">
                                        <Scale size={20}/>
                                    </div>
                                    <div>
                                        <div className="font-bold text-slate-800 uppercase text-[10px] tracking-widest">Συνολικό Ασήμι</div>
                                        <div className="text-slate-500 text-xs">Από πωληθέντα είδη</div>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="font-black text-emerald-700 text-xl">{stats.silverSold.toFixed(3)} kg</div>
                                </div>
                          </div>
                          <div className="flex items-center justify-between p-4 bg-blue-50/50 rounded-2xl border border-blue-100">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center">
                                        <Gem size={20}/>
                                    </div>
                                    <div>
                                        <div className="font-bold text-slate-800 uppercase text-[10px] tracking-widest">Πέτρες & Υλικά</div>
                                        <div className="text-slate-500 text-xs">Συνολικά τεμάχια</div>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="font-black text-blue-700 text-xl">{stats.stonesSold} <span className="text-xs font-normal">τμχ</span></div>
                                </div>
                          </div>
                      </div>
                  </div>
                  
                  <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm">
                      <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
                          <Crown size={20} className="text-purple-500" /> Απόθεμα Υψηλής Αξίας
                      </h3>
                      <div className="space-y-4">
                          {stats.topStockValue.map((item, index) => (
                              <div key={item.sku} className="flex items-center justify-between p-4 bg-purple-50/50 rounded-2xl border border-purple-100">
                                  <div>
                                      <div className="font-bold text-slate-800">{item.sku}</div>
                                      <div className="text-[10px] text-slate-500">{item.category}</div>
                                  </div>
                                  <div className="text-right">
                                      <div className="font-black text-purple-700">{formatCurrency(item.value)}</div>
                                      <div className="text-[10px] text-slate-400 font-bold">{item.qty} τμχ (Stock)</div>
                                  </div>
                              </div>
                          ))}
                          {stats.topStockValue.length === 0 && <div className="text-slate-400 text-sm text-center py-4">Δεν βρέθηκε απόθεμα.</div>}
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
                              {products.filter(p => p.stock_qty < 5).slice(0, 10).map(p => (
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
                          Το Ilios AI αναλύει το μητρώο σας, τις τιμές του ασημιού και το ιστορικό πωλήσεων για να εντοπίσει ευκαιρίες κέρδους και ρίσκα.
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
                          <ShieldCheck size={14} className="text-emerald-500" /> Επαληθεύτηκε από Gemini AI Intelligence
                      </div>
                  </div>
              )}
          </div>
      )}
    </div>
  );
}
