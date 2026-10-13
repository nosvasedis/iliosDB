import React from 'react';
import ConsignmentsPage from './customerService/consignments/ConsignmentsPage';
import RepairsPage from './customerService/repairs/RepairsPage';

export type CustomerServiceMode = 'consignments' | 'repairs';

export default function CustomerServiceWorkspace({ mode }: { mode: CustomerServiceMode }) {
  return mode === 'consignments' ? <ConsignmentsPage /> : <RepairsPage />;
}
