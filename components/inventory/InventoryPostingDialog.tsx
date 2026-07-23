import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Image as ImageIcon,
  Loader2,
  Plus,
  ScanBarcode,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import type { Product, Warehouse } from '../../types';
import type {
  InventoryAvailability,
  InventoryPostingLine,
  InventoryPostingMode,
} from '../../features/inventory';
import {
  buildInventoryPostingLines,
  formatInventoryInteger,
  formatInventoryQuantity,
  inventoryRepository,
  isValidInventorySizeInfo,
  normalizeInventorySizeInfo,
} from '../../features/inventory';
import { getSizingInfo } from '../../utils/sizing';
import {
  searchSkuProductOptions,
  type SkuPickerOption,
} from '../../utils/skuProductPicker';
import { useEscapeToClose } from '../../hooks/useEscapeToClose';
import { useUI } from '../UIProvider';
import SkuColorizedText from '../SkuColorizedText';
import { BTN_PRIMARY, BTN_SECONDARY } from '../ui/designTokens';

interface InventoryPostingDialogProps {
  products: Product[];
  warehouses: Warehouse[];
  availability: InventoryAvailability[];
  profileId?: string;
  initialSelection?: SkuPickerOption | null;
  onRequestScan: () => void;
  onSaved: () => Promise<void>;
  onPrepareNext: () => void;
  onClose: () => void;
}

function warehouseStorageKey(profileId?: string): string {
  return `ilios:inventory:last-warehouse:${profileId || 'anonymous'}`;
}

function getPreferredWarehouseId(warehouses: Warehouse[], profileId?: string): string {
  const saved = typeof window !== 'undefined'
    ? window.localStorage.getItem(warehouseStorageKey(profileId))
    : null;
  if (saved && warehouses.some((warehouse) => warehouse.id === saved)) return saved;
  return warehouses.find((warehouse) => warehouse.type === 'Central')?.id || warehouses[0]?.id || '';
}

function quantityInputKey(warehouseId: string, sizeInfo: string): string {
  return `${warehouseId}::${normalizeInventorySizeInfo(sizeInfo)}`;
}

