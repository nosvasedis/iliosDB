// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
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

afterEach(cleanup);

const buttons = (container: HTMLElement) => Array.from(container.querySelectorAll('button'));

describe('consignment pricing and deletion controls', () => {
  it('saves an exact offer using Greek decimal input and a reason', async () => {
    const ctl = controller();
    const view = render(<ConsignmentOfferDialog ctl={ctl} entry={entry} />);
    fireEvent.change(view.getByLabelText('Συνολικό ποσό προσφοράς (€)'), { target: { value: '300,00' } });
    fireEvent.change(view.container.querySelector('textarea')!, { target: { value: 'Συμφωνία 300 €' } });
    expect(buttons(view.container)).toHaveLength(1);
    const save = buttons(view.container)[0];
    expect(save.disabled).toBe(false);
    await act(async () => { fireEvent.click(save); });
    expect(ctl.actions.setConsignmentOffer.mutateAsync).toHaveBeenCalledWith({ consignmentId: 'c1', total: 300, reason: 'Συμφωνία 300 €' });
  });
  it('rejects blank, negative, non-finite and excess decimal amounts', () => {
    const ctl = controller();
    const view = render(<ConsignmentOfferDialog ctl={ctl} entry={entry} />);
    fireEvent.change(view.container.querySelector('textarea')!, { target: { value: 'Συμφωνία' } });
    for (const value of ['', '-1', '1,001', '1.0000001', 'Infinity', 'abc']) {
      fireEvent.change(view.container.querySelector('input')!, { target: { value } });
      expect(buttons(view.container)[0].disabled).toBe(true);
    }
  });
  it('requires both the deletion reason and confirmation that outstanding goods returned', async () => {
    const ctl = controller();
    const view = render(<DeleteConsignmentDialog ctl={ctl} entry={entry} />);
    fireEvent.change(view.container.querySelector('textarea')!, { target: { value: 'Διόρθωση' } });
    expect(buttons(view.container)[1].disabled).toBe(true);
    fireEvent.click(view.container.querySelector('input')!);
    expect(buttons(view.container)[1].disabled).toBe(false);
    await act(async () => { fireEvent.click(buttons(view.container)[1]); });
    expect(ctl.actions.deleteConsignment.mutateAsync).toHaveBeenCalledWith({ consignmentId: 'c1', reason: 'Διόρθωση', returnToStock: true });
  });
  it.each([{ due: 12 }, { openReturns: 1 }])('blocks deletion of an unresolved record %j', status => {
    const view = render(<DeleteConsignmentDialog ctl={controller(status)} entry={entry} />);
    expect(buttons(view.container)[1].disabled).toBe(true);
    expect(view.getByRole('alert')).toBeTruthy();
  });
});
