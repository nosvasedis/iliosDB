import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CornerDownLeft, ImageIcon } from 'lucide-react';
import { Product } from '../../types';
import SkuColorizedText from '../SkuColorizedText';
import {
  allowsBareMasterSkuResolution,
  formatSkuDisplayValue,
  getBareMasterSkuResolutionError,
  getSkuCatalogProducts,
  getSkuAutocompleteValue,
  resolveTypedSkuColorParts,
  resolveTypedSkuSelection,
  searchSkuProductOptions,
  selectionFromOption,
  SKU_PICKER_DROPDOWN_Z_INDEX,
  SkuCatalogScope,
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
  /** Called only after Enter successfully commits a valid SKU selection. */
  onEnterCommit?: () => void;
  /** Focus this picker's input after it is mounted as the next rapid-entry row. */
  autoFocus?: boolean;
  className?: string;
  inputClassName?: string;
  placeholder?: string;
  /** Inline thumbnail + single-row layout for dense tables */
  compact?: boolean;
  /** Choose finished products, components, or both without duplicating picker behaviour. */
  scope?: SkuCatalogScope;
  /** Reject free text that is not backed by a product in the loaded catalog. */
  catalogOnly?: boolean;
}

export default function SkuProductPicker({
  sku,
  variantSuffix = null,
  products,
  onSelect,
  onEnterCommit,
  autoFocus = false,
  className = '',
  inputClassName = '',
  placeholder = 'Πληκτρολογήστε SKU...',
  compact = false,
  scope = 'products',
  catalogOnly = false,
}: SkuProductPickerProps) {
  const { showToast } = useUI();
  const listboxId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const ignoreBlurUntilRef = useRef(0);
  const displayValue = formatSkuDisplayValue(sku, variantSuffix);
  const [inputValue, setInputValue] = useState(displayValue);
  const [open, setOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});

  useEffect(() => {
    setInputValue(displayValue);
  }, [displayValue]);

  useEffect(() => {
    if (!autoFocus) return undefined;
    const frame = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [autoFocus]);

  const options = useMemo(
    () => searchSkuProductOptions(products, inputValue, 16, { scope }),
    [inputValue, products, scope],
  );

  const liveColorParts = useMemo(
    () => resolveTypedSkuColorParts(inputValue, products, { scope }),
    [inputValue, products, scope],
  );

  const resolvedPreview = useMemo(
    () => resolveTypedSkuSelection(displayValue, products, { scope }),
    [displayValue, products, scope],
  );

  const previewProduct = useMemo(() => {
    if (liveColorParts.product) return liveColorParts.product;
    if (!resolvedPreview?.sku) return null;
    return products.find((product) => product.sku === resolvedPreview.sku) || null;
  }, [liveColorParts.product, products, resolvedPreview]);

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
      width: Math.max(rect.width, 380),
      zIndex: SKU_PICKER_DROPDOWN_Z_INDEX,
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
      if (dropdownRef.current?.contains(target)) return;
      setOpen(false);
      setInputValue(displayValue);
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [displayValue, open]);

  const rejectInvalidMaster = (term: string): boolean => {
    const normalized = term.trim().toUpperCase();
    if (!normalized) return false;
    const catalogProducts = getSkuCatalogProducts(products, { scope });
    const bareMaster = catalogProducts.find((product) => product.sku.toUpperCase() === normalized);
    if (bareMaster && !allowsBareMasterSkuResolution(bareMaster)) {
      showToast(getBareMasterSkuResolutionError(bareMaster), 'warning');
      setInputValue(displayValue);
      setOpen(true);
      return true;
    }
    return false;
  };

  const commitSelection = (selection: SkuProductSelection, advanceAfterCommit = false) => {
    if (catalogOnly && !getSkuCatalogProducts(products, { scope }).some((product) => product.sku === selection.sku)) {
      showToast('Επιλέξτε έγκυρο SKU από τον κατάλογο.', 'warning');
      setInputValue(displayValue);
      setOpen(true);
      return;
    }
    ignoreBlurUntilRef.current = Date.now() + 250;
    setInputValue(selection.displaySku);
    onSelect(selection);
    if (advanceAfterCommit) onEnterCommit?.();
    setOpen(false);
  };

  const handleAutocomplete = () => {
    const completion = getSkuAutocompleteValue(inputValue, options, products, { scope });
    if (!completion) return false;
    const term = inputValue.trim().toUpperCase();
    if (completion.toUpperCase() === term) {
      const resolved = resolveTypedSkuSelection(completion, products, { scope });
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
        commitSelection(selectionFromOption(options[highlightIndex] || options[0]), true);
        return;
      }
      if (rejectInvalidMaster(inputValue)) return;
      const resolved = resolveTypedSkuSelection(inputValue, products, { scope });
      if (resolved) commitSelection(resolved, true);
      return;
    }
    if (event.key === 'Escape') {
      if (open) {
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
        setInputValue(displayValue);
      }
      return;
    }
  };

  const handleBlur = () => {
    window.setTimeout(() => {
      if (Date.now() < ignoreBlurUntilRef.current) return;
      if (!containerRef.current?.contains(document.activeElement)) {
        const term = inputValue.trim().toUpperCase();
        if (!term) {
          setInputValue(displayValue);
          setOpen(false);
          return;
        }
        if (rejectInvalidMaster(term)) return;
        const scopedProducts = getSkuCatalogProducts(products, { scope });
        const resolved = resolveTypedSkuSelection(term, products, { scope });
        if (resolved && (findProductByScannedCode(term, scopedProducts) || term !== displayValue.toUpperCase())) {
          commitSelection(resolved);
          return;
        }
        setOpen(false);
        setInputValue(displayValue);
      }
    }, 120);
  };

  const dropdown = open ? (
    <div
      ref={dropdownRef}
      id={listboxId}
      role="listbox"
      style={dropdownStyle}
      className="max-h-80 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-1.5 shadow-2xl ring-1 ring-slate-900/5"
    >
      {inputValue.trim() ? (
        <div className="mb-1 flex items-center gap-2 rounded-xl bg-slate-50 px-2.5 py-1.5">
          <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Πληκτρολόγηση</span>
          <SkuColorizedText
            sku={liveColorParts.master || inputValue.trim().toUpperCase()}
            suffix={liveColorParts.suffix}
            gender={liveColorParts.gender}
            mono
            className="text-xs font-black"
          />
        </div>
      ) : null}
      {options.length === 0 ? (
        <div className="px-3 py-3 text-xs font-medium text-slate-500">
          Δεν βρέθηκε SKU. Συνεχίστε την πληκτρολόγηση ή σκανάρετε barcode.
        </div>
      ) : options.map((option, index) => (
        <button
          key={option.key}
          type="button"
          role="option"
          aria-selected={index === highlightIndex}
          onMouseEnter={() => setHighlightIndex(index)}
          onMouseDown={(event) => {
            event.preventDefault();
            commitSelection(selectionFromOption(option));
          }}
          onContextMenu={(event) => {
            event.preventDefault();
            commitSelection(selectionFromOption(option));
          }}
          className={`flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left transition ${
            index === highlightIndex ? 'bg-emerald-50 text-emerald-900 ring-1 ring-emerald-100' : 'text-slate-800 hover:bg-slate-50'
          }`}
          title="Κλικ, Enter ή δεξί κλικ για συμπλήρωση γραμμής"
        >
          <div className="h-9 w-9 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
            {option.product?.image_url ? (
              <img src={option.product.image_url} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-slate-300">
                <ImageIcon size={14} />
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-black leading-tight">
              <SkuColorizedText
                sku={option.sku}
                suffix={option.variant_suffix || undefined}
                gender={option.product?.gender}
                mono
              />
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

  const showLiveOverlay = inputValue.trim().length > 0;
  const inlineThumb = compact && previewProduct?.image_url ? (
    <div className="h-8 w-8 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
      <img src={previewProduct.image_url} alt="" className="h-full w-full object-cover" />
    </div>
  ) : compact ? (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-100 text-slate-300">
      <ImageIcon size={12} />
    </div>
  ) : null;

  return (
    <div ref={containerRef} className={`${compact ? 'flex min-w-0 items-center gap-1.5' : 'relative min-w-[10rem]'} ${className}`}>
      {inlineThumb}
      <div className={`relative min-w-0 ${compact ? 'flex-1' : 'w-full'}`}>
        {showLiveOverlay ? (
          <div className="pointer-events-none absolute inset-y-0 left-2 right-2 z-20 flex items-center overflow-hidden" aria-hidden>
            <SkuColorizedText
              sku={liveColorParts.master || inputValue.trim().toUpperCase()}
              suffix={liveColorParts.suffix}
              gender={liveColorParts.gender || previewProduct?.gender}
              mono
              className="text-xs font-bold"
            />
          </div>
        ) : null}
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
          aria-label={placeholder}
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={open ? listboxId : undefined}
          className={`relative z-10 w-full rounded-lg border border-slate-200 bg-white px-2 py-1 font-mono text-xs font-bold uppercase tracking-wide outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 ${
            showLiveOverlay ? 'text-transparent caret-slate-800' : 'text-slate-900'
          } ${inputClassName}`}
        />
      </div>
      {typeof document !== 'undefined' && dropdown ? createPortal(dropdown, document.body) : null}
    </div>
  );
}
