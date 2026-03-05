import React from 'react';
import { EnrichedDeliveryItem } from '../../../types';
import MobileDeliveryCard from './MobileDeliveryCard';

interface Props {
  items: EnrichedDeliveryItem[];
  onSelect: (item: EnrichedDeliveryItem) => void;
}

export default function MobileDeliveryDayList({ items, onSelect }: Props) {
  return (
    <div className="space-y-3">
      {items.length === 0 && (
        <div className="rounded-3xl border border-slate-100 bg-white shadow-sm p-5 text-sm text-slate-500 font-medium">
          Δεν υπάρχουν προγραμματισμένες παραδόσεις για το τρέχον φίλτρο.
        </div>
      )}
      {items.map((item) => (
        <MobileDeliveryCard key={item.plan.id} item={item} onClick={() => onSelect(item)} />
      ))}
    </div>
  );
}
