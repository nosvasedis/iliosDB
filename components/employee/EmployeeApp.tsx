
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

interface Props {
    setPrintItems?: (items: { product: Product; variant?: ProductVariant; quantity: number, format?: 'standard' | 'simple' | 'retail' }[]) => void;
}

export default function EmployeeApp({ setPrintItems }: Props) {
  const isMobile = useIsMobile();
  const [activePage, setActivePage] = useState('dashboard');
  const [pendingDeliveryOrderId, setPendingDeliveryOrderId] = useState<string | null>(null);

  let content: React.ReactNode = null;
  switch (activePage) {
    case 'dashboard':
      content = <EmployeeDashboard onNavigate={setActivePage} />;
      break;
    case 'orders':
      content = <EmployeeOrders onOpenDeliveries={(order: Order) => { setPendingDeliveryOrderId(order.id); setActivePage('deliveries'); }} />;
      break;
    case 'deliveries':
      content = isMobile
        ? <MobileDeliveries pendingOrderId={pendingDeliveryOrderId} onConsumePendingOrderId={() => setPendingDeliveryOrderId(null)} onOpenOrder={() => setActivePage('orders')} />
        : <DeliveriesPage pendingOrderId={pendingDeliveryOrderId} onConsumePendingOrderId={() => setPendingDeliveryOrderId(null)} onOpenOrder={() => setActivePage('orders')} />;
      break;
    case 'production':
      content = <EmployeeProduction />;
      break;
    case 'registry':
      content = <EmployeeRegistry setPrintItems={setPrintItems} />;
      break;
    case 'customers':
      content = <EmployeeCustomers />;
      break;
    case 'collections':
      content = <EmployeeCollections setPrintItems={setPrintItems} />;
      break;
    case 'inventory':
      content = <EmployeeInventory />;
      break;
    default:
      content = <EmployeeDashboard onNavigate={setActivePage} />;
  }

  return (
    <EmployeeLayout activePage={activePage} onNavigate={setActivePage}>
      {content}
    </EmployeeLayout>
  );
}
