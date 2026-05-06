import { Order, OrderDeliveryPlan, OrderShipmentItem, ProductionBatch, ProductionStage } from '../types';
import { buildItemIdentityKey, ItemIdentityLike } from './itemIdentity';

export type ShipmentSafetySeverity = 'error' | 'warning';

export interface ShipmentSafetyIssue {
  key: string;
  severity: ShipmentSafetySeverity;
  title: string;
  message: string;
  sku?: string;
  variant_suffix?: string | null;
  size_info?: string | null;
  line_id?: string | null;
  orderQty?: number;
  shippedQty?: number;
  remainingQty?: number;
  readyQty?: number;
  selectedQty?: number;
}

export interface ShipmentRequestLine {
  sku: string;
  variant_suffix?: string | null;
  size_info?: string | null;
  cord_color?: string | null;
  enamel_color?: string | null;
  line_id?: string | null;
  quantity: number;
}

interface QuantityLine extends ShipmentRequestLine {
  orderQty: number;
  shippedQty: number;
  remainingQty: number;
  readyQty: number;
}

function quantity(value: unknown): number {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function keyFor(item: ItemIdentityLike): string {
  return buildItemIdentityKey({
    sku: item.sku,
    variant_suffix: item.variant_suffix,
    size_info: item.size_info,
    cord_color: item.cord_color,
    enamel_color: item.enamel_color,
    line_id: item.line_id || null,
  });
}

function addToMap(map: Map<string, number>, key: string, qty: number) {
  map.set(key, (map.get(key) || 0) + qty);
}

function issueFromLine(
  line: QuantityLine,
  severity: ShipmentSafetySeverity,
  title: string,
  message: string,
  selectedQty?: number,
): ShipmentSafetyIssue {
  return {
    key: keyFor(line),
    severity,
    title,
    message,
    sku: line.sku,
    variant_suffix: line.variant_suffix ?? null,
    size_info: line.size_info ?? null,
    line_id: line.line_id ?? null,
    orderQty: line.orderQty,
    shippedQty: line.shippedQty,
    remainingQty: line.remainingQty,
    readyQty: line.readyQty,
    selectedQty,
  };
}

export function formatShipmentIssueLine(issue: ShipmentSafetyIssue): string {
  const parts = [
    issue.sku,
    issue.variant_suffix,
    issue.size_info ? `#${issue.size_info}` : null,
    issue.line_id ? `γραμμή ${issue.line_id.slice(0, 8)}` : null,
  ].filter(Boolean);

  const counts = [
    issue.orderQty !== undefined ? `παραγγελία ${issue.orderQty}` : null,
    issue.shippedQty !== undefined ? `έχουν σταλεί ${issue.shippedQty}` : null,
    issue.remainingQty !== undefined ? `απομένουν ${issue.remainingQty}` : null,
    issue.readyQty !== undefined ? `έτοιμα ${issue.readyQty}` : null,
    issue.selectedQty !== undefined ? `επιλέχθηκαν ${issue.selectedQty}` : null,
  ].filter(Boolean);

  return `${parts.join(' ')}: ${counts.join(', ')}`;
}

export function hasBlockingShipmentIssues(issues: ShipmentSafetyIssue[]): boolean {
  return issues.some((issue) => issue.severity === 'error');
}

export function getReadyQuantityMap(orderId: string, batches: ProductionBatch[]): Map<string, number> {
  const ready = new Map<string, number>();
  batches
    .filter((batch) => batch.order_id === orderId && batch.current_stage === ProductionStage.Ready)
    .forEach((batch) => addToMap(ready, keyFor(batch), quantity(batch.quantity)));
  return ready;
}

export function getRemainingQuantityLines(
  order: Order,
  shipmentItems: OrderShipmentItem[],
  batches: ProductionBatch[],
): QuantityLine[] {
  const shipped = new Map<string, number>();
  shipmentItems.forEach((item) => addToMap(shipped, keyFor(item), quantity(item.quantity)));

  const ready = getReadyQuantityMap(order.id, batches);
  const lines: QuantityLine[] = [];

  order.items.forEach((item) => {
    const key = keyFor(item);
    const orderQty = quantity(item.quantity);
    const shippedQty = shipped.get(key) || 0;
    const remainingQty = Math.max(0, orderQty - shippedQty);
    lines.push({
      sku: item.sku,
      variant_suffix: item.variant_suffix ?? null,
      size_info: item.size_info ?? null,
      cord_color: item.cord_color ?? null,
      enamel_color: item.enamel_color ?? null,
      line_id: item.line_id ?? null,
      quantity: remainingQty,
      orderQty,
      shippedQty,
      remainingQty,
      readyQty: ready.get(key) || 0,
    });
  });

  return lines;
}

export function validateShipmentRequest(
  order: Order,
  shipmentItems: OrderShipmentItem[],
  batches: ProductionBatch[],
  requestedItems: ShipmentRequestLine[],
): ShipmentSafetyIssue[] {
  const issues: ShipmentSafetyIssue[] = [];
  const lines = getRemainingQuantityLines(order, shipmentItems, batches);
  const lineByKey = new Map(lines.map((line) => [keyFor(line), line]));

  const selected = new Map<string, number>();
  requestedItems.forEach((item) => addToMap(selected, keyFor(item), quantity(item.quantity)));

  for (const [key, selectedQty] of selected.entries()) {
    const line = lineByKey.get(key);
    if (!line) {
      const item = requestedItems.find((candidate) => keyFor(candidate) === key)!;
      issues.push({
        key,
        severity: 'error',
        title: 'Το επιλεγμένο είδος δεν υπάρχει πλέον στην παραγγελία',
        message: 'Δεν θα γίνει αποστολή γιατί αυτό το είδος δεν αντιστοιχεί σε ενεργή γραμμή της παραγγελίας.',
        sku: item.sku,
        variant_suffix: item.variant_suffix ?? null,
        size_info: item.size_info ?? null,
        line_id: item.line_id ?? null,
        selectedQty,
      });
      continue;
    }

    if (selectedQty > line.remainingQty) {
      issues.push(issueFromLine(
        line,
        'error',
        'Επιλέχθηκαν περισσότερα τεμάχια από όσα απομένουν',
        'Μειώστε την ποσότητα ή ελέγξτε το ιστορικό αποστολών πριν συνεχίσετε.',
        selectedQty,
      ));
    }

    if (selectedQty > line.readyQty) {
      issues.push(issueFromLine(
        line,
        'error',
        'Επιλέχθηκαν περισσότερα τεμάχια από όσα είναι Έτοιμα',
        'Η αποστολή μπλοκάρεται για να μη φύγει λάθος παρτίδα.',
        selectedQty,
      ));
    }
  }

  return issues;
}

export function validateReadyMatchesRemainingForTransfer(
  order: Order,
  shipmentItems: OrderShipmentItem[],
  batches: ProductionBatch[],
): ShipmentSafetyIssue[] {
  const lines = getRemainingQuantityLines(order, shipmentItems, batches);
  const issues = lines
    .filter((line) => line.remainingQty > 0 && line.readyQty !== line.remainingQty)
    .map((line) => issueFromLine(
      line,
      'error',
      'Το υπόλοιπο δεν ταιριάζει ακριβώς με τις Έτοιμες παρτίδες',
      line.readyQty < line.remainingQty
        ? 'Υπάρχουν λιγότερα Έτοιμα τεμάχια από το υπόλοιπο. Ολοκληρώστε πρώτα την παραγωγή.'
        : 'Υπάρχουν περισσότερα Έτοιμα τεμάχια από το υπόλοιπο. Χρειάζεται έλεγχος ιστορικού πριν γίνει μεταφορά.',
    ));

  const knownRemainingKeys = new Set(lines.filter((line) => line.remainingQty > 0).map((line) => keyFor(line)));
  const ready = getReadyQuantityMap(order.id, batches);
  for (const [key, readyQty] of ready.entries()) {
    if (readyQty <= 0 || knownRemainingKeys.has(key)) continue;
    const batch = batches.find((candidate) => candidate.order_id === order.id && candidate.current_stage === ProductionStage.Ready && keyFor(candidate) === key);
    issues.push({
      key,
      severity: 'error',
      title: 'Υπάρχει Έτοιμη παρτίδα χωρίς αντίστοιχο υπόλοιπο',
      message: 'Η μεταφορά μπλοκάρεται γιατί αυτή η παρτίδα δεν αντιστοιχεί σε τεμάχιο που απομένει στην παραγγελία.',
      sku: batch?.sku,
      variant_suffix: batch?.variant_suffix ?? null,
      size_info: batch?.size_info ?? null,
      line_id: batch?.line_id ?? null,
      remainingQty: 0,
      readyQty,
    });
  }

  return issues;
}

export function getDuplicateActiveDeliveryPlanGroups(
  plans: OrderDeliveryPlan[],
): Array<{ orderId: string; plans: OrderDeliveryPlan[] }> {
  const groups = new Map<string, OrderDeliveryPlan[]>();
  plans
    .filter((plan) => plan.plan_status === 'active')
    .forEach((plan) => {
      const existing = groups.get(plan.order_id);
      if (existing) existing.push(plan);
      else groups.set(plan.order_id, [plan]);
    });

  return Array.from(groups.entries())
    .filter(([, orderPlans]) => orderPlans.length > 1)
    .map(([orderId, orderPlans]) => ({
      orderId,
      plans: [...orderPlans].sort((a, b) => {
        const at = new Date(a.target_at || a.created_at).getTime();
        const bt = new Date(b.target_at || b.created_at).getTime();
        if (at !== bt) return at - bt;
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      }),
    }));
}

