
import React, { useState } from 'react';
import EmployeeLayout from './EmployeeLayout';
import EmployeeDashboard from './EmployeeDashboard';
import EmployeeOrders from './EmployeeOrders';
import EmployeeRegistry from './EmployeeRegistry';
import CustomersPage from '../CustomersPage'; // Reuse CustomersPage as it's safe (doesn't show costs)

export default function EmployeeApp() {
  const [activePage, setActivePage] = useState('dashboard');

  let content: React.ReactNode = null;
  switch (activePage) {
    case 'dashboard':
      content = <EmployeeDashboard onNavigate={setActivePage} />;
      break;
    case 'orders':
      content = <EmployeeOrders />;
      break;
    case 'registry':
      content = <EmployeeRegistry />;
      break;
    case 'customers':
      // CustomersPage is generally safe for clerks (contact info, order history)
      // If stricter control is needed, we'd make an EmployeeCustomers.tsx
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
