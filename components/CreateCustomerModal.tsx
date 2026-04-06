import React, { useState, useEffect } from 'react';
import { Customer, VatRegime } from '../types';
import {
    X,
    Save,
    Loader2,
    Zap,
    Phone,
    MapPin,
    User,
    CreditCard,
    MessageSquare,
    Users,
} from 'lucide-react';
import { api } from '../lib/supabase';
import { useUI } from './UIProvider';

export interface CreateCustomerModalProps {
    draft: Customer;
    onSave: (c: Customer) => Promise<void>;
    onCancel: () => void;
}

type CreateTab = 'general' | 'fiscal' | 'notes';

export default function CreateCustomerModal({ draft, onSave, onCancel }: CreateCustomerModalProps) {
    const [form, setForm] = useState<Customer>(draft);
    const [tab, setTab] = useState<CreateTab>('general');
    const [isSaving, setIsSaving] = useState(false);
    const [isSearchingAfm, setIsSearchingAfm] = useState(false);
    const { showToast } = useUI();

    useEffect(() => {
        setForm(draft);
        setTab('general');
    }, [draft.id]);

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
                    phone: !prev.phone && result.phone ? result.phone : prev.phone,
                    email: !prev.email && result.email ? result.email : prev.email,
                }));
                const filled = [
                    'Επωνυμία',
                    result.address ? 'Διεύθυνση' : null,
                    result.phone ? 'Τηλέφωνο' : null,
                    result.email ? 'Email' : null,
                ]
                    .filter(Boolean)
                    .join(', ');
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
            setTab('general');
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
        ? form.full_name
              .trim()
              .split(/\s+/)
              .map(w => w[0])
              .slice(0, 2)
              .join('')
              .toUpperCase()
        : '?';

    const inputClass =
        'w-full px-4 py-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/15 focus:border-blue-400 transition-all text-sm font-medium text-slate-800 placeholder:text-slate-400';

    const tabs: { id: CreateTab; label: string; hint: string }[] = [
        { id: 'general', label: 'Γενικά', hint: 'Όνομα, επικοινωνία, διεύθυνση' },
        { id: 'fiscal', label: 'Φορολογικά', hint: 'ΑΦΜ, ΦΠΑ' },
        { id: 'notes', label: 'Σημειώσεις', hint: 'Εσωτερικές σημειώσεις' },
    ];

    return (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-900/40 p-0 backdrop-blur-sm sm:items-center sm:p-6 animate-in fade-in duration-200">
            <div
                className="flex max-h-[96vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-slate-100 bg-white shadow-xl sm:max-h-[90vh] sm:max-w-2xl sm:rounded-3xl animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200"
                role="dialog"
                aria-labelledby="create-customer-title"
            >
                <div className="shrink-0 border-b border-slate-100 p-5 sm:p-6">
                    <div className="flex items-start justify-between gap-4">
                        <div className="flex min-w-0 items-start gap-3">
                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#060b00] text-white">
                                <Users size={20} strokeWidth={2.25} />
                            </div>
                            <div className="min-w-0 pt-0.5">
                                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Νέος πελάτης</p>
                                <h2 id="create-customer-title" className="text-lg font-bold tracking-tight text-[#060b00] sm:text-xl">
                                    {form.full_name.trim() || 'Συμπλήρωση στοιχείων'}
                                </h2>
                                <p className="mt-0.5 text-sm font-medium text-slate-500">
                                    Βήμα-βήμα: γενικά στοιχεία, φορολογικά, σημειώσεις.
                                </p>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={onCancel}
                            className="shrink-0 rounded-xl border border-slate-200 bg-white p-2 text-slate-500 transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-800"
                            aria-label="Κλείσιμο"
                        >
                            <X size={20} />
                        </button>
                    </div>

                    <div className="mt-4 flex items-center gap-3">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-slate-100 bg-slate-50 text-base font-black text-blue-600">
                            {initials}
                        </div>
                        <div className="min-w-0 text-xs text-slate-500">
                            <span className="font-semibold text-slate-700">Προεπισκόπηση.</span> Το κύριο όνομα καταχωρείται στην
                            καρτέλα «Γενικά».
                        </div>
                    </div>
                </div>

                <div className="shrink-0 border-b border-slate-100 bg-slate-50/80 px-3 py-2 sm:px-5">
                    <div className="flex gap-1 overflow-x-auto rounded-xl bg-slate-200/60 p-1 custom-scrollbar">
                        {tabs.map(t => (
                            <button
                                key={t.id}
                                type="button"
                                onClick={() => setTab(t.id)}
                                className={`min-w-0 flex-1 whitespace-nowrap rounded-lg px-3 py-2.5 text-center transition-all sm:px-4 ${
                                    tab === t.id
                                        ? 'bg-white font-bold text-[#060b00] shadow-sm'
                                        : 'font-semibold text-slate-500 hover:text-slate-800'
                                }`}
                            >
                                <span className="block text-xs sm:text-sm">{t.label}</span>
                                <span className="mt-0.5 hidden text-[10px] font-medium text-slate-400 sm:block">{t.hint}</span>
                            </button>
                        ))}
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
                    <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6 custom-scrollbar">
                        {tab === 'general' && (
                            <div className="space-y-5">
                                <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm sm:p-5">
                                    <div className="mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                        <User size={14} className="text-blue-500" />
                                        Ταυτότητα
                                    </div>
                                    <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">
                                        Ονοματεπώνυμο / επωνυμία *
                                    </label>
                                    <input
                                        type="text"
                                        className={inputClass}
                                        placeholder="π.χ. Γεωργίου Παναγιώτης"
                                        value={form.full_name}
                                        onChange={e => setForm({ ...form, full_name: e.target.value })}
                                        autoFocus
                                    />
                                </div>
                                <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm sm:p-5">
                                    <div className="mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                        <Phone size={14} className="text-emerald-600" />
                                        Επικοινωνία
                                    </div>
                                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                        <div>
                                            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">
                                                Τηλέφωνο
                                            </label>
                                            <input
                                                type="tel"
                                                className={inputClass}
                                                placeholder="Τηλέφωνο"
                                                value={form.phone || ''}
                                                onChange={e => setForm({ ...form, phone: e.target.value })}
                                            />
                                        </div>
                                        <div>
                                            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">
                                                Email
                                            </label>
                                            <input
                                                type="email"
                                                className={inputClass}
                                                placeholder="email@example.com"
                                                value={form.email || ''}
                                                onChange={e => setForm({ ...form, email: e.target.value })}
                                            />
                                        </div>
                                    </div>
                                    <div className="mt-4">
                                        <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">
                                            Διεύθυνση
                                        </label>
                                        <div className="relative">
                                            <MapPin
                                                size={16}
                                                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-300"
                                            />
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
                            </div>
                        )}

                        {tab === 'fiscal' && (
                            <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm sm:p-5">
                                <div className="mb-4 flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                    <CreditCard size={14} className="text-amber-500" />
                                    Φορολογικά
                                </div>
                                <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">
                                    ΑΦΜ — αυτόματη συμπλήρωση από βάση
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
                                        className="flex shrink-0 items-center gap-2 rounded-xl bg-[#060b00] px-4 py-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-black disabled:pointer-events-none disabled:opacity-40"
                                    >
                                        {isSearchingAfm ? <Loader2 size={18} className="animate-spin" /> : <Zap size={18} />}
                                        <span className="hidden sm:inline">Αναζήτηση</span>
                                    </button>
                                </div>
                                <p className="mt-2 text-xs leading-relaxed text-slate-500">
                                    Συμπληρώνει όπου είναι διαθέσιμα επωνυμία, διεύθυνση, τηλέφωνο και email. Μπορείτε να επιστρέψετε
                                    στα «Γενικά» για διόρθωση.
                                </p>
                                <div className="mt-5">
                                    <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">
                                        Καθεστώς ΦΠΑ
                                    </label>
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
                        )}

                        {tab === 'notes' && (
                            <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm sm:p-5">
                                <div className="mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                    <MessageSquare size={14} className="text-violet-500" />
                                    Σημειώσεις
                                </div>
                                <textarea
                                    className={`${inputClass} min-h-[140px] resize-y`}
                                    placeholder="Εσωτερικές σημειώσεις για τον πελάτη..."
                                    value={form.notes || ''}
                                    onChange={e => setForm({ ...form, notes: e.target.value })}
                                />
                            </div>
                        )}
                    </div>

                    <div className="flex shrink-0 flex-col-reverse gap-3 border-t border-slate-100 bg-slate-50/90 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
                        <button
                            type="button"
                            onClick={onCancel}
                            className="rounded-xl border-2 border-slate-200 bg-white py-3.5 text-sm font-bold text-slate-600 transition-colors hover:bg-slate-50 sm:px-6"
                        >
                            Άκυρο
                        </button>
                        <button
                            type="submit"
                            disabled={isSaving || !form.full_name.trim()}
                            className="flex items-center justify-center gap-2 rounded-xl bg-[#060b00] py-3.5 text-sm font-bold text-white shadow-md transition-colors hover:bg-black disabled:opacity-40 sm:min-w-[200px]"
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
