import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CornerDownLeft, PenLine } from 'lucide-react';
import { Product } from '../../types';

type SkuPickerOption = {
  sku: string;
  label: string;
  hint?: string;
  manual?: boolean;
  product?: Product;
};

export function searchSkuProductOptions(products: Product[], query: string, allowManual = true, limit = 10): SkuPickerOption[] {
  const term = query.trim().toUpperCase();
  const options: SkuPickerOption[] = [];

  if (allowManual && (!term || 'MANUAL'.startsWith(term) || term.startsWith('MAN'))) {
    options.push({
      sku: 'MANUAL',
      label: 'MANUAL',
      hint: 'Χειροκίνητη γραμμή χωρίς προϊόν ERP',
      manual: true,
    });
  }

  if (!term) {
    return [
      ...options,
      ...products
        .filter((product) => !product.is_component)
        .slice(0, limit)
        .map((product) => ({
          sku: product.sku,
          label: product.sku,
          hint: product.description || product.category || undefined,
          product,
        })),
    ];
  }

  const numericMatch = term.match(/\d+/);
  const numberTerm = numericMatch && numericMatch[0].length >= 3 ? numericMatch[0] : null;

  const matches = products
    .filter((product) => {
      if (product.is_component) return false;
      const sku = product.sku.toUpperCase();
      const description = `${product.description || ''} ${product.category || ''}`.toUpperCase();
      if (sku.startsWith(term)) return true;
      if (sku.includes(term)) return true;
      if (description.includes(term)) return true;
      if (numberTerm && sku.includes(numberTerm)) return true;
      return false;
    })
    .sort((left, right) => {
      const leftSku = left.sku.toUpperCase();
      const rightSku = right.sku.toUpperCase();
      const leftStarts = leftSku.startsWith(term) ? 0 : 1;
      const rightStarts = rightSku.startsWith(term) ? 0 : 1;
      if (leftStarts !== rightStarts) return leftStarts - rightStarts;
      if (leftSku.length !== rightSku.length) return leftSku.length - rightSku.length;
      return leftSku.localeCompare(rightSku);
    })
    .slice(0, limit)
    .map((product) => ({
      sku: product.sku,
      label: product.sku,
      hint: product.description || product.category || undefined,
      product,
    }));

  return [...options, ...matches];
}

function getAutocompleteSku(inputValue: string, options: SkuPickerOption[], products: Product[]): string | null {
  const term = inputValue.trim().toUpperCase();
  if (!term) return null;

  const exact = products.find((product) => product.sku.toUpperCase() === term);
  if (exact) return exact.sku;

  const prefixMatches = products
    .filter((product) => !product.is_component && product.sku.toUpperCase().startsWith(term))
    .sort((left, right) => left.sku.length - right.sku.length);
  if (prefixMatches.length === 1) return prefixMatches[0].sku;

  const highlighted = options.find((option) => option.sku.toUpperCase().startsWith(term));
  if (highlighted && highlighted.sku.length > term.length) return highlighted.sku;

  return prefixMatches[0]?.sku ?? null;
}

interface SkuProductPickerProps {
  value: string;
  products: Product[];
  onSelect: (sku: string) => void;
  className?: string;
  inputClassName?: string;
  placeholder?: string;
  allowManual?: boolean;
}

export default function SkuProductPicker({
  value,
  products,
  onSelect,
  className = '',
  inputClassName = '',
  placeholder = 'Πληκτρολογήστε SKU...',
  allowManual = true,
}: SkuProductPickerProps) {
  const listboxId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [inputValue, setInputValue] = useState(value);
  const [open, setOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});

  useEffect(() => {
    setInputValue(value);
  }, [value]);

  const options = useMemo(
    () => searchSkuProductOptions(products, inputValue, allowManual),
    [allowManual, inputValue, products],
  );

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
      width: Math.max(rect.width, 300),
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
      setInputValue(value);
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [open, value]);

  const commitSku = (sku: string) => {
    const normalized = sku.trim().toUpperCase();
    setInputValue(normalized);
    onSelect(normalized);
    setOpen(false);
  };

  const handleAutocomplete = () => {
    const completion = getAutocompleteSku(inputValue, options, products);
    if (!completion) return false;
    const term = inputValue.trim().toUpperCase();
    if (completion.toUpperCase() === term) {
      commitSku(completion);
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
        commitSku(options[highlightIndex]?.sku || options[0].sku);
      }
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      if (open && options.length > 0) {
        commitSku(options[highlightIndex]?.sku || options[0].sku);
        return;
      }
      commitSku(inputValue);
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
      setInputValue(value);
    }
  };

  const handleBlur = () => {
    window.setTimeout(() => {
      if (!containerRef.current?.contains(document.activeElement)) {
        const term = inputValue.trim().toUpperCase();
        if (!term) {
          setInputValue(value);
          setOpen(false);
          return;
        }
        const exactProduct = products.find((product) => product.sku.toUpperCase() === term);
        if (exactProduct || term === 'MANUAL') {
          commitSku(term);
          return;
        }
        if (term !== value.toUpperCase()) {
          commitSku(term);
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
      className="max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl"
    >
      {options.length === 0 ? (
        <div className="px-3 py-2 text-xs font-medium text-slate-500">
          Δεν βρέθηκε SKU. Enter για χειροκίνητη τιμή.
        </div>
      ) : options.map((option, index) => (
        <button
          key={`${option.sku}-${index}`}
          type="button"
          role="option"
          aria-selected={index === highlightIndex}
          onMouseEnter={() => setHighlightIndex(index)}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => commitSku(option.sku)}
          onContextMenu={(event) => {
            event.preventDefault();
            commitSku(option.sku);
          }}
          className={`flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left transition ${
            index === highlightIndex ? 'bg-emerald-50 text-emerald-900' : 'text-slate-800 hover:bg-slate-50'
          }`}
          title="Κλικ, Enter ή δεξί κλικ για συμπλήρωση γραμμής"
        >
          <div className="mt-0.5 shrink-0 text-slate-400">
            {option.manual ? <PenLine size={14} /> : <CornerDownLeft size={14} />}
          </div>
          <div className="min-w-0">
            <div className="font-mono text-xs font-black">{option.label}</div>
            {option.hint ? <div className="truncate text-[11px] font-medium text-slate-500">{option.hint}</div> : null}
          </div>
        </button>
      ))}
      <div className="border-t border-slate-100 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">
        ↑↓ επιλογή · → ή Tab αυτόσυμπλήρωση · Enter επιβεβαίωση · δεξί κλικ γέμισμα
      </div>
    </div>
  ) : null;

  return (
    <div ref={containerRef} className={`relative ${className}`}>
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
          commitSku(options[highlightIndex]?.sku || options[0].sku);
        }}
        placeholder={placeholder}
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        className={`w-full min-w-[9rem] rounded-lg border border-slate-200 px-2 py-1 font-mono text-xs font-bold outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 ${inputClassName}`}
      />
      {typeof document !== 'undefined' && dropdown ? createPortal(dropdown, document.body) : null}
    </div>
  );
}
