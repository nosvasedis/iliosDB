
import React, { useState } from 'react';
import EmployeeLayout from './EmployeeLayout';
import EmployeeDashboard from './EmployeeDashboard';
import EmployeeOrders from './EmployeeOrders';
import EmployeeRegistry from './EmployeeRegistry';
import CustomersPage from '../CustomersPage';
import EmployeeProduction from './EmployeeProduction';
import { Product, ProductVariant } from '../../types';

interface Props {
    setPrintItems?: (items: { product: Product; variant?: ProductVariant; quantity: number, format?: 'standard' | 'simple' | 'retail' }[]) => void;
}

export default function EmployeeApp({ setPrintItems }: Props) {
  const [activePage, setActivePage] = useState('dashboard');

  let content: React.ReactNode = null;
  switch (activePage) {
    case 'dashboard':
      content = <EmployeeDashboard onNavigate={setActivePage} />;
      break;
    case 'orders':
      content = <EmployeeOrders />;
      break;
    case 'production':
      content = <EmployeeProduction />;
      break;
    case 'registry':
      content = <EmployeeRegistry setPrintItems={setPrintItems} />;
      break;
    case 'customers':
      content = <CustomersPage />;
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
