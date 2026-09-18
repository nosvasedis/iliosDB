import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Settings } from 'lucide-react';
import { AadeDocumentType } from '../../types';
import {
  formatAadeIncomeCategoryLabel,
  formatAadeIncomeTypeLabel,
  getAllowedIncomeCategoryOptions,
} from '../../utils/legalDocuments';
import IncomeClassificationTypeSelect from './IncomeClassificationTypeSelect';

interface LineIncomeClassificationGearProps {
  documentType: AadeDocumentType;
  category: string;
  type: string;
  onCategoryChange: (category: string) => void;
  onTypeChange: (type: string) => void;
  disabled?: boolean;
}

export default function LineIncomeClassificationGear({
  documentType,
  category,
  type,
  onCategoryChange,
  onTypeChange,
  disabled = false,
}: LineIncomeClassificationGearProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [style, setStyle] = useState<React.CSSProperties>({});
  const categoryOptions = getAllowedIncomeCategoryOptions(documentType);
  const tooltip = `${formatAadeIncomeCategoryLabel(category)} · ${formatAadeIncomeTypeLabel(type)}`;

  useEffect(() => {
    if (!open) return undefined;
    const updatePosition = () => {
      const button = buttonRef.current;
      if (!button) return;
      const rect = button.getBoundingClientRect();
      const width = 288;
      const left = Math.min(Math.max(8, rect.right - width), window.innerWidth - width - 8);
      setStyle({
        position: 'fixed',
        top: rect.bottom + 6,
        left,
        width,
        zIndex: 80,
      });
    };
    updatePosition();
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (buttonRef.current?.contains(target) || popoverRef.current?.contains(target)) return;
      setOpen(false);
    };
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('mousedown', onPointerDown);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('mousedown', onPointerDown);
    };
  }, [open]);

  if (documentType === '9.3') return null;

  return (
    <div className="relative shrink-0">
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Χαρακτηρισμοί myDATA"
        title={tooltip}
        onClick={() => setOpen((current) => !current)}
        className="rounded p-0.5 text-slate-300/80 transition hover:bg-slate-100 hover:text-slate-500 disabled:opacity-40"
      >
        <Settings size={11} strokeWidth={1.75} />
      </button>
      {open && typeof document !== 'undefined' ? createPortal(
        <div
          ref={popoverRef}
          role="dialog"
          aria-labelledby={titleId}
          style={style}
          className="rounded-xl border border-slate-200 bg-white p-3 shadow-lg ring-1 ring-slate-100"
        >
          <div id={titleId} className="mb-2 text-[10px] font-black uppercase tracking-wide text-slate-400">
            Χαρακτηρισμοί myDATA
          </div>
          <label className="mb-2 block space-y-1">
            <span className="text-[10px] font-bold text-slate-500">Κωδικός κατηγορίας χαρακτ.</span>
            <select
              value={category}
              onChange={(event) => onCategoryChange(event.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px] font-semibold text-slate-800 outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-100"
            >
              {categoryOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-[10px] font-bold text-slate-500">Κωδικός τύπου χαρακτ.</span>
            <IncomeClassificationTypeSelect
              documentType={documentType}
              category={category}
              value={type}
              onChange={onTypeChange}
              showCategoryHint={false}
              selectClassName="border-slate-200 bg-white text-[11px]"
            />
          </label>
        </div>,
        document.body,
      ) : null}
    </div>
  );
}
