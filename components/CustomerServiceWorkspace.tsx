import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRightLeft,
  Banknote,
  Boxes,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  ClipboardCheck,
  FilePlus2,
  Filter,
  HandHeart,
  ImagePlus,
  Loader2,
  PackageCheck,
  Plus,
  RotateCcw,
  Search,
  ShieldCheck,
  Users,
  Wrench,
  X,
} from 'lucide-react';
import { useAuth } from './AuthContext';
import { useUI } from './UIProvider';
import { useCustomers, useOrdersWithItems } from '../hooks/api/useOrders';
import { useProducts } from '../hooks/api/useProducts';
import { useWarehouses } from '../hooks/api/useWarehouses';
import { useSellers } from '../hooks/api/useSellers';
import { useCustomerServiceActions, useCustomerServiceWorkspace } from '../hooks/api/useCustomerService';
import type {
  Consignment,
  ConsignmentLine,
  ConsignmentReturn,
  ConsignmentSettlement,
  RepairItem,
  RepairOriginType,
} from '../types';
import {
  CONSIGNMENT_STATUS_LABELS,
  FINANCIAL_STATUS_LABELS,
  REPAIR_CHARGE_TYPE_LABELS,
  REPAIR_ORIGIN_LABELS,
  REPAIR_STATUS_LABELS,
  formatGreekDateOnly,
  formatGreekDateTime,
  formatGreekMoney,
  formatGreekNumber,
} from '../features/customerService';
import { SYSTEM_IDS } from '../lib/supabase';
import RepairQrButton from './customerService/RepairQrButton';

type WorkspaceTab = 'consignments' | 'repairs';
type ConsignmentDraftRow = {
  id: string;
  customerId: string;
  warehouseId: string;
  sku: string;
  variantSuffix: string;
  sizeInfo: string;
  quantity: number;
  unitCost: number;
  unitPrice: number;
  reviewDate: string;
  notes: string;
  sourceOrderId: string;
  orderLineId: string;
};
type RepairDraftRow = {
  id: string;
  originType: RepairOriginType;
  orderId: string;
  orderLineId: string;
  sku: string;
  variantSuffix: string;
  sizeInfo: string;
  description: string;
  intakeCondition: string;
  accessories: string;
  previousRepairItemId: string;
  sourceConsignmentSettlementId: string;
};
type ConsignmentSaleOption = { id: string; customerId: string; sku: string; variantSuffix: string; sizeInfo: string; soldAt: string };
type Operation =
  | { kind: 'sale'; line: ConsignmentLine }
  | { kind: 'payment'; settlement: ConsignmentSettlement }
  | { kind: 'return'; line: ConsignmentLine }
  | { kind: 'route-return'; item: ConsignmentReturn }
  | { kind: 'price'; line: ConsignmentLine }
  | { kind: 'reverse-sale'; settlement: ConsignmentSettlement }
  | { kind: 'reverse-return'; item: ConsignmentReturn }
  | { kind: 'cancel-consignment'; entry: Consignment }
  | { kind: 'quality'; item: RepairItem; passed: boolean }
  | { kind: 'cost'; item: RepairItem }
  | { kind: 'charge'; item: RepairItem }
  | { kind: 'exception'; item: RepairItem; status: 'on_hold' | 'irreparable' | 'cancelled' | 'in_production' };

const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-emerald-400 focus:ring-4 focus:ring-emerald-500/10';
const secondaryButton = 'inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50';
const primaryButton = 'inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-black text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50';

const plusDays = (days: number) => {
  const value = new Date();
  value.setDate(value.getDate() + days);
  return value.toISOString().slice(0, 10);
};

const newConsignmentRow = (): ConsignmentDraftRow => ({
  id: crypto.randomUUID(), customerId: '', warehouseId: SYSTEM_IDS.CENTRAL, sku: '', variantSuffix: '',
  sizeInfo: '', quantity: 1, unitCost: 0, unitPrice: 0, reviewDate: plusDays(30), notes: '', sourceOrderId: '', orderLineId: '',
});
const newRepairRow = (previous?: RepairItem | null): RepairDraftRow => ({
  id: crypto.randomUUID(), originType: 'recorded_sale', orderId: '', orderLineId: '', sku: '',
  variantSuffix: '', sizeInfo: '', description: '', intakeCondition: '', accessories: '', previousRepairItemId: '', sourceConsignmentSettlementId: '',
  ...(previous ? {
    originType: previous.origin_type,
    orderId: previous.source_order_id || '',
    orderLineId: previous.source_order_line_id || '',
    sku: previous.product_sku || '',
    variantSuffix: previous.variant_suffix || '',
    sizeInfo: previous.size_info || '',
    description: `Επανεπισκευή μετά από ${previous.code}: `,
    previousRepairItemId: previous.id,
    sourceConsignmentSettlementId: previous.source_consignment_settlement_id || '',
  } : {}),
});

