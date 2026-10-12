import { formatNumber } from '../../utils/numberFormat';
import React, { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ChevronDown, ChevronRight, ImageIcon, Search, X } from 'lucide-react';
import type { Product } from '../../types';
import {
  buildResourceUsageRows, filterResourceUsage, getResourceUsageIndex, placeResourceUsagePopover,
  resourceKey, type ResourceRef, type ResourceUsageEntry,
} from '../../features/resources/resourceUsage';
import SkuColorizedText from '../SkuColorizedText';

interface OpenUsage {
  resource: ResourceRef;
  label: string;
  trigger: HTMLButtonElement;
  scopeKey: string;
}

interface UsageContextValue {
  products?: Product[];
  activeKey: string | null;
  dialogId: string;
  open: (resource: ResourceRef, label: string, trigger: HTMLButtonElement) => void;
}

const UsageContext = createContext<UsageContextValue | null>(null);

// A single observer serves all cards. No catalog work happens for distant cards.
const visibilityCallbacks = new Map<Element, () => void>();
let visibilityObserver: IntersectionObserver | undefined;
function observeNearby(element: Element, onVisible: () => void) {
  if (typeof IntersectionObserver === 'undefined') {
    onVisible();
    return () => {};
  }
  visibilityObserver ??= new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const callback = visibilityCallbacks.get(entry.target);
      visibilityCallbacks.delete(entry.target);
      visibilityObserver?.unobserve(entry.target);
      callback?.();
    }
  }, { rootMargin: '120px' });
  visibilityCallbacks.set(element, onVisible);
  visibilityObserver.observe(element);
  return () => {
    visibilityCallbacks.delete(element);
    visibilityObserver?.unobserve(element);
  };
}

function schedulePreview(callback: () => void) {
  if (typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(callback, { timeout: 500 });
    return () => window.cancelIdleCallback(id);
  }
  const id = window.setTimeout(callback, 0);
  return () => window.clearTimeout(id);
}

function UsageImage({ product, size = 36 }: { product: Product; size?: number }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const url = product.image_url;
  return (
    <span style={{ width: size, height: size }} className="flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-100 bg-slate-50">
      {url && failedUrl !== url ? (
        <img src={url} alt={`Εικόνα ${product.sku}`} width={size} height={size} loading="lazy" decoding="async"
          onError={() => setFailedUrl(url)} className="h-full w-full object-contain" />
      ) : <ImageIcon size={size < 30 ? 12 : 16} className="text-slate-300" />}
    </span>
  );
}

export function ResourceUsageProvider({ products, scopeKey, children }: {
  products?: Product[];
  scopeKey: string;
  children: React.ReactNode;
}) {
  const [active, setActive] = useState<OpenUsage | null>(null);
  const activeRef = useRef(active);
  activeRef.current = active;
  const dialogId = useId();
  const close = useCallback(() => {
    const trigger = activeRef.current?.trigger;
    setActive(null);
    if (trigger?.isConnected) trigger.focus({ preventScroll: true });
  }, []);
  const open = useCallback((resource: ResourceRef, label: string, trigger: HTMLButtonElement) => {
    if (activeRef.current?.scopeKey === scopeKey &&
      resourceKey(activeRef.current.resource) === resourceKey(resource)) {
      close();
    } else {
      setActive({ resource, label, trigger, scopeKey });
    }
  }, [close, scopeKey]);
  useEffect(() => {
    if (activeRef.current && (!products || activeRef.current.scopeKey !== scopeKey)) close();
  }, [scopeKey, products, close]);
  const visibleActive = products && active?.scopeKey === scopeKey ? active : null;
  const context = useMemo(() => ({
    products, open, dialogId, activeKey: visibleActive ? resourceKey(visibleActive.resource) : null,
  }), [products, open, dialogId, visibleActive]);

  return (
    <UsageContext.Provider value={context}>
      {children}
      {visibleActive && products ? (
        <UsagePopover key={resourceKey(visibleActive.resource)} active={visibleActive} products={products} dialogId={dialogId} onClose={close} />
      ) : null}
    </UsageContext.Provider>
  );
}

