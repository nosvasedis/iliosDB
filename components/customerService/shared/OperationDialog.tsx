import React, { useMemo, useState } from 'react';
import {
  Banknote,
  CheckCircle2,
  Loader2,
  PackageCheck,
  PauseCircle,
  RotateCcw,
  Undo2,
  Wallet,
  Wrench,
  XCircle,
} from 'lucide-react';
import { ProductionStage } from '../../../types';
import { SYSTEM_IDS } from '../../../lib/supabase';
import { PRODUCTION_STAGES } from '../../../utils/productionStages';
import { getCatalogSelectionPricing } from '../../../utils/skuProductPicker';
import SkuProductPicker from '../../legal/SkuProductPicker';
import { REPAIR_COST_TYPE_LABELS, consignmentSaleTotal, formatGreekMoney, repairOutstanding } from '../../../features/customerService';
import type { ServiceController, ServiceOperation } from '../useServiceController';
import SettleConsignmentModal from '../consignments/SettleConsignmentModal';
import ConsignmentOfferDialog from '../consignments/ConsignmentOfferDialog';
import DeleteConsignmentDialog from '../consignments/DeleteConsignmentDialog';
import { ACTION_PRIMARY, ACTION_QUIET, ChoicePills, DANGER_BUTTON, Field, SERVICE_INPUT, ServiceModal } from './serviceUi';

const PAYMENT_METHODS = ['Μετρητά', 'Κάρτα', 'Τράπεζα', 'Άλλο'] as const;