function ModalShell({ title, subtitle, onClose, children, wide = false }: { title: string; subtitle?: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-[190] flex items-center justify-center bg-slate-950/55 p-3 backdrop-blur-sm print:hidden" role="dialog" aria-modal="true" aria-label={title}>
      <div className={`flex max-h-[94vh] w-full flex-col overflow-hidden rounded-3xl border border-white/40 bg-slate-50 shadow-2xl ${wide ? 'max-w-6xl' : 'max-w-xl'}`}>
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4">
          <div><h2 className="text-lg font-black text-slate-900">{title}</h2>{subtitle && <p className="mt-1 text-xs text-slate-500">{subtitle}</p>}</div>
          <button type="button" onClick={onClose} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Κλείσιμο"><X size={19} /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}

function SummaryCard({ icon, label, value, tone = 'slate' }: { icon: React.ReactNode; label: string; value: string; tone?: 'slate' | 'emerald' | 'amber' | 'rose' | 'blue' }) {
  const tones = {
    slate: 'bg-slate-100 text-slate-700', emerald: 'bg-emerald-100 text-emerald-700', amber: 'bg-amber-100 text-amber-800',
    rose: 'bg-rose-100 text-rose-700', blue: 'bg-blue-100 text-blue-700',
  };
  return <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm"><div className={`mb-3 inline-flex rounded-xl p-2 ${tones[tone]}`}>{icon}</div><div className="text-xl font-black tabular-nums text-slate-900">{value}</div><div className="mt-1 text-[11px] font-bold text-slate-500">{label}</div></div>;
}

export default function CustomerServiceWorkspace() {
  const { profile } = useAuth();
  const { showToast, confirm } = useUI();
  const [tab, setTab] = useState<WorkspaceTab>('consignments');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('active');
  const [customerFilter, setCustomerFilter] = useState('');
  const [showConsignmentCreator, setShowConsignmentCreator] = useState(false);
  const [showRepairCreator, setShowRepairCreator] = useState(false);
  const [previousRepairItem, setPreviousRepairItem] = useState<RepairItem | null>(null);
  const [operation, setOperation] = useState<Operation | null>(null);
  const { data, isLoading, error } = useCustomerServiceWorkspace();
  const actions = useCustomerServiceActions();
  const openRepairCreator = (previous: RepairItem | null = null) => { setPreviousRepairItem(previous); setShowRepairCreator(true); };
  const { data: customers = [] } = useCustomers();
  const { data: products = [] } = useProducts();
  const { data: warehouses = [] } = useWarehouses();
  const { data: sellers = [] } = useSellers();
  const { data: orders = [] } = useOrdersWithItems({ enabled: showRepairCreator || showConsignmentCreator });

  const customerById = useMemo(() => new Map(customers.map((customer) => [customer.id, customer])), [customers]);
  const sellerById = useMemo(() => new Map(sellers.map((seller) => [seller.id, seller])), [sellers]);
  const existingOrderLineIds = useMemo(
    () => new Set((data?.consignmentLines || []).map((line) => line.order_line_id).filter(Boolean)),
    [data?.consignmentLines],
  );
  const consignmentSaleOptions = useMemo<ConsignmentSaleOption[]>(() => {
    const lines = new Map((data?.consignmentLines || []).map((line) => [line.id, line]));
    const parents = new Map((data?.consignments || []).map((entry) => [entry.id, entry]));
    return (data?.consignmentSettlements || []).filter((settlement) => settlement.status !== 'reversed').flatMap((settlement) => {
      const line = lines.get(settlement.consignment_line_id);
      const parent = line ? parents.get(line.consignment_id) : undefined;
      return line && parent ? [{ id: settlement.id, customerId: parent.customer_id, sku: line.product_sku, variantSuffix: line.variant_suffix || '', sizeInfo: line.size_info || '', soldAt: settlement.sold_at }] : [];
    });
  }, [data?.consignmentLines, data?.consignments, data?.consignmentSettlements]);
  const chargeByRepairId = useMemo(() => new Map((data?.repairCharges || []).map((charge) => [charge.repair_item_id, charge])), [data?.repairCharges]);
  const costsByRepairId = useMemo(() => {
    const map = new Map<string, number>();
    for (const cost of data?.repairCostLines || []) map.set(cost.repair_item_id, (map.get(cost.repair_item_id) || 0) + Number(cost.quantity || 0) * Number(cost.unit_cost || 0));
    return map;
  }, [data?.repairCostLines]);

  const consignments = useMemo(() => (data?.consignments || []).filter((entry) => {
    const customer = customerById.get(entry.customer_id)?.full_name || '';
    const haystack = `${entry.code} ${customer} ${entry.source_order_id || ''}`.toLocaleLowerCase('el-GR');
    const matchesSearch = !search || haystack.includes(search.toLocaleLowerCase('el-GR')) || (data?.consignmentLines || []).some((line) => line.consignment_id === entry.id && line.product_sku.toLocaleLowerCase('el-GR').includes(search.toLocaleLowerCase('el-GR')));
    const matchesCustomer = !customerFilter || entry.customer_id === customerFilter;
    const matchesStatus = statusFilter === 'all' || (statusFilter === 'active' ? ['pending_handoff', 'active', 'partially_settled'].includes(entry.status) : entry.status === statusFilter);
    return matchesSearch && matchesCustomer && matchesStatus;
  }), [data, customerById, search, customerFilter, statusFilter]);

  const repairs = useMemo(() => (data?.repairItems || []).filter((item) => {
    const customer = customerById.get(item.customer_id)?.full_name || '';
    const haystack = `${item.code} ${customer} ${item.product_sku || ''} ${item.description} ${item.source_order_id || ''}`.toLocaleLowerCase('el-GR');
    const matchesStatus = statusFilter === 'all' || (statusFilter === 'active' ? !['delivered', 'irreparable', 'cancelled'].includes(item.status) : item.status === statusFilter);
    return (!search || haystack.includes(search.toLocaleLowerCase('el-GR'))) && (!customerFilter || item.customer_id === customerFilter) && matchesStatus;
  }), [data?.repairItems, customerById, search, customerFilter, statusFilter]);

  const consignmentStats = useMemo(() => {
    const lines = data?.consignmentLines || [];
    const settlements = (data?.consignmentSettlements || []).filter((item) => item.status !== 'reversed');
    return {
      active: (data?.consignments || []).filter((item) => ['pending_handoff', 'active', 'partially_settled'].includes(item.status)).length,
      pending: lines.reduce((sum, line) => sum + line.pending_quantity, 0),
      cost: lines.reduce((sum, line) => sum + line.pending_quantity * Number(line.locked_unit_cost), 0),
      value: lines.reduce((sum, line) => sum + line.pending_quantity * Number(line.locked_unit_price), 0),
      due: settlements.reduce((sum, item) => sum + Number(item.total_amount) - Number(item.paid_amount), 0),
      overdue: (data?.consignments || []).filter((item) => ['active', 'partially_settled'].includes(item.status) && item.review_due_at < new Date().toISOString().slice(0, 10)).length,
    };
  }, [data]);
  const repairStats = useMemo(() => ({
    active: (data?.repairItems || []).filter((item) => !['delivered', 'irreparable', 'cancelled'].includes(item.status)).length,
    production: (data?.repairItems || []).filter((item) => item.status === 'in_production').length,
    quality: (data?.repairItems || []).filter((item) => item.status === 'quality_check').length,
    ready: (data?.repairItems || []).filter((item) => item.status === 'ready_for_return').length,
    rework: (data?.repairItems || []).filter((item) => item.current_cycle_number > 1).length,
    cost: (data?.repairCostLines || []).reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unit_cost || 0), 0),
    charges: (data?.repairCharges || []).reduce((sum, item) => sum + Number(item.amount || 0), 0),
  }), [data]);

  const safeAction = async (action: () => Promise<unknown>, success: string): Promise<boolean> => {
    try { await action(); showToast(success, 'success'); setOperation(null); return true; }
    catch (actionError) { showToast(actionError instanceof Error ? actionError.message : 'Η ενέργεια δεν ολοκληρώθηκε.', 'error'); return false; }
  };

  return (
    <div className="min-h-full bg-slate-50 px-3 py-4 sm:px-5 lg:px-7">
      <div className="mx-auto max-w-[1600px] space-y-5">
        <header className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-4"><div className="rounded-2xl bg-slate-900 p-3 text-white"><HandHeart size={26} /></div><div><h1 className="text-2xl font-black tracking-tight text-slate-900">Παρακαταθήκες & Επισκευές</h1><p className="mt-1 text-sm text-slate-500">Ενιαία εσωτερική παρακολούθηση τεμαχίων, αποθέματος, κόστους και οικονομικής τακτοποίησης.</p></div></div>
            <div className="flex flex-wrap gap-2">
              {profile?.role !== 'seller' && <button className={secondaryButton} onClick={() => safeAction(async () => { const mismatches = await actions.checkConsignmentInventory.mutateAsync(); if (mismatches.length > 0) { const first = mismatches[0]; throw new Error(`Βρέθηκαν ${mismatches.length} διαφορές αποθήκης. Πρώτη διαφορά: ${first.product_sku}${first.variant_suffix}, αναμενόμενα ${first.expected_quantity}, πραγματικά ${first.actual_quantity}.`); } }, 'Η αποθήκη Παρακαταθηκών συμφωνεί πλήρως με τις ενεργές κατανομές.')}><ShieldCheck size={16} /> Έλεγχος συμφωνίας</button>}
              <button className={secondaryButton} onClick={() => openRepairCreator()}><Wrench size={16} /> Παραλαβή Επισκευών</button>
              <button className={primaryButton} onClick={() => setShowConsignmentCreator(true)}><Plus size={17} /> Μαζική Παρακαταθήκη</button>
            </div>
          </div>
          <div className="flex gap-1 border-t border-slate-100 bg-slate-50/80 px-3 pt-2">
            <button onClick={() => { setTab('consignments'); setStatusFilter('active'); }} className={`flex items-center gap-2 rounded-t-xl px-4 py-3 text-sm font-black ${tab === 'consignments' ? 'bg-white text-amber-700 shadow-[0_-1px_0_0_#e2e8f0,1px_0_0_0_#e2e8f0,-1px_0_0_0_#e2e8f0]' : 'text-slate-500 hover:text-slate-800'}`}><Boxes size={17} /> Παρακαταθήκες <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px]">{consignmentStats.active}</span></button>
            <button onClick={() => { setTab('repairs'); setStatusFilter('active'); }} className={`flex items-center gap-2 rounded-t-xl px-4 py-3 text-sm font-black ${tab === 'repairs' ? 'bg-white text-blue-700 shadow-[0_-1px_0_0_#e2e8f0,1px_0_0_0_#e2e8f0,-1px_0_0_0_#e2e8f0]' : 'text-slate-500 hover:text-slate-800'}`}><Wrench size={17} /> Επισκευές <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px]">{repairStats.active}</span></button>
          </div>
        </header>

        {tab === 'consignments' ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
            <SummaryCard icon={<Boxes size={18} />} label="Ενεργές" value={formatGreekNumber(consignmentStats.active)} tone="amber" />
            <SummaryCard icon={<PackageCheck size={18} />} label="Εκκρεμή τεμάχια" value={formatGreekNumber(consignmentStats.pending)} />
            <SummaryCard icon={<ShieldCheck size={18} />} label="Κλειδωμένο κόστος" value={formatGreekMoney(consignmentStats.cost)} />
            <SummaryCard icon={<CircleDollarSign size={18} />} label="Αξία Παρακαταθήκης" value={formatGreekMoney(consignmentStats.value)} tone="blue" />
            <SummaryCard icon={<Banknote size={18} />} label="Ανοιχτές οφειλές" value={formatGreekMoney(consignmentStats.due)} tone="rose" />
            <SummaryCard icon={<RotateCcw size={18} />} label="Εκπρόθεσμοι επανέλεγχοι" value={formatGreekNumber(consignmentStats.overdue)} tone="rose" />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
            <SummaryCard icon={<Wrench size={18} />} label="Ενεργές" value={formatGreekNumber(repairStats.active)} tone="blue" />
            <SummaryCard icon={<ArrowRightLeft size={18} />} label="Στην Παραγωγή" value={formatGreekNumber(repairStats.production)} />
            <SummaryCard icon={<ClipboardCheck size={18} />} label="Ποιοτικός έλεγχος" value={formatGreekNumber(repairStats.quality)} tone="amber" />
            <SummaryCard icon={<CheckCircle2 size={18} />} label="Έτοιμες" value={formatGreekNumber(repairStats.ready)} tone="emerald" />
            <SummaryCard icon={<RotateCcw size={18} />} label="Επανεπισκευές" value={formatGreekNumber(repairStats.rework)} tone="rose" />
            <SummaryCard icon={<ShieldCheck size={18} />} label="Εσωτερικό κόστος" value={formatGreekMoney(repairStats.cost)} />
            <SummaryCard icon={<Banknote size={18} />} label="Χρεώσεις" value={formatGreekMoney(repairStats.charges)} tone="emerald" />
          </div>
        )}

        <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_240px_220px]">
            <label className="relative"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input className={`${inputClass} pl-9`} value={search} onChange={(event) => setSearch(event.target.value)} placeholder={tab === 'consignments' ? 'Κωδικός, πελάτης, SKU ή παραγγελία…' : 'Κωδικός επισκευής, πελάτης, SKU ή σημείωση…'} /></label>
            <label className="relative"><Users size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><select className={`${inputClass} pl-9`} value={customerFilter} onChange={(event) => setCustomerFilter(event.target.value)}><option value="">Όλοι οι πελάτες</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.full_name}</option>)}</select></label>
            <label className="relative"><Filter size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><select className={`${inputClass} pl-9`} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="active">Μόνο ενεργές</option><option value="all">Όλες οι καταστάσεις</option>{tab === 'consignments' ? Object.entries(CONSIGNMENT_STATUS_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>) : Object.entries(REPAIR_STATUS_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          </div>
        </section>

        {isLoading ? <div className="flex min-h-64 items-center justify-center text-slate-500"><Loader2 className="mr-2 animate-spin" /> Φόρτωση στοιχείων…</div> : error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm font-bold text-rose-700">Δεν ήταν δυνατή η φόρτωση: {error.message}</div> : tab === 'consignments' ? (
          <div className="space-y-3">{consignments.length === 0 ? <EmptyState icon={<Boxes size={32} />} title="Δεν βρέθηκαν Παρακαταθήκες" text="Αλλάξτε τα φίλτρα ή ξεκινήστε μια νέα μαζική συνεδρία." action={() => setShowConsignmentCreator(true)} actionLabel="Νέα Παρακαταθήκη" /> : consignments.map((entry) => {
            const lines = (data?.consignmentLines || []).filter((line) => line.consignment_id === entry.id);
            const settlements = (data?.consignmentSettlements || []).filter((settlement) => lines.some((line) => line.id === settlement.consignment_line_id));
            const returns = (data?.consignmentReturns || []).filter((item) => lines.some((line) => line.id === item.consignment_line_id));
            return <ConsignmentCard key={entry.id} entry={entry} lines={lines} settlements={settlements} returns={returns} customerName={customerById.get(entry.customer_id)?.full_name || 'Άγνωστος πελάτης'} sellerName={entry.seller_id ? sellerById.get(entry.seller_id)?.full_name : undefined} isAdmin={profile?.role === 'admin'} onHandoff={async () => { const accepted = await confirm({ title: 'Παράδοση Παρακαταθήκης', message: 'Θα μετακινηθούν τα τεμάχια στην προστατευμένη θέση «Παρακαταθήκες Πελατών». Συνέχεια;', confirmText: 'Παράδοση' }); if (accepted) safeAction(() => actions.handoffConsignment.mutateAsync(entry.id), 'Η Παρακαταθήκη παραδόθηκε και το απόθεμα ενημερώθηκε.'); }} onOperation={setOperation} onLegalDraft={(id) => safeAction(() => actions.createConsignmentLegalDraft.mutateAsync(id), 'Δημιουργήθηκε συνδεδεμένο πρόχειρο παραστατικό.')} />;
          })}</div>
        ) : (
          <div className="grid gap-3 xl:grid-cols-2">{repairs.length === 0 ? <div className="xl:col-span-2"><EmptyState icon={<Wrench size={32} />} title="Δεν βρέθηκαν Επισκευές" text="Αλλάξτε τα φίλτρα ή καταχωρίστε νέα παραλαβή." action={() => openRepairCreator()} actionLabel="Παραλαβή Επισκευών" /></div> : repairs.map((item) => <div key={item.id} className="relative"><div className="absolute right-12 top-3 z-10"><RepairQrButton code={item.code} customerName={customerById.get(item.customer_id)?.full_name || 'Άγνωστος πελάτης'} /></div><RepairCard item={item} customerName={customerById.get(item.customer_id)?.full_name || 'Άγνωστος πελάτης'} sellerName={item.seller_id ? sellerById.get(item.seller_id)?.full_name : undefined} cost={costsByRepairId.get(item.id) || 0} charge={chargeByRepairId.get(item.id)} isSeller={profile?.role === 'seller'} onOperation={setOperation} onDelivered={() => safeAction(() => actions.markRepairDelivered.mutateAsync(item.id), 'Η Επισκευή σημειώθηκε ως παραδομένη.')} onNewLinkedRepair={() => openRepairCreator(item)} onLegalDraft={() => safeAction(() => actions.createRepairLegalDraft.mutateAsync(item.id), 'Δημιουργήθηκε συνδεδεμένο πρόχειρο παραστατικό υπηρεσίας.')} onUpload={(file) => safeAction(() => actions.uploadRepairAttachment.mutateAsync({ repairItemId: item.id, file }), 'Η φωτογραφία αποθηκεύτηκε με ασφαλή πρόσβαση.')} /></div>)}</div>
        )}
      </div>

      {showConsignmentCreator && <BulkConsignmentCreator customers={customers} products={products} orders={orders} existingOrderLineIds={existingOrderLineIds} warehouses={warehouses.filter((warehouse) => ![SYSTEM_IDS.CONSIGNMENTS, SYSTEM_IDS.RETURN_INSPECTION].includes(warehouse.id))} defaultSellerId={profile?.role === 'seller' ? profile.id : undefined} onClose={() => setShowConsignmentCreator(false)} onSubmit={async (groups) => { if (await safeAction(() => actions.createBulkConsignments.mutateAsync(groups), 'Οι Παρακαταθήκες δημιουργήθηκαν με επιτυχία.')) setShowConsignmentCreator(false); }} saving={actions.createBulkConsignments.isPending} />}
      {showRepairCreator && <RepairIntakeCreator customers={customers} products={products} orders={orders} consignmentSales={consignmentSaleOptions} previousRepairItem={previousRepairItem} defaultSellerId={profile?.role === 'seller' ? profile.id : undefined} onClose={() => { setShowRepairCreator(false); setPreviousRepairItem(null); }} onSubmit={async (input) => { if (await safeAction(() => actions.createRepairIntake.mutateAsync(input), 'Η παραλαβή καταχωρίστηκε και δημιουργήθηκαν οι παρτίδες Παραγωγής.')) { setShowRepairCreator(false); setPreviousRepairItem(null); } }} saving={actions.createRepairIntake.isPending} />}
      {operation && <OperationModal operation={operation} warehouses={warehouses} onClose={() => setOperation(null)} onSubmit={(payload) => {
        if (operation.kind === 'sale') return safeAction(() => actions.recordConsignmentSale.mutateAsync({ lineId: operation.line.id, quantity: payload.quantity, unitPrice: payload.amount, reason: payload.reason || null }), 'Η πώληση δηλώθηκε και δημιουργήθηκε η απαίτηση.');
        if (operation.kind === 'payment') return safeAction(() => actions.recordConsignmentPayment.mutateAsync({ settlementId: operation.settlement.id, amount: payload.amount, method: payload.method, notes: payload.reason }), 'Η είσπραξη καταχωρίστηκε.');
        if (operation.kind === 'return') return safeAction(() => actions.receiveConsignmentReturn.mutateAsync({ lineId: operation.line.id, quantity: payload.quantity, notes: payload.reason }), 'Η επιστροφή μεταφέρθηκε στον Έλεγχο Επιστροφών.');
        if (operation.kind === 'route-return') return safeAction(() => actions.routeConsignmentReturn.mutateAsync({ returnId: operation.item.id, resolution: payload.resolution, destinationWarehouseId: payload.warehouseId || null, reason: payload.reason }), 'Η επιστροφή δρομολογήθηκε και το απόθεμα ενημερώθηκε.');
        if (operation.kind === 'price') return safeAction(() => actions.overrideConsignmentPrice.mutateAsync({ lineId: operation.line.id, unitPrice: payload.amount, reason: payload.reason }), 'Η κλειδωμένη τιμή ενημερώθηκε και καταγράφηκε στο ιστορικό.');
        if (operation.kind === 'reverse-sale') return safeAction(() => actions.reverseConsignmentSettlement.mutateAsync({ settlementId: operation.settlement.id, reason: payload.reason }), 'Η πώληση αντιστράφηκε και το απόθεμα αποκαταστάθηκε.');
        if (operation.kind === 'reverse-return') return safeAction(() => actions.reverseConsignmentReturn.mutateAsync({ returnId: operation.item.id, reason: payload.reason }), 'Η επιστροφή αντιστράφηκε και το απόθεμα αποκαταστάθηκε.');
        if (operation.kind === 'cancel-consignment') return safeAction(() => actions.cancelConsignment.mutateAsync({ consignmentId: operation.entry.id, reason: payload.reason }), 'Η πρόχειρη Παρακαταθήκη ακυρώθηκε.');
        if (operation.kind === 'quality') return safeAction(() => actions.completeRepairQualityCheck.mutateAsync({ repairItemId: operation.item.id, passed: operation.passed, notes: payload.reason, returnStage: payload.stage }), operation.passed ? 'Ο ποιοτικός έλεγχος ολοκληρώθηκε.' : 'Δημιουργήθηκε νέος κύκλος επανεργασίας.');
        if (operation.kind === 'cost') return safeAction(() => actions.recordRepairCost.mutateAsync({ repairItemId: operation.item.id, costType: payload.costType, description: payload.reason, quantity: payload.quantity, unitCost: payload.amount, productSku: payload.sku || null, warehouseId: payload.warehouseId || null }), 'Το κόστος καταχωρίστηκε.');
        if (operation.kind === 'charge') return safeAction(() => actions.setRepairCharge.mutateAsync({ repairItemId: operation.item.id, chargeType: payload.chargeType, amount: payload.amount, paidAmount: payload.paidAmount, notes: payload.reason }), 'Η χρέωση Επισκευής ενημερώθηκε.');
        return safeAction(() => actions.setRepairExceptionState.mutateAsync({ repairItemId: operation.item.id, status: operation.status, reason: payload.reason }), 'Η κατάσταση Επισκευής ενημερώθηκε.');
      }} />}
    </div>
  );
}

