import React from 'react';
import { CheckCircle, Clock, XCircle } from 'lucide-react';
import { SupplierOrder } from '../../types';

type SupplierOrderStatus = SupplierOrder['status'];

const SUPPLIER_ORDER_STATUS_CLASSES: Record<SupplierOrderStatus, string> = {
  Pending: 'bg-amber-100 text-amber-700',
  Received: 'bg-emerald-100 text-emerald-700',
  Cancelled: 'bg-red-100 text-red-700'
};

export const getSupplierOrderStatusClasses = (status: SupplierOrderStatus): string =>
  SUPPLIER_ORDER_STATUS_CLASSES[status];

export const getSupplierOrderStatusIcon = (status: SupplierOrderStatus, size = 16): React.ReactNode => {
  switch (status) {
    case 'Pending':
      return <Clock size={size} />;
    case 'Received':
      return <CheckCircle size={size} />;
    case 'Cancelled':
      return <XCircle size={size} />;
    default:
      return null;
  }
};
