import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CornerDownLeft, ImageIcon, PenLine } from 'lucide-react';
import { Product } from '../../types';
import SkuColorizedText from '../SkuColorizedText';
import {
  allowsBareMasterSkuResolution,
  formatSkuDisplayValue,
  getBareMasterSkuResolutionError,
  getSkuAutocompleteValue,
  resolveTypedSkuSelection,
  searchSkuProductOptions,
  selectionFromOption,
  SkuProductSelection,
} from '../../utils/skuProductPicker';
import { findProductByScannedCode, formatCurrency } from '../../utils/pricingEngine';
import { useUI } from '../UIProvider';

export type { SkuProductSelection } from '../../utils/skuProductPicker';
export { searchSkuProductOptions } from '../../utils/skuProductPicker';

interface SkuProductPickerProps {
  sku: string;
  variantSuffix?: string | null;
  products: Product[];
  onSelect: (selection: SkuProductSelection) => void;
  className?: string;
  inputClassName?: string;
  placeholder?: string;
  allowManual?: boolean;
  /** Inline thumbnail + single-row layout for dense tables */
  compact?: boolean;
}

export default function SkuProductPicker({
  sku,
  variantSuffix = null,
  products,
  onSelect,
  className = '',
  inputClassName = '',
  placeholder = 'Πληκτρολογήστε SKU...',
  allowManual = true,
  compact = false,
}: SkuProductPickerProps) {
  const { showToast } = useUI();
  const listboxId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const displayValue = formatSkuDisplayValue(sku, variantSuffix);
  const [inputValue, setInputValue] = useState(displayValue);
  const [open, setOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});

  useEffect(() => {
    setInputValue(displayValue);
  }, [displayValue]);

  const options = useMemo(
    () => searchSkuProductOptions(products, inputValue, allowManual),
    [allowManual, inputValue, products],
  );

  const resolvedPreview = useMemo(
    () => resolveTypedSkuSelection(displayValue, products),
    [displayValue, products],
  );

  const previewProduct = useMemo(() => {
    if (!resolvedPreview || resolvedPreview.manual) return null;
    return products.find((product) => product.sku === resolvedPreview.sku) || null;
  }, [products, resolvedPreview]);

  useEffect(() => {
    if (!open) return;
    setHighlightIndex((current) => Math.min(current, Math.max(options.length - 1, 0)));
  }, [open, options.length]);

  const updateDropdownPosition = () => {
    const input = inputRef.current;
    if (!input) return;
    const rect = input.getBoundingClientRect();
    setDropdownStyle({
      position: 'fixed',
      top: rect.bottom + 4,
      left: rect.left,
      width: Math.max(rect.width, 340),
      zIndex: 80,
    });
  };

  useEffect(() => {
    if (!open) return undefined;
    updateDropdownPosition();
    const handleReposition = () => updateDropdownPosition();
    window.addEventListener('resize', handleReposition);
    window.addEventListener('scroll', handleReposition, true);
    return () => {
      window.removeEventListener('resize', handleReposition);
      window.removeEventListener('scroll', handleReposition, true);
    };
  }, [open, inputValue]);

  useEffect(() => {
    if (!open) return undefined;
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (containerRef.current?.contains(target)) return;
      setOpen(false);
      setInputValue(displayValue);
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [displayValue, open]);

  const rejectInvalidMaster = (term: string): boolean => {
    const normalized = term.trim().toUpperCase();
    if (!normalized) return false;
    const catalogProducts = products.filter((product) => !product.is_component);
    const bareMaster = catalogProducts.find((product) => product.sku.toUpperCase() === normalized);
    if (bareMaster && !allowsBareMasterSkuResolution(bareMaster)) {
      showToast(getBareMasterSkuResolutionError(bareMaster), 'warning');
      setInputValue(displayValue);
      setOpen(true);
      return true;
    }
    return false;
  };

  const commitSelection = (selection: SkuProductSelection) => {
    setInputValue(selection.displaySku);
    onSelect(selection);
    setOpen(false);
  };

  const handleAutocomplete = () => {
    const completion = getSkuAutocompleteValue(inputValue, options, products);
    if (!completion) return false;
    const term = inputValue.trim().toUpperCase();
    if (completion.toUpperCase() === term) {
      const resolved = resolveTypedSkuSelection(completion, products);
      if (resolved) commitSelection(resolved);
      return true;
    }
    setInputValue(completion);
    setOpen(true);
    return true;
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!open) setOpen(true);
      setHighlightIndex((current) => Math.min(current + 1, Math.max(options.length - 1, 0)));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) setOpen(true);
      setHighlightIndex((current) => Math.max(current - 1, 0));
      return;
    }
    if (event.key === 'ArrowRight') {
      if (open && inputValue.trim()) {
        event.preventDefault();
        handleAutocomplete();
      }
      return;
    }
    if (event.key === 'Tab' && !event.shiftKey) {
      if (open && options.length > 0) {
        event.preventDefault();
        commitSelection(selectionFromOption(options[highlightIndex] || options[0]));
      }
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      if (open && options.length > 0) {
        commitSelection(selectionFromOption(options[highlightIndex] || options[0]));
        return;
      }
      if (rejectInvalidMaster(inputValue)) return;
      const resolved = resolveTypedSkuSelection(inputValue, products);
      if (resolved) commitSelection(resolved);
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
      setInputValue(displayValue);
    }
  };

  const handleBlur = () => {
    window.setTimeout(() => {
      if (!containerRef.current?.contains(document.activeElement)) {
        const term = inputValue.trim().toUpperCase();
        if (!term) {
          setInputValue(displayValue);
          setOpen(false);
          return;
        }
        if (rejectInvalidMaster(term)) return;
        const resolved = resolveTypedSkuSelection(term, products);
        if (resolved && (resolved.manual || findProductByScannedCode(term, products) || term !== displayValue.toUpperCase())) {
          commitSelection(resolved);
          return;
        }
        setOpen(false);
      }
    }, 120);
  };

  const dropdown = open ? (
    <div
      id={listboxId}
      role="listbox"
      style={dropdownStyle}
      className="max-h-72 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl"
    >
      {options.length === 0 ? (
        <div className="px-3 py-2 text-xs font-medium text-slate-500">
          Δεν βρέθηκε SKU. Enter για χειροκίνητη τιμή.
        </div>
      ) : options.map((option, index) => (
        <button
          key={option.key}
          type="button"
          role="option"
          aria-selected={index === highlightIndex}
          onMouseEnter={() => setHighlightIndex(index)}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => commitSelection(selectionFromOption(option))}
          onContextMenu={(event) => {
            event.preventDefault();
            commitSelection(selectionFromOption(option));
          }}
          className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition ${
            index === highlightIndex ? 'bg-emerald-50 text-emerald-900' : 'text-slate-800 hover:bg-slate-50'
          }`}
          title="Κλικ, Enter ή δεξί κλικ για συμπλήρωση γραμμής"
        >
          <div className="h-9 w-9 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
            {option.manual ? (
              <div className="flex h-full w-full items-center justify-center text-slate-400">
                <PenLine size={14} />
              </div>
            ) : option.product?.image_url ? (
              <img src={option.product.image_url} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-slate-300">
                <ImageIcon size={14} />
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-black leading-tight">
              {option.manual ? (
                <span className="font-mono">MANUAL</span>
              ) : (
                <SkuColorizedText
                  sku={option.sku}
                  suffix={option.variant_suffix || undefined}
                  gender={option.product?.gender}
                />
              )}
            </div>
            {option.hint ? <div className="truncate text-[11px] font-medium text-slate-500">{option.hint}</div> : null}
          </div>
          {typeof option.price === 'number' && option.price > 0 ? (
            <div className="shrink-0 text-[11px] font-black text-emerald-700">{formatCurrency(option.price)}</div>
          ) : null}
          <div className="shrink-0 text-slate-400">
            <CornerDownLeft size={14} />
          </div>
        </button>
      ))}
      <div className="border-t border-slate-100 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">
        ↑↓ επιλογή · → ή Tab αυτόσυμπλήρωση · Enter επιβεβαίωση · δεξί κλικ γέμισμα
      </div>
    </div>
  ) : null;

  const inlineThumb = compact && !open && previewProduct?.image_url ? (
    <div className="h-7 w-7 shrink-0 overflow-hidden rounded-md border border-slate-200 bg-slate-100">
      <img src={previewProduct.image_url} alt="" className="h-full w-full object-cover" />
    </div>
  ) : compact && !open ? (
    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-slate-100 text-slate-300">
      <ImageIcon size={12} />
    </div>
  ) : null;

  return (
    <div ref={containerRef} className={`${compact ? 'flex min-w-0 items-center gap-1.5' : 'relative min-w-[10rem]'} ${className}`}>
      {inlineThumb}
      <div className={`relative min-w-0 ${compact ? 'flex-1' : 'w-full'}`}>
        <input
          ref={inputRef}
          value={inputValue}
          onChange={(event) => {
            setInputValue(event.target.value.toUpperCase());
            setOpen(true);
            setHighlightIndex(0);
          }}
          onFocus={() => {
            setOpen(true);
            updateDropdownPosition();
          }}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          onContextMenu={(event) => {
            if (!open || options.length === 0) return;
            event.preventDefault();
            commitSelection(selectionFromOption(options[highlightIndex] || options[0]));
          }}
          placeholder={placeholder}
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={open ? listboxId : undefined}
          className={`w-full rounded-lg border border-slate-200 px-2 py-1 font-mono text-xs font-bold outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 ${
            !open && previewProduct && resolvedPreview && !resolvedPreview.manual ? 'text-transparent caret-slate-800' : ''
          } ${inputClassName}`}
        />
        {!open && previewProduct && resolvedPreview && !resolvedPreview.manual ? (
          <div className="pointer-events-none absolute inset-y-0 left-2 flex items-center">
            <SkuColorizedText
              sku={resolvedPreview.sku}
              suffix={resolvedPreview.variant_suffix || undefined}
              gender={previewProduct.gender}
              className="text-xs"
            />
          </div>
        ) : null}
      </div>
      {typeof document !== 'undefined' && dropdown ? createPortal(dropdown, document.body) : null}
    </div>
  );
}
