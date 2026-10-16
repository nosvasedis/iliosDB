import React from 'react';
import RetailBadge, { InternalOrderBadge } from './RetailBadge';
import { getOrderCustomerName, isInternalOrder, isRetailCustomerOrder, OrderCustomerIdentity } from '../../utils/orderCustomer';

export function CustomerNameLabel({ name, retail = false, internal = false }: { name: string; retail?: boolean; internal?: boolean }) {
    return <span className="inline-flex max-w-full min-w-0 items-center gap-1.5 align-middle">
        <span className="min-w-0 truncate" title={name}>{name}</span>
        {retail && <RetailBadge />}
        {internal && <InternalOrderBadge />}
    </span>;
}

export default function OrderCustomerName({ order }: { order: OrderCustomerIdentity }) {
    return <CustomerNameLabel name={getOrderCustomerName(order)} retail={isRetailCustomerOrder(order)} internal={isInternalOrder(order)} />;
}
