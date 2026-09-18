import React, { useMemo, useState } from 'react';
import {
  ArrowRightLeft,
  Banknote,
  Boxes,
  CheckCircle2,
  ClipboardCheck,
  FilePlus2,
  Filter,
  HandHeart,
  ImagePlus,
  LayoutGrid,
  Loader2,
  PackageCheck,
  Pencil,
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
import { useQueryClient } from '@tanstack/react-query';
import { invalidateCustomerService, invalidateProductionBatches } from '../lib/queryInvalidation';
import { useCustomers, useOrdersWithItems } from '../hooks/api/useOrders';
import { useProducts } from '../hooks/api/useProducts';
import { useWarehouses } from '../hooks/api/useWarehouses';
import { useSellers } from '../hooks/api/useSellers';
import { useCustomerServiceActions, useCustomerServiceWorkspace } from '../hooks/api/useCustomerService';
import { useProductionBatches } from '../hooks/api/useProductionBatches';
import { productionRepository } from '../features/production';
import type {
  Consignment,
  ConsignmentEvent,
  ConsignmentLine,
  ConsignmentReturn,
  ConsignmentSettlement,
  Product,
  ProductionBatch,
  RepairItem,
} from '../types';
import { ProductionStage } from '../types';
import {
  CONSIGNMENT_EVENT_LABELS,
  CONSIGNMENT_STATUS_LABELS,
  FINANCIAL_STATUS_LABELS,
  REPAIR_CHARGE_TYPE_LABELS,
  REPAIR_COST_TYPE_LABELS,
  REPAIR_EVENT_LABELS,
  REPAIR_ORIGIN_LABELS,
  REPAIR_READY_CONFIRM,
  REPAIR_STATUS_LABELS,
  countRepairsInProduction,
  findLiveRepairBatch,
  formatGreekDateOnly,
  formatGreekDateTime,
  formatGreekMoney,
  formatGreekNumber,
  canEditPendingConsignment,
} from '../features/customerService';
import { SYSTEM_IDS } from '../lib/supabase';
import RepairQrButton from './customerService/RepairQrButton';
import BulkConsignmentWorkbench from './customerService/BulkConsignmentWorkbench';
import ConsignmentBadge from './customerService/ConsignmentBadge';
import ConsignmentEditModal from './customerService/ConsignmentEditModal';
import ConsignmentSkuThumb from './customerService/ConsignmentSkuThumb';
import RepairBadge from './customerService/RepairBadge';
import RepairIntakeWorkbench from './customerService/RepairIntakeWorkbench';
import RepairDetailModal from './customerService/RepairDetailModal';
import RepairStageBadge from './customerService/RepairStageBadge';
import ViewportPortal from './customerService/ViewportPortal';
import SkuColorizedText from './SkuColorizedText';
import SkuProductPicker from './legal/SkuProductPicker';
import { getCatalogSelectionPricing } from '../utils/skuProductPicker';
import { PRODUCTION_STAGES } from '../utils/productionStages';
import DesktopPageHeader from './DesktopPageHeader';
import {
  BTN_PRIMARY,
  BTN_SECONDARY,
  CARD,
  PAGE_CONTAINER,
  STAT_BOX,
  STAT_INDIGO,
  STAT_SLATE,
  STAT_EMERALD,
  STAT_RED,
  STAT_AMBER,
  STAT_BLUE,
  tailTabButton,
} from './ui/designTokens';

export type CustomerServiceMode = 'consignments' | 'repairs';
type ConsignmentListView = 'all' | 'clients' | 'activity';
type RepairListView = 'all' | 'clients' | 'activity';
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
const secondaryButton = BTN_SECONDARY;
const primaryButton = BTN_PRIMARY;

function ModalShell({ title, subtitle, onClose, children, wide = false }: { title: string; subtitle?: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <ViewportPortal>
    <div className="fixed inset-0 z-[190] flex items-center justify-center bg-slate-950/55 p-3 backdrop-blur-sm print:hidden" role="dialog" aria-modal="true" aria-label={title}>
      <div className={`flex max-h-[94vh] w-full flex-col overflow-hidden rounded-3xl border border-white/40 bg-slate-50 shadow-2xl ${wide ? 'max-w-6xl' : 'max-w-xl'}`}>
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4">
          <div><h2 className="text-lg font-black text-slate-900">{title}</h2>{subtitle && <p className="mt-1 text-xs text-slate-500">{subtitle}</p>}</div>
          <button type="button" onClick={onClose} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Κλείσιμο"><X size={19} /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
      </div>
    </div>
    </ViewportPortal>
  );
}

export default function CustomerServiceWorkspace({ mode }: { mode: CustomerServiceMode }) {
  const { profile } = useAuth();
  const { showToast, confirm } = useUI();
  const queryClient = useQueryClient();
  const isConsignments = mode === 'consignments';
  const [consignmentView, setConsignmentView] = useState<ConsignmentListView>('all');
  const [repairView, setRepairView] = useState<RepairListView>('all');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('active');
  const [customerFilter, setCustomerFilter] = useState('');
  const [showConsignmentCreator, setShowConsignmentCreator] = useState(false);
  const [showRepairCreator, setShowRepairCreator] = useState(false);
  const [previousRepairItem, setPreviousRepairItem] = useState<RepairItem | null>(null);
  const [operation, setOperation] = useState<Operation | null>(null);
  const [selectedConsignmentId, setSelectedConsignmentId] = useState<string | null>(null);
  const [editingConsignmentId, setEditingConsignmentId] = useState<string | null>(null);
  const [selectedRepairId, setSelectedRepairId] = useState<string | null>(null);
  const { data, isLoading, error } = useCustomerServiceWorkspace();
  const { data: productionBatches = [] } = useProductionBatches();
  const [movingRepairId, setMovingRepairId] = useState<string | null>(null);
  const actions = useCustomerServiceActions();
  const canSeeCost = profile?.role !== 'seller';
  const openRepairCreator = (previous: RepairItem | null = null) => { setPreviousRepairItem(previous); setShowRepairCreator(true); };
  const { data: customers = [] } = useCustomers();
  const { data: products = [] } = useProducts();
  const { data: warehouses = [] } = useWarehouses();
  const { data: sellers = [] } = useSellers();
  const { data: orders = [] } = useOrdersWithItems({ enabled: showRepairCreator || showConsignmentCreator });

  const customerById = useMemo(() => new Map(customers.map((customer) => [customer.id, customer])), [customers]);
  const sellerById = useMemo(() => new Map(sellers.map((seller) => [seller.id, seller])), [sellers]);
  const productBySku = useMemo(() => new Map(products.map((product) => [product.sku, product])), [products]);
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
    const archived = item.is_archived === true;
    const matchesStatus = statusFilter === 'archived'
      ? archived
      : statusFilter === 'all'
        ? true
        : statusFilter === 'active'
          ? !archived && !['delivered', 'irreparable', 'cancelled'].includes(item.status)
          : !archived && item.status === statusFilter;
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
      dueSoon: (data?.consignments || []).filter((item) => {
        if (!['active', 'partially_settled'].includes(item.status) || !item.review_due_at) return false;
        const due = new Date(`${item.review_due_at}T00:00:00`);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const soon = new Date(today);
        soon.setDate(soon.getDate() + 7);
        return due >= today && due <= soon;
      }).length,
    };
  }, [data]);
  const repairStats = useMemo(() => {
    const visible = (data?.repairItems || []).filter((item) => item.is_archived !== true);
    return {
      active: visible.filter((item) => !['delivered', 'irreparable', 'cancelled'].includes(item.status)).length,
      production: countRepairsInProduction(visible, productionBatches),
      quality: visible.filter((item) => item.status === 'quality_check').length,
      ready: visible.filter((item) => item.status === 'ready_for_return').length,
      rework: visible.filter((item) => item.current_cycle_number > 1).length,
      cost: (data?.repairCostLines || []).reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unit_cost || 0), 0),
      charges: (data?.repairCharges || []).reduce((sum, item) => sum + Number(item.amount || 0), 0),
    };
  }, [data, productionBatches]);

  const safeAction = async (action: () => Promise<unknown>, success: string): Promise<boolean> => {
    try { await action(); showToast(success, 'success'); setOperation(null); return true; }
    catch (actionError) { showToast(actionError instanceof Error ? actionError.message : 'Η ενέργεια δεν ολοκληρώθηκε.', 'error'); return false; }
  };

  const liveRepairBatch = (item: RepairItem) => findLiveRepairBatch(
    item.id,
    (data?.repairCycles || []).filter((cycle) => cycle.repair_item_id === item.id),
    productionBatches,
  );

  const completeRepairReady = async (item: RepairItem) => {
    const yes = await confirm({
      title: REPAIR_READY_CONFIRM.title,
      message: REPAIR_READY_CONFIRM.message(item.code),
      confirmText: REPAIR_READY_CONFIRM.confirmText,
    });
    if (!yes) return false;
    return safeAction(() => actions.completeRepairProduction.mutateAsync(item.id), 'Η Επισκευή μεταφέρθηκε σε Ποιοτικό έλεγχο και αφαιρέθηκε από την Παραγωγή.');
  };

  const handleRepairStageMove = async (item: RepairItem, stage: ProductionStage, options?: { pendingDispatch?: boolean }) => {
    const batch = liveRepairBatch(item);
    if (!batch) {
      showToast('Η Επισκευή δεν έχει ενεργή παρτίδα Παραγωγής.', 'error');
      return;
    }
    if (stage === ProductionStage.Ready) {
      await completeRepairReady(item);
      return;
    }
    setMovingRepairId(item.id);
    try {
      if (batch.current_stage === ProductionStage.Polishing && stage === ProductionStage.Polishing) {
        if (options?.pendingDispatch === false) await productionRepository.markBatchesDispatched([batch.id], profile?.full_name);
        else await productionRepository.markBatchesPendingDispatch([batch.id], profile?.full_name);
      } else {
        await productionRepository.updateBatchStage(batch.id, stage, profile?.full_name, options?.pendingDispatch);
      }
      await Promise.all([invalidateCustomerService(queryClient), invalidateProductionBatches(queryClient)]);
      showToast('Η παρτίδα μετακινήθηκε.', 'success');
    } catch (moveError) {
      showToast(moveError instanceof Error ? moveError.message : 'Η μετακίνηση δεν ολοκληρώθηκε.', 'error');
    } finally {
      setMovingRepairId(null);
    }
  };

  const handleRepairHold = (item: RepairItem) => {
    const batch = liveRepairBatch(item);
    const held = !!batch?.on_hold || item.status === 'on_hold';
    if (held) {
      void safeAction(
        () => actions.setRepairExceptionState.mutateAsync({ repairItemId: item.id, status: 'in_production', reason: 'Συνέχεια παραγωγής' }),
        'Η Επισκευή συνεχίζει την Παραγωγή.',
      );
      return;
    }
    setOperation({ kind: 'exception', item, status: 'on_hold' });
  };

  const handleRepairRemove = async (item: RepairItem) => {
    const yes = await confirm({
      title: 'Αφαίρεση από Παραγωγή',
      message: `Η επισκευή ${item.code} θα αφαιρεθεί από την Παραγωγή και θα επιστρέψει σε κατάσταση παραλαβής.`,
      confirmText: 'Αφαίρεση',
    });
    if (!yes) return;
    await safeAction(
      () => actions.removeRepairFromProduction.mutateAsync({ repairItemId: item.id, reason: 'Αφαίρεση από Παραγωγή' }),
      'Η Επισκευή αφαιρέθηκε από την Παραγωγή.',
    );
  };

  const handleRepairDelete = async (item: RepairItem) => {
    const yes = await confirm({
      title: 'Διαγραφή Επισκευής',
      message: `Είστε σίγουροι ότι θέλετε να διαγράψετε οριστικά την επισκευή ${item.code};`,
      isDestructive: true,
      confirmText: 'Διαγραφή',
    });
    if (!yes) return;
    const ok = await safeAction(
      () => actions.deleteRepairItem.mutateAsync({ repairItemId: item.id, reason: 'Διαγραφή από χρήστη' }),
      'Η Επισκευή διαγράφηκε.',
    );
    if (ok) setSelectedRepairId(null);
  };

  const handleRepairArchive = async (item: RepairItem) => {
    const archive = item.is_archived !== true;
    const yes = await confirm({
      title: archive ? 'Αρχειοθέτηση Επισκευής' : 'Ανάκτηση από Αρχείο',
      message: archive
        ? `Η επισκευή ${item.code} θα αρχειοθετηθεί και θα κρυφτεί από τις ενεργές λίστες.`
        : `Η επισκευή ${item.code} θα επανέλθει στις ενεργές λίστες.`,
      confirmText: archive ? 'Αρχειοθέτηση' : 'Ανάκτηση',
    });
    if (!yes) return;
    await safeAction(
      () => actions.archiveRepairItem.mutateAsync({ repairItemId: item.id, archive }),
      archive ? 'Η Επισκευή αρχειοθετήθηκε.' : 'Η Επισκευή ανακτήθηκε από το αρχείο.',
    );
  };

  const selectedConsignment = consignments.find((entry) => entry.id === selectedConsignmentId)
    || (data?.consignments || []).find((entry) => entry.id === selectedConsignmentId)
    || null;
  const editingConsignment = (data?.consignments || []).find((entry) => entry.id === editingConsignmentId) || null;
  const sourceWarehouses = warehouses.filter((warehouse) => ![SYSTEM_IDS.CONSIGNMENTS, SYSTEM_IDS.RETURN_INSPECTION].includes(warehouse.id));
  const openConsignmentEdit = (entry: Consignment) => {
    setSelectedConsignmentId(null);
    setEditingConsignmentId(entry.id);
  };
  const selectedRepair = repairs.find((item) => item.id === selectedRepairId)
    || (data?.repairItems || []).find((item) => item.id === selectedRepairId)
    || null;
  const consignmentsByClient = useMemo(() => {
    const groups = new Map<string, Consignment[]>();
    for (const entry of consignments) {
      if (!groups.has(entry.customer_id)) groups.set(entry.customer_id, []);
      groups.get(entry.customer_id)!.push(entry);
    }
    return [...groups.entries()];
  }, [consignments]);
  const activityEvents = useMemo(
    () => [...(data?.consignmentEvents || [])].sort((left, right) => right.created_at.localeCompare(left.created_at)),
    [data?.consignmentEvents],
  );
  const repairsByClient = useMemo(() => {
    const groups = new Map<string, RepairItem[]>();
    for (const item of repairs) {
      if (!groups.has(item.customer_id)) groups.set(item.customer_id, []);
      groups.get(item.customer_id)!.push(item);
    }
    return [...groups.entries()];
  }, [repairs]);
  const repairActivityEvents = useMemo(
    () => [...(data?.repairEvents || [])].sort((left, right) => right.created_at.localeCompare(left.created_at)),
    [data?.repairEvents],
  );

  const renderConsignmentCard = (entry: Consignment) => {
    const lines = (data?.consignmentLines || []).filter((line) => line.consignment_id === entry.id);
    const settlements = (data?.consignmentSettlements || []).filter((settlement) => lines.some((line) => line.id === settlement.consignment_line_id));
    const returns = (data?.consignmentReturns || []).filter((item) => lines.some((line) => line.id === item.consignment_line_id));
    return (
      <ConsignmentCard
        key={entry.id}
        entry={entry}
        lines={lines}
        settlements={settlements}
        returns={returns}
        customerName={customerById.get(entry.customer_id)?.full_name || 'Άγνωστος πελάτης'}
        sellerName={entry.seller_id ? sellerById.get(entry.seller_id)?.full_name : undefined}
        productBySku={productBySku}
        canSeeCost={canSeeCost}
        isAdmin={profile?.role === 'admin'}
        onOpen={() => setSelectedConsignmentId(entry.id)}
        onHandoff={async () => {
          const accepted = await confirm({ title: 'Παράδοση Παρακαταθήκης', message: 'Θα μετακινηθούν τα τεμάχια στην προστατευμένη θέση «Παρακαταθήκες Πελατών». Συνέχεια;', confirmText: 'Παράδοση' });
          if (accepted) safeAction(() => actions.handoffConsignment.mutateAsync(entry.id), 'Η Παρακαταθήκη παραδόθηκε και το απόθεμα ενημερώθηκε.');
        }}
        onEdit={() => openConsignmentEdit(entry)}
        onOperation={setOperation}
        onLegalDraft={(id) => safeAction(() => actions.createConsignmentLegalDraft.mutateAsync(id), 'Δημιουργήθηκε συνδεδεμένο πρόχειρο παραστατικό.')}
      />
    );
  };

  const renderRepairCard = (item: RepairItem) => (
    <RepairCard
      key={item.id}
      item={item}
      batch={liveRepairBatch(item)}
      customerName={customerById.get(item.customer_id)?.full_name || 'Άγνωστος πελάτης'}
      sellerName={item.seller_id ? sellerById.get(item.seller_id)?.full_name : undefined}
      product={item.product_sku ? productBySku.get(item.product_sku) : undefined}
      cost={costsByRepairId.get(item.id) || 0}
      charge={chargeByRepairId.get(item.id)}
      isSeller={profile?.role === 'seller'}
      onOpen={() => setSelectedRepairId(item.id)}
      onOperation={setOperation}
      onDelivered={() => safeAction(() => actions.markRepairDelivered.mutateAsync(item.id), 'Η Επισκευή σημειώθηκε ως παραδομένη.')}
      onNewLinkedRepair={() => openRepairCreator(item)}
      onLegalDraft={() => safeAction(() => actions.createRepairLegalDraft.mutateAsync(item.id), 'Δημιουργήθηκε συνδεδεμένο πρόχειρο παραστατικό υπηρεσίας.')}
      onUpload={(file) => safeAction(() => actions.uploadRepairAttachment.mutateAsync({ repairItemId: item.id, file }), 'Η φωτογραφία αποθηκεύτηκε με ασφαλή πρόσβαση.')}
      onHold={() => handleRepairHold(item)}
      onDelete={() => void handleRepairDelete(item)}
      onArchive={() => void handleRepairArchive(item)}
    />
  );

  return (
    <div className={`${PAGE_CONTAINER} min-h-full bg-slate-50 px-3 py-4 sm:px-5 lg:px-7`}>
      <div className="mx-auto flex max-w-[1600px] flex-col gap-5">
        <DesktopPageHeader
          icon={isConsignments ? HandHeart : Wrench}
          title={isConsignments ? 'Παρακαταθήκες' : 'Επισκευές'}
          subtitle={isConsignments
            ? 'Ιχνηλάτηση τεμαχίων στον πελάτη, επανέλεγχος και οικονομική τακτοποίηση — όχι απλή ετικέτα παραγγελίας.'
            : 'Παραλαβές επισκευών, παρτίδες Παραγωγής και επιστροφή τεμαχίων — χωριστά από τις Παρακαταθήκες.'}
          tail={(
            <>
              {isConsignments && canSeeCost && (
                <button className={BTN_SECONDARY} onClick={() => safeAction(async () => { const mismatches = await actions.checkConsignmentInventory.mutateAsync(); if (mismatches.length > 0) { const first = mismatches[0]; throw new Error(`Βρέθηκαν ${mismatches.length} διαφορές αποθήκης. Πρώτη διαφορά: ${first.product_sku}${first.variant_suffix}, αναμενόμενα ${first.expected_quantity}, πραγματικά ${first.actual_quantity}.`); } }, 'Η αποθήκη Παρακαταθηκών συμφωνεί πλήρως με τις ενεργές κατανομές.')}>
                  <ShieldCheck size={16} /> Έλεγχος συμφωνίας
                </button>
              )}
              {isConsignments && (
                <button className={BTN_PRIMARY} onClick={() => setShowConsignmentCreator(true)}><Plus size={17} /> Μαζική Δημιουργία</button>
              )}
              {!isConsignments && (
                <button className={BTN_PRIMARY} onClick={() => openRepairCreator()}><Wrench size={16} /> Παραλαβή Επισκευών</button>
              )}
            </>
          )}
        />

        {isConsignments ? (
          <div className={`grid grid-cols-2 gap-3 sm:grid-cols-3 ${canSeeCost ? 'xl:grid-cols-7' : 'xl:grid-cols-6'}`}>
            <div className={`${STAT_BOX} ${STAT_INDIGO} px-4`}><div className="text-[11px] font-bold uppercase tracking-wide">Με πελάτες</div><div className="text-2xl font-black">{formatGreekNumber(consignmentStats.pending)}</div></div>
            {canSeeCost && <div className={`${STAT_BOX} ${STAT_SLATE} px-4`}><div className="text-[11px] font-bold uppercase tracking-wide">Έκθεση κόστους</div><div className="text-2xl font-black">{formatGreekMoney(consignmentStats.cost)}</div></div>}
            <div className={`${STAT_BOX} ${STAT_BLUE} px-4`}><div className="text-[11px] font-bold uppercase tracking-wide">Αναμενόμενη αξία</div><div className="text-2xl font-black">{formatGreekMoney(consignmentStats.value)}</div></div>
            <div className={`${STAT_BOX} ${STAT_RED} px-4`}><div className="text-[11px] font-bold uppercase tracking-wide">Απλήρωτα</div><div className="text-2xl font-black">{formatGreekMoney(consignmentStats.due)}</div></div>
            <div className={`${STAT_BOX} ${STAT_AMBER} px-4`}><div className="text-[11px] font-bold uppercase tracking-wide">Λήγουν σύντομα</div><div className="text-2xl font-black">{formatGreekNumber(consignmentStats.dueSoon)}</div></div>
            <div className={`${STAT_BOX} ${STAT_RED} px-4`}><div className="text-[11px] font-bold uppercase tracking-wide">Εκπρόθεσμα</div><div className="text-2xl font-black">{formatGreekNumber(consignmentStats.overdue)}</div></div>
            <div className={`${STAT_BOX} ${STAT_EMERALD} px-4`}><div className="text-[11px] font-bold uppercase tracking-wide">Ενεργές</div><div className="text-2xl font-black">{formatGreekNumber(consignmentStats.active)}</div></div>
          </div>
        ) : (
          <div className={`grid grid-cols-2 gap-3 sm:grid-cols-4 ${canSeeCost ? 'xl:grid-cols-7' : 'xl:grid-cols-6'}`}>
            <div className={`${STAT_BOX} ${STAT_BLUE} px-4`}><div className="text-[11px] font-bold uppercase tracking-wide">Ενεργές</div><div className="text-2xl font-black">{formatGreekNumber(repairStats.active)}</div></div>
            <div className={`${STAT_BOX} ${STAT_SLATE} px-4`}><div className="text-[11px] font-bold uppercase tracking-wide">Στην Παραγωγή</div><div className="text-2xl font-black">{formatGreekNumber(repairStats.production)}</div></div>
            <div className={`${STAT_BOX} ${STAT_AMBER} px-4`}><div className="text-[11px] font-bold uppercase tracking-wide">Ποιοτικός έλεγχος</div><div className="text-2xl font-black">{formatGreekNumber(repairStats.quality)}</div></div>
            <div className={`${STAT_BOX} ${STAT_EMERALD} px-4`}><div className="text-[11px] font-bold uppercase tracking-wide">Έτοιμες</div><div className="text-2xl font-black">{formatGreekNumber(repairStats.ready)}</div></div>
            <div className={`${STAT_BOX} ${STAT_RED} px-4`}><div className="text-[11px] font-bold uppercase tracking-wide">Επανεπισκευές</div><div className="text-2xl font-black">{formatGreekNumber(repairStats.rework)}</div></div>
            {canSeeCost && <div className={`${STAT_BOX} ${STAT_SLATE} px-4`}><div className="text-[11px] font-bold uppercase tracking-wide">Εσωτερικό κόστος</div><div className="text-2xl font-black">{formatGreekMoney(repairStats.cost)}</div></div>}
            <div className={`${STAT_BOX} ${STAT_EMERALD} px-4`}><div className="text-[11px] font-bold uppercase tracking-wide">Χρεώσεις</div><div className="text-2xl font-black">{formatGreekMoney(repairStats.charges)}</div></div>
          </div>
        )}

        <section className={`${CARD} p-3`}>
          <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_220px_200px]">
            <label className="relative"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input className={`${inputClass} pl-9`} value={search} onChange={(event) => setSearch(event.target.value)} placeholder={isConsignments ? 'Κωδικός, πελάτης, SKU ή παραγγελία…' : 'Κωδικός επισκευής, πελάτης, SKU ή σημείωση…'} /></label>
            <label className="relative"><Users size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><select className={`${inputClass} pl-9`} value={customerFilter} onChange={(event) => setCustomerFilter(event.target.value)}><option value="">Όλοι οι πελάτες</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.full_name}</option>)}</select></label>
            <label className="relative"><Filter size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><select className={`${inputClass} pl-9`} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="active">Μόνο ενεργές</option><option value="all">Όλες οι καταστάσεις</option>{!isConsignments && <option value="archived">Αρχείο</option>}{isConsignments ? Object.entries(CONSIGNMENT_STATUS_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>) : Object.entries(REPAIR_STATUS_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          </div>
          {isConsignments && (
            <div className="mt-3 flex flex-wrap gap-1">
              <button type="button" className={tailTabButton(consignmentView === 'all')} onClick={() => setConsignmentView('all')}><LayoutGrid size={14} /> Όλες</button>
              <button type="button" className={tailTabButton(consignmentView === 'clients')} onClick={() => setConsignmentView('clients')}><Users size={14} /> Ανά πελάτη</button>
              <button type="button" className={tailTabButton(consignmentView === 'activity')} onClick={() => setConsignmentView('activity')}><ClipboardCheck size={14} /> Κινήσεις</button>
            </div>
          )}
          {!isConsignments && (
            <div className="mt-3 flex flex-wrap gap-1">
              <button type="button" className={tailTabButton(repairView === 'all')} onClick={() => setRepairView('all')}><LayoutGrid size={14} /> Όλες</button>
              <button type="button" className={tailTabButton(repairView === 'clients')} onClick={() => setRepairView('clients')}><Users size={14} /> Ανά πελάτη</button>
              <button type="button" className={tailTabButton(repairView === 'activity')} onClick={() => setRepairView('activity')}><ClipboardCheck size={14} /> Κινήσεις</button>
            </div>
          )}
        </section>

        {isLoading ? <div className="flex min-h-64 items-center justify-center text-slate-500"><Loader2 className="mr-2 animate-spin" /> Φόρτωση στοιχείων…</div> : error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm font-bold text-rose-700">Δεν ήταν δυνατή η φόρτωση: {error.message}</div> : isConsignments ? (
          consignmentView === 'activity' ? (
            <div className={`${CARD} divide-y divide-slate-100`}>
              {activityEvents.length === 0 ? <div className="p-8 text-center text-sm text-slate-400">Δεν υπάρχουν ακόμη κινήσεις.</div> : activityEvents.slice(0, 80).map((event) => {
                const parent = (data?.consignments || []).find((entry) => entry.id === event.consignment_id);
                return (
                  <button key={event.id} type="button" className="flex w-full items-start justify-between gap-3 p-4 text-left hover:bg-slate-50" onClick={() => setSelectedConsignmentId(event.consignment_id)}>
                    <div>
                      <div className="font-black text-slate-800">{CONSIGNMENT_EVENT_LABELS[event.event_type] || event.event_type}</div>
                      <div className="mt-1 text-xs text-slate-500">{parent?.code || event.consignment_id} · {customerById.get(parent?.customer_id || '')?.full_name || '—'}</div>
                    </div>
                    <div className="text-[11px] font-bold text-slate-400">{formatGreekDateTime(event.created_at)}</div>
                  </button>
                );
              })}
            </div>
          ) : consignmentView === 'clients' ? (
            <div className="space-y-4">
              {consignmentsByClient.length === 0 ? <EmptyState icon={<Boxes size={32} />} title="Δεν βρέθηκαν Παρακαταθήκες" text="Αλλάξτε τα φίλτρα ή ξεκινήστε μια νέα μαζική συνεδρία." action={() => setShowConsignmentCreator(true)} actionLabel="Νέα Παρακαταθήκη" /> : consignmentsByClient.map(([customerId, entries]) => {
                const lines = (data?.consignmentLines || []).filter((line) => entries.some((entry) => entry.id === line.consignment_id));
                const pending = lines.reduce((sum, line) => sum + line.pending_quantity, 0);
                const nextReview = entries.map((entry) => entry.review_due_at).filter(Boolean).sort()[0];
                return (
                  <section key={customerId} className={`${CARD} p-4`}>
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h3 className="font-black text-slate-900">{customerById.get(customerId)?.full_name || 'Άγνωστος πελάτης'}</h3>
                        <p className="text-xs text-slate-500">{entries.length} Παρακαταθήκες · {formatGreekNumber(pending)} τεμ. στον πελάτη · επόμενος επανέλεγχος {formatGreekDateOnly(nextReview)}</p>
                      </div>
                      <ConsignmentBadge compact />
                    </div>
                    <div className="space-y-3">{entries.map(renderConsignmentCard)}</div>
                  </section>
                );
              })}
            </div>
          ) : (
            <div className="space-y-3">{consignments.length === 0 ? <EmptyState icon={<Boxes size={32} />} title="Δεν βρέθηκαν Παρακαταθήκες" text="Αλλάξτε τα φίλτρα ή ξεκινήστε μια νέα μαζική συνεδρία." action={() => setShowConsignmentCreator(true)} actionLabel="Νέα Παρακαταθήκη" /> : consignments.map(renderConsignmentCard)}</div>
          )
        ) : repairView === 'activity' ? (
          <div className={`${CARD} divide-y divide-slate-100`}>
            {repairActivityEvents.length === 0 ? <div className="p-8 text-center text-sm text-slate-400">Δεν υπάρχουν ακόμη κινήσεις.</div> : repairActivityEvents.slice(0, 80).map((event) => {
              const parent = (data?.repairItems || []).find((item) => item.id === event.repair_item_id);
              return (
                <button key={event.id} type="button" className="flex w-full items-start justify-between gap-3 p-4 text-left hover:bg-slate-50" onClick={() => setSelectedRepairId(event.repair_item_id)}>
                  <div>
                    <div className="font-black text-slate-800">{REPAIR_EVENT_LABELS[event.event_type] || event.event_type}</div>
                    <div className="mt-1 text-xs text-slate-500">{parent?.code || event.repair_item_id} · {customerById.get(parent?.customer_id || '')?.full_name || '—'}</div>
                  </div>
                  <div className="text-[11px] font-bold text-slate-400">{formatGreekDateTime(event.created_at)}</div>
                </button>
              );
            })}
          </div>
        ) : repairView === 'clients' ? (
          <div className="space-y-4">
            {repairsByClient.length === 0 ? <EmptyState icon={<Wrench size={32} />} title="Δεν βρέθηκαν Επισκευές" text="Αλλάξτε τα φίλτρα ή καταχωρίστε νέα παραλαβή." action={() => openRepairCreator()} actionLabel="Παραλαβή Επισκευών" /> : repairsByClient.map(([customerId, items]) => (
              <section key={customerId} className={`${CARD} p-4`}>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="font-black text-slate-900">{customerById.get(customerId)?.full_name || 'Άγνωστος πελάτης'}</h3>
                    <p className="text-xs text-slate-500">{items.length} Επισκευές · {items.filter((item) => !['delivered', 'irreparable', 'cancelled'].includes(item.status)).length} ενεργές</p>
                  </div>
                  <RepairBadge compact />
                </div>
                <div className="grid gap-3 xl:grid-cols-2">{items.map(renderRepairCard)}</div>
              </section>
            ))}
          </div>
        ) : (
          <div className="grid gap-3 xl:grid-cols-2">{repairs.length === 0 ? <div className="xl:col-span-2"><EmptyState icon={<Wrench size={32} />} title="Δεν βρέθηκαν Επισκευές" text="Αλλάξτε τα φίλτρα ή καταχωρίστε νέα παραλαβή." action={() => openRepairCreator()} actionLabel="Παραλαβή Επισκευών" /></div> : repairs.map(renderRepairCard)}</div>
        )}
      </div>

      {isConsignments && showConsignmentCreator && (
        <BulkConsignmentWorkbench
          customers={customers}
          products={products}
          orders={orders}
          existingOrderLineIds={existingOrderLineIds}
          warehouses={sourceWarehouses}
          defaultSellerId={profile?.role === 'seller' ? profile.id : undefined}
          canSeeCost={canSeeCost}
          onClose={() => setShowConsignmentCreator(false)}
          onSubmit={async (groups) => { if (await safeAction(() => actions.createBulkConsignments.mutateAsync(groups), 'Οι Παρακαταθήκες δημιουργήθηκαν με επιτυχία.')) setShowConsignmentCreator(false); }}
          saving={actions.createBulkConsignments.isPending}
        />
      )}
      {selectedConsignment && isConsignments && (
        <ConsignmentDetailModal
          entry={selectedConsignment}
          lines={(data?.consignmentLines || []).filter((line) => line.consignment_id === selectedConsignment.id)}
          settlements={(data?.consignmentSettlements || [])}
          returns={(data?.consignmentReturns || [])}
          events={(data?.consignmentEvents || []).filter((event) => event.consignment_id === selectedConsignment.id)}
          customerName={customerById.get(selectedConsignment.customer_id)?.full_name || 'Άγνωστος πελάτης'}
          sellerName={selectedConsignment.seller_id ? sellerById.get(selectedConsignment.seller_id)?.full_name : undefined}
          productBySku={productBySku}
          canSeeCost={canSeeCost}
          isAdmin={profile?.role === 'admin'}
          onClose={() => setSelectedConsignmentId(null)}
          onHandoff={async () => {
            const accepted = await confirm({ title: 'Παράδοση Παρακαταθήκης', message: 'Θα μετακινηθούν τα τεμάχια στην προστατευμένη θέση «Παρακαταθήκες Πελατών». Συνέχεια;', confirmText: 'Παράδοση' });
            if (accepted) safeAction(() => actions.handoffConsignment.mutateAsync(selectedConsignment.id), 'Η Παρακαταθήκη παραδόθηκε και το απόθεμα ενημερώθηκε.');
          }}
          onEdit={() => openConsignmentEdit(selectedConsignment)}
          onOperation={setOperation}
          onLegalDraft={(id) => safeAction(() => actions.createConsignmentLegalDraft.mutateAsync(id), 'Δημιουργήθηκε συνδεδεμένο πρόχειρο παραστατικό.')}
        />
      )}
      {isConsignments && editingConsignment && (
        <ConsignmentEditModal
          entry={editingConsignment}
          lines={(data?.consignmentLines || []).filter((line) => line.consignment_id === editingConsignment.id)}
          customers={customers}
          products={products}
          warehouses={sourceWarehouses}
          canSeeCost={canSeeCost}
          saving={actions.updatePendingConsignment.isPending}
          onClose={() => setEditingConsignmentId(null)}
          onSubmit={async (input) => {
            if (await safeAction(() => actions.updatePendingConsignment.mutateAsync(input), 'Η Παρακαταθήκη ενημερώθηκε.')) {
              setEditingConsignmentId(null);
            }
          }}
        />
      )}
      {!isConsignments && showRepairCreator && (
        <RepairIntakeWorkbench
          customers={customers}
          products={products}
          orders={orders}
          consignmentSales={consignmentSaleOptions}
          previousRepairItem={previousRepairItem}
          defaultSellerId={profile?.role === 'seller' ? profile.id : undefined}
          onClose={() => { setShowRepairCreator(false); setPreviousRepairItem(null); }}
          onSubmit={async (input) => {
            if (await safeAction(() => actions.createRepairIntake.mutateAsync(input), 'Η παραλαβή καταχωρίστηκε και δημιουργήθηκαν οι παρτίδες Παραγωγής.')) {
              setShowRepairCreator(false);
              setPreviousRepairItem(null);
            }
          }}
          saving={actions.createRepairIntake.isPending}
        />
      )}
      {selectedRepair && !isConsignments && (
        <RepairDetailModal
          item={selectedRepair}
          customerName={customerById.get(selectedRepair.customer_id)?.full_name || 'Άγνωστος πελάτης'}
          sellerName={selectedRepair.seller_id ? sellerById.get(selectedRepair.seller_id)?.full_name : undefined}
          product={selectedRepair.product_sku ? productBySku.get(selectedRepair.product_sku) : undefined}
          previousCode={(data?.repairItems || []).find((item) => item.id === selectedRepair.previous_repair_item_id)?.code || null}
          cycles={(data?.repairCycles || []).filter((cycle) => cycle.repair_item_id === selectedRepair.id)}
          costs={(data?.repairCostLines || []).filter((line) => line.repair_item_id === selectedRepair.id)}
          charge={chargeByRepairId.get(selectedRepair.id)}
          attachments={(data?.repairAttachments || []).filter((attachment) => attachment.repair_item_id === selectedRepair.id)}
          events={(data?.repairEvents || []).filter((event) => event.repair_item_id === selectedRepair.id)}
          canSeeCost={canSeeCost}
          isSeller={profile?.role === 'seller'}
          onClose={() => setSelectedRepairId(null)}
          onOperation={setOperation}
          onDelivered={() => safeAction(() => actions.markRepairDelivered.mutateAsync(selectedRepair.id), 'Η Επισκευή σημειώθηκε ως παραδομένη.')}
          onNewLinkedRepair={() => { setSelectedRepairId(null); openRepairCreator(selectedRepair); }}
          onLegalDraft={() => safeAction(() => actions.createRepairLegalDraft.mutateAsync(selectedRepair.id), 'Δημιουργήθηκε συνδεδεμένο πρόχειρο παραστατικό υπηρεσίας.')}
          onUpload={(file) => safeAction(() => actions.uploadRepairAttachment.mutateAsync({ repairItemId: selectedRepair.id, file }), 'Η φωτογραφία αποθηκεύτηκε με ασφαλή πρόσβαση.')}
          batch={liveRepairBatch(selectedRepair)}
          isMoving={movingRepairId === selectedRepair.id}
          onMoveToStage={(stage, options) => void handleRepairStageMove(selectedRepair, stage, options)}
          onHold={() => handleRepairHold(selectedRepair)}
          onRemove={() => void handleRepairRemove(selectedRepair)}
          onDelete={() => void handleRepairDelete(selectedRepair)}
          onArchive={() => void handleRepairArchive(selectedRepair)}
          onReturnToProduction={() => safeAction(() => actions.returnRepairToProduction.mutateAsync(selectedRepair.id), 'Η Επισκευή επέστρεψε στην Παραγωγή.')}
        />
      )}
      {operation && <OperationModal operation={operation} warehouses={warehouses} products={products} onClose={() => setOperation(null)} onSubmit={(payload) => {
        if (operation.kind === 'sale') return safeAction(() => actions.recordConsignmentSale.mutateAsync({ lineId: operation.line.id, quantity: payload.quantity, unitPrice: payload.amount, reason: payload.reason || null }), 'Η πώληση δηλώθηκε και δημιουργήθηκε η απαίτηση.');
        if (operation.kind === 'payment') return safeAction(() => actions.recordConsignmentPayment.mutateAsync({ settlementId: operation.settlement.id, amount: payload.amount, method: payload.method, notes: payload.reason }), 'Η είσπραξη καταχωρίστηκε.');
        if (operation.kind === 'return') return safeAction(() => actions.receiveConsignmentReturn.mutateAsync({ lineId: operation.line.id, quantity: payload.quantity, notes: payload.reason }), 'Η επιστροφή μεταφέρθηκε στον Έλεγχο Επιστροφών.');
        if (operation.kind === 'route-return') return safeAction(() => actions.routeConsignmentReturn.mutateAsync({ returnId: operation.item.id, resolution: payload.resolution, destinationWarehouseId: payload.warehouseId || null, reason: payload.reason }), 'Η επιστροφή δρομολογήθηκε και το απόθεμα ενημερώθηκε.');
        if (operation.kind === 'price') return safeAction(() => actions.overrideConsignmentPrice.mutateAsync({ lineId: operation.line.id, unitPrice: payload.amount, reason: payload.reason }), 'Η κλειδωμένη τιμή ενημερώθηκε και καταγράφηκε στο ιστορικό.');
        if (operation.kind === 'reverse-sale') return safeAction(() => actions.reverseConsignmentSettlement.mutateAsync({ settlementId: operation.settlement.id, reason: payload.reason }), 'Η πώληση αντιστράφηκε και το απόθεμα αποκαταστάθηκε.');
        if (operation.kind === 'reverse-return') return safeAction(() => actions.reverseConsignmentReturn.mutateAsync({ returnId: operation.item.id, reason: payload.reason }), 'Η επιστροφή αντιστράφηκε και το απόθεμα αποκαταστάθηκε.');
        if (operation.kind === 'cancel-consignment') return safeAction(() => actions.cancelConsignment.mutateAsync({ consignmentId: operation.entry.id, reason: payload.reason }), 'Η πρόχειρη Παρακαταθήκη ακυρώθηκε.');
        if (operation.kind === 'quality') return safeAction(() => actions.completeRepairQualityCheck.mutateAsync({ repairItemId: operation.item.id, passed: operation.passed, notes: payload.reason, returnStage: payload.stage }), operation.passed ? 'Ο ποιοτικός έλεγχος ολοκληρώθηκε.' : 'Δημιουργήθηκε νέος κύκλος επανεργασίας.');
        if (operation.kind === 'cost') return safeAction(() => actions.recordRepairCost.mutateAsync({ repairItemId: operation.item.id, costType: payload.costType, description: payload.reason, quantity: payload.quantity, unitCost: payload.amount, productSku: payload.sku || null, variantSuffix: payload.variantSuffix || '', warehouseId: payload.warehouseId || null }), 'Το κόστος καταχωρίστηκε.');
        if (operation.kind === 'charge') return safeAction(() => actions.setRepairCharge.mutateAsync({ repairItemId: operation.item.id, chargeType: payload.chargeType, amount: payload.amount, paidAmount: payload.paidAmount, notes: payload.reason }), 'Η χρέωση Επισκευής ενημερώθηκε.');
        return safeAction(() => actions.setRepairExceptionState.mutateAsync({ repairItemId: operation.item.id, status: operation.status, reason: payload.reason }), 'Η κατάσταση Επισκευής ενημερώθηκε.');
      }} />}
    </div>
  );
}