export const ResourceUsageStrip = React.memo(function ResourceUsageStrip({ kind, id, label }: ResourceRef & { label: string }) {
  const context = useContext(UsageContext);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [nearby, setNearby] = useState(false);
  const [resolved, setResolved] = useState<{ products: Product[]; key: string; entries: ResourceUsageEntry[] } | null>(null);
  const products = context?.products;
  useEffect(() => {
    if (!buttonRef.current || nearby) return undefined;
    return observeNearby(buttonRef.current, () => setNearby(true));
  }, [nearby]);
  useEffect(() => {
    if (!nearby || !products) return undefined;
    return schedulePreview(() => {
      setResolved({ products, key: resourceKey({ kind, id }), entries: getResourceUsageIndex(products).getUsage({ kind, id }) });
    });
  }, [nearby, products, kind, id]);
  const entries = resolved?.products === products && resolved?.key === resourceKey({ kind, id }) ? resolved.entries : undefined;
  const count = entries?.length;
  const first = entries?.[0]?.product;
  const expanded = context?.activeKey === resourceKey({ kind, id });
  return (
    <button ref={buttonRef} type="button" disabled={!count} aria-haspopup="dialog" aria-expanded={expanded}
      aria-controls={expanded ? context?.dialogId : undefined}
      aria-label={count === undefined ? `Φόρτωση χρήσης: ${label}` : `${label}: ${count} SKU`}
      onClick={event => {
        event.stopPropagation();
        context?.open({ kind, id }, label, event.currentTarget);
      }}
      className="flex h-10 w-full min-w-0 items-center gap-2 rounded-b-2xl border-t border-slate-100 bg-white px-3 text-left transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-400 disabled:cursor-default disabled:hover:bg-white">
      {count === undefined ? (
        <span className="truncate text-[11px] text-slate-400">Φόρτωση χρήσης…</span>
      ) : count === 0 ? (
        <span className="truncate text-[11px] text-slate-400">Δεν χρησιμοποιείται</span>
      ) : (
        <>
          <span className="flex shrink-0 -space-x-1.5" aria-hidden="true">
            {entries?.slice(0, 2).map(entry => <UsageImage key={entry.product.sku} product={entry.product} size={24} />)}
          </span>
          <span className="min-w-0 flex-1 truncate text-[11px]">
            {first ? <SkuColorizedText sku={first.sku} suffix="" gender={first.gender} /> : null}
          </span>
          <span className="shrink-0 whitespace-nowrap text-[10px] font-semibold text-slate-500">Σε {formatNumber(count)} SKU</span>
          <ChevronRight size={12} className="shrink-0 text-slate-400" />
        </>
      )}
    </button>
  );
});

