import type { ReactNode } from 'react';
import { Truck, Wrench } from 'lucide-react';
import {
  getLegalDocumentItemKind,
  LEGAL_REPAIR_ITEM_NAME,
  LEGAL_SHIPPING_ITEM_DESCRIPTION,
} from '../../utils/legalItemCodes';

export default function SystemItemThumbnail({
  code,
  children,
}: {
  code?: string | null;
  children: ReactNode;
}) {
  const kind = getLegalDocumentItemKind(code);
  if (kind === 'goods') return children;

  const Icon = kind === 'shipping' ? Truck : Wrench;
  const label = kind === 'shipping' ? LEGAL_SHIPPING_ITEM_DESCRIPTION : LEGAL_REPAIR_ITEM_NAME;

  return (
    <span role="img" aria-label={label} title={label} className="flex h-full w-full items-center justify-center bg-sky-50 text-sky-800">
      <Icon className="h-3/5 w-3/5" aria-hidden="true" />
    </span>
  );
}