function EmptyState({ icon, title, text, action, actionLabel }: { icon: React.ReactNode; title: string; text: string; action: () => void; actionLabel: string }) {
  return <div className="flex min-h-64 flex-col items-center justify-center rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center"><div className="mb-3 rounded-2xl bg-slate-100 p-4 text-slate-500">{icon}</div><h3 className="font-black text-slate-800">{title}</h3><p className="mt-1 max-w-md text-sm text-slate-500">{text}</p><button className={`${primaryButton} mt-4`} onClick={action}><Plus size={16} /> {actionLabel}</button></div>;
}

function ConsignmentCard({ entry, lines, settlements, returns, customerName, sellerName, productBySku, canSeeCost, isAdmin, onOpen, onHandoff, onEdit, onOperation, onLegalDraft }: { entry: Consignment; lines: ConsignmentLine[]; settlements: ConsignmentSettlement[]; returns: ConsignmentReturn[]; customerName: string; sellerName?: string; productBySku: Map<string, Product>; canSeeCost: boolean; isAdmin: boolean; onOpen: () => void; onHandoff: () => void; onEdit: () => void; onOperation: (operation: Operation) => void; onLegalDraft: (settlementId: string) => void }) {
  const pending = lines.reduce((sum, line) => sum + line.pending_quantity, 0);
  const value = lines.reduce((sum, line) => sum + line.pending_quantity * Number(line.locked_unit_price), 0);
  const due = settlements.filter((item) => item.status !== 'reversed').reduce((sum, item) => sum + Number(item.total_amount) - Number(item.paid_amount), 0);
  return <article className={`${CARD} overflow-hidden`}><div className="flex flex-col gap-3 border-b border-slate-100 p-4 md:flex-row md:items-center md:justify-between"><button type="button" className="flex min-w-0 items-start gap-3 text-left" onClick={onOpen}><div className="rounded-xl bg-indigo-50 p-2.5 text-indigo-700"><Boxes size={20} /></div><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-black text-slate-900">{entry.code}</h3><ConsignmentBadge compact /><span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-black text-slate-600">{CONSIGNMENT_STATUS_LABELS[entry.status]}</span><span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-black text-emerald-700">{FINANCIAL_STATUS_LABELS[entry.financial_status]}</span></div><p className="mt-1 text-sm font-bold text-slate-700">{customerName}</p><p className="text-[11px] text-slate-500">{sellerName ? `Πωλητής: ${sellerName} · ` : ''}Επανέλεγχος: {formatGreekDateOnly(entry.review_due_at)}</p></div></button><div className="flex flex-wrap gap-2">{entry.status === 'pending_handoff' && <button className={primaryButton} onClick={onHandoff}><PackageCheck size={15} /> Παράδοση</button>}{canEditPendingConsignment(entry.status, entry.handed_off_at) && <button className={secondaryButton} onClick={onEdit}><Pencil size={14} /> Επεξεργασία</button>}{isAdmin && entry.status === 'pending_handoff' && <button className={secondaryButton} onClick={() => onOperation({ kind: 'cancel-consignment', entry })}><X size={14} /> Ακύρωση</button>}<button className={secondaryButton} onClick={onOpen}>Λεπτομέρειες</button></div></div>
    <div className="grid gap-3 p-4 lg:grid-cols-[minmax(0,1fr)_280px]"><div className="space-y-2">{lines.map((line) => <div key={line.id} className="flex flex-col gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3 sm:flex-row sm:items-center sm:justify-between"><div className="flex min-w-0 items-start gap-3"><ConsignmentSkuThumb product={productBySku.get(line.product_sku)} sku={line.product_sku} quantity={line.quantity} /><div><div className="font-black text-slate-800"><SkuColorizedText sku={line.product_sku} suffix={line.variant_suffix || ''} gender={productBySku.get(line.product_sku)?.gender} /></div><div className="mt-1 flex flex-wrap gap-2 text-[10px] font-bold text-slate-500"><span>Παραδόθηκαν {line.quantity}</span><span>Πωλήθηκαν {line.sold_quantity}</span><span>Επιστράφηκαν {line.returned_quantity}</span><span className="text-indigo-700">Εκκρεμούν {line.pending_quantity}</span><span>{formatGreekMoney(Number(line.locked_unit_price))}/τεμ.</span>{canSeeCost && <span>Κόστος {formatGreekMoney(Number(line.locked_unit_cost))}</span>}</div></div></div>{['active', 'partially_settled'].includes(entry.status) && <div className="flex flex-wrap gap-2">{line.pending_quantity > 0 && <><button className={secondaryButton} onClick={() => onOperation({ kind: 'sale', line })}><Banknote size={14} /> Πώληση</button><button className={secondaryButton} onClick={() => onOperation({ kind: 'return', line })}><RotateCcw size={14} /> Επιστροφή</button></>}{isAdmin && <button className={secondaryButton} onClick={() => onOperation({ kind: 'price', line })}>Αλλαγή τιμής</button>}</div>}</div>)}</div>
      <aside className="space-y-3 rounded-xl border border-slate-100 bg-slate-50 p-3"><div className="grid grid-cols-3 gap-2 text-center"><div><div className="text-lg font-black">{pending}</div><div className="text-[9px] font-bold text-slate-500">ΕΚΚΡΕΜΗ</div></div><div><div className="text-sm font-black">{formatGreekMoney(value)}</div><div className="text-[9px] font-bold text-slate-500">ΑΞΙΑ</div></div><div><div className="text-sm font-black text-rose-700">{formatGreekMoney(due)}</div><div className="text-[9px] font-bold text-slate-500">ΟΦΕΙΛΗ</div></div></div>{settlements.filter((item) => item.status !== 'reversed').map((settlement) => <div key={settlement.id} className="rounded-lg bg-white p-2.5 text-xs"><div className="flex justify-between"><span className="font-bold">Πώληση {settlement.quantity} τεμ.</span><span className="font-black">{formatGreekMoney(Number(settlement.total_amount))}</span></div><div className="mt-2 flex flex-wrap gap-1.5">{settlement.status !== 'paid' && <button className={secondaryButton} onClick={() => onOperation({ kind: 'payment', settlement })}>Είσπραξη</button>}{!settlement.legal_document_id && <button className={secondaryButton} onClick={() => onLegalDraft(settlement.id)}><FilePlus2 size={13} /> Πρόχειρο παραστατικό</button>}{isAdmin && Number(settlement.paid_amount) === 0 && !settlement.legal_document_id && <button className={secondaryButton} onClick={() => onOperation({ kind: 'reverse-sale', settlement })}>Αντιστροφή</button>}</div></div>)}{returns.filter((item) => item.status === 'inspection').map((item) => <div key={item.id} className="flex gap-1.5"><button className={`${secondaryButton} flex-1`} onClick={() => onOperation({ kind: 'route-return', item })}><ArrowRightLeft size={14} /> Δρομολόγηση {item.quantity} τεμ.</button>{isAdmin && <button className={secondaryButton} onClick={() => onOperation({ kind: 'reverse-return', item })}>Αντιστροφή</button>}</div>)}</aside>
    </div></article>;
}

