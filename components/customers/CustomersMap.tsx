import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { L } from './leafletSetup';
import 'leaflet.markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import {
  AlertTriangle, Check, ExternalLink, Globe, Landmark, Loader2, Mail, MapPin, Maximize2, Move, Phone, Plane, RotateCcw, Search, Store, WifiOff, X,
} from 'lucide-react';
import type { Customer } from '../../types';
import {
  ACTIVITY_META,
  customerBranches,
  customerInitials,
  formatDaysAgo,
  isDomesticCountry,
  matchesRegionFilter,
  PRECISION_LABEL,
  type CustomerActivity,
  type CustomerDirectoryEntry,
  type CustomerPlace,
  type RegionFilterKey,
} from '../../features/customers/customerLocation';
import type { LatLng } from '../../features/customers/greekRegions';
import { formatCurrency } from '../../utils/numberFormat';
import { normalizedIncludes } from '../../utils/greekSearch';
import { geocodeAddress, type GeocodeResult } from '../../features/customers/addressGeocoding';
import { ActivityBadge, CustomerAvatar, locationText } from './customerUi';

export interface CustomersMapProps {
  /** Already filtered entries (system customer excluded). */
  entries: CustomerDirectoryEntry[];
  /** Active Περιοχή filter — only the matching shops of each customer are pinned. */
  regionSelection?: RegionFilterKey[];
  /** Bump `nonce` to fly to a customer (e.g. from a card's "Στον χάρτη"). */
  focusRequest?: { id: string; nonce: number } | null;
  onOpenCustomer: (customer: Customer) => void;
  /** `branchId` set → that shop's pin; otherwise the fiscal-seat pin. */
  onSaveLocation: (customerId: string, coords: LatLng | null, branchId?: string | null) => Promise<void>;
  canEditLocation: boolean;
  /** Mobile layout: no side panel, bottom sheet for the selected customer. */
  compact?: boolean;
  className?: string;
}

const GREECE_BOUNDS: L.LatLngBoundsExpression = [[34.8, 19.4], [41.75, 28.3]];
const WORLD_BOUNDS: L.LatLngBoundsExpression = [[-85, -200], [85, 200]];

/** A pin: one shop of a customer (or its fiscal seat when it has no shops). */
interface MapPoint {
  id: string;
  entry: CustomerDirectoryEntry;
  place: CustomerPlace;
}

const pointTitle = (point: MapPoint) => (point.place.kind === 'branch' && point.entry.places.length > 1
  ? `${point.entry.customer.full_name} — ${point.place.label}`
  : point.entry.customer.full_name);
const ACTIVITY_ORDER: CustomerActivity[] = ['active', 'quiet', 'inactive', 'none'];

/** Free basemaps that need no API key. Order = automatic fallback order. */
type BasemapId = 'streets' | 'light' | 'satellite';
const BASEMAPS: Array<{ id: BasemapId; label: string; url: string; maxNativeZoom: number; attribution: string }> = [
  {
    id: 'streets',
    label: 'Χάρτης',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    maxNativeZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>',
  },
  {
    id: 'light',
    label: 'Απλός',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    maxNativeZoom: 16,
    attribution: 'Tiles &copy; Esri &mdash; Esri, HERE, Garmin, &copy; OpenStreetMap',
  },
  {
    id: 'satellite',
    label: 'Δορυφόρος',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    maxNativeZoom: 19,
    attribution: 'Tiles &copy; Esri &mdash; Maxar, Earthstar Geographics',
  },
];
const BASEMAP_STORAGE_KEY = 'ilios.customersMap.basemap';

function readBasemap(): BasemapId {
  try {
    const stored = localStorage.getItem(BASEMAP_STORAGE_KEY);
    return BASEMAPS.some(b => b.id === stored) ? stored as BasemapId : 'streets';
  } catch {
    return 'streets';
  }
}

const tuple = (c: LatLng): L.LatLngTuple => [c[0], c[1]];

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] as string));

