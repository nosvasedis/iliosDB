import React, { useState, useMemo } from 'react';
import { UserCheck, Plus, Search, X, Mail, Lock, Percent, ToggleLeft, ToggleRight, Pencil, Trash2, Eye, EyeOff, KeyRound } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/supabase';
import { useUI } from './UIProvider';
import { useSellers, sellerKeys } from '../hooks/api/useSellers';
import { UserProfile } from '../types';
import DesktopPageHeader from './DesktopPageHeader';

interface SellerFormState {
  full_name: string;
  email: string;
  password: string;
  commission_percent: string;
}

const emptyForm: SellerFormState = { full_name: '', email: '', password: '', commission_percent: '' };

export default function SellersPage() {
  const queryClient = useQueryClient();
  const { showToast, confirm } = useUI();
  const { data: sellers, isLoading } = useSellers();

  const [searchTerm, setSearchTerm] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingSeller, setEditingSeller] = useState<UserProfile | null>(null);
  const [form, setForm] = useState<SellerFormState>(emptyForm);
  const [showPassword, setShowPassword] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [resetPassword, setResetPassword] = useState('');
  const [showResetField, setShowResetField] = useState(false);

  const filteredSellers = useMemo(() => {
    if (!sellers) return [];
    const lower = searchTerm.toLowerCase();
    return sellers.filter(s =>
      s.full_name.toLowerCase().includes(lower) ||
      s.email.toLowerCase().includes(lower)
    );
  }, [sellers, searchTerm]);

  const activeSellers = filteredSellers.filter(s => s.is_approved);
  const inactiveSellers = filteredSellers.filter(s => !s.is_approved);

  const openCreate = () => {
    setForm(emptyForm);
    setEditingSeller(null);
    setShowCreateModal(true);
    setShowPassword(false);
  };

  const openEdit = (seller: UserProfile) => {
    setEditingSeller(seller);
    setForm({
      full_name: seller.full_name,
      email: seller.email,
      password: '',
      commission_percent: seller.commission_percent != null ? String(seller.commission_percent) : '',
    });
    setShowCreateModal(true);
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
      setShowCreateModal(false);
      setForm(emptyForm);
      showToast('Ο πλασιέ δημιουργήθηκε επιτυχώς.', 'success');
    } catch (e: any) {
      showToast(e.message || 'Σφάλμα δημιουργίας', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdate = async () => {
    if (!editingSeller) return;
    if (!form.full_name.trim()) {
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
      setShowCreateModal(false);
      setEditingSeller(null);
      setForm(emptyForm);
      showToast('Ο πλασιέ ενημερώθηκε.', 'success');
    } catch (e: any) {
      showToast(e.message || 'Σφάλμα ενημέρωσης', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleActive = async (seller: UserProfile) => {
    const action = seller.is_approved ? 'απενεργοποίηση' : 'ενεργοποίηση';
    if (!await confirm({ title: seller.is_approved ? 'Απενεργοποίηση' : 'Ενεργοποίηση', message: `Θέλετε σίγουρα ${action} του πλασιέ "${seller.full_name}";` })) return;
    try {
      await api.updateSeller({ id: seller.id, is_approved: !seller.is_approved });
      queryClient.invalidateQueries({ queryKey: sellerKeys.all });
      showToast(`Ο πλασιέ ${seller.is_approved ? 'απενεργοποιήθηκε' : 'ενεργοποιήθηκε'}.`, 'success');
    } catch (e: any) {
      showToast(e.message || 'Σφάλμα', 'error');
    }
  };

  const handleDelete = async (seller: UserProfile) => {
    if (!await confirm({ title: 'Απενεργοποίηση Πλασιέ', message: `Θέλετε σίγουρα να απενεργοποιήσετε τον πλασιέ "${seller.full_name}"; Δεν θα μπορεί πλέον να συνδεθεί.`, isDestructive: true })) return;
    try {
      await api.deleteSeller(seller.id);
      queryClient.invalidateQueries({ queryKey: sellerKeys.all });
      showToast('Ο πλασιέ απενεργοποιήθηκε.', 'info');
    } catch (e: any) {
      showToast(e.message || 'Σφάλμα', 'error');
    }
  };

  return (
    <div className="space-y-6">
      <DesktopPageHeader
        icon={UserCheck}
        title="Πλασιέ"
        subtitle="Διαχείριση πωλητών & προμηθειών"
        tail={
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Αναζήτηση πλασιέ..."
                className="pl-9 pr-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm font-medium outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-300 w-64 transition-all"
              />
              {searchTerm && (
                <button onClick={() => setSearchTerm('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  <X size={14} />
                </button>
              )}
            </div>
            <button
              onClick={openCreate}
              className="flex items-center gap-2 px-5 py-2.5 bg-sky-600 text-white rounded-xl font-bold text-sm hover:bg-sky-700 transition-colors shadow-sm"
            >
              <Plus size={16} /> Νέος Πλασιέ
            </button>
          </div>
        }
      />

      {isLoading ? (
        <div className="text-center py-12 text-slate-400 font-medium">Φόρτωση...</div>
      ) : filteredSellers.length === 0 ? (
        <div className="text-center py-20">
          <UserCheck size={48} className="mx-auto text-slate-300 mb-4" />
          <h3 className="text-lg font-bold text-slate-500 mb-1">
            {searchTerm ? 'Δεν βρέθηκαν πλασιέ' : 'Κανένας πλασιέ ακόμα'}
          </h3>
          <p className="text-sm text-slate-400">
            {searchTerm ? 'Δοκιμάστε διαφορετική αναζήτηση.' : 'Δημιουργήστε τον πρώτο πλασιέ πατώντας "Νέος Πλασιέ".'}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Active Sellers */}
          {activeSellers.length > 0 && (
            <div>
              <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-3 px-1">
                Ενεργοί ({activeSellers.length})
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {activeSellers.map(seller => (
                  <SellerCard key={seller.id} seller={seller} onEdit={openEdit} onToggle={handleToggleActive} onDelete={handleDelete} />
                ))}
              </div>
            </div>
          )}
          {/* Inactive Sellers */}
          {inactiveSellers.length > 0 && (
            <div>
              <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-3 px-1">
                Ανενεργοί ({inactiveSellers.length})
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {inactiveSellers.map(seller => (
                  <SellerCard key={seller.id} seller={seller} onEdit={openEdit} onToggle={handleToggleActive} onDelete={handleDelete} inactive />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Create / Edit Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => { if (!isSaving) { setShowCreateModal(false); setEditingSeller(null); }}}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-slate-100">
              <h2 className="text-lg font-black text-slate-800">
                {editingSeller ? 'Επεξεργασία Πλασιέ' : 'Νέος Πλασιέ'}
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                {editingSeller ? 'Ενημέρωση στοιχείων & προμήθειας' : 'Δημιουργία λογαριασμού πλασιέ'}
              </p>
            </div>

            <div className="p-6 space-y-4">
              {/* Full Name */}
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Ονοματεπώνυμο</label>
                <input
                  value={form.full_name}
                  onChange={e => setForm(prev => ({ ...prev, full_name: e.target.value }))}
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
                    onChange={e => setForm(prev => ({ ...prev, email: e.target.value }))}
                    className="w-full p-3 pl-10 bg-slate-50 border border-slate-200 rounded-xl outline-none font-bold text-slate-800 focus:ring-2 focus:ring-sky-500/20"
                    placeholder="seller@example.com"
                    type="email"
                    disabled={!!editingSeller}
                  />
                </div>
              </div>

              {/* Password (new) or Reset Password (edit) */}
              {!editingSeller ? (
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Κωδικός</label>
                  <div className="relative">
                    <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      value={form.password}
                      onChange={e => setForm(prev => ({ ...prev, password: e.target.value }))}
                      className="w-full p-3 pl-10 pr-10 bg-slate-50 border border-slate-200 rounded-xl outline-none font-bold text-slate-800 focus:ring-2 focus:ring-sky-500/20"
                      placeholder="Τουλάχιστον 6 χαρακτήρες"
                      type={showPassword ? 'text' : 'password'}
                    />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  {!showResetField ? (
                    <button type="button" onClick={() => setShowResetField(true)} className="flex items-center gap-2 text-sm text-sky-600 font-bold hover:text-sky-700">
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
                        <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                          {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Commission Percent */}
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Προμήθεια (%)</label>
                <div className="relative">
                  <Percent size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    value={form.commission_percent}
                    onChange={e => {
                      const val = e.target.value.replace(/[^0-9.,]/g, '');
                      setForm(prev => ({ ...prev, commission_percent: val }));
                    }}
                    className="w-full p-3 pl-10 bg-slate-50 border border-slate-200 rounded-xl outline-none font-bold text-slate-800 focus:ring-2 focus:ring-sky-500/20"
                    placeholder="π.χ. 5"
                    inputMode="decimal"
                  />
                </div>
                <p className="text-[10px] text-slate-400 mt-1">Προεπιλεγμένη προμήθεια — μπορεί να αλλαχθεί ανά παραγγελία</p>
              </div>
            </div>

            <div className="p-6 border-t border-slate-100 flex justify-end gap-3">
              <button
                onClick={() => { setShowCreateModal(false); setEditingSeller(null); }}
                disabled={isSaving}
                className="px-5 py-2.5 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-100 transition-colors"
              >
                Ακύρωση
              </button>
              <button
                onClick={editingSeller ? handleUpdate : handleCreate}
                disabled={isSaving}
                className="px-6 py-2.5 bg-sky-600 text-white rounded-xl font-bold text-sm hover:bg-sky-700 transition-colors disabled:opacity-50"
              >
                {isSaving ? 'Αποθήκευση...' : (editingSeller ? 'Αποθήκευση' : 'Δημιουργία')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// --- Seller Card ---
interface SellerCardProps {
  seller: UserProfile;
  onEdit: (seller: UserProfile) => void;
  onToggle: (seller: UserProfile) => void;
  onDelete: (seller: UserProfile) => void;
  inactive?: boolean;
}

function SellerCard({ seller, onEdit, onToggle, onDelete, inactive }: SellerCardProps) {
  return (
    <div className={`group bg-white p-5 rounded-2xl border shadow-sm hover:shadow-md transition-all ${inactive ? 'border-slate-200 opacity-60' : 'border-slate-100 hover:border-sky-200'}`}>
      <div className="flex items-start justify-between mb-3">
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-bold text-lg shadow-sm transition-colors ${inactive ? 'bg-slate-100 text-slate-400' : 'bg-sky-50 text-sky-600 group-hover:bg-sky-600 group-hover:text-white'}`}>
          {seller.full_name.charAt(0).toUpperCase()}
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => onEdit(seller)} className="p-2 rounded-lg text-slate-400 hover:text-sky-600 hover:bg-sky-50 transition-colors" title="Επεξεργασία">
            <Pencil size={14} />
          </button>
          <button onClick={() => onToggle(seller)} className="p-2 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition-colors" title={seller.is_approved ? 'Απενεργοποίηση' : 'Ενεργοποίηση'}>
            {seller.is_approved ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
          </button>
          {!seller.is_approved && (
            <button onClick={() => onDelete(seller)} className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors" title="Διαγραφή">
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>

      <h3 className="font-bold text-slate-800 text-base leading-tight">{seller.full_name}</h3>
      <div className="flex items-center gap-2 text-xs text-slate-500 mt-1">
        <Mail size={12} className="text-slate-400" /> {seller.email}
      </div>

      <div className="mt-3 pt-3 border-t border-slate-50 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Percent size={12} className="text-emerald-500" />
          <span className="text-sm font-black text-emerald-700">
            {seller.commission_percent != null ? `${seller.commission_percent}%` : '—'}
          </span>
          <span className="text-[10px] text-slate-400 font-medium">προμήθεια</span>
        </div>
        <div className={`text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-full ${seller.is_approved ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
          {seller.is_approved ? 'Ενεργός' : 'Ανενεργός'}
        </div>
      </div>
    </div>
  );
}
