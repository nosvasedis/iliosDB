// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import DeliveryPlannerModal from '../../components/deliveries/DeliveryPlannerModal';
import { appUpdates } from '../../lib/appUpdates';

afterEach(cleanup);

it('keeps delivery notes during a background refetch and clears protection when the modal closes', async () => {
  const initial = { id: 'plan-1', order_id: 'order-1', planning_mode: 'exact', target_at: '2026-10-26T12:00:00Z', internal_notes: 'saved notes' } as any;
  const props = { orders: [], customers: [], onClose: vi.fn(), onSave: vi.fn(), existingPlan: initial };
  const view = render(<DeliveryPlannerModal {...props} isOpen />);
  expect(appUpdates.getSnapshot().blockers).toHaveLength(0);
  const notes = () => view.getByPlaceholderText('Σημειώσεις (προαιρετικά)') as HTMLTextAreaElement;
  fireEvent.change(notes(), { target: { value: 'unsaved delivery notes' } });
  const refreshed = { ...initial, internal_notes: 'background server notes' };
  view.rerender(<DeliveryPlannerModal {...props} existingPlan={refreshed} existingReminders={[]} isOpen />);
  expect(notes().value).toBe('unsaved delivery notes');
  expect(appUpdates.shouldWarnBeforeUnload()).toBe(true);
  view.rerender(<DeliveryPlannerModal {...props} existingPlan={refreshed} isOpen={false} />);
  expect(appUpdates.shouldWarnBeforeUnload()).toBe(false);
  view.rerender(<DeliveryPlannerModal {...props} existingPlan={refreshed} isOpen />);
  expect(notes().value).toBe('background server notes');
  expect(appUpdates.getSnapshot().blockers).toHaveLength(0);
});
