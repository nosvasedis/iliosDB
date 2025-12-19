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
import { formatCurrency, formatDecimal, calculateProductCost } from '../utils/pricingEngine';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/supabase';

interface Props {
  products: Product[];
  settings: GlobalSettings;
}

// Helper for colors
const COLORS = ['#059669', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#6366f1'];

export default function Dashboard({ products, settings }: Props) {
  const [activeTab, setActiveTab] = useState<'overview' | 'financials' | 'production' | 'inventory'>('overview');

  // Fetch additional data needed for intelligence
  const { data: orders } = useQuery({ queryKey: ['orders'], queryFn: api.getOrders });
  const { data: batches } = useQuery({ queryKey: ['batches'], queryFn: api.getProductionBatches });
  const { data: materials } = useQuery({ queryKey: ['materials'], queryFn: api.getMaterials });

  // --- 1. AGGREGATE DATA CALCULATIONS ---

  const stats = useMemo(() => {
    // Inventory Stats
    const totalStockQty = products.reduce((acc, p) => acc + p.stock_qty, 0);
    const lowStockCount = products.filter(p => p.stock_qty < 5).length;
    
    // Financial Stats (Cost vs Potential)
    let totalCostValue = 0; // "Asset Value"
    let totalPotentialRevenue = 0; // "Wholesale Potential"
    let totalSilverWeight = 0;

    products.forEach(p => {
        // We use the active_price (Cost) for asset valuation
        totalCostValue += (p.active_price * p.stock_qty);
        // We use selling_price for potential revenue
        totalPotentialRevenue += (p.selling_price * p.stock_qty);
        // Track Silver Weight
        totalSilverWeight += (p.weight_g * p.stock_qty);
    });

    const potentialMargin = totalPotentialRevenue - totalCostValue;
    const marginPercent = totalPotentialRevenue > 0 ? (potentialMargin / totalPotentialRevenue) * 100 : 0;

    // Order Stats
    const activeOrders = orders?.filter(o => o.status === OrderStatus.Pending || o.status === OrderStatus.InProduction) || [];
    const completedOrders = orders?.filter(o => o.status === OrderStatus.Delivered) || [];
    const pendingRevenue = activeOrders.reduce((acc, o) => acc + o.total_price, 0);
    const totalRevenue = completedOrders.reduce((acc, o) => acc + o.total_price, 0);

    // Production Stats
    const activeBatches = batches?.filter(b => b.current_stage !== ProductionStage.Ready) || [];
    const delayedBatches = activeBatches.filter(b => {
        // Simple logic: created more than 5 days ago and not ready
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
      products.forEach(p => {
          const cat = p.category.split(' ')[0]; // Group "Ring Men" and "Ring Women" roughly
          counts[cat] = (counts[cat] || 0) + 1;
      });
      return Object.entries(counts)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 6);
  }, [products]);

  const productionStageData = useMemo(() => {
      if (!batches) return [];
      const stages: Record<string, number> = {};
      
      // Initialize stages to ensure order
      Object.values(ProductionStage).forEach(s => stages[s] = 0);

      batches.forEach(b => {
          if (b.current_stage !== ProductionStage.Ready) {
              stages[b.current_stage] = (stages[b.current_stage] || 0) + b.quantity;
          }
      });

      return Object.entries(stages)
        .filter(([_, val]) => val > 0) // Only show active stages
        .map(([name, value]) => ({ name, value }));
  }, [batches]);

  const orderStatusData = useMemo(() => {
      if (!orders) return [];
      const stats: Record<string, number> = {};
      orders.forEach(o => {
          stats[o.status] = (stats[o.status] || 0) + 1;
      });
      return Object.entries(stats).map(([name, value]) => ({ name, value }));
  }, [orders]);

  // --- RENDER HELPERS ---

  const KPICard = ({ title, value, subValue, icon, colorClass, trend }: { title: string, value: string, subValue?: string, icon: React.ReactNode, colorClass: string, trend?: 'up' | 'down' | 'neutral' }) => (
      <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow relative overflow-hidden group">
          <div className={`absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform duration-500 ${colorClass.replace('text-', 'text-')}`}>
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
      {/* Header & Tabs */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-bold text-[#060b00] tracking-tight">Πίνακας Ελέγχου</h1>
          <p className="text-slate-500 mt-2">Επισκόπηση της επιχείρησης και έξυπνη ανάλυση.</p>
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
                    title="Αξία Αποθήκης (Cost)" 
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
                    subValue="Live Market"
                    icon={<Coins />}
                    colorClass="text-slate-600"
                  />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Left: Alerts & Quick Stats */}
                  <div className="lg:col-span-2 bg-white p-8 rounded-3xl border border-slate-100 shadow-sm">
                      <div className="flex justify-between items-center mb-6">
                          <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
                              <Activity size={20} className="text-blue-500"/> Δραστηριότητα
                          </h3>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                          <div className="h-64">
                              <h4 className="text-xs font-bold text-slate-400 uppercase mb-4 text-center">Κατανομή Κατηγοριών</h4>
                              <ResponsiveContainer width="100%" height="100%">
                                  <PieChart>
                                      <Pie
                                          data={categoryData}
                                          innerRadius={60}
                                          outerRadius={80}
                                          paddingAngle={5}
                                          dataKey="value"
                                      >
                                          {categoryData.map((entry, index) => (
                                              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                          ))}
                                      </Pie>
                                      <Tooltip contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}} />
                                      <Legend verticalAlign="bottom" height={36} iconType="circle" />
                                  </PieChart>
                              </ResponsiveContainer>
                          </div>
                          <div className="space-y-4">
                              <div className="p-4 bg-red-50 rounded-2xl border border-red-100 flex items-center justify-between">
                                  <div className="flex items-center gap-3">
                                      <div className="bg-white p-2 rounded-full text-red-500 shadow-sm"><AlertTriangle size={20}/></div>
                                      <div>
                                          <p className="font-bold text-red-900">Χαμηλό Απόθεμα</p>
                                          <p className="text-xs text-red-700">{stats.lowStockCount} κωδικοί χρειάζονται ανανέωση</p>
                                      </div>
                                  </div>
                                  <button className="text-xs font-bold bg-white text-red-600 px-3 py-1.5 rounded-lg shadow-sm hover:bg-red-50 transition-colors">Προβολή</button>
                              </div>
                              
                              <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100 flex items-center justify-between">
                                  <div className="flex items-center gap-3">
                                      <div className="bg-white p-2 rounded-full text-amber-500 shadow-sm"><Clock size={20}/></div>
                                      <div>
                                          <p className="font-bold text-amber-900">Καθυστερήσεις</p>
                                          <p className="text-xs text-amber-700">{stats.delayedBatchesCount} παρτίδες έχουν αργήσει</p>
                                      </div>
                                  </div>
                                  <button className="text-xs font-bold bg-white text-amber-600 px-3 py-1.5 rounded-lg shadow-sm hover:bg-amber-50 transition-colors">Έλεγχος</button>
                              </div>

                              <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100 flex items-center justify-between">
                                  <div className="flex items-center gap-3">
                                      <div className="bg-white p-2 rounded-full text-emerald-500 shadow-sm"><CheckCircle size={20}/></div>
                                      <div>
                                          <p className="font-bold text-emerald-900">Παραγγελίες</p>
                                          <p className="text-xs text-emerald-700">{stats.activeOrdersCount} ενεργές παραγγελίες</p>
                                      </div>
                                  </div>
                              </div>
                          </div>
                      </div>
                  </div>

                  {/* Right: Quick Values */}
                  <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-center gap-6">
                        <div className="text-center">
                            <p className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-2">Κεφαλαιο σε Ασημι</p>
                            <h3 className="text-4xl font-black text-slate-800">{formatDecimal(stats.totalSilverWeight / 1000, 2)} <span className="text-lg text-slate-400 font-medium">kg</span></h3>
                            <p className="text-emerald-600 text-sm font-bold mt-1">≈ {formatCurrency(stats.totalSilverWeight * settings.silver_price_gram)}</p>
                        </div>
                        <div className="h-px bg-slate-100 w-full"></div>
                        <div className="text-center">
                            <p className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-2">Δυνητικος Τζιρος</p>
                            <h3 className="text-3xl font-black text-slate-800">{formatCurrency(stats.totalPotentialRevenue)}</h3>
                            <p className="text-slate-500 text-xs mt-1">Αν πουληθεί όλο το στοκ (Χονδρική)</p>
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
                  <KPICard title="Εκτιμώμενο Κέρδος" value={formatCurrency(stats.potentialMargin)} subValue={`${stats.marginPercent.toFixed(1)}% Margin`} icon={<TrendingUp/>} colorClass="text-blue-600" />
                  <KPICard title="Μέση Αξία Παραγγελίας" value={orders && orders.length > 0 ? formatCurrency(stats.totalRevenue / orders.length) : '0€'} icon={<PieChart/>} colorClass="text-purple-600" />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm h-96">
                      <h3 className="font-bold text-slate-800 mb-6">Κατάσταση Παραγγελιών</h3>
                      <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={orderStatusData} layout="vertical" margin={{top: 5, right: 30, left: 40, bottom: 5}}>
                              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0"/>
                              <XAxis type="number" hide />
                              <YAxis dataKey="name" type="category" width={100} tick={{fontSize: 12, fill: '#64748b'}} />
                              <Tooltip cursor={{fill: 'transparent'}} contentStyle={{borderRadius: '12px'}} />
                              <Bar dataKey="value" fill="#3b82f6" radius={[0, 6, 6, 0]} barSize={30} />
                          </BarChart>
                      </ResponsiveContainer>
                  </div>
                  
                  <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm h-96">
                      <h3 className="font-bold text-slate-800 mb-6">Αξία Ανά Κατηγορία (Top 5)</h3>
                      <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={categoryData}>
                              <defs>
                                  <linearGradient id="colorVal" x1="0" y1="0" x2="0" y2="1">
                                      <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.8}/>
                                      <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                                  </linearGradient>
                              </defs>
                              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0"/>
                              <XAxis dataKey="name" tick={{fontSize: 10}} interval={0} />
                              <YAxis tick={{fontSize: 10}} />
                              <Tooltip contentStyle={{borderRadius: '12px'}} />
                              <Area type="monotone" dataKey="value" stroke="#f59e0b" fillOpacity={1} fill="url(#colorVal)" />
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
                                  <XAxis dataKey="name" tick={{fontSize: 11, fill: '#64748b'}} interval={0} angle={-15} textAnchor="end" height={60}/>
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
                      <div className="flex-1 overflow-y-auto pr-2 space-y-3">
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
                                  <div className="flex justify-between mt-2 text-xs text-red-700">
                                      <span>{b.current_stage}</span>
                                      <span>{new Date(b.updated_at).toLocaleDateString('el-GR')}</span>
                                  </div>
                              </div>
                          ))}
                          {(!batches || batches.length === 0) && (
                              <div className="text-center text-slate-400 py-10">Όλα βαίνουν καλώς.</div>
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
                  <h3 className="font-bold text-slate-800 mb-6">Προϊόντα σε Χαμηλό Απόθεμα (Top 10)</h3>
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
                                  <tr key={p.sku}>
                                      <td className="p-4 font-bold text-slate-800">{p.sku}</td>
                                      <td className="p-4 text-slate-600">{p.category}</td>
                                      <td className="p-4 text-center font-bold">{p.stock_qty}</td>
                                      <td className="p-4 text-center text-slate-400">5</td>
                                      <td className="p-4">
                                          <span className={`px-2 py-1 rounded-md text-xs font-bold ${p.stock_qty === 0 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
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