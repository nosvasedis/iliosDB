import React from 'react';
import { CheckCircle, Clock, XCircle } from 'lucide-react';
import { SupplierOrder } from '../../types';

type SupplierOrderStatus = SupplierOrder['status'];

const SUPPLIER_ORDER_STATUS_CLASSES: Record<SupplierOrderStatus, string> = {
  Pending: 'bg-amber-100 text-amber-800 border border-amber-200/90',
  Received: 'bg-emerald-100 text-emerald-800 border border-emerald-200/90',
  Cancelled: 'bg-red-100 text-red-800 border border-red-200/90'
};

/** Greek UI labels (DB values stay Pending | Received | Cancelled). */
const SUPPLIER_ORDER_STATUS_LABELS: Record<SupplierOrderStatus, string> = {
  Pending: 'Εκκρεμεί',
  Received: 'Παραλήφθηκε',
  Cancelled: 'Ακυρώθηκε'
};

export const getSupplierOrderStatusLabel = (status: SupplierOrderStatus): string =>
  SUPPLIER_ORDER_STATUS_LABELS[status] ?? '—';

export const getSupplierOrderStatusClasses = (status: SupplierOrderStatus): string =>
  SUPPLIER_ORDER_STATUS_CLASSES[status] ?? 'bg-slate-100 text-slate-600';

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
