import { describe, expect, it } from 'vitest';
import { buildSingleCallReminder, getAttentionItems, getReminderUrgency } from '../../utils/deliveryScheduling';
import { EnrichedDeliveryItem, OrderDeliveryPlan, OrderDeliveryReminder, Order } from '../../types';

function makeReminder(overrides: Partial<OrderDeliveryReminder> & { trigger_at: string }): OrderDeliveryReminder {
  return {
    id: overrides.id || 'rem-1',
    plan_id: overrides.plan_id || 'plan-1',
    trigger_at: overrides.trigger_at,
    action_type: overrides.action_type || 'call_client',
    reason: overrides.reason || 'test',
    sort_order: overrides.sort_order ?? 0,
    source: overrides.source || 'manual',
    acknowledged_at: overrides.acknowledged_at ?? null,
    completed_at: overrides.completed_at ?? null,
    completion_note: overrides.completion_note ?? null,
    completed_by: overrides.completed_by ?? null,
    snoozed_until: overrides.snoozed_until ?? null,
    created_at: overrides.created_at || '2026-01-01T00:00:00.000Z',
    updated_at: overrides.updated_at || '2026-01-01T00:00:00.000Z'
  };
}

function makeItem(reminders: OrderDeliveryReminder[], planStatus: OrderDeliveryPlan['plan_status'] = 'active'): EnrichedDeliveryItem {
  const plan: OrderDeliveryPlan = {
    id: 'plan-1',
    order_id: 'order-1',
    plan_status: planStatus,
    planning_mode: 'exact',
    target_at: '2026-06-15T09:00:00.000Z',
    window_start: null,
    window_end: null,
    holiday_anchor: null,
    holiday_year: null,
    holiday_offset_days: null,
    contact_phone_override: null,
    internal_notes: null,
    snoozed_until: null,
    completed_at: null,
    cancelled_at: null,
    created_by: null,
    updated_by: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z'
  };
  const order = { id: 'order-1', customer_name: 'Test', status: 'InProduction' } as Order;
  const pending = reminders.filter((r) => !r.completed_at);
  return {
    order,
    customer: undefined,
    plan,
    reminders,
    next_reminder: pending[0],
    pending_reminders: pending,
    phone: null,
    is_ready: false,
    needs_call: false,
    call_reasons: [],
    urgency: 'scheduled',
    suggestions: [],
    matched_keywords: [],
    nameday_matches: [],
    next_nameday: null,
    target_date: plan.target_at,
    window_start: null,
    window_end: null
  };
}

describe('buildSingleCallReminder', () => {
  it('schedules day before at 13:00 when delivery is in the future', () => {
    const delivery = new Date('2026-06-15T09:00:00.000Z');
    const now = new Date('2026-06-10T10:00:00.000Z');
    const draft = buildSingleCallReminder(delivery, now);
    const trigger = new Date(draft.trigger_at);
    expect(trigger.getDate()).toBe(14);
    expect(trigger.getMonth()).toBe(5);
    expect(trigger.getHours()).toBe(13);
    expect(draft.action_type).toBe('call_client');
  });

  it('falls back to same morning when day-before is in the past', () => {
    const delivery = new Date('2026-06-12T15:00:00.000Z');
    const now = new Date('2026-06-12T08:00:00.000Z');
    const draft = buildSingleCallReminder(delivery, now);
    const trigger = new Date(draft.trigger_at);
    expect(trigger.getDate()).toBe(12);
    expect(trigger.getHours()).toBe(9);
  });
});

describe('getAttentionItems', () => {
  const now = new Date('2026-06-12T12:00:00.000Z');

  it('includes only overdue and today reminders', () => {
    const overdue = makeReminder({ id: 'r1', trigger_at: '2026-06-11T09:00:00.000Z' });
    const today = makeReminder({ id: 'r2', trigger_at: '2026-06-12T10:00:00.000Z' });
    const soon = makeReminder({ id: 'r3', trigger_at: '2026-06-14T09:00:00.000Z' });
    const items = [makeItem([overdue, today, soon])];

    const attention = getAttentionItems(items, now);
    expect(attention).toHaveLength(2);
    expect(attention.map((a) => a.reminder.id)).toEqual(['r1', 'r2']);
    expect(getReminderUrgency(soon, now)).toBe('soon');
  });

  it('excludes completed reminders and inactive plans', () => {
    const done = makeReminder({ id: 'r-done', trigger_at: '2026-06-12T08:00:00.000Z', completed_at: '2026-06-12T09:00:00.000Z' });
    const active = makeReminder({ id: 'r-active', trigger_at: '2026-06-12T08:00:00.000Z' });
    const completedPlan = makeItem([active], 'completed');
    const activePlan = makeItem([done, active]);

    expect(getAttentionItems([completedPlan], now)).toHaveLength(0);
    expect(getAttentionItems([activePlan], now)).toHaveLength(1);
    expect(getAttentionItems([activePlan], now)[0].reminder.id).toBe('r-active');
  });
});
