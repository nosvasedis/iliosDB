
import React, { useState } from 'react';
import EmployeeLayout from './EmployeeLayout';
import EmployeeDashboard from './EmployeeDashboard';
import EmployeeOrders from './EmployeeOrders';
import EmployeeRegistry from './EmployeeRegistry';
import EmployeeCustomers from './EmployeeCustomers';
import EmployeeProduction from './EmployeeProduction';
import EmployeeCollections from './EmployeeCollections';
import EmployeeInventory from './EmployeeInventory';
import { Product, ProductVariant, Order } from '../../types';
import DeliveriesPage from '../DeliveriesPage';
import MobileDeliveries from '../mobile/MobileDeliveries';
import { useIsMobile } from '../../hooks/useIsMobile';
import type { EmployeePage } from '../../surfaces/pageIds';

interface Props {
    setPrintItems?: (items: { product: Product; variant?: ProductVariant; quantity: number, format?: 'standard' | 'simple' | 'retail' }[]) => void;
}

export default function EmployeeApp({ setPrintItems }: Props) {
  const isMobile = useIsMobile();
  const [activePage, setActivePage] = useState<EmployeePage>('dashboard');
  const [pendingDeliveryOrderId, setPendingDeliveryOrderId] = useState<string | null>(null);
  const handleNavigate = (page: string) => setActivePage(page as EmployeePage);

  const pageRegistry: Record<EmployeePage, React.ReactNode> = {
    dashboard: <EmployeeDashboard onNavigate={handleNavigate} />,
    orders: <EmployeeOrders onOpenDeliveries={(order: Order) => { setPendingDeliveryOrderId(order.id); setActivePage('deliveries'); }} />,
    deliveries: isMobile
      ? <MobileDeliveries pendingOrderId={pendingDeliveryOrderId} onConsumePendingOrderId={() => setPendingDeliveryOrderId(null)} onOpenOrder={() => setActivePage('orders')} />
      : <DeliveriesPage pendingOrderId={pendingDeliveryOrderId} onConsumePendingOrderId={() => setPendingDeliveryOrderId(null)} onOpenOrder={() => setActivePage('orders')} />,
    production: <EmployeeProduction />,
    registry: <EmployeeRegistry setPrintItems={setPrintItems} />,
    customers: <EmployeeCustomers />,
    collections: <EmployeeCollections setPrintItems={setPrintItems} />,
    inventory: <EmployeeInventory />,
  };

  return (
    <EmployeeLayout activePage={activePage} onNavigate={(page) => setActivePage(page)}>
      {pageRegistry[activePage]}
    </EmployeeLayout>
  );
}