function pinIcon(point: MapPoint, state: { selected?: boolean; editing?: boolean } = {}) {
  const { entry, place } = point;
  const classes = ['cm-pin'];
  if (state.selected) classes.push('is-selected');
  if (state.editing) classes.push('is-editing');
  if (place.location.precision === 'area') classes.push('is-approx');
  if (place.location.precision === 'exact') classes.push('is-exact');
  const badge = place.kind === 'fiscal' ? '<em class="cm-pin-badge">ΦΕ</em>' : '';
  return L.divIcon({
    html: `<div class="${classes.join(' ')}" style="--pin:${ACTIVITY_META[entry.activity].color}"><div class="cm-pin-head"><span>${escapeHtml(customerInitials(entry.customer.full_name))}</span></div>${badge}</div>`,
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
.cm-pin-badge{position:absolute;right:-2px;top:-4px;font-style:normal;font-size:7px;font-weight:900;line-height:1;padding:2px 3px;border-radius:9999px;background:#fff;color:#334155;box-shadow:0 1px 4px rgba(15,23,42,.25)}
`;

export default function CustomersMap({
  entries, regionSelection = [], focusRequest, onOpenCustomer, onSaveLocation, canEditLocation, compact = false, className = '',
}: CustomersMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const clusterRef = useRef<L.MarkerClusterGroup | null>(null);
  const markersRef = useRef(new Map<string, L.Marker>());
  const mapClickRef = useRef<((latlng: L.LatLng) => void) | null>(null);
  /** The draggable pin while placing, so an address search can move it. */
  const editMarkerRef = useRef<L.Marker | null>(null);
  const fitKeyRef = useRef<string | null>(null);
  const handledFocusRef = useRef<number | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; coords: LatLng } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tilesOffline, setTilesOffline] = useState(false);
  const [basemap, setBasemap] = useState<BasemapId>(readBasemap);
  const [mapReady, setMapReady] = useState(false);
  /** Basemaps that failed in this session (to skip them when falling back). */
  const failedBasemapsRef = useRef(new Set<BasemapId>());
  const [listQuery, setListQuery] = useState('');

  // One point per shop (or the fiscal seat when there are no shops). With an active
  // Περιοχή filter only the matching shops are shown.
  const points = useMemo<MapPoint[]>(() => entries.flatMap((entry) => {
    const matching = regionSelection.length
      ? entry.places.filter(place => matchesRegionFilter(place.location, regionSelection))
      : entry.places;
    const shown = matching.length ? matching : entry.places;
    return shown.map(place => ({ id: `${entry.customer.id}|${place.key}`, entry, place }));
  }), [entries, regionSelection]);

  const pointById = useMemo(() => new Map(points.map(p => [p.id, p])), [points]);
  const located = useMemo(() => points.filter(p => p.place.location.coords), [points]);
  const unlocated = useMemo(() => points.filter(p => !p.place.location.coords), [points]);
  const abroadCount = useMemo(() => located.filter(p => !isDomesticCountry(p.place.location.countryCode)).length, [located]);
  const selectedPoint = selectedId ? pointById.get(selectedId) ?? null : null;
  const editingId = editing?.id ?? null;

  const selectedIdRef = useRef(selectedId);
  selectedIdRef.current = selectedId;

  // --- Map lifecycle -------------------------------------------------------
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const map = L.map(el, {
      zoomControl: false,
      minZoom: 2,
      maxZoom: 18,
      maxBounds: WORLD_BOUNDS,
      maxBoundsViscosity: 0.9,
      worldCopyJump: true,
    });
    map.fitBounds(GREECE_BOUNDS, { animate: false });
    map.attributionControl.setPrefix(false);
    L.control.zoom({ position: 'bottomright', zoomInTitle: 'Μεγέθυνση', zoomOutTitle: 'Σμίκρυνση' }).addTo(map);

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
    setMapReady(true);
    const markers = markersRef.current;
    return () => {
      ro.disconnect();
      map.remove();
      setMapReady(false);
      mapRef.current = null;
      clusterRef.current = null;
      markers.clear();
      fitKeyRef.current = null;
    };
  }, []);

  // --- Basemap (keyless providers with automatic fallback) -----------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const config = BASEMAPS.find(b => b.id === basemap) ?? BASEMAPS[0];
    let loaded = false;
    let failures = 0;
    const layer = L.tileLayer(config.url, {
      maxZoom: 19,
      maxNativeZoom: config.maxNativeZoom,
      attribution: config.attribution,
    });
    layer.on('tileload', () => {
      if (loaded) return;
      loaded = true;
      failedBasemapsRef.current.delete(config.id);
      setTilesOffline(false);
    });
    layer.on('tileerror', () => {
      failures += 1;
      if (loaded || failures < 4) return;
      failedBasemapsRef.current.add(config.id);
      const next = BASEMAPS.find(b => !failedBasemapsRef.current.has(b.id));
      if (next) setBasemap(next.id);
      else setTilesOffline(true);
    });
    layer.addTo(map);
    layer.bringToBack();
    return () => { layer.remove(); };
  }, [basemap, mapReady]);

  const chooseBasemap = (id: BasemapId) => {
    failedBasemapsRef.current.delete(id);
    setBasemap(id);
    try { localStorage.setItem(BASEMAP_STORAGE_KEY, id); } catch { /* storage unavailable */ }
  };

  // --- Markers -------------------------------------------------------------
  useEffect(() => {
    const cluster = clusterRef.current;
    if (!cluster || !mapReady) return;
    cluster.clearLayers();
    markersRef.current.clear();
    const markers = located
      .filter(p => p.id !== editingId)
      .map((point) => {
        const marker = L.marker(tuple(point.place.location.coords as LatLng), {
          icon: pinIcon(point, { selected: point.id === selectedIdRef.current }),
          title: pointTitle(point),
          riseOnHover: true,
          keyboard: true,
          activity: point.entry.activity,
        } as L.MarkerOptions);
        marker.bindTooltip(escapeHtml(pointTitle(point)), { direction: 'top', className: 'cm-tooltip' });
        marker.on('click', () => { setError(null); setSelectedId(point.id); });
        markersRef.current.set(point.id, marker);
        return marker;
      });
    cluster.addLayers(markers);
  }, [located, editingId, mapReady]);

  // Highlight the selected pin.
  const prevSelectedRef = useRef<string | null>(null);
  useEffect(() => {
    const prev = prevSelectedRef.current;
    if (prev && prev !== selectedId) {
      const point = pointById.get(prev);
      const marker = markersRef.current.get(prev);
      if (point && marker) marker.setIcon(pinIcon(point));
    }
    if (selectedId) {
      const point = pointById.get(selectedId);
      const marker = markersRef.current.get(selectedId);
      if (point && marker) {
        marker.setIcon(pinIcon(point, { selected: true }));
        marker.setZIndexOffset(1000);
      }
    }
    prevSelectedRef.current = selectedId;
  }, [selectedId, pointById]);

  // --- Viewport ------------------------------------------------------------
  /** Frames the points; by default Greece-only so one overseas shop doesn't zoom out to the world. */
  const fitToPoints = useCallback((animate = true, includeAbroad = false) => {
    const map = mapRef.current;
    if (!map) return;
    const domestic = located.filter(p => isDomesticCountry(p.place.location.countryCode));
    const target = includeAbroad || domestic.length === 0 ? located : domestic;
    const coords = target.map(p => tuple(p.place.location.coords as LatLng));
    if (coords.length === 0) map.fitBounds(GREECE_BOUNDS, { animate });
    else if (coords.length === 1) map.setView(coords[0], 11, { animate });
    else map.fitBounds(L.latLngBounds(coords), { padding: [56, 56], maxZoom: 11, animate });
  }, [located]);

  const showGreece = useCallback(() => {
    mapRef.current?.fitBounds(GREECE_BOUNDS);
  }, []);

  const focusPointIdFor = useCallback((customerId: string) => {
    const own = points.filter(p => p.entry.customer.id === customerId);
    return (own.find(p => p.place.location.coords) ?? own[0])?.id ?? null;
  }, [points]);

  // Refit whenever the filtered set changes (not on mere data refreshes).
  useEffect(() => {
    if (editingId) return;
    const key = located.map(p => p.id).sort().join('|');
    if (fitKeyRef.current === key) return;
    const first = fitKeyRef.current === null;
    fitKeyRef.current = key;
    const focusPending = focusRequest && handledFocusRef.current !== focusRequest.nonce && focusPointIdFor(focusRequest.id);
    if (focusPending) return; // the focus effect frames the map instead
    fitToPoints(!first);
  }, [located, editingId, fitToPoints, focusRequest, focusPointIdFor]);

  const focusPoint = useCallback((id: string) => {
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
    if (!mapReady || !focusRequest || handledFocusRef.current === focusRequest.nonce) return;
    const pointId = focusPointIdFor(focusRequest.id);
    if (!pointId) return;
    handledFocusRef.current = focusRequest.nonce;
    focusPoint(pointId);
  }, [focusRequest, focusPointIdFor, focusPoint, mapReady]);

  // Drop the selection when the point is filtered out.
  useEffect(() => {
    if (selectedId && !pointById.has(selectedId)) setSelectedId(null);
  }, [selectedId, pointById]);

  // --- Manual placement ----------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !editingId || !editing) return;
    const point = pointById.get(editingId);
    if (!point) return;
    const marker = L.marker(tuple(editing.coords), {
      draggable: true,
      autoPan: true,
      zIndexOffset: 2000,
      icon: pinIcon(point, { editing: true, selected: true }),
    }).addTo(map);
    editMarkerRef.current = marker;
    marker.on('dragend', () => {
      const p = marker.getLatLng().wrap();
      setEditing(prev => (prev ? { ...prev, coords: [p.lat, p.lng] } : prev));
    });
    mapClickRef.current = (latlng) => {
      const p = latlng.wrap();
      marker.setLatLng(p);
      setEditing(prev => (prev ? { ...prev, coords: [p.lat, p.lng] } : prev));
    };
    if (!map.getBounds().contains(marker.getLatLng()) || map.getZoom() < 12) {
      map.setView(marker.getLatLng(), Math.max(map.getZoom(), 13));
    }
    return () => {
      mapClickRef.current = null;
      editMarkerRef.current = null;
      marker.remove();
    };
    // The editing marker is created once per edit session; coords updates come from it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingId]);

  /** Moves the placing pin to a searched address (the user still confirms with «Αποθήκευση θέσης»). */
  const locateEditing = useCallback((coords: LatLng, precise: boolean) => {
    const map = mapRef.current;
    const marker = editMarkerRef.current;
    if (!map || !marker) return;
    marker.setLatLng(tuple(coords));
    setEditing(prev => (prev ? { ...prev, coords } : prev));
    setError(null);
    map.setView(tuple(coords), precise ? 18 : 15, { animate: true });
  }, []);

  const startEditing = (point: MapPoint) => {
    const map = mapRef.current;
    const center = map?.getCenter();
    const coords: LatLng = point.place.location.coords ?? (center ? [center.lat, center.lng] : [38.3, 23.7]);
    setError(null);
    setSelectedId(point.id);
    setEditing({ id: point.id, coords });
  };

  const saveEditing = async () => {
    if (!editing) return;
    const point = pointById.get(editing.id);
    if (!point) return;
    const [lat, lng] = editing.coords;
    if (isDomesticCountry(point.place.location.countryCode) && (lat < 34 || lat > 42 || lng < 19 || lng > 30)) {
      setError('Ο πελάτης είναι στην Ελλάδα — η πινέζα πρέπει να βρίσκεται εντός Ελλάδας. Για πελάτη εξωτερικού αλλάξτε πρώτα τη χώρα του.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSaveLocation(point.entry.customer.id, [Number(lat.toFixed(6)), Number(lng.toFixed(6))], point.place.branchId);
      setEditing(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Η αποθήκευση της θέσης απέτυχε.');
    } finally {
      setSaving(false);
    }
  };

  const resetToAutomatic = async (point: MapPoint) => {
    setSaving(true);
    setError(null);
    try {
      await onSaveLocation(point.entry.customer.id, null, point.place.branchId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Η επαναφορά απέτυχε.');
    } finally {
      setSaving(false);
    }
  };

  const listPoints = useMemo(() => {
    const filtered = listQuery
      ? located.filter(p => normalizedIncludes(`${p.entry.customer.full_name} ${p.place.label} ${locationText(p.place.location) ?? ''}`, listQuery))
      : located;
    return [...filtered].sort((a, b) =>
      a.entry.customer.full_name.localeCompare(b.entry.customer.full_name, 'el', { sensitivity: 'base' })
      || a.place.label.localeCompare(b.place.label, 'el'));
  }, [located, listQuery]);

  const card = selectedPoint ? (
    <SelectedCustomerCard
      point={selectedPoint}
      compact={compact}
      editing={editing?.id === selectedPoint.id ? editing.coords : null}
      saving={saving}
      error={error}
      canEditLocation={canEditLocation}
      onClose={() => { setSelectedId(null); setEditing(null); setError(null); }}
      onOpen={() => onOpenCustomer(selectedPoint.entry.customer)}
      onStartEditing={() => startEditing(selectedPoint)}
      onCancelEditing={() => { setEditing(null); setError(null); }}
      onLocate={locateEditing}
      onSave={saveEditing}
      onReset={() => resetToAutomatic(selectedPoint)}
    />
  ) : null;

  return (
    // `isolate`: keep the map's overlays (z-500+) and Leaflet panes below page modals.
    <div className={`cm-root isolate flex min-h-0 gap-4 ${editing ? 'cm-placing' : ''} ${className}`}>
      <style>{MAP_CSS}</style>

      <div className={`relative min-h-0 flex-1 overflow-hidden bg-slate-100 ${compact ? 'rounded-2xl' : 'rounded-3xl border border-slate-200 shadow-sm'}`}>
        <div ref={containerRef} className="absolute inset-0 z-0" role="application" aria-label="Χάρτης πελατών" />

        {/* Top-right controls */}
        <div className="pointer-events-none absolute right-3 top-3 z-[500] flex flex-col items-end gap-2">
          <div className="pointer-events-auto flex overflow-hidden rounded-xl bg-white/95 shadow-lg ring-1 ring-slate-200 backdrop-blur">
            <button type="button" onClick={() => fitToPoints()} className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50" title="Προσαρμογή στους πελάτες που εμφανίζονται">
              <Maximize2 size={14} /> {compact ? null : 'Προσαρμογή'}
            </button>
            <span className="w-px bg-slate-200" />
            <button type="button" onClick={showGreece} className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50" title="Όλη η Ελλάδα">
              <Globe size={14} /> {compact ? null : 'Ελλάδα'}
            </button>
            {abroadCount > 0 && (
              <>
                <span className="w-px bg-slate-200" />
                <button type="button" onClick={() => fitToPoints(true, true)} className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-violet-700 transition hover:bg-violet-50" title="Εμφάνιση και των πελατών εξωτερικού">
                  <Plane size={14} /> {compact ? abroadCount : `Εξωτερικό (${abroadCount})`}
                </button>
              </>
            )}
          </div>
          <div className="pointer-events-auto flex overflow-hidden rounded-xl bg-white/95 p-0.5 shadow-lg ring-1 ring-slate-200 backdrop-blur">
            {BASEMAPS.map(b => (
              <button
                key={b.id}
                type="button"
                onClick={() => chooseBasemap(b.id)}
                className={`rounded-lg px-2.5 py-1.5 text-[11px] font-bold transition ${basemap === b.id ? 'bg-[#060b00] text-white' : 'text-slate-600 hover:bg-slate-100'}`}
              >
                {b.label}
              </button>
            ))}
          </div>
          <div className="pointer-events-auto rounded-full bg-[#060b00]/90 px-3 py-1 text-[11px] font-bold text-white shadow-lg">
            {located.length} {located.length === 1 ? 'σημείο' : 'σημεία'}{unlocated.length ? ` · ${unlocated.length} χωρίς θέση` : ''}
          </div>
        </div>

        {/* Legend */}
        <div className="pointer-events-none absolute bottom-3 left-3 z-[500]">
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
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-slate-100 pt-1.5 text-[10px] font-medium text-slate-400">
                <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-4 rounded-full border border-dashed border-slate-400" /> θέση κατά προσέγγιση</span>
                <span className="flex items-center gap-1.5"><span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-white text-[8px] font-black text-slate-700 ring-1 ring-slate-300">ΦΕ</span> φορολογική έδρα (χωρίς κατάστημα)</span>
              </div>
            )}
          </div>
        </div>

        {editing && (
          <div className="pointer-events-none absolute left-1/2 top-3 z-[600] -translate-x-1/2">
            <div className="flex items-center gap-2 rounded-full bg-[#060b00] px-4 py-2 text-xs font-bold text-white shadow-xl">
              <Move size={14} /> Γράψτε διεύθυνση, σύρετε την πινέζα ή κάντε κλικ στον χάρτη
            </div>
          </div>
        )}

        {tilesOffline && (
          <div className="absolute inset-x-3 top-16 z-[550] mx-auto flex max-w-md items-start gap-2 rounded-2xl bg-amber-50 p-3 text-xs font-semibold text-amber-800 shadow-lg ring-1 ring-amber-200">
            <WifiOff size={16} className="mt-0.5 shrink-0" />
            Το υπόβαθρο του χάρτη δεν φορτώνει (χωρίς σύνδεση στο internet;). Οι πινέζες εμφανίζονται κανονικά.
          </div>
        )}

        {located.length === 0 && !editing && (
          <div className="pointer-events-none absolute inset-0 z-[450] flex items-center justify-center">
            <div className="rounded-2xl bg-white/95 px-5 py-4 text-center shadow-xl ring-1 ring-slate-200">
              <MapPin className="mx-auto mb-1 text-slate-300" size={26} />
              <div className="text-sm font-bold text-slate-700">Κανένας πελάτης στον χάρτη</div>
              <div className="text-xs text-slate-400">Αλλάξτε τα φίλτρα ή συμπληρώστε διευθύνσεις καταστημάτων.</div>
            </div>
          </div>
        )}

        {card && (
          <div className={compact
            ? 'custom-scrollbar absolute inset-x-2 bottom-2 z-[700] max-h-[75%] overflow-y-auto rounded-3xl'
            : 'custom-scrollbar absolute left-3 top-3 z-[700] max-h-[calc(100%-1.5rem)] w-[340px] max-w-[calc(100%-1.5rem)] overflow-y-auto rounded-3xl'}
          >
            {card}
          </div>
        )}
      </div>

      {!compact && (
        <aside className="hidden w-[300px] shrink-0 flex-col overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm xl:flex">
          <div className="border-b border-slate-100 p-4">
            <div className="text-sm font-black text-slate-800">Καταστήματα στον χάρτη</div>
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
            {listPoints.map(point => {
              const active = selectedId === point.id;
              return (
                <button
                  key={point.id}
                  type="button"
                  onClick={() => focusPoint(point.id)}
                  className={`flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left transition ${active ? 'bg-slate-900 text-white' : 'hover:bg-slate-50'}`}
                >
                  <CustomerAvatar name={point.entry.customer.full_name} seed={point.entry.customer.id} size={30} className="rounded-xl ring-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-bold">{point.entry.customer.full_name}</span>
                    <span className={`block truncate text-[10px] ${active ? 'text-slate-300' : 'text-slate-400'}`}>
                      {point.place.kind === 'branch' ? `${point.place.label} · ` : ''}{locationText(point.place.location) ?? '—'}
                    </span>
                  </span>
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: ACTIVITY_META[point.entry.activity].color }} />
                </button>
              );
            })}
            {listPoints.length === 0 && <div className="p-4 text-center text-xs italic text-slate-400">Κανένα αποτέλεσμα.</div>}

            {unlocated.length > 0 && (
              <div className="mt-3 border-t border-slate-100 pt-3">
                <div className="flex items-center gap-1.5 px-2 pb-1 text-[10px] font-black uppercase tracking-wide text-amber-600">
                  <AlertTriangle size={12} /> Χωρίς τοποθεσία ({unlocated.length})
                </div>
                {unlocated.map(point => (
                  <div key={point.id} className="flex items-center gap-2 rounded-xl px-2 py-1.5">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-bold text-slate-700">{point.entry.customer.full_name}</span>
                      <span className="block truncate text-[10px] text-slate-400">
                        {point.place.kind === 'branch' ? `${point.place.label} · ` : ''}{point.place.address || 'Χωρίς διεύθυνση'}
                      </span>
                    </span>
                    {canEditLocation && (
                      <button
                        type="button"
                        onClick={() => startEditing(point)}
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
  point: MapPoint;
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
  onLocate: (coords: LatLng, precise: boolean) => void;
}

/** Address search while placing a pin: the first result is applied automatically. */
function AddressLocator({ initialQuery, country, onLocate }: { initialQuery: string; country: string; onLocate: (coords: LatLng, precise: boolean) => void }) {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'empty' | 'error'>('idle');
  const [touched, setTouched] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const run = useCallback(async (text: string) => {
    const q = text.trim();
    if (q.length < 3) { setResults([]); setStatus('idle'); return; }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setStatus('loading');
    try {
      const found = await geocodeAddress(q, country, controller.signal);
      if (controller.signal.aborted) return;
      setResults(found);
      setStatus(found.length ? 'idle' : 'empty');
      if (found[0]) { setActiveId(found[0].id); onLocate(found[0].coords, found[0].precise); }
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return;
      setStatus('error');
    }
  }, [country, onLocate]);

  // Debounced search while typing (Nominatim allows ~1 request/second).
  useEffect(() => {
    if (!touched) return;
    const id = window.setTimeout(() => run(query), 900);
    return () => window.clearTimeout(id);
  }, [query, touched, run]);
  useEffect(() => () => abortRef.current?.abort(), []);

  return (
    <div className="mx-4 mt-3 rounded-2xl bg-sky-50/70 p-2.5 ring-1 ring-sky-100">
      <form onSubmit={e => { e.preventDefault(); setTouched(false); run(query); }} className="flex gap-1.5">
        <div className="relative min-w-0 flex-1">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sky-500" />
          <input
            autoFocus
            value={query}
            onChange={e => { setQuery(e.target.value); setTouched(true); }}
            placeholder="Διεύθυνση, π.χ. Ματογιάννη 12, Μύκονος"
            className="w-full rounded-xl border border-sky-200 bg-white py-2 pl-8 pr-2 text-xs font-semibold text-slate-800 outline-none focus:border-sky-400"
            aria-label="Αναζήτηση διεύθυνσης για την πινέζα"
          />
        </div>
        <button type="submit" disabled={status === 'loading' || query.trim().length < 3}
          className="flex shrink-0 items-center gap-1 rounded-xl bg-sky-600 px-2.5 text-[11px] font-bold text-white hover:bg-sky-700 disabled:opacity-50">
          {status === 'loading' ? <Loader2 size={13} className="animate-spin" /> : <MapPin size={13} />} Εύρεση
        </button>
      </form>
      {status === 'empty' && <p className="mt-1.5 text-[11px] font-semibold text-amber-700">Δεν βρέθηκε. Δοκιμάστε μόνο οδό και πόλη, ή σύρετε την πινέζα.</p>}
      {status === 'error' && <p className="mt-1.5 text-[11px] font-semibold text-rose-700">Η αναζήτηση δεν είναι διαθέσιμη (σύνδεση;). Σύρετε την πινέζα χειροκίνητα.</p>}
      {results.length > 0 && (
        <ul className="mt-1.5 max-h-36 space-y-0.5 overflow-y-auto custom-scrollbar">
          {results.map(r => (
            <li key={r.id}>
              <button type="button" onClick={() => { setActiveId(r.id); onLocate(r.coords, r.precise); }}
                className={`flex w-full items-start gap-1.5 rounded-lg px-2 py-1 text-left transition ${activeId === r.id ? 'bg-white shadow-sm ring-1 ring-sky-200' : 'hover:bg-white/70'}`}>
                {activeId === r.id ? <Check size={12} className="mt-0.5 shrink-0 text-sky-600" /> : <MapPin size={12} className="mt-0.5 shrink-0 text-slate-400" />}
                <span className="min-w-0">
                  <span className="block truncate text-[11px] font-bold text-slate-800">{r.label}</span>
                  <span className="block truncate text-[10px] text-slate-500">{r.detail}{r.precise ? '' : ' · κατά προσέγγιση'}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-1.5 text-[10px] text-slate-400">Η πινέζα μετακινείται αυτόματα· διορθώστε τη σύροντάς την και πατήστε «Αποθήκευση θέσης».</p>
    </div>
  );
}

function SelectedCustomerCard({
  point, compact, editing, saving, error, canEditLocation, onClose, onOpen, onStartEditing, onCancelEditing, onSave, onReset, onLocate,
}: SelectedCardProps) {
  const { entry, place } = point;
  const { customer } = entry;
  const location = place.location;
  const where = locationText(location);
  const shopCount = entry.places.filter(p => p.kind === 'branch').length;
  const branch = place.branchId ? customerBranches(customer).find(b => b.id === place.branchId) : null;
  const phone = branch?.phone || customer.phone;
  return (
    <div className="overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-slate-200">
      <div className="flex items-start gap-3 p-4 pb-3">
        <CustomerAvatar name={customer.full_name} seed={customer.id} size={44} />
        <div className="min-w-0 flex-1">
          <div className="line-clamp-2 text-sm font-black leading-tight text-slate-900">{customer.full_name}</div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {customer.customer_code && <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-bold text-slate-500">#{customer.customer_code}</span>}
            <ActivityBadge activity={entry.activity} tier={entry.tier} />
          </div>
        </div>
        <button type="button" onClick={onClose} className="rounded-full p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700" aria-label="Κλείσιμο">
          <X size={16} />
        </button>
      </div>

      <div className="space-y-1.5 px-4 text-xs text-slate-600">
        <div className="flex items-start gap-2">
          {place.kind === 'branch' ? <Store size={13} className="mt-0.5 shrink-0 text-sky-500" /> : <Landmark size={13} className="mt-0.5 shrink-0 text-slate-400" />}
          <span className="min-w-0">
            <span className="font-bold text-slate-800">{place.label}</span>
            {shopCount > 1 && <span className="text-slate-400"> · 1 από {shopCount} καταστήματα</span>}
            {place.address && <span className="block text-[11px] text-slate-500">{place.address}</span>}
          </span>
        </div>
        <div className="flex items-start gap-2">
          <MapPin size={13} className="mt-0.5 shrink-0 text-sky-500" />
          <span className="min-w-0">
            <span className="font-bold text-slate-800">{where ?? 'Χωρίς περιοχή'}</span>
            {location.periferiaLabel && <span className="text-slate-400"> · {location.periferiaLabel}</span>}
            <span className="block text-[10px] text-slate-400">{PRECISION_LABEL[location.precision]}{location.postalCode ? ` · ΤΚ ${location.postalCode}` : ''}</span>
          </span>
        </div>
        {phone && (
          <a href={`tel:${phone}`} className="flex items-center gap-2 font-semibold text-slate-700 hover:text-sky-700">
            <Phone size={13} className="text-slate-400" /> {phone}
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
        <div title="Χωρίς ΦΠΑ, από 1 Ιανουαρίου έως σήμερα"><div className="truncate px-1 text-sm font-black text-slate-800">{formatCurrency(entry.yearRevenue)}</div><div className="text-[9px] font-bold uppercase text-slate-400">Τζίρος φέτος</div></div>
        <div><div className="text-sm font-black text-slate-800">{formatDaysAgo(entry.daysSinceLastOrder)}</div><div className="text-[9px] font-bold uppercase text-slate-400">Τελευταία</div></div>
      </div>

      {editing && (
        <AddressLocator
          key={point.id}
          initialQuery={place.address ?? ''}
          country={location.countryCode}
          onLocate={onLocate}
        />
      )}

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
