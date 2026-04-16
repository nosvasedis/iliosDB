import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/supabase';
import { UserCheck, Search, Plus, X, Mail, Lock, Percent, Pencil, ToggleLeft, ToggleRight, Eye, EyeOff, KeyRound, TrendingUp, ShoppingCart, DollarSign, ArrowUpRight, ArrowDownRight, Minus, ChevronLeft } from 'lucide-react';
import MobileScreenHeader from './MobileScreenHeader';
import { UserProfile, Order, OrderStatus } from '../../types';
import { useUI } from '../UIProvider';
import { useSellers, sellerKeys } from '../../hooks/api/useSellers';
import { formatCurrency } from '../../utils/pricingEngine';

interface SellerFormState {
  full_name: string;
  email: string;
  password: string;
  commission_percent: string;
}

const emptyForm: SellerFormState = { full_name: '', email: '', password: '', commission_percent: '' };

interface SellerStats {
  totalOrders: number;
  activeOrders: number;
  deliveredOrders: number;
  cancelledOrders: number;
  totalRevenue: number;
  totalCommission: number;
  avgOrderValue: number;
  avgCommissionRate: number;
  last30DaysOrders: number;
  last30DaysRevenue: number;
  prev30DaysRevenue: number;
  recentOrders: Order[];
  ordersByStatus: Record<string, number>;
}

function computeSellerStats(sellerId: string, orders: Order[]): SellerStats {
  const sellerOrders = orders.filter(o => o.seller_id === sellerId);
  const nonCancelled = sellerOrders.filter(o => o.status !== OrderStatus.Cancelled);
  const now = Date.now();
  const _30d = 30 * 24 * 60 * 60 * 1000;

  const last30 = nonCancelled.filter(o => now - new Date(o.created_at).getTime() < _30d);
  const prev30 = nonCancelled.filter(o => {
    const t = now - new Date(o.created_at).getTime();
    return t >= _30d && t < _30d * 2;
  });

  const totalRevenue = nonCancelled.reduce((s, o) => s + (o.total_price || 0), 0);
  const totalCommission = nonCancelled.reduce((s, o) => s + ((o.total_price || 0) * (o.seller_commission_percent ?? 0) / 100), 0);

  const statusCounts: Record<string, number> = {};
  sellerOrders.forEach(o => { statusCounts[o.status] = (statusCounts[o.status] || 0) + 1; });

  return {
    totalOrders: sellerOrders.length,
    activeOrders: sellerOrders.filter(o => o.status !== OrderStatus.Delivered && o.status !== OrderStatus.Cancelled).length,
    deliveredOrders: sellerOrders.filter(o => o.status === OrderStatus.Delivered).length,
    cancelledOrders: sellerOrders.filter(o => o.status === OrderStatus.Cancelled).length,
    totalRevenue,
    totalCommission,
    avgOrderValue: nonCancelled.length ? totalRevenue / nonCancelled.length : 0,
    avgCommissionRate: nonCancelled.length ? (nonCancelled.reduce((s, o) => s + (o.seller_commission_percent ?? 0), 0) / nonCancelled.length) : 0,
    last30DaysOrders: last30.length,
    last30DaysRevenue: last30.reduce((s, o) => s + (o.total_price || 0), 0),
    prev30DaysRevenue: prev30.reduce((s, o) => s + (o.total_price || 0), 0),
    recentOrders: sellerOrders.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 8),
    ordersByStatus: statusCounts,
  };
}

const statusLabels: Record<string, string> = {
  [OrderStatus.Pending]: 'Εκκρεμεί',
  [OrderStatus.InProduction]: 'Παραγωγή',
  [OrderStatus.Ready]: 'Έτοιμη',
  [OrderStatus.PartiallyDelivered]: 'Μερ. Παράδοση',
  [OrderStatus.Delivered]: 'Παραδόθηκε',
  [OrderStatus.Cancelled]: 'Ακυρώθηκε',
};

const statusColors: Record<string, string> = {
  [OrderStatus.Pending]: 'bg-amber-100 text-amber-700',
  [OrderStatus.InProduction]: 'bg-blue-100 text-blue-700',
  [OrderStatus.Ready]: 'bg-emerald-100 text-emerald-700',
  [OrderStatus.PartiallyDelivered]: 'bg-purple-100 text-purple-700',
  [OrderStatus.Delivered]: 'bg-green-100 text-green-700',
  [OrderStatus.Cancelled]: 'bg-red-100 text-red-700',
};

