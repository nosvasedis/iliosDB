import React from 'react';
import { ArrowDown, ArrowUp, MapPinned } from 'lucide-react';
import {
  formatDaysAgo,
  type CustomerDirectoryEntry,
  type CustomerSortKey,
  type SortDirection,
} from '../../features/customers/customerLocation';
import { formatCurrency } from '../../utils/numberFormat';
import { ActivityBadge, CustomerAvatar, RegionPill } from './customerUi';

interface Props {
  entries: CustomerDirectoryEntry[];
  sortKey: CustomerSortKey;
  sortDir: SortDirection;
  onSort: (key: CustomerSortKey) => void;
  onOpen: (entry: CustomerDirectoryEntry) => void;
  onShowOnMap: (entry: CustomerDirectoryEntry) => void;
}

function SortHeader({ label, k, sortKey, sortDir, onSort, align = 'left' }: {
  label: string; k: CustomerSortKey; sortKey: CustomerSortKey; sortDir: SortDirection;
  onSort: (key: CustomerSortKey) => void; align?: 'left' | 'right';
}) {
  const active = sortKey === k;
  return (
    <th className={`px-3 py-3 ${align === 'right' ? 'text-right' : 'text-left'}`}>
      <button
        type="button"
        onClick={() => onSort(k)}
        className={`inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wide transition ${active ? 'text-slate-900' : 'text-slate-400 hover:text-slate-700'}`}
      >
        {label}
        {active && (sortDir === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
      </button>
    </th>
  );
}

export default function CustomerListView({ entries, sortKey, sortDir, onSort, onOpen, onShowOnMap }: Props) {
  const headerProps = { sortKey, sortDir, onSort };
  return (
    <div className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm">
      <table className="w-full table-fixed text-sm">
        <thead className="sticky top-0 z-10 border-b border-slate-100 bg-slate-50/95 backdrop-blur">
          <tr>
            <SortHeader label="Πελάτης" k="name" {...headerProps} />
            <SortHeader label="Περιοχή" k="region" {...headerProps} />
            <th className="hidden w-36 px-3 py-3 text-left text-[10px] font-black uppercase tracking-wide text-slate-400 xl:table-cell">Τηλέφωνο</th>
            <SortHeader label="Παραγγ." k="orders" align="right" {...headerProps} />
            <SortHeader label="Τζίρος" k="revenue" align="right" {...headerProps} />
            <SortHeader label="Τελευταία" k="recent" align="right" {...headerProps} />
            <th className="w-12 px-3 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {entries.map(entry => {
            const { customer, location } = entry;
            return (
              <tr
                key={customer.id}
                onClick={() => onOpen(entry)}
                className="group cursor-pointer transition hover:bg-sky-50/40"
              >
                <td className="px-3 py-2.5">
                  <div className="flex min-w-0 items-center gap-3">
                    <CustomerAvatar name={customer.full_name} seed={customer.id} size={34} className="rounded-xl" />
                    <div className="min-w-0">
                      <div className="truncate font-bold text-slate-800" title={customer.full_name}>{customer.full_name}</div>
                      <div className="flex items-center gap-2 text-[10px] text-slate-400">
                        {customer.customer_code && <span className="font-mono font-bold">#{customer.customer_code}</span>}
                        <ActivityBadge activity={entry.activity} />
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-2.5"><RegionPill location={location} /></td>
                <td className="hidden truncate px-3 py-2.5 text-xs font-semibold text-slate-600 xl:table-cell">{customer.phone || <span className="text-slate-300">—</span>}</td>
                <td className="w-24 px-3 py-2.5 text-right font-bold tabular-nums text-slate-700">{entry.orderCount || <span className="text-slate-300">0</span>}</td>
                <td className="w-32 px-3 py-2.5 text-right font-bold tabular-nums text-slate-700">{entry.revenue ? formatCurrency(entry.revenue) : <span className="text-slate-300">—</span>}</td>
                <td className="w-32 px-3 py-2.5 text-right text-xs font-semibold text-slate-500" title={entry.lastOrderAt ? new Date(entry.lastOrderAt).toLocaleDateString('el-GR') : undefined}>
                  {formatDaysAgo(entry.daysSinceLastOrder)}
                </td>
                <td className="px-3 py-2.5 text-right">
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); onShowOnMap(entry); }}
                    disabled={!location.coords}
                    className="rounded-lg p-1.5 text-slate-300 transition hover:bg-sky-100 hover:text-sky-700 disabled:opacity-30 group-hover:text-slate-500"
                    title={location.coords ? 'Στον χάρτη' : 'Χωρίς τοποθεσία'}
                  >
                    <MapPinned size={15} />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