function EmptyState({ icon, title, text, action, actionLabel }: { icon: React.ReactNode; title: string; text: string; action: () => void; actionLabel: string }) {
  return <div className="flex min-h-64 flex-col items-center justify-center rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center"><div className="mb-3 rounded-2xl bg-slate-100 p-4 text-slate-500">{icon}</div><h3 className="font-black text-slate-800">{title}</h3><p className="mt-1 max-w-md text-sm text-slate-500">{text}</p><button className={`${primaryButton} mt-4`} onClick={action}><Plus size={16} /> {actionLabel}</button></div>;
}

function ConsignmentCard({ entry, lines, settlements, returns, customerName, sellerName, isAdmin, onHandoff, onOperation, onLegalDraft }: { entry: Consignment; lines: ConsignmentLine[]; settlements: ConsignmentSettlement[]; returns: ConsignmentReturn[]; customerName: string; sellerName?: string; isAdmin: boolean; onHandoff: () => void; onOperation: (operation: Operation) => void; onLegalDraft: (settlementId: string) => void }) {
  const pending = lines.reduce((sum, line) => sum + line.pending_quantity, 0);
  const value = lines.reduce((sum, line) => sum + line.pending_quantity * Number(line.locked_unit_price), 0);
  const due = settlements.filter((item) => item.status !== 'reversed').reduce((sum, item) => sum + Number(item.total_amount) - Number(item.paid_amount), 0);
  return <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="flex flex-col gap-3 border-b border-slate-100 p-4 md:flex-row md:items-center md:justify-between"><div className="flex items-start gap-3"><div className="rounded-xl bg-amber-100 p-2.5 text-amber-800"><Boxes size={20} /></div><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-black text-slate-900">{entry.code}</h3><span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-black text-slate-600">{CONSIGNMENT_STATUS_LABELS[entry.status]}</span><span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-black text-emerald-700">{FINANCIAL_STATUS_LABELS[entry.financial_status]}</span></div><p className="mt-1 text-sm font-bold text-slate-700">{customerName}</p><p className="text-[11px] text-slate-500">{sellerName ? `Πωλητής: ${sellerName} · ` : ''}Επανέλεγχος: {formatGreekDateOnly(entry.review_due_at)}</p></div></div><div className="flex flex-wrap gap-2">{entry.status === 'pending_handoff' && <button className={primaryButton} onClick={onHandoff}><PackageCheck size={15} /> Παράδοση</button>}{isAdmin && entry.status === 'pending_handoff' && <button className={secondaryButton} onClick={() => onOperation({ kind: 'cancel-consignment', entry })}><X size={14} /> Ακύρωση</button>}</div></div>
    <div className="grid gap-3 p-4 lg:grid-cols-[minmax(0,1fr)_280px]"><div className="space-y-2">{lines.map((line) => <div key={line.id} className="flex flex-col gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3 sm:flex-row sm:items-center sm:justify-between"><div><div className="font-black text-slate-800">{line.product_sku}{line.variant_suffix}</div><div className="mt-1 flex flex-wrap gap-2 text-[10px] font-bold text-slate-500"><span>Παραδόθηκαν {line.quantity}</span><span>Πωλήθηκαν {line.sold_quantity}</span><span>Επιστράφηκαν {line.returned_quantity}</span><span className="text-amber-700">Εκκρεμούν {line.pending_quantity}</span><span>{formatGreekMoney(Number(line.locked_unit_price))}/τεμ.</span></div></div>{['active', 'partially_settled'].includes(entry.status) && <div className="flex flex-wrap gap-2">{line.pending_quantity > 0 && <><button className={secondaryButton} onClick={() => onOperation({ kind: 'sale', line })}><Banknote size={14} /> Πώληση</button><button className={secondaryButton} onClick={() => onOperation({ kind: 'return', line })}><RotateCcw size={14} /> Επιστροφή</button></>}{isAdmin && <button className={secondaryButton} onClick={() => onOperation({ kind: 'price', line })}>Αλλαγή τιμής</button>}</div>}</div>)}</div>
      <aside className="space-y-3 rounded-xl border border-slate-100 bg-slate-50 p-3"><div className="grid grid-cols-3 gap-2 text-center"><div><div className="text-lg font-black">{pending}</div><div className="text-[9px] font-bold text-slate-500">ΕΚΚΡΕΜΗ</div></div><div><div className="text-sm font-black">{formatGreekMoney(value)}</div><div className="text-[9px] font-bold text-slate-500">ΑΞΙΑ</div></div><div><div className="text-sm font-black text-rose-700">{formatGreekMoney(due)}</div><div className="text-[9px] font-bold text-slate-500">ΟΦΕΙΛΗ</div></div></div>{settlements.filter((item) => item.status !== 'reversed').map((settlement) => <div key={settlement.id} className="rounded-lg bg-white p-2.5 text-xs"><div className="flex justify-between"><span className="font-bold">Πώληση {settlement.quantity} τεμ.</span><span className="font-black">{formatGreekMoney(Number(settlement.total_amount))}</span></div><div className="mt-2 flex flex-wrap gap-1.5">{settlement.status !== 'paid' && <button className={secondaryButton} onClick={() => onOperation({ kind: 'payment', settlement })}>Είσπραξη</button>}{!settlement.legal_document_id && <button className={secondaryButton} onClick={() => onLegalDraft(settlement.id)}><FilePlus2 size={13} /> Πρόχειρο παραστατικό</button>}{isAdmin && Number(settlement.paid_amount) === 0 && !settlement.legal_document_id && <button className={secondaryButton} onClick={() => onOperation({ kind: 'reverse-sale', settlement })}>Αντιστροφή</button>}</div></div>)}{returns.filter((item) => item.status === 'inspection').map((item) => <div key={item.id} className="flex gap-1.5"><button className={`${secondaryButton} flex-1`} onClick={() => onOperation({ kind: 'route-return', item })}><ArrowRightLeft size={14} /> Δρομολόγηση {item.quantity} τεμ.</button>{isAdmin && <button className={secondaryButton} onClick={() => onOperation({ kind: 'reverse-return', item })}>Αντιστροφή</button>}</div>)}</aside>
    </div></article>;
}

