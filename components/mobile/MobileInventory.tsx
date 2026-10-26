import React from 'react';
import type { Product } from '../../types';
import InventoryWorkspace from '../inventory/InventoryWorkspace';

interface Props {
  products: Product[];
  onProductSelect: (product: Product) => void;
  onOpenConsignments?: () => void;
}

/** Mobile projection of the canonical inventory workspace. */
export default function MobileInventory({ products, onProductSelect, onOpenConsignments }: Props) {
  return <InventoryWorkspace products={products} compact onProductSelect={onProductSelect} onOpenConsignments={onOpenConsignments} />;
}
