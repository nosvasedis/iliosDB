import React, { useMemo } from 'react';
import { CalendarDayEvent, EnrichedDeliveryItem } from '../../types';
import { getOrderDisplayName } from '../../utils/deliveryLabels';
import { getCalendarDayEvents } from '../../utils/namedays';

interface Props {
  monthDate: Date;
  items: EnrichedDeliveryItem[];
  majorEvents?: CalendarDayEvent[];
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
}

function dateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function EventLine({ event, isSelected }: { event: CalendarDayEvent; isSelected: boolean }) {
  const tone = event.type === 'major_event'
    ? (isSelected ? 'bg-white/15 text-white' : 'bg-amber-50 text-amber-700 border border-amber-100')
    : (isSelected ? 'bg-white/10 text-white/90' : 'bg-sky-50 text-sky-700 border border-sky-100');

  return (
    <div className={`rounded-xl px-2 py-1 text-[10px] font-black truncate ${tone}`}>
      {event.title}
      {event.subtitle ? ` • ${event.subtitle}` : ''}
    </div>
  );
}

export default function DeliveryCalendarGrid({ monthDate, items, majorEvents = [], selectedDate, onSelectDate }: Props) {
  const monthDays = useMemo(() => {
    const start = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
    const startCalendar = new Date(start);
    startCalendar.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    const days: Date[] = [];

    for (let i = 0; i < 42; i += 1) {
      const day = new Date(startCalendar);
      day.setDate(startCalendar.getDate() + i);
      days.push(day);
    }

    return days;
  }, [monthDate]);

  const itemsByDate = useMemo(() => {
    const map = new Map<string, EnrichedDeliveryItem[]>();
    items.forEach((item) => {
      const source = item.target_date || item.window_start || item.plan.created_at;
      const key = dateKey(new Date(source));
      const current = map.get(key) || [];
      current.push(item);
      map.set(key, current);
    });
    return map;
  }, [items]);

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarDayEvent[]>();
    monthDays.forEach((day) => {
      map.set(dateKey(day), getCalendarDayEvents(day, majorEvents));
    });
    return map;
  }, [majorEvents, monthDays]);

  const todayKey = dateKey(new Date());

  return (
    <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-4">
      <div className="grid grid-cols-7 gap-2 text-center text-[11px] font-black uppercase tracking-wide text-slate-400 mb-2">
        {['Δευ', 'Τρι', 'Τετ', 'Πεμ', 'Παρ', 'Σαβ', 'Κυρ'].map((label) => (
          <div key={label} className="py-2">{label}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-2">
        {monthDays.map((day) => {
          const key = dateKey(day);
          const dayItems = itemsByDate.get(key) || [];
          const dayEvents = eventsByDate.get(key) || [];
          const isCurrentMonth = day.getMonth() === monthDate.getMonth();
          const isSelected = key === dateKey(selectedDate);
          const isToday = key === todayKey;
          const visibleEvents = dayEvents.slice(0, 2);
          const visibleItems = dayItems.slice(0, Math.max(0, 2 - visibleEvents.length));
          const hiddenCount = Math.max(0, dayItems.length - visibleItems.length);

          return (
            <button
              key={key}
              onClick={() => onSelectDate(day)}
              className={`min-h-[124px] rounded-2xl border p-2 text-left transition-all ${
                isSelected
                  ? 'bg-[#060b00] text-white border-[#060b00] shadow-lg'
                  : isToday
                    ? 'bg-amber-50 border-amber-200 hover:bg-amber-100 ring-2 ring-amber-400 ring-inset'
                    : isCurrentMonth
                      ? 'bg-slate-50 border-slate-100 hover:bg-white hover:border-slate-200'
                      : 'bg-slate-50/50 border-slate-100 text-slate-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className={`text-sm font-black ${isToday && !isSelected ? 'text-amber-700' : ''}`}>
                  {day.getDate()}
                  {isToday && isCurrentMonth && !isSelected && <span className="ml-1 text-[9px] font-bold uppercase text-amber-600">Σήμερα</span>}
                </span>
              </div>
              <div className="mt-3 space-y-1">
                {visibleEvents.map((event) => (
                  <EventLine key={event.id} event={event} isSelected={isSelected} />
                ))}
                {visibleItems.map((item) => (
                  <div key={item.plan.id} className={`text-[10px] font-bold truncate ${isSelected ? 'text-white/90' : 'text-slate-600'}`}>
                    {getOrderDisplayName(item.order)}
                  </div>
                ))}
                {hiddenCount > 0 && (
                  <div className={`text-[10px] font-black ${isSelected ? 'text-white/80' : 'text-slate-500'}`}>
                    +{hiddenCount} ακόμη
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
