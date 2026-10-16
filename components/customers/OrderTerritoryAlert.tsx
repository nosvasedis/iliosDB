import React, { useMemo, useState } from 'react';
import { AlertTriangle, ChevronDown, Radar, ShieldAlert } from 'lucide-react';
import { checkSkusInTerritory, formatDistance, formatRadius, isTerritoryCustomer } from '../../features/customers/customerAssortment';
import { formatNumber } from '../../utils/numberFormat';
import { useAssortmentIndex, useTerritoryPrefs } from './useCustomerTerritory';

interface Props {
  customerId: string | null;
  skus: string[];
  /** Tighter padding and a shorter list, for phone-width builders. */
  compact?: boolean;
}

/**
 * Order-time warning: designs in this draft that nearby customers already carry, or that a
 * neighbour's exclusivity protects. Silent when there is nothing to say.
 */
export default function OrderTerritoryAlert({ customerId, skus, compact = false }: Props) {
  const enabled = Boolean(customerId && isTerritoryCustomer(customerId) && skus.length > 0);
  const index = useAssortmentIndex({ enabled });
  const prefs = useTerritoryPrefs();
  const [open, setOpen] = useState(false);
  const skuKey = [...new Set(skus)].sort().join('|');

  const hits = useMemo(() => {
    if (!index || !customerId || !enabled) return [];
    return checkSkusInTerritory(index, customerId, skuKey.split('|'), { radiusKm: prefs.radiusKm, window: prefs.window, ignored: prefs.ignoredSet });
  }, [index, customerId, enabled, skuKey, prefs.radiusKm, prefs.window, prefs.ignoredSet]);

  if (!enabled || !index || hits.length === 0) return null;
  const blocked = hits.filter(h => h.blockedBy.length > 0);
  const critical = blocked.length > 0;

  return (
    <div className={`border text-xs ${compact ? 'rounded-xl p-2.5' : 'rounded-2xl p-3'} ${critical ? 'border-rose-200 bg-rose-50 text-rose-950' : 'border-amber-200 bg-amber-50 text-amber-950'}`} role="status">
      <button type="button" onClick={() => setOpen(o => !o)} className="flex w-full items-start gap-2 text-left">
        {critical ? <ShieldAlert size={16} className="mt-0.5 shrink-0 text-rose-600" /> : <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-600" />}
        <span className="min-w-0 flex-1">
          <span className="block font-black">
            {critical
              ? `${formatNumber(blocked.length)} κωδικ${blocked.length === 1 ? 'ός' : 'οί'} υπό αποκλειστικότητα γείτονα`
              : `${formatNumber(hits.length)} κωδικ${hits.length === 1 ? 'ός υπάρχει' : 'οί υπάρχουν'} ήδη σε γειτονικό πελάτη`}
          </span>
          <span className="mt-0.5 flex items-center gap-1 text-[10px] font-semibold opacity-70"><Radar size={10} /> Ακτίνα {formatRadius(prefs.radiusKm)}{compact ? '' : ' · ρυθμίζεται στους Πελάτες'}</span>
        </span>
        <ChevronDown size={15} className={`shrink-0 opacity-60 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <ul className={`mt-2 ${compact ? 'max-h-40' : 'max-h-56'} space-y-1.5 overflow-y-auto pr-1 custom-scrollbar`}>
          {hits.map(hit => (
            <li key={hit.sku} className="rounded-xl bg-white/80 px-2.5 py-1.5">
              <span className="font-mono text-[11px] font-black">{hit.sku}</span>
              {hit.blockedBy.map(b => (
                <div key={b.customerId} className="text-[10px] font-bold text-rose-700">Αποκλειστικότητα: {b.name} ({b.scope}) · {formatDistance(b.distanceKm)}</div>
              ))}
              {hit.neighbors.slice(0, 3).map(n => (
                <div key={n.customerId} className="text-[10px] font-semibold opacity-80">{n.name} · {formatDistance(n.distanceKm)} · {formatNumber(n.qty)} τεμ.</div>
              ))}
              {hit.neighbors.length > 3 && <div className="text-[10px] font-semibold opacity-60">+{formatNumber(hit.neighbors.length - 3)} ακόμη</div>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
