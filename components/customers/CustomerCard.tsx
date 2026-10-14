import React from 'react';
import { Briefcase, ChevronRight, Globe2, Mail, MapPinned, Phone, Store } from 'lucide-react';
import { ACTIVITY_META, formatDaysAgo, isDomesticCountry, type CustomerDirectoryEntry } from '../../features/customers/customerLocation';
import { formatCurrency } from '../../utils/numberFormat';
import { ActivityBadge, CustomerAvatar, RegionPill } from './customerUi';

interface CustomerCardProps {
  entry: CustomerDirectoryEntry;
  onOpen: () => void;
  onShowOnMap?: () => void;
}

const stop = (fn?: () => void) => (e: React.MouseEvent) => { e.stopPropagation(); fn?.(); };

function Stat({ label, value, title }: { label: string; value: React.ReactNode; title?: string }) {
  return (
    <div className="min-w-0 px-2 text-center" title={title}>
      <div className="truncate text-sm font-black tabular-nums text-slate-800">{value}</div>
      <div className="text-[9px] font-bold uppercase tracking-wide text-slate-400">{label}</div>
    </div>
  );
}

export default function CustomerCard({ entry, onOpen, onShowOnMap }: CustomerCardProps) {
  const { customer, location } = entry;
  const accent = ACTIVITY_META[entry.activity].color;
  const shopCount = entry.places.filter(p => p.kind === 'branch').length;
  const lastOrderTitle = entry.lastOrderAt ? new Date(entry.lastOrderAt).toLocaleDateString('el-GR') : undefined;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } }}
      className="group relative flex h-full cursor-pointer flex-col overflow-hidden rounded-3xl border border-slate-100 bg-white p-5 shadow-sm outline-none transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-200 hover:shadow-xl focus-visible:ring-2 focus-visible:ring-sky-400"
    >
      <span className="absolute inset-x-0 top-0 h-1 opacity-70" style={{ background: `linear-gradient(90deg, ${accent}, transparent)` }} aria-hidden />

      <div className="flex items-start gap-3">
        <CustomerAvatar name={customer.full_name} seed={customer.id} size={48} />
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-2 text-[15px] font-black leading-snug text-slate-900" title={customer.full_name}>
            {customer.full_name}
          </h3>
          {customer.profession ? (
            <div className="mt-0.5 flex items-center gap-1 text-[11px] font-medium text-slate-400" title={customer.profession}>
              <Briefcase size={11} className="shrink-0" /> <span className="truncate">{customer.profession}</span>
            </div>
          ) : customer.vat_number ? (
            <div className="mt-0.5 font-mono text-[11px] text-slate-400">ΑΦΜ {customer.vat_number}</div>
          ) : null}
        </div>
        {customer.customer_code && (
          <span className="shrink-0 rounded-lg bg-slate-50 px-1.5 py-0.5 font-mono text-[10px] font-bold text-slate-400 ring-1 ring-slate-100">
            #{customer.customer_code}
          </span>
        )}
      </div>

      <div className="mt-3 flex min-w-0 flex-wrap items-center gap-1.5">
        <RegionPill location={location} className="max-w-[70%]" />
        <ActivityBadge activity={entry.activity} />
        {shopCount > 1 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-700 ring-1 ring-indigo-100" title={entry.places.map(p => p.label).join(' · ')}>
            <Store size={10} /> {shopCount} καταστήματα
          </span>
        )}
        {!isDomesticCountry(entry.fiscalLocation.countryCode) && (
          <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-bold text-violet-700 ring-1 ring-violet-100">
            <Globe2 size={10} /> Εξωτερικό
          </span>
        )}
      </div>

      <div className="mt-4 grid grid-cols-3 divide-x divide-slate-100 rounded-2xl bg-slate-50/80 py-2.5">
        <Stat label="Παραγγ." value={entry.orderCount} />
        <Stat label="Τζίρος" value={entry.revenue ? formatCurrency(entry.revenue) : '—'} />
        <Stat label="Τελευταία" value={formatDaysAgo(entry.daysSinceLastOrder)} title={lastOrderTitle} />
      </div>

      <div className="mt-auto flex items-center gap-1.5 pt-4">
        {customer.phone ? (
          <a
            href={`tel:${customer.phone}`}
            onClick={e => e.stopPropagation()}
            className="flex min-w-0 items-center gap-1.5 rounded-xl px-2 py-1.5 text-xs font-bold text-slate-600 transition hover:bg-emerald-50 hover:text-emerald-700"
            title="Κλήση"
          >
            <Phone size={13} className="shrink-0" /> <span className="truncate">{customer.phone}</span>
          </a>
        ) : (
          <span className="px-2 py-1.5 text-[11px] italic text-slate-300">Χωρίς τηλέφωνο</span>
        )}
        <span className="flex-1" />
        {customer.email && (
          <a
            href={`mailto:${customer.email}`}
            onClick={e => e.stopPropagation()}
            className="rounded-xl p-2 text-slate-400 transition hover:bg-sky-50 hover:text-sky-700"
            title={customer.email}
          >
            <Mail size={15} />
          </a>
        )}
        {onShowOnMap && (
          <button
            type="button"
            onClick={stop(onShowOnMap)}
            disabled={!entry.places.some(p => p.location.coords)}
            className="rounded-xl p-2 text-slate-400 transition hover:bg-sky-50 hover:text-sky-700 disabled:cursor-not-allowed disabled:opacity-30"
            title={location.coords ? 'Στον χάρτη' : 'Χωρίς τοποθεσία'}
          >
            <MapPinned size={15} />
          </button>
        )}
        <ChevronRight size={16} className="text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-600" />
      </div>
    </div>
  );
}

export function SystemCustomerCard({ entry, onOpen }: { entry: CustomerDirectoryEntry; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group relative flex w-full items-center gap-4 overflow-hidden rounded-3xl border border-fuchsia-100 bg-gradient-to-r from-fuchsia-50 via-white to-white p-4 text-left shadow-sm transition hover:border-fuchsia-200 hover:shadow-md"
    >
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-fuchsia-500 to-violet-600 text-white shadow">
        <Store size={22} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[15px] font-black text-slate-900">{entry.customer.full_name}</span>
          <span className="rounded-full border border-fuchsia-200 bg-white px-2 py-0.5 text-[9px] font-black uppercase text-fuchsia-700">Σύστημα</span>
        </div>
        <div className="text-[11px] font-medium text-slate-500">Συλλογικός πελάτης για πωλήσεις λιανικής. Δεν εμφανίζεται στον χάρτη.</div>
      </div>
      <div className="hidden items-center gap-6 pr-2 sm:flex">
        <Stat label="Παραγγ." value={entry.orderCount} />
        <Stat label="Τζίρος" value={entry.revenue ? formatCurrency(entry.revenue) : '—'} />
        <Stat label="Τελευταία" value={formatDaysAgo(entry.daysSinceLastOrder)} />
      </div>
      <ChevronRight size={18} className="text-fuchsia-300 transition group-hover:translate-x-0.5 group-hover:text-fuchsia-600" />
    </button>
  );
}
