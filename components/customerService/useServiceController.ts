import { useCallback, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../AuthContext';
import { useUI } from '../UIProvider';
import { invalidateCustomerService, invalidateProductionBatches } from '../../lib/queryInvalidation';
import { useCustomers, useOrdersWithItems } from '../../hooks/api/useOrders';
import { useProducts } from '../../hooks/api/useProducts';
import { useWarehouses } from '../../hooks/api/useWarehouses';
import { useSellers } from '../../hooks/api/useSellers';
import { useCustomerServiceActions, useCustomerServiceWorkspace } from '../../hooks/api/useCustomerService';
import { useProductionBatches } from '../../hooks/api/useProductionBatches';
import { productionRepository } from '../../features/production';
import { SYSTEM_IDS } from '../../lib/supabase';
import type {
  Consignment,
  ConsignmentLine,
  ConsignmentReturn,
  ConsignmentSettlement,
  ProductionBatch,
  RepairCharge,
  RepairItem,
} from '../../types';
import { ProductionStage } from '../../types';
import {
  REPAIR_READY_CONFIRM,
  extractCreatedConsignmentIds,
  findLiveRepairBatch,
  summarizeConsignment,
  type BulkConsignmentGroupInput,
  type ConsignmentSummary,
  type RepairIntakeInput,
  type SettlementStep,
} from '../../features/customerService';

export type RepairExceptionStatus = 'on_hold' | 'irreparable' | 'cancelled' | 'in_production';

export type ServiceOperation =
  | { kind: 'sale'; line: ConsignmentLine }
  | { kind: 'payment'; settlement: ConsignmentSettlement }
  | { kind: 'return'; line: ConsignmentLine }
  | { kind: 'route-return'; item: ConsignmentReturn }
  | { kind: 'price'; line: ConsignmentLine }
  | { kind: 'reverse-sale'; settlement: ConsignmentSettlement }
  | { kind: 'reverse-return'; item: ConsignmentReturn }
  | { kind: 'cancel-consignment'; entry: Consignment }
  | { kind: 'delete-consignment'; entry: Consignment }
  | { kind: 'offer'; entry: Consignment }
  | { kind: 'settle'; entry: Consignment }
  | { kind: 'quality'; item: RepairItem; passed: boolean }
  | { kind: 'cost'; item: RepairItem }
  | { kind: 'charge'; item: RepairItem }
  | { kind: 'deliver'; item: RepairItem }
  | { kind: 'exception'; item: RepairItem; status: RepairExceptionStatus };

export type ConsignmentSaleOption = { id: string; customerId: string; sku: string; variantSuffix: string; sizeInfo: string; soldAt: string };

export interface ConsignmentBundle {
  entry: Consignment;
  lines: ConsignmentLine[];
  settlements: ConsignmentSettlement[];
  returns: ConsignmentReturn[];
  summary: ConsignmentSummary;
}

export function useServiceController(options: { loadOrders?: boolean } = {}) {
  const { profile } = useAuth();
  const { showToast, confirm } = useUI();
  const queryClient = useQueryClient();
  const actions = useCustomerServiceActions();
  const { data, isLoading, error } = useCustomerServiceWorkspace();
  const { data: productionBatches = [] } = useProductionBatches();
  const { data: customers = [] } = useCustomers();
  const { data: products = [] } = useProducts();
  const { data: warehouses = [] } = useWarehouses();
  const { data: sellers = [] } = useSellers();
  const { data: orders = [] } = useOrdersWithItems({ enabled: options.loadOrders ?? false });

  const [operation, setOperation] = useState<ServiceOperation | null>(null);
  const [movingRepairId, setMovingRepairId] = useState<string | null>(null);

  const role = profile?.role;
  const canSeeCost = role !== 'seller';
  const isAdmin = role === 'admin';
  const isSeller = role === 'seller';
  const defaultSellerId = isSeller ? profile?.id : undefined;

  const customerById = useMemo(() => new Map(customers.map((customer) => [customer.id, customer])), [customers]);
  const sellerById = useMemo(() => new Map(sellers.map((seller) => [seller.id, seller])), [sellers]);
  const productBySku = useMemo(() => new Map(products.map((product) => [product.sku, product])), [products]);
  const customerName = useCallback((id?: string | null) => customerById.get(id || '')?.full_name || 'Άγνωστος πελάτης', [customerById]);
  const sourceWarehouses = useMemo(
    () => warehouses.filter((warehouse) => ![SYSTEM_IDS.CONSIGNMENTS, SYSTEM_IDS.RETURN_INSPECTION].includes(warehouse.id)),
    [warehouses],
  );

  // ── Παρακαταθήκες ──
  const consignmentBundles = useMemo<ConsignmentBundle[]>(() => {
    const linesBy = new Map<string, ConsignmentLine[]>();
    for (const line of data?.consignmentLines || []) {
      if (!linesBy.has(line.consignment_id)) linesBy.set(line.consignment_id, []);
      linesBy.get(line.consignment_id)!.push(line);
    }
    const parentOfLine = new Map((data?.consignmentLines || []).map((line) => [line.id, line.consignment_id]));
    const settlementsBy = new Map<string, ConsignmentSettlement[]>();
    for (const settlement of data?.consignmentSettlements || []) {
      const parent = parentOfLine.get(settlement.consignment_line_id);
      if (!parent) continue;
      if (!settlementsBy.has(parent)) settlementsBy.set(parent, []);
      settlementsBy.get(parent)!.push(settlement);
    }
    const returnsBy = new Map<string, ConsignmentReturn[]>();
    for (const item of data?.consignmentReturns || []) {
      const parent = parentOfLine.get(item.consignment_line_id);
      if (!parent) continue;
      if (!returnsBy.has(parent)) returnsBy.set(parent, []);
      returnsBy.get(parent)!.push(item);
    }
    const now = new Date();
    return (data?.consignments || []).map((entry) => {
      const lines = linesBy.get(entry.id) || [];
      const settlements = settlementsBy.get(entry.id) || [];
      const returns = returnsBy.get(entry.id) || [];
      return { entry, lines, settlements, returns, summary: summarizeConsignment(entry, lines, settlements, returns, now) };
    });
  }, [data?.consignments, data?.consignmentLines, data?.consignmentSettlements, data?.consignmentReturns]);

  const existingOrderLineIds = useMemo(
    () => new Set<string | null>((data?.consignmentLines || []).map((line) => line.order_line_id || null).filter(Boolean)),
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

  // ── Επισκευές ──
  const chargeByRepairId = useMemo(() => new Map<string, RepairCharge>((data?.repairCharges || []).map((charge) => [charge.repair_item_id, charge])), [data?.repairCharges]);
  const liveRepairBatch = useCallback((item: RepairItem): ProductionBatch | undefined => findLiveRepairBatch(
    item.id,
    (data?.repairCycles || []).filter((cycle) => cycle.repair_item_id === item.id),
    productionBatches,
  ), [data?.repairCycles, productionBatches]);

  // ── Κοινός χειρισμός ενεργειών ──
  const safeAction = useCallback(async (action: () => Promise<unknown>, success: string): Promise<boolean> => {
    try {
      await action();
      showToast(success, 'success');
      setOperation(null);
      return true;
    } catch (actionError) {
      showToast(actionError instanceof Error ? actionError.message : 'Η ενέργεια δεν ολοκληρώθηκε.', 'error');
      return false;
    }
  }, [showToast]);

  /** Δημιουργία + (προαιρετικά) άμεση παράδοση. Αν η παράδοση αποτύχει, η εγγραφή μένει «Προς παράδοση». */
  const createConsignments = useCallback(async (groups: BulkConsignmentGroupInput[], handoffNow: boolean): Promise<boolean> => {
    let created: unknown;
    try {
      created = await actions.createBulkConsignments.mutateAsync(groups);
    } catch (createError) {
      showToast(createError instanceof Error ? createError.message : 'Η δημιουργία δεν ολοκληρώθηκε.', 'error');
      return false;
    }
    const ids = extractCreatedConsignmentIds(created);
    if (!handoffNow || ids.length === 0) {
      showToast(ids.length > 1 ? `Δημιουργήθηκαν ${ids.length} Παρακαταθήκες — περιμένουν παράδοση.` : 'Η Παρακαταθήκη δημιουργήθηκε — περιμένει παράδοση.', 'success');
      return true;
    }
    const failures: string[] = [];
    for (const id of ids) {
      try { await actions.handoffConsignment.mutateAsync(id); }
      catch (handoffError) { failures.push(handoffError instanceof Error ? handoffError.message : 'άγνωστο σφάλμα'); }
    }
    if (failures.length === 0) {
      showToast(ids.length > 1 ? `${ids.length} Παρακαταθήκες δημιουργήθηκαν και παραδόθηκαν.` : 'Η Παρακαταθήκη δημιουργήθηκε και παραδόθηκε στον πελάτη.', 'success');
    } else {
      showToast(`Η Παρακαταθήκη δημιουργήθηκε, αλλά η παράδοση δεν έγινε: ${failures[0]} Θα τη βρείτε στη στήλη «Προς παράδοση».`, 'error');
    }
    return true;
  }, [actions.createBulkConsignments, actions.handoffConsignment, showToast]);

  const handoffConsignment = useCallback(async (entry: Consignment) => {
    const accepted = await confirm({
      title: `Παράδοση ${entry.code}`,
      message: 'Τα τεμάχια φεύγουν από την αποθήκη και καταγράφονται ως «στον πελάτη». Συνέχεια;',
      confirmText: 'Παράδοση',
    });
    if (accepted) await safeAction(() => actions.handoffConsignment.mutateAsync(entry.id), 'Η Παρακαταθήκη παραδόθηκε στον πελάτη.');
  }, [actions.handoffConsignment, confirm, safeAction]);

  const runSettlementSteps = useCallback(async (steps: SettlementStep[], note: string): Promise<boolean> => {
    let done = 0;
    try {
      for (const step of steps) {
        if (step.kind === 'sale') await actions.recordConsignmentSale.mutateAsync({ lineId: step.lineId, quantity: step.quantity, unitPrice: step.unitPrice, reason: null });
        else await actions.receiveConsignmentReturn.mutateAsync({ lineId: step.lineId, quantity: step.quantity, notes: note || undefined });
        done += 1;
      }
      showToast('Ο απολογισμός καταχωρίστηκε.', 'success');
      setOperation(null);
      return true;
    } catch (stepError) {
      const message = stepError instanceof Error ? stepError.message : 'Η ενέργεια δεν ολοκληρώθηκε.';
      showToast(done > 0 ? `Καταχωρίστηκαν ${done} από ${steps.length} κινήσεις. ${message}` : message, 'error');
      return false;
    }
  }, [actions.receiveConsignmentReturn, actions.recordConsignmentSale, showToast]);

  const createConsignmentLegalDraft = useCallback(
    (settlementId: string) => safeAction(() => actions.createConsignmentLegalDraft.mutateAsync(settlementId), 'Δημιουργήθηκε πρόχειρο παραστατικό.'),
    [actions.createConsignmentLegalDraft, safeAction],
  );

  const checkConsignmentInventory = useCallback(() => safeAction(async () => {
    const mismatches = await actions.checkConsignmentInventory.mutateAsync();
    if (mismatches.length > 0) {
      const first = mismatches[0];
      throw new Error(`Βρέθηκαν ${mismatches.length} διαφορές αποθήκης. Πρώτη: ${first.product_sku}${first.variant_suffix}, αναμενόμενα ${first.expected_quantity}, πραγματικά ${first.actual_quantity}.`);
    }
  }, 'Η αποθήκη Παρακαταθηκών συμφωνεί πλήρως.'), [actions.checkConsignmentInventory, safeAction]);

  // ── Επισκευές: ενέργειες ──
  const createRepairIntake = useCallback(
    (input: RepairIntakeInput) => safeAction(() => actions.createRepairIntake.mutateAsync(input), input.items.length > 1 ? `Παραλήφθηκαν ${input.items.length} τεμάχια και μπήκαν στην Παραγωγή.` : 'Η επισκευή παραλήφθηκε και μπήκε στην Παραγωγή.'),
    [actions.createRepairIntake, safeAction],
  );

  const completeRepairReady = useCallback(async (item: RepairItem) => {
    const yes = await confirm({ title: REPAIR_READY_CONFIRM.title, message: REPAIR_READY_CONFIRM.message(item.code), confirmText: REPAIR_READY_CONFIRM.confirmText });
    if (!yes) return false;
    return safeAction(() => actions.completeRepairProduction.mutateAsync(item.id), 'Η επισκευή βγήκε από την Παραγωγή και περιμένει έλεγχο.');
  }, [actions.completeRepairProduction, confirm, safeAction]);

  const moveRepairToStage = useCallback(async (item: RepairItem, stage: ProductionStage, moveOptions?: { pendingDispatch?: boolean }) => {
    const batch = liveRepairBatch(item);
    if (!batch) { showToast('Η επισκευή δεν έχει ενεργή παρτίδα Παραγωγής.', 'error'); return; }
    if (stage === ProductionStage.Ready) { await completeRepairReady(item); return; }
    setMovingRepairId(item.id);
    try {
      if (batch.current_stage === ProductionStage.Polishing && stage === ProductionStage.Polishing) {
        if (moveOptions?.pendingDispatch === false) await productionRepository.markBatchesDispatched([batch.id], profile?.full_name);
        else await productionRepository.markBatchesPendingDispatch([batch.id], profile?.full_name);
      } else {
        await productionRepository.updateBatchStage(batch.id, stage, profile?.full_name, moveOptions?.pendingDispatch);
      }
      await Promise.all([invalidateCustomerService(queryClient), invalidateProductionBatches(queryClient)]);
      showToast('Η παρτίδα μετακινήθηκε.', 'success');
    } catch (moveError) {
      showToast(moveError instanceof Error ? moveError.message : 'Η μετακίνηση δεν ολοκληρώθηκε.', 'error');
    } finally {
      setMovingRepairId(null);
    }
  }, [completeRepairReady, liveRepairBatch, profile?.full_name, queryClient, showToast]);

  const toggleRepairHold = useCallback((item: RepairItem) => {
    const batch = liveRepairBatch(item);
    const held = !!batch?.on_hold || item.status === 'on_hold';
    if (held) {
      void safeAction(() => actions.setRepairExceptionState.mutateAsync({ repairItemId: item.id, status: 'in_production', reason: 'Συνέχεια παραγωγής' }), 'Η επισκευή συνεχίζει στην Παραγωγή.');
      return;
    }
    setOperation({ kind: 'exception', item, status: 'on_hold' });
  }, [actions.setRepairExceptionState, liveRepairBatch, safeAction]);

  const removeRepairFromProduction = useCallback(async (item: RepairItem) => {
    const yes = await confirm({ title: 'Αφαίρεση από Παραγωγή', message: `Η επισκευή ${item.code} θα βγει από την Παραγωγή και θα επιστρέψει σε «Παραλήφθηκε».`, confirmText: 'Αφαίρεση' });
    if (yes) await safeAction(() => actions.removeRepairFromProduction.mutateAsync({ repairItemId: item.id, reason: 'Αφαίρεση από Παραγωγή' }), 'Η επισκευή αφαιρέθηκε από την Παραγωγή.');
  }, [actions.removeRepairFromProduction, confirm, safeAction]);

  const returnRepairToProduction = useCallback(
    (item: RepairItem) => safeAction(() => actions.returnRepairToProduction.mutateAsync(item.id), 'Η επισκευή μπήκε στην Παραγωγή.'),
    [actions.returnRepairToProduction, safeAction],
  );

  const deleteRepair = useCallback(async (item: RepairItem) => {
    const yes = await confirm({ title: 'Διαγραφή επισκευής', message: `Η επισκευή ${item.code} θα διαγραφεί οριστικά.`, isDestructive: true, confirmText: 'Διαγραφή' });
    if (!yes) return false;
    return safeAction(() => actions.deleteRepairItem.mutateAsync({ repairItemId: item.id, reason: 'Διαγραφή από χρήστη' }), 'Η επισκευή διαγράφηκε.');
  }, [actions.deleteRepairItem, confirm, safeAction]);

  const archiveRepair = useCallback(async (item: RepairItem) => {
    const archive = item.is_archived !== true;
    const yes = await confirm({
      title: archive ? 'Αρχειοθέτηση επισκευής' : 'Ανάκτηση από αρχείο',
      message: archive ? `Η επισκευή ${item.code} θα κρυφτεί από τον πίνακα.` : `Η επισκευή ${item.code} θα επανέλθει στον πίνακα.`,
      confirmText: archive ? 'Αρχειοθέτηση' : 'Ανάκτηση',
    });
    if (yes) await safeAction(() => actions.archiveRepairItem.mutateAsync({ repairItemId: item.id, archive }), archive ? 'Η επισκευή αρχειοθετήθηκε.' : 'Η επισκευή ανακτήθηκε.');
  }, [actions.archiveRepairItem, confirm, safeAction]);

  const deliverRepair = useCallback(
    (item: RepairItem) => safeAction(() => actions.markRepairDelivered.mutateAsync(item.id), 'Η επισκευή παραδόθηκε στον πελάτη.'),
    [actions.markRepairDelivered, safeAction],
  );

  const createRepairLegalDraft = useCallback(
    (item: RepairItem) => safeAction(() => actions.createRepairLegalDraft.mutateAsync(item.id), 'Δημιουργήθηκε πρόχειρο παραστατικό υπηρεσίας.'),
    [actions.createRepairLegalDraft, safeAction],
  );

  const uploadRepairPhoto = useCallback(
    (item: RepairItem, file: File, attachmentType: 'intake' | 'quality' | 'other') => safeAction(
      () => actions.uploadRepairAttachment.mutateAsync({ repairItemId: item.id, file, attachmentType }),
      'Η φωτογραφία αποθηκεύτηκε.',
    ),
    [actions.uploadRepairAttachment, safeAction],
  );

  return {
    // περιβάλλον
    profile, role, canSeeCost, isAdmin, isSeller, defaultSellerId,
    data, isLoading, error, productionBatches, customers, products, warehouses, sourceWarehouses, orders,
    customerById, sellerById, productBySku, customerName,
    actions, confirm, showToast, safeAction,
    operation, setOperation,
    // παρακαταθήκες
    consignmentBundles, existingOrderLineIds, consignmentSaleOptions,
    createConsignments, handoffConsignment, runSettlementSteps, createConsignmentLegalDraft, checkConsignmentInventory,
    // επισκευές
    chargeByRepairId, liveRepairBatch, movingRepairId,
    createRepairIntake, completeRepairReady, moveRepairToStage, toggleRepairHold, removeRepairFromProduction,
    returnRepairToProduction, deleteRepair, archiveRepair, deliverRepair, createRepairLegalDraft, uploadRepairPhoto,
  };
}

export type ServiceController = ReturnType<typeof useServiceController>;
