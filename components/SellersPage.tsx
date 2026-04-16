import React, { useState, useMemo } from 'react';
import { UserCheck, Plus, Search, X, Mail, Lock, Percent, ToggleLeft, ToggleRight, Pencil, Eye, EyeOff, KeyRound, TrendingUp, ShoppingCart, DollarSign, ArrowUpRight, ArrowDownRight, Minus, Package, Clock } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/supabase';
import { useUI } from './UIProvider';
import { useSellers, sellerKeys } from '../hooks/api/useSellers';
import { UserProfile, Order, OrderStatus } from '../types';
import { formatCurrency } from '../utils/pricingEngine';
import DesktopPageHeader from './DesktopPageHeader';

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
  [OrderStatus.PartiallyDelivered]: 'Μερική Παράδοση',
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

export default function SellersPage() {
  const queryClient = useQueryClient();
  const { showToast, confirm } = useUI();
  const { data: sellers, isLoading } = useSellers();
  const { data: orders } = useQuery({ queryKey: ['orders'], queryFn: api.getOrders });

  const [searchTerm, setSearchTerm] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
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
    const lower = searchTerm.toLowerCase();
    return sellers.filter(s => s.full_name.toLowerCase().includes(lower) || s.email.toLowerCase().includes(lower));
  }, [sellers, searchTerm]);

  const activeSellers = filteredSellers.filter(s => s.is_approved);
  const inactiveSellers = filteredSellers.filter(s => !s.is_approved);

  const openCreate = () => { setForm(emptyForm); setEditingSeller(null); setShowCreateModal(true); setShowPassword(false); };

  const openEdit = (seller: UserProfile) => {
    setEditingSeller(seller);
    setForm({ full_name: seller.full_name, email: seller.email, password: '', commission_percent: seller.commission_percent != null ? String(seller.commission_percent) : '' });
    setShowCreateModal(true); setShowPassword(false); setResetPassword(''); setShowResetField(false);
  };

  const handleCreate = async () => {
    if (!form.full_name.trim() || !form.email.trim() || !form.password.trim()) { showToast('Συμπληρώστε όνομα, email και κωδικό.', 'error'); return; }
    setIsSaving(true);
    try {
      await api.createSeller({ email: form.email.trim(), password: form.password, full_name: form.full_name.trim(), commission_percent: form.commission_percent ? Number(form.commission_percent) : undefined });
      queryClient.invalidateQueries({ queryKey: sellerKeys.all });
      setShowCreateModal(false); setForm(emptyForm);
      showToast('Ο πλασιέ δημιουργήθηκε επιτυχώς.', 'success');
    } catch (e: any) { showToast(e.message || 'Σφάλμα δημιουργίας', 'error'); } finally { setIsSaving(false); }
  };

  const handleUpdate = async () => {
    if (!editingSeller) return;
    if (!form.full_name.trim()) { showToast('Το όνομα είναι υποχρεωτικό.', 'error'); return; }
    setIsSaving(true);
    try {
      await api.updateSeller({ id: editingSeller.id, full_name: form.full_name.trim(), commission_percent: form.commission_percent !== '' ? Number(form.commission_percent) : 0, ...(resetPassword ? { new_password: resetPassword } : {}) });
      queryClient.invalidateQueries({ queryKey: sellerKeys.all });
      setShowCreateModal(false); setEditingSeller(null); setForm(emptyForm);
      showToast('Ο πλασιέ ενημερώθηκε.', 'success');
    } catch (e: any) { showToast(e.message || 'Σφάλμα ενημέρωσης', 'error'); } finally { setIsSaving(false); }
  };

  const handleToggleActive = async (seller: UserProfile) => {
    const action = seller.is_approved ? 'απενεργοποίηση' : 'ενεργοποίηση';
    if (!await confirm({ title: seller.is_approved ? 'Απενεργοποίηση' : 'Ενεργοποίηση', message: `Θέλετε σίγουρα ${action} του πλασιέ "${seller.full_name}";` })) return;
    try {
      await api.updateSeller({ id: seller.id, is_approved: !seller.is_approved });
      queryClient.invalidateQueries({ queryKey: sellerKeys.all });
      showToast(`Ο πλασιέ ${seller.is_approved ? 'απενεργοποιήθηκε' : 'ενεργοποιήθηκε'}.`, 'success');
    } catch (e: any) { showToast(e.message || 'Σφάλμα', 'error'); }
  };

  const handleDelete = async (seller: UserProfile) => {
    if (!await confirm({ title: 'Απενεργοποίηση Πλασιέ', message: `Θέλετε σίγουρα να απενεργοποιήσετε τον πλασιέ "${seller.full_name}";`, isDestructive: true })) return;
    try {
      await api.deleteSeller(seller.id);
      queryClient.invalidateQueries({ queryKey: sellerKeys.all });
      showToast('Ο πλασιέ απενεργοποιήθηκε.', 'info');
    } catch (e: any) { showToast(e.message || 'Σφάλμα', 'error'); }
  };

  const detailStats = detailSeller ? sellerStatsMap.get(detailSeller.id) : null;

  if (isLoading) {
    return (
      <div className="p-6">
        <DesktopPageHeader icon={UserCheck} title="Πλασιέ" subtitle="Διαχείριση πωλητών" />
        <div className="mt-8 text-center text-slate-400 font-medium">Φόρτωση...</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <DesktopPageHeader
        icon={UserCheck}
        title="Πλασιέ"
        subtitle="Διαχείριση & Οικονομικά Πωλητών"
        tail={
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Αναζήτηση..."
                className="pl-9 pr-4 py-2 w-64 rounded-xl bg-white border border-slate-200 text-sm font-medium outline-none focus:ring-2 focus:ring-sky-500/20"
              />
              {searchTerm && (
                <button onClick={() => setSearchTerm('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  <X size={14} />
                </button>
              )}
            </div>
            <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2 bg-sky-600 text-white rounded-xl text-sm font-bold shadow-sm hover:bg-sky-700 active:scale-95 transition-all">
              <Plus size={16} /> Νέος Πλασιέ
            </button>
          </div>
        }
      />

      {/* ── Global Summary Cards ── */}
      {globalStats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <SummaryCard label="Ενεργοί Πλασιέ" value={String(globalStats.activeSellers)} icon={<UserCheck size={20} />} color="sky" />
          <SummaryCard label="Σύνολο Παραγγελιών" value={String(globalStats.totalOrders)} icon={<ShoppingCart size={20} />} color="violet" />
          <SummaryCard label="Συνολικά Έσοδα" value={formatCurrency(globalStats.totalRevenue)} icon={<DollarSign size={20} />} color="emerald" />
          <SummaryCard label="Συνολικές Προμήθειες" value={formatCurrency(globalStats.totalCommission)} icon={<Percent size={20} />} color="amber" />
        </div>
      )}

      {/* ── Active Sellers ── */}
      {activeSellers.length > 0 && (
        <div>
          <h3 className="text-xs font-black uppercase text-slate-400 tracking-wider mb-3">Ενεργοί Πλασιέ ({activeSellers.length})</h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
            {activeSellers.map(seller => (
              <SellerCard
                key={seller.id}
                seller={seller}
                stats={sellerStatsMap.get(seller.id)}
                onEdit={() => openEdit(seller)}
                onToggle={() => handleToggleActive(seller)}
                onDetail={() => setDetailSeller(seller)}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Inactive Sellers ── */}
      {inactiveSellers.length > 0 && (
        <div>
          <h3 className="text-xs font-black uppercase text-slate-400 tracking-wider mb-3">Ανενεργοί Πλασιέ ({inactiveSellers.length})</h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
            {inactiveSellers.map(seller => (
              <SellerCard
                key={seller.id}
                seller={seller}
                stats={sellerStatsMap.get(seller.id)}
                onEdit={() => openEdit(seller)}
                onToggle={() => handleToggleActive(seller)}
                onDetail={() => setDetailSeller(seller)}
                inactive
              />
            ))}
          </div>
        </div>
      )}

      {filteredSellers.length === 0 && (
        <div className="text-center py-20">
          <UserCheck size={48} className="mx-auto text-slate-300 mb-4" />
          <p className="text-lg font-bold text-slate-400">{searchTerm ? 'Δεν βρέθηκαν πλασιέ' : 'Κανένας πλασιέ'}</p>
          <p className="text-sm text-slate-400 mt-1">{searchTerm ? 'Δοκιμάστε διαφορετική αναζήτηση.' : 'Πατήστε "Νέος Πλασιέ" για να ξεκινήσετε.'}</p>
        </div>
      )}

      {/* ── Detail Modal ── */}
      {detailSeller && detailStats && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setDetailSeller(null)}>
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="px-6 py-5 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-sky-100 text-sky-600 flex items-center justify-center text-xl font-black">
                  {detailSeller.full_name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h2 className="text-lg font-black text-slate-800">{detailSeller.full_name}</h2>
                  <p className="text-xs text-slate-500">{detailSeller.email} · Προμήθεια: {detailSeller.commission_percent ?? 0}%</p>
                </div>
              </div>
              <button onClick={() => setDetailSeller(null)} className="p-2 rounded-full hover:bg-slate-100 transition-colors">
                <X size={20} className="text-slate-400" />
              </button>
            </div>

            <div className="overflow-y-auto max-h-[calc(85vh-80px)] p-6 space-y-6">
              {/* KPI Grid */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <KpiCard label="Παραγγελίες" value={String(detailStats.totalOrders)} sub={`${detailStats.activeOrders} ενεργές`} color="sky" />
                <KpiCard label="Έσοδα" value={formatCurrency(detailStats.totalRevenue)} sub={`Μ.Ο. ${formatCurrency(detailStats.avgOrderValue)}`} color="emerald" />
                <KpiCard label="Προμήθειες" value={formatCurrency(detailStats.totalCommission)} sub={`Μ.Ο. ${detailStats.avgCommissionRate.toFixed(1)}%`} color="amber" />
                <KpiCard label="Παραδόσεις" value={String(detailStats.deliveredOrders)} sub={`${detailStats.cancelledOrders} ακυρώσεις`} color="violet" />
              </div>

              {/* 30-day Trend */}
              <div className="bg-gradient-to-r from-slate-50 to-white rounded-xl border border-slate-100 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Τελευταίες 30 Ημέρες</p>
                    <p className="text-xl font-black text-slate-800 mt-1">{formatCurrency(detailStats.last30DaysRevenue)}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{detailStats.last30DaysOrders} παραγγελίες</p>
                  </div>
                  <TrendBadge current={detailStats.last30DaysRevenue} previous={detailStats.prev30DaysRevenue} />
                </div>
              </div>

              {/* Order Breakdown by Status */}
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">Ανάλυση Κατάστασης Παραγγελιών</p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(detailStats.ordersByStatus).map(([status, count]) => (
                    <div key={status} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold ${statusColors[status] || 'bg-slate-100 text-slate-600'}`}>
                      <span>{statusLabels[status] || status}</span>
                      <span className="font-black">{count}</span>
                    </div>
                  ))}
                  {Object.keys(detailStats.ordersByStatus).length === 0 && (
                    <p className="text-xs text-slate-400">Δεν υπάρχουν παραγγελίες</p>
                  )}
                </div>
              </div>

              {/* Commission Summary */}
              <div className="bg-amber-50/50 rounded-xl border border-amber-100 p-4">
                <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wider mb-2">Σύνοψη Προμηθειών</p>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <p className="text-xs text-amber-600/70">Συνολικά</p>
                    <p className="text-lg font-black text-amber-700">{formatCurrency(detailStats.totalCommission)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-amber-600/70">Μ.Ο. Ποσοστό</p>
                    <p className="text-lg font-black text-amber-700">{detailStats.avgCommissionRate.toFixed(1)}%</p>
                  </div>
                  <div>
                    <p className="text-xs text-amber-600/70">Μ.Ο. / Παραγγελία</p>
                    <p className="text-lg font-black text-amber-700">{formatCurrency(detailStats.totalOrders > 0 ? detailStats.totalCommission / detailStats.totalOrders : 0)}</p>
                  </div>
                </div>
              </div>

              {/* Recent Orders */}
              {detailStats.recentOrders.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">Πρόσφατες Παραγγελίες</p>
                  <div className="space-y-2">
                    {detailStats.recentOrders.map(order => (
                      <div key={order.id} className="flex items-center justify-between bg-slate-50 rounded-lg px-4 py-2.5 border border-slate-100">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`h-2 w-2 rounded-full shrink-0 ${order.status === OrderStatus.Delivered ? 'bg-green-500' : order.status === OrderStatus.Cancelled ? 'bg-red-400' : 'bg-sky-500'}`} />
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-slate-700 truncate">{order.customer_name}</p>
                            <p className="text-[10px] text-slate-400">{new Date(order.created_at).toLocaleDateString('el-GR')}</p>
                          </div>
                        </div>
                        <div className="text-right shrink-0 ml-3">
                          <p className="text-sm font-black text-slate-700">{formatCurrency(order.total_price)}</p>
                          <p className="text-[10px] text-amber-600 font-bold">{formatCurrency((order.total_price || 0) * (order.seller_commission_percent ?? 0) / 100)} προμ.</p>
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

      {/* ── Create / Edit Modal ── */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => { setShowCreateModal(false); setEditingSeller(null); }}>
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-lg font-black text-slate-800">{editingSeller ? 'Επεξεργασία Πλασιέ' : 'Νέος Πλασιέ'}</h2>
              <button onClick={() => { setShowCreateModal(false); setEditingSeller(null); }} className="p-2 rounded-full hover:bg-slate-100">
                <X size={18} className="text-slate-400" />
              </button>
            </div>
            <div className="p-6 space-y-4">
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
                    <button type="button" onClick={() => setShowResetField(true)} className="flex items-center gap-2 text-sm text-sky-600 font-bold hover:underline">
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
            <div className="px-6 pb-6 flex gap-3">
              <button onClick={() => { setShowCreateModal(false); setEditingSeller(null); }} className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold text-sm hover:bg-slate-200 transition-colors">Ακύρωση</button>
              <button onClick={editingSeller ? handleUpdate : handleCreate} disabled={isSaving} className="flex-1 py-3 bg-sky-600 text-white rounded-xl font-bold text-sm hover:bg-sky-700 active:scale-[0.98] disabled:opacity-50 transition-all">
                {isSaving ? 'Αποθήκευση...' : (editingSeller ? 'Αποθήκευση' : 'Δημιουργία')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Sub-components ── */

function SummaryCard({ label, value, icon, color }: { label: string; value: string; icon: React.ReactNode; color: 'sky' | 'violet' | 'emerald' | 'amber' }) {
  const colors = {
    sky: 'bg-sky-50 text-sky-600 border-sky-100',
    violet: 'bg-violet-50 text-violet-600 border-violet-100',
    emerald: 'bg-emerald-50 text-emerald-600 border-emerald-100',
    amber: 'bg-amber-50 text-amber-600 border-amber-100',
  };
  return (
    <div className={`rounded-xl border p-4 ${colors[color]}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider opacity-70">{label}</p>
          <p className="text-2xl font-black mt-1">{value}</p>
        </div>
        <div className="opacity-40">{icon}</div>
      </div>
    </div>
  );
}

function KpiCard({ label, value, sub, color }: { label: string; value: string; sub: string; color: 'sky' | 'emerald' | 'amber' | 'violet' }) {
  const bg = { sky: 'bg-sky-50', emerald: 'bg-emerald-50', amber: 'bg-amber-50', violet: 'bg-violet-50' };
  const text = { sky: 'text-sky-700', emerald: 'text-emerald-700', amber: 'text-amber-700', violet: 'text-violet-700' };
  return (
    <div className={`rounded-xl ${bg[color]} p-3`}>
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{label}</p>
      <p className={`text-lg font-black ${text[color]} mt-0.5`}>{value}</p>
      <p className="text-[10px] text-slate-500 mt-0.5">{sub}</p>
    </div>
  );
}

function TrendBadge({ current, previous }: { current: number; previous: number }) {
  if (previous === 0 && current === 0) return <div className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-100 text-slate-500 text-xs font-bold"><Minus size={14} /> Σταθερά</div>;
  if (previous === 0) return <div className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-100 text-emerald-700 text-xs font-bold"><ArrowUpRight size={14} /> Νέο</div>;
  const change = ((current - previous) / previous) * 100;
  if (Math.abs(change) < 1) return <div className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-100 text-slate-500 text-xs font-bold"><Minus size={14} /> Σταθερά</div>;
  return change > 0 ? (
    <div className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-100 text-emerald-700 text-xs font-bold"><ArrowUpRight size={14} /> +{change.toFixed(0)}%</div>
  ) : (
    <div className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-100 text-red-600 text-xs font-bold"><ArrowDownRight size={14} /> {change.toFixed(0)}%</div>
  );
}

function SellerCard({ seller, stats, onEdit, onToggle, onDetail, inactive }: { seller: UserProfile; stats?: SellerStats; onEdit: () => void; onToggle: () => void; onDetail: () => void; inactive?: boolean }) {
  return (
    <div className={`bg-white rounded-2xl border p-5 shadow-sm hover:shadow-md transition-all ${inactive ? 'border-slate-200 opacity-60' : 'border-slate-100'}`}>
      {/* Header row */}
      <div className="flex items-start gap-3 mb-4">
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center font-black text-lg shrink-0 ${inactive ? 'bg-slate-100 text-slate-400' : 'bg-sky-50 text-sky-600'}`}>
          {seller.full_name.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h4 className="font-black text-slate-800 truncate">{seller.full_name}</h4>
            <div className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full shrink-0 ${seller.is_approved ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
              {seller.is_approved ? 'Ενεργός' : 'Ανενεργός'}
            </div>
          </div>
          <p className="text-xs text-slate-500 truncate">{seller.email}</p>
          <div className="flex items-center gap-1 mt-1">
            <Percent size={11} className="text-amber-500" />
            <span className="text-xs font-black text-amber-600">{seller.commission_percent ?? 0}%</span>
            <span className="text-[10px] text-slate-400">προμήθεια</span>
          </div>
        </div>
      </div>

      {/* Stats row */}
      {stats && (
        <div className="grid grid-cols-3 gap-2 mb-4">
          <div className="bg-slate-50 rounded-lg p-2 text-center">
            <p className="text-[10px] text-slate-400 font-bold">Παραγγελίες</p>
            <p className="text-sm font-black text-slate-700">{stats.totalOrders}</p>
          </div>
          <div className="bg-emerald-50/60 rounded-lg p-2 text-center">
            <p className="text-[10px] text-emerald-600 font-bold">Έσοδα</p>
            <p className="text-sm font-black text-emerald-700">{formatCurrency(stats.totalRevenue)}</p>
          </div>
          <div className="bg-amber-50/60 rounded-lg p-2 text-center">
            <p className="text-[10px] text-amber-600 font-bold">Προμήθειες</p>
            <p className="text-sm font-black text-amber-700">{formatCurrency(stats.totalCommission)}</p>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between border-t border-slate-100 pt-3">
        <button onClick={onDetail} className="text-xs font-bold text-sky-600 hover:text-sky-700 hover:underline flex items-center gap-1">
          <TrendingUp size={13} /> Λεπτομέρειες
        </button>
        <div className="flex items-center gap-1">
          <button onClick={onEdit} className="p-1.5 rounded-lg text-slate-400 hover:text-sky-600 hover:bg-sky-50 transition-colors" title="Επεξεργασία">
            <Pencil size={14} />
          </button>
          <button onClick={onToggle} className="p-1.5 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition-colors" title={seller.is_approved ? 'Απενεργοποίηση' : 'Ενεργοποίηση'}>
            {seller.is_approved ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
          </button>
        </div>
      </div>
    </div>
  );
}