function RepairCard({ item, customerName, sellerName, cost, charge, isSeller, onOperation, onDelivered, onNewLinkedRepair, onLegalDraft, onUpload }: { item: RepairItem; customerName: string; sellerName?: string; cost: number; charge?: any; isSeller: boolean; onOperation: (operation: Operation) => void; onDelivered: () => void; onNewLinkedRepair: () => void; onLegalDraft: () => void; onUpload: (file: File) => void }) {
  return <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-start justify-between gap-3"><div className="flex gap-3"><div className="rounded-xl bg-blue-100 p-2.5 text-blue-700"><Wrench size={20} /></div><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-black text-slate-900">{item.code}</h3><span className="rounded-full bg-blue-50 px-2 py-1 text-[10px] font-black text-blue-700">{REPAIR_STATUS_LABELS[item.status]}</span>{item.current_cycle_number > 1 && <span className="rounded-full bg-rose-50 px-2 py-1 text-[10px] font-black text-rose-700">Κύκλος {item.current_cycle_number}</span>}</div><div className="mt-1 text-sm font-bold text-slate-700">{customerName}</div><div className="text-[10px] text-slate-500">{REPAIR_ORIGIN_LABELS[item.origin_type]}{sellerName ? ` · ${sellerName}` : ''}</div></div></div><ChevronRight className="text-slate-300" /></div><div className="mt-4 rounded-xl border border-slate-100 bg-slate-50 p-3"><div className="text-xs font-black text-slate-700">{item.product_sku ? `${item.product_sku}${item.variant_suffix}` : 'Χωρίς συνδεδεμένο SKU'}</div><p className="mt-1 text-sm leading-relaxed text-slate-600">{item.description}</p>{item.intake_condition && <p className="mt-2 text-[11px] text-slate-500">Κατάσταση παραλαβής: {item.intake_condition}</p>}</div><div className="mt-3 grid grid-cols-3 gap-2 rounded-xl bg-slate-50 p-3 text-center"><div><div className="font-black">{formatGreekMoney(cost)}</div><div className="text-[9px] font-bold text-slate-500">ΚΟΣΤΟΣ</div></div><div><div className="font-black">{formatGreekMoney(Number(charge?.amount || 0))}</div><div className="text-[9px] font-bold text-slate-500">ΧΡΕΩΣΗ</div></div><div><div className="font-black">{charge ? REPAIR_CHARGE_TYPE_LABELS[charge.charge_type as keyof typeof REPAIR_CHARGE_TYPE_LABELS] : '—'}</div><div className="text-[9px] font-bold text-slate-500">ΤΥΠΟΣ</div></div></div><div className="mt-3 flex flex-wrap gap-2">{!isSeller && item.status === 'quality_check' && <><button className={primaryButton} onClick={() => onOperation({ kind: 'quality', item, passed: true })}><CheckCircle2 size={14} /> Επιτυχής έλεγχος</button><button className={secondaryButton} onClick={() => onOperation({ kind: 'quality', item, passed: false })}><RotateCcw size={14} /> Επανεργασία</button></>}{item.status === 'ready_for_return' && <button className={primaryButton} onClick={onDelivered}><PackageCheck size={14} /> Παραδόθηκε</button>}{item.status === 'delivered' && <button className={secondaryButton} onClick={onNewLinkedRepair}><RotateCcw size={14} /> Νέα συνδεδεμένη Επισκευή</button>}{!isSeller && !['delivered', 'irreparable', 'cancelled'].includes(item.status) && <><button className={secondaryButton} onClick={() => onOperation({ kind: 'cost', item })}>Καταγραφή κόστους</button><button className={secondaryButton} onClick={() => onOperation({ kind: 'charge', item })}>Χρέωση</button></>}{charge?.charge_type === 'chargeable' && Number(charge.amount) > 0 && !charge.legal_document_id && <button className={secondaryButton} onClick={onLegalDraft}><FilePlus2 size={14} /> Πρόχειρο παραστατικό</button>}<label className={`${secondaryButton} cursor-pointer`}><ImagePlus size={14} /> Φωτογραφία<input type="file" accept="image/*" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) onUpload(file); event.currentTarget.value = ''; }} /></label>{!isSeller && !['delivered', 'irreparable', 'cancelled'].includes(item.status) && <button className={secondaryButton} onClick={() => onOperation({ kind: 'exception', item, status: 'on_hold' })}>Σε αναμονή</button>}</div><div className="mt-3 text-[10px] text-slate-400">Παραλαβή: {formatGreekDateTime(item.received_at)} · Δεν μπλοκάρεται η παράδοση από οικονομική εκκρεμότητα.</div></article>;
}