export default function MobileSellersPage() {
  const queryClient = useQueryClient();
  const { showToast, confirm } = useUI();
  const { data: sellers, isLoading } = useSellers();
  const { data: orders } = useQuery({ queryKey: ['orders'], queryFn: api.getOrders });

  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingSeller, setEditingSeller] = useState<UserProfile | null>(null);
  const [detailSeller, setDetailSeller] = useState<UserProfile | null>(null);
  const [form, setForm] = useState<SellerFormState>(emptyForm);
  const [showPassword, setShowPassword] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [resetPassword, setResetPassword] = useState('');
  const [showResetField, setShowResetField] = useState(false);

  const globalStats = useMemo(() => {
    if (!orders || !sellers) return null;
    const sellerIds = new Set(sellers.map(s => s.id));
    const sellerOrders = orders.filter(o => o.seller_id && sellerIds.has(o.seller_id) && o.status !== OrderStatus.Cancelled);
    const totalRevenue = sellerOrders.reduce((s, o) => s + (o.total_price || 0), 0);
    const totalCommission = sellerOrders.reduce((s, o) => s + ((o.total_price || 0) * (o.seller_commission_percent ?? 0) / 100), 0);
    return { totalOrders: sellerOrders.length, totalRevenue, totalCommission, activeSellers: sellers.filter(s => s.is_approved).length };
  }, [orders, sellers]);

  const sellerStatsMap = useMemo(() => {
    if (!orders || !sellers) return new Map<string, SellerStats>();
    const map = new Map<string, SellerStats>();
    sellers.forEach(s => map.set(s.id, computeSellerStats(s.id, orders)));
    return map;
  }, [orders, sellers]);

  const filteredSellers = useMemo(() => {
    if (!sellers) return [];
    const lower = search.toLowerCase();
    return sellers.filter(s => s.full_name.toLowerCase().includes(lower) || s.email.toLowerCase().includes(lower));
  }, [sellers, search]);

  const openCreate = () => { setForm(emptyForm); setEditingSeller(null); setShowForm(true); setShowPassword(false); setResetPassword(''); setShowResetField(false); };

  const openEdit = (seller: UserProfile) => {
    setEditingSeller(seller);
    setForm({ full_name: seller.full_name, email: seller.email, password: '', commission_percent: seller.commission_percent != null ? String(seller.commission_percent) : '' });
    setShowForm(true); setShowPassword(false); setResetPassword(''); setShowResetField(false);
  };

  const handleCreate = async () => {
    if (!form.full_name.trim() || !form.email.trim() || !form.password.trim()) { showToast('Συμπληρώστε όνομα, email και κωδικό.', 'error'); return; }
    setIsSaving(true);
    try {
      await api.createSeller({ email: form.email.trim(), password: form.password, full_name: form.full_name.trim(), commission_percent: form.commission_percent ? Number(form.commission_percent) : undefined });
      queryClient.invalidateQueries({ queryKey: sellerKeys.all });
      setShowForm(false); showToast('Ο πλασιέ δημιουργήθηκε.', 'success');
    } catch (e: any) { showToast(e.message || 'Σφάλμα', 'error'); } finally { setIsSaving(false); }
  };

  const handleUpdate = async () => {
    if (!editingSeller || !form.full_name.trim()) { showToast('Το όνομα είναι υποχρεωτικό.', 'error'); return; }
    setIsSaving(true);
    try {
      await api.updateSeller({ id: editingSeller.id, full_name: form.full_name.trim(), commission_percent: form.commission_percent !== '' ? Number(form.commission_percent) : null, ...(resetPassword ? { new_password: resetPassword } : {}) });
      queryClient.invalidateQueries({ queryKey: sellerKeys.all });
      setShowForm(false); setEditingSeller(null); showToast('Ο πλασιέ ενημερώθηκε.', 'success');
    } catch (e: any) { showToast(e.message || 'Σφάλμα', 'error'); } finally { setIsSaving(false); }
  };

  const handleToggleActive = async (seller: UserProfile) => {
    const action = seller.is_approved ? 'απενεργοποίηση' : 'ενεργοποίηση';
    if (!await confirm({ title: seller.is_approved ? 'Απενεργοποίηση' : 'Ενεργοποίηση', message: `${action} του "${seller.full_name}";` })) return;
    try {
      await api.updateSeller({ id: seller.id, is_approved: !seller.is_approved });
      queryClient.invalidateQueries({ queryKey: sellerKeys.all });
      showToast(`${seller.is_approved ? 'Απενεργοποιήθηκε' : 'Ενεργοποιήθηκε'}.`, 'success');
    } catch (e: any) { showToast(e.message || 'Σφάλμα', 'error'); }
  };

  const detailStats = detailSeller ? sellerStatsMap.get(detailSeller.id) : null;

  return (
    <div className="min-h-full bg-gradient-to-b from-slate-50 to-white pb-28">
      <MobileScreenHeader icon={UserCheck} title="Πλασιέ" subtitle="Διαχείριση & Οικονομικά" iconClassName="text-sky-600" />

      {/* ── Global Stats Strip ── */}
      {globalStats && (
        <div className="px-4 pt-4">
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 scrollbar-hide">
            <MiniStat icon={<UserCheck size={14} />} label="Ενεργοί" value={String(globalStats.activeSellers)} color="sky" />
            <MiniStat icon={<ShoppingCart size={14} />} label="Παραγγελίες" value={String(globalStats.totalOrders)} color="violet" />
            <MiniStat icon={<DollarSign size={14} />} label="Έσοδα" value={formatCurrency(globalStats.totalRevenue)} color="emerald" />
            <MiniStat icon={<Percent size={14} />} label="Προμήθειες" value={formatCurrency(globalStats.totalCommission)} color="amber" />
          </div>
        </div>
      )}

      {/* ── Search + Create ── */}
      <div className="px-4 pt-4 space-y-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Αναζήτηση πλασιέ..." className="w-full pl-9 pr-4 py-3 rounded-xl bg-white border border-slate-200 text-sm font-medium outline-none focus:ring-2 focus:ring-sky-500/20" />
            {search && <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"><X size={14} /></button>}
          </div>
          <button onClick={openCreate} className="shrink-0 p-3 bg-sky-600 text-white rounded-xl shadow-sm active:scale-95"><Plus size={20} /></button>
        </div>
      </div>

      {/* ── Sellers List ── */}
      <div className="px-4 pt-4 space-y-3">
        {isLoading ? (
          <div className="text-center py-12 text-slate-400 font-medium text-sm">Φόρτωση...</div>
        ) : filteredSellers.length === 0 ? (
          <div className="text-center py-16">
            <UserCheck size={40} className="mx-auto text-slate-300 mb-3" />
            <p className="text-sm font-bold text-slate-500">{search ? 'Δεν βρέθηκαν πλασιέ' : 'Κανένας πλασιέ'}</p>
            <p className="text-xs text-slate-400 mt-1">{search ? 'Δοκιμάστε διαφορετική αναζήτηση.' : 'Πατήστε + για να δημιουργήσετε.'}</p>
          </div>
        ) : (
          filteredSellers.map(seller => {
            const stats = sellerStatsMap.get(seller.id);
            return (
              <div key={seller.id} className={`bg-white rounded-2xl border p-4 shadow-sm transition-all ${seller.is_approved ? 'border-slate-100' : 'border-slate-200 opacity-60'}`}>
                {/* Header */}
                <div className="flex items-start gap-3">
                  <div className={`w-11 h-11 rounded-xl flex items-center justify-center font-bold text-lg shrink-0 ${seller.is_approved ? 'bg-sky-50 text-sky-600' : 'bg-slate-100 text-slate-400'}`}>
                    {seller.full_name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-bold text-slate-800 text-sm truncate">{seller.full_name}</h3>
                      <div className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full shrink-0 ${seller.is_approved ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                        {seller.is_approved ? 'Ενεργός' : 'Ανενεργός'}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-0.5">
                      <Mail size={11} className="text-slate-400" />
                      <span className="truncate">{seller.email}</span>
                    </div>
                    <div className="flex items-center gap-1 mt-1">
                      <Percent size={12} className="text-emerald-500" />
                      <span className="text-sm font-black text-emerald-700">{seller.commission_percent != null ? `${seller.commission_percent}%` : '—'}</span>
                      <span className="text-[10px] text-slate-400">προμήθεια</span>
                    </div>
                  </div>
                </div>

                {/* Inline Stats */}
                {stats && stats.totalOrders > 0 && (
                  <div className="grid grid-cols-3 gap-2 mt-3">
                    <div className="bg-slate-50 rounded-lg p-2 text-center">
                      <p className="text-[9px] text-slate-400 font-bold">Παραγγελίες</p>
                      <p className="text-xs font-black text-slate-700">{stats.totalOrders}</p>
                    </div>
                    <div className="bg-emerald-50/60 rounded-lg p-2 text-center">
                      <p className="text-[9px] text-emerald-600 font-bold">Έσοδα</p>
                      <p className="text-xs font-black text-emerald-700">{formatCurrency(stats.totalRevenue)}</p>
                    </div>
                    <div className="bg-amber-50/60 rounded-lg p-2 text-center">
                      <p className="text-[9px] text-amber-600 font-bold">Προμήθειες</p>
                      <p className="text-xs font-black text-amber-700">{formatCurrency(stats.totalCommission)}</p>
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-50">
                  <button onClick={() => setDetailSeller(seller)} className="text-[11px] font-bold text-sky-600 flex items-center gap-1 active:scale-95">
                    <TrendingUp size={12} /> Λεπτομέρειες
                  </button>
                  <div className="flex items-center gap-1">
                    <button onClick={() => openEdit(seller)} className="p-2 rounded-lg text-slate-400 hover:text-sky-600 hover:bg-sky-50 active:scale-95"><Pencil size={14} /></button>
                    <button onClick={() => handleToggleActive(seller)} className="p-2 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50 active:scale-95">
                      {seller.is_approved ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ── Detail Full Screen ── */}
      {detailSeller && detailStats && (
        <div className="fixed inset-0 z-50 bg-white flex flex-col animate-in slide-in-from-right duration-200">
          {/* Header */}
          <div className="shrink-0 px-4 py-4 border-b border-slate-100 bg-slate-50/95">
            <div className="flex items-center gap-3">
              <button onClick={() => setDetailSeller(null)} className="p-1.5 rounded-lg hover:bg-slate-200 active:scale-95">
                <ChevronLeft size={20} className="text-slate-500" />
              </button>
              <div className="w-10 h-10 rounded-xl bg-sky-100 text-sky-600 flex items-center justify-center text-lg font-black shrink-0">
                {detailSeller.full_name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="font-black text-slate-800 truncate">{detailSeller.full_name}</h2>
                <p className="text-[10px] text-slate-500 truncate">{detailSeller.email} · {detailSeller.commission_percent ?? 0}% προμ.</p>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            <div className="p-4 space-y-4">
              {/* KPI Grid */}
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-sky-50 rounded-xl p-3">
                  <p className="text-[9px] font-bold text-sky-500 uppercase">Παραγγελίες</p>
                  <p className="text-xl font-black text-sky-700">{detailStats.totalOrders}</p>
                  <p className="text-[10px] text-sky-600">{detailStats.activeOrders} ενεργές</p>
                </div>
                <div className="bg-emerald-50 rounded-xl p-3">
                  <p className="text-[9px] font-bold text-emerald-500 uppercase">Έσοδα</p>
                  <p className="text-xl font-black text-emerald-700">{formatCurrency(detailStats.totalRevenue)}</p>
                  <p className="text-[10px] text-emerald-600">Μ.Ο. {formatCurrency(detailStats.avgOrderValue)}</p>
                </div>
                <div className="bg-amber-50 rounded-xl p-3">
                  <p className="text-[9px] font-bold text-amber-500 uppercase">Προμήθειες</p>
                  <p className="text-xl font-black text-amber-700">{formatCurrency(detailStats.totalCommission)}</p>
                  <p className="text-[10px] text-amber-600">Μ.Ο. {detailStats.avgCommissionRate.toFixed(1)}%</p>
                </div>
                <div className="bg-violet-50 rounded-xl p-3">
                  <p className="text-[9px] font-bold text-violet-500 uppercase">Παραδόσεις</p>
                  <p className="text-xl font-black text-violet-700">{detailStats.deliveredOrders}</p>
                  <p className="text-[10px] text-violet-600">{detailStats.cancelledOrders} ακυρώσεις</p>
                </div>
              </div>

              {/* 30-day Trend */}
              <div className="bg-gradient-to-r from-slate-50 to-white rounded-xl border border-slate-100 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Τελευταίες 30 Ημέρες</p>
                    <p className="text-lg font-black text-slate-800 mt-0.5">{formatCurrency(detailStats.last30DaysRevenue)}</p>
                    <p className="text-[10px] text-slate-500">{detailStats.last30DaysOrders} παραγγελίες</p>
                  </div>
                  <MobileTrendBadge current={detailStats.last30DaysRevenue} previous={detailStats.prev30DaysRevenue} />
                </div>
              </div>

              {/* Order Status Breakdown */}
              {Object.keys(detailStats.ordersByStatus).length > 0 && (
                <div>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-2">Κατάσταση Παραγγελιών</p>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(detailStats.ordersByStatus).map(([status, count]) => (
                      <div key={status} className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold ${statusColors[status] || 'bg-slate-100 text-slate-600'}`}>
                        {statusLabels[status] || status} <span className="font-black">{count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Commission Summary */}
              <div className="bg-amber-50/50 rounded-xl border border-amber-100 p-4">
                <p className="text-[9px] font-bold text-amber-600 uppercase tracking-wider mb-2">Σύνοψη Προμηθειών</p>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <p className="text-[10px] text-amber-600/70">Συνολικά</p>
                    <p className="text-sm font-black text-amber-700">{formatCurrency(detailStats.totalCommission)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-amber-600/70">Μ.Ο. %</p>
                    <p className="text-sm font-black text-amber-700">{detailStats.avgCommissionRate.toFixed(1)}%</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-amber-600/70">/ Παραγγ.</p>
                    <p className="text-sm font-black text-amber-700">{formatCurrency(detailStats.totalOrders > 0 ? detailStats.totalCommission / detailStats.totalOrders : 0)}</p>
                  </div>
                </div>
              </div>

              {/* Recent Orders */}
              {detailStats.recentOrders.length > 0 && (
                <div>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-2">Πρόσφατες Παραγγελίες</p>
                  <div className="space-y-2">
                    {detailStats.recentOrders.map(order => (
                      <div key={order.id} className="flex items-center justify-between bg-slate-50 rounded-xl px-3 py-2.5 border border-slate-100">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className={`h-2 w-2 rounded-full shrink-0 ${order.status === OrderStatus.Delivered ? 'bg-green-500' : order.status === OrderStatus.Cancelled ? 'bg-red-400' : 'bg-sky-500'}`} />
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-slate-700 truncate">{order.customer_name}</p>
                            <p className="text-[10px] text-slate-400">{new Date(order.created_at).toLocaleDateString('el-GR')}</p>
                          </div>
                        </div>
                        <div className="text-right shrink-0 ml-2">
                          <p className="text-xs font-black text-slate-700">{formatCurrency(order.total_price)}</p>
                          <p className="text-[9px] text-amber-600 font-bold">{formatCurrency((order.total_price || 0) * (order.seller_commission_percent ?? 0) / 100)} προμ.</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Create/Edit Full Screen Modal ── */}
      {showForm && (
        <div className="fixed inset-0 z-50 bg-white flex flex-col animate-in slide-in-from-bottom duration-200">
          <div className="shrink-0 px-4 py-4 border-b border-slate-100 bg-slate-50/95 flex items-center justify-between">
            <h2 className="text-lg font-black text-slate-800">{editingSeller ? 'Επεξεργασία Πλασιέ' : 'Νέος Πλασιέ'}</h2>
            <button onClick={() => { setShowForm(false); setEditingSeller(null); }} className="p-2 rounded-full hover:bg-slate-200"><X size={20} className="text-slate-500" /></button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Full Name */}
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Ονοματεπώνυμο</label>
              <input value={form.full_name} onChange={e => setForm(p => ({ ...p, full_name: e.target.value }))} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none font-bold text-slate-800 focus:ring-2 focus:ring-sky-500/20" placeholder="π.χ. Γιάννης Παπαδόπουλος" autoFocus />
            </div>
            {/* Email */}
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Email</label>
              <div className="relative">
                <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} className="w-full p-3 pl-10 bg-slate-50 border border-slate-200 rounded-xl outline-none font-bold text-slate-800 focus:ring-2 focus:ring-sky-500/20" placeholder="seller@example.com" type="email" disabled={!!editingSeller} />
              </div>
            </div>
            {/* Password (create) or Reset (edit) */}
            {!editingSeller ? (
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Κωδικός</label>
                <div className="relative">
                  <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))} className="w-full p-3 pl-10 pr-10 bg-slate-50 border border-slate-200 rounded-xl outline-none font-bold text-slate-800 focus:ring-2 focus:ring-sky-500/20" placeholder="Τουλάχιστον 6 χαρακτήρες" type={showPassword ? 'text' : 'password'} />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
            ) : (
              <div>
                {!showResetField ? (
                  <button type="button" onClick={() => setShowResetField(true)} className="flex items-center gap-2 text-sm text-sky-600 font-bold">
                    <KeyRound size={14} /> Αλλαγή κωδικού
                  </button>
                ) : (
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Νέος Κωδικός</label>
                    <div className="relative">
                      <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input value={resetPassword} onChange={e => setResetPassword(e.target.value)} className="w-full p-3 pl-10 bg-slate-50 border border-slate-200 rounded-xl outline-none font-bold text-slate-800 focus:ring-2 focus:ring-sky-500/20" placeholder="Νέος κωδικός" type={showPassword ? 'text' : 'password'} />
                      <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
            {/* Commission */}
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Προμήθεια (%)</label>
              <div className="relative">
                <Percent size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={form.commission_percent} onChange={e => { const val = e.target.value.replace(/[^0-9.,]/g, ''); setForm(p => ({ ...p, commission_percent: val })); }} className="w-full p-3 pl-10 bg-slate-50 border border-slate-200 rounded-xl outline-none font-bold text-slate-800 focus:ring-2 focus:ring-sky-500/20" placeholder="π.χ. 5" inputMode="decimal" />
              </div>
              <p className="text-[10px] text-slate-400 mt-1">Μπορεί να αλλαχτεί ανά παραγγελία</p>
            </div>
          </div>

          <div className="shrink-0 px-4 py-4 border-t border-slate-100 bg-white">
            <button onClick={editingSeller ? handleUpdate : handleCreate} disabled={isSaving} className="w-full py-3.5 bg-sky-600 text-white rounded-xl font-bold text-sm active:scale-[0.98] disabled:opacity-50">
              {isSaving ? 'Αποθήκευση...' : (editingSeller ? 'Αποθήκευση Αλλαγών' : 'Δημιουργία Πλασιέ')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Sub-components ── */

function MiniStat({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: 'sky' | 'violet' | 'emerald' | 'amber' }) {
  const colors = {
    sky: 'bg-sky-50 text-sky-600 border-sky-100',
    violet: 'bg-violet-50 text-violet-600 border-violet-100',
    emerald: 'bg-emerald-50 text-emerald-600 border-emerald-100',
    amber: 'bg-amber-50 text-amber-600 border-amber-100',
  };
  return (
    <div className={`shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl border ${colors[color]}`}>
      <span className="opacity-60">{icon}</span>
      <div>
        <p className="text-[9px] font-bold uppercase opacity-70">{label}</p>
        <p className="text-xs font-black whitespace-nowrap">{value}</p>
      </div>
    </div>
  );
}

function MobileTrendBadge({ current, previous }: { current: number; previous: number }) {
  if (previous === 0 && current === 0) return <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 text-slate-500 text-[11px] font-bold"><Minus size={12} /> Σταθερά</div>;
  if (previous === 0) return <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-700 text-[11px] font-bold"><ArrowUpRight size={12} /> Νέο</div>;
  const change = ((current - previous) / previous) * 100;
  if (Math.abs(change) < 1) return <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 text-slate-500 text-[11px] font-bold"><Minus size={12} /> Σταθερά</div>;
  return change > 0 ? (
    <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-700 text-[11px] font-bold"><ArrowUpRight size={12} /> +{change.toFixed(0)}%</div>
  ) : (
    <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-100 text-red-600 text-[11px] font-bold"><ArrowDownRight size={12} /> {change.toFixed(0)}%</div>
  );
}
