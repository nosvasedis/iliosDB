import React from 'react';
import { ImageIcon } from 'lucide-react';
import type { Product } from '../../types';

export default function ConsignmentSkuThumb({
  product,
  sku,
  quantity,
}: {
  product?: Product;
  sku: string;
  quantity?: number;
}) {
  return (
    <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
      {product?.image_url ? (
        <img
          src={product.image_url}
          alt={`Εικόνα ${sku}`}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
        />
      ) : (
        <ImageIcon size={16} className="m-auto text-slate-300" />
      )}
      {quantity != null && (
        <div className="absolute bottom-0 right-0 rounded-tl-lg bg-slate-900 px-1.5 py-0.5 text-[9px] font-bold leading-none text-white">
          x{quantity}
        </div>
      )}
    </div>
  );
}
