import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { RETAIL_CUSTOMER_ID, RETAIL_CUSTOMER_NAME, RETAIL_NOTE_PREFIX } from '../../lib/supabase';
import { getOrderCustomerName } from '../../utils/orderCustomer';
import { composeNotesWithRetailClient } from '../../utils/retailNotes';
import { orderMatchesSearch } from '../../features/orders/orderListSearch';
import OrderCustomerName from '../../components/orders/OrderCustomerName';
import OrderInvoiceView from '../../components/OrderInvoiceView';
import ShipmentInvoiceView from '../../components/ShipmentInvoiceView';
import MergedShipmentInvoiceView from '../../components/MergedShipmentInvoiceView';
import OfferPrintView from '../../components/OfferPrintView';
import { Order, OrderStatus, OrderShipment } from '../../types';

const order: Order = {
    id: 'retail-order', customer_id: RETAIL_CUSTOMER_ID, customer_name: RETAIL_CUSTOMER_NAME,
    created_at: '2026-10-15T10:00:00Z', status: OrderStatus.Pending, total_price: 0, items: [],
    customer_phone: '6912345678',
    notes: composeNotesWithRetailClient('Παράδοση την Παρασκευή', 'Μαρία Παπαδοπούλου'),
};
const shipment: OrderShipment = {
    id: 'shipment', order_id: order.id, shipment_number: 1,
    shipped_at: order.created_at, created_at: order.created_at, shipped_by: 'Test', notes: null,
};

describe('retail customer presentation', () => {
    it('resolves names by account id and legacy account name, including CRLF notes', () => {
        expect(getOrderCustomerName(order, RETAIL_CUSTOMER_NAME)).toBe('Μαρία Παπαδοπούλου');
        expect(getOrderCustomerName({ ...order, customer_id: undefined, notes: order.notes!.replace(/\n/g, '\r\n') })).toBe('Μαρία Παπαδοπούλου');
        expect(getOrderCustomerName({ ...order, notes: '' })).toBe('Χωρίς όνομα πελάτη');
        expect(getOrderCustomerName({ customer_name: 'Wholesale' }, 'Updated name')).toBe('Updated name');
    });
    it('shows the person as the main name and a labelled retail chip only for retail orders', () => {
        const html = renderToStaticMarkup(<OrderCustomerName order={order} />);
        expect(html).toContain('Μαρία Παπαδοπούλου');
        expect(html).toContain('aria-label="Λιανική"');
        expect(html).toContain('>Λ</span>');
        expect(html).not.toContain('>Λιανική<');
        expect(renderToStaticMarkup(<OrderCustomerName order={{ customer_name: 'Wholesale' }} />)).not.toContain('>Λ</span>');
    });
    it('finds retail orders by the real name while retaining account search', () => {
        expect(orderMatchesSearch(order, 'μαρία')).toBe(true);
        expect(orderMatchesSearch(order, 'ΜΑΡΙΑ')).toBe(true);
        expect(orderMatchesSearch(order, 'λιανική')).toBe(true);
        expect(orderMatchesSearch(order, 'άγνωστος')).toBe(false);
    });
    it.each(['order', 'shipment', 'merged', 'offer'])('prints the actual name and clean notes in %s PDFs', (kind) => {
        const client = new QueryClient();
        client.setQueryData(['products'], []);
        client.setQueryData(['customers'], [{ id: RETAIL_CUSTOMER_ID, full_name: RETAIL_CUSTOMER_NAME, phone: 'SHARED PHONE', address: 'SHARED ADDRESS', vat_number: 'SHARED VAT' }]);
        const view = kind === 'order' ? <OrderInvoiceView order={order} />
            : kind === 'shipment' ? <ShipmentInvoiceView order={order} shipment={shipment} shipmentItems={[]} products={[]} customer={{ full_name: RETAIL_CUSTOMER_NAME, phone: 'SHARED PHONE', address: 'SHARED ADDRESS', vat_number: 'SHARED VAT' } as any} />
            : kind === 'merged' ? <MergedShipmentInvoiceView payloads={[{ order, shipment, shipmentItems: [] }]} products={[]} />
            : <OfferPrintView offer={{ ...order, status: 'Pending', custom_silver_price: 1 }} />;
        const html = renderToStaticMarkup(<QueryClientProvider client={client}>{view}</QueryClientProvider>);
        expect(html).toContain('Μαρία Παπαδοπούλου');
        expect(html).toContain('Παράδοση την Παρασκευή');
        expect(html).not.toContain(RETAIL_CUSTOMER_NAME);
        expect(html).not.toContain(RETAIL_NOTE_PREFIX);
        expect(html).toContain('6912345678');
        expect(html).not.toContain('SHARED PHONE');
        expect(html).not.toContain('SHARED ADDRESS');
        expect(html).not.toContain('SHARED VAT');
        client.clear();
    });
});
