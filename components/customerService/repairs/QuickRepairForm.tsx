import { useRestartDraft } from '../../../hooks/useRestartBlocker';
import React, { useMemo, useState } from 'react';
import { ChevronDown, Loader2, Plus, Trash2, Wrench, X } from 'lucide-react';
import type { RepairItem, RepairOriginType } from '../../../types';
import SkuProductPicker from '../../legal/SkuProductPicker';
import SkuColorizedText from '../../SkuColorizedText';
import CustomerSearchSelect from '../CustomerSearchSelect';
import { formatOrderId } from '../../../utils/orderUtils';
import {
  buildPurchaseChips,
  createEmptyRepairDraftRow,
  draftRowFromPreviousRepair,
  formatGreekDateOnly,
  formatGreekNumber,
  toRepairIntakeInput,
  validateRepairDraftRows,
  type PurchaseChip,
  type RepairDraftRow,
} from '../../../features/customerService';
import type { ServiceController } from '../useServiceController';
import { ACTION_PRIMARY, ACTION_QUIET, ChoicePills, Field, SERVICE_INPUT, ServiceModal } from '../shared/serviceUi';

const QUICK_FAULTS = ['Κόλληση', 'Κούμπωμα', 'Αλλαγή μεγέθους', 'Γυάλισμα', 'Πέτρα', 'Επιμετάλλωση', 'Αλυσίδα'];

const ORIGIN_OPTIONS: Array<{ value: RepairOriginType; label: string; hint: string }> = [
  { value: 'recorded_sale', label: 'Αγορά από εμάς', hint: 'Υπάρχει παραγγελία ή πώληση Παρακαταθήκης' },
  { value: 'legacy_own', label: 'Δικό μας (παλιό)', hint: 'Δικό μας προϊόν χωρίς καταγεγραμμένη πώληση' },
  { value: 'third_party', label: 'Άλλου κατασκευαστή', hint: 'Δεν είναι δικό μας προϊόν' },
];

function newRow(): RepairDraftRow {
  return createEmptyRepairDraftRow({ originType: 'legacy_own' });
}

interface Props {
  ctl: ServiceController;
  presetCustomerId?: string;
  /** Κλειδώνει τον πελάτη (π.χ. όταν ανοίγει από την καρτέλα πελάτη). */
  lockCustomer?: boolean;
  previousRepairItem?: RepairItem | null;
  onClose: () => void;
}

