import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { L } from './leafletSetup';
import 'leaflet.markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import {
  AlertTriangle, Check, ExternalLink, Globe, Loader2, Mail, MapPin, Maximize2, Move, Phone, RotateCcw, Search, WifiOff, X,
} from 'lucide-react';
import type { Customer } from '../../types';
import {
  ACTIVITY_META,
  customerInitials,
  formatDaysAgo,
  PRECISION_LABEL,
  type CustomerActivity,
  type CustomerDirectoryEntry,
} from '../../features/customers/customerLocation';
import type { LatLng } from '../../features/customers/greekRegions';
import { formatCurrency } from '../../utils/numberFormat';
import { normalizedIncludes } from '../../utils/greekSearch';
import { ActivityBadge, CustomerAvatar, locationText } from './customerUi';

export interface CustomersMapProps {
  /** Already filtered entries (system customer excluded). */
  entries: CustomerDirectoryEntry[];
  /** Bump `nonce` to fly to a customer (e.g. from a card's "Στον χάρτη"). */
  focusRequest?: { id: string; nonce: number } | null;
  onOpenCustomer: (customer: Customer) => void;
  onSaveLocation: (customerId: string, coords: LatLng | null) => Promise<void>;
  canEditLocation: boolean;
  /** Mobile layout: no side panel, bottom sheet for the selected customer. */
  compact?: boolean;
  className?: string;
}

const GREECE_BOUNDS: L.LatLngBoundsExpression = [[34.8, 19.4], [41.75, 28.3]];
const MAX_BOUNDS: L.LatLngBoundsExpression = [[31.5, 15.5], [44.5, 32.5]];
const ACTIVITY_ORDER: CustomerActivity[] = ['active', 'quiet', 'inactive', 'none'];

const tuple = (c: LatLng): L.LatLngTuple => [c[0], c[1]];

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] as string));

function pinIcon(entry: CustomerDirectoryEntry, state: { selected?: boolean; editing?: boolean } = {}) {
  const classes = ['cm-pin'];
  if (state.selected) classes.push('is-selected');
  if (state.editing) classes.push('is-editing');
  if (entry.location.precision === 'area') classes.push('is-approx');
  if (entry.location.precision === 'exact') classes.push('is-exact');
  return L.divIcon({
    html: `<div class="${classes.join(' ')}" style="--pin:${ACTIVITY_META[entry.activity].color}"><div class="cm-pin-head"><span>${escapeHtml(customerInitials(entry.customer.full_name))}</span></div></div>`,
    className: 'cm-pin-icon',
    iconSize: [36, 46],
    iconAnchor: [18, 40],
    tooltipAnchor: [0, -36],
  });
}

function clusterIcon(cluster: L.MarkerCluster) {
  const children = cluster.getAllChildMarkers();
  const count = children.length;
  const tally: Record<CustomerActivity, number> = { active: 0, quiet: 0, inactive: 0, none: 0 };
  children.forEach(m => { tally[((m.options as { activity?: CustomerActivity }).activity) ?? 'none'] += 1; });
  let acc = 0;
  const stops = ACTIVITY_ORDER.filter(a => tally[a] > 0).map((a) => {
    const from = (acc / count) * 360;
    acc += tally[a];
    const to = (acc / count) * 360;
    return `${ACTIVITY_META[a].color} ${from}deg ${to}deg`;
  }).join(', ');
  const size = count < 10 ? 40 : count < 50 ? 48 : 56;
  return L.divIcon({
    html: `<div class="cm-cluster" style="width:${size}px;height:${size}px;background:conic-gradient(${stops})"><span>${count}</span></div>`,
    className: 'cm-cluster-icon',
    iconSize: L.point(size, size),
  });
}

