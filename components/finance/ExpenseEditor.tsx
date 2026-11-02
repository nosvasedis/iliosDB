import React, { useMemo, useState } from 'react';
import { CalendarClock, Camera, Check, FileText, Layers, Paperclip, Plus, Receipt, Search, Trash2, Wallet } from 'lucide-react';
import type { GlobalSettings, Supplier } from '../../types';
import { useUI } from '../UIProvider';
import { useFinanceMutation } from '../../hooks/api/useFinance';
import { financeRepository } from '../../features/finance/repository';
import { categoryBreadcrumb, categoryColor, flattenTree, buildCategoryTree, inheritedCategoryValue } from '../../features/finance/categoryTree';
import { computeAmounts, recentCategoryIds } from '../../features/finance/expenseLedger';
import { addDays, formatEuro, PAYMENT_METHOD_LABELS, roundMoney, toIsoDate } from '../../features/finance/financeMath';
import type { FinanceBilling, FinanceExpense, FinanceExpenseLine, FinancePaymentMethod, FinanceWorkspace } from '../../features/finance/types';
import { uploadFinanceAttachment } from '../../features/finance/attachments';
import {
  AmountInput,
  amountToInput,
  BillingToggle,
  CategoryGlyph,
  Field,
  FinanceModal,
  ghostButton,
  inputClass,
  parseAmount,
  SaveButton,
  secondaryButton,
} from './financeUi';

const VAT_OPTIONS = [0.24, 0.13, 0.06, 0];

interface Props {
  workspace: FinanceWorkspace;
  parties: Supplier[];
  settings?: GlobalSettings | null;
  initial?: Partial<FinanceExpense>;
  onClose: () => void;
}