function RepairCard({ item, batch, customerName, sellerName, product, cost, charge, isSeller, onOpen, onOperation, onDelivered, onNewLinkedRepair, onLegalDraft, onUpload, onHold, onDelete, onArchive }: { item: RepairItem; batch?: ProductionBatch | null; customerName: string; sellerName?: string; product?: Product; cost: number; charge?: any; isSeller: boolean; onOpen: () => void; onOperation: (operation: Operation) => void; onDelivered: () => void; onNewLinkedRepair: () => void; onLegalDraft: () => void; onUpload: (file: File) => void; onHold: () => void; onDelete: () => void; onArchive: () => void }) {
  return (
    <article className={`${CARD} overflow-hidden`}>
      <div className="flex flex-col gap-3 border-b border-slate-100 p-4 md:flex-row md:items-start md:justify-between">
        <button type="button" className="flex min-w-0 items-start gap-3 text-left" onClick={onOpen}>
          <div className="rounded-xl bg-blue-50 p-2.5 text-blue-700"><Wrench size={20} /></div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-black text-slate-900">{item.code}</h3>
              <RepairBadge compact />
              <RepairStageBadge item={item} batch={batch} />
              {item.is_archived && <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-black text-slate-500">Αρχείο</span>}
              {item.current_cycle_number > 1 && <span className="rounded-full bg-rose-50 px-2 py-1 text-[10px] font-black text-rose-700">Κύκλος {item.current_cycle_number}</span>}
            </div>
            <p className="mt-1 text-sm font-bold text-slate-700">{customerName}</p>
            <p className="text-[11px] text-slate-500">{REPAIR_ORIGIN_LABELS[item.origin_type]}{sellerName ? ` · ${sellerName}` : ''}</p>
          </div>
        </button>
        <div className="flex flex-wrap gap-2">
          <RepairQrButton code={item.code} customerName={customerName} />
          <button className={secondaryButton} onClick={onOpen}>Λεπτομέρειες</button>
        </div>
      </div>
      <div className="space-y-3 p-4">
        <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
          <div className="text-xs font-black text-slate-700">{item.product_sku ? <SkuColorizedText sku={item.product_sku} suffix={item.variant_suffix || ''} gender={product?.gender} /> : 'Χωρίς συνδεδεμένο SKU'}</div>
          <p className="mt-1 text-sm leading-relaxed text-slate-600">{item.description}</p>
          {item.intake_condition && <p className="mt-2 text-[11px] text-slate-500">Κατάσταση παραλαβής: {item.intake_condition}</p>}
        </div>
        <div className={`grid gap-2 rounded-xl bg-slate-50 p-3 text-center ${isSeller ? 'grid-cols-2' : 'grid-cols-3'}`}>
          {!isSeller && <div><div className="font-black">{formatGreekMoney(cost)}</div><div className="text-[9px] font-bold text-slate-500">ΚΟΣΤΟΣ</div></div>}
          <div><div className="font-black">{formatGreekMoney(Number(charge?.amount || 0))}</div><div className="text-[9px] font-bold text-slate-500">ΧΡΕΩΣΗ</div></div>
          <div><div className="font-black">{charge ? REPAIR_CHARGE_TYPE_LABELS[charge.charge_type as keyof typeof REPAIR_CHARGE_TYPE_LABELS] : '—'}</div><div className="text-[9px] font-bold text-slate-500">ΤΥΠΟΣ</div></div>
        </div>
        <div className="flex flex-wrap gap-2">
          {!isSeller && item.status === 'quality_check' && (
            <>
              <button className={primaryButton} onClick={() => onOperation({ kind: 'quality', item, passed: true })}><CheckCircle2 size={14} /> Επιτυχής έλεγχος</button>
              <button className={secondaryButton} onClick={() => onOperation({ kind: 'quality', item, passed: false })}><RotateCcw size={14} /> Επανεργασία</button>
            </>
          )}
          {item.status === 'ready_for_return' && <button className={primaryButton} onClick={onDelivered}><PackageCheck size={14} /> Παραδόθηκε</button>}
          {item.status === 'delivered' && <button className={secondaryButton} onClick={onNewLinkedRepair}><RotateCcw size={14} /> Νέα συνδεδεμένη Επισκευή</button>}
          {!isSeller && !['delivered', 'irreparable', 'cancelled'].includes(item.status) && (
            <>
              <button className={secondaryButton} onClick={() => onOperation({ kind: 'cost', item })}>Καταγραφή κόστους</button>
              <button className={secondaryButton} onClick={() => onOperation({ kind: 'charge', item })}>Χρέωση</button>
              {batch && <button className={secondaryButton} onClick={onHold}>{batch.on_hold || item.status === 'on_hold' ? 'Συνέχεια' : 'Σε αναμονή'}</button>}
            </>
          )}
          {!isSeller && (
            <>
              <button className={secondaryButton} onClick={onArchive}>{item.is_archived ? 'Ανάκτηση' : 'Αρχείο'}</button>
              <button className={secondaryButton} onClick={onDelete}>Διαγραφή</button>
            </>
          )}
          {charge?.charge_type === 'chargeable' && Number(charge.amount) > 0 && !charge.legal_document_id && <button className={secondaryButton} onClick={onLegalDraft}><FilePlus2 size={14} /> Πρόχειρο παραστατικό</button>}
          <label className={`${secondaryButton} cursor-pointer`}>
            <ImagePlus size={14} /> Φωτογραφία
            <input type="file" accept="image/*" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) onUpload(file); event.currentTarget.value = ''; }} />
          </label>
        </div>
        <div className="text-[10px] text-slate-400">Παραλαβή: {formatGreekDateTime(item.received_at || item.created_at)} · Δεν μπλοκάρεται η παράδοση από οικονομική εκκρεμότητα.</div>
      </div>
    </article>
  );
}

