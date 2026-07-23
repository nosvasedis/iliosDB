import React from 'react';
import type { Product } from '../../types';
import InventoryWorkspace from '../inventory/InventoryWorkspace';

interface Props {
  products: Product[];
  onProductSelect: (product: Product) => void;
}

/** Mobile projection of the canonical inventory workspace. */
export default function MobileInventory({ products, onProductSelect }: Props) {
  return <InventoryWorkspace products={products} compact onProductSelect={onProductSelect} />;
}
