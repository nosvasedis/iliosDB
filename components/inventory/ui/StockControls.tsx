import React, { useId, useMemo, useState } from 'react';
import { Image as ImageIcon, Minus, Plus, ScanBarcode, X } from 'lucide-react';
import type { Product } from '../../../types';
import {
  NO_SIZE_LABEL,
  isValidInventorySizeInfo,
  normalizeInventorySizeInfo,
  parseStockEntryInput,
  type ParsedStockEntry,
} from '../../../features/inventory';
import { searchSkuProductOptions } from '../../../utils/skuProductPicker';
import { useEscapeToClose } from '../../../hooks/useEscapeToClose';
import SkuColorizedText from '../../SkuColorizedText';

/** Bottom sheet on phones, centered dialog on desktop. */
export function InventorySheet({
  title,
  subtitle,
  onClose,
  busy = false,
  width = 'max-w-xl',
  footer,
  children,
  zIndex = 'z-[500]',
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  onClose: () => void;
  busy?: boolean;
  width?: string;
  footer?: React.ReactNode;
  children: React.ReactNode;
  zIndex?: string;
}) {
  const labelId = useId();
  useEscapeToClose(onClose, busy);
  return (
    <div
      className={`fixed inset-0 ${zIndex} flex items-end justify-center bg-slate-950/50 sm:items-center sm:p-4`}
      role="presentation"
      onMouseDown={() => { if (!busy) onClose(); }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelId}
        className={`flex max-h-[92dvh] w-full ${width} flex-col rounded-t-3xl bg-white shadow-2xl sm:rounded-2xl`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div className="min-w-0">
            <h2 id={labelId} className="text-lg font-black text-slate-900">{title}</h2>
            {subtitle && <div className="mt-0.5 text-sm text-slate-500">{subtitle}</div>}
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Κλείσιμο" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-50">
            <X size={18} />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <footer className="flex gap-2 border-t border-slate-100 px-5 py-3">{footer}</footer>}
      </section>
    </div>
  );
}

export function ProductThumb({ product, size = 'md' }: { product?: Product | null; size?: 'sm' | 'md' }) {
  const dimensions = size === 'md' ? 'h-12 w-12' : 'h-9 w-9';
  return (
    <span className={`flex ${dimensions} shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-100 bg-slate-50`}>
      {product?.image_url
        ? <img src={product.image_url} alt="" loading="lazy" className="h-full w-full object-cover" />
        : <ImageIcon size={16} className="text-slate-300" aria-hidden="true" />}
    </span>
  );
}

export function SkuLabel({ product, sku, variantSuffix, className = '' }: { product?: Product | null; sku: string; variantSuffix: string; className?: string }) {
  return (
    <SkuColorizedText
      sku={sku}
      suffix={variantSuffix}
      gender={product?.gender}
      className={className}
      masterClassName="text-slate-900"
    />
  );
}

/**
 * Size picker. «Χωρίς μέγεθος» is always the first chip, so a size is never
 * required. Optional counts show the current quantity per size.
 */
export function SizeChips({
  options,
  value,
  onChange,
  counts,
  allowCustom = true,
  disabled = false,
}: {
  options: string[];
  value: string;
  onChange: (size: string) => void;
  counts?: Record<string, number>;
  allowCustom?: boolean;
  disabled?: boolean;
}) {
  const [customOpen, setCustomOpen] = useState(false);
  const [customText, setCustomText] = useState('');
  const all = useMemo(() => (options.includes(value) ? options : [...options, value]), [options, value]);
  const commitCustom = () => {
    const normalized = normalizeInventorySizeInfo(customText);
    if (!normalized || !isValidInventorySizeInfo(normalized)) return;
    onChange(normalized);
    setCustomText('');
    setCustomOpen(false);
  };
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Μέγεθος">
      {all.map((size) => {
        const active = size === value;
        const count = counts?.[size];
        return (
          <button
            key={size || '__none'}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange(size)}
            className={`rounded-lg border px-2.5 py-1.5 text-xs font-bold transition disabled:opacity-50 ${active
              ? 'border-slate-900 bg-slate-900 text-white'
              : 'border-slate-200 bg-white text-slate-700 hover:border-slate-400'}`}
          >
            {size || NO_SIZE_LABEL}
            {count ? <span className={`ml-1 tabular-nums ${active ? 'text-slate-300' : 'text-slate-400'}`}>{count}</span> : null}
          </button>
        );
      })}
      {allowCustom && !disabled && (customOpen ? (
        <span className="inline-flex items-center gap-1">
          <input
            autoFocus
            value={customText}
            onChange={(event) => setCustomText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') { event.preventDefault(); commitCustom(); }
              if (event.key === 'Escape') { event.stopPropagation(); setCustomOpen(false); }
            }}
            onBlur={commitCustom}
            maxLength={40}
            placeholder="π.χ. 18cm"
            aria-label="Άλλο μέγεθος"
            className="w-24 rounded-lg border border-slate-300 px-2 py-1.5 text-xs font-bold outline-none focus:border-slate-900"
          />
        </span>
      ) : (
        <button type="button" onClick={() => setCustomOpen(true)} className="rounded-lg border border-dashed border-slate-300 px-2.5 py-1.5 text-xs font-bold text-slate-500 hover:border-slate-500 hover:text-slate-800">
          + άλλο
        </button>
      ))}
    </div>
  );
}