function ConsignmentDetailModal({ entry, lines, settlements, returns, events, customerName, sellerName, productBySku, canSeeCost, isAdmin, onClose, onHandoff, onEdit, onOperation, onLegalDraft }: { entry: Consignment; lines: ConsignmentLine[]; settlements: ConsignmentSettlement[]; returns: ConsignmentReturn[]; events: ConsignmentEvent[]; customerName: string; sellerName?: string; productBySku: Map<string, Product>; canSeeCost: boolean; isAdmin: boolean; onClose: () => void; onHandoff: () => void; onEdit: () => void; onOperation: (operation: Operation) => void; onLegalDraft: (settlementId: string) => void }) {
  const lineSettlements = settlements.filter((item) => lines.some((line) => line.id === item.consignment_line_id));
  const lineReturns = returns.filter((item) => lines.some((line) => line.id === item.consignment_line_id));
  const pending = lines.reduce((sum, line) => sum + line.pending_quantity, 0);
  const value = lines.reduce((sum, line) => sum + line.pending_quantity * Number(line.locked_unit_price), 0);
  const cost = lines.reduce((sum, line) => sum + line.pending_quantity * Number(line.locked_unit_cost), 0);
  const due = lineSettlements.filter((item) => item.status !== 'reversed').reduce((sum, item) => sum + Number(item.total_amount) - Number(item.paid_amount), 0);
  return (
    <ModalShell title={entry.code} subtitle={`${customerName} · επανέλεγχος ${formatGreekDateOnly(entry.review_due_at)}`} onClose={onClose} wide>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <ConsignmentBadge />
          <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-black text-slate-600">{CONSIGNMENT_STATUS_LABELS[entry.status]}</span>
          <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-black text-emerald-700">{FINANCIAL_STATUS_LABELS[entry.financial_status]}</span>
          {sellerName && <span className="text-xs font-bold text-slate-500">Πωλητής: {sellerName}</span>}
        </div>
        <div className={`grid grid-cols-2 gap-3 ${canSeeCost ? 'md:grid-cols-4' : 'md:grid-cols-3'}`}>
          <div className="rounded-2xl bg-indigo-50 p-3"><div className="text-lg font-black">{pending}</div><div className="text-[10px] font-bold text-indigo-700">Στον πελάτη</div></div>
          <div className="rounded-2xl bg-slate-50 p-3"><div className="text-lg font-black">{formatGreekMoney(value)}</div><div className="text-[10px] font-bold text-slate-500">Αναμενόμενη αξία</div></div>
          {canSeeCost && <div className="rounded-2xl bg-slate-50 p-3"><div className="text-lg font-black">{formatGreekMoney(cost)}</div><div className="text-[10px] font-bold text-slate-500">Έκθεση κόστους</div></div>}
          <div className="rounded-2xl bg-rose-50 p-3"><div className="text-lg font-black text-rose-700">{formatGreekMoney(due)}</div><div className="text-[10px] font-bold text-rose-700">Απλήρωτα</div></div>
        </div>
        <div className="flex flex-wrap gap-2">{entry.status === 'pending_handoff' && <button className={primaryButton} onClick={onHandoff}><PackageCheck size={15} /> Παράδοση</button>}{canEditPendingConsignment(entry.status, entry.handed_off_at) && <button className={secondaryButton} onClick={onEdit}><Pencil size={14} /> Επεξεργασία</button>}{isAdmin && entry.status === 'pending_handoff' && <button className={secondaryButton} onClick={() => onOperation({ kind: 'cancel-consignment', entry })}>Ακύρωση</button>}</div>
        <div className="space-y-2">{lines.map((line) => (
          <div key={line.id} className="rounded-2xl border border-slate-100 bg-white p-3">
            <div className="flex min-w-0 items-start gap-3">
              <ConsignmentSkuThumb product={productBySku.get(line.product_sku)} sku={line.product_sku} quantity={line.quantity} />
              <div>
                <div className="font-black"><SkuColorizedText sku={line.product_sku} suffix={line.variant_suffix || ''} gender={productBySku.get(line.product_sku)?.gender} /></div>
                <div className="mt-1 flex flex-wrap gap-2 text-[10px] font-bold text-slate-500"><span>Ποσότητα {line.quantity}</span><span>Πωλήθηκαν {line.sold_quantity}</span><span>Επιστράφηκαν {line.returned_quantity}</span><span className="text-indigo-700">Εκκρεμούν {line.pending_quantity}</span><span>{formatGreekMoney(Number(line.locked_unit_price))}/τεμ.</span>{canSeeCost && <span>Κόστος {formatGreekMoney(Number(line.locked_unit_cost))}</span>}</div>
              </div>
            </div>
            {['active', 'partially_settled'].includes(entry.status) && <div className="mt-2 flex flex-wrap gap-2">{line.pending_quantity > 0 && <><button className={secondaryButton} onClick={() => onOperation({ kind: 'sale', line })}>Πώληση</button><button className={secondaryButton} onClick={() => onOperation({ kind: 'return', line })}>Επιστροφή</button></>}{isAdmin && <button className={secondaryButton} onClick={() => onOperation({ kind: 'price', line })}>Αλλαγή τιμής</button>}</div>}
          </div>
        ))}</div>
        <div className="grid gap-3 md:grid-cols-2">
          <section className="rounded-2xl border border-slate-100 p-3"><h4 className="mb-2 text-xs font-black uppercase text-slate-400">Πωλήσεις / εισπράξεις</h4>{lineSettlements.filter((item) => item.status !== 'reversed').map((settlement) => <div key={settlement.id} className="mb-2 rounded-xl bg-slate-50 p-2.5 text-xs"><div className="flex justify-between font-bold"><span>Πώληση {settlement.quantity} τεμ.</span><span>{formatGreekMoney(Number(settlement.total_amount))}</span></div><div className="mt-2 flex flex-wrap gap-1.5">{settlement.status !== 'paid' && <button className={secondaryButton} onClick={() => onOperation({ kind: 'payment', settlement })}>Είσπραξη</button>}{!settlement.legal_document_id && <button className={secondaryButton} onClick={() => onLegalDraft(settlement.id)}>Πρόχειρο παραστατικό</button>}{isAdmin && Number(settlement.paid_amount) === 0 && !settlement.legal_document_id && <button className={secondaryButton} onClick={() => onOperation({ kind: 'reverse-sale', settlement })}>Αντιστροφή</button>}</div></div>)}</section>
          <section className="rounded-2xl border border-slate-100 p-3"><h4 className="mb-2 text-xs font-black uppercase text-slate-400">Επιστροφές / χρονολόγιο</h4>{lineReturns.filter((item) => item.status === 'inspection').map((item) => <div key={item.id} className="mb-2 flex gap-1.5"><button className={`${secondaryButton} flex-1`} onClick={() => onOperation({ kind: 'route-return', item })}>Δρομολόγηση {item.quantity} τεμ.</button>{isAdmin && <button className={secondaryButton} onClick={() => onOperation({ kind: 'reverse-return', item })}>Αντιστροφή</button>}</div>)}<div className="mt-3 space-y-2">{[...events].sort((a, b) => b.created_at.localeCompare(a.created_at)).map((event) => <div key={event.id} className="text-xs"><div className="font-black text-slate-700">{CONSIGNMENT_EVENT_LABELS[event.event_type] || event.event_type}</div><div className="text-slate-400">{formatGreekDateTime(event.created_at)}</div></div>)}</div></section>
        </div>
      </div>
    </ModalShell>
  );
}