function ProductSelectionCard({ option }: { option: SkuPickerOption }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-emerald-100 bg-emerald-50/60 p-3">
      <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white bg-white">
        {option.product?.image_url ? (
          <img src={option.product.image_url} alt={`Εικόνα προϊόντος ${option.displaySku}`} className="h-full w-full object-cover" />
        ) : (
          <ImageIcon size={21} className="text-slate-300" aria-label={`Δεν υπάρχει εικόνα για το προϊόν ${option.displaySku}`} />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <SkuColorizedText
          sku={option.sku}
          suffix={option.variant_suffix || ''}
          gender={option.product?.gender}
          className="text-lg"
          masterClassName="text-slate-900"
        />
        <span className="mt-1 block truncate text-sm text-slate-600">
          {option.hint || option.product?.category || 'Χωρίς περιγραφή παραλλαγής'}
        </span>
      </span>
    </div>
  );
}

export default function InventoryPostingDialog({
  products,
  warehouses,
  availability,
  profileId,
  initialSelection,
  onRequestScan,
  onSaved,
  onPrepareNext,
  onClose,
}: InventoryPostingDialogProps) {
  const { showToast } = useUI();
  const [mode, setMode] = useState<InventoryPostingMode>('count');
  const [selection, setSelection] = useState<SkuPickerOption | null>(initialSelection || null);
  const [skuQuery, setSkuQuery] = useState(initialSelection?.displaySku || '');
  const [pickerOpen, setPickerOpen] = useState(!initialSelection);
  const [warehouseIds, setWarehouseIds] = useState<string[]>(() => {
    const preferred = getPreferredWarehouseId(warehouses, profileId);
    return preferred ? [preferred] : [];
  });
  const [values, setValues] = useState<Record<string, string>>({});
  const [customSizes, setCustomSizes] = useState<string[]>([]);
  const [customSize, setCustomSize] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const pickerInputRef = useRef<HTMLInputElement>(null);
  useEscapeToClose(onClose, saving);

  useEffect(() => {
    if (!initialSelection) return;
    setSelection(initialSelection);
    setSkuQuery(initialSelection.displaySku);
    setPickerOpen(false);
    setValues({});
    setCustomSizes([]);
  }, [initialSelection]);

  useEffect(() => {
    if (warehouseIds.length > 0 || warehouses.length === 0) return;
    const preferred = getPreferredWarehouseId(warehouses, profileId);
    if (preferred) setWarehouseIds([preferred]);
  }, [profileId, warehouseIds.length, warehouses]);

  const pickerOptions = useMemo(
    () => skuQuery.trim() ? searchSkuProductOptions(products, skuQuery, 12) : [],
    [products, skuQuery],
  );
  const selectedProduct = selection?.product;
  const sizing = selectedProduct ? getSizingInfo(selectedProduct) : null;
  const sizeOptions = useMemo(
    () => sizing ? [...sizing.sizes, ...customSizes] : [''],
    [customSizes, sizing],
  );

  const currentFor = (warehouseId: string, sizeInfo: string) => availability.find((row) => (
    row.productSku === selection?.sku
    && row.variantSuffix === (selection?.variant_suffix || '')
    && row.sizeInfo === normalizeInventorySizeInfo(sizeInfo)
    && row.warehouseId === warehouseId
  ));

  const draftLines = useMemo(() => {
    if (!selection) return [];
    return warehouseIds.flatMap((warehouseId) => sizeOptions.map((sizeInfo) => ({
      productSku: selection.sku,
      variantSuffix: selection.variant_suffix || '',
      sizeInfo,
      warehouseId,
      quantity: values[quantityInputKey(warehouseId, sizeInfo)] ?? '',
    })));
  }, [selection, sizeOptions, values, warehouseIds]);

  const preview = useMemo<{ lines: InventoryPostingLine[]; error: string | null }>(() => {
    try {
      return { lines: buildInventoryPostingLines(draftLines, mode), error: null };
    } catch (error) {
      return { lines: [], error: error instanceof Error ? error.message : 'Οι ποσότητες δεν είναι έγκυρες.' };
    }
  }, [draftLines, mode]);

  const selectOption = (option: SkuPickerOption) => {
    setSelection(option);
    setSkuQuery(option.displaySku);
    setPickerOpen(false);
    setValues({});
    setCustomSizes([]);
  };

  const addWarehouse = () => {
    const next = warehouses.find((warehouse) => !warehouseIds.includes(warehouse.id));
    if (!next) {
      showToast('Έχουν ήδη επιλεγεί όλες οι διαθέσιμες αποθήκες.', 'info');
      return;
    }
    setWarehouseIds((current) => [...current, next.id]);
  };

  const changeWarehouse = (index: number, warehouseId: string) => {
    if (warehouseIds.some((current, currentIndex) => current === warehouseId && currentIndex !== index)) {
      showToast('Η ίδια αποθήκη δεν μπορεί να προστεθεί δύο φορές στην ίδια καταχώριση.', 'warning');
      return;
    }
    setWarehouseIds((current) => current.map((item, currentIndex) => currentIndex === index ? warehouseId : item));
  };

  const addCustomSize = () => {
    const normalized = normalizeInventorySizeInfo(customSize);
    if (!normalized || !isValidInventorySizeInfo(normalized)) {
      showToast('Καταχωρίστε έγκυρο ειδικό μέγεθος έως 40 χαρακτήρες.', 'error');
      return;
    }
    if (sizeOptions.includes(normalized)) {
      showToast(`Το μέγεθος ${normalized} υπάρχει ήδη στον πίνακα.`, 'warning');
      return;
    }
    setCustomSizes((current) => [...current, normalized]);
    setCustomSize('');
  };

  const submit = async (continueWithNext: boolean) => {
    if (!selection) {
      showToast('Επιλέξτε συγκεκριμένο SKU και παραλλαγή πριν από την καταχώριση.', 'error');
      pickerInputRef.current?.focus();
      return;
    }
    if (!reason.trim()) {
      showToast('Η αιτιολογία είναι υποχρεωτική για την πλήρη ιχνηλασιμότητα.', 'error');
      return;
    }
    if (preview.error || preview.lines.length === 0) {
      showToast(preview.error || 'Καταχωρίστε τουλάχιστον μία ποσότητα.', 'error');
      return;
    }

    setSaving(true);
    try {
      const result = await inventoryRepository.postInventoryEntries({
        mode,
        lines: preview.lines,
        reason: reason.trim(),
        idempotencyKey: `inventory-posting:${crypto.randomUUID()}`,
      });
      await onSaved();
      const zeroMessage = result.countedZeroCount > 0
        ? ` Περιλαμβάνονται ${formatInventoryInteger(result.countedZeroCount)} ρητές μηδενικές μετρήσεις.`
        : '';
      showToast(
        `Η καταχώριση ολοκληρώθηκε για ${formatInventoryInteger(result.postedCount)} ${result.postedCount === 1 ? 'γραμμή' : 'γραμμές'} αποθέματος.${zeroMessage}`,
        'success',
      );
      if (typeof window !== 'undefined' && warehouseIds[0]) {
        window.localStorage.setItem(warehouseStorageKey(profileId), warehouseIds[0]);
      }
      if (continueWithNext) {
        setSelection(null);
        setSkuQuery('');
        setValues({});
        setCustomSizes([]);
        setPickerOpen(true);
        onPrepareNext();
        window.setTimeout(() => pickerInputRef.current?.focus(), 0);
      } else {
        onClose();
      }
    } catch (error) {
      showToast(
        error instanceof Error
          ? error.message
          : 'Η καταχώριση αποθέματος δεν ολοκληρώθηκε. Δεν πραγματοποιήθηκε καμία μεταβολή.',
        'error',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[500] flex items-end bg-slate-950/55 sm:items-center sm:justify-center sm:p-4" role="presentation" onMouseDown={() => { if (!saving) onClose(); }}>
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="inventory-posting-title"
        className="flex max-h-[96vh] w-full max-w-6xl flex-col overflow-hidden rounded-t-3xl border border-slate-100 bg-white shadow-2xl sm:max-h-[92vh] sm:rounded-3xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-100 p-5">
          <div>
            <h2 id="inventory-posting-title" className="text-xl font-black text-slate-900">Καταχώριση Αποθέματος</h2>
            <p className="mt-1 text-sm text-slate-500">Απευθείας απογραφή ή προσθήκη σε μία ή περισσότερες αποθήκες, χωρίς υποχρεωτική ενδιάμεση Κεντρική Αποθήκη.</p>
          </div>
          <button type="button" onClick={onClose} disabled={saving} aria-label="Κλείσιμο καταχώρισης αποθέματος" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-50">
            <X size={19} />
          </button>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto p-4 sm:p-5">
          <section aria-labelledby="posting-product-title">
            <div className="mb-2 flex items-center justify-between gap-3">
              <h3 id="posting-product-title" className="text-sm font-black text-slate-900">1. SKU και παραλλαγή</h3>
              <button type="button" onClick={onRequestScan} className={`${BTN_SECONDARY} px-3 py-2 text-xs`} aria-label="Σάρωση SKU για καταχώριση αποθέματος">
                <ScanBarcode size={15} aria-hidden="true" /> Σάρωση
              </button>
            </div>
            <div className="relative">
              <label className="flex items-center rounded-xl border border-slate-200 bg-white focus-within:border-emerald-500 focus-within:ring-4 focus-within:ring-emerald-50">
                <Search size={18} className="ml-3 text-slate-400" aria-hidden="true" />
                <span className="sr-only">Επιλογή SKU ή παραλλαγής για καταχώριση</span>
                <input
                  ref={pickerInputRef}
                  value={skuQuery}
                  onChange={(event) => {
                    setSkuQuery(event.target.value);
                    setSelection(null);
                    setPickerOpen(true);
                  }}
                  onFocus={() => setPickerOpen(true)}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') setPickerOpen(false);
                    if (event.key === 'Enter' && pickerOptions[0]) {
                      event.preventDefault();
                      selectOption(pickerOptions[0]);
                    }
                  }}
                  role="combobox"
                  aria-expanded={pickerOpen}
                  aria-controls="inventory-posting-picker-results"
                  aria-autocomplete="list"
                  placeholder="Αναζήτηση SKU ή παραλλαγής…"
                  className="min-w-0 flex-1 border-0 bg-transparent px-3 py-3 font-bold text-slate-900 outline-none"
                  autoComplete="off"
                  spellCheck={false}
                />
              </label>
              {pickerOpen && skuQuery.trim() && !selection && (
                <div id="inventory-posting-picker-results" role="listbox" className="absolute left-0 right-0 top-[calc(100%+0.4rem)] z-30 max-h-72 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl">
                  {pickerOptions.length > 0 ? pickerOptions.map((option) => (
                    <button
                      key={option.key}
                      type="button"
                      role="option"
                      aria-selected="false"
                      onClick={() => selectOption(option)}
                      className="flex w-full items-center gap-3 border-b border-slate-100 p-3 text-left last:border-b-0 hover:bg-emerald-50"
                    >
                      <SkuColorizedText sku={option.sku} suffix={option.variant_suffix || ''} gender={option.product?.gender} className="text-sm" masterClassName="text-slate-900" />
                      <span className="min-w-0 truncate text-xs text-slate-500">{option.hint || option.product?.category}</span>
                    </button>
                  )) : (
                    <p className="p-4 text-center text-sm text-slate-500">Δεν βρέθηκε καταχωρισμένο SKU ή παραλλαγή.</p>
                  )}
                </div>
              )}
            </div>
            {selection && <div className="mt-3"><ProductSelectionCard option={selection} /></div>}
            {!selection && skuQuery.trim() && (
              <p className="mt-2 text-xs font-semibold text-amber-700">Επιλέξτε συγκεκριμένο αποτέλεσμα. Κύριο SKU με παραλλαγές δεν καταχωρίζεται χωρίς ακριβή παραλλαγή.</p>
            )}
          </section>

          <section aria-labelledby="posting-mode-title">
            <h3 id="posting-mode-title" className="text-sm font-black text-slate-900">2. Τρόπος καταχώρισης</h3>
            <div className="mt-2 grid gap-2 md:grid-cols-2">
              <button
                type="button"
                onClick={() => setMode('count')}
                aria-pressed={mode === 'count'}
                className={`rounded-xl border p-4 text-left ${mode === 'count' ? 'border-emerald-300 bg-emerald-50 ring-2 ring-emerald-100' : 'border-slate-200 bg-white'}`}
              >
                <strong className="block text-sm text-slate-900">Απογραφή — Ορισμός ακριβούς Φυσικού Αποθέματος</strong>
                <span className="mt-1 block text-xs leading-5 text-slate-600">Η τιμή αντικαθιστά το τρέχον υπόλοιπο. Κενό σημαίνει «δεν καταμετρήθηκε», ενώ ρητό 0 σημαίνει «καταμετρήθηκε μηδενικό».</span>
              </button>
              <button
                type="button"
                onClick={() => setMode('increase')}
                aria-pressed={mode === 'increase'}
                className={`rounded-xl border p-4 text-left ${mode === 'increase' ? 'border-blue-300 bg-blue-50 ring-2 ring-blue-100' : 'border-slate-200 bg-white'}`}
              >
                <strong className="block text-sm text-slate-900">Προσθήκη Ποσότητας</strong>
                <span className="mt-1 block text-xs leading-5 text-slate-600">Η ποσότητα προστίθεται στο υπάρχον Φυσικό Απόθεμα και πρέπει να είναι μεγαλύτερη από μηδέν.</span>
              </button>
            </div>
          </section>

          <section aria-labelledby="posting-warehouses-title">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 id="posting-warehouses-title" className="text-sm font-black text-slate-900">3. Αποθήκες και ποσότητες</h3>
                <p className="mt-1 text-xs text-slate-500">Μπορείτε να καταχωρίσετε απευθείας στο Δειγματολόγιο ή σε οποιαδήποτε άλλη αποθήκη.</p>
              </div>
              <button type="button" onClick={addWarehouse} disabled={warehouseIds.length >= warehouses.length} className={`${BTN_SECONDARY} px-3 py-2 text-xs disabled:opacity-40`}>
                <Plus size={15} aria-hidden="true" /> Προσθήκη δεύτερης αποθήκης
              </button>
            </div>

            <div className="mt-3 space-y-4">
              {warehouseIds.map((warehouseId, warehouseIndex) => (
                <article key={`${warehouseId}-${warehouseIndex}`} className="overflow-hidden rounded-2xl border border-slate-200">
                  <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 bg-slate-50 p-3">
                    <label className="min-w-[15rem] flex-1 text-xs font-black text-slate-600">
                      Αποθήκη {warehouseIndex + 1}
                      <select
                        value={warehouseId}
                        onChange={(event) => changeWarehouse(warehouseIndex, event.target.value)}
                        className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-800 outline-none focus:border-emerald-500"
                        aria-label={`Επιλογή αποθήκης ${warehouseIndex + 1}`}
                      >
                        {warehouses.map((warehouse) => (
                          <option key={warehouse.id} value={warehouse.id} disabled={warehouseIds.includes(warehouse.id) && warehouse.id !== warehouseId}>
                            {warehouse.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    {warehouseIds.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setWarehouseIds((current) => current.filter((_, index) => index !== warehouseIndex))}
                        className="rounded-lg p-2 text-rose-600 hover:bg-rose-50"
                        aria-label={`Αφαίρεση αποθήκης ${warehouseIndex + 1}`}
                      >
                        <Trash2 size={17} />
                      </button>
                    )}
                  </div>
                  {selection ? (
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-sm">
                        <thead className="bg-white text-left text-[11px] uppercase tracking-wide text-slate-500">
                          <tr>
                            <th className="px-4 py-2.5">{sizing ? 'Μέγεθος' : 'Ταυτότητα είδους'}</th>
                            <th className="px-4 py-2.5 text-right">Τρέχον Φυσικό</th>
                            <th className="px-4 py-2.5 text-right">Δεσμευμένο</th>
                            <th className="px-4 py-2.5 text-right">{mode === 'count' ? 'Μετρημένο Φυσικό' : 'Ποσότητα Προσθήκης'}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {sizeOptions.map((sizeInfo) => {
                            const current = currentFor(warehouseId, sizeInfo);
                            const inputKey = quantityInputKey(warehouseId, sizeInfo);
                            return (
                              <tr key={sizeInfo || 'without-size'}>
                                <td className="px-4 py-2.5 font-bold text-slate-800">
                                  {sizeInfo || 'Χωρίς διάκριση μεγέθους'}
                                  {customSizes.includes(sizeInfo) && <span className="ml-2 rounded-md bg-violet-50 px-2 py-0.5 text-[10px] text-violet-700">Ειδικό μέγεθος</span>}
                                </td>
                                <td className="px-4 py-2.5 text-right font-bold tabular-nums text-slate-700">{formatInventoryInteger(current?.onHand || 0)}</td>
                                <td className="px-4 py-2.5 text-right font-bold tabular-nums text-indigo-700">{formatInventoryInteger(current?.reserved || 0)}</td>
                                <td className="px-4 py-2">
                                  <input
                                    type="number"
                                    min={mode === 'count' ? 0 : 1}
                                    step={1}
                                    inputMode="numeric"
                                    value={values[inputKey] ?? ''}
                                    onChange={(event) => setValues((currentValues) => ({ ...currentValues, [inputKey]: event.target.value }))}
                                    placeholder="Κενό"
                                    aria-label={`${mode === 'count' ? 'Μετρημένο φυσικό απόθεμα' : 'Ποσότητα προσθήκης'} για ${sizeInfo ? `μέγεθος ${sizeInfo}` : 'είδος χωρίς μέγεθος'} στην ${warehouses.find((warehouse) => warehouse.id === warehouseId)?.name || 'επιλεγμένη αποθήκη'}`}
                                    className="ml-auto block w-28 rounded-lg border border-slate-200 px-3 py-2 text-right font-black tabular-nums outline-none focus:border-emerald-500"
                                  />
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="p-5 text-center text-sm text-slate-500">Επιλέξτε πρώτα συγκεκριμένο SKU και παραλλαγή.</p>
                  )}
                </article>
              ))}
            </div>

            {selection && sizing && (
              <div className="mt-3 flex flex-col gap-2 rounded-xl border border-violet-100 bg-violet-50/60 p-3 sm:flex-row sm:items-end">
                <label className="min-w-0 flex-1 text-xs font-black text-violet-900">
                  Άλλο μέγεθος
                  <input
                    value={customSize}
                    onChange={(event) => setCustomSize(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        addCustomSize();
                      }
                    }}
                    placeholder="π.χ. 19,5cm ή ειδική τιμή"
                    className="mt-1.5 w-full rounded-xl border border-violet-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-violet-500"
                  />
                </label>
                <button type="button" onClick={addCustomSize} className={`${BTN_SECONDARY} justify-center`}>
                  <Plus size={16} aria-hidden="true" /> Προσθήκη ειδικού μεγέθους
                </button>
              </div>
            )}
          </section>

          <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,.7fr)]" aria-labelledby="posting-review-title">
            <label className="text-sm font-black text-slate-700">
              4. Αιτιολογία
              <textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                maxLength={500}
                rows={4}
                placeholder={mode === 'count' ? 'π.χ. Αρχική φυσική απογραφή 23/07/2026' : 'π.χ. Παραλαβή εκτός εντολής προμηθευτή'}
                className="mt-2 w-full resize-none rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-emerald-500"
              />
            </label>
            <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4">
              <h3 id="posting-review-title" className="flex items-center gap-2 text-sm font-black text-blue-900">
                <ClipboardList size={17} aria-hidden="true" /> Σύνοψη πριν από την υποβολή
              </h3>
              {preview.lines.length > 0 ? (
                <div className="mt-3 space-y-2">
                  {preview.lines.map((line) => {
                    const current = currentFor(line.warehouseId, line.sizeInfo);
                    const delta = mode === 'count' ? line.quantity - (current?.onHand || 0) : line.quantity;
                    return (
                      <div key={`${line.warehouseId}-${line.sizeInfo}`} className="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2 text-xs">
                        <span className="min-w-0 truncate font-semibold text-slate-700">
                          {selection?.displaySku}{line.sizeInfo ? ` · ${line.sizeInfo}` : ''} · {warehouses.find((warehouse) => warehouse.id === line.warehouseId)?.name}
                        </span>
                        <strong className={delta > 0 ? 'text-emerald-700' : delta < 0 ? 'text-rose-700' : 'text-slate-500'}>
                          {delta > 0 ? '+' : ''}{formatInventoryQuantity(delta)}
                        </strong>
                      </div>
                    );
                  })}
                  <p className="pt-1 text-xs font-bold text-blue-900">
                    {formatInventoryInteger(preview.lines.length)} {preview.lines.length === 1 ? 'γραμμή' : 'γραμμές'} θα καταχωριστούν σε μία ατομική συναλλαγή.
                  </p>
                </div>
              ) : (
                <p className="mt-2 text-xs leading-5 text-blue-900/75">
                  {selection ? preview.error : 'Επιλέξτε SKU και συμπληρώστε τουλάχιστον μία ποσότητα.'}
                </p>
              )}
            </div>
          </section>

          <div className="flex items-start gap-2 rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-xs leading-5 text-emerald-900">
            <CheckCircle2 size={17} className="mt-0.5 shrink-0" aria-hidden="true" />
            <p>Όλες οι επιλεγμένες αποθήκες και τα μεγέθη καταχωρίζονται μαζί. Αν αποτύχει μία γραμμή, δεν μεταβάλλεται καμία ποσότητα.</p>
          </div>
        </div>

        <footer className="grid gap-2 border-t border-slate-100 bg-white p-4 sm:grid-cols-[auto_1fr_1fr] sm:p-5">
          <button type="button" onClick={onClose} disabled={saving} className={`${BTN_SECONDARY} justify-center disabled:opacity-50`}>Ακύρωση</button>
          <button
            type="button"
            onClick={() => submit(true)}
            disabled={saving || !selection || preview.lines.length === 0 || !reason.trim()}
            className={`${BTN_SECONDARY} justify-center disabled:cursor-not-allowed disabled:opacity-45`}
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <ChevronRight size={16} />}
            Καταχώριση & επόμενο SKU
          </button>
          <button
            type="button"
            onClick={() => submit(false)}
            disabled={saving || !selection || preview.lines.length === 0 || !reason.trim()}
            className={`${BTN_PRIMARY} justify-center disabled:cursor-not-allowed disabled:opacity-45`}
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <ClipboardList size={16} />}
            Καταχώριση
          </button>
        </footer>
      </section>
    </div>
  );
}
