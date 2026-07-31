import { describe, expect, it } from 'vitest';
import { EnrichedDeliveryItem, Order, OrderDeliveryPlan, OrderDeliveryReminder } from '../../types';
import {
  buildDeliveryWorklistGroups,
  classifyWorklistItem,
  filterItemsForSelectedDay,
  itemFallsOnDate,
} from '../../utils/deliveryWorklist';

function makePlan(overrides: Partial<OrderDeliveryPlan> = {}): OrderDeliveryPlan {
  return {
    id: overrides.id || 'plan-1',
    order_id: overrides.order_id || 'order-1',
    plan_status: overrides.plan_status || 'active',
    planning_mode: overrides.planning_mode || 'exact',
    target_at: overrides.target_at ?? '2026-07-31T09:00:00.000Z',
    window_start: overrides.window_start ?? null,
    window_end: overrides.window_end ?? null,
    holiday_anchor: overrides.holiday_anchor ?? null,
    holiday_year: overrides.holiday_year ?? null,
    holiday_offset_days: overrides.holiday_offset_days ?? null,
    contact_phone_override: null,
    internal_notes: null,
    snoozed_until: null,
    completed_at: null,
    cancelled_at: null,
    created_by: null,
    updated_by: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };
}

function makeReminder(overrides: Partial<OrderDeliveryReminder> & { trigger_at: string }): OrderDeliveryReminder {
  return {
    id: overrides.id || 'rem-1',
    plan_id: overrides.plan_id || 'plan-1',
    trigger_at: overrides.trigger_at,
    action_type: overrides.action_type || 'call_client',
    reason: overrides.reason || 'test',
    sort_order: overrides.sort_order ?? 0,
    source: overrides.source || 'manual',
    acknowledged_at: null,
    completed_at: overrides.completed_at ?? null,
    completion_note: null,
    completed_by: null,
    snoozed_until: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };
}

function makeItem(overrides: {
  id?: string;
  urgency?: EnrichedDeliveryItem['urgency'];
  reminders?: OrderDeliveryReminder[];
  plan?: Partial<OrderDeliveryPlan>;
  shipReady?: boolean;
}): EnrichedDeliveryItem {
  const plan = makePlan({ id: overrides.id || 'plan-1', ...overrides.plan });
  const reminders = overrides.reminders || [];
  const pending = reminders.filter((r) => !r.completed_at);
  return {
    order: { id: plan.order_id, customer_name: 'Test', status: 'InProduction' } as Order,
    customer: undefined,
    plan,
    reminders,
    next_reminder: pending[0],
    pending_reminders: pending,
    phone: '6900000000',
    is_ready: !!overrides.shipReady,
    needs_call: false,
    call_reasons: [],
    urgency: overrides.urgency || 'scheduled',
    suggestions: [],
    matched_keywords: [],
    nameday_matches: [],
    next_nameday: null,
    target_date: plan.target_at,
    window_start: plan.window_start,
    window_end: plan.window_end,
    shipment_readiness: overrides.shipReady
      ? {
          total_batches: 1,
          ready_batches: 1,
          ready_qty: 1,
          total_qty: 1,
          ready_fraction: 1,
          is_fully_ready: true,
          is_partially_ready: false,
          shipments: [],
        }
      : undefined,
  };
}

describe('deliveryWorklist', () => {
  it('scopes items to the selected day without falling back to all', () => {
    const onDay = makeItem({
      id: 'a',
      plan: { target_at: '2026-07-31T10:00:00.000Z' },
    });
    const otherDay = makeItem({
      id: 'b',
      plan: { target_at: '2026-08-02T10:00:00.000Z' },
    });
    const day = new Date(2026, 6, 31);
    expect(itemFallsOnDate(onDay, day)).toBe(true);
    expect(itemFallsOnDate(otherDay, day)).toBe(false);
    expect(filterItemsForSelectedDay([onDay, otherDay], day).map((i) => i.plan.id)).toEqual(['a']);
  });

  it('classifies overdue before ship-ready', () => {
    const item = makeItem({
      urgency: 'overdue',
      shipReady: true,
      reminders: [makeReminder({ trigger_at: '2026-07-20T09:00:00.000Z' })],
    });
    expect(classifyWorklistItem(item, new Date(2026, 6, 31))).toBe('overdue');
  });

  it('groups worklist with expected labels', () => {
    const items = [
      makeItem({ id: 'overdue', urgency: 'overdue' }),
      makeItem({
        id: 'call',
        urgency: 'today',
        reminders: [makeReminder({ trigger_at: new Date().toISOString(), action_type: 'call_client' })],
      }),
      makeItem({ id: 'ship', urgency: 'soon', shipReady: true }),
    ];
    const groups = buildDeliveryWorklistGroups(items);
    expect(groups.map((g) => g.key)).toContain('overdue');
    expect(groups.map((g) => g.key)).toContain('ship_ready');
    expect(groups.find((g) => g.key === 'overdue')?.items).toHaveLength(1);
  });
});
