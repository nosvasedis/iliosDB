import React from 'react';
import { act, create } from 'react-test-renderer';
import { expect, it, vi } from 'vitest';
import DeliveryPlannerModal from '../../components/deliveries/DeliveryPlannerModal';
import { appUpdates } from '../../lib/appUpdates';

it('keeps delivery notes during a background refetch and clears protection when the modal closes', async () => {
  const initial = { id: 'plan-1', order_id: 'order-1', planning_mode: 'exact', target_at: '2026-10-26T12:00:00Z', internal_notes: 'saved notes' } as any;
  const props = { orders: [], customers: [], onClose: vi.fn(), onSave: vi.fn(), existingPlan: initial };
  let root!: ReturnType<typeof create>;
  try {
    await act(async () => { root = create(<DeliveryPlannerModal {...props} isOpen />); });
    expect(appUpdates.getSnapshot().blockers).toHaveLength(0);
    const notes = () => root.root.findByProps({ placeholder: 'Σημειώσεις (προαιρετικά)' });
    await act(async () => notes().props.onChange({ target: { value: 'unsaved delivery notes' } }));
    const refreshed = { ...initial, internal_notes: 'background server notes' };
    await act(async () => root.update(<DeliveryPlannerModal {...props} existingPlan={refreshed} existingReminders={[]} isOpen />));
    expect(notes().props.value).toBe('unsaved delivery notes');
    expect(appUpdates.shouldWarnBeforeUnload()).toBe(true);
    await act(async () => root.update(<DeliveryPlannerModal {...props} existingPlan={refreshed} isOpen={false} />));
    expect(appUpdates.shouldWarnBeforeUnload()).toBe(false);
    await act(async () => root.update(<DeliveryPlannerModal {...props} existingPlan={refreshed} isOpen />));
    expect(notes().props.value).toBe('background server notes');
    expect(appUpdates.getSnapshot().blockers).toHaveLength(0);
  } finally { await act(async () => root?.unmount()); }
});
