import React from 'react';
import type { Mold, Product, ProductVariant } from '../types';
import InventoryWorkspace from './inventory/InventoryWorkspace';

interface Props {
  products: Product[];
  /** Retained for the page contract; printing remains owned by the registry workflow. */
  setPrintItems: (items: Array<{ product: Product; variant?: ProductVariant; quantity: number; format?: 'standard' | 'simple' }>) => void;
  settings: unknown;
  collections: unknown[];
  molds: Mold[];
}

/** Canonical desktop inventory surface backed by transactional availability. */
export default function Inventory({ products }: Props) {
  return <InventoryWorkspace products={products} />;
}
