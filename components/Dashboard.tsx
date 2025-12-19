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
  Scale
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

interface Props {
  products: Product[];
  settings: GlobalSettings;
}

// Translations for Status and Stages
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
  const [activeTab, setActiveTab] = useState<'overview' | 'financials' | 'production' | 'inventory'>('overview');

  const { data: orders } = useQuery({ queryKey: ['orders'], queryFn: api.getOrders });
  const { data: batches } = useQuery({ queryKey: ['batches'], queryFn: api.getProductionBatches });

  // --- 1. AGGREGATE DATA CALCULATIONS ---
  const stats = useMemo(() => {
    // Filter out components for value-based stats
    const sellableProducts = products.filter(p => !p.is_component);
    
    const totalStockQty = products.reduce((acc, p) => acc + p.stock_qty, 0);
    const lowStockCount = products.filter(p => p.stock_qty < 5).length;
    
    let totalCostValue = 0; 
    let totalPotentialRevenue = 0; 
    let totalSilverWeight = 0;

    products.forEach(p => {
        // Assets still include components cost, but potential revenue only from sellable
        totalCostValue += (p.active_price * p.stock_qty);
        if (!p.is_component) {
            totalPotentialRevenue += (p.selling_price * p.stock_qty);
        }
        totalSilverWeight += (p.weight_g * p.stock_qty);
    });

    const potentialMargin = totalPotentialRevenue - totalCostValue;
    const marginPercent = totalPotentialRevenue > 0 ? (potentialMargin / totalPotentialRevenue) * 100 : 0;

    const activeOrders = orders?.filter(o => o.status === OrderStatus.Pending || o.status === OrderStatus.InProduction) || [];
    const completedOrders = orders?.filter(o => o.status === OrderStatus.Delivered) || [];
    const pendingRevenue = activeOrders.reduce((acc, o) => acc + o.total_price, 0);
    const totalRevenue = completedOrders.reduce((acc, o) => acc + o.total_price, 0);

    const activeBatches = batches?.filter(b => b.current_stage !== ProductionStage.Ready) || [];
    const delayedBatches = activeBatches.filter(b => {
        const diffTime = Math.abs(new Date().getTime() - new Date(b.created_at).getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return diffDays > 5;
    });

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
        delayedBatchesCount: delayedBatches.length,
        totalItemsInProduction: activeBatches.reduce((acc, b) => acc + b.quantity, 0)
    };
  }, [products, orders, batches]);

  // --- 2. CHART DATA PREPARATION ---
  const categoryData = useMemo(() => {
      const counts: Record<string, number> = {};
      // Filter out components from category distribution to focus on jewelry types
      products.filter(p => !p.is_component).forEach(p => {
          const cat = p.category.split(' ')[0]; 
          counts[cat] = (counts[cat] || 0) + 1;
      });
      return Object.entries(counts)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 8);
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

      return Object.entries(stages)
        .map(([name, value]) => ({ name, value }));
  }, [batches]);

  const orderStatusData = useMemo(() => {
      if (!orders) return [];
      const stats: Record<string, number> = {};
      orders.forEach(o => {
          const label = STATUS_LABELS[o.status] || o.status;
          stats[label] = (stats[label] || 0) + 1;
      });
      return Object.entries(stats).map(([name, value]) => ({ name, value }));
  }, [orders]);

  // --- RENDER HELPERS ---
  const KPICard = ({ title, value, subValue, icon, colorClass, trend }: { title: string, value: string, subValue?: string, icon: React.ReactNode, colorClass: string, trend?: 'up' | 'down' | 'neutral' }) => (
      <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow relative overflow-hidden group">
          <div className={`absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform duration-500 ${colorClass}`}>
              {React.cloneElement(icon as React.ReactElement<any>, { size: 64 })}
          </div>
          <div>
              <p className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-2">{title}</p>
              <h3 className="text-3xl font-black text-slate-800 tracking-tight">{value}</h3>
          </div>
          {(subValue || trend) && (
              <div className="mt-4 flex items-center gap-2">
                  <div className={`text-xs font-bold px-2 py-1 rounded-full bg-slate-50 flex items-center gap-1 ${colorClass}`}>
                      {icon}
                      {subValue}
                  </div>
                  {trend && <ArrowUpRight size={14} className="text-emerald-500" />}
              </div>
          )}
      </div>
  );

  return (
    <div className="space-y-8 pb-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-bold text-[#060b00] tracking-tight">Πίνακας Ελέγχου</h1>
          <p className="text-slate-500 mt-2 font-medium">Επισκόπηση της επιχείρησης και έξυπνη ανάλυση.</p>
        </div>
        
        <div className="bg-white p-1.5 rounded-2xl border border-slate-100 shadow-sm flex overflow-x-auto">
            {[
                { id: 'overview', label: 'Επισκόπηση', icon: Activity },
                { id: 'financials', label: 'Οικονομικά', icon: DollarSign },
                { id: 'production', label: 'Παραγωγή', icon: Factory },
                { id: 'inventory', label: 'Αποθήκη', icon: Package },
            ].map(tab => (
                <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`
                        flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all whitespace-nowrap
                        ${activeTab === tab.id 
                            ? 'bg-[#060b00] text-white shadow-md' 
                            : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'}
                    `}
                >
                    <tab.icon size={16} />
                    {tab.label}
                </button>
            ))}
        </div>
      </div>

      {/* --- TAB: OVERVIEW --- */}
      {activeTab === 'overview' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  <KPICard 
                    title="Αξία Αποθήκης" 
                    value={formatCurrency(stats.totalCostValue)} 
                    subValue={`${stats.totalStockQty} Τεμάχια`}
                    icon={<Wallet />}
                    colorClass="text-emerald-600"
                  />
                  <KPICard 
                    title="Εκκρεμής Τζίρος" 
                    value={formatCurrency(stats.pendingRevenue)} 
                    subValue={`${stats.activeOrdersCount} Παραγγελίες`}
                    icon={<Activity />}
                    colorClass="text-blue-600"
                  />
                  <KPICard 
                    title="Σε Παραγωγή" 
                    value={stats.totalItemsInProduction.toString()} 
                    subValue={`${stats.activeBatchesCount} Παρτίδες`}
                    icon={<Factory />}
                    colorClass="text-amber-600"
                  />
                  <KPICard 
                    title="Τιμή Ασημιού" 
                    value={`${formatDecimal(settings.silver_price_gram, 3)} €/g`} 
                    subValue="Τρέχουσα Αγορά"
                    icon={<Coins />}
                    colorClass="text-slate-600"
                  />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <div className="lg:col-span-2 bg-white p-8 rounded-3xl border border-slate-100 shadow-sm">
                      <div className="flex justify-between items-center mb-6">
                          <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
                              <PieChart size={20} className="text-blue-500"/> Κατανομή Κατηγοριών (Κοσμήματα)
                          </h3>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
                          <div className="h-64">
                              <ResponsiveContainer width="100%" height="100%">
                                  <RePieChart>
                                      <Pie
                                          data={categoryData}
                                          innerRadius={0}
                                          outerRadius={80}
                                          paddingAngle={0}
                                          dataKey="value"
                                          stroke="white"
                                          strokeWidth={2}
                                      >
                                          {categoryData.map((entry, index) => (
                                              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                          ))}
                                      </Pie>
                                      <Tooltip contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)'}} />
                                  </RePieChart>
                              </ResponsiveContainer>
                          </div>
                          <div className="space-y-3 max-h-64 overflow-y-auto pr-2 custom-scrollbar">
                              {categoryData.map((item, idx) => (
                                  <div key={item.name} className="flex items-center justify-between group">
                                      <div className="flex items-center gap-2">
                                          <div className="w-3 h-3 rounded-full" style={{backgroundColor: COLORS[idx % COLORS.length]}}></div>
                                          <span className="text-sm font-bold text-slate-600 group-hover:text-slate-900 transition-colors">{item.name}</span>
                                      </div>
                                      <span className="text-xs font-black text-slate-400">{item.value} <span className="text-[10px] font-bold uppercase">κωδ.</span></span>
                                  </div>
                              ))}
                          </div>
                      </div>
                  </div>

                  <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-center gap-6">
                        <div className="text-center">
                            <p className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-2">Κεφάλαιο σε Ασήμι</p>
                            <h3 className="text-4xl font-black text-slate-800 tracking-tight">{formatDecimal(stats.totalSilverWeight / 1000, 2)} <span className="text-lg text-slate-400 font-medium">kg</span></h3>
                            <p className="text-emerald-600 text-sm font-bold mt-1">≈ {formatCurrency(stats.totalSilverWeight * settings.silver_price_gram)}</p>
                        </div>
                        <div className="h-px bg-slate-100 w-full"></div>
                        <div className="text-center">
                            <p className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-2">Δυνητικός Τζίρος</p>
                            <h3 className="text-3xl font-black text-slate-800 tracking-tight">{formatCurrency(stats.totalPotentialRevenue)}</h3>
                            <p className="text-slate-500 text-xs mt-1">Πλήρης πώληση αποθέματος (Χονδρική)</p>
                        </div>
                  </div>
              </div>
          </div>
      )}

      {/* --- TAB: FINANCIALS --- */}
      {activeTab === 'financials' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <KPICard title="Συνολικά Έσοδα" value={formatCurrency(stats.totalRevenue)} icon={<DollarSign/>} colorClass="text-emerald-600" />
                  <KPICard title="Εκτιμώμενο Κέρδος" value={formatCurrency(stats.potentialMargin)} subValue={`${stats.marginPercent.toFixed(1)}% Περιθώριο`} icon={<TrendingUp/>} colorClass="text-blue-600" />
                  <KPICard title="Μέση Αξία Παραγγελίας" value={orders && orders.length > 0 ? formatCurrency(stats.totalRevenue / orders.length) : '0€'} icon={<PieChart/>} colorClass="text-purple-600" />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm h-96">
                      <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
                          <BarChart3 size={20} className="text-blue-500" /> Κατάσταση Παραγγελιών
                      </h3>
                      <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={orderStatusData} layout="vertical" margin={{top: 5, right: 30, left: 40, bottom: 5}}>
                              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0"/>
                              <XAxis type="number" hide />
                              <YAxis dataKey="name" type="category" width={100} tick={{fontSize: 12, fill: '#64748b', fontWeight: 'bold'}} />
                              <Tooltip cursor={{fill: 'transparent'}} contentStyle={{borderRadius: '12px'}} />
                              <Bar dataKey="value" fill="#3b82f6" radius={[0, 6, 6, 0]} barSize={30} name="Παραγγελίες" />
                          </BarChart>
                      </ResponsiveContainer>
                  </div>
                  
                  <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm h-96">
                      <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
                          <TrendingUp size={20} className="text-amber-500" /> Αξία ανά Κατηγορία (Top 8)
                      </h3>
                      <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={categoryData}>
                              <defs>
                                  <linearGradient id="colorVal" x1="0" y1="0" x2="0" y2="1">
                                      <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.8}/>
                                      <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                                  </linearGradient>
                              </defs>
                              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0"/>
                              <XAxis dataKey="name" tick={{fontSize: 10, fontWeight: 'bold'}} interval={0} />
                              <YAxis tick={{fontSize: 10}} />
                              <Tooltip contentStyle={{borderRadius: '12px'}} />
                              <Area type="monotone" dataKey="value" stroke="#f59e0b" fillOpacity={1} fill="url(#colorVal)" name="Κωδικοί" />
                          </AreaChart>
                      </ResponsiveContainer>
                  </div>
              </div>
          </div>
      )}

      {/* --- TAB: PRODUCTION --- */}
      {activeTab === 'production' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <div className="lg:col-span-2 bg-white p-8 rounded-3xl border border-slate-100 shadow-sm">
                      <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
                          <Factory size={20} className="text-amber-500" /> Φόρτος Παραγωγής ανά Στάδιο
                      </h3>
                      <div className="h-80">
                          <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={productionStageData}>
                                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0"/>
                                  <XAxis dataKey="name" tick={{fontSize: 11, fill: '#64748b', fontWeight: 'bold'}} interval={0} angle={-15} textAnchor="end" height={60}/>
                                  <YAxis tick={{fontSize: 12, fill: '#64748b'}} allowDecimals={false} />
                                  <Tooltip cursor={{fill: '#f8fafc'}} contentStyle={{borderRadius: '12px'}} />
                                  <Bar dataKey="value" fill="#f59e0b" radius={[6, 6, 0, 0]} name="Τεμάχια" barSize={50} />
                              </BarChart>
                          </ResponsiveContainer>
                      </div>
                  </div>

                  <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm flex flex-col">
                      <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                          <AlertTriangle size={20} className="text-red-500" /> Καθυστερήσεις
                      </h3>
                      <div className="flex-1 overflow-y-auto pr-2 space-y-3 custom-scrollbar">
                          {batches && batches.filter(b => {
                              const lastUpdate = new Date(b.updated_at);
                              const diffDays = Math.ceil(Math.abs(new Date().getTime() - lastUpdate.getTime()) / (1000 * 60 * 60 * 24));
                              return b.current_stage !== ProductionStage.Ready && diffDays > 5;
                          }).map(b => (
                              <div key={b.id} className="p-3 bg-red-50 rounded-xl border border-red-100">
                                  <div className="flex justify-between items-start">
                                      <span className="font-bold text-red-900">{b.sku}{b.variant_suffix}</span>
                                      <span className="text-xs bg-white px-2 py-1 rounded text-red-600 font-bold shadow-sm">{b.quantity} τ.</span>
                                  </div>
                                  <div className="flex justify-between mt-2 text-xs text-red-700 font-bold">
                                      <span>{STAGE_LABELS[b.current_stage] || b.current_stage}</span>
                                      <span>{new Date(b.updated_at).toLocaleDateString('el-GR')}</span>
                                  </div>
                              </div>
                          ))}
                          {(!batches || batches.length === 0) && (
                              <div className="text-center text-slate-400 py-10 italic">Όλα βαίνουν καλώς.</div>
                          )}
                      </div>
                  </div>
              </div>
          </div>
      )}

      {/* --- TAB: INVENTORY --- */}
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
                      <AlertTriangle size={20} className="text-amber-500" /> Προϊόντα σε Χαμηλό Απόθεμα (Top 10)
                  </h3>
                  <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                          <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-xs">
                              <tr>
                                  <th className="p-4 rounded-l-xl">SKU</th>
                                  <th className="p-4">Κατηγορία</th>
                                  <th className="p-4 text-center">Στοκ</th>
                                  <th className="p-4 text-center">Όριο</th>
                                  <th className="p-4 rounded-r-xl">Κατάσταση</th>
                              </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-50">
                              {products.filter(p => p.stock_qty < 5).slice(0, 10).map(p => (
                                  <tr key={p.sku} className="hover:bg-slate-50/50 transition-colors">
                                      <td className="p-4 font-bold text-slate-800">{p.sku}</td>
                                      <td className="p-4 text-slate-600 font-medium">{p.category}</td>
                                      <td className="p-4 text-center font-black">{p.stock_qty}</td>
                                      <td className="p-4 text-center text-slate-400 font-bold">5</td>
                                      <td className="p-4">
                                          <span className={`px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wider ${p.stock_qty === 0 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
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
    </div>
  );
}
