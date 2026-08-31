import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Loader2, Plus, Wrench, X } from 'lucide-react';
import type { Product, RepairItem, RepairOriginType } from '../../types';
import SkuProductPicker from '../legal/SkuProductPicker';
import SkuColorizedText from '../SkuColorizedText';
import RepairBadge from './RepairBadge';
import CustomerSearchSelect from './CustomerSearchSelect';
import {
  REPAIR_INTAKE_DRAFT_STORAGE_KEY,
  REPAIR_ORIGIN_LABELS,
  createEmptyRepairDraftRow,
  draftRowFromPreviousRepair,
  formatGreekDateOnly,
  parseRepairIntakeDraft,
  serializeRepairIntakeDraft,
  toRepairIntakeInput,
  validateRepairDraftRows,
  type RepairDraftRow,
  type RepairIntakeInput,
} from '../../features/customerService';
import { formatOrderId } from '../../utils/orderUtils';
import { BTN_PRIMARY, BTN_SECONDARY, CARD } from '../ui/designTokens';
import { useEscapeToClose } from '../../hooks/useEscapeToClose';

export type RepairConsignmentSaleOption = {
  id: string;
  customerId: string;
  sku: string;
  variantSuffix: string;
  sizeInfo: string;
  soldAt: string;
};

interface Props {
  customers: Array<{ id: string; full_name: string }>;
  products: Product[];
  orders: any[];
  consignmentSales: RepairConsignmentSaleOption[];
  previousRepairItem?: RepairItem | null;
  defaultSellerId?: string;
  onClose: () => void;
  onSubmit: (input: RepairIntakeInput) => Promise<void>;
  saving: boolean;
}

const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-emerald-400 focus:ring-4 focus:ring-emerald-500/10';

