import React from 'react';
import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import ConsignmentOfferDialog from '../../components/customerService/consignments/ConsignmentOfferDialog';
import DeleteConsignmentDialog from '../../components/customerService/consignments/DeleteConsignmentDialog';
import type { ServiceController } from '../../components/customerService/useServiceController';

vi.mock('../../components/customerService/shared/serviceUi', async importOriginal => {
  const original = await importOriginal<any>();
  return { ...original, ServiceModal: ({ children, footer }: any) => <div>{children}<footer>{footer}</footer></div> };
});
const entry = { id: 'c1', code: 'ΠΑΡ-1', customer_id: 'customer', handed_off_at: '2026-10-21' } as any;
function controller(overrides: any = {}) {
  return {
    consignmentBundles: [{ entry, lines: [{ quantity: 3, pending_quantity: 3, locked_unit_price: 150, sold_quantity: 0, returned_quantity: 0 }], summary: { pending: 3, due: 0, openReturns: 0, ...overrides } }],
    customerName: () => 'Πελάτης', setOperation: vi.fn(),
    safeAction: async (task: any) => { await task(); return true; },
    actions: { setConsignmentOffer: { mutateAsync: vi.fn() }, deleteConsignment: { mutateAsync: vi.fn() } },
  } as unknown as ServiceController;
}

describe('consignment pricing and deletion controls', () => {
  it('saves an exact offer using Greek decimal input and a reason', async () => {
    const ctl = controller();
    const view = create(<ConsignmentOfferDialog ctl={ctl} entry={entry} />);
    act(() => view.root.findByProps({ 'aria-label': 'Συνολικό ποσό προσφοράς (€)' }).props.onChange({ target: { value: '300,00' } }));
    act(() => view.root.findByType('textarea').props.onChange({ target: { value: 'Συμφωνία 300 €' } }));
    const save = view.root.findByType('button');
    expect(save.props.disabled).toBe(false);
    await act(async () => { await save.props.onClick(); });
    expect(ctl.actions.setConsignmentOffer.mutateAsync).toHaveBeenCalledWith({ consignmentId: 'c1', total: 300, reason: 'Συμφωνία 300 €' });
    view.unmount();
  });
  it('rejects blank, negative, non-finite and excess decimal amounts', () => {
    const ctl = controller();
    const view = create(<ConsignmentOfferDialog ctl={ctl} entry={entry} />);
    act(() => view.root.findByType('textarea').props.onChange({ target: { value: 'Συμφωνία' } }));
    for (const value of ['', '-1', '1,001', '1.0000001', 'Infinity', 'abc']) {
      act(() => view.root.findByType('input').props.onChange({ target: { value } }));
      expect(view.root.findByType('button').props.disabled).toBe(true);
    }
    view.unmount();
  });
  it('requires both the deletion reason and confirmation that outstanding goods returned', async () => {
    const ctl = controller();
    const view = create(<DeleteConsignmentDialog ctl={ctl} entry={entry} />);
    act(() => view.root.findByType('textarea').props.onChange({ target: { value: 'Διόρθωση' } }));
    expect(view.root.findAllByType('button')[1].props.disabled).toBe(true);
    act(() => view.root.findByType('input').props.onChange({ target: { checked: true } }));
    expect(view.root.findAllByType('button')[1].props.disabled).toBe(false);
    await act(async () => { await view.root.findAllByType('button')[1].props.onClick(); });
    expect(ctl.actions.deleteConsignment.mutateAsync).toHaveBeenCalledWith({ consignmentId: 'c1', reason: 'Διόρθωση', returnToStock: true });
    view.unmount();
  });
  it.each([{ due: 12 }, { openReturns: 1 }])('blocks deletion of an unresolved record %j', status => {
    const view = create(<DeleteConsignmentDialog ctl={controller(status)} entry={entry} />);
    expect(view.root.findAllByType('button')[1].props.disabled).toBe(true);
    expect(view.root.findByProps({ role: 'alert' })).toBeTruthy();
    view.unmount();
  });
});
