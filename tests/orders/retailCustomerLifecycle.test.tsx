// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildOrderCustomerFields, getOrderCustomerName, getOrderCustomerPhone, getRetailClientProfile, ordersHaveSameCustomer } from '../../utils/orderCustomer';
import { buildAssortmentIndex, getCustomerAssortment, getCustomerAssortmentForOrders } from '../../features/customers/customerAssortment';
import { composeNotesWithRetailClient, extractRetailClientFromNotes } from '../../utils/retailNotes';
import { RETAIL_CUSTOMER_ID, RETAIL_CUSTOMER_NAME, RETAIL_NOTE_PREFIX } from '../../utils/retailConstants';
import { buildTransferPlan, getCandidateTransferTargetOrders } from '../../features/orders/transferHelpers';
import RetailClientField from '../../components/orders/RetailClientField';
import { Customer, Order, OrderStatus, ProductionBatch, ProductionStage } from '../../types';

const identity = { customer_id: RETAIL_CUSTOMER_ID, customer_name: RETAIL_CUSTOMER_NAME, customer_phone: '6912345678' };
const makeOrder = (id: string, name: string): Order => ({
    ...identity, id, notes: composeNotesWithRetailClient('Παράδοση Παρασκευή', name),
    status: OrderStatus.Ready, created_at: '2026-10-15T10:00:00Z', total_price: 10,
    items: [{ sku: 'RN001', quantity: 1, price_at_order: 10, line_id: 'line-1' }],
});

afterEach(cleanup);

