import React from 'react';
import { CheckCircle, Clock, Package, PackageCheck, Truck, XCircle } from 'lucide-react';
import { OrderStatus } from '../../types';

export type OrderStatusLabelVariant = 'default' | 'mobileCompact' | 'seller';
export type OrderStatusStyleVariant = 'default' | 'mobileDashboard' | 'seller' | 'employeeDashboard';

const ORDER_STATUS_LABELS: Record<OrderStatusLabelVariant, Record<OrderStatus, string>> = {
  default: {
    [OrderStatus.Pending]: 'Εκκρεμεί',
    [OrderStatus.InProduction]: 'Σε Παραγωγή',
    [OrderStatus.Ready]: 'Έτοιμο',
    [OrderStatus.PartiallyDelivered]: 'Μερική Παράδοση',
    [OrderStatus.Delivered]: 'Παραδόθηκε',
    [OrderStatus.Cancelled]: 'Ακυρώθηκε'
  },
  mobileCompact: {
    [OrderStatus.Pending]: 'Εκκρεμεί',
    [OrderStatus.InProduction]: 'Παραγωγή',
    [OrderStatus.Ready]: 'Έτοιμο',
    [OrderStatus.PartiallyDelivered]: 'Μερική Παράδοση',
    [OrderStatus.Delivered]: 'Παραδόθηκε',
    [OrderStatus.Cancelled]: 'Ακυρώθηκε'
  },
  seller: {
    [OrderStatus.Pending]: 'Εκκρεμής',
    [OrderStatus.InProduction]: 'Σε Παραγωγή',
    [OrderStatus.Ready]: 'Έτοιμη',
    [OrderStatus.PartiallyDelivered]: 'Μερική Παράδοση',
    [OrderStatus.Delivered]: 'Παραδόθηκε',
    [OrderStatus.Cancelled]: 'Ακυρώθηκε'
  }
};

const ORDER_STATUS_STYLES: Record<OrderStatusStyleVariant, Record<OrderStatus, string>> = {
  default: {
    [OrderStatus.Pending]: 'bg-slate-100 text-slate-600 border-slate-200',
    [OrderStatus.InProduction]: 'bg-blue-50 text-blue-600 border-blue-200',
    [OrderStatus.Ready]: 'bg-emerald-50 text-emerald-600 border-emerald-200',
    [OrderStatus.PartiallyDelivered]: 'bg-amber-50 text-amber-700 border-amber-200',
    [OrderStatus.Delivered]: 'bg-[#060b00] text-white border-[#060b00]',
    [OrderStatus.Cancelled]: 'bg-red-50 text-red-500 border-red-200'
  },
  mobileDashboard: {
    [OrderStatus.Pending]: 'bg-slate-100 text-slate-600 border-slate-200',
    [OrderStatus.InProduction]: 'bg-blue-50 text-blue-700 border-blue-100 ring-1 ring-blue-50',
    [OrderStatus.Ready]: 'bg-emerald-50 text-emerald-700 border-emerald-100 ring-1 ring-emerald-50',
    [OrderStatus.PartiallyDelivered]: 'bg-amber-50 text-amber-700 border-amber-200',
    [OrderStatus.Delivered]: 'bg-slate-100 text-slate-400',
    [OrderStatus.Cancelled]: 'bg-red-50 text-red-400'
  },
  seller: {
    [OrderStatus.Pending]: 'bg-amber-50 text-amber-700 border-amber-200',
    [OrderStatus.InProduction]: 'bg-blue-50 text-blue-700 border-blue-200',
    [OrderStatus.Ready]: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    [OrderStatus.PartiallyDelivered]: 'bg-amber-50 text-amber-700 border-amber-200',
    [OrderStatus.Delivered]: 'bg-slate-800 text-white border-slate-800',
    [OrderStatus.Cancelled]: 'bg-red-50 text-red-500 border-red-200'
  },
  employeeDashboard: {
    [OrderStatus.Pending]: 'bg-amber-100 text-amber-600',
    [OrderStatus.InProduction]: 'bg-amber-100 text-amber-600',
    [OrderStatus.Ready]: 'bg-emerald-100 text-emerald-600',
    [OrderStatus.PartiallyDelivered]: 'bg-amber-100 text-amber-600',
    [OrderStatus.Delivered]: 'bg-slate-200 text-slate-600',
    [OrderStatus.Cancelled]: 'bg-amber-100 text-amber-600'
  }
};

export const getOrderStatusLabel = (status: OrderStatus, variant: OrderStatusLabelVariant = 'default'): string =>
  ORDER_STATUS_LABELS[variant][status] ?? status;

export const getOrderStatusClasses = (status: OrderStatus, variant: OrderStatusStyleVariant = 'default'): string =>
  ORDER_STATUS_STYLES[variant][status] ?? ORDER_STATUS_STYLES.default[status];

export const getOrderStatusIcon = (status: OrderStatus, size = 14): React.ReactNode => {
  switch (status) {
    case OrderStatus.Pending:
      return <Clock size={size} />;
    case OrderStatus.InProduction:
      return <Package size={size} />;
    case OrderStatus.Ready:
      return <CheckCircle size={size} />;
    case OrderStatus.PartiallyDelivered:
      return <PackageCheck size={size} />;
    case OrderStatus.Delivered:
      return <Truck size={size} />;
    case OrderStatus.Cancelled:
      return <XCircle size={size} />;
    default:
      return null;
  }
};