function BulkConsignmentCreator({ customers, products, orders, existingOrderLineIds, warehouses, defaultSellerId, onClose, onSubmit, saving }: { customers: any[]; products: any[]; orders: any[]; existingOrderLineIds: Set<string | null>; warehouses: any[]; defaultSellerId?: string; onClose: () => void; onSubmit: (groups: any[]) => Promise<void>; saving: boolean }) {
  const [rows, setRows] = useState<ConsignmentDraftRow[]>([newConsignmentRow()]);
  useEffect(() => {
    const tagged = orders.flatMap((order) => (order.items || [])
      .filter((item: any) => item.fulfillment_mode === 'consignment' && !existingOrderLineIds.has(item.line_id || null))
      .map((item: any) => {
        const product = products.find((entry) => entry.sku === item.sku);
        return {
          ...newConsignmentRow(), customerId: order.customer_id || '', sku: item.sku,
          variantSuffix: item.variant_suffix || '', sizeInfo: item.size_info || '', quantity: item.quantity,
          unitCost: Number(product?.supplier_cost || 0), unitPrice: Number(item.price_at_order || product?.selling_price || 0),
          sourceOrderId: order.id, orderLineId: item.line_id || '',
        };
      }));
    if (tagged.length > 0) setRows((current) => current.length === 1 && !current[0].customerId && !current[0].sku ? tagged : current);
  }, [orders, products, existingOrderLineIds]);
  const update = (id: string, patch: Partial<ConsignmentDraftRow>) => setRows((current) => current.map((row) => row.id === id ? { ...row, ...patch } : row));
  const valid = rows.length > 0 && rows.every((row) => row.customerId && row.warehouseId && row.sku && row.quantity > 0 && row.unitPrice >= 0 && row.unitCost >= 0);
  const totalCost = rows.reduce((sum, row) => sum + row.quantity * row.unitCost, 0);
  const totalValue = rows.reduce((sum, row) => sum + row.quantity * row.unitPrice, 0);
  const submit = async () => {
    if (!valid) return;
    const grouped = new Map<string, any>();
    for (const row of rows) {
      const key = `${row.customerId}:${row.warehouseId}:${row.reviewDate}:${row.sourceOrderId}`;
      if (!grouped.has(key)) grouped.set(key, { customer_id: row.customerId, seller_id: defaultSellerId || null, source_order_id: row.sourceOrderId || null, source_warehouse_id: row.warehouseId, review_due_at: row.reviewDate, notes: row.notes || null, lines: [] });
      grouped.get(key).lines.push({ product_sku: row.sku, variant_suffix: row.variantSuffix, size_info: row.sizeInfo, quantity: row.quantity, locked_unit_cost: row.unitCost, locked_unit_price: row.unitPrice, order_line_id: row.orderLineId || null });
    }
    await onSubmit([...grouped.values()]);
  };
  return <ModalShell title="Μαζικός Δημιουργός Παρακαταθηκών" subtitle="Πολλοί πελάτες, μία ελεγχόμενη και ατομική συνεδρία." onClose={onClose} wide><div className="space-y-4"><div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white"><table className="w-full min-w-[1050px] text-left text-xs"><thead className="bg-slate-100 text-[10px] font-black uppercase text-slate-500"><tr><th className="p-3">Πελάτης</th><th className="p-3">SKU / παραλλαγή</th><th className="p-3">Ποσότητα</th><th className="p-3">Κόστος</th><th className="p-3">Τιμή</th><th className="p-3">Αποθήκη</th><th className="p-3">Επανέλεγχος</th><th className="w-12 p-3"></th></tr></thead><tbody className="divide-y divide-slate-100">{rows.map((row) => <tr key={row.id} className="align-top"><td className="p-2"><select className={inputClass} value={row.customerId} onChange={(event) => update(row.id, { customerId: event.target.value })}><option value="">Επιλέξτε…</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.full_name}</option>)}</select></td><td className="p-2"><div className="grid grid-cols-[1fr_100px] gap-1"><select className={inputClass} value={row.sku} onChange={(event) => { const product = products.find((entry) => entry.sku === event.target.value); update(row.id, { sku: event.target.value, unitCost: Number(product?.supplier_cost || 0), unitPrice: Number(product?.selling_price || 0) }); }}><option value="">SKU…</option>{products.map((product) => <option key={product.sku} value={product.sku}>{product.sku}</option>)}</select><input className={inputClass} value={row.variantSuffix} onChange={(event) => update(row.id, { variantSuffix: event.target.value })} placeholder="Παραλλ." /></div></td><td className="p-2"><input type="number" min={1} className={inputClass} value={row.quantity} onChange={(event) => update(row.id, { quantity: Number(event.target.value) })} /></td><td className="p-2"><input type="number" min={0} step="0.01" className={inputClass} value={row.unitCost} onChange={(event) => update(row.id, { unitCost: Number(event.target.value) })} /></td><td className="p-2"><input type="number" min={0} step="0.01" className={inputClass} value={row.unitPrice} onChange={(event) => update(row.id, { unitPrice: Number(event.target.value) })} /></td><td className="p-2"><select className={inputClass} value={row.warehouseId} onChange={(event) => update(row.id, { warehouseId: event.target.value })}>{warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select></td><td className="p-2"><input type="date" className={inputClass} value={row.reviewDate} onChange={(event) => update(row.id, { reviewDate: event.target.value })} /></td><td className="p-2"><button type="button" aria-label="Αφαίρεση γραμμής" onClick={() => setRows((current) => current.filter((item) => item.id !== row.id))} className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><X size={16} /></button></td></tr>)}</tbody></table></div><div className="flex flex-col gap-3 rounded-2xl bg-slate-900 p-4 text-white sm:flex-row sm:items-center sm:justify-between"><button type="button" className="inline-flex items-center gap-2 text-sm font-black" onClick={() => setRows((current) => [...current, newConsignmentRow()])}><Plus size={17} /> Προσθήκη γραμμής</button><div className="flex flex-wrap gap-5 text-xs"><span>{rows.reduce((sum, row) => sum + row.quantity, 0)} τεμάχια</span><span>Κόστος <strong>{formatGreekMoney(totalCost)}</strong></span><span>Αξία <strong>{formatGreekMoney(totalValue)}</strong></span></div></div><div className="flex justify-end gap-2"><button className={secondaryButton} onClick={onClose}>Ακύρωση</button><button className={primaryButton} disabled={!valid || saving} onClick={submit}>{saving && <Loader2 size={16} className="animate-spin" />} Δημιουργία όλων</button></div></div></ModalShell>;
}