export default function ExpenseEditor({ workspace, parties, settings, initial = {}, onClose }: Props) {
  const { showToast, confirm } = useUI();
  const isNew = !initial.id;
  const isExpected = initial.status === 'expected';
  const today = toIsoDate(new Date());

  const [categoryId, setCategoryId] = useState(initial.category_id || '');
  const [partyId, setPartyId] = useState(initial.party_id || '');
  const [billing, setBilling] = useState<FinanceBilling>(initial.billing || 'T');
  const [vatRate, setVatRate] = useState(initial.vat_rate ?? (initial.billing === 'X' ? 0 : 0.24));
  const [grossInput, setGrossInput] = useState(amountToInput(initial.amount_gross));
  const [useLines, setUseLines] = useState((initial.lines || []).length > 0);
  const [lines, setLines] = useState<FinanceExpenseLine[]>(initial.lines?.length ? initial.lines : [{ label: '', qty: 1, unit_price: 0 }]);
  const [date, setDate] = useState(initial.expense_date || today);
  const [dueDate, setDueDate] = useState(initial.due_date || '');
  const [docRef, setDocRef] = useState(initial.doc_ref || '');
  const [description, setDescription] = useState(initial.description || '');
  const [notes, setNotes] = useState(initial.notes || '');
  const [paidNow, setPaidNow] = useState(false);
  const [method, setMethod] = useState<FinancePaymentMethod>(initial.payment_method || 'cash');
  const [attachmentKey, setAttachmentKey] = useState(initial.attachment_key || '');
  const [uploading, setUploading] = useState(false);
  const [categorySearch, setCategorySearch] = useState('');
  const [pickingCategory, setPickingCategory] = useState(!initial.category_id);

  const flat = useMemo(() => flattenTree(buildCategoryTree(workspace.categories)), [workspace.categories]);
  const recent = useMemo(() => recentCategoryIds(workspace.expenses).filter((id) => flat.some((node) => node.category.id === id)), [workspace.expenses, flat]);
  const partyById = useMemo(() => new Map(parties.map((party) => [party.id, party])), [parties]);
  const linkKind = inheritedCategoryValue(categoryId, workspace.categories, 'link_kind');

  const searchResults = useMemo(() => {
    const term = categorySearch.trim().toLocaleLowerCase('el');
    return flat.filter((node) => !term || categoryBreadcrumb(node.category.id, workspace.categories).toLocaleLowerCase('el').includes(term));
  }, [categorySearch, flat, workspace.categories]);

  const linesTotal = roundMoney(lines.reduce((sum, line) => sum + line.qty * line.unit_price, 0));
  const effectiveVat = billing === 'X' ? 0 : vatRate;
  const amounts = useLines
    ? computeAmounts({ net: linesTotal, vatRate: effectiveVat })
    : computeAmounts({ gross: parseAmount(grossInput), vatRate: effectiveVat });

  /** Category drives party and Χ/Τ defaults; the party's own preference wins. */
  const chooseCategory = (id: string) => {
    setCategoryId(id);
    setPickingCategory(false);
    const defaultParty = inheritedCategoryValue(id, workspace.categories, 'default_party_id');
    const nextPartyId = partyId || defaultParty || '';
    if (!partyId && defaultParty) setPartyId(defaultParty);
    const party = nextPartyId ? partyById.get(nextPartyId) : undefined;
    const defaultBilling = party?.default_billing || inheritedCategoryValue(id, workspace.categories, 'default_billing');
    if (isNew && defaultBilling) chooseBilling(defaultBilling);
    const kind = inheritedCategoryValue(id, workspace.categories, 'link_kind');
    if (isNew && kind === 'metal' && !useLines) {
      setUseLines(true);
      setLines([{ label: 'Ασήμι 925', qty: 0, unit: 'g', unit_price: settings?.silver_price_gram || 0 }]);
    }
  };

  const chooseParty = (id: string) => {
    setPartyId(id);
    const party = partyById.get(id);
    if (isNew && party?.default_billing) chooseBilling(party.default_billing);
    if (isNew && !categoryId && party?.default_category_id) chooseCategory(party.default_category_id);
    if (party?.payment_terms_days && !dueDate) setDueDate(addDays(date, party.payment_terms_days));
  };

  const chooseBilling = (value: FinanceBilling) => {
    setBilling(value);
    if (value === 'X') setVatRate(0);
    else if (vatRate === 0) setVatRate(0.24);
  };

  const save = useFinanceMutation(async () => {
    const expense = await financeRepository.saveExpense({
      ...(initial.id ? { id: initial.id } : {}),
      category_id: categoryId,
      party_id: partyId || null,
      expense_date: date,
      due_date: dueDate || null,
      description: description.trim() || null,
      doc_ref: docRef.trim() || null,
      notes: notes.trim() || null,
      lines: useLines ? lines.filter((line) => line.label.trim() || line.unit_price) : [],
      amount_net: amounts.net,
      vat_rate: effectiveVat,
      vat_amount: amounts.vat,
      amount_gross: amounts.gross,
      billing,
      payment_method: method,
      attachment_key: attachmentKey || null,
      // Saving an expected bill confirms it with the real amount.
      status: 'unpaid',
      source_kind: initial.source_kind || 'manual',
      source_id: initial.source_id ?? null,
      recurring_id: initial.recurring_id ?? null,
    });
    if (paidNow && amounts.gross > 0) {
      await financeRepository.savePayment({
        expense_id: expense.id,
        party_id: partyId || null,
        amount: roundMoney(amounts.gross - (initial.paid_amount || 0)),
        paid_at: date,
        method,
        billing,
      });
    }
    return expense;
  });

  const remove = useFinanceMutation(async () => financeRepository.deleteExpense(initial.id!));

  const submit = async () => {
    if (!categoryId) { showToast('Επιλέξτε κατηγορία.', 'error'); setPickingCategory(true); return; }
    if (amounts.gross <= 0) { showToast('Συμπληρώστε ποσό.', 'error'); return; }
    try {
      await save.mutateAsync(undefined);
      showToast(isExpected ? 'Ο λογαριασμός επιβεβαιώθηκε.' : isNew ? 'Το έξοδο καταχωρίστηκε.' : 'Το έξοδο ενημερώθηκε.', 'success');
      onClose();
    } catch (error) {
      showToast((error as Error).message, 'error');
    }
  };

  const handleDelete = async () => {
    const ok = await confirm({ title: 'Διαγραφή εξόδου', message: 'Θα διαγραφούν και οι πληρωμές που συνδέονται με αυτό.', confirmText: 'Διαγραφή', isDestructive: true });
    if (!ok) return;
    try {
      await remove.mutateAsync(undefined);
      showToast('Το έξοδο διαγράφηκε.', 'success');
      onClose();
    } catch (error) {
      showToast((error as Error).message, 'error');
    }
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      setAttachmentKey(await uploadFinanceAttachment(file));
      showToast('Το παραστατικό επισυνάφθηκε.', 'success');
    } catch (error) {
      showToast((error as Error).message, 'error');
    } finally {
      setUploading(false);
    }
  };

  const updateLine = (index: number, patch: Partial<FinanceExpenseLine>) =>
    setLines((previous) => previous.map((line, position) => (position === index ? { ...line, ...patch } : line)));

  const color = categoryColor(categoryId, workspace.categories);
  const selected = workspace.categories.find((category) => category.id === categoryId);
  const busy = save.isPending || remove.isPending;

  return (
    <FinanceModal
      icon={Receipt}
      eyebrow={isExpected ? 'Αναμενόμενος λογαριασμός' : isNew ? 'Γρήγορη καταχώριση' : 'Επεξεργασία εξόδου'}
      title={selected ? categoryBreadcrumb(categoryId, workspace.categories) : 'Νέο έξοδο'}
      onClose={onClose}
      busy={busy}
      size="lg"
      footer={(
        <>
          {!isNew && <button type="button" onClick={handleDelete} className={`${secondaryButton} mr-auto text-rose-600`}><Trash2 size={15} /> Διαγραφή</button>}
          <div className="mr-2 text-right">
            <div className="text-[11px] font-black uppercase tracking-wide text-slate-400">Σύνολο</div>
            <div className="text-xl font-black tabular-nums text-slate-900">{formatEuro(amounts.gross)}</div>
          </div>
          <SaveButton busy={save.isPending} onClick={submit}><Check size={16} /> {isExpected ? 'Επιβεβαίωση' : 'Αποθήκευση'}</SaveButton>
        </>
      )}
    >
      <div className="grid gap-5 lg:grid-cols-[1.1fr_1fr]">
        <div className="space-y-4">
          <div>
            <span className="mb-1.5 block text-[11px] font-black uppercase tracking-wide text-slate-500">Κατηγορία</span>
            {!pickingCategory && selected ? (
              <button type="button" onClick={() => setPickingCategory(true)} className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:border-slate-300">
                <CategoryGlyph icon={selected.icon} color={color} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-black text-slate-900">{selected.name}</span>
                  <span className="block truncate text-xs font-semibold text-slate-500">{categoryBreadcrumb(categoryId, workspace.categories)}</span>
                </span>
                <span className="text-xs font-black text-slate-400">Αλλαγή</span>
              </button>
            ) : (
              <div className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50/60 p-3">
                {recent.length > 0 && !categorySearch && (
                  <div className="flex flex-wrap gap-1.5">
                    {recent.map((id) => {
                      const category = workspace.categories.find((row) => row.id === id)!;
                      return (
                        <button key={id} type="button" onClick={() => chooseCategory(id)} className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-xs font-bold text-slate-700 shadow-sm ring-1 ring-slate-200 hover:ring-slate-300">
                          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: categoryColor(id, workspace.categories) }} />
                          {category.name}
                        </button>
                      );
                    })}
                  </div>
                )}
                <div className="relative">
                  <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input autoFocus value={categorySearch} onChange={(event) => setCategorySearch(event.target.value)} placeholder="Αναζήτηση κατηγορίας…" className={`${inputClass} pl-9`} />
                </div>
                <div className="max-h-56 space-y-0.5 overflow-y-auto pr-1 custom-scrollbar">
                  {searchResults.map((node) => (
                    <button
                      key={node.category.id}
                      type="button"
                      onClick={() => chooseCategory(node.category.id)}
                      className={`flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left text-sm transition hover:bg-white ${node.category.id === categoryId ? 'bg-white ring-1 ring-slate-200' : ''}`}
                      style={{ paddingLeft: categorySearch ? 8 : 8 + node.depth * 18 }}
                    >
                      <CategoryGlyph icon={node.category.icon} color={categoryColor(node.category.id, workspace.categories)} size="sm" />
                      <span className={`truncate ${node.depth === 0 ? 'font-black text-slate-900' : 'font-semibold text-slate-700'}`}>
                        {categorySearch ? categoryBreadcrumb(node.category.id, workspace.categories) : node.category.name}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Προμηθευτής / Συνεργάτης">
              <select value={partyId} onChange={(event) => chooseParty(event.target.value)} className={inputClass}>
                <option value="">— Χωρίς —</option>
                {parties.filter((party) => party.is_active !== false || party.id === partyId).map((party) => (
                  <option key={party.id} value={party.id}>{party.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Παραστατικό">
              <BillingToggle value={billing} onChange={chooseBilling} />
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Ημερομηνία"><input type="date" value={date} onChange={(event) => setDate(event.target.value)} className={inputClass} /></Field>
            <Field label="Λήξη πληρωμής"><input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} className={inputClass} /></Field>
            <Field label="Αρ. παραστατικού"><input value={docRef} onChange={(event) => setDocRef(event.target.value)} placeholder="π.χ. ΤΔΑ 1542" className={inputClass} /></Field>
          </div>
          <Field label="Περιγραφή">
            <input value={description} onChange={(event) => setDescription(event.target.value)} placeholder={selected?.name || 'π.χ. Λογαριασμός Σεπτεμβρίου'} className={inputClass} />
          </Field>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 p-3">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-[11px] font-black uppercase tracking-wide text-slate-500">Ποσό</span>
              <div className="inline-flex rounded-lg bg-slate-100 p-0.5 text-xs font-black">
                <button type="button" onClick={() => setUseLines(false)} className={`rounded-md px-2.5 py-1 ${!useLines ? 'bg-white shadow-sm' : 'text-slate-500'}`}>Σύνολο</button>
                <button type="button" onClick={() => setUseLines(true)} className={`flex items-center gap-1 rounded-md px-2.5 py-1 ${useLines ? 'bg-white shadow-sm' : 'text-slate-500'}`}><Layers size={12} /> Γραμμές</button>
              </div>
            </div>
            {useLines ? (
              <div className="space-y-2">
                {lines.map((line, index) => (
                  <div key={index} className="grid grid-cols-[1fr_4.5rem_5.5rem_auto] items-center gap-1.5">
                    <input value={line.label} onChange={(event) => updateLine(index, { label: event.target.value })} placeholder="Είδος" className={`${inputClass} py-2`} />
                    <input inputMode="decimal" value={line.qty ? String(line.qty).replace('.', ',') : ''} onChange={(event) => updateLine(index, { qty: parseAmount(event.target.value) })} placeholder={line.unit || 'Ποσ.'} className={`${inputClass} py-2 text-right`} />
                    <input inputMode="decimal" value={line.unit_price ? String(line.unit_price).replace('.', ',') : ''} onChange={(event) => updateLine(index, { unit_price: parseAmount(event.target.value) })} placeholder="€/μον." className={`${inputClass} py-2 text-right`} />
                    <button type="button" onClick={() => setLines((previous) => previous.filter((_, position) => position !== index))} className="rounded-lg p-1.5 text-slate-300 hover:bg-rose-50 hover:text-rose-500" aria-label="Αφαίρεση γραμμής"><Trash2 size={14} /></button>
                  </div>
                ))}
                <div className="flex items-center justify-between">
                  <button type="button" onClick={() => setLines((previous) => [...previous, { label: '', qty: 1, unit_price: 0 }])} className={ghostButton}><Plus size={13} /> Γραμμή</button>
                  <span className="text-xs font-bold text-slate-500">Καθαρό {formatEuro(linesTotal)}</span>
                </div>
                {linkKind === 'metal' && settings?.silver_price_gram ? (
                  <p className="rounded-xl bg-slate-50 px-3 py-2 text-[11px] font-semibold text-slate-500">
                    Τιμή ασημιού στις ρυθμίσεις: <b className="text-slate-800">{formatEuro(settings.silver_price_gram)}/g</b>
                    {lines[0]?.unit_price && Math.abs(lines[0].unit_price - settings.silver_price_gram) / settings.silver_price_gram > 0.03
                      ? <span className="ml-1 font-black text-amber-700">· διαφέρει {Math.round(((lines[0].unit_price - settings.silver_price_gram) / settings.silver_price_gram) * 100)}%</span>
                      : null}
                  </p>
                ) : null}
              </div>
            ) : (
              <AmountInput value={grossInput} onChange={setGrossInput} autoFocus={!!initial.category_id} className="py-3 text-2xl" />
            )}
            {billing === 'T' && (
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] font-black uppercase tracking-wide text-slate-400">ΦΠΑ</span>
                {VAT_OPTIONS.map((rate) => (
                  <button key={rate} type="button" onClick={() => setVatRate(rate)} className={`rounded-lg px-2 py-1 text-xs font-black ${vatRate === rate ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500 hover:text-slate-800'}`}>
                    {Math.round(rate * 100)}%
                  </button>
                ))}
                <span className="ml-auto text-xs font-bold text-slate-500 tabular-nums">Καθ. {formatEuro(amounts.net)} · ΦΠΑ {formatEuro(amounts.vat)}</span>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 p-3">
            <label className="flex cursor-pointer items-center gap-3">
              <input type="checkbox" checked={paidNow} onChange={(event) => setPaidNow(event.target.checked)} className="h-5 w-5 rounded-md accent-emerald-600" />
              <span className="flex-1">
                <span className="flex items-center gap-1.5 text-sm font-black text-slate-800"><Wallet size={15} /> Πληρώθηκε τώρα</span>
                <span className="text-xs font-semibold text-slate-500">{initial.paid_amount ? `Έχουν ήδη πληρωθεί ${formatEuro(initial.paid_amount)}` : 'Καταχωρίζει και την πληρωμή'}</span>
              </span>
            </label>
            {paidNow && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {(Object.keys(PAYMENT_METHOD_LABELS) as FinancePaymentMethod[]).map((key) => (
                  <button key={key} type="button" onClick={() => setMethod(key)} className={`rounded-lg px-2.5 py-1.5 text-xs font-black ${method === key ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                    {PAYMENT_METHOD_LABELS[key]}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-dashed border-slate-200 p-3">
            <label className={`${secondaryButton} cursor-pointer`}>
              <Camera size={15} /> {uploading ? 'Ανέβασμα…' : attachmentKey ? 'Αλλαγή φωτογραφίας' : 'Φωτογραφία απόδειξης'}
              <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(event) => handleFile(event.target.files?.[0])} />
            </label>
            {attachmentKey ? <span className="flex items-center gap-1 text-xs font-black text-emerald-700"><Paperclip size={13} /> Επισυνάφθηκε</span> : <span className="text-xs font-semibold text-slate-400">Προαιρετικό</span>}
          </div>

          <Field label="Σημειώσεις">
            <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={2} className={inputClass} />
          </Field>
          {isExpected && (
            <p className="flex items-center gap-2 rounded-xl bg-sky-50 px-3 py-2 text-xs font-bold text-sky-800">
              <CalendarClock size={14} /> Εκτίμηση από επαναλαμβανόμενο έξοδο. Συμπληρώστε το πραγματικό ποσό και επιβεβαιώστε.
            </p>
          )}
          {initial.source_kind && initial.source_kind !== 'manual' && !isExpected && (
            <p className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600">
              <FileText size={14} /> Δημιουργήθηκε αυτόματα ({initial.source_kind === 'supplier_order' ? 'εντολή αγοράς' : initial.source_kind === 'worker_statement' ? 'εκκαθάριση συνεργάτη' : initial.source_kind === 'commission' ? 'προμήθεια πλασιέ' : 'επαναλαμβανόμενο'}).
            </p>
          )}
        </div>
      </div>
    </FinanceModal>
  );
}
