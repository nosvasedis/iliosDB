import React, { useMemo, useState } from 'react';
import { AlertTriangle, CalendarClock, Check, Globe, Hash, ImagePlus, Landmark, Loader2, Mail, MapPin, Phone, StickyNote, Store, UserRound, X } from 'lucide-react';
import { useUI } from '../UIProvider';
import { uploadSupplierLogo } from '../../features/suppliers/supplierLogo';
import { PARTY_KIND_META } from '../finance/financeUi';
import type { FinancePartyKind } from '../../features/finance/types';
import type { Supplier } from '../../types';
import { useRestartDraft } from '../../hooks/useRestartBlocker';
import { useEscapeToClose } from '../../hooks/useEscapeToClose';
import { SupplierAvatar } from './SupplierCard';
import { isValidEmail } from './supplierUi';

interface Props {
    initial: Partial<Supplier>;
    existingSuppliers: Supplier[];
    onClose: () => void;
    onSave: (supplier: Partial<Supplier>) => Promise<void>;
}

const inputClass =
    'w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-3 text-sm font-semibold text-slate-800 outline-none transition-all placeholder:font-medium placeholder:text-slate-400 focus:border-emerald-300 focus:bg-white focus:ring-4 focus:ring-emerald-500/10';
const labelClass = 'mb-1.5 block text-[11px] font-black uppercase tracking-wide text-slate-500';

function Field({ label, icon: Icon, children, hint }: { label: string; icon: typeof Phone; children: React.ReactNode; hint?: React.ReactNode }) {
    return (
        <label className="block">
            <span className={labelClass}>{label}</span>
            <span className="relative block">
                <Icon size={16} className="pointer-events-none absolute left-3.5 top-[0.95rem] text-slate-400" />
                {children}
            </span>
            {hint}
        </label>
    );
}

