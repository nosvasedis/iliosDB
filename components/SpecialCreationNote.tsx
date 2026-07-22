import React from 'react';
import { AlertTriangle, StickyNote } from 'lucide-react';
import {
  cleanSpecialCreationNote,
  getSpecialCreationDisplayNote,
  isSpecialCreationSku,
  MISSING_SPECIAL_CREATION_NOTE,
} from '../utils/specialCreationSku';

interface Props {
  sku?: string | null;
  note?: string | null;
  className?: string;
  compact?: boolean;
}

/** Full, wrapping SP description with an explicit warning for historical missing notes. */
export default function SpecialCreationNote({ sku, note, className = '', compact = false }: Props) {
  if (!isSpecialCreationSku(sku)) return null;
  const cleaned = cleanSpecialCreationNote(note);
  const display = getSpecialCreationDisplayNote(sku, note);
  const missing = display === MISSING_SPECIAL_CREATION_NOTE;
  const Icon = missing ? AlertTriangle : StickyNote;

  return (
    <div
      className={`flex max-w-full items-start gap-1 rounded-lg border whitespace-pre-wrap break-words [overflow-wrap:anywhere] ${
        missing
          ? 'border-rose-200 bg-rose-50 text-rose-800'
          : 'border-violet-200 bg-violet-50 text-violet-800'
      } ${compact ? 'px-1.5 py-0.5 text-[9px]' : 'px-2 py-1 text-[10px]'} font-bold leading-relaxed ${className}`}
      data-sp-note={missing ? 'missing' : 'present'}
    >
      <Icon size={compact ? 10 : 12} className="mt-0.5 shrink-0" />
      <span className="min-w-0 flex-1">{cleaned || MISSING_SPECIAL_CREATION_NOTE}</span>
    </div>
  );
}