export function QtyStepper({
  value,
  onChange,
  min = 0,
  max,
  disabled = false,
  label = 'Ποσότητα',
  size = 'md',
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  disabled?: boolean;
  label?: string;
  size?: 'sm' | 'md';
}) {
  const clamp = (next: number) => Math.max(min, max === undefined ? next : Math.min(max, next));
  const button = size === 'md' ? 'h-9 w-9' : 'h-8 w-8';
  return (
    <div className="inline-flex items-center rounded-xl border border-slate-200 bg-white">
      <button type="button" aria-label="Μείωση" disabled={disabled || value <= min} onClick={() => onChange(clamp(value - 1))} className={`${button} flex items-center justify-center rounded-l-xl text-slate-600 hover:bg-slate-100 disabled:opacity-30`}>
        <Minus size={15} />
      </button>
      <input
        type="text"
        inputMode="numeric"
        aria-label={label}
        disabled={disabled}
        value={String(value)}
        onFocus={(event) => event.currentTarget.select()}
        onChange={(event) => {
          const digits = event.target.value.replace(/[^\d]/g, '');
          onChange(clamp(digits ? Number(digits) : 0));
        }}
        className="w-12 border-x border-slate-200 py-1.5 text-center text-sm font-black tabular-nums outline-none disabled:bg-slate-50"
      />
      <button type="button" aria-label="Αύξηση" disabled={disabled || (max !== undefined && value >= max)} onClick={() => onChange(clamp(value + 1))} className={`${button} flex items-center justify-center rounded-r-xl text-slate-600 hover:bg-slate-100 disabled:opacity-30`}>
        <Plus size={15} />
      </button>
    </div>
  );
}

const PARSE_ERRORS: Record<string, string> = {
  'not-found': 'Δεν βρέθηκε αυτός ο κωδικός.',
  'needs-variant': 'Συμπληρώστε και την παραλλαγή (π.χ. P, X, D).',
  'bad-quantity': 'Η ποσότητα πρέπει να είναι θετικός ακέραιος.',
};

/**
 * One input for SKU, optional size and optional quantity:
 * `RN001P`, `RN001P 62`, `RN001P-62 x3`, `BR020P 2`. Suggestions appear as you type.
 */
export function SkuQuickInput({
  products,
  onResolve,
  onScan,
  autoFocus = false,
  placeholder = 'SKU [μέγεθος] [ποσότητα] — π.χ. RN001P 62 x2',
}: {
  products: Product[];
  onResolve: (entry: ParsedStockEntry) => void;
  onScan?: () => void;
  autoFocus?: boolean;
  placeholder?: string;
}) {
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const firstToken = text.trim().split(/\s+/)[0] || '';
  const suggestions = useMemo(
    () => (firstToken.length >= 2 && !/\s/.test(text.trim())
      ? searchSkuProductOptions(products, firstToken, 8).filter((option) => option.product)
      : []),
    [firstToken, products, text],
  );

  const submit = () => {
    const result = parseStockEntryInput(text, products);
    if ('entry' in result) {
      onResolve(result.entry);
      setText('');
      setError('');
      setOpen(false);
      return;
    }
    if (result.reason !== 'empty') setError(PARSE_ERRORS[result.reason]);
  };

  return (
    <div className="relative">
      <div className="flex gap-2">
        <input
          autoFocus={autoFocus}
          value={text}
          onChange={(event) => { setText(event.target.value); setError(''); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') { event.preventDefault(); submit(); }
          }}
          placeholder={placeholder}
          aria-label="Κωδικός προϊόντος"
          autoComplete="off"
          spellCheck={false}
          className={`min-w-0 flex-1 rounded-xl border px-3 py-2.5 font-mono text-sm font-bold uppercase outline-none placeholder:font-sans placeholder:font-normal placeholder:normal-case ${error ? 'border-rose-300 focus:border-rose-500' : 'border-slate-200 focus:border-slate-900'}`}
        />
        {onScan && (
          <button type="button" onClick={onScan} aria-label="Σάρωση" className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50">
            <ScanBarcode size={18} />
          </button>
        )}
      </div>
      {error && <p className="mt-1 text-xs font-bold text-rose-600" role="alert">{error}</p>}
      {open && suggestions.length > 0 && (
        <ul className="absolute left-0 right-0 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-xl" role="listbox">
          {suggestions.map((option) => (
            <li key={option.key}>
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onResolve({ product: option.product!, variantSuffix: option.variant_suffix || '', sizeInfo: '', quantity: null });
                  setText('');
                  setOpen(false);
                }}
                className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-slate-50"
              >
                <ProductThumb product={option.product} size="sm" />
                <span className="min-w-0 flex-1">
                  <SkuLabel product={option.product} sku={option.sku} variantSuffix={option.variant_suffix || ''} className="text-sm" />
                  {option.hint && <span className="block truncate text-xs text-slate-500">{option.hint}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