const MAP_CSS = `
.cm-root .leaflet-container{font-family:inherit;background:#dfe9ef}
.cm-pin-icon,.cm-cluster-icon{background:transparent!important;border:0!important}
.cm-pin{position:relative;width:36px;height:46px;transform-origin:50% 40px;transition:transform .16s ease}
.cm-pin:hover{transform:scale(1.1)}
.cm-pin::before{content:'';position:absolute;left:50%;top:37px;width:14px;height:5px;margin-left:-7px;border-radius:50%;background:rgba(15,23,42,.28);filter:blur(1.5px)}
.cm-pin-head{position:absolute;left:4px;top:1px;width:28px;height:28px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:var(--pin);border:2px solid #fff;box-shadow:0 4px 12px rgba(15,23,42,.3);display:flex;align-items:center;justify-content:center}
.cm-pin-head span{transform:rotate(45deg);color:#fff;font-weight:800;font-size:10px;letter-spacing:.02em;line-height:1}
.cm-pin.is-approx .cm-pin-head{border-style:dashed;opacity:.88}
.cm-pin.is-approx::after{content:'';position:absolute;left:50%;top:35px;width:26px;height:10px;margin-left:-13px;border-radius:50%;border:1.5px dashed var(--pin);opacity:.75}
.cm-pin.is-exact .cm-pin-head{box-shadow:0 0 0 3px rgba(255,255,255,.65),0 4px 12px rgba(15,23,42,.3)}
.cm-pin.is-selected{transform:scale(1.28)}
.cm-pin.is-selected .cm-pin-head{box-shadow:0 0 0 4px rgba(6,11,0,.2),0 6px 16px rgba(15,23,42,.35)}
.cm-pin.is-editing .cm-pin-head{background:#060b00;animation:cm-bounce 1.2s ease-in-out infinite}
@keyframes cm-bounce{0%,100%{margin-top:0}50%{margin-top:-5px}}
.cm-cluster{border-radius:9999px;padding:4px;display:flex;box-shadow:0 6px 18px rgba(15,23,42,.28);transition:transform .15s ease}
.cm-cluster:hover{transform:scale(1.08)}
.cm-cluster span{flex:1;display:flex;align-items:center;justify-content:center;border-radius:9999px;background:#060b00;color:#fff;font-weight:800;font-size:12px;border:2px solid #fff}
.cm-root .leaflet-tooltip.cm-tooltip{font-weight:700;font-size:11px;border:0;border-radius:8px;padding:4px 8px;box-shadow:0 4px 14px rgba(15,23,42,.18);color:#0f172a}
.cm-root .leaflet-control-zoom{border:0!important;box-shadow:0 4px 14px rgba(15,23,42,.16);border-radius:12px;overflow:hidden}
.cm-root .leaflet-control-zoom a{width:34px;height:34px;line-height:34px;color:#0f172a;font-weight:700}
.cm-root .leaflet-control-attribution{font-size:9px;background:rgba(255,255,255,.75);border-top-left-radius:8px}
.cm-root.cm-placing .leaflet-container{cursor:crosshair}
`;