function OperationModal({ operation, warehouses, products, onClose, onSubmit }: { operation: Operation; warehouses: any[]; products: Product[]; onClose: () => void; onSubmit: (payload: any) => Promise<unknown> }) {
  const [quantity, setQuantity] = useState(operation.kind === 'sale' || operation.kind === 'return' ? Math.min(1, operation.line.pending_quantity) : 1);
  const [amount, setAmount] = useState(operation.kind === 'sale' || operation.kind === 'price' ? Number(operation.line.locked_unit_price) : operation.kind === 'payment' ? Number(operation.settlement.total_amount) - Number(operation.settlement.paid_amount) : 0);
  const [paidAmount, setPaidAmount] = useState(0);
  const [reason, setReason] = useState('');
  const [method, setMethod] = useState('Μετρητά');
  const [resolution, setResolution] = useState<'restocked' | 'production' | 'damaged'>('restocked');
  const [warehouseId, setWarehouseId] = useState(SYSTEM_IDS.CENTRAL);
  const [stage, setStage] = useState<string>(ProductionStage.Waxing);
  const [costType, setCostType] = useState<'labor' | 'material' | 'component' | 'external'>('labor');
  const [chargeType, setChargeType] = useState<'warranty' | 'chargeable' | 'unrecorded'>('unrecorded');
  const [sku, setSku] = useState('');
  const [variantSuffix, setVariantSuffix] = useState('');
  const title = operation.kind === 'sale' ? 'Δήλωση πώλησης' : operation.kind === 'payment' ? 'Καταγραφή είσπραξης' : operation.kind === 'return' ? 'Παραλαβή επιστροφής' : operation.kind === 'route-return' ? 'Δρομολόγηση επιστροφής' : operation.kind === 'price' ? 'Αλλαγή κλειδωμένης τιμής' : operation.kind === 'reverse-sale' ? 'Αντιστροφή πώλησης' : operation.kind === 'reverse-return' ? 'Αντιστροφή επιστροφής' : operation.kind === 'cancel-consignment' ? 'Ακύρωση Παρακαταθήκης' : operation.kind === 'quality' ? (operation.passed ? 'Επιτυχής ποιοτικός έλεγχος' : 'Επανεργασία Επισκευής') : operation.kind === 'cost' ? 'Καταγραφή κόστους' : operation.kind === 'charge' ? 'Χρέωση Επισκευής' : 'Αλλαγή κατάστασης';
  const needsReason = ['route-return', 'exception', 'cost', 'price', 'reverse-sale', 'reverse-return', 'cancel-consignment'].includes(operation.kind) || (operation.kind === 'quality' && !operation.passed) || (operation.kind === 'sale' && amount !== Number(operation.line.locked_unit_price));
  const selectCostSku = (nextSku: string, nextVariantSuffix: string | null) => {
    const pricing = getCatalogSelectionPricing(products, { sku: nextSku, variant_suffix: nextVariantSuffix });
    setSku(nextSku);
    setVariantSuffix(nextVariantSuffix || '');
    setAmount(pricing.unitCost);
  };
  const submit = () => onSubmit({ quantity, amount, paidAmount, reason, method, resolution, warehouseId, stage, costType, chargeType, sku, variantSuffix });
  return (
    <ModalShell title={title} onClose={onClose}>
      <div className="space-y-4">
        {(operation.kind === 'sale' || operation.kind === 'return' || operation.kind === 'cost') && <label><span className="mb-1 block text-xs font-bold text-slate-600">Ποσότητα</span><input type="number" min={1} max={operation.kind === 'sale' || operation.kind === 'return' ? operation.line.pending_quantity : undefined} className={inputClass} value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} /></label>}
        {(operation.kind === 'sale' || operation.kind === 'payment' || operation.kind === 'cost' || operation.kind === 'charge' || operation.kind === 'price') && <label><span className="mb-1 block text-xs font-bold text-slate-600">{operation.kind === 'sale' || operation.kind === 'price' ? 'Τιμή ανά τεμάχιο' : operation.kind === 'cost' ? 'Κόστος ανά μονάδα' : 'Ποσό'}</span><input type="number" min={0} step="0.01" className={inputClass} value={amount} onChange={(event) => setAmount(Number(event.target.value))} /></label>}
        {operation.kind === 'payment' && <label><span className="mb-1 block text-xs font-bold text-slate-600">Τρόπος είσπραξης</span><input className={inputClass} value={method} onChange={(event) => setMethod(event.target.value)} /></label>}
        {operation.kind === 'route-return' && <><label><span className="mb-1 block text-xs font-bold text-slate-600">Αποτέλεσμα ελέγχου</span><select className={inputClass} value={resolution} onChange={(event) => setResolution(event.target.value as any)}><option value="restocked">Επιστροφή σε διαθέσιμο απόθεμα</option><option value="production">Φρεσκάρισμα στην Παραγωγή</option><option value="damaged">Ζημιά / καταγεγραμμένη διαφορά</option></select></label>{resolution === 'restocked' && <label><span className="mb-1 block text-xs font-bold text-slate-600">Αποθήκη προορισμού</span><select className={inputClass} value={warehouseId} onChange={(event) => setWarehouseId(event.target.value)}>{warehouses.filter((warehouse) => ![SYSTEM_IDS.CONSIGNMENTS, SYSTEM_IDS.RETURN_INSPECTION].includes(warehouse.id)).map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select></label>}</>}
        {operation.kind === 'quality' && !operation.passed && (
          <label>
            <span className="mb-1 block text-xs font-bold text-slate-600">Στάδιο επιστροφής</span>
            <select className={inputClass} value={stage} onChange={(event) => setStage(event.target.value)}>
              {PRODUCTION_STAGES.filter((entry) => entry.id !== ProductionStage.AwaitingDelivery && entry.id !== ProductionStage.Ready).map((entry) => (
                <option key={entry.id} value={entry.id}>{entry.label}</option>
              ))}
            </select>
          </label>
        )}
        {operation.kind === 'cost' && (
          <>
            <label><span className="mb-1 block text-xs font-bold text-slate-600">Τύπος κόστους</span><select className={inputClass} value={costType} onChange={(event) => { setCostType(event.target.value as typeof costType); setSku(''); setVariantSuffix(''); }}>{Object.entries(REPAIR_COST_TYPE_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
            {['material', 'component'].includes(costType) && (
              <>
                <div>
                  <span className="mb-1 block text-xs font-bold text-slate-600">Έξυπνο SKU υλικού ή εξαρτήματος</span>
                  <SkuProductPicker
                    sku={sku}
                    variantSuffix={variantSuffix}
                    products={products}
                    onSelect={(selection) => selectCostSku(selection.sku, selection.variant_suffix)}
                    scope={costType === 'component' ? 'components' : 'all'}
                    placeholder="SKU, πλήρης παραλλαγή ή barcode…"
                    inputClassName="min-h-[42px]"
                    catalogOnly
                  />
                  <div className="mt-1 text-[10px] font-bold text-emerald-700">Το κόστος ανά μονάδα ενημερώνεται αυτόματα από την παραλλαγή.</div>
                </div>
                <label><span className="mb-1 block text-xs font-bold text-slate-600">Αποθήκη κατανάλωσης</span><select className={inputClass} value={warehouseId} onChange={(event) => setWarehouseId(event.target.value)}>{warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select></label>
              </>
            )}
          </>
        )}
        {operation.kind === 'charge' && <><label><span className="mb-1 block text-xs font-bold text-slate-600">Τύπος χρέωσης</span><select className={inputClass} value={chargeType} onChange={(event) => setChargeType(event.target.value as any)}>{Object.entries(REPAIR_CHARGE_TYPE_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><label><span className="mb-1 block text-xs font-bold text-slate-600">Ήδη εισπραχθέν ποσό</span><input type="number" min={0} step="0.01" className={inputClass} value={paidAmount} onChange={(event) => setPaidAmount(Number(event.target.value))} /></label></>}
        <label><span className="mb-1 block text-xs font-bold text-slate-600">{needsReason ? 'Αιτιολογία *' : 'Σημείωση'}</span><textarea className={`${inputClass} min-h-24`} value={reason} onChange={(event) => setReason(event.target.value)} /></label>
        <div className="flex justify-end gap-2"><button className={secondaryButton} onClick={onClose}>Ακύρωση</button><button className={primaryButton} disabled={needsReason && !reason.trim()} onClick={submit}>Καταχώριση</button></div>
      </div>
    </ModalShell>
  );
}