function money(value: number): number {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function Footer({ busy, onCancel, onSubmit, label, disabled, danger = false, icon }: { busy: boolean; onCancel: () => void; onSubmit: () => void; label: string; disabled?: boolean; danger?: boolean; icon?: React.ReactNode }) {
  return (
    <>
      <button type="button" className={ACTION_QUIET} onClick={onCancel} disabled={busy}>Άκυρο</button>
      <button type="button" className={`${danger ? DANGER_BUTTON : ACTION_PRIMARY}`} onClick={onSubmit} disabled={busy || disabled}>
        {busy ? <Loader2 size={15} className="animate-spin" /> : icon}
        {label}
      </button>
    </>
  );
}

function QuantityStepper({ value, max, onChange }: { value: number; max?: number; onChange: (value: number) => void }) {
  const clamp = (next: number) => Math.max(1, max ? Math.min(max, next) : next);
  return (
    <div className="flex items-center gap-2">
      <button type="button" className="h-10 w-10 rounded-xl border border-slate-200 bg-white text-lg font-black text-slate-600 hover:bg-slate-50" onClick={() => onChange(clamp(value - 1))} aria-label="Μείωση">−</button>
      <input type="number" min={1} max={max} className={`${SERVICE_INPUT} w-20 text-center font-black`} value={value} onChange={(event) => onChange(clamp(Number(event.target.value) || 1))} />
      <button type="button" className="h-10 w-10 rounded-xl border border-slate-200 bg-white text-lg font-black text-slate-600 hover:bg-slate-50" onClick={() => onChange(clamp(value + 1))} aria-label="Αύξηση">+</button>
      {max != null && max > 1 && (
        <button type="button" className="ml-1 text-xs font-bold text-slate-500 underline-offset-2 hover:underline" onClick={() => onChange(max)}>όλα ({max})</button>
      )}
    </div>
  );
}

export default function OperationDialog({ ctl }: { ctl: ServiceController }) {
  const operation = ctl.operation;
  if (!operation) return null;
  if (operation.kind === 'offer') return <ConsignmentOfferDialog key={operation.entry.id} ctl={ctl} entry={operation.entry} />;
  if (operation.kind === 'delete-consignment') return <DeleteConsignmentDialog key={operation.entry.id} ctl={ctl} entry={operation.entry} />;
  if (operation.kind === 'settle') return <SettleConsignmentModal ctl={ctl} entry={operation.entry} />;
  const targetId = 'line' in operation ? operation.line.id
    : 'settlement' in operation ? operation.settlement.id
      : 'item' in operation ? operation.item.id
        : operation.entry.id;
  return <SingleOperation key={`${operation.kind}:${targetId}`} ctl={ctl} operation={operation} />;
}

function SingleOperation({ ctl, operation }: { ctl: ServiceController; operation: Exclude<ServiceOperation, { kind: 'settle' | 'offer' | 'delete-consignment' }> }) {
  const close = () => ctl.setOperation(null);
  const [busy, setBusy] = useState(false);
  const run = async (task: () => Promise<boolean | void>) => {
    setBusy(true);
    try { await task(); } finally { setBusy(false); }
  };
  const { actions, safeAction } = ctl;

  switch (operation.kind) {
    case 'sale':
      return <SaleDialog ctl={ctl} operation={operation} busy={busy} close={close} run={run} />;
    case 'payment': {
      const outstanding = money(Number(operation.settlement.total_amount) - Number(operation.settlement.paid_amount));
      return <PaymentDialog outstanding={outstanding} busy={busy} close={close} onSubmit={(amount, method, notes) => run(() => safeAction(() => actions.recordConsignmentPayment.mutateAsync({ settlementId: operation.settlement.id, amount, method, notes }), 'Η είσπραξη καταχωρίστηκε.'))} />;
    }
    case 'return':
      return <ReturnDialog max={operation.line.pending_quantity} busy={busy} close={close} onSubmit={(quantity, notes) => run(() => safeAction(() => actions.receiveConsignmentReturn.mutateAsync({ lineId: operation.line.id, quantity, notes }), 'Η επιστροφή παραλήφθηκε και περιμένει έλεγχο.'))} />;
    case 'route-return':
      return <RouteReturnDialog ctl={ctl} quantity={operation.item.quantity} busy={busy} close={close} onSubmit={(resolution, warehouseId, reason) => run(() => safeAction(() => actions.routeConsignmentReturn.mutateAsync({ returnId: operation.item.id, resolution, destinationWarehouseId: warehouseId, reason }), 'Η επιστροφή τακτοποιήθηκε.'))} />;
    case 'price':
      return <PriceDialog current={Number(operation.line.locked_unit_price)} busy={busy} close={close} onSubmit={(unitPrice, reason) => run(() => safeAction(() => actions.overrideConsignmentPrice.mutateAsync({ lineId: operation.line.id, unitPrice, reason }), 'Η τιμή ενημερώθηκε.'))} />;
    case 'reverse-sale':
      return <ReasonDialog title="Αντιστροφή πώλησης" text="Η πώληση ακυρώνεται και τα τεμάχια επιστρέφουν «στον πελάτη»." confirmLabel="Αντιστροφή" danger busy={busy} close={close} onSubmit={(reason) => run(() => safeAction(() => actions.reverseConsignmentSettlement.mutateAsync({ settlementId: operation.settlement.id, reason }), 'Η πώληση αντιστράφηκε.'))} />;
    case 'reverse-return':
      return <ReasonDialog title="Αντιστροφή επιστροφής" text="Η επιστροφή ακυρώνεται και τα τεμάχια ξαναγράφονται «στον πελάτη»." confirmLabel="Αντιστροφή" danger busy={busy} close={close} onSubmit={(reason) => run(() => safeAction(() => actions.reverseConsignmentReturn.mutateAsync({ returnId: operation.item.id, reason }), 'Η επιστροφή αντιστράφηκε.'))} />;
    case 'cancel-consignment':
      return <ReasonDialog title={`Ακύρωση ${operation.entry.code}`} text="Η Παρακαταθήκη δεν έχει παραδοθεί ακόμη· η ακύρωση δεν επηρεάζει το απόθεμα." confirmLabel="Ακύρωση Παρακαταθήκης" danger busy={busy} close={close} onSubmit={(reason) => run(() => safeAction(() => actions.cancelConsignment.mutateAsync({ consignmentId: operation.entry.id, reason }), 'Η Παρακαταθήκη ακυρώθηκε.'))} />;
    case 'quality':
      return operation.passed
        ? <ReasonDialog title={`Έγκριση ${operation.item.code}`} text="Η επισκευή περνά τον έλεγχο και γίνεται «Έτοιμη για παράδοση»." confirmLabel="Εγκρίνεται" optional icon={<CheckCircle2 size={15} />} busy={busy} close={close} onSubmit={(notes) => run(() => safeAction(() => actions.completeRepairQualityCheck.mutateAsync({ repairItemId: operation.item.id, passed: true, notes }), 'Η επισκευή εγκρίθηκε και είναι έτοιμη.'))} />
        : <ReworkDialog code={operation.item.code} busy={busy} close={close} onSubmit={(stage, notes) => run(() => safeAction(() => actions.completeRepairQualityCheck.mutateAsync({ repairItemId: operation.item.id, passed: false, notes, returnStage: stage }), 'Η επισκευή επέστρεψε στην Παραγωγή για επανεργασία.'))} />;
    case 'cost':
      return <CostDialog ctl={ctl} busy={busy} close={close} onSubmit={(payload) => run(() => safeAction(() => actions.recordRepairCost.mutateAsync({ repairItemId: operation.item.id, ...payload }), 'Το κόστος καταχωρίστηκε.'))} />;
    case 'charge':
      return <ChargeDialog ctl={ctl} itemId={operation.item.id} code={operation.item.code} busy={busy} close={close} run={run} />;
    case 'deliver':
      return <DeliverDialog ctl={ctl} operation={operation} busy={busy} close={close} run={run} />;
    case 'exception': {
      const meta = {
        on_hold: { title: 'Σε αναμονή', text: 'Η επισκευή παγώνει μέχρι να τη συνεχίσετε.', label: 'Σε αναμονή', icon: <PauseCircle size={15} />, danger: false },
        irreparable: { title: 'Μη επισκευάσιμο', text: 'Η επισκευή κλείνει ως μη επισκευάσιμη. Το τεμάχιο επιστρέφεται στον πελάτη ως έχει.', label: 'Μη επισκευάσιμο', icon: <XCircle size={15} />, danger: true },
        cancelled: { title: 'Ακύρωση επισκευής', text: 'Η επισκευή ακυρώνεται (π.χ. ο πελάτης άλλαξε γνώμη).', label: 'Ακύρωση επισκευής', icon: <XCircle size={15} />, danger: true },
        in_production: { title: 'Συνέχεια', text: 'Η επισκευή συνεχίζει στην Παραγωγή.', label: 'Συνέχεια', icon: <Wrench size={15} />, danger: false },
      }[operation.status];
      return <ReasonDialog title={`${meta.title} · ${operation.item.code}`} text={meta.text} confirmLabel={meta.label} danger={meta.danger} icon={meta.icon} busy={busy} close={close} onSubmit={(reason) => run(() => safeAction(() => actions.setRepairExceptionState.mutateAsync({ repairItemId: operation.item.id, status: operation.status, reason }), 'Η κατάσταση ενημερώθηκε.'))} />;
    }
    default:
      return null;
  }
}

type DialogBase = { busy: boolean; close: () => void };

function SaleDialog({ ctl, operation, busy, close, run }: DialogBase & { ctl: ServiceController; operation: Extract<ServiceOperation, { kind: 'sale' }>; run: (task: () => Promise<boolean | void>) => Promise<void> }) {
  const locked = Number(operation.line.locked_unit_price);
  const [quantity, setQuantity] = useState(1);
  const [price, setPrice] = useState(locked);
  const [reason, setReason] = useState('');
  const changed = money(price) !== money(locked);
  const offered = operation.line.offer_line_total != null;
  const total = offered ? consignmentSaleTotal(operation.line, quantity, ctl.data?.consignmentSettlements) : quantity * price;
  return (
    <ServiceModal
      title="Πώληση από Παρακαταθήκη"
      subtitle={`${operation.line.product_sku}${operation.line.variant_suffix || ''} · ${operation.line.pending_quantity} τεμ. στον πελάτη`}
      icon={<Banknote size={18} />}
      onClose={close}
      busy={busy}
      size="sm"
      footer={<Footer busy={busy} onCancel={close} label={`Καταχώριση ${formatGreekMoney(total)}`} disabled={!Number.isFinite(price) || price < 0 || (changed && !reason.trim())} onSubmit={() => run(() => ctl.safeAction(() => ctl.actions.recordConsignmentSale.mutateAsync({ lineId: operation.line.id, quantity, unitPrice: price, reason: changed ? reason : null }), 'Η πώληση καταχωρίστηκε.'))} />}
    >
      <div className="space-y-4">
        <Field label="Πόσα πουλήθηκαν;"><QuantityStepper value={quantity} max={operation.line.pending_quantity} onChange={setQuantity} /></Field>
        {offered ? <p className="rounded-xl bg-indigo-50 p-3 text-sm text-indigo-900">Με τη συνολική προσφορά: <strong>{formatGreekMoney(total)}</strong> για {quantity} τεμ.</p> : <Field label="Τιμή ανά τεμάχιο" hint={`Συμφωνημένη: ${formatGreekMoney(locked)}`}>
          <input type="number" min={0} step="0.01" className={SERVICE_INPUT} value={price} onChange={(event) => setPrice(Number(event.target.value))} />
        </Field>}
        {changed && <Field label="Γιατί αλλάζει η τιμή; *"><input className={SERVICE_INPUT} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="π.χ. έκπτωση πελάτη" autoFocus /></Field>}
      </div>
    </ServiceModal>
  );
}

function PaymentDialog({ outstanding, busy, close, onSubmit }: DialogBase & { outstanding: number; onSubmit: (amount: number, method: string, notes: string) => void }) {
  const [amount, setAmount] = useState(outstanding);
  const [method, setMethod] = useState<(typeof PAYMENT_METHODS)[number]>('Μετρητά');
  const [notes, setNotes] = useState('');
  const invalid = !(amount > 0) || money(amount) > outstanding;
  return (
    <ServiceModal title="Είσπραξη" subtitle={`Υπόλοιπο: ${formatGreekMoney(outstanding)}`} icon={<Wallet size={18} />} onClose={close} busy={busy} size="sm"
      footer={<Footer busy={busy} onCancel={close} label={`Είσπραξη ${formatGreekMoney(amount)}`} disabled={invalid} onSubmit={() => onSubmit(money(amount), method, notes)} />}>
      <div className="space-y-4">
        <Field label="Ποσό" error={money(amount) > outstanding ? 'Το ποσό ξεπερνά το υπόλοιπο.' : null}>
          <div className="flex gap-2">
            <input type="number" min={0} step="0.01" className={SERVICE_INPUT} value={amount} onChange={(event) => setAmount(Number(event.target.value))} />
            {money(amount) !== outstanding && <button type="button" className={ACTION_QUIET} onClick={() => setAmount(outstanding)}>Όλο</button>}
          </div>
        </Field>
        <Field label="Τρόπος πληρωμής"><ChoicePills<(typeof PAYMENT_METHODS)[number]> value={method} onChange={setMethod} options={PAYMENT_METHODS.map((value) => ({ value, label: value }))} /></Field>
        <Field label="Σημείωση"><input className={SERVICE_INPUT} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Προαιρετικά" /></Field>
      </div>
    </ServiceModal>
  );
}

function ReturnDialog({ max, busy, close, onSubmit }: DialogBase & { max: number; onSubmit: (quantity: number, notes: string) => void }) {
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState('');
  return (
    <ServiceModal title="Επιστροφή από πελάτη" subtitle="Τα τεμάχια πάνε στον έλεγχο επιστροφών πριν μπουν ξανά σε απόθεμα." icon={<Undo2 size={18} />} onClose={close} busy={busy} size="sm"
      footer={<Footer busy={busy} onCancel={close} label="Παραλαβή επιστροφής" onSubmit={() => onSubmit(quantity, notes)} />}>
      <div className="space-y-4">
        <Field label="Πόσα επιστράφηκαν;"><QuantityStepper value={quantity} max={max} onChange={setQuantity} /></Field>
        <Field label="Σημείωση"><input className={SERVICE_INPUT} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Προαιρετικά" /></Field>
      </div>
    </ServiceModal>
  );
}

const ROUTE_DEFAULT_REASON = {
  restocked: 'Σε καλή κατάσταση — επιστροφή σε απόθεμα',
  production: 'Χρειάζεται φρεσκάρισμα',
  damaged: 'Ζημιά / απώλεια',
} as const;

function RouteReturnDialog({ ctl, quantity, busy, close, onSubmit }: DialogBase & { ctl: ServiceController; quantity: number; onSubmit: (resolution: 'restocked' | 'production' | 'damaged', warehouseId: string | null, reason: string) => void }) {
  const [resolution, setResolution] = useState<'restocked' | 'production' | 'damaged'>('restocked');
  const [warehouseId, setWarehouseId] = useState<string>(ctl.sourceWarehouses[0]?.id || SYSTEM_IDS.CENTRAL);
  const [reason, setReason] = useState<string>(ROUTE_DEFAULT_REASON.restocked);
  return (
    <ServiceModal title="Τι γίνεται με την επιστροφή;" subtitle={`${quantity} τεμ. σε έλεγχο`} icon={<RotateCcw size={18} />} onClose={close} busy={busy} size="sm"
      footer={<Footer busy={busy} onCancel={close} label="Ολοκλήρωση" disabled={!reason.trim()} onSubmit={() => onSubmit(resolution, resolution === 'restocked' ? warehouseId : null, reason)} />}>
      <div className="space-y-4">
        <ChoicePills
          value={resolution}
          onChange={(value) => { setResolution(value); setReason(ROUTE_DEFAULT_REASON[value]); }}
          options={[
            { value: 'restocked', label: 'Πίσω στο απόθεμα' },
            { value: 'production', label: 'Φρεσκάρισμα στην Παραγωγή' },
            { value: 'damaged', label: 'Ζημιά / απώλεια' },
          ]}
        />
        {resolution === 'restocked' && (
          <Field label="Σε ποια αποθήκη;">
            <select className={SERVICE_INPUT} value={warehouseId} onChange={(event) => setWarehouseId(event.target.value)}>
              {ctl.sourceWarehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}
            </select>
          </Field>
        )}
        <Field label="Αιτιολογία"><input className={SERVICE_INPUT} value={reason} onChange={(event) => setReason(event.target.value)} /></Field>
      </div>
    </ServiceModal>
  );
}

function PriceDialog({ current, busy, close, onSubmit }: DialogBase & { current: number; onSubmit: (price: number, reason: string) => void }) {
  const [price, setPrice] = useState(current);
  const [reason, setReason] = useState('');
  return (
    <ServiceModal title="Αλλαγή συμφωνημένης τιμής" subtitle={`Τρέχουσα: ${formatGreekMoney(current)}`} onClose={close} busy={busy} size="sm"
      footer={<Footer busy={busy} onCancel={close} label="Αποθήκευση" disabled={!reason.trim() || money(price) === money(current)} onSubmit={() => onSubmit(money(price), reason)} />}>
      <div className="space-y-4">
        <Field label="Νέα τιμή ανά τεμάχιο"><input type="number" min={0} step="0.01" className={SERVICE_INPUT} value={price} onChange={(event) => setPrice(Number(event.target.value))} /></Field>
        <Field label="Αιτιολογία *"><input className={SERVICE_INPUT} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Καταγράφεται στο ιστορικό" /></Field>
      </div>
    </ServiceModal>
  );
}

function ReasonDialog({ title, text, confirmLabel, danger = false, optional = false, icon, busy, close, onSubmit }: DialogBase & { title: string; text: string; confirmLabel: string; danger?: boolean; optional?: boolean; icon?: React.ReactNode; onSubmit: (reason: string) => void }) {
  const [reason, setReason] = useState('');
  return (
    <ServiceModal title={title} onClose={close} busy={busy} size="sm"
      footer={<Footer busy={busy} onCancel={close} label={confirmLabel} danger={danger} icon={icon} disabled={!optional && !reason.trim()} onSubmit={() => onSubmit(reason.trim())} />}>
      <div className="space-y-4">
        <p className="text-sm text-slate-600">{text}</p>
        <Field label={optional ? 'Σημείωση' : 'Αιτιολογία *'}>
          <textarea className={`${SERVICE_INPUT} min-h-20`} value={reason} onChange={(event) => setReason(event.target.value)} placeholder={optional ? 'Προαιρετικά' : 'Καταγράφεται στο ιστορικό'} autoFocus />
        </Field>
      </div>
    </ServiceModal>
  );
}

function ReworkDialog({ code, busy, close, onSubmit }: DialogBase & { code: string; onSubmit: (stage: string, notes: string) => void }) {
  const stages = PRODUCTION_STAGES.filter((entry) => entry.id !== ProductionStage.AwaitingDelivery && entry.id !== ProductionStage.Ready);
  const [stage, setStage] = useState<string>(ProductionStage.Polishing);
  const [notes, setNotes] = useState('');
  return (
    <ServiceModal title={`Ξανά στην Παραγωγή · ${code}`} subtitle="Ανοίγει νέος κύκλος επισκευής" icon={<RotateCcw size={18} />} onClose={close} busy={busy} size="sm"
      footer={<Footer busy={busy} onCancel={close} label="Επιστροφή στην Παραγωγή" disabled={!notes.trim()} onSubmit={() => onSubmit(stage, notes.trim())} />}>
      <div className="space-y-4">
        <Field label="Από ποιο στάδιο ξεκινά;">
          <ChoicePills size="sm" value={stage} onChange={setStage} options={stages.map((entry) => ({ value: entry.id as string, label: entry.label }))} />
        </Field>
        <Field label="Τι δεν πέρασε τον έλεγχο; *"><textarea className={`${SERVICE_INPUT} min-h-20`} value={notes} onChange={(event) => setNotes(event.target.value)} autoFocus /></Field>
      </div>
    </ServiceModal>
  );
}

type CostType = 'labor' | 'material' | 'component' | 'external';

function CostDialog({ ctl, busy, close, onSubmit }: DialogBase & { ctl: ServiceController; onSubmit: (payload: { costType: CostType; description: string; quantity: number; unitCost: number; productSku: string | null; variantSuffix: string; warehouseId: string | null }) => void }) {
  const [costType, setCostType] = useState<CostType>('labor');
  const [description, setDescription] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [unitCost, setUnitCost] = useState(0);
  const [sku, setSku] = useState('');
  const [variantSuffix, setVariantSuffix] = useState('');
  const [warehouseId, setWarehouseId] = useState<string>(ctl.sourceWarehouses[0]?.id || SYSTEM_IDS.CENTRAL);
  const usesStock = costType === 'material' || costType === 'component';
  return (
    <ServiceModal title="Κόστος επισκευής" subtitle="Εσωτερικό — δεν το βλέπει ο πελάτης" onClose={close} busy={busy}
      footer={<Footer busy={busy} onCancel={close} label={`Καταχώριση ${formatGreekMoney(quantity * unitCost)}`} disabled={!description.trim() || (usesStock && !sku)} onSubmit={() => onSubmit({ costType, description: description.trim(), quantity, unitCost: money(unitCost), productSku: usesStock ? sku : null, variantSuffix: usesStock ? variantSuffix : '', warehouseId: usesStock ? warehouseId : null })} />}>
      <div className="space-y-4">
        <ChoicePills value={costType} onChange={(value) => { setCostType(value); setSku(''); setVariantSuffix(''); }} options={(Object.entries(REPAIR_COST_TYPE_LABELS) as Array<[CostType, string]>).map(([value, label]) => ({ value, label }))} />
        {usesStock && (
          <>
            <Field label="Υλικό / εξάρτημα" hint="Αφαιρείται από το απόθεμα· το κόστος συμπληρώνεται αυτόματα.">
              <SkuProductPicker
                sku={sku}
                variantSuffix={variantSuffix}
                products={ctl.products}
                onSelect={(selection) => {
                  const pricing = getCatalogSelectionPricing(ctl.products, { sku: selection.sku, variant_suffix: selection.variant_suffix });
                  setSku(selection.sku);
                  setVariantSuffix(selection.variant_suffix || '');
                  setUnitCost(pricing.unitCost);
                  if (!description.trim()) setDescription(`${selection.sku}${selection.variant_suffix || ''}`);
                }}
                scope={costType === 'component' ? 'components' : 'all'}
                placeholder="SKU ή barcode…"
                inputClassName="min-h-[42px]"
                catalogOnly
              />
            </Field>
            <Field label="Από αποθήκη">
              <select className={SERVICE_INPUT} value={warehouseId} onChange={(event) => setWarehouseId(event.target.value)}>
                {ctl.warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}
              </select>
            </Field>
          </>
        )}
        <Field label="Περιγραφή *"><input className={SERVICE_INPUT} value={description} onChange={(event) => setDescription(event.target.value)} placeholder={costType === 'labor' ? 'π.χ. κόλληση κρίκου' : 'Περιγραφή'} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Ποσότητα"><input type="number" min={1} className={SERVICE_INPUT} value={quantity} onChange={(event) => setQuantity(Math.max(1, Number(event.target.value) || 1))} /></Field>
          <Field label="Κόστος μονάδας"><input type="number" min={0} step="0.01" className={SERVICE_INPUT} value={unitCost} onChange={(event) => setUnitCost(Number(event.target.value))} /></Field>
        </div>
      </div>
    </ServiceModal>
  );
}

type ChargeType = 'warranty' | 'chargeable' | 'unrecorded';

function ChargeDialog({ ctl, itemId, code, busy, close, run }: DialogBase & { ctl: ServiceController; itemId: string; code: string; run: (task: () => Promise<boolean | void>) => Promise<void> }) {
  const existing = ctl.chargeByRepairId.get(itemId);
  const [chargeType, setChargeType] = useState<ChargeType>(existing?.charge_type || 'chargeable');
  const [amount, setAmount] = useState(Number(existing?.amount || 0));
  const [paid, setPaid] = useState(Number(existing?.paid_amount || 0));
  const [notes, setNotes] = useState(existing?.notes || '');
  const chargeable = chargeType === 'chargeable';
  const invalid = chargeable && (!(amount > 0) || paid > amount);
  return (
    <ServiceModal title={`Χρέωση πελάτη · ${code}`} icon={<Banknote size={18} />} onClose={close} busy={busy} size="sm"
      footer={<Footer busy={busy} onCancel={close} label="Αποθήκευση" disabled={invalid} onSubmit={() => run(() => ctl.safeAction(() => ctl.actions.setRepairCharge.mutateAsync({ repairItemId: itemId, chargeType, amount: chargeable ? money(amount) : 0, paidAmount: chargeable ? money(paid) : 0, notes }), 'Η χρέωση αποθηκεύτηκε.'))} />}>
      <div className="space-y-4">
        <ChoicePills<ChargeType> value={chargeType} onChange={setChargeType} options={[
          { value: 'chargeable', label: 'Με χρέωση' },
          { value: 'warranty', label: 'Δωρεάν / εγγύηση' },
          { value: 'unrecorded', label: 'Δεν ορίστηκε ακόμη' },
        ]} />
        {chargeable && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Ποσό χρέωσης"><input type="number" min={0} step="0.01" className={SERVICE_INPUT} value={amount} onChange={(event) => setAmount(Number(event.target.value))} /></Field>
            <Field label="Έχουν εισπραχθεί" error={paid > amount ? 'Πάνω από τη χρέωση.' : null}>
              <div className="flex gap-1.5">
                <input type="number" min={0} step="0.01" className={SERVICE_INPUT} value={paid} onChange={(event) => setPaid(Number(event.target.value))} />
                <button type="button" title="Εξοφλήθηκε" className={`${ACTION_QUIET} px-2.5`} onClick={() => setPaid(amount)}>✓</button>
              </div>
            </Field>
          </div>
        )}
        <Field label="Σημείωση"><input className={SERVICE_INPUT} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Προαιρετικά" /></Field>
      </div>
    </ServiceModal>
  );
}