export default function CustomersMap({
  entries, focusRequest, onOpenCustomer, onSaveLocation, canEditLocation, compact = false, className = '',
}: CustomersMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const clusterRef = useRef<L.MarkerClusterGroup | null>(null);
  const markersRef = useRef(new Map<string, L.Marker>());
  const mapClickRef = useRef<((latlng: L.LatLng) => void) | null>(null);
  const tilesLoadedRef = useRef(false);
  const fitKeyRef = useRef<string | null>(null);
  const handledFocusRef = useRef<number | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; coords: LatLng } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tilesOffline, setTilesOffline] = useState(false);
  const [listQuery, setListQuery] = useState('');

  const entryById = useMemo(() => new Map(entries.map(e => [e.customer.id, e])), [entries]);
  const located = useMemo(() => entries.filter(e => e.location.coords), [entries]);
  const unlocated = useMemo(() => entries.filter(e => !e.location.coords), [entries]);
  const selectedEntry = selectedId ? entryById.get(selectedId) ?? null : null;
  const editingId = editing?.id ?? null;

  const selectedIdRef = useRef(selectedId);
  selectedIdRef.current = selectedId;

  // --- Map lifecycle -------------------------------------------------------
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const map = L.map(el, {
      zoomControl: false,
      minZoom: 5,
      maxZoom: 18,
      maxBounds: MAX_BOUNDS,
      maxBoundsViscosity: 0.8,
    });
    map.fitBounds(GREECE_BOUNDS, { animate: false });
    map.attributionControl.setPrefix(false);
    L.control.zoom({ position: 'bottomright', zoomInTitle: 'Μεγέθυνση', zoomOutTitle: 'Σμίκρυνση' }).addTo(map);

    let failures = 0;
    const tiles = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      subdomains: 'abcd',
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions" target="_blank" rel="noreferrer">CARTO</a>',
    });
    tiles.on('tileload', () => {
      if (!tilesLoadedRef.current) { tilesLoadedRef.current = true; setTilesOffline(false); }
    });
    tiles.on('tileerror', () => {
      failures += 1;
      if (!tilesLoadedRef.current && failures >= 4) setTilesOffline(true);
    });
    tiles.addTo(map);

    const cluster = L.markerClusterGroup({
      showCoverageOnHover: false,
      spiderfyOnMaxZoom: true,
      maxClusterRadius: 46,
      spiderLegPolylineOptions: { weight: 1.5, color: '#334155', opacity: 0.5 },
      iconCreateFunction: clusterIcon,
    });
    map.addLayer(cluster);
    map.on('click', (e: L.LeafletMouseEvent) => mapClickRef.current?.(e.latlng));

    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(el);
    mapRef.current = map;
    clusterRef.current = cluster;
    const markers = markersRef.current;
    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
      clusterRef.current = null;
      markers.clear();
      fitKeyRef.current = null;
    };
  }, []);

  // --- Markers -------------------------------------------------------------
  useEffect(() => {
    const cluster = clusterRef.current;
    if (!cluster) return;
    cluster.clearLayers();
    markersRef.current.clear();
    const markers = located
      .filter(e => e.customer.id !== editingId)
      .map((entry) => {
        const marker = L.marker(tuple(entry.location.coords as LatLng), {
          icon: pinIcon(entry, { selected: entry.customer.id === selectedIdRef.current }),
          title: entry.customer.full_name,
          riseOnHover: true,
          keyboard: true,
          activity: entry.activity,
        } as L.MarkerOptions);
        marker.bindTooltip(escapeHtml(entry.customer.full_name), { direction: 'top', className: 'cm-tooltip' });
        marker.on('click', () => { setError(null); setSelectedId(entry.customer.id); });
        markersRef.current.set(entry.customer.id, marker);
        return marker;
      });
    cluster.addLayers(markers);
  }, [located, editingId]);

  // Highlight the selected pin.
  const prevSelectedRef = useRef<string | null>(null);
  useEffect(() => {
    const prev = prevSelectedRef.current;
    if (prev && prev !== selectedId) {
      const entry = entryById.get(prev);
      const marker = markersRef.current.get(prev);
      if (entry && marker) marker.setIcon(pinIcon(entry));
    }
    if (selectedId) {
      const entry = entryById.get(selectedId);
      const marker = markersRef.current.get(selectedId);
      if (entry && marker) {
        marker.setIcon(pinIcon(entry, { selected: true }));
        marker.setZIndexOffset(1000);
      }
    }
    prevSelectedRef.current = selectedId;
  }, [selectedId, entryById]);

  // --- Viewport ------------------------------------------------------------
  const fitToEntries = useCallback((animate = true) => {
    const map = mapRef.current;
    if (!map) return;
    const coords = located.map(e => tuple(e.location.coords as LatLng));
    if (coords.length === 0) map.fitBounds(GREECE_BOUNDS, { animate });
    else if (coords.length === 1) map.setView(coords[0], 11, { animate });
    else map.fitBounds(L.latLngBounds(coords), { padding: [56, 56], maxZoom: 11, animate });
  }, [located]);

  const showGreece = useCallback(() => {
    mapRef.current?.fitBounds(GREECE_BOUNDS);
  }, []);

  // Refit whenever the filtered set changes (not on mere data refreshes).
  useEffect(() => {
    if (editingId) return;
    const key = located.map(e => e.customer.id).sort().join('|');
    if (fitKeyRef.current === key) return;
    const first = fitKeyRef.current === null;
    fitKeyRef.current = key;
    const focusPending = focusRequest && handledFocusRef.current !== focusRequest.nonce && entryById.has(focusRequest.id);
    if (focusPending) return; // the focus effect frames the map instead
    fitToEntries(!first);
  }, [located, editingId, fitToEntries, focusRequest, entryById]);

  const focusCustomer = useCallback((id: string) => {
    setError(null);
    setSelectedId(id);
    const marker = markersRef.current.get(id);
    const cluster = clusterRef.current;
    const map = mapRef.current;
    if (!marker || !cluster || !map) return;
    cluster.zoomToShowLayer(marker, () => {
      if (map.getZoom() < 12) map.setView(marker.getLatLng(), 12);
    });
  }, []);

  useEffect(() => {
    if (!focusRequest || handledFocusRef.current === focusRequest.nonce) return;
    if (!entryById.has(focusRequest.id)) return;
    handledFocusRef.current = focusRequest.nonce;
    focusCustomer(focusRequest.id);
  }, [focusRequest, entryById, focusCustomer]);

  // Drop the selection when the customer is filtered out.
  useEffect(() => {
    if (selectedId && !entryById.has(selectedId)) setSelectedId(null);
  }, [selectedId, entryById]);

  // --- Manual placement ----------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !editingId || !editing) return;
    const entry = entryById.get(editingId);
    if (!entry) return;
    const marker = L.marker(tuple(editing.coords), {
      draggable: true,
      autoPan: true,
      zIndexOffset: 2000,
      icon: pinIcon(entry, { editing: true, selected: true }),
    }).addTo(map);
    marker.on('dragend', () => {
      const p = marker.getLatLng();
      setEditing(prev => (prev ? { ...prev, coords: [p.lat, p.lng] } : prev));
    });
    mapClickRef.current = (latlng) => {
      marker.setLatLng(latlng);
      setEditing(prev => (prev ? { ...prev, coords: [latlng.lat, latlng.lng] } : prev));
    };
    if (!map.getBounds().contains(marker.getLatLng()) || map.getZoom() < 12) {
      map.setView(marker.getLatLng(), Math.max(map.getZoom(), 13));
    }
    return () => {
      mapClickRef.current = null;
      marker.remove();
    };
    // The editing marker is created once per edit session; coords updates come from it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingId]);

  const startEditing = (entry: CustomerDirectoryEntry) => {
    const map = mapRef.current;
    const center = map?.getCenter();
    const coords: LatLng = entry.location.coords ?? (center ? [center.lat, center.lng] : [38.3, 23.7]);
    setError(null);
    setSelectedId(entry.customer.id);
    setEditing({ id: entry.customer.id, coords });
  };

  const saveEditing = async () => {
    if (!editing) return;
    const [lat, lng] = editing.coords;
    if (lat < 34 || lat > 42 || lng < 19 || lng > 30) {
      setError('Η πινέζα πρέπει να βρίσκεται εντός Ελλάδας.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSaveLocation(editing.id, [Number(lat.toFixed(6)), Number(lng.toFixed(6))]);
      setEditing(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Η αποθήκευση της θέσης απέτυχε.');
    } finally {
      setSaving(false);
    }
  };

  const resetToAutomatic = async (entry: CustomerDirectoryEntry) => {
    setSaving(true);
    setError(null);
    try {
      await onSaveLocation(entry.customer.id, null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Η επαναφορά απέτυχε.');
    } finally {
      setSaving(false);
    }
  };

  const listEntries = useMemo(() => {
    const filtered = listQuery
      ? located.filter(e => normalizedIncludes(`${e.customer.full_name} ${locationText(e.location) ?? ''}`, listQuery))
      : located;
    return [...filtered].sort((a, b) => a.customer.full_name.localeCompare(b.customer.full_name, 'el', { sensitivity: 'base' }));
  }, [located, listQuery]);

  const card = selectedEntry ? (
    <SelectedCustomerCard
      entry={selectedEntry}
      compact={compact}
      editing={editing?.id === selectedEntry.customer.id ? editing.coords : null}
      saving={saving}
      error={error}
      canEditLocation={canEditLocation}
      onClose={() => { setSelectedId(null); setEditing(null); setError(null); }}
      onOpen={() => onOpenCustomer(selectedEntry.customer)}
      onStartEditing={() => startEditing(selectedEntry)}
      onCancelEditing={() => { setEditing(null); setError(null); }}
      onSave={saveEditing}
      onReset={() => resetToAutomatic(selectedEntry)}
    />
  ) : null;

  return (
    <div className={`cm-root flex min-h-0 gap-4 ${editing ? 'cm-placing' : ''} ${className}`}>
      <style>{MAP_CSS}</style>

      <div className={`relative min-h-0 flex-1 overflow-hidden bg-slate-100 ${compact ? 'rounded-2xl' : 'rounded-3xl border border-slate-200 shadow-sm'}`}>
        <div ref={containerRef} className="absolute inset-0 z-0" role="application" aria-label="Χάρτης πελατών" />

        {/* Top-right controls */}
        <div className="pointer-events-none absolute right-3 top-3 z-[500] flex flex-col items-end gap-2">
          <div className="pointer-events-auto flex overflow-hidden rounded-xl bg-white/95 shadow-lg ring-1 ring-slate-200 backdrop-blur">
            <button type="button" onClick={() => fitToEntries()} className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50" title="Προσαρμογή στους πελάτες που εμφανίζονται">
              <Maximize2 size={14} /> {compact ? null : 'Προσαρμογή'}
            </button>
            <span className="w-px bg-slate-200" />
            <button type="button" onClick={showGreece} className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50" title="Όλη η Ελλάδα">
              <Globe size={14} /> {compact ? null : 'Όλη η Ελλάδα'}
            </button>
          </div>
          <div className="pointer-events-auto rounded-full bg-[#060b00]/90 px-3 py-1 text-[11px] font-bold text-white shadow-lg">
            {located.length} στον χάρτη{unlocated.length ? ` · ${unlocated.length} χωρίς θέση` : ''}
          </div>
        </div>

        {/* Legend */}
        <div className={`pointer-events-none absolute z-[500] ${compact ? 'left-3 top-3' : 'bottom-3 left-3'}`}>
          <div className="pointer-events-auto rounded-2xl bg-white/95 px-3 py-2 shadow-lg ring-1 ring-slate-200 backdrop-blur">
            <div className={`flex ${compact ? 'flex-col gap-1' : 'items-center gap-3'}`}>
              {ACTIVITY_ORDER.map(a => (
                <span key={a} className="flex items-center gap-1.5 text-[10px] font-bold text-slate-600" title={ACTIVITY_META[a].hint}>
                  <span className="h-2.5 w-2.5 rounded-full ring-2 ring-white" style={{ background: ACTIVITY_META[a].color }} />
                  {ACTIVITY_META[a].label}
                </span>
              ))}
            </div>
            {!compact && (
              <div className="mt-1.5 flex items-center gap-1.5 border-t border-slate-100 pt-1.5 text-[10px] font-medium text-slate-400">
                <span className="inline-block h-2.5 w-4 rounded-full border border-dashed border-slate-400" />
                Διακεκομμένο: θέση κατά προσέγγιση από τον ΤΚ
              </div>
            )}
          </div>
        </div>

        {editing && (
          <div className="pointer-events-none absolute left-1/2 top-3 z-[600] -translate-x-1/2">
            <div className="flex items-center gap-2 rounded-full bg-[#060b00] px-4 py-2 text-xs font-bold text-white shadow-xl">
              <Move size={14} /> Σύρετε την πινέζα ή κάντε κλικ στον χάρτη
            </div>
          </div>
        )}

        {tilesOffline && (
          <div className="absolute inset-x-3 top-16 z-[550] mx-auto flex max-w-md items-start gap-2 rounded-2xl bg-amber-50 p-3 text-xs font-semibold text-amber-800 shadow-lg ring-1 ring-amber-200">
            <WifiOff size={16} className="mt-0.5 shrink-0" />
            Το υπόβαθρο του χάρτη δεν φορτώνει (χωρίς σύνδεση;). Οι πινέζες εμφανίζονται κανονικά.
          </div>
        )}

        {located.length === 0 && !editing && (
          <div className="pointer-events-none absolute inset-0 z-[450] flex items-center justify-center">
            <div className="rounded-2xl bg-white/95 px-5 py-4 text-center shadow-xl ring-1 ring-slate-200">
              <MapPin className="mx-auto mb-1 text-slate-300" size={26} />
              <div className="text-sm font-bold text-slate-700">Κανένας πελάτης στον χάρτη</div>
              <div className="text-xs text-slate-400">Αλλάξτε τα φίλτρα ή συμπληρώστε διευθύνσεις.</div>
            </div>
          </div>
        )}

        {card && (
          <div className={compact
            ? 'absolute inset-x-2 bottom-2 z-[700]'
            : 'absolute left-3 top-3 z-[700] w-[340px] max-w-[calc(100%-1.5rem)]'}
          >
            {card}
          </div>
        )}
      </div>

      {!compact && (
        <aside className="hidden w-[300px] shrink-0 flex-col overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm xl:flex">
          <div className="border-b border-slate-100 p-4">
            <div className="text-sm font-black text-slate-800">Πελάτες στον χάρτη</div>
            <div className="text-[11px] font-medium text-slate-400">Πατήστε για εστίαση στην πινέζα.</div>
            <div className="relative mt-3">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={listQuery}
                onChange={e => setListQuery(e.target.value)}
                placeholder="Γρήγορη εύρεση…"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-8 pr-3 text-xs font-semibold outline-none focus:border-slate-400 focus:bg-white"
              />
            </div>
          </div>
          <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-2">
            {listEntries.map(entry => (
              <button
                key={entry.customer.id}
                type="button"
                onClick={() => focusCustomer(entry.customer.id)}
                className={`flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left transition ${selectedId === entry.customer.id ? 'bg-slate-900 text-white' : 'hover:bg-slate-50'}`}
              >
                <CustomerAvatar name={entry.customer.full_name} seed={entry.customer.id} size={30} className="rounded-xl ring-0" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-bold">{entry.customer.full_name}</span>
                  <span className={`block truncate text-[10px] ${selectedId === entry.customer.id ? 'text-slate-300' : 'text-slate-400'}`}>{locationText(entry.location) ?? '—'}</span>
                </span>
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: ACTIVITY_META[entry.activity].color }} />
              </button>
            ))}
            {listEntries.length === 0 && <div className="p-4 text-center text-xs italic text-slate-400">Κανένα αποτέλεσμα.</div>}

            {unlocated.length > 0 && (
              <div className="mt-3 border-t border-slate-100 pt-3">
                <div className="flex items-center gap-1.5 px-2 pb-1 text-[10px] font-black uppercase tracking-wide text-amber-600">
                  <AlertTriangle size={12} /> Χωρίς τοποθεσία ({unlocated.length})
                </div>
                {unlocated.map(entry => (
                  <div key={entry.customer.id} className="flex items-center gap-2 rounded-xl px-2 py-1.5">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-bold text-slate-700">{entry.customer.full_name}</span>
                      <span className="block truncate text-[10px] text-slate-400">{entry.customer.address || 'Χωρίς διεύθυνση'}</span>
                    </span>
                    {canEditLocation && (
                      <button
                        type="button"
                        onClick={() => startEditing(entry)}
                        className="shrink-0 rounded-lg bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-700 hover:bg-slate-200"
                      >
                        Τοποθέτηση
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>
      )}
    </div>
  );
}

interface SelectedCardProps {
  entry: CustomerDirectoryEntry;
  compact: boolean;
  editing: LatLng | null;
  saving: boolean;
  error: string | null;
  canEditLocation: boolean;
  onClose: () => void;
  onOpen: () => void;
  onStartEditing: () => void;
  onCancelEditing: () => void;
  onSave: () => void;
  onReset: () => void;
}

function SelectedCustomerCard({
  entry, compact, editing, saving, error, canEditLocation, onClose, onOpen, onStartEditing, onCancelEditing, onSave, onReset,
}: SelectedCardProps) {
  const { customer, location } = entry;
  const where = locationText(location);
  return (
    <div className="overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-slate-200">
      <div className="flex items-start gap-3 p-4 pb-3">
        <CustomerAvatar name={customer.full_name} seed={customer.id} size={44} />
        <div className="min-w-0 flex-1">
          <div className="line-clamp-2 text-sm font-black leading-tight text-slate-900">{customer.full_name}</div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {customer.customer_code && <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-bold text-slate-500">#{customer.customer_code}</span>}
            <ActivityBadge activity={entry.activity} />
          </div>
        </div>
        <button type="button" onClick={onClose} className="rounded-full p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700" aria-label="Κλείσιμο">
          <X size={16} />
        </button>
      </div>

      <div className="space-y-1.5 px-4 text-xs text-slate-600">
        <div className="flex items-start gap-2">
          <MapPin size={13} className="mt-0.5 shrink-0 text-sky-500" />
          <span className="min-w-0">
            <span className="font-bold text-slate-800">{where ?? 'Χωρίς περιοχή'}</span>
            {location.periferiaLabel && <span className="text-slate-400"> · {location.periferiaLabel}</span>}
            <span className="block text-[10px] text-slate-400">{PRECISION_LABEL[location.precision]}{location.postalCode ? ` · ΤΚ ${location.postalCode}` : ''}</span>
          </span>
        </div>
        {customer.phone && (
          <a href={`tel:${customer.phone}`} className="flex items-center gap-2 font-semibold text-slate-700 hover:text-sky-700">
            <Phone size={13} className="text-slate-400" /> {customer.phone}
          </a>
        )}
        {customer.email && !compact && (
          <a href={`mailto:${customer.email}`} className="flex items-center gap-2 truncate font-semibold text-slate-700 hover:text-sky-700">
            <Mail size={13} className="text-slate-400" /> <span className="truncate">{customer.email}</span>
          </a>
        )}
      </div>

      <div className="mx-4 mt-3 grid grid-cols-3 divide-x divide-slate-100 rounded-2xl bg-slate-50 py-2 text-center">
        <div><div className="text-sm font-black text-slate-800">{entry.orderCount}</div><div className="text-[9px] font-bold uppercase text-slate-400">Παραγγ.</div></div>
        <div><div className="truncate px-1 text-sm font-black text-slate-800">{formatCurrency(entry.revenue)}</div><div className="text-[9px] font-bold uppercase text-slate-400">Τζίρος</div></div>
        <div><div className="text-sm font-black text-slate-800">{formatDaysAgo(entry.daysSinceLastOrder)}</div><div className="text-[9px] font-bold uppercase text-slate-400">Τελευταία</div></div>
      </div>

      {error && (
        <div className="mx-4 mt-3 flex items-start gap-2 rounded-xl bg-rose-50 p-2 text-[11px] font-semibold text-rose-700">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" /> {error}
        </div>
      )}

      <div className="flex flex-wrap gap-2 p-4">
        {editing ? (
          <>
            <button type="button" onClick={onSave} disabled={saving} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#060b00] px-3 py-2.5 text-xs font-bold text-white shadow transition hover:bg-black disabled:opacity-60">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Αποθήκευση θέσης
            </button>
            <button type="button" onClick={onCancelEditing} disabled={saving} className="rounded-xl bg-slate-100 px-3 py-2.5 text-xs font-bold text-slate-700 transition hover:bg-slate-200">
              Ακύρωση
            </button>
          </>
        ) : (
          <>
            <button type="button" onClick={onOpen} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#060b00] px-3 py-2.5 text-xs font-bold text-white shadow transition hover:bg-black">
              <ExternalLink size={14} /> Καρτέλα πελάτη
            </button>
            {canEditLocation && (
              <button type="button" onClick={onStartEditing} className="flex items-center gap-1.5 rounded-xl bg-slate-100 px-3 py-2.5 text-xs font-bold text-slate-700 transition hover:bg-slate-200" title="Μετακίνηση πινέζας στην ακριβή θέση">
                <Move size={14} /> {location.coords ? 'Μετακίνηση' : 'Τοποθέτηση'}
              </button>
            )}
            {canEditLocation && location.precision === 'exact' && (
              <button type="button" onClick={onReset} disabled={saving} className="flex items-center gap-1.5 rounded-xl px-2 py-2.5 text-xs font-bold text-slate-500 transition hover:bg-slate-100" title="Αυτόματη θέση από τη διεύθυνση">
                {saving ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