export default function SupplierFormModal({ initial, existingSuppliers, onClose, onSave }: Props) {
    const [form, setForm] = useState<Partial<Supplier>>(initial);
    const [isSaving, setIsSaving] = useState(false);
    const [triedSave, setTriedSave] = useState(false);
    const isNew = !initial.id;

    useRestartDraft('Στοιχεία προμηθευτή', form, { identity: initial.id, busy: isSaving });
    useEscapeToClose(onClose, isSaving);

    const { showToast } = useUI();
    const [uploadingLogo, setUploadingLogo] = useState(false);
    const handleLogo = async (file: File | undefined) => {
        if (!file) return;
        setUploadingLogo(true);
        try {
            const logo_url = await uploadSupplierLogo(file);
            setForm((previous) => ({ ...previous, logo_url }));
        } catch (error) {
            showToast((error as Error).message, 'error');
        } finally {
            setUploadingLogo(false);
        }
    };

    const set = (field: keyof Supplier) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        setForm((previous) => ({ ...previous, [field]: event.target.value }));

    const name = (form.name || '').trim();
    const email = (form.email || '').trim();
    const nameMissing = !name;
    const emailInvalid = !!email && !isValidEmail(email);
    const duplicate = useMemo(
        () => name && existingSuppliers.find((supplier) => supplier.id !== initial.id && supplier.name.trim().toLowerCase() === name.toLowerCase()),
        [existingSuppliers, initial.id, name],
    );

    const submit = async () => {
        setTriedSave(true);
        if (nameMissing || emailInvalid) return;
        setIsSaving(true);
        try {
            const cleaned: Partial<Supplier> = { ...form };
            (['name', 'contact_person', 'phone', 'email', 'address', 'notes', 'vat_number', 'iban', 'website'] as const).forEach((key) => {
                const value = cleaned[key];
                if (typeof value === 'string') cleaned[key] = value.trim();
            });
            await onSave(cleaned);
        } finally {
            setIsSaving(false);
        }
    };

    const onKeyDown = (event: React.KeyboardEvent) => {
        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            submit();
        }
    };

    return (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm animate-in fade-in" onMouseDown={(event) => { if (event.target === event.currentTarget && !isSaving) onClose(); }}>
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="supplier-form-title"
                onKeyDown={onKeyDown}
                className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-[2rem] border border-slate-100 bg-white shadow-2xl animate-in zoom-in-95"
            >
                <div className="relative overflow-hidden border-b border-slate-100 bg-gradient-to-br from-slate-50 to-white px-6 py-5">
                    <div className="pointer-events-none absolute -right-16 -top-20 h-48 w-48 rounded-full bg-emerald-200/30 blur-3xl" />
                    <div className="relative flex items-center gap-4">
                        <label className="group relative cursor-pointer" title="Λογότυπο: πατήστε για αλλαγή">
                            {name || form.logo_url ? <SupplierAvatar name={name || '?'} logoUrl={form.logo_url} /> : (
                                <div className="flex h-12 w-12 items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 text-slate-300"><Store size={22} /></div>
                            )}
                            <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-white shadow ring-2 ring-white">
                                {uploadingLogo ? <Loader2 size={11} className="animate-spin" /> : <ImagePlus size={11} />}
                            </span>
                            <input type="file" accept="image/*,.svg" className="hidden" onChange={(event) => { handleLogo(event.target.files?.[0]); event.target.value = ''; }} />
                        </label>
                        <div className="min-w-0 flex-1">
                            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-emerald-700">{isNew ? 'Νέος προμηθευτής' : 'Επεξεργασία'}</p>
                            <h2 id="supplier-form-title" className="truncate text-xl font-black text-slate-900">{name || 'Χωρίς επωνυμία'}</h2>
                        </div>
                        <button type="button" onClick={onClose} disabled={isSaving} className="rounded-xl p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700" aria-label="Κλείσιμο">
                            <X size={20} />
                        </button>
                    </div>
                </div>

                <div className="flex-1 space-y-6 overflow-y-auto p-6 custom-scrollbar">
                    <section className="space-y-4">
                        <h3 className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Ταυτότητα</h3>
                        <Field
                            label="Επωνυμία *"
                            icon={Store}
                            hint={triedSave && nameMissing ? (
                                <span className="mt-1.5 block text-xs font-bold text-red-600">Η επωνυμία είναι υποχρεωτική.</span>
                            ) : duplicate ? (
                                <span className="mt-1.5 flex items-center gap-1 text-xs font-bold text-amber-700"><AlertTriangle size={12} /> Υπάρχει ήδη προμηθευτής με αυτή την επωνυμία.</span>
                            ) : null}
                        >
                            <input autoFocus value={form.name || ''} onChange={set('name')} placeholder="π.χ. Υλικά ΕΠΕ" className={`${inputClass} font-bold ${triedSave && nameMissing ? 'border-red-300 ring-4 ring-red-500/10' : ''}`} />
                        </Field>
                        <Field label="Υπεύθυνος επικοινωνίας" icon={UserRound}>
                            <input value={form.contact_person || ''} onChange={set('contact_person')} placeholder="Ονοματεπώνυμο" className={inputClass} />
                        </Field>
                    </section>

                    <section className="space-y-4">
                        <h3 className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Επικοινωνία</h3>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <Field label="Τηλέφωνο" icon={Phone}>
                                <input type="tel" value={form.phone || ''} onChange={set('phone')} placeholder="+30 ..." className={inputClass} />
                            </Field>
                            <Field
                                label="Ηλ. ταχυδρομείο"
                                icon={Mail}
                                hint={emailInvalid && (triedSave || email.length > 4) ? <span className="mt-1.5 block text-xs font-bold text-red-600">Μη έγκυρη διεύθυνση.</span> : null}
                            >
                                <input type="email" value={form.email || ''} onChange={set('email')} placeholder="info@..." className={`${inputClass} ${emailInvalid && triedSave ? 'border-red-300' : ''}`} />
                            </Field>
                        </div>
                        <Field label="Διεύθυνση" icon={MapPin}>
                            <input value={form.address || ''} onChange={set('address')} placeholder="Οδός, Πόλη, ΤΚ, Χώρα" className={inputClass} />
                        </Field>
                        <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
                            <Field label="Ιστότοπος" icon={Globe}>
                                <input type="url" value={form.website || ''} onChange={set('website')} placeholder="https://..." className={inputClass} />
                            </Field>
                            <div className="flex items-center gap-2 pb-0.5">
                                <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-black text-slate-700 hover:bg-slate-50">
                                    {uploadingLogo ? <Loader2 size={14} className="animate-spin" /> : <ImagePlus size={14} />} {form.logo_url ? 'Αλλαγή λογότυπου' : 'Λογότυπο'}
                                    <input type="file" accept="image/*,.svg" className="hidden" onChange={(event) => { handleLogo(event.target.files?.[0]); event.target.value = ''; }} />
                                </label>
                                {form.logo_url && (
                                    <button type="button" onClick={() => setForm((previous) => ({ ...previous, logo_url: null }))} className="rounded-xl px-2 py-2.5 text-xs font-bold text-slate-400 hover:text-rose-600">Αφαίρεση</button>
                                )}
                            </div>
                        </div>
                    </section>

                    <section className="space-y-4">
                        <h3 className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Οικονομικά</h3>
                        <div>
                            <span className={labelClass}>Τύπος</span>
                            <div className="flex flex-wrap gap-1.5">
                                {(Object.keys(PARTY_KIND_META) as FinancePartyKind[]).map((kind) => {
                                    const meta = PARTY_KIND_META[kind];
                                    const KindIcon = meta.icon;
                                    const active = (form.kind || 'supplier') === kind;
                                    return (
                                        <button key={kind} type="button" onClick={() => setForm((previous) => ({ ...previous, kind }))} className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-black ring-1 transition ${active ? meta.tone + ' ring-2' : 'bg-white text-slate-500 ring-slate-200 hover:text-slate-800'}`}>
                                            <KindIcon size={14} /> {meta.label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <Field label="ΑΦΜ" icon={Hash}>
                                <input value={form.vat_number || ''} onChange={set('vat_number')} placeholder="123456789" className={inputClass} />
                            </Field>
                            <Field label="IBAN" icon={Landmark}>
                                <input value={form.iban || ''} onChange={set('iban')} placeholder="GR.." className={inputClass} />
                            </Field>
                            <Field label="Ημέρες πίστωσης" icon={CalendarClock}>
                                <input type="number" min={0} value={form.payment_terms_days ?? ''} onChange={(event) => setForm((previous) => ({ ...previous, payment_terms_days: event.target.value === '' ? null : Math.max(0, Number(event.target.value)) }))} placeholder="π.χ. 30" className={inputClass} />
                            </Field>
                            <label className="block">
                                <span className={labelClass}>Συνήθως πληρώνεται</span>
                                <span className="flex gap-1.5">
                                    {([['', 'Αδιάφορο'], ['T', 'Τ · τιμολόγιο'], ['X', 'Χ · μετρητά']] as const).map(([value, label]) => (
                                        <button key={value} type="button" onClick={() => setForm((previous) => ({ ...previous, default_billing: (value || null) as Supplier['default_billing'] }))} className={`flex-1 rounded-xl px-2 py-3 text-xs font-black ring-1 ${(form.default_billing || '') === value ? 'bg-slate-900 text-white ring-slate-900' : 'bg-slate-50 text-slate-600 ring-slate-200'}`}>
                                            {label}
                                        </button>
                                    ))}
                                </span>
                            </label>
                        </div>
                        <label className="flex items-center gap-2 text-sm font-bold text-slate-600">
                            <input type="checkbox" checked={form.is_active !== false} onChange={(event) => setForm((previous) => ({ ...previous, is_active: event.target.checked }))} className="h-4 w-4 accent-emerald-600" />
                            Ενεργός συνεργάτης
                        </label>
                    </section>

                    <section>
                        <Field label="Σημειώσεις" icon={StickyNote}>
                            <textarea value={form.notes || ''} onChange={set('notes')} rows={4} placeholder="Όροι πληρωμής, χρόνοι παράδοσης, ελάχιστες ποσότητες..." className={`${inputClass} resize-none leading-relaxed`} />
                        </Field>
                    </section>
                </div>

                <div className="flex items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/80 px-6 py-4">
                    <span className="hidden text-[11px] font-bold text-slate-400 sm:block">Ctrl + Enter για αποθήκευση</span>
                    <div className="flex flex-1 justify-end gap-2 sm:flex-none">
                        <button type="button" onClick={onClose} disabled={isSaving} className="rounded-xl px-5 py-2.5 text-sm font-bold text-slate-600 transition-colors hover:bg-slate-200/70">Άκυρο</button>
                        <button
                            type="button"
                            onClick={submit}
                            disabled={isSaving}
                            className="inline-flex items-center gap-2 rounded-xl bg-[#060b00] px-6 py-2.5 text-sm font-bold text-white shadow-lg transition-all hover:-translate-y-px hover:bg-black disabled:opacity-60"
                        >
                            {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                            {isNew ? 'Δημιουργία' : 'Αποθήκευση'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
