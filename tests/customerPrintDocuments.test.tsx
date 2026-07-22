import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import OfferPrintView from '../components/OfferPrintView';
import ShipmentInvoiceView from '../components/ShipmentInvoiceView';
import MergedShipmentInvoiceView from '../components/MergedShipmentInvoiceView';
import { Gender, OrderStatus, PlatingType, ProductionType } from '../types';
import { MISSING_SPECIAL_CREATION_NOTE, SPECIAL_CREATION_SKU } from '../utils/specialCreationSku';

const longSkuNote =
  'Full SKU note that must stay visible on the customer document even when it is long and needs to wrap onto another compact line.';

const product = {
  sku: 'PN001',
  prefix: 'PN',
  category: 'Pendant',
  description: '',
  gender: Gender.Women,
  image_url: 'https://example.test/pendant.jpg',
  weight_g: 1,
  plating_type: PlatingType.Platinum,
  production_type: ProductionType.Imported,
  active_price: 20,
  draft_price: 20,
  selling_price: 20,
  stock_qty: 0,
  sample_qty: 0,
  molds: [],
  is_component: false,
  recipe: [],
  labor: {
    casting_cost: 0,
    setter_cost: 0,
    technician_cost: 0,
    stone_setting_cost: 0,
    plating_cost_x: 0,
    plating_cost_d: 0,
    subcontract_cost: 0,
  },
  variants: [{ suffix: 'H', description: 'Platinum finish', stock_qty: 0, selling_price: 25 }],
};

const order = {
  id: 'order-1',
  customer_name: 'Customer',
  customer_phone: '2100000000',
  created_at: '2026-07-01T10:00:00.000Z',
  status: OrderStatus.PartiallyDelivered,
  total_price: 25,
  items: [
    {
      sku: 'PN001',
      variant_suffix: 'H',
      quantity: 1,
      price_at_order: 25,
      line_id: 'line-with-note',
      notes: longSkuNote,
    },
  ],
};

