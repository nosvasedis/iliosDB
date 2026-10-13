import React from 'react';
import QuickConsignmentForm from './consignments/QuickConsignmentForm';
import QuickRepairForm from './repairs/QuickRepairForm';
import { useServiceController } from './useServiceController';

/**
 * Γρήγορη δημιουργία Παρακαταθήκης / Επισκευής από οπουδήποτε στην εφαρμογή
 * (π.χ. καρτέλα πελάτη). Φορτώνει δεδομένα μόνο όσο είναι ανοιχτή.
 */
export default function CustomerServiceQuickForm({ kind, customerId, onClose }: { kind: 'consignment' | 'repair'; customerId: string; onClose: () => void }) {
  const ctl = useServiceController({ loadOrders: true });
  return kind === 'consignment'
    ? <QuickConsignmentForm ctl={ctl} presetCustomerId={customerId} lockCustomer onClose={onClose} />
    : <QuickRepairForm ctl={ctl} presetCustomerId={customerId} lockCustomer onClose={onClose} />;
}
