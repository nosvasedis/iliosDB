import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, ClipboardPlus, Image as ImageIcon, ScanBarcode, Search, X } from 'lucide-react';
import type { Product } from '../../types';
import type { InventoryAvailability } from '../../features/inventory';
import {
  formatInventoryInteger,
  mergeRecentInventorySelections,
  summarizeInventorySelectionByWarehouse,
  type RecentInventorySelection,
} from '../../features/inventory';
import {
  searchSkuProductOptions,
  type SkuPickerOption,
} from '../../utils/skuProductPicker';
import SkuColorizedText from '../SkuColorizedText';
import { BTN_PRIMARY, BTN_SECONDARY, CARD } from '../ui/designTokens';

interface InventoryQuickSearchProps {
  products: Product[];
  availability: InventoryAvailability[];
  profileId?: string;
  isAdmin: boolean;
  focusedSelection?: { productSku: string; variantSuffix: string; nonce: number } | null;
  onSelect: (option: SkuPickerOption) => void;
  onPost: (option?: SkuPickerOption) => void;
  onScan: () => void;
  onGuide: () => void;
}

function recentStorageKey(profileId?: string): string {
  return `ilios:inventory:recent-skus:${profileId || 'anonymous'}`;
}

function readRecentSelections(profileId?: string): RecentInventorySelection[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(recentStorageKey(profileId)) || '[]');
    return Array.isArray(parsed)
      ? parsed.filter((item) => item && typeof item.productSku === 'string' && typeof item.variantSuffix === 'string').slice(0, 6)
      : [];
  } catch {
    return [];
  }
}

function SearchResult({
  option,
  availability,
  active,
  isAdmin,
  onSelect,
  onPost,
  optionId,
}: {
  option: SkuPickerOption;
  availability: InventoryAvailability[];
  active: boolean;
  isAdmin: boolean;
  onSelect: () => void;
  onPost: () => void;
  optionId: string;
}) {
  const warehouseSummary = summarizeInventorySelectionByWarehouse(
    availability,
    option.sku,
    option.variant_suffix || '',
  );
  return (
    <div
      role="presentation"
      className={`grid gap-3 border-b border-slate-100 p-3 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_minmax(15rem,auto)_auto] sm:items-center ${active ? 'bg-emerald-50/70' : 'bg-white'}`}
    >
      <button id={optionId} type="button" role="option" aria-selected={active} onClick={onSelect} className="flex min-w-0 items-center gap-3 text-left">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-100 bg-slate-50">
          {option.product?.image_url ? (
            <img src={option.product.image_url} alt={`Εικόνα προϊόντος ${option.displaySku}`} className="h-full w-full object-cover" loading="lazy" decoding="async" />
          ) : (
            <ImageIcon size={19} className="text-slate-300" aria-label={`Δεν υπάρχει εικόνα για το προϊόν ${option.displaySku}`} />
          )}
        </span>
        <span className="min-w-0">
          <SkuColorizedText
            sku={option.sku}
            suffix={option.variant_suffix || ''}
            gender={option.product?.gender}
            className="text-base"
            masterClassName="text-slate-900"
          />
          <span className="mt-1 block truncate text-xs text-slate-500">
            {option.hint || option.product?.category || 'Χωρίς περιγραφή παραλλαγής'}
          </span>
        </span>
      </button>

      <div className="min-w-0 text-left">
        {warehouseSummary.length > 0 ? (
          <span className="flex flex-wrap gap-1.5">
            {warehouseSummary.map((warehouse) => (
              <span key={warehouse.warehouseId} className="rounded-lg border border-slate-100 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-600">
                <strong className="text-slate-800">{warehouse.warehouseName}</strong>
                {' · '}Φ {formatInventoryInteger(warehouse.onHand)}
                {' / '}Δεσμ. {formatInventoryInteger(warehouse.reserved)}
                {' / '}Διαθ. {formatInventoryInteger(warehouse.available)}
              </span>
            ))}
          </span>
        ) : (
          <span className="text-xs font-semibold text-slate-400">Δεν υπάρχει ακόμη καταχωρισμένη θέση αποθέματος</span>
        )}
      </div>

      {isAdmin && (
        <button
          type="button"
          onClick={onPost}
          className={`${BTN_SECONDARY} justify-center whitespace-nowrap px-3 py-2 text-xs`}
          aria-label={`Καταχώριση αποθέματος για ${option.displaySku}`}
        >
          <ClipboardPlus size={15} aria-hidden="true" />
          Καταχώριση Αποθέματος
        </button>
      )}
    </div>
  );
}