function DeliverDialog({ ctl, operation, busy, close, run }: DialogBase & { ctl: ServiceController; operation: Extract<ServiceOperation, { kind: 'deliver' }>; run: (task: () => Promise<boolean | void>) => Promise<void> }) {
  const charge = ctl.chargeByRepairId.get(operation.item.id);
  const outstanding = repairOutstanding(charge);
  const [collectNow, setCollectNow] = useState(outstanding > 0);
  const label = useMemo(() => (collectNow && outstanding > 0 ? `Είσπραξη ${formatGreekMoney(outstanding)} & παράδοση` : 'Παραδόθηκε'), [collectNow, outstanding]);
  const submit = () => run(async () => {
    if (collectNow && outstanding > 0 && charge) {
      const ok = await ctl.safeAction(() => ctl.actions.setRepairCharge.mutateAsync({ repairItemId: operation.item.id, chargeType: 'chargeable', amount: Number(charge.amount), paidAmount: Number(charge.amount), notes: charge.notes || undefined }), 'Η πληρωμή καταχωρίστηκε.');
      if (!ok) return;
    }
    await ctl.deliverRepair(operation.item);
  });
  return (
    <ServiceModal title={`Παράδοση ${operation.item.code}`} subtitle={ctl.customerName(operation.item.customer_id)} icon={<PackageCheck size={18} />} onClose={close} busy={busy} size="sm"
      footer={<Footer busy={busy} onCancel={close} label={label} icon={<PackageCheck size={15} />} onSubmit={submit} />}>
      {outstanding > 0 ? (
        <div className="space-y-3">
          <div className="rounded-xl bg-slate-50 p-4">
            <div className="text-xs text-slate-500">Υπόλοιπο χρέωσης</div>
            <div className="text-2xl font-black tabular-nums text-slate-900">{formatGreekMoney(outstanding)}</div>
          </div>
          <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 p-3">
            <input type="checkbox" className="h-5 w-5 accent-[#060b00]" checked={collectNow} onChange={(event) => setCollectNow(event.target.checked)} />
            <span className="text-sm font-bold text-slate-700">Ο πελάτης πλήρωσε τώρα</span>
          </label>
          {!collectNow && <p className="text-xs text-slate-500">Η παράδοση γίνεται κανονικά· το υπόλοιπο μένει ως οφειλή.</p>}
        </div>
      ) : (
        <p className="text-sm text-slate-600">{charge?.charge_type === 'warranty' ? 'Δωρεάν επισκευή (εγγύηση).' : charge?.charge_type === 'chargeable' ? 'Η χρέωση έχει εξοφληθεί.' : 'Δεν έχει οριστεί χρέωση.'} Το τεμάχιο παραδίδεται στον πελάτη.</p>
      )}
    </ServiceModal>
  );
}
