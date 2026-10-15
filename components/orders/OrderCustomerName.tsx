import React from 'react';
import RetailBadge from './RetailBadge';
import { getOrderCustomerName, isRetailCustomerOrder, OrderCustomerIdentity } from '../../utils/orderCustomer';

export function CustomerNameLabel({ name, retail = false }: { name: string; retail?: boolean }) {
    return <span className="inline-flex max-w-full min-w-0 items-center gap-1.5 align-middle">
        <span className="min-w-0 truncate" title={name}>{name}</span>
        {retail && <RetailBadge />}
    </span>;
}

export default function OrderCustomerName({ order }: { order: OrderCustomerIdentity }) {
    return <CustomerNameLabel name={getOrderCustomerName(order)} retail={isRetailCustomerOrder(order)} />;
}
