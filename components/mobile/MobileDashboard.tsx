
import React, { useMemo } from 'react';
import { Product, GlobalSettings, Order, ProductionBatch } from '../../types';
import { Wallet, Activity, Factory, Coins, TrendingUp } from 'lucide-react';
import { formatCurrency, formatDecimal } from '../../utils/pricingEngine';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/supabase';

interface Props {
  products: Product[];
  settings: GlobalSettings;
}

const MobileKPICard = ({ title, value, subValue, icon, colorClass }: { title: string, value: string, subValue?: string, icon: React.ReactNode, colorClass: string }) => (
  <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between active:scale-[0.98] transition-transform">
    <div>
      <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest mb-1">{title}</p>
      <h3 className="text-2xl font-black text-slate-800 tracking-tight">{value}</h3>
      {subValue && <p className={`text-xs font-bold mt-1 ${colorClass.replace('text-', 'text-opacity-80 text-')}`}>{subValue}</p>}
    </div>
    <div className={`p-3 rounded-xl bg-opacity-10 ${colorClass.replace('text-', 'bg-')} ${colorClass}`}>
      {icon}
    </div>
  </div>
);

export default function MobileDashboard({ products, settings }: Props) {
  const { data: orders } = useQuery({ queryKey: ['orders'], queryFn: api.getOrders });
  const { data: batches } = useQuery({ queryKey: ['batches'], queryFn: api.getProductionBatches });

  // Reusing the calculation logic (simplified)
  const stats = useMemo(() => {
    const totalCostValue = products.reduce((acc, p) => acc + (p.active_price * p.stock_qty), 0);
    const activeOrders = orders?.filter(o => o.status === 'Pending' || o.status === 'In Production') || [];
    const pendingRevenue = activeOrders.reduce((acc, o) => acc + o.total_price, 0);
    const activeBatches = batches?.filter(b => b.current_stage !== 'Ready') || [];
    
    return {
      totalCostValue,
      pendingRevenue,
      activeOrdersCount: activeOrders.length,
      activeBatchesCount: activeBatches.length
    };
  }, [products, orders, batches]);

  return (
    <div className="p-4 space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Dashboard</h1>
          <p className="text-xs text-slate-500 font-medium">Επισκόπηση Συστήματος</p>
        </div>
        <div className="w-10 h-10 bg-slate-900 text-white rounded-full flex items-center justify-center font-bold shadow-lg shadow-slate-200">
          IK
        </div>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-1 gap-4">
        <MobileKPICard 
          title="Αξία Αποθήκης" 
          value={formatCurrency(stats.totalCostValue)} 
          icon={<Wallet size={24}/>} 
          colorClass="text-emerald-600" 
        />
        <MobileKPICard 
          title="Εκκρεμής Τζίρος" 
          value={formatCurrency(stats.pendingRevenue)} 
          subValue={`${stats.activeOrdersCount} Παραγγελίες`}
          icon={<Activity size={24}/>} 
          colorClass="text-blue-600" 
        />
        <div className="grid grid-cols-2 gap-4">
            <MobileKPICard 
            title="Παραγωγή" 
            value={stats.activeBatchesCount.toString()} 
            subValue="Παρτίδες"
            icon={<Factory size={20}/>} 
            colorClass="text-amber-600" 
            />
            <MobileKPICard 
            title="Ασήμι" 
            value={`${formatDecimal(settings.silver_price_gram, 2)}€`} 
            subValue="ανά gr"
            icon={<Coins size={20}/>} 
            colorClass="text-slate-600" 
            />
        </div>
      </div>

      {/* Quick Actions (Visual Placeholder for now) */}
      <div className="bg-gradient-to-br from-[#060b00] to-emerald-900 rounded-3xl p-6 text-white shadow-xl relative overflow-hidden">
         <div className="relative z-10">
            <h3 className="font-bold text-lg mb-1 flex items-center gap-2">
                <TrendingUp size={18} className="text-yellow-400"/> Quick Audit
            </h3>
            <p className="text-emerald-100/70 text-xs mb-4">Ελέγξτε την κερδοφορία των προϊόντων σας.</p>
            <div className="bg-white/10 backdrop-blur-md rounded-xl p-3 border border-white/10 text-center">
                <span className="text-xs font-bold text-white">Ilios AI Analysis Available</span>
            </div>
         </div>
      </div>
    </div>
  );
}