describe('customer print documents', () => {
  it('renders full SKU notes under shipment item descriptions from matching order lines', () => {
    const html = renderToStaticMarkup(
      <ShipmentInvoiceView
        order={order as any}
        shipment={{
          id: 'shipment-1',
          order_id: 'order-1',
          shipment_number: 1,
          shipped_at: '2026-07-02T10:00:00.000Z',
          shipped_by: 'Tester',
          notes: null,
          created_at: '2026-07-02T10:00:00.000Z',
        }}
        shipmentItems={[
          {
            id: 'shipment-item-1',
            shipment_id: 'shipment-1',
            sku: 'PN001',
            variant_suffix: 'H',
            quantity: 1,
            price_at_order: 25,
            line_id: 'line-with-note',
          },
        ]}
        products={[product as any]}
      />,
    );

    expect(html).toContain('Platinum finish');
    expect(html).toContain(longSkuNote);
    expect(html.indexOf('Platinum finish')).toBeLessThan(html.indexOf(longSkuNote));
    expect(html).toContain('customer-print-sku-note');
    expect(html).toContain('whitespace-pre-wrap');
  });

  it('hides the silver price badge when the offer requests it', () => {
    const html = renderToStaticMarkup(
      <OfferPrintView
        offer={{
          id: 'offer-hidden-silver',
          customer_name: 'Customer',
          created_at: '2026-07-01T10:00:00.000Z',
          status: 'Pending',
          custom_silver_price: 1,
          hide_silver_price_in_pdf: true,
          discount_percent: 0,
          total_price: 25,
          items: [],
        }}
      />,
    );

    expect(html).not.toContain('Τιμη Ασημιου');
  });

  it('uses a saved offer validity duration and can hide the validity block', () => {
    const customDurationHtml = renderToStaticMarkup(
      <OfferPrintView
        offer={{
          id: 'offer-custom-validity',
          customer_name: 'Customer',
          created_at: '2026-07-01T10:00:00.000Z',
          status: 'Pending',
          custom_silver_price: 1,
          offer_validity_days: 14,
          discount_percent: 0,
          total_price: 25,
          items: [],
        }}
      />,
    );
    expect(customDurationHtml).toContain('14 Ημέρες');

    const hiddenDurationHtml = renderToStaticMarkup(
      <OfferPrintView
        offer={{
          id: 'offer-no-validity',
          customer_name: 'Customer',
          created_at: '2026-07-01T10:00:00.000Z',
          status: 'Pending',
          custom_silver_price: 1,
          hide_offer_validity_in_pdf: true,
          discount_percent: 0,
          total_price: 25,
          items: [],
        }}
      />,
    );
    expect(hiddenDurationHtml).not.toContain('Ισχυς Προσφορας');
  });

  it('renders full SKU notes under offer item descriptions without truncating them', () => {
    const html = renderToStaticMarkup(
      <OfferPrintView
        offer={{
          id: 'offer-1',
          customer_name: 'Customer',
          customer_phone: '2100000000',
          created_at: '2026-07-01T10:00:00.000Z',
          status: 'Pending',
          custom_silver_price: 1,
          discount_percent: 0,
          total_price: 25,
          items: [
            {
              sku: 'PN001',
              variant_suffix: 'H',
              quantity: 1,
              price_at_order: 25,
              product_details: product as any,
              notes: longSkuNote,
            },
          ],
        }}
      />,
    );

    expect(html).toContain('Platinum finish');
    expect(html).toContain(longSkuNote);
    expect(html).toContain('Τιμη Ασημιου');
    expect(html.indexOf('Platinum finish')).toBeLessThan(html.indexOf(longSkuNote));
    expect(html).toContain('customer-print-sku-note');
    expect(html).toContain('whitespace-pre-wrap');
  });

  it('renders SP line notes in shipment and offer customer documents', () => {
    const spNote = 'SP custom sketch note with exact customer-facing instructions.';
    const spOrder = {
      ...order,
      items: [
        {
          sku: SPECIAL_CREATION_SKU,
          quantity: 1,
          price_at_order: 40,
          line_id: 'sp-line-with-note',
          notes: spNote,
        },
      ],
    };

    const shipmentHtml = renderToStaticMarkup(
      <ShipmentInvoiceView
        order={spOrder as any}
        shipment={{
          id: 'shipment-sp',
          order_id: 'order-1',
          shipment_number: 1,
          shipped_at: '2026-07-02T10:00:00.000Z',
          shipped_by: 'Tester',
          notes: null,
          created_at: '2026-07-02T10:00:00.000Z',
        }}
        shipmentItems={[
          {
            id: 'shipment-item-sp',
            shipment_id: 'shipment-sp',
            sku: SPECIAL_CREATION_SKU,
            quantity: 1,
            price_at_order: 40,
            line_id: 'sp-line-with-note',
          },
        ]}
        products={[]}
      />,
    );

    const offerHtml = renderToStaticMarkup(
      <OfferPrintView
        offer={{
          id: 'offer-sp',
          customer_name: 'Customer',
          customer_phone: '2100000000',
          created_at: '2026-07-01T10:00:00.000Z',
          status: 'Pending',
          custom_silver_price: 1,
          discount_percent: 0,
          total_price: 40,
          items: [
            {
              sku: SPECIAL_CREATION_SKU,
              quantity: 1,
              price_at_order: 40,
              notes: spNote,
            },
          ],
        }}
      />,
    );

    expect(shipmentHtml).toContain(`${SPECIAL_CREATION_SKU}</span>`);
    expect(shipmentHtml).toContain(spNote);
    expect(offerHtml).toContain(`${SPECIAL_CREATION_SKU}</div>`);
    expect(offerHtml).toContain(spNote);
  });

  it('renders SP notes in merged shipments and warns when a legacy line is ambiguous', () => {
    const shipment = {
      id: 'merged-sp-shipment',
      order_id: 'merged-sp-order',
      shipment_number: 1,
      shipped_at: '2026-07-02T10:00:00.000Z',
      shipped_by: 'Tester',
      created_at: '2026-07-02T10:00:00.000Z',
    };
    const ambiguousOrder = {
      ...order,
      id: 'merged-sp-order',
      items: [
        { sku: 'SP', quantity: 1, price_at_order: 40, notes: 'Καρφίτσα ήλιος' },
        { sku: 'SP', quantity: 1, price_at_order: 40, notes: 'Μενταγιόν κύμα' },
      ],
    };
    const html = renderToStaticMarkup(
      <MergedShipmentInvoiceView
        payloads={[{
          order: ambiguousOrder as any,
          shipment: shipment as any,
          shipmentItems: [{
            id: 'merged-item',
            shipment_id: shipment.id,
            sku: 'SP',
            quantity: 1,
            price_at_order: 40,
          }],
        }]}
        products={[]}
      />,
    );

    expect(html).toContain(MISSING_SPECIAL_CREATION_NOTE);
    expect(html).toContain('customer-print-sku-note');
  });
});