function UsagePopover({ active, products, dialogId, onClose }: {
  active: OpenUsage;
  products: Product[];
  dialogId: string;
  onClose: () => void;
}) {
  const popupRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState('');
  const [expandedSku, setExpandedSku] = useState<string | null>(null);
  const entries = useMemo(() => getResourceUsageIndex(products).getUsage(active.resource), [products, active.resource]);
  const filtered = useMemo(() => filterResourceUsage(entries, search), [entries, search]);
  const rows = useMemo(() => buildResourceUsageRows(filtered, expandedSku, search), [filtered, expandedSku, search]);
  const [placement, setPlacement] = useState<ReturnType<typeof placeResourceUsagePopover> | null>(null);
  const titleId = `${dialogId}-title`;
  const variantsId = `${dialogId}-variants`;
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    getItemKey: index => rows[index].key,
    estimateSize: index => rows[index].kind === 'product' ? 60 : 36,
    overscan: 4,
  });

  useEffect(() => {
    let frame = 0;
    const position = () => {
      if (!active.trigger.isConnected) { onClose(); return; }
      const viewport = window.visualViewport;
      const next = placeResourceUsagePopover(active.trigger.getBoundingClientRect(), {
        width: viewport?.width ?? window.innerWidth,
        height: viewport?.height ?? window.innerHeight,
        left: viewport?.offsetLeft,
        top: viewport?.offsetTop,
      });
      setPlacement(next);
    };
    const reposition = (event: Event) => {
      if (event.target instanceof Node && popupRef.current?.contains(event.target)) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(position);
    };
    const outside = (event: Event) => {
      const target = event.target as Node | null;
      if (target && !popupRef.current?.contains(target) && !active.trigger.contains(target)) onClose();
    };
    position();
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, { capture: true, passive: true });
    window.visualViewport?.addEventListener('resize', reposition);
    window.visualViewport?.addEventListener('scroll', reposition);
    document.addEventListener('pointerdown', outside);
    document.addEventListener('focusin', outside);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
      window.visualViewport?.removeEventListener('resize', reposition);
      window.visualViewport?.removeEventListener('scroll', reposition);
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('focusin', outside);
    };
  }, [active.trigger, onClose]);

  useEffect(() => {
    if (placement) searchRef.current?.focus({ preventScroll: true });
    // Initial placement only: scrolling/repositioning must not steal keyboard focus.
  }, [Boolean(placement)]);
  useEffect(() => { virtualizer.scrollToOffset(0); }, [search]);

  const focusRow = (index: number) => {
    virtualizer.scrollToIndex(index, { align: 'auto' });
    requestAnimationFrame(() => {
      popupRef.current?.querySelector<HTMLElement>(`[data-usage-row="${index}"]`)?.focus({ preventScroll: true });
    });
  };
  if (!placement || typeof document === 'undefined') return null;
  return createPortal(
    <div ref={popupRef} id={dialogId} role="dialog" aria-labelledby={titleId}
      style={{ position: 'fixed', ...placement, zIndex: 140 }}
      onClick={event => event.stopPropagation()}
      onKeyDown={event => {
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); }
      }}
      className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
      <div className="flex shrink-0 items-center gap-3 border-b border-slate-100 px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <div id={titleId} className="truncate text-xs font-bold text-slate-800">{active.label}</div>
          <div className="text-[10px] text-slate-400">Χρησιμοποιείται σε {formatNumber(entries.length)} SKU</div>
        </div>
        <button type="button" onClick={onClose} aria-label="Κλείσιμο λίστας SKU" className="rounded-lg p-2 text-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"><X size={16} /></button>
      </div>
      <div className="relative mx-3 my-2 shrink-0">
        <Search size={14} className="pointer-events-none absolute left-2.5 top-2.5 text-slate-400" />
        <input ref={searchRef} value={search} onChange={event => setSearch(event.target.value)} aria-label="Αναζήτηση συνδεδεμένων SKU"
          onKeyDown={event => {
            if (event.key === 'ArrowDown' && rows.length) { event.preventDefault(); focusRow(0); }
          }} placeholder="Αναζήτηση SKU…" className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 pl-8 pr-2 text-xs outline-none focus:border-slate-400" />
      </div>
      <div ref={scrollRef} id={variantsId} className="min-h-0 flex-1 overflow-y-auto overscroll-contain custom-scrollbar"
        onKeyDown={event => {
          const element = (event.target as HTMLElement).closest<HTMLElement>('[data-usage-row]');
          if (!element || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault();
          const index = Number(element.dataset.usageRow);
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? rows.length - 1
            : Math.max(0, Math.min(rows.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)));
          focusRow(next);
        }}>
        {rows.length ? (
          <div style={{ height: virtualizer.getTotalSize(), position: 'relative', width: '100%' }}>
            {virtualizer.getVirtualItems().map(item => {
              const row = rows[item.index];
              const { product, direct, viaSku } = row.entry;
              const expanded = expandedSku === product.sku;
              const variants = product.variants || [];
              const rowStyle: React.CSSProperties = { position: 'absolute', top: 0, left: 0, width: '100%', height: item.size, transform: `translateY(${item.start}px)` };
              return row.kind === 'product' ? (
                <button key={row.key} type="button" data-usage-row={item.index} style={rowStyle}
                  aria-expanded={variants.length ? expanded : undefined} aria-controls={variants.length && expanded ? variantsId : undefined}
                  aria-label={`${product.sku}${!direct ? `, μέσω ${viaSku}` : ''}, ${formatNumber(variants.length)} παραλλαγές`}
                  onClick={() => setExpandedSku(current => current === product.sku ? null : product.sku)}
                  className="flex min-w-0 items-center gap-2.5 border-b border-slate-50 px-3 text-left hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-400">
                  <UsageImage product={product} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs"><SkuColorizedText sku={product.sku} suffix="" gender={product.gender} /></span>
                    <span className="block truncate text-[10px] text-slate-400">{direct ? 'Άμεση χρήση' : `μέσω ${viaSku}`}</span>
                  </span>
                  {variants.length ? <><span className="shrink-0 text-[10px] text-slate-500">{formatNumber(variants.length)} παραλλ.</span><ChevronDown size={13} className={`shrink-0 text-slate-400 ${expanded ? 'rotate-180' : ''}`} /></> : null}
                </button>
              ) : (
                <div key={row.key}
                  tabIndex={-1} data-usage-row={item.index} style={rowStyle}
                  className="flex items-center gap-2 bg-slate-50/80 pl-14 pr-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-400">
                  <span className="min-w-0 flex-1 truncate text-xs"><SkuColorizedText sku={product.sku} suffix={row.variant.suffix} gender={product.gender} /></span>
                </div>
              );
            })}
          </div>
        ) : <p className="px-3 py-8 text-center text-xs text-slate-400">{entries.length ? 'Δεν βρέθηκαν SKU.' : 'Δεν χρησιμοποιείται'}</p>}
      </div>
      <div role="status" aria-live="polite" className="shrink-0 border-t border-slate-100 px-3 py-1.5 text-[10px] text-slate-400">{formatNumber(filtered.length)} βασικά SKU{search ? ` από ${formatNumber(entries.length)}` : ''} · Παραλλαγές με πάτημα</div>
    </div>, document.body,
  );
}
