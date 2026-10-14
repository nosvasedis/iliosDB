import React from 'react';
import { MapPin } from 'lucide-react';
import {
  ACTIVITY_META,
  customerAvatarGradient,
  customerInitials,
  type CustomerActivity,
  type CustomerLocation,
} from '../../features/customers/customerLocation';

export function CustomerAvatar({ name, seed, size = 44, className = '' }: { name: string; seed: string; size?: number; className?: string }) {
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-2xl font-black text-white shadow-sm ring-2 ring-white ${className}`}
      style={{ width: size, height: size, background: customerAvatarGradient(seed), fontSize: Math.round(size * 0.36) }}
      aria-hidden
    >
      {customerInitials(name)}
    </div>
  );
}

export function ActivityBadge({ activity, compact = false }: { activity: CustomerActivity; compact?: boolean }) {
  const meta = ACTIVITY_META[activity];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ${meta.soft}`}
      title={meta.hint}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
      {compact ? null : meta.label}
    </span>
  );
}

export function locationText(location: CustomerLocation): string | null {
  const parts = [location.town, location.unitLabel].filter(Boolean) as string[];
  const unique = parts.filter((p, i) => parts.findIndex(q => q.toLocaleLowerCase('el-GR') === p.toLocaleLowerCase('el-GR')) === i);
  return unique.length ? unique.join(' · ') : location.periferiaLabel;
}

export function RegionPill({ location, className = '' }: { location: CustomerLocation; className?: string }) {
  const text = locationText(location);
  if (!text) {
    return (
      <span className={`inline-flex items-center gap-1 rounded-full bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-400 ring-1 ring-slate-100 ${className}`}>
        <MapPin size={10} /> Χωρίς περιοχή
      </span>
    );
  }
  return (
    <span
      className={`inline-flex min-w-0 max-w-full items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-bold text-sky-800 ring-1 ring-sky-100 ${className}`}
      title={[text, location.periferiaLabel, location.postalCode].filter(Boolean).join(' · ')}
    >
      <MapPin size={10} className="shrink-0 text-sky-500" />
      <span className="truncate">{text}</span>
    </span>
  );
}