export default function QuickRepairForm({ ctl, presetCustomerId, lockCustomer = false, previousRepairItem, onClose }: Props) {
  const [customerId, setCustomerId] = useState(previousRepairItem?.customer_id || presetCustomerId || '');
  const [rows, setRows] = useState<RepairDraftRow[]>(() => [previousRepairItem ? draftRowFromPreviousRepair(previousRepairItem) : newRow()]);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
    useRestartDraft('Παραλαβή επισκευής', { customerId, rows, notes }, { busy: saving });

  const isRework = Boolean(previousRepairItem);

  const catalogSkus = useMemo(() => new Set(ctl.products.map((product) => product.sku)), [ctl.products]);
  const chips = useMemo(() => buildPurchaseChips(customerId, ctl.orders, ctl.consignmentSaleOptions, 12), [ctl.consignmentSaleOptions, ctl.orders, customerId]);
  const customerOrders = useMemo(() => ctl.orders.filter((order: any) => order.customer_id === customerId), [ctl.orders, customerId]);
  const issues = useMemo(() => validateRepairDraftRows(customerId, rows, catalogSkus), [catalogSkus, customerId, rows]);

  const update = (id: string, patch: Partial<RepairDraftRow>) => setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  const applyChip = (id: string, chip: PurchaseChip) => update(id, {
    originType: 'recorded_sale',
    sku: chip.sku,
    variantSuffix: chip.variantSuffix,
    sizeInfo: chip.sizeInfo,
    orderId: chip.orderId || '',
    orderLineId: chip.orderLineId || '',
    sourceConsignmentSettlementId: chip.settlementId || '',
  });
  const appendFault = (row: RepairDraftRow, fault: string) => {
    const text = row.description.trim();
    update(row.id, { description: text ? `${text}${/[,.:]$/.test(text) ? '' : ','} ${fault.toLocaleLowerCase('el-GR')}` : fault });
  };

  const submit = async () => {
    if (issues.length > 0) return;
    setSaving(true);
    try {
      const ok = await ctl.createRepairIntake(toRepairIntakeInput(customerId, rows, { sellerId: ctl.defaultSellerId || null, notes: notes || null }));
      if (ok) onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <ServiceModal
      title={isRework ? `Επανεπισκευή μετά από ${previousRepairItem?.code}` : 'Παραλαβή επισκευής'}
      subtitle={isRework ? 'Νέο δελτίο συνδεδεμένο με την προηγούμενη επισκευή.' : 'Κάθε τεμάχιο παίρνει δικό του κωδικό και μπαίνει αυτόματα στην Παραγωγή.'}
      icon={<Wrench size={18} />}
      onClose={onClose}
      busy={saving}
      size="lg"
      footer={(
        <>
          <div className="mr-auto min-w-0 text-xs">
            {issues.length > 0 ? <span className="font-bold text-slate-400">{issues[0]}</span> : <span className="font-black text-slate-700">{formatGreekNumber(rows.length)} {rows.length === 1 ? 'τεμάχιο' : 'τεμάχια'}</span>}
          </div>
          <button type="button" className={ACTION_QUIET} onClick={onClose} disabled={saving}>Άκυρο</button>
          <button type="button" className={`${ACTION_PRIMARY}`} onClick={submit} disabled={saving || issues.length > 0}>
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Wrench size={15} />} Παραλαβή
          </button>
        </>
      )}
    >
      <div className="space-y-5">
        <Field label="Πελάτης">
          <CustomerSearchSelect customers={ctl.customers} value={customerId} onChange={setCustomerId} disabled={isRework || lockCustomer} />
        </Field>

        {rows.map((row, index) => {
          const open = expanded[row.id] ?? false;
          const linked = row.originType === 'recorded_sale' && (row.orderId || row.sourceConsignmentSettlementId);
          const selectedOrder = customerOrders.find((order: any) => order.id === row.orderId);
          return (
            <section key={row.id} className="rounded-2xl border border-slate-200 bg-slate-50/50 p-3">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-xs font-black uppercase tracking-wide text-slate-500">{rows.length > 1 ? `Τεμάχιο ${index + 1}` : 'Τεμάχιο'}</h3>
                {rows.length > 1 && <button type="button" className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600" onClick={() => setRows((current) => current.filter((item) => item.id !== row.id))} aria-label="Αφαίρεση τεμαχίου"><Trash2 size={14} /></button>}
              </div>

              {!isRework && chips.length > 0 && !linked && (
                <div className="mb-3">
                  <div className="mb-1.5 text-[11px] font-bold text-slate-500">Αγόρασε από εμάς; Διαλέξτε το:</div>
                  <div className="flex flex-wrap gap-1.5">
                    {chips.map((chip) => (
                      <button key={chip.key} type="button" onClick={() => applyChip(row.id, chip)} className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-left transition hover:border-slate-300 hover:bg-slate-50">
                        <SkuColorizedText sku={chip.sku} suffix={chip.variantSuffix} className="text-[11px] font-black" />
                        <span className="ml-1 text-[9px] font-bold text-slate-400">{chip.source === 'consignment' ? 'Παρακ.' : chip.orderId ? `#${formatOrderId(chip.orderId)}` : ''}{chip.date ? ` · ${formatGreekDateOnly(chip.date)}` : ''}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {linked ? (
                <div className="mb-3 flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                  <div className="min-w-0 text-xs text-slate-700">
                    {row.sku && <SkuColorizedText sku={row.sku} suffix={row.variantSuffix} className="font-black" />}
                    <span className="ml-1.5 text-slate-500">{row.orderId ? `από παραγγελία #${formatOrderId(row.orderId)}` : 'από πώληση Παρακαταθήκης'}</span>
                  </div>
                  {!isRework && <button type="button" className="rounded-lg p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700" aria-label="Αλλαγή" onClick={() => update(row.id, { originType: 'legacy_own', orderId: '', orderLineId: '', sourceConsignmentSettlementId: '', sku: '', variantSuffix: '', sizeInfo: '' })}><X size={14} /></button>}
                </div>
              ) : (
                <div className="mb-3 space-y-3">
                  <ChoicePills size="sm" value={row.originType} onChange={(originType) => update(row.id, { originType, orderId: '', orderLineId: '', sourceConsignmentSettlementId: '' })} options={ORIGIN_OPTIONS} />
                  {row.originType === 'recorded_sale' && (
                    <div className="grid gap-2 sm:grid-cols-2">
                      <select className={SERVICE_INPUT} value={row.orderId} onChange={(event) => update(row.id, { orderId: event.target.value, orderLineId: '' })} aria-label="Παραγγελία">
                        <option value="">{customerId ? (customerOrders.length ? 'Επιλέξτε παραγγελία…' : 'Ο πελάτης δεν έχει παραγγελίες') : 'Επιλέξτε πρώτα πελάτη'}</option>
                        {customerOrders.map((order: any) => <option key={order.id} value={order.id}>#{formatOrderId(order.id)} · {formatGreekDateOnly(order.created_at)}</option>)}
                      </select>
                      {selectedOrder && (
                        <select className={SERVICE_INPUT} value={row.orderLineId} aria-label="Γραμμή παραγγελίας" onChange={(event) => {
                          const line = selectedOrder.items?.find((entry: any) => entry.line_id === event.target.value);
                          update(row.id, { orderLineId: event.target.value, sku: line?.sku || row.sku, variantSuffix: line?.variant_suffix || '', sizeInfo: line?.size_info || '' });
                        }}>
                          <option value="">Ποιο προϊόν;</option>
                          {selectedOrder.items?.map((line: any) => <option key={line.line_id} value={line.line_id}>{line.sku}{line.variant_suffix || ''}</option>)}
                        </select>
                      )}
                    </div>
                  )}
                  {row.originType !== 'recorded_sale' && (
                    <SkuProductPicker
                      sku={row.sku}
                      variantSuffix={row.variantSuffix}
                      products={ctl.products}
                      onSelect={(selection) => update(row.id, { sku: selection.sku, variantSuffix: selection.variant_suffix || '' })}
                      placeholder={row.originType === 'third_party' ? 'Κωδικός (προαιρετικά)' : 'SKU αν το γνωρίζετε (προαιρετικά)'}
                      inputClassName="min-h-[40px]"
                    />
                  )}
                </div>
              )}

              <Field label="Τι χρειάζεται; *">
                <textarea className={`${SERVICE_INPUT} min-h-[72px]`} value={row.description} onChange={(event) => update(row.id, { description: event.target.value })} placeholder="π.χ. σπασμένο κούμπωμα, χαλαρή πέτρα…" />
              </Field>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {QUICK_FAULTS.map((fault) => (
                  <button key={fault} type="button" onClick={() => appendFault(row, fault)} className="rounded-md bg-white px-2 py-0.5 text-[10px] font-bold text-slate-500 ring-1 ring-slate-200 hover:bg-slate-100 hover:text-slate-800">+ {fault}</button>
                ))}
              </div>

              <button type="button" className="mt-3 inline-flex items-center gap-1 text-[11px] font-bold text-slate-500 hover:text-slate-800" onClick={() => setExpanded((current) => ({ ...current, [row.id]: !open }))}>
                <ChevronDown size={13} className={`transition ${open ? 'rotate-180' : ''}`} /> Κατάσταση, παρελκόμενα, μέγεθος
              </button>
              {open && (
                <div className="mt-2 grid gap-2 sm:grid-cols-3">
                  <input className={SERVICE_INPUT} value={row.intakeCondition} onChange={(event) => update(row.id, { intakeCondition: event.target.value })} placeholder="Κατάσταση (γρατζουνιές…)" aria-label="Κατάσταση παραλαβής" />
                  <input className={SERVICE_INPUT} value={row.accessories} onChange={(event) => update(row.id, { accessories: event.target.value })} placeholder="Μαζί με (κουτί…)" aria-label="Παρελκόμενα" />
                  <input className={SERVICE_INPUT} value={row.sizeInfo} onChange={(event) => update(row.id, { sizeInfo: event.target.value })} placeholder="Μέγεθος" aria-label="Μέγεθος" />
                </div>
              )}
            </section>
          );
        })}

        {!isRework && (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button type="button" className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-100" onClick={() => setRows((current) => [...current, newRow()])}><Plus size={14} /> Κι άλλο τεμάχιο από τον ίδιο πελάτη</button>
            <input className={`${SERVICE_INPUT} sm:w-72`} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Κοινή σημείωση (προαιρετικά)" />
          </div>
        )}
      </div>
    </ServiceModal>
  );
}
