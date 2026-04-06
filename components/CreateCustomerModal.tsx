import React, { useState } from 'react';
import { Customer, VatRegime } from '../types';
import {
    X,
    Save,
    Loader2,
    Zap,
    Phone,
    MapPin,
    FileText,
    User,
    CreditCard,
    MessageSquare,
    Sparkles,
} from 'lucide-react';
import { api } from '../lib/supabase';
import { useUI } from './UIProvider';

export interface CreateCustomerModalProps {
    draft: Customer;
    onSave: (c: Customer) => Promise<void>;
    onCancel: () => void;
}

export default function CreateCustomerModal({ draft, onSave, onCancel }: CreateCustomerModalProps) {
    const [form, setForm] = useState<Customer>(draft);
    const [isSaving, setIsSaving] = useState(false);
    const [isSearchingAfm, setIsSearchingAfm] = useState(false);
    const { showToast } = useUI();

    const handleAfmLookup = async () => {
        if (!form.vat_number || form.vat_number.length < 9) {
            showToast('Μη έγκυρο ΑΦΜ.', 'error');
            return;
        }
        setIsSearchingAfm(true);
        try {
            const result = await api.lookupAfm(form.vat_number);
            if (result) {
                setForm(prev => ({
                    ...prev,
                    full_name: result.name || prev.full_name,
                    address: result.address || prev.address,
                    phone: (!prev.phone && result.phone) ? result.phone : prev.phone,
                    email: (!prev.email && result.email) ? result.email : prev.email,
                }));
                const filled = ['Επωνυμία', result.address ? 'Διεύθυνση' : null, result.phone ? 'Τηλέφωνο' : null, result.email ? 'Email' : null].filter(Boolean).join(', ');
                showToast(`Βρέθηκαν: ${filled}`, 'success');
            } else {
                showToast('Δεν βρέθηκαν στοιχεία.', 'info');
            }
        } catch (e: unknown) {
            showToast((e as Error)?.message || 'Σφάλμα αναζήτησης.', 'error');
        } finally {
            setIsSearchingAfm(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.full_name.trim()) {
            showToast('Το ονοματεπώνυμο είναι υποχρεωτικό.', 'error');
            return;
        }
        setIsSaving(true);
        try {
            await onSave(form);
        } catch {
            // Parent shows error toast
        } finally {
            setIsSaving(false);
        }
    };

    const initials = form.full_name.trim()
        ? form.full_name.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase()
        : '+';

    const inputClass =
        'w-full px-4 py-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all text-sm font-medium text-slate-800 placeholder:text-slate-300';

    const sectionShell = 'bg-white rounded-2xl p-5 shadow-sm border border-slate-100/80 space-y-3';

    return (
        <div className="fixed inset-0 z-[100] bg-slate-950/65 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-6 animate-in fade-in duration-200">
            <div
                className="bg-slate-50 w-full sm:max-w-3xl sm:max-h-[90vh] sm:rounded-[1.75rem] max-h-[96vh] rounded-t-[1.75rem] shadow-2xl border border-slate-200/80 flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200"
                role="dialog"
                aria-labelledby="create-customer-title"
            >
                {/* Header */}
                <div className="relative shrink-0 bg-gradient-to-br from-[#060b00] via-slate-900 to-slate-800 px-6 sm:px-8 pt-7 pb-8 overflow-hidden">
                    <div className="absolute inset-0 opacity-30">
                        <div className="absolute -top-20 -right-16 w-72 h-72 rounded-full bg-emerald-500/20 blur-3xl" />
                        <div className="absolute -bottom-12 -left-10 w-56 h-56 rounded-full bg-blue-500/15 blur-3xl" />
                    </div>

                    <div className="relative flex items-start justify-between gap-4">
                        <div className="flex items-center gap-2 text-emerald-400/90">
                            <Sparkles size={16} strokeWidth={2.5} />
                            <span className="text-[10px] font-black uppercase tracking-[0.2em]">Νέος πελάτης</span>
                        </div>
                        <button
                            type="button"
                            onClick={onCancel}
                            className="p-2 rounded-xl bg-white/10 hover:bg-white/15 text-white/80 hover:text-white transition-colors"
                            aria-label="Κλείσιμο"
                        >
                            <X size={20} />
                        </button>
                    </div>

                    <div className="relative mt-5 flex items-center gap-4">
                        <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-900/40 shrink-0 ring-2 ring-white/10">
                            <span className="text-white text-lg sm:text-xl font-black">{initials}</span>
                        </div>
                        <div className="min-w-0">
                            <h2 id="create-customer-title" className="text-xl sm:text-2xl font-black text-white tracking-tight truncate">
                                {form.full_name.trim() || 'Συμπληρώστε τα στοιχεία'}
                            </h2>
                            <p className="text-sm text-white/50 font-medium mt-1">
                                Αυτόματη αναζήτηση ΑΦΜ, καθεστώς ΦΠΑ και σημειώσεις — χωρίς ιστορικό παραγγελιών μέχρι να αποθηκεύσετε.
                            </p>
                        </div>
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-5 sm:p-8 space-y-5">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                        <div className={`${sectionShell} lg:row-span-1`}>
                            <div className="flex items-center gap-2 mb-1">
                                <User size={15} className="text-blue-500 shrink-0" />
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Ταυτότητα</span>
                            </div>
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Ονοματεπώνυμο *</label>
                            <input
                                type="text"
                                className={inputClass}
                                placeholder="π.χ. Γεωργίου Παναγιώτης"
                                value={form.full_name}
                                onChange={e => setForm({ ...form, full_name: e.target.value })}
                                autoFocus
                            />
                        </div>

                        <div className={sectionShell}>
                            <div className="flex items-center gap-2 mb-1">
                                <Phone size={15} className="text-emerald-500 shrink-0" />
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Επικοινωνία</span>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Τηλέφωνο</label>
                                    <input
                                        type="tel"
                                        className={inputClass}
                                        placeholder="Τηλέφωνο"
                                        value={form.phone || ''}
                                        onChange={e => setForm({ ...form, phone: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Email</label>
                                    <input
                                        type="email"
                                        className={inputClass}
                                        placeholder="email@example.com"
                                        value={form.email || ''}
                                        onChange={e => setForm({ ...form, email: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Διεύθυνση</label>
                                <div className="relative">
                                    <MapPin size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-300 pointer-events-none" />
                                    <input
                                        type="text"
                                        className={`${inputClass} pl-10`}
                                        placeholder="Οδός, πόλη, ΤΚ"
                                        value={form.address || ''}
                                        onChange={e => setForm({ ...form, address: e.target.value })}
                                    />
                                </div>
                            </div>
                        </div>

                        <div className={`${sectionShell} lg:col-span-2`}>
                            <div className="flex items-center gap-2 mb-1">
                                <CreditCard size={15} className="text-amber-500 shrink-0" />
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Φορολογικά</span>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
                                <div>
                                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block flex items-center gap-1.5">
                                        <FileText size={12} className="text-slate-400" />
                                        ΑΦΜ — έξυπνη συμπλήρωση
                                    </label>
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            inputMode="numeric"
                                            className={`${inputClass} flex-1 font-mono tracking-wide`}
                                            placeholder="9 ψηφία"
                                            value={form.vat_number || ''}
                                            onChange={e =>
                                                setForm({ ...form, vat_number: e.target.value.replace(/\D/g, '').slice(0, 9) })
                                            }
                                        />
                                        <button
                                            type="button"
                                            onClick={handleAfmLookup}
                                            disabled={isSearchingAfm || !form.vat_number || form.vat_number.length < 9}
                                            className="px-4 sm:px-5 py-3 rounded-xl bg-gradient-to-br from-slate-800 to-slate-950 text-white font-bold shadow-md hover:shadow-lg hover:from-slate-900 hover:to-black transition-all disabled:opacity-40 disabled:pointer-events-none flex items-center gap-2 shrink-0 text-sm"
                                        >
                                            {isSearchingAfm ? <Loader2 size={18} className="animate-spin" /> : <Zap size={18} />}
                                            <span className="hidden sm:inline">Αναζήτηση</span>
                                        </button>
                                    </div>
                                    <p className="text-[11px] text-slate-400 mt-2 leading-snug">
                                        Συμπληρώνει επωνυμία, διεύθυνση και στοιχεία επικοινωνίας όπου είναι διαθέσιμα από τη βάση.
                                    </p>
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Καθεστώς ΦΠΑ</label>
                                    <select
                                        className={`${inputClass} cursor-pointer font-bold text-slate-700`}
                                        value={form.vat_rate ?? VatRegime.Standard}
                                        onChange={e => setForm({ ...form, vat_rate: parseFloat(e.target.value) })}
                                    >
                                        <option value={VatRegime.Standard}>24% — Κανονικό</option>
                                        <option value={VatRegime.Reduced}>17% — Μειωμένο</option>
                                        <option value={VatRegime.Zero}>0% — Μηδενικό / απαλλαγή</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        <div className={`${sectionShell} lg:col-span-2`}>
                            <div className="flex items-center gap-2 mb-1">
                                <MessageSquare size={15} className="text-violet-500 shrink-0" />
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Σημειώσεις</span>
                            </div>
                            <textarea
                                className={`${inputClass} min-h-[100px] resize-y`}
                                placeholder="Εσωτερικές σημειώσεις για τον πελάτη..."
                                value={form.notes || ''}
                                onChange={e => setForm({ ...form, notes: e.target.value })}
                            />
                        </div>
                    </div>

                    <div className="flex flex-col-reverse sm:flex-row gap-3 pt-2 border-t border-slate-200/80">
                        <button
                            type="button"
                            onClick={onCancel}
                            className="flex-1 py-3.5 rounded-xl font-bold border-2 border-slate-200 text-slate-600 bg-white hover:bg-slate-50 transition-colors"
                        >
                            Άκυρο
                        </button>
                        <button
                            type="submit"
                            disabled={isSaving || !form.full_name.trim()}
                            className="flex-1 sm:flex-[1.2] py-3.5 rounded-xl font-black bg-gradient-to-r from-[#060b00] to-slate-900 text-white shadow-lg shadow-slate-900/25 hover:from-black hover:to-slate-950 transition-all disabled:opacity-40 flex items-center justify-center gap-2"
                        >
                            {isSaving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                            Δημιουργία πελάτη
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