export default function InventoryQuickSearch({
  products,
  availability,
  profileId,
  isAdmin,
  focusedSelection,
  onSelect,
  onPost,
  onScan,
  onGuide,
}: InventoryQuickSearchProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [recent, setRecent] = useState<RecentInventorySelection[]>(() => readRecentSelections(profileId));
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setRecent(readRecentSelections(profileId));
  }, [profileId]);

  useEffect(() => {
    if (!focusedSelection) return;
    setQuery(`${focusedSelection.productSku}${focusedSelection.variantSuffix}`);
  }, [focusedSelection]);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const recentQuery = useMemo(() => {
    if (query.trim() || recent.length === 0) return [];
    return recent
      .map((item) => searchSkuProductOptions(products, `${item.productSku}${item.variantSuffix}`, 1)[0])
      .filter((option): option is SkuPickerOption => Boolean(option));
  }, [products, query, recent]);
  const options = useMemo(
    () => query.trim() ? searchSkuProductOptions(products, query, 12) : recentQuery,
    [products, query, recentQuery],
  );

  useEffect(() => {
    setActiveIndex(0);
  }, [query, options.length]);

  const rememberAndSelect = (option: SkuPickerOption) => {
    const next = mergeRecentInventorySelections(recent, {
      productSku: option.sku,
      variantSuffix: option.variant_suffix || '',
    });
    setRecent(next);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(recentStorageKey(profileId), JSON.stringify(next));
    }
    setQuery(option.displaySku);
    setOpen(false);
    onSelect(option);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => Math.min(current + 1, Math.max(0, options.length - 1)));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => Math.max(current - 1, 0));
      return;
    }
    if (event.key === 'Enter' && options[activeIndex]) {
      event.preventDefault();
      rememberAndSelect(options[activeIndex]);
    }
  };

  return (
    <section className={`${CARD} relative z-30 mx-4 p-3 sm:mx-0`} aria-label="Άμεση αναζήτηση αποθέματος">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <div ref={containerRef} className="relative min-w-0 flex-1">
          <label className="flex min-h-12 items-center rounded-xl border border-slate-200 bg-white shadow-sm transition focus-within:border-emerald-500 focus-within:ring-4 focus-within:ring-emerald-50">
            <Search size={20} className="ml-4 shrink-0 text-emerald-700" aria-hidden="true" />
            <span className="sr-only">Αναζήτηση SKU ή παραλλαγής</span>
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              onKeyDown={handleKeyDown}
              role="combobox"
              aria-expanded={open}
              aria-controls="inventory-quick-search-results"
              aria-autocomplete="list"
              aria-activedescendant={open && options[activeIndex] ? `inventory-search-option-${activeIndex}` : undefined}
              autoComplete="off"
              spellCheck={false}
              placeholder="Αναζήτηση SKU ή παραλλαγής…"
              className="min-w-0 flex-1 border-0 bg-transparent px-3 py-3 text-base font-bold text-slate-900 outline-none placeholder:font-medium placeholder:text-slate-400"
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  setOpen(true);
                }}
                aria-label="Καθαρισμός άμεσης αναζήτησης"
                className="mr-2 rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X size={17} />
              </button>
            )}
          </label>

          {open && (query.trim() || recent.length > 0) && (
            <div
              id="inventory-quick-search-results"
              role="listbox"
              aria-label={query.trim() ? 'Αποτελέσματα άμεσης αναζήτησης' : 'Πρόσφατα SKU'}
              className="absolute left-0 right-0 top-[calc(100%+0.5rem)] max-h-[32rem] overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl"
            >
              <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white px-3 py-2 text-xs font-black text-slate-500">
                <span>{query.trim() ? 'Αποτελέσματα αναζήτησης' : 'Πρόσφατα SKU'}</span>
                <span>{formatInventoryInteger(options.length)} επιλογές</span>
              </div>
              {options.length > 0 ? options.map((option, index) => (
                <SearchResult
                  key={option.key}
                  option={option}
                  optionId={`inventory-search-option-${index}`}
                  availability={availability}
                  active={index === activeIndex}
                  isAdmin={isAdmin}
                  onSelect={() => rememberAndSelect(option)}
                  onPost={() => {
                    rememberAndSelect(option);
                    onPost(option);
                  }}
                />
              )) : (
                <div className="p-6 text-center">
                  <p className="font-bold text-slate-700">Δεν βρέθηκε SKU ή παραλλαγή.</p>
                  <p className="mt-1 text-sm text-slate-500">Ελέγξτε τον κωδικό ή χρησιμοποιήστε τη σάρωση.</p>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2 sm:flex">
          <button type="button" onClick={onScan} className={`${BTN_SECONDARY} justify-center`} aria-label="Σάρωση κωδικού SKU">
            <ScanBarcode size={17} aria-hidden="true" /> Σάρωση
          </button>
          <button type="button" onClick={onGuide} className={`${BTN_SECONDARY} justify-center`} aria-label="Άνοιγμα οδηγού Αποθήκης και Αποθέματος">
            <BookOpen size={17} aria-hidden="true" /> Οδηγός
          </button>
          {isAdmin && (
            <button type="button" onClick={() => onPost()} className={`${BTN_PRIMARY} col-span-2 justify-center`} aria-label="Νέα καταχώριση αποθέματος">
              <ClipboardPlus size={17} aria-hidden="true" /> Καταχώριση Αποθέματος
            </button>
          )}
        </div>
      </div>
      <p className="mt-2 px-1 text-xs font-semibold text-slate-500">
        Πληκτρολογήστε πλήρες ή μερικό SKU. Το ακριβές πλήρες SKU εμφανίζεται πρώτο και ανοίγει απευθείας τη σωστή παραλλαγή.
      </p>
    </section>
  );
}
