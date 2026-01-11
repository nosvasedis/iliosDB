
import React, { useMemo } from 'react';
import { Product, GlobalSettings, OrderStatus } from '../../types';
import { Wallet, Activity, Factory, Coins, TrendingUp, Plus, ScanBarcode, Zap, ArrowRight, Package, ShoppingCart, Sparkles, Users, ScrollText, Settings } from 'lucide-react';
import { formatCurrency, formatDecimal } from '../../utils/pricingEngine';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/supabase';
import { APP_ICON_ONLY } from '../../constants';
import { useAuth } from '../AuthContext';

interface Props {
  products: Product[];
  settings: GlobalSettings;
  onNavigate?: (page: string) => void;
}

const QuickAction = ({ icon, label, color, onClick }: { icon: React.ReactNode, label: string, color: string, onClick: () => void }) => (
    <button 
        onClick={onClick}
        className="flex flex-col items-center justify-center bg-white p-3 rounded-2xl border border-slate-100 shadow-sm active:scale-95 transition-all w-full h-24"
    >
        <div className={`p-2.5 rounded-xl mb-1.5 ${color}`}>{icon}</div>
        <span className="text-[10px] font-bold text-slate-700 text-center leading-tight">{label}</span>
    </button>
);

const StatCard = ({ title, value, sub, icon, bg, text }: { title: string, value: string, sub?: string, icon: any, bg: string, text: string }) => (
    <div className={`p-5 rounded-2xl ${bg} flex flex-col justify-between h-32 relative overflow-hidden shadow-sm`}>
        <div className="absolute right-0 top-0 p-4 opacity-10 transform scale-150 origin-top-right">
            {React.cloneElement(icon, { size: 48 })}
        </div>
        <div className="flex items-center gap-2 mb-2 relative z-10">
            <div className="p-1.5 bg-white/20 rounded-lg backdrop-blur-sm text-current">
                {React.cloneElement(icon, { size: 16 })}
            </div>
            <span className={`text-[10px] font-black uppercase tracking-wider opacity-80 ${text}`}>{title}</span>
        </div>
        <div className="relative z-10">
            <div className={`text-2xl font-black ${text}`}>{value}</div>
            {sub && <div className={`text-[10px] font-medium opacity-70 ${text}`}>{sub}</div>}
        </div>
    </div>
);