export default function RepairIntakeWorkbench({
  customers,
  products,
  orders,
  consignmentSales,
  previousRepairItem,
  defaultSellerId,
  onClose,
  onSubmit,
  saving,
}: Props) {
  const [customerId, setCustomerId] = useState(previousRepairItem?.customer_id || '');
  const [notes, setNotes] = useState('');
  const [rows, setRows] = useState<RepairDraftRow[]>(() => [
    previousRepairItem ? draftRowFromPreviousRepair(previousRepairItem) : createEmptyRepairDraftRow(),
  ]);
  const [submitAttempted, setSubmitAttempted] = useState(false);

  useEscapeToClose(onClose, saving);

  useEffect(() => {
    if (previousRepairItem) return;
    const restored = parseRepairIntakeDraft(window.localStorage.getItem(REPAIR_INTAKE_DRAFT_STORAGE_KEY));
    if (restored && (restored.customerId || restored.rows.some((row) => row.sku || row.description))) {
      setCustomerId(restored.customerId);
      setNotes(restored.notes);
      setRows(restored.rows);
    }
  }, [previousRepairItem]);

  useEffect(() => {
    if (previousRepairItem) return;
    window.localStorage.setItem(REPAIR_INTAKE_DRAFT_STORAGE_KEY, serializeRepairIntakeDraft({ customerId, notes, rows }));
  }, [customerId, notes, previousRepairItem, rows]);

  const catalogSkus = useMemo(() => new Set(products.map((product) => product.sku)), [products]);
  const customerOrders = useMemo(() => orders.filter((order) => order.customer_id === customerId), [customerId, orders]);
  const customerConsignmentSales = useMemo(
    () => consignmentSales.filter((sale) => sale.customerId === customerId),
    [consignmentSales, customerId],
  );
  const purchaseChips = useMemo(() => {
    const seen = new Set<string>();
    const chips: Array<{ key: string; sku: string; variantSuffix: string; sizeInfo: string; source: 'order' | 'consignment'; orderId?: string; orderLineId?: string; settlementId?: string }> = [];
    for (const order of customerOrders) {
      for (const item of order.items || []) {
        const key = `${item.sku}|${item.variant_suffix || ''}|${item.line_id || ''}`;
        if (seen.has(key)) continue;
        seen.add(key);
        chips.push({
          key,
          sku: item.sku,
          variantSuffix: item.variant_suffix || '',
          sizeInfo: item.size_info || '',
          source: 'order',
          orderId: order.id,
          orderLineId: item.line_id || '',
        });
      }
    }
    for (const sale of customerConsignmentSales) {
      const key = `consign|${sale.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      chips.push({
        key,
        sku: sale.sku,
        variantSuffix: sale.variantSuffix,
        sizeInfo: sale.sizeInfo,
        source: 'consignment',
        settlementId: sale.id,
      });
    }
    return chips.slice(0, 16);
  }, [customerConsignmentSales, customerOrders]);
  const sortedProducts = useMemo(() => {
    const purchased = new Set(purchaseChips.map((chip) => chip.sku));
    return [...products].sort((a, b) => Number(purchased.has(b.sku)) - Number(purchased.has(a.sku)) || a.sku.localeCompare(b.sku));
  }, [products, purchaseChips]);
  const issues = useMemo(() => validateRepairDraftRows(customerId, rows, catalogSkus), [catalogSkus, customerId, rows]);

  const update = (id: string, patch: Partial<RepairDraftRow>) => {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };

  const applyPurchaseChip = (rowId: string, chip: (typeof purchaseChips)[number]) => {
    update(rowId, {
      originType: 'recorded_sale',
      sku: chip.sku,
      variantSuffix: chip.variantSuffix,
      sizeInfo: chip.sizeInfo,
      orderId: chip.orderId || '',
      orderLineId: chip.orderLineId || '',
      sourceConsignmentSettlementId: chip.settlementId || '',
    });
  };

  const submit = async () => {
    setSubmitAttempted(true);
    if (issues.length > 0) return;
    await onSubmit(toRepairIntakeInput(customerId, rows, { sellerId: defaultSellerId || null, notes: notes || null }));
    window.localStorage.removeItem(REPAIR_INTAKE_DRAFT_STORAGE_KEY);
  };

  return (
    <div className="fixed inset-0 z-[190] flex flex-col bg-slate-50 print:hidden" role="dialog" aria-modal="true" aria-label="Παραλαβή Επισκευών">
      <header className="shrink-0 border-b border-slate-200 bg-white px-4 py-4 shadow-sm sm:px-6">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#060b00] text-white">
              <Wrench size={20} />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-black tracking-tight text-[#060b00]">Παραλαβή Επισκευών</h2>
                <RepairBadge compact />
              </div>
              <p className="mt-0.5 text-sm font-medium text-slate-500">
                Ένας πελάτης, πολλά φυσικά τεμάχια. Κάθε τεμάχιο παίρνει δικό του κωδικό, QR και παρτίδα Παραγωγής.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={BTN_SECONDARY} onClick={onClose} disabled={saving}>Ακύρωση</button>
            <button type="button" className={BTN_PRIMARY} disabled={saving} onClick={submit}>
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
              Οριστικοποίηση παραλαβής
            </button>
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto grid max-w-[1600px] gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_280px] sm:p-6">
          <div className="space-y-4">
            {previousRepairItem && (
              <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
                <strong>Συνδεδεμένη επανεπισκευή:</strong> το νέο δελτίο θα συνδεθεί με το κλεισμένο {previousRepairItem.code}, χωρίς να το ξανανοίξει.
              </div>
            )}

            <section className={`${CARD} p-4`}>
              <div className="mb-3 text-[10px] font-black uppercase tracking-widest text-slate-400">Παραλαβή</div>
              <div className="grid gap-3 md:grid-cols-2">
                <label>
                  <span className="mb-1 block text-[11px] font-bold text-slate-500">Πελάτης *</span>
                  <CustomerSearchSelect
                    customers={customers}
                    value={customerId}
                    onChange={setCustomerId}
                    disabled={Boolean(previousRepairItem)}
                  />
                </label>
                <label>
                  <span className="mb-1 block text-[11px] font-bold text-slate-500">Κοινή σημείωση</span>
                  <input className={inputClass} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Προαιρετική σημείωση για όλα τα τεμάχια" />
                </label>
              </div>
            </section>

            {rows.map((row, index) => {
              const selectedOrder = customerOrders.find((order) => order.id === row.orderId);
              return (
                <section key={row.id} className={`${CARD} overflow-hidden`}>
                  <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-white px-4 py-3">
                    <div className="flex items-center gap-2">
                      <h3 className="font-black text-slate-800">Τεμάχιο {index + 1}</h3>
                      <RepairBadge compact />
                    </div>
                    {rows.length > 1 && !previousRepairItem && (
                      <button type="button" className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600" onClick={() => setRows((current) => current.filter((item) => item.id !== row.id))} aria-label="Αφαίρεση τεμαχίου">
                        <X size={16} />
                      </button>
                    )}
                  </div>
                  <div className="space-y-4 p-4">
                    <div>
                      <span className="mb-1.5 block text-[11px] font-bold text-slate-500">Προέλευση *</span>
                      <div className="flex flex-wrap gap-1.5">
                        {(Object.entries(REPAIR_ORIGIN_LABELS) as Array<[RepairOriginType, string]>).map(([key, label]) => (
                          <button
                            key={key}
                            type="button"
                            onClick={() => update(row.id, { originType: key, orderId: '', orderLineId: '', sourceConsignmentSettlementId: '' })}
                            className={`rounded-xl px-3 py-2 text-left text-[11px] font-black transition ${
                              row.originType === key
                                ? 'bg-[#060b00] text-white'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {row.originType === 'recorded_sale' && (
                      <div className="grid gap-3 md:grid-cols-2">
                        <label>
                          <span className="mb-1 block text-[11px] font-bold text-slate-500">Προηγούμενη παραγγελία</span>
                          <select className={inputClass} value={row.orderId} onChange={(event) => update(row.id, { orderId: event.target.value, orderLineId: '', sourceConsignmentSettlementId: '' })}>
                            <option value="">Καμία παραγγελία</option>
                            {customerOrders.map((order) => (
                              <option key={order.id} value={order.id}>#{formatOrderId(order.id)} · {formatGreekDateOnly(order.created_at)}</option>
                            ))}
                          </select>
                        </label>
                        <label>
                          <span className="mb-1 block text-[11px] font-bold text-slate-500">Πώληση Παρακαταθήκης</span>
                          <select
                            className={inputClass}
                            value={row.sourceConsignmentSettlementId}
                            onChange={(event) => {
                              const sale = customerConsignmentSales.find((entry) => entry.id === event.target.value);
                              update(row.id, {
                                sourceConsignmentSettlementId: event.target.value,
                                orderId: '',
                                orderLineId: '',
                                sku: sale?.sku || row.sku,
                                variantSuffix: sale?.variantSuffix || '',
                                sizeInfo: sale?.sizeInfo || '',
                              });
                            }}
                          >
                            <option value="">Καμία πώληση Παρακαταθήκης</option>
                            {customerConsignmentSales.map((sale) => (
                              <option key={sale.id} value={sale.id}>{sale.sku}{sale.variantSuffix} · {formatGreekDateOnly(sale.soldAt)}</option>
                            ))}
                          </select>
                        </label>
                        {selectedOrder && (
                          <label className="md:col-span-2">
                            <span className="mb-1 block text-[11px] font-bold text-slate-500">Γραμμή πώλησης</span>
                            <select
                              className={inputClass}
                              value={row.orderLineId}
                              onChange={(event) => {
                                const item = selectedOrder.items?.find((entry: any) => entry.line_id === event.target.value);
                                update(row.id, {
                                  orderLineId: event.target.value,
                                  sku: item?.sku || row.sku,
                                  variantSuffix: item?.variant_suffix || '',
                                  sizeInfo: item?.size_info || '',
                                });
                              }}
                            >
                              <option value="">Επιλέξτε…</option>
                              {selectedOrder.items?.map((item: any) => (
                                <option key={item.line_id} value={item.line_id}>{item.sku}{item.variant_suffix || ''}</option>
                              ))}
                            </select>
                          </label>
                        )}
                      </div>
                    )}

                    <div>
                      <span className="mb-1 block text-[11px] font-bold text-slate-500">SKU (προαιρετικό αν δεν υπάρχει καταχώριση)</span>
                      <div className="flex items-center gap-2">
                        <SkuProductPicker
                          sku={row.sku}
                          variantSuffix={row.variantSuffix}
                          products={sortedProducts}
                          onSelect={(selection) => update(row.id, { sku: selection.sku, variantSuffix: selection.variant_suffix || '' })}
                          placeholder="SKU, πλήρης παραλλαγή ή barcode…"
                          inputClassName="min-h-[42px]"
                          className="flex-1"
                          catalogOnly={row.originType === 'recorded_sale'}
                        />
                        {row.sku && (
                          <button type="button" className={BTN_SECONDARY} onClick={() => update(row.id, { sku: '', variantSuffix: '', sizeInfo: '' })} aria-label="Αφαίρεση SKU">
                            <X size={15} />
                          </button>
                        )}
                      </div>
                      {purchaseChips.length > 0 && (
                        <div className="mt-2">
                          <div className="mb-1 text-[10px] font-black uppercase tracking-widest text-slate-400">Από αγορές του πελάτη</div>
                          <div className="flex flex-wrap gap-1.5">
                            {purchaseChips.map((chip) => (
                              <button
                                key={chip.key}
                                type="button"
                                onClick={() => applyPurchaseChip(row.id, chip)}
                                className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-left hover:border-blue-200 hover:bg-blue-50"
                              >
                                <SkuColorizedText sku={chip.sku} suffix={chip.variantSuffix} className="text-[11px] font-black" />
                                <span className="ml-1 text-[9px] font-bold text-slate-400">{chip.source === 'consignment' ? 'Παρακαταθήκη' : 'Παραγγελία'}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    <label>
                      <span className="mb-1 block text-[11px] font-bold text-slate-500">Περιγραφή βλάβης *</span>
                      <textarea className={`${inputClass} min-h-20`} value={row.description} onChange={(event) => update(row.id, { description: event.target.value })} placeholder="Τι χρειάζεται επισκευή;" />
                    </label>
                    <div className="grid gap-3 md:grid-cols-2">
                      <label>
                        <span className="mb-1 block text-[11px] font-bold text-slate-500">Κατάσταση παραλαβής</span>
                        <input className={inputClass} value={row.intakeCondition} onChange={(event) => update(row.id, { intakeCondition: event.target.value })} placeholder="Γρατζουνιές, φθορά…" />
                      </label>
                      <label>
                        <span className="mb-1 block text-[11px] font-bold text-slate-500">Παρελκόμενα</span>
                        <input className={inputClass} value={row.accessories} onChange={(event) => update(row.id, { accessories: event.target.value })} placeholder="Κουτί, αλυσίδα…" />
                      </label>
                    </div>
                  </div>
                </section>
              );
            })}

            {!previousRepairItem && (
              <button type="button" className={`${BTN_SECONDARY} w-full justify-center py-3`} onClick={() => setRows((current) => [...current, createEmptyRepairDraftRow()])}>
                <Plus size={16} /> Προσθήκη τεμαχίου
              </button>
            )}
          </div>

          <aside className="space-y-3 lg:sticky lg:top-4 lg:self-start">
            <div className={`${CARD} p-4`}>
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Σύνοψη παραλαβής</div>
              <div className="mt-3 space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-slate-500">Τεμάχια</span><span className="font-black">{rows.length}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Με SKU</span><span className="font-black">{rows.filter((row) => row.sku).length}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Με περιγραφή</span><span className="font-black">{rows.filter((row) => row.description.trim()).length}</span></div>
              </div>
              <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
                Τα τεμάχια παραμένουν περιουσία του πελάτη και δεν μπαίνουν στο εταιρικό απόθεμα. Υλικά που θα καταναλωθούν αργότερα αφαιρούνται κανονικά.
              </p>
            </div>
            {submitAttempted && issues.length > 0 && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                <div className="mb-2 flex items-center gap-2 font-black"><AlertTriangle size={16} /> Έλεγχος πριν την αποθήκευση</div>
                <ul className="list-disc space-y-1 pl-5 text-xs font-bold">
                  {issues.map((issue) => <li key={issue}>{issue}</li>)}
                </ul>
              </div>
            )}
            <p className="px-1 text-[11px] leading-relaxed text-slate-500">
              Το τοπικό πρόχειρο διατηρείται μέχρι επιτυχή οριστικοποίηση. Η κίνηση απαιτεί σύνδεση.
            </p>
          </aside>
        </div>
      </div>
    </div>
  );
}