function RepairIntakeCreator({ customers, products, orders, consignmentSales, previousRepairItem, defaultSellerId, onClose, onSubmit, saving }: { customers: any[]; products: any[]; orders: any[]; consignmentSales: ConsignmentSaleOption[]; previousRepairItem?: RepairItem | null; defaultSellerId?: string; onClose: () => void; onSubmit: (input: any) => Promise<void>; saving: boolean }) {
  const [customerId, setCustomerId] = useState(previousRepairItem?.customer_id || '');
  const [notes, setNotes] = useState('');
  const [rows, setRows] = useState<RepairDraftRow[]>(() => [newRepairRow(previousRepairItem)]);
  const customerOrders = orders.filter((order) => order.customer_id === customerId);
  const customerConsignmentSales = consignmentSales.filter((sale) => sale.customerId === customerId);
  const purchasedSkus = new Set(customerOrders.flatMap((order) => order.items?.map((item: any) => item.sku) || []));
  const sortedProducts = [...products].sort((a, b) => Number(purchasedSkus.has(b.sku)) - Number(purchasedSkus.has(a.sku)) || a.sku.localeCompare(b.sku));
  const update = (id: string, patch: Partial<RepairDraftRow>) => setRows((current) => current.map((row) => row.id === id ? { ...row, ...patch } : row));
  const valid = customerId && rows.length > 0 && rows.every((row) => row.description.trim() && (row.originType !== 'recorded_sale' || row.orderId || row.sourceConsignmentSettlementId));
  const submit = () => onSubmit({ customerId, sellerId: defaultSellerId || null, notes: notes || null, items: rows.map((row) => ({ origin_type: row.originType, source_order_id: row.orderId || null, source_order_line_id: row.orderLineId || null, source_consignment_settlement_id: row.sourceConsignmentSettlementId || null, product_sku: row.sku || null, variant_suffix: row.variantSuffix, size_info: row.sizeInfo, description: row.description.trim(), intake_condition: row.intakeCondition || null, accessories: row.accessories || null, previous_repair_item_id: row.previousRepairItemId || null })) });
  return <ModalShell title="Παραλαβή Επισκευών" subtitle="Μία παραλαβή πελάτη με ξεχωριστή ταυτότητα και παρτίδα ανά φυσικό τεμάχιο." onClose={onClose} wide><div className="space-y-4">{previousRepairItem && <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800"><strong>Συνδεδεμένη επανεπισκευή:</strong> το νέο δελτίο θα συνδεθεί με το κλεισμένο {previousRepairItem.code}, χωρίς να το ξανανοίξει.</div>}<div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 md:grid-cols-2"><label><span className="mb-1 block text-xs font-bold text-slate-600">Πελάτης *</span><select className={inputClass} value={customerId} onChange={(event) => setCustomerId(event.target.value)} disabled={Boolean(previousRepairItem)}><option value="">Επιλέξτε πελάτη…</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.full_name}</option>)}</select></label><label><span className="mb-1 block text-xs font-bold text-slate-600">Σημειώσεις παραλαβής</span><input className={inputClass} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Προαιρετική κοινή σημείωση" /></label></div>{rows.map((row, index) => { const selectedOrder = customerOrders.find((order) => order.id === row.orderId); return <div key={row.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="mb-3 flex items-center justify-between"><h3 className="font-black text-slate-800">Τεμάχιο {index + 1}</h3><button className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600" onClick={() => setRows((current) => current.filter((item) => item.id !== row.id))} aria-label="Αφαίρεση τεμαχίου"><X size={16} /></button></div><div className="grid gap-3 md:grid-cols-3"><label><span className="mb-1 block text-xs font-bold text-slate-600">Προέλευση *</span><select className={inputClass} value={row.originType} onChange={(event) => update(row.id, { originType: event.target.value as RepairOriginType, orderId: '', orderLineId: '', sourceConsignmentSettlementId: '' })}>{Object.entries(REPAIR_ORIGIN_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>{row.originType === 'recorded_sale' && <><label><span className="mb-1 block text-xs font-bold text-slate-600">Προηγούμενη παραγγελία</span><select className={inputClass} value={row.orderId} onChange={(event) => update(row.id, { orderId: event.target.value, orderLineId: '', sourceConsignmentSettlementId: '' })}><option value="">Καμία παραγγελία</option>{customerOrders.map((order) => <option key={order.id} value={order.id}>{order.id} · {formatGreekDateOnly(order.created_at)}</option>)}</select></label><label><span className="mb-1 block text-xs font-bold text-slate-600">Πώληση Παρακαταθήκης</span><select className={inputClass} value={row.sourceConsignmentSettlementId} onChange={(event) => { const sale = customerConsignmentSales.find((entry) => entry.id === event.target.value); update(row.id, { sourceConsignmentSettlementId: event.target.value, orderId: '', orderLineId: '', sku: sale?.sku || row.sku, variantSuffix: sale?.variantSuffix || '', sizeInfo: sale?.sizeInfo || '' }); }}><option value="">Καμία πώληση Παρακαταθήκης</option>{customerConsignmentSales.map((sale) => <option key={sale.id} value={sale.id}>{sale.sku}{sale.variantSuffix} · {formatGreekDateOnly(sale.soldAt)}</option>)}</select></label></>}<label><span className="mb-1 block text-xs font-bold text-slate-600">SKU</span><select className={inputClass} value={row.sku} onChange={(event) => update(row.id, { sku: event.target.value })}><option value="">Χωρίς SKU</option>{sortedProducts.map((product) => <option key={product.sku} value={product.sku}>{purchasedSkus.has(product.sku) ? 'Αγορά πελάτη · ' : ''}{product.sku}</option>)}</select></label>{selectedOrder && <label><span className="mb-1 block text-xs font-bold text-slate-600">Γραμμή πώλησης</span><select className={inputClass} value={row.orderLineId} onChange={(event) => { const item = selectedOrder.items?.find((entry: any) => entry.line_id === event.target.value); update(row.id, { orderLineId: event.target.value, sku: item?.sku || row.sku, variantSuffix: item?.variant_suffix || '', sizeInfo: item?.size_info || '' }); }}><option value="">Επιλέξτε…</option>{selectedOrder.items?.map((item: any) => <option key={item.line_id} value={item.line_id}>{item.sku}{item.variant_suffix || ''}</option>)}</select></label>}<label className="md:col-span-2"><span className="mb-1 block text-xs font-bold text-slate-600">Περιγραφή βλάβης *</span><textarea className={`${inputClass} min-h-20`} value={row.description} onChange={(event) => update(row.id, { description: event.target.value })} placeholder="Τι χρειάζεται επισκευή;" /></label><label><span className="mb-1 block text-xs font-bold text-slate-600">Κατάσταση παραλαβής</span><input className={inputClass} value={row.intakeCondition} onChange={(event) => update(row.id, { intakeCondition: event.target.value })} placeholder="Γρατζουνιές, φθορά…" /></label><label><span className="mb-1 block text-xs font-bold text-slate-600">Παρελκόμενα</span><input className={inputClass} value={row.accessories} onChange={(event) => update(row.id, { accessories: event.target.value })} placeholder="Κουτί, αλυσίδα…" /></label></div></div>; })}{!previousRepairItem && <button className={secondaryButton} onClick={() => setRows((current) => [...current, newRepairRow()])}><Plus size={16} /> Προσθήκη τεμαχίου</button>}<div className="flex justify-end gap-2"><button className={secondaryButton} onClick={onClose}>Ακύρωση</button><button className={primaryButton} disabled={!valid || saving} onClick={submit}>{saving && <Loader2 size={16} className="animate-spin" />} Οριστικοποίηση παραλαβής</button></div></div></ModalShell>;
}

