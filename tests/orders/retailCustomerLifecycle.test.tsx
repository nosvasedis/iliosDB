import React from 'react';
import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import { buildOrderCustomerFields, getOrderCustomerName, getOrderCustomerPhone, ordersHaveSameCustomer } from '../../utils/orderCustomer';
import { composeNotesWithRetailClient, extractRetailClientFromNotes } from '../../utils/retailNotes';
import { RETAIL_CUSTOMER_ID, RETAIL_CUSTOMER_NAME, RETAIL_NOTE_PREFIX } from '../../utils/retailConstants';
import { buildTransferPlan, getCandidateTransferTargetOrders } from '../../features/orders/transferHelpers';
import RetailClientField from '../../components/orders/RetailClientField';
import { Order, OrderStatus, ProductionBatch, ProductionStage } from '../../types';

const identity = { customer_id: RETAIL_CUSTOMER_ID, customer_name: RETAIL_CUSTOMER_NAME, customer_phone: '6912345678' };
const makeOrder = (id: string, name: string): Order => ({
    ...identity, id, notes: composeNotesWithRetailClient('Παράδοση Παρασκευή', name),
    status: OrderStatus.Ready, created_at: '2026-10-15T10:00:00Z', total_price: 10,
    items: [{ sku: 'RN001', quantity: 1, price_at_order: 10, line_id: 'line-1' }],
});

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
    it('provides one labelled name input and an explicit customer change action', () => {
        const onChange = vi.fn();
        const onChangeCustomer = vi.fn();
        let renderer: ReturnType<typeof create>;
        act(() => { renderer = create(<RetailClientField value="Μαρία" onChange={onChange} onChangeCustomer={onChangeCustomer} />); });
        const input = renderer!.root.findByType('input');
        expect(input.props.value).toBe('Μαρία');
        expect(renderer!.root.findByType('label').props.htmlFor).toBe(input.props.id);
        act(() => input.props.onChange({ target: { value: 'Ελένη' } }));
        expect(onChange).toHaveBeenCalledWith('Ελένη');
        act(() => renderer!.root.findByType('button').props.onClick());
        expect(onChangeCustomer).toHaveBeenCalledOnce();
        // HoverTooltip only accesses window in events/cleanup; provide the browser timer used on unmount.
        vi.stubGlobal('window', { clearTimeout });
        act(() => renderer!.unmount());
        vi.unstubAllGlobals();
    });
});