describe('retail customer lifecycle', () => {
    it('keeps name, phone and normal notes across save, edit, and offer conversion', () => {
        const saved = buildOrderCustomerFields({ ...identity, notes: 'Παράδοση Παρασκευή' }, 'Μαρία');
        expect(saved.customer_id).toBe(RETAIL_CUSTOMER_ID);
        expect(saved.customer_name).toBe(RETAIL_CUSTOMER_NAME);
        expect(saved.customer_phone).toBe(identity.customer_phone);
        expect(getOrderCustomerName(saved)).toBe('Μαρία');
        const parsed = extractRetailClientFromNotes(saved.notes);
        const edited = buildOrderCustomerFields({ ...saved, notes: parsed.cleanNotes }, 'Μαρία Παπαδοπούλου');
        const converted = buildOrderCustomerFields(edited);
        expect(converted).toEqual(edited);
        expect(extractRetailClientFromNotes(converted.notes)).toEqual({ retailClientLabel: 'Μαρία Παπαδοπούλου', cleanNotes: 'Παράδοση Παρασκευή' });
        expect(converted.customer_phone).toBe(identity.customer_phone);
    });
    it('normalizes a legacy offer that has the real name under the retail account id', () => {
        const result = buildOrderCustomerFields({ ...identity, customer_name: 'Ελένη', notes: 'Οδηγίες' });
        expect(result.customer_name).toBe(RETAIL_CUSTOMER_NAME);
        expect(getOrderCustomerName(result)).toBe('Ελένη');
        expect(result.customer_phone).toBe(identity.customer_phone);
    });
    it('clears obsolete retail metadata when switching to a regular customer', () => {
        const result = buildOrderCustomerFields({ customer_id: 'wholesale', customer_name: 'Κατάστημα', notes: composeNotesWithRetailClient('Οδηγίες', 'Παλαιός πελάτης') });
        expect(result.notes).toBe('Οδηγίες');
        expect(result.customer_name).toBe('Κατάστημα');
    });
    it('never uses the shared retail account phone for an individual person', () => {
        expect(getOrderCustomerPhone(identity, { phone: 'SHARED PHONE' })).toBe(identity.customer_phone);
        expect(getOrderCustomerPhone({ ...identity, customer_phone: '' }, { phone: 'SHARED PHONE' })).toBe('');
        expect(getOrderCustomerPhone({ customer_name: 'Κατάστημα', customer_phone: 'old' }, { phone: 'current' })).toBe('current');
    });
    it('reads moved metadata, CRLF and duplicate markers without losing normal notes', () => {
        const notes = `Οδηγίες\r\n ${RETAIL_NOTE_PREFIX} Μαρία\r\n${RETAIL_NOTE_PREFIX} Μαρία\r\nΠαρασκευή`;
        expect(extractRetailClientFromNotes(notes)).toEqual({ retailClientLabel: 'Μαρία', cleanNotes: 'Οδηγίες\nΠαρασκευή' });
        const result = composeNotesWithRetailClient(notes, 'Ελένη\nΝικολάου');
        expect(result.split(RETAIL_NOTE_PREFIX)).toHaveLength(2);
        expect(extractRetailClientFromNotes(result)).toEqual({ retailClientLabel: 'Ελένη Νικολάου', cleanNotes: 'Οδηγίες\nΠαρασκευή' });
        expect(composeNotesWithRetailClient(result, '')).toBe('Οδηγίες\nΠαρασκευή');
    });
    it('keeps ordinary notes that merely mention the marker within a sentence', () => {
        const notes = `Παράδειγμα ${RETAIL_NOTE_PREFIX} δεν είναι μεταδεδομένα`;
        expect(extractRetailClientFromNotes(notes).cleanNotes).toBe(notes);
    });
    it('only offers transfers to the same named retail client', () => {
        const source = makeOrder('source', 'Μαρία');
        const same = makeOrder('same', '  ΜΑΡΊΑ  ');
        const different = makeOrder('different', 'Ελένη');
        const unnamed = makeOrder('unnamed', '');
        expect(getCandidateTransferTargetOrders(source, [source, same, different, unnamed])).toEqual([same]);
        expect(getCandidateTransferTargetOrders(unnamed, [makeOrder('other-unnamed', '')])).toEqual([]);
        expect(ordersHaveSameCustomer(source, { customer_name: 'Μαρία', customer_id: 'regular' })).toBe(false);
    });
    it('blocks mismatched retail clients in the plan revalidated by the save API', () => {
        const source = makeOrder('source', 'Μαρία');
        const batch = { id: 'batch', order_id: source.id, sku: 'RN001', line_id: 'line-1', quantity: 1, current_stage: ProductionStage.Ready } as ProductionBatch;
        const snapshot = { shipments: [], items: [] };
        expect(buildTransferPlan(source, makeOrder('same', 'Μαρία'), snapshot, [batch]).isValid).toBe(true);
        expect(buildTransferPlan(source, makeOrder('other', 'Ελένη'), snapshot, [batch]).isValid).toBe(false);
        expect(buildTransferPlan(source, source, snapshot, [batch]).isValid).toBe(false);
        expect(buildTransferPlan(source, { ...makeOrder('closed', 'Μαρία'), status: OrderStatus.Delivered }, snapshot, [batch]).isValid).toBe(false);
    });
    it('builds one person\'s card from their own orders and latest phone', () => {
        const older = { ...makeOrder('older', 'Μαρία'), customer_phone: '6900000000', created_at: '2026-01-01T10:00:00Z' };
        const newer = { ...makeOrder('newer', ' ΜΑΡΊΑ '), customer_phone: '', created_at: '2026-06-01T10:00:00Z' };
        const latestWithPhone = { ...makeOrder('phone', 'Μαρία'), customer_phone: '6911111111', created_at: '2026-03-01T10:00:00Z' };
        const profile = getRetailClientProfile([older, newer, latestWithPhone, makeOrder('other', 'Ελένη')], older);
        expect(profile?.name).toBe('Μαρία');
        expect(profile?.phone).toBe('6911111111');
        expect(profile?.orders.map(o => o.id)).toEqual(['newer', 'phone', 'older']);
    });
    it('treats an unnamed retail order or a regular order as nobody in particular', () => {
        const unnamed = makeOrder('unnamed', '');
        expect(getRetailClientProfile([unnamed, makeOrder('other-unnamed', '')], unnamed)).toBeNull();
        const regular = { ...makeOrder('regular', ''), customer_id: 'wholesale', customer_name: 'Κατάστημα' };
        expect(getRetailClientProfile([regular], regular)).toBeNull();
    });
    it('limits the purchase mix to one person inside the shared account', () => {
        const maria = makeOrder('maria', 'Μαρία');
        const eleni = { ...makeOrder('eleni', 'Ελένη'), items: [{ sku: 'RN001', quantity: 4, price_at_order: 10, line_id: 'line-2' }] };
        const index = buildAssortmentIndex({
            customers: [{ id: RETAIL_CUSTOMER_ID, full_name: RETAIL_CUSTOMER_NAME } as Customer],
            orders: [maria, eleni],
            products: [],
        });
        expect(getCustomerAssortmentForOrders(index, RETAIL_CUSTOMER_ID, new Set(['maria']), 'all').totals.qty).toBe(1);
        expect(getCustomerAssortment(index, RETAIL_CUSTOMER_ID, 'all').totals.qty).toBe(5);
    });
    it('provides one labelled name input and an explicit customer change action', () => {
        const onChange = vi.fn();
        const onChangeCustomer = vi.fn();
        const view = render(<RetailClientField value="Μαρία" onChange={onChange} onChangeCustomer={onChangeCustomer} />);
        const input = view.container.querySelector('input')!;
        expect(input.value).toBe('Μαρία');
        expect(view.container.querySelector('label')!.htmlFor).toBe(input.id);
        fireEvent.change(input, { target: { value: 'Ελένη' } });
        expect(onChange).toHaveBeenCalledWith('Ελένη');
        fireEvent.click(view.getByRole('button'));
        expect(onChangeCustomer).toHaveBeenCalledOnce();
    });
});