export default function MobileDashboard({ products, settings, onNavigate }: Props) {
  const { data: orders } = useQuery({ queryKey: ['orders'], queryFn: api.getOrders });
  const { data: batches } = useQuery({ queryKey: ['batches'], queryFn: api.getProductionBatches });
  const { profile } = useAuth();

  const stats = useMemo(() => {
    // Inventory Value (Approx)
    const stockValue = products.reduce((acc, p) => acc + (p.active_price * p.stock_qty), 0);
    
    // Active Orders
    const activeOrders = orders?.filter(o => o.status === OrderStatus.Pending || o.status === OrderStatus.InProduction) || [];
    const pendingRevenue = activeOrders.reduce((acc, o) => acc + o.total_price, 0);
    
    // Production
    const activeBatches = batches?.filter(b => b.current_stage !== 'Ready') || [];
    const delayedBatches = activeBatches.filter(b => {
        const lastUpdate = new Date(b.updated_at).getTime();
        const diffHours = (Date.now() - lastUpdate) / (1000 * 60 * 60);
        return diffHours > 48; // Simplified check
    }).length;

    // Recent Activity (Last 3 orders)
    const recentOrders = orders?.slice(0, 3) || [];

    return {
      stockValue,
      pendingRevenue,
      activeOrdersCount: activeOrders.length,
      activeBatchesCount: activeBatches.length,
      delayedBatches,
      recentOrders
    };
  }, [products, orders, batches]);

  return (
    <div className="p-5 space-y-6 pb-28 bg-slate-50 min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between pt-2">
        <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white rounded-xl shadow-sm border border-slate-100 flex items-center justify-center p-1.5">
                <img src={APP_ICON_ONLY} alt="Logo" className="w-full h-full object-contain" />
            </div>
            <div>
                <h1 className="text-lg font-black text-slate-900 leading-tight">Ilios ERP</h1>
                <p className="text-xs text-slate-500 font-bold">Καλησπέρα, {profile?.full_name?.split(' ')[0] || 'User'}</p>
            </div>
        </div>
      </div>

      {/* Main Stats Grid */}
      <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
              <StatCard 
                title="Εκκρεμης Τζιρος" 
                value={formatCurrency(stats.pendingRevenue)} 
                sub={`${stats.activeOrdersCount} Ενεργές Παραγγελίες`}
                icon={<Activity />} 
                bg="bg-slate-900" 
                text="text-white"
              />
          </div>
          <StatCard 
            title="Παραγωγη" 
            value={stats.activeBatchesCount.toString()} 
            sub={stats.delayedBatches > 0 ? `${stats.delayedBatches} καθυστερήσεις` : 'Ομαλή ροή'}
            icon={<Factory />} 
            bg="bg-white border border-slate-100" 
            text="text-slate-800"
          />
          <StatCard 
            title="Ασημι" 
            value={`${formatDecimal(settings.silver_price_gram, 2)}€`} 
            sub="Τρέχουσα Τιμή"
            icon={<Coins />} 
            bg="bg-white border border-slate-100" 
            text="text-slate-800"
          />
      </div>

      {/* Quick Actions Grid */}
      <div>
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 ml-1">Γρηγορες Ενεργειες</h3>
          <div className="grid grid-cols-4 gap-3">
              <QuickAction 
                icon={<Plus size={20}/>} 
                label="Νέα Εντολή" 
                color="bg-emerald-100 text-emerald-700" 
                onClick={() => onNavigate && onNavigate('orders')}
              />
              <QuickAction 
                icon={<ScanBarcode size={20}/>} 
                label="Scan Stock" 
                color="bg-blue-100 text-blue-700" 
                onClick={() => onNavigate && onNavigate('inventory')}
              />
              <QuickAction 
                icon={<Factory size={20}/>} 
                label="Παραγωγή" 
                color="bg-amber-100 text-amber-700" 
                onClick={() => onNavigate && onNavigate('production')}
              />
              <QuickAction 
                icon={<Package size={20}/>} 
                label="Προϊόντα" 
                color="bg-orange-100 text-orange-700" 
                onClick={() => onNavigate && onNavigate('registry')}
              />
              <QuickAction 
                icon={<Zap size={20}/>} 
                label="AI Studio" 
                color="bg-purple-100 text-purple-700" 
                onClick={() => onNavigate && onNavigate('ai-studio')}
              />
              <QuickAction 
                icon={<Users size={20}/>} 
                label="Πελάτες" 
                color="bg-cyan-100 text-cyan-700" 
                onClick={() => onNavigate && onNavigate('customers')}
              />
              <QuickAction 
                icon={<ScrollText size={20}/>} 
                label="Κατάλογος" 
                color="bg-pink-100 text-pink-700" 
                onClick={() => onNavigate && onNavigate('pricelist')}
              />
              <QuickAction 
                icon={<Settings size={20}/>} 
                label="Ρυθμίσεις" 
                color="bg-slate-100 text-slate-700" 
                onClick={() => onNavigate && onNavigate('settings')}
              />
          </div>
      </div>

      {/* Recent Activity */}
      <div>
          <div className="flex justify-between items-center mb-3 ml-1">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Προσφατες Παραγγελιες</h3>
              <button onClick={() => onNavigate && onNavigate('orders')} className="text-xs font-bold text-emerald-600">Προβολή Όλων</button>
          </div>
          <div className="space-y-3">
              {stats.recentOrders.map(order => (
                  <div key={order.id} className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between">
                      <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center text-slate-400">
                              <ShoppingCart size={18}/>
                          </div>
                          <div>
                              <div className="font-bold text-slate-800 text-sm">{order.customer_name}</div>
                              <div className="text-[10px] text-slate-400 font-mono">#{order.id.slice(0,8)}</div>
                          </div>
                      </div>
                      <div className="text-right">
                          <div className="font-black text-slate-900 text-sm">{formatCurrency(order.total_price)}</div>
                          <div className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full inline-block mt-0.5">
                              {order.items.length} είδη
                          </div>
                      </div>
                  </div>
              ))}
              {stats.recentOrders.length === 0 && (
                  <div className="text-center py-8 text-slate-400 text-xs italic">
                      Καμία πρόσφατη δραστηριότητα.
                  </div>
              )}
          </div>
      </div>
    </div>
  );
}
