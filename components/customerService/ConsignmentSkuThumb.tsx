import { formatNumber } from '../../utils/numberFormat';
import React from 'react';
import { ImageIcon } from 'lucide-react';
import type { Product } from '../../types';

export default function ConsignmentSkuThumb({
  product,
  sku,
  quantity,
  returnedQuantity = 0,
}: {
  product?: Product;
  sku: string;
  quantity?: number;
  returnedQuantity?: number;
}) {
  const fullyReturned = quantity === 0 && returnedQuantity > 0;
  const returnLabel = fullyReturned ? 'Επιστράφηκε' : `Επιστράφηκαν ${formatNumber(returnedQuantity)}`;
  return (
    <div title={returnedQuantity > 0 ? `${sku} · ${returnLabel} · ${formatNumber(quantity ?? 0)} στον πελάτη` : sku}
      className={`relative h-10 w-10 shrink-0 overflow-hidden rounded-lg border ${fullyReturned ? 'border-rose-200 bg-rose-50' : 'border-slate-200 bg-slate-100'}`}>
      {product?.image_url ? (
        <img
          src={product.image_url}
          alt={`Εικόνα ${sku}`}
          loading="lazy"
          decoding="async"
          className={`h-full w-full object-cover ${fullyReturned ? 'opacity-40 grayscale' : ''}`}
        />
      ) : (
        <ImageIcon size={16} className="m-auto text-slate-300" />
      )}
      {quantity != null && (
        <div aria-label={`${formatNumber(quantity)} στον πελάτη${returnedQuantity > 0 ? ` · ${returnLabel}` : ''}`}
          className={`absolute bottom-0 right-0 rounded-tl-lg px-1.5 py-0.5 text-[9px] font-bold leading-none ${fullyReturned ? 'bg-rose-100 text-rose-800' : 'bg-slate-900 text-white'}`}>
          x{formatNumber(quantity)}
        </div>
      )}
      {returnedQuantity > 0 && <span aria-hidden="true" className="absolute left-0 top-0 rounded-br bg-rose-100 px-0.5 text-[9px] font-bold leading-tight text-rose-800">↩{formatNumber(returnedQuantity)}</span>}
    </div>
  );
}