function OperationModal({ operation, warehouses, onClose, onSubmit }: { operation: Operation; warehouses: any[]; onClose: () => void; onSubmit: (payload: any) => Promise<unknown> }) {
  const [quantity, setQuantity] = useState(operation.kind === 'sale' || operation.kind === 'return' ? Math.min(1, operation.line.pending_quantity) : 1);
  const [amount, setAmount] = useState(operation.kind === 'sale' || operation.kind === 'price' ? Number(operation.line.locked_unit_price) : operation.kind === 'payment' ? Number(operation.settlement.total_amount) - Number(operation.settlement.paid_amount) : 0);
  const [paidAmount, setPaidAmount] = useState(0);
  const [reason, setReason] = useState('');
  const [method, setMethod] = useState('Μετρητά');
  const [resolution, setResolution] = useState<'restocked' | 'production' | 'damaged'>('restocked');
  const [warehouseId, setWarehouseId] = useState(SYSTEM_IDS.CENTRAL);
  const [stage, setStage] = useState('Waxing');
  const [costType, setCostType] = useState<'labor' | 'material' | 'component' | 'external'>('labor');
  const [chargeType, setChargeType] = useState<'warranty' | 'chargeable' | 'unrecorded'>('unrecorded');
  const [sku, setSku] = useState('');
  const title = operation.kind === 'sale' ? 'Δήλωση πώλησης' : operation.kind === 'payment' ? 'Καταγραφή είσπραξης' : operation.kind === 'return' ? 'Παραλαβή επιστροφής' : operation.kind === 'route-return' ? 'Δρομολόγηση επιστροφής' : operation.kind === 'price' ? 'Αλλαγή κλειδωμένης τιμής' : operation.kind === 'reverse-sale' ? 'Αντιστροφή πώλησης' : operation.kind === 'reverse-return' ? 'Αντιστροφή επιστροφής' : operation.kind === 'cancel-consignment' ? 'Ακύρωση Παρακαταθήκης' : operation.kind === 'quality' ? (operation.passed ? 'Επιτυχής ποιοτικός έλεγχος' : 'Επανεργασία Επισκευής') : operation.kind === 'cost' ? 'Καταγραφή κόστους' : operation.kind === 'charge' ? 'Χρέωση Επισκευής' : 'Αλλαγή κατάστασης';
  const needsReason = ['route-return', 'exception', 'cost', 'price', 'reverse-sale', 'reverse-return', 'cancel-consignment'].includes(operation.kind) || (operation.kind === 'quality' && !operation.passed) || (operation.kind === 'sale' && amount !== Number(operation.line.locked_unit_price));
  const submit = () => onSubmit({ quantity, amount, paidAmount, reason, method, resolution, warehouseId, stage, costType, chargeType, sku });
  return <ModalShell title={title} onClose={onClose}><div className="space-y-4">{(operation.kind === 'sale' || operation.kind === 'return' || operation.kind === 'cost') && <label><span className="mb-1 block text-xs font-bold text-slate-600">Ποσότητα</span><input type="number" min={1} max={operation.kind === 'sale' || operation.kind === 'return' ? operation.line.pending_quantity : undefined} className={inputClass} value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} /></label>}{(operation.kind === 'sale' || operation.kind === 'payment' || operation.kind === 'cost' || operation.kind === 'charge' || operation.kind === 'price') && <label><span className="mb-1 block text-xs font-bold text-slate-600">{operation.kind === 'sale' || operation.kind === 'price' ? 'Τιμή ανά τεμάχιο' : operation.kind === 'cost' ? 'Κόστος ανά μονάδα' : 'Ποσό'}</span><input type="number" min={0} step="0.01" className={inputClass} value={amount} onChange={(event) => setAmount(Number(event.target.value))} /></label>}{operation.kind === 'payment' && <label><span className="mb-1 block text-xs font-bold text-slate-600">Τρόπος είσπραξης</span><input className={inputClass} value={method} onChange={(event) => setMethod(event.target.value)} /></label>}{operation.kind === 'route-return' && <><label><span className="mb-1 block text-xs font-bold text-slate-600">Αποτέλεσμα ελέγχου</span><select className={inputClass} value={resolution} onChange={(event) => setResolution(event.target.value as any)}><option value="restocked">Επιστροφή σε διαθέσιμο απόθεμα</option><option value="production">Φρεσκάρισμα στην Παραγωγή</option><option value="damaged">Ζημιά / καταγεγραμμένη διαφορά</option></select></label>{resolution === 'restocked' && <label><span className="mb-1 block text-xs font-bold text-slate-600">Αποθήκη προορισμού</span><select className={inputClass} value={warehouseId} onChange={(event) => setWarehouseId(event.target.value)}>{warehouses.filter((warehouse) => ![SYSTEM_IDS.CONSIGNMENTS, SYSTEM_IDS.RETURN_INSPECTION].includes(warehouse.id)).map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select></label>}</>}{operation.kind === 'quality' && !operation.passed && <label><span className="mb-1 block text-xs font-bold text-slate-600">Στάδιο επιστροφής</span><select className={inputClass} value={stage} onChange={(event) => setStage(event.target.value)}><option value="Waxing">Κέρωμα</option><option value="Casting">Χύτευση</option><option value="Setting">Καρφωτική</option><option value="Polishing">Λουστράρισμα</option><option value="Assembly">Συναρμολόγηση</option><option value="Labeling">Ετικετοποίηση</option></select></label>}{operation.kind === 'cost' && <><label><span className="mb-1 block text-xs font-bold text-slate-600">Τύπος κόστους</span><select className={inputClass} value={costType} onChange={(event) => setCostType(event.target.value as any)}><option value="labor">Εργασία</option><option value="material">Υλικό</option><option value="component">Εξάρτημα</option><option value="external">Εξωτερική εργασία</option></select></label>{['material', 'component'].includes(costType) && <><input className={inputClass} value={sku} onChange={(event) => setSku(event.target.value)} placeholder="SKU υλικού ή εξαρτήματος" /><select className={inputClass} value={warehouseId} onChange={(event) => setWarehouseId(event.target.value)}>{warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select></>}</>}{operation.kind === 'charge' && <><label><span className="mb-1 block text-xs font-bold text-slate-600">Τύπος χρέωσης</span><select className={inputClass} value={chargeType} onChange={(event) => setChargeType(event.target.value as any)}>{Object.entries(REPAIR_CHARGE_TYPE_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><label><span className="mb-1 block text-xs font-bold text-slate-600">Ήδη εισπραχθέν ποσό</span><input type="number" min={0} step="0.01" className={inputClass} value={paidAmount} onChange={(event) => setPaidAmount(Number(event.target.value))} /></label></>}<label><span className="mb-1 block text-xs font-bold text-slate-600">{needsReason ? 'Αιτιολογία *' : 'Σημείωση'}</span><textarea className={`${inputClass} min-h-24`} value={reason} onChange={(event) => setReason(event.target.value)} /></label><div className="flex justify-end gap-2"><button className={secondaryButton} onClick={onClose}>Ακύρωση</button><button className={primaryButton} disabled={needsReason && !reason.trim()} onClick={submit}>Καταχώριση</button></div></div></ModalShell>;
}
