import React, { useState, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/supabase';
import { UserCheck, Search, Plus, X, Mail, Lock, Percent, Pencil, ToggleLeft, ToggleRight, Eye, EyeOff, KeyRound } from 'lucide-react';
import MobileScreenHeader from './MobileScreenHeader';
import { UserProfile } from '../../types';
import { useUI } from '../UIProvider';
import { useSellers, sellerKeys } from '../../hooks/api/useSellers';

interface SellerFormState {
  full_name: string;
  email: string;
  password: string;
  commission_percent: string;
}

const emptyForm: SellerFormState = { full_name: '', email: '', password: '', commission_percent: '' };

export default function MobileSellersPage() {
  const queryClient = useQueryClient();
  const { showToast, confirm } = useUI();
  const { data: sellers, isLoading } = useSellers();

  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingSeller, setEditingSeller] = useState<UserProfile | null>(null);
  const [form, setForm] = useState<SellerFormState>(emptyForm);
  const [showPassword, setShowPassword] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [resetPassword, setResetPassword] = useState('');
  const [showResetField, setShowResetField] = useState(false);

  const filteredSellers = useMemo(() => {
    if (!sellers) return [];
    const lower = search.toLowerCase();
    return sellers.filter(s =>
      s.full_name.toLowerCase().includes(lower) ||
      s.email.toLowerCase().includes(lower)
    );
  }, [sellers, search]);

  const openCreate = () => {
    setForm(emptyForm);
    setEditingSeller(null);
    setShowForm(true);
    setShowPassword(false);
    setResetPassword('');
    setShowResetField(false);
  };

  const openEdit = (seller: UserProfile) => {
    setEditingSeller(seller);
    setForm({
      full_name: seller.full_name,
      email: seller.email,
      password: '',
      commission_percent: seller.commission_percent != null ? String(seller.commission_percent) : '',
    });
    setShowForm(true);
    setShowPassword(false);
    setResetPassword('');
    setShowResetField(false);
  };

  const handleCreate = async () => {
    if (!form.full_name.trim() || !form.email.trim() || !form.password.trim()) {
      showToast('Συμπληρώστε όνομα, email και κωδικό.', 'error');
      return;
    }
    setIsSaving(true);
    try {
      await api.createSeller({
        email: form.email.trim(),
        password: form.password,
        full_name: form.full_name.trim(),
        commission_percent: form.commission_percent ? Number(form.commission_percent) : undefined,
      });
      queryClient.invalidateQueries({ queryKey: sellerKeys.all });
      setShowForm(false);
      showToast('Ο πλασιέ δημιουργήθηκε.', 'success');
    } catch (e: any) {
      showToast(e.message || 'Σφάλμα', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdate = async () => {
    if (!editingSeller || !form.full_name.trim()) {
      showToast('Το όνομα είναι υποχρεωτικό.', 'error');
      return;
    }
    setIsSaving(true);
    try {
      await api.updateSeller({
        id: editingSeller.id,
        full_name: form.full_name.trim(),
        commission_percent: form.commission_percent !== '' ? Number(form.commission_percent) : 0,
        ...(resetPassword ? { new_password: resetPassword } : {}),
      });
      queryClient.invalidateQueries({ queryKey: sellerKeys.all });
      setShowForm(false);
      setEditingSeller(null);
      showToast('Ο πλασιέ ενημερώθηκε.', 'success');
    } catch (e: any) {
      showToast(e.message || 'Σφάλμα', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleActive = async (seller: UserProfile) => {
    const action = seller.is_approved ? 'απενεργοποίηση' : 'ενεργοποίηση';
    if (!await confirm({ title: seller.is_approved ? 'Απενεργοποίηση' : 'Ενεργοποίηση', message: `${action} του "${seller.full_name}";` })) return;
    try {
      await api.updateSeller({ id: seller.id, is_approved: !seller.is_approved });
      queryClient.invalidateQueries({ queryKey: sellerKeys.all });
      showToast(`${seller.is_approved ? 'Απενεργοποιήθηκε' : 'Ενεργοποιήθηκε'}.`, 'success');
    } catch (e: any) {
      showToast(e.message || 'Σφάλμα', 'error');
    }
  };

  return (
    <div className="min-h-full bg-gradient-to-b from-slate-50 to-white pb-28">
      <MobileScreenHeader icon={UserCheck} title="Πλασιέ" subtitle="Διαχείριση πωλητών" iconClassName="text-sky-600" />

      {/* Search + Create */}
      <div className="px-4 pt-4 space-y-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Αναζήτηση πλασιέ..."
              className="w-full pl-9 pr-4 py-3 rounded-xl bg-white border border-slate-200 text-sm font-medium outline-none focus:ring-2 focus:ring-sky-500/20"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                <X size={14} />
              </button>
            )}
          </div>
          <button onClick={openCreate} className="shrink-0 p-3 bg-sky-600 text-white rounded-xl shadow-sm active:scale-95">
            <Plus size={20} />
          </button>
        </div>
      </div>

      {/* Sellers List */}
      <div className="px-4 pt-4 space-y-3">
        {isLoading ? (
          <div className="text-center py-12 text-slate-400 font-medium text-sm">Φόρτωση...</div>
        ) : filteredSellers.length === 0 ? (
          <div className="text-center py-16">
            <UserCheck size={40} className="mx-auto text-slate-300 mb-3" />
            <p className="text-sm font-bold text-slate-500">
              {search ? 'Δεν βρέθηκαν πλασιέ' : 'Κανένας πλασιέ'}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              {search ? 'Δοκιμάστε διαφορετική αναζήτηση.' : 'Πατήστε + για να δημιουργήσετε.'}
            </p>
          </div>
        ) : (
          filteredSellers.map(seller => (
            <div
              key={seller.id}
              className={`bg-white rounded-2xl border p-4 shadow-sm transition-all ${seller.is_approved ? 'border-slate-100' : 'border-slate-200 opacity-60'}`}
            >
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
                  <div className="flex items-center justify-between mt-2">
                    <div className="flex items-center gap-1">
                      <Percent size={12} className="text-emerald-500" />
                      <span className="text-sm font-black text-emerald-700">
                        {seller.commission_percent != null ? `${seller.commission_percent}%` : '—'}
                      </span>
                      <span className="text-[10px] text-slate-400">προμήθεια</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => openEdit(seller)} className="p-2 rounded-lg text-slate-400 hover:text-sky-600 hover:bg-sky-50 active:scale-95">
                        <Pencil size={14} />
                      </button>
                      <button onClick={() => handleToggleActive(seller)} className="p-2 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50 active:scale-95">
                        {seller.is_approved ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Create/Edit Full Screen Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 bg-white flex flex-col animate-in slide-in-from-bottom duration-200">
          <div className="shrink-0 px-4 py-4 border-b border-slate-100 bg-slate-50/95 flex items-center justify-between">
            <h2 className="text-lg font-black text-slate-800">
              {editingSeller ? 'Επεξεργασία Πλασιέ' : 'Νέος Πλασιέ'}
            </h2>
            <button onClick={() => { setShowForm(false); setEditingSeller(null); }} className="p-2 rounded-full hover:bg-slate-200">
              <X size={20} className="text-slate-500" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Full Name */}
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Ονοματεπώνυμο</label>
              <input
                value={form.full_name}
                onChange={e => setForm(p => ({ ...p, full_name: e.target.value }))}
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none font-bold text-slate-800 focus:ring-2 focus:ring-sky-500/20"
                placeholder="π.χ. Γιάννης Παπαδόπουλος"
                autoFocus
              />
            </div>

            {/* Email */}
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Email</label>
              <div className="relative">
                <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={form.email}
                  onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                  className="w-full p-3 pl-10 bg-slate-50 border border-slate-200 rounded-xl outline-none font-bold text-slate-800 focus:ring-2 focus:ring-sky-500/20"
                  placeholder="seller@example.com"
                  type="email"
                  disabled={!!editingSeller}
                />
              </div>
            </div>

            {/* Password (new) or Reset (edit) */}
            {!editingSeller ? (
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Κωδικός</label>
                <div className="relative">
                  <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    value={form.password}
                    onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                    className="w-full p-3 pl-10 pr-10 bg-slate-50 border border-slate-200 rounded-xl outline-none font-bold text-slate-800 focus:ring-2 focus:ring-sky-500/20"
                    placeholder="Τουλάχιστον 6 χαρακτήρες"
                    type={showPassword ? 'text' : 'password'}
                  />
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
                      <input
                        value={resetPassword}
                        onChange={e => setResetPassword(e.target.value)}
                        className="w-full p-3 pl-10 bg-slate-50 border border-slate-200 rounded-xl outline-none font-bold text-slate-800 focus:ring-2 focus:ring-sky-500/20"
                        placeholder="Νέος κωδικός"
                        type={showPassword ? 'text' : 'password'}
                      />
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
                <input
                  value={form.commission_percent}
                  onChange={e => {
                    const val = e.target.value.replace(/[^0-9.,]/g, '');
                    setForm(p => ({ ...p, commission_percent: val }));
                  }}
                  className="w-full p-3 pl-10 bg-slate-50 border border-slate-200 rounded-xl outline-none font-bold text-slate-800 focus:ring-2 focus:ring-sky-500/20"
                  placeholder="π.χ. 5"
                  inputMode="decimal"
                />
              </div>
              <p className="text-[10px] text-slate-400 mt-1">Μπορεί να αλλαχτεί ανά παραγγελία</p>
            </div>
          </div>

          {/* Bottom action bar */}
          <div className="shrink-0 px-4 py-4 border-t border-slate-100 bg-white">
            <button
              onClick={editingSeller ? handleUpdate : handleCreate}
              disabled={isSaving}
              className="w-full py-3.5 bg-sky-600 text-white rounded-xl font-bold text-sm active:scale-[0.98] disabled:opacity-50"
            >
              {isSaving ? 'Αποθήκευση...' : (editingSeller ? 'Αποθήκευση Αλλαγών' : 'Δημιουργία Πλασιέ')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
