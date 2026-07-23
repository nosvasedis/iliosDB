import React, { useMemo } from 'react';
import type { OrderItem, Product } from '../../types';
import { ProductionType } from '../../types';
import { SYSTEM_IDS } from '../../lib/supabase';
import { useInventoryAvailability, useOrderInventoryReservations } from '../../hooks/api/useInventory';
import { formatInventoryQuantity, inventoryQuantityAgreement } from '../../features/inventory';

interface Props {
  item: Pick<OrderItem, 'sku' | 'variant_suffix' | 'size_info' | 'quantity' | 'line_id' | 'warehouse_id'>;
  product?: Product;
  mode: 'offer' | 'order';
  orderId?: string;
  compact?: boolean;
}

export default function InventoryAvailabilityNote({ item, product, mode, orderId, compact = false }: Props) {
  const availabilityQuery = useInventoryAvailability();
  const reservationsQuery = useOrderInventoryReservations(orderId || '', mode === 'order' && !!orderId);
  const warehouseId = item.warehouse_id || SYSTEM_IDS.CENTRAL;

  const allocation = useMemo(() => {
    const rows = (availabilityQuery.data || []).filter((row) =>
      row.productSku === item.sku
      && row.variantSuffix === (item.variant_suffix || '')
      && row.warehouseId === warehouseId
      && (!item.size_info || row.sizeInfo === item.size_info),
    );
    const currentlyAvailable = rows.reduce((sum, row) => sum + row.available, 0);
    const ownReservation = (reservationsQuery.data || [])
      .filter((reservation) => reservation.state === 'active'
        && reservation.productSku === item.sku
        && reservation.variantSuffix === (item.variant_suffix || '')
        && reservation.warehouseId === warehouseId
        && (!item.line_id || reservation.orderLineId === item.line_id)
        && (!item.size_info || reservation.sizeInfo === item.size_info))
      .reduce((sum, reservation) => sum + reservation.quantity, 0);
    const availableForSave = Math.max(0, currentlyAvailable + ownReservation);
    const reservedFromStock = Math.min(item.quantity, availableForSave);
    return { availableForSave, reservedFromStock, shortage: Math.max(0, item.quantity - reservedFromStock) };
  }, [availabilityQuery.data, reservationsQuery.data, item, warehouseId]);

  if (!product || availabilityQuery.isLoading) {
    return <p className={`${compact ? 'text-[10px]' : 'text-xs'} mt-1 font-semibold text-slate-400`}>Έλεγχος διαθέσιμου αποθέματος…</p>;
  }
  if (availabilityQuery.isError) {
    return <p className={`${compact ? 'text-[10px]' : 'text-xs'} mt-1 font-semibold text-amber-700`}>Η διαθεσιμότητα δεν είναι προσωρινά διαθέσιμη. Θα επανελεγχθεί κατά την αποθήκευση.</p>;
  }

  if (mode === 'offer') {
    return (
      <p className={`${compact ? 'text-[10px]' : 'text-xs'} mt-1 leading-relaxed font-semibold text-slate-500`}>
        Διαθεσιμότητα αυτή τη στιγμή: <strong className="text-slate-800">{formatInventoryQuantity(allocation.availableForSave)}</strong>. Η προσφορά δεν δεσμεύει απόθεμα.
      </p>
    );
  }

  if (allocation.shortage === 0) {
    return (
      <p className={`${compact ? 'text-[10px]' : 'text-xs'} mt-1 font-semibold text-emerald-700`}>
        Θα δημιουργηθεί Δέσμευση Αποθέματος για {formatInventoryQuantity(allocation.reservedFromStock)}.
      </p>
    );
  }

  const shortageDestination = product.production_type === ProductionType.Imported
    ? `και ${formatInventoryQuantity(allocation.shortage)} θα καταχωριστούν ως Ανεκτέλεστη Ζήτηση Προμήθειας`
    : `και ${formatInventoryQuantity(allocation.shortage)} θα δρομολογηθούν στην παραγωγή`;
  return (
    <p className={`${compact ? 'text-[10px]' : 'text-xs'} mt-1 leading-relaxed font-semibold text-amber-700`}>
      {formatInventoryQuantity(allocation.reservedFromStock)} {inventoryQuantityAgreement(allocation.reservedFromStock, 'θα δεσμευτεί', 'θα δεσμευτούν')} από το Διαθέσιμο Απόθεμα {shortageDestination}.
    </p>
  );
}
