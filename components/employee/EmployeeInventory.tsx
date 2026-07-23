import React from 'react';
import { useProducts } from '../../hooks/api/useProducts';
import InventoryWorkspace from '../inventory/InventoryWorkspace';

/** Employee inventory uses the same balances and permitted operations as admin. */
export default function EmployeeInventory() {
  const { data: products = [] } = useProducts({ staleTime: 60_000 });
  return <InventoryWorkspace products={products} compact />;
}
