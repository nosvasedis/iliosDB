import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  BarChart3,
  Coins,
  DollarSign,
  Loader2,
  PieChart as PieChartIcon,
  Printer,
  TrendingUp,
  Users,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { Product } from '../../types';
import { api } from '../../lib/supabase';
import { calculateBusinessStats } from '../../utils/businessAnalytics';
import { formatCurrency, formatDecimal } from '../../utils/pricingEngine';
import MobileScreenHeader from './MobileScreenHeader';

interface Props {
  products: Product[];
  onPrint?: (stats: any) => void;
}

function StatCard({
  title,
  value,
  hint,
  icon,
  tone,
}: {
  title: string;
  value: string;
  hint?: string;
  icon: React.ReactNode;
  tone: string;
}) {
  return (
    <div className={`rounded-3xl border p-4 shadow-sm ${tone}`}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.18em] opacity-70">{title}</p>
          <p className="mt-2 text-2xl font-black tracking-tight">{value}</p>
          {hint ? <p className="mt-1 text-xs font-medium opacity-75">{hint}</p> : null}
        </div>
        <div className="rounded-2xl bg-white/70 p-3 shadow-sm">{icon}</div>
      </div>
    </div>
  );
}

export default function MobileAnalytics({ products, onPrint }: Props) {
  const { data: orders, isLoading: loadingOrders } = useQuery({ queryKey: ['orders'], queryFn: api.getOrders });
  const { data: materials, isLoading: loadingMaterials } = useQuery({ queryKey: ['materials'], queryFn: api.getMaterials });
  const { data: settings, isLoading: loadingSettings } = useQuery({ queryKey: ['settings'], queryFn: api.getSettings });

  const stats = useMemo(() => {
    if (!orders || !materials || !settings) return null;
    return calculateBusinessStats(orders, products, materials, settings);
  }, [materials, orders, products, settings]);

  const topCategories = useMemo(() => (stats?.categoryChartData || []).slice(0, 5), [stats]);
  const topCustomers = useMemo(() => (stats?.topCustomers || []).slice(0, 5), [stats]);
  const salesTrend = useMemo(() => (stats?.timeChartData || []).slice(-6), [stats]);

  if (loadingOrders || loadingMaterials || loadingSettings) {
    return (
      <div className="min-h-full bg-slate-50">
        <MobileScreenHeader icon={BarChart3} title="Ανάλυση" subtitle="Οικονομικά στοιχεία και τάσεις" iconClassName="text-indigo-700" />
        <div className="px-5 py-10 flex flex-col items-center justify-center text-slate-500">
          <Loader2 size={28} className="animate-spin text-indigo-600" />
          <p className="mt-3 text-sm font-bold">Φόρτωση οικονομικής ανάλυσης...</p>
        </div>
      </div>
    );
  }

  if (!stats || !settings) {
    return (
      <div className="min-h-full bg-slate-50">
        <MobileScreenHeader icon={BarChart3} title="Ανάλυση" subtitle="Οικονομικά στοιχεία και τάσεις" iconClassName="text-indigo-700" />
        <div className="px-5 py-10">
          <div className="rounded-3xl border border-rose-200 bg-rose-50 p-5 text-rose-700 shadow-sm">
            <p className="text-sm font-black">Δεν ήταν δυνατή η φόρτωση της ανάλυσης.</p>
            <p className="mt-2 text-xs font-medium">Δοκιμάστε ξανά σε λίγο.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-slate-50 pb-28">
      <MobileScreenHeader
        icon={BarChart3}
        title="Ανάλυση"
        subtitle="Οικονομικά στοιχεία και τάσεις"
        iconClassName="text-indigo-700"
        right={(
          <button
            type="button"
            onClick={() => onPrint?.(stats)}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-xs font-black text-white shadow-sm"
          >
            <Printer size={14} />
            Εκτύπωση
          </button>
        )}
      />

      <div className="space-y-4 px-4 pt-3">
        <div className="grid grid-cols-1 gap-3">
          <StatCard
            title="Καθαρά έσοδα"
            value={formatCurrency(stats.totalRevenue)}
            hint={`${stats.orderCount} παραγγελίες`}
            icon={<DollarSign size={20} className="text-emerald-700" />}
            tone="border-emerald-200 bg-emerald-50 text-emerald-950"
          />
          <div className="grid grid-cols-2 gap-3">
            <StatCard
              title="Καθαρό κέρδος"
              value={formatCurrency(stats.totalProfit)}
              hint={`Περιθώριο ${stats.avgMargin.toFixed(1)}%`}
              icon={<TrendingUp size={20} className="text-blue-700" />}
              tone="border-blue-200 bg-blue-50 text-blue-950"
            />
            <StatCard
              title="Τιμή ασημιού"
              value={`${formatDecimal(settings.silver_price_gram, 3)} €/γρ.`}
              hint="Τρέχουσα βάση κοστολόγησης"
              icon={<Coins size={20} className="text-amber-700" />}
              tone="border-amber-200 bg-amber-50 text-amber-950"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <StatCard
              title="Συνολικό κόστος"
              value={formatCurrency(stats.totalCost)}
              hint="Παραγωγή, εργασία, υλικά"
              icon={<Activity size={20} className="text-slate-700" />}
              tone="border-slate-200 bg-white text-slate-950"
            />
            <StatCard
              title="Μέση παραγγελία"
              value={formatCurrency(stats.avgOrderValue)}
              hint={`${stats.avgBasketSize.toFixed(1)} είδη ανά παραγγελία`}
              icon={<PieChartIcon size={20} className="text-fuchsia-700" />}
              tone="border-fuchsia-200 bg-fuchsia-50 text-fuchsia-950"
            />
          </div>
        </div>

        <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-black text-slate-900">Τάση εσόδων και κέρδους</h3>
            <span className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Τελευταίοι μήνες</span>
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={salesTrend} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <defs>
                  <linearGradient id="mobileRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.45} />
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="mobileProfit" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#059669" stopOpacity={0.45} />
                    <stop offset="95%" stopColor="#059669" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 10, fontWeight: 700 }} stroke="#94a3b8" />
                <YAxis hide />
                <Tooltip
                  formatter={(value: number) => formatCurrency(value)}
                  contentStyle={{ borderRadius: 16, border: '1px solid #e2e8f0', fontSize: 12 }}
                />
                <Area type="monotone" dataKey="revenue" stroke="#2563eb" strokeWidth={2.5} fill="url(#mobileRevenue)" name="Έσοδα" />
                <Area type="monotone" dataKey="profit" stroke="#059669" strokeWidth={2.5} fill="url(#mobileProfit)" name="Κέρδος" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-black text-slate-900">Κορυφαίες κατηγορίες</h3>
            <span className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Με βάση τα έσοδα</span>
          </div>
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topCategories} layout="vertical" margin={{ top: 0, right: 16, left: 12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#eef2f7" />
                <XAxis type="number" hide />
                <YAxis dataKey="name" type="category" tick={{ fontSize: 11, fontWeight: 700 }} width={86} />
                <Tooltip
                  formatter={(value: number) => formatCurrency(value)}
                  contentStyle={{ borderRadius: 16, border: '1px solid #e2e8f0', fontSize: 12 }}
                />
                <Bar dataKey="revenue" radius={[0, 8, 8, 0]} fill="#7c3aed" name="Έσοδα" barSize={18} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-black text-slate-900">Καλύτεροι πελάτες</h3>
            <span className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Top 5</span>
          </div>
          <div className="space-y-2.5">
            {topCustomers.length > 0 ? topCustomers.map((customer: any, index: number) => (
              <div key={`${customer.name}-${index}`} className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50 px-3 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-white text-slate-500 shadow-sm">
                    <Users size={16} />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-slate-900">{customer.name}</p>
                    <p className="text-[11px] font-bold text-slate-500">{customer.orders} παραγγελίες</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-black text-slate-900">{formatCurrency(customer.revenue)}</p>
                </div>
              </div>
            )) : (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-xs font-medium text-slate-500">
                Δεν υπάρχουν αρκετά στοιχεία πελατών για κατάταξη.
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
