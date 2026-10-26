import React from 'react';
import type { Product } from '../types';
import InventoryWorkspace from './inventory/InventoryWorkspace';

interface Props {
  products: Product[];
  onOpenConsignments?: () => void;
}

/** Canonical desktop inventory surface backed by transactional availability. */
export default function Inventory({ products, onOpenConsignments }: Props) {
  return <InventoryWorkspace products={products} onOpenConsignments={onOpenConsignments} />;
}
