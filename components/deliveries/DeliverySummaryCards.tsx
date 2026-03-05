import React from 'react';
import { AlertTriangle, BellRing, CalendarClock, PhoneCall } from 'lucide-react';

interface Props {
  stats: {
    overdue: number;
    today: number;
    upcoming: number;
    callNeeded: number;
  };
}

const cards = [
  { key: 'overdue', label: 'Εκπρόθεσμα', icon: AlertTriangle, tone: 'bg-red-50 text-red-700 border-red-100' },
  { key: 'today', label: 'Σήμερα', icon: BellRing, tone: 'bg-amber-50 text-amber-700 border-amber-100' },
  { key: 'upcoming', label: 'Επόμενες 7 ημέρες', icon: CalendarClock, tone: 'bg-blue-50 text-blue-700 border-blue-100' },
  { key: 'callNeeded', label: 'Χρειάζονται κλήση', icon: PhoneCall, tone: 'bg-emerald-50 text-emerald-700 border-emerald-100' }
] as const;

export default function DeliverySummaryCards({ stats }: Props) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      {cards.map((card) => {
        const Icon = card.icon;
        const value = stats[card.key];
        return (
          <div key={card.key} className={`rounded-3xl border p-5 shadow-sm ${card.tone}`}>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-black uppercase tracking-wider opacity-80">{card.label}</div>
                <div className="text-3xl font-black mt-2">{value}</div>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-white/70 flex items-center justify-center border border-current/10">
                <Icon size={22} />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
