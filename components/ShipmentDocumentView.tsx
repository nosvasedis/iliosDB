import React from 'react';
import { Order, OrderFulfillmentSummary, OrderShipment, OrderShipmentItem } from '../types';
import { APP_LOGO } from '../constants';
import { formatOrderId } from '../utils/orderUtils';

interface Props {
  order: Order;
  shipment: OrderShipment;
  shipmentItems: OrderShipmentItem[];
  fulfillment?: OrderFulfillmentSummary | null;
}

const formatMoney = (value: number) => `${value.toFixed(2).replace('.', ',')}?`;
const formatDateTime = (value?: string | null) => value ? new Date(value).toLocaleString('el-GR') : '-';

export default function ShipmentDocumentView({ order, shipment, shipmentItems, fulfillment }: Props) {
  const vatRate = order.vat_rate !== undefined ? order.vat_rate : 0.24;

  return (
    <div className="bg-white text-black font-sans w-[210mm] min-h-[297mm] p-8 mx-auto shadow-lg print:shadow-none print:p-8 page-break-after-always flex flex-col gap-6">
      <header className="flex items-end justify-between border-b-2 border-slate-900 pb-4">
        <div className="flex items-center gap-4">
          <img src={APP_LOGO} alt="ILIOS" className="h-12 w-auto object-contain" />
          <div className="text-[10px] text-slate-600 leading-tight">
            <div className="font-black text-slate-900 text-xs uppercase tracking-[0.18em]">Shipment Document</div>
            <div>ILIOS KOSMIMA</div>
            <div>?????? 73, ??????????, 18120</div>
            <div>2104905405 ? ilioskosmima@gmail.com</div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-black text-slate-900 uppercase">?????? ?????????</div>
          <div className="mt-2 text-sm font-bold text-slate-600">???????? #{shipment.shipment_no}</div>
          <div className="text-xs text-slate-500 mt-1">?????????? {formatOrderId(order.id)}</div>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-4 text-sm">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">???????</div>
          <div className="mt-2 font-black text-slate-900 text-lg">{shipment.customer_snapshot || order.customer_name}</div>
          <div className="mt-2 text-slate-600">????????: {order.customer_phone || '-'}</div>
          <div className="text-slate-600">???????: {shipment.seller_snapshot || order.seller_name || '-'}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">???????? ?????????</div>
          <div className="mt-2 grid grid-cols-2 gap-2 text-sm text-slate-700">
            <div>
              <div className="text-[10px] uppercase tracking-wide text-slate-400">?????????</div>
              <div className="font-black">{shipment.status}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wide text-slate-400">??????????</div>
              <div className="font-bold">{formatDateTime(shipment.created_at)}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wide text-slate-400">????????</div>
              <div className="font-bold">{formatDateTime(shipment.dispatched_at)}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wide text-slate-400">????????</div>
              <div className="font-bold">{formatDateTime(shipment.delivered_at)}</div>
            </div>
          </div>
        </div>
      </section>

      <section className="flex-1">
        <table className="w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th className="text-left border-b-2 border-slate-900 pb-2 pr-2 font-black uppercase tracking-wide text-[10px] text-slate-500">SKU</th>
              <th className="text-left border-b-2 border-slate-900 pb-2 px-2 font-black uppercase tracking-wide text-[10px] text-slate-500">?????????</th>
              <th className="text-left border-b-2 border-slate-900 pb-2 px-2 font-black uppercase tracking-wide text-[10px] text-slate-500">???????</th>
              <th className="text-right border-b-2 border-slate-900 pb-2 px-2 font-black uppercase tracking-wide text-[10px] text-slate-500">???.</th>
              <th className="text-right border-b-2 border-slate-900 pb-2 px-2 font-black uppercase tracking-wide text-[10px] text-slate-500">????</th>
              <th className="text-right border-b-2 border-slate-900 pb-2 pl-2 font-black uppercase tracking-wide text-[10px] text-slate-500">??????</th>
              <th className="text-right border-b-2 border-slate-900 pb-2 pl-2 font-black uppercase tracking-wide text-[10px] text-slate-500">??????</th>
            </tr>
          </thead>
          <tbody>
            {shipmentItems.map((item) => (
              <tr key={item.id}>
                <td className="py-3 pr-2 border-b border-slate-100 font-black text-slate-900">{item.sku}</td>
                <td className="py-3 px-2 border-b border-slate-100 text-slate-700">{item.variant_suffix || '-'}</td>
                <td className="py-3 px-2 border-b border-slate-100 text-slate-700">{item.size_info || '-'}</td>
                <td className="py-3 px-2 border-b border-slate-100 text-right font-bold">{item.quantity}</td>
                <td className="py-3 px-2 border-b border-slate-100 text-right">{formatMoney(item.unit_price_at_order)}</td>
                <td className="py-3 pl-2 border-b border-slate-100 text-right font-bold">{formatMoney(item.net_amount)}</td>
                <td className="py-3 pl-2 border-b border-slate-100 text-right font-bold">{formatMoney(item.realized_total_cost)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="grid grid-cols-[1.4fr_0.8fr] gap-6 items-start">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
          <div className="text-[10px] font-black uppercase tracking-wide text-slate-400 mb-2">????????? ?????????</div>
          <div>?????? ????????: {fulfillment?.total_ready_qty ?? '-'}</div>
          <div>??????????? ????????: {fulfillment?.total_shipped_qty ?? '-'}</div>
          <div>???????? ???? ????????: {fulfillment?.total_remaining_to_ship_qty ?? '-'}</div>
          <div>???????? ???? ????????: {fulfillment?.total_remaining_to_produce_qty ?? '-'}</div>
          {order.notes && <div className="mt-3 border-t border-slate-200 pt-3"><span className="font-bold">?????????? ???????????:</span> {order.notes}</div>}
          {shipment.notes && <div className="mt-2"><span className="font-bold">?????????? ?????????:</span> {shipment.notes}</div>}
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex justify-between text-sm text-slate-600 mb-2"><span>?????? ????</span><span className="font-bold text-slate-900">{formatMoney(shipment.net_amount)}</span></div>
          <div className="flex justify-between text-sm text-slate-600 mb-2"><span>??? ({(vatRate * 100).toFixed(0)}%)</span><span className="font-bold text-slate-900">{formatMoney(shipment.vat_amount)}</span></div>
          <div className="flex justify-between text-sm text-slate-600 mb-2"><span>???????</span><span className="font-bold text-rose-600">-{formatMoney(shipment.discount_allocated_amount)}</span></div>
          <div className="flex justify-between text-sm text-slate-600 mb-2"><span>???????????????? ??????</span><span className="font-bold text-slate-900">{formatMoney(shipmentItems.reduce((sum, item) => sum + item.realized_total_cost, 0))}</span></div>
          <div className="flex justify-between border-t border-slate-200 pt-3 mt-3 text-base font-black text-slate-900"><span>????? ??????</span><span>{formatMoney(shipment.gross_amount)}</span></div>
        </div>
      </section>
    </div>
  );
}
