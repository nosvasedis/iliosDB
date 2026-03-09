import React, { useMemo, useState } from 'react';
import { CalendarRange, ChevronLeft, ChevronRight } from 'lucide-react';
import { CalendarDayEvent, EnrichedDeliveryItem } from '../../types';
import { formatDeliveryWindow, getOrderDisplayName } from '../../utils/deliveryLabels';
import { getCalendarDayEvents } from '../../utils/namedays';

interface Props {
  monthDate: Date;
  items: EnrichedDeliveryItem[];
  majorEvents?: CalendarDayEvent[];
  selectedDate: Date;
  selectedItem?: EnrichedDeliveryItem | null;
  onSelectDate: (date: Date) => void;
  onSelectItem?: (item: EnrichedDeliveryItem) => void;
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

function DeliveryPill({ item, isSelected }: { item: EnrichedDeliveryItem; isSelected: boolean }) {
  const sr = item.shipment_readiness;

  let readinessTone: string;
  if (!sr || sr.total_batches === 0 || sr.is_fully_ready) {
    readinessTone = 'bg-emerald-100 text-emerald-800 border-emerald-200';
  } else if (sr.is_partially_ready) {
    readinessTone = 'bg-amber-100 text-amber-800 border-amber-200';
  } else {
    readinessTone = 'bg-red-50 text-red-700 border-red-200';
  }

  const tone = isSelected
    ? 'bg-white/20 text-white border border-white/40 shadow-sm'
    : `${readinessTone} font-black`;
  return (
    <div className={`rounded-xl px-2 py-1.5 text-[10px] truncate border ${tone}`} title={getOrderDisplayName(item.order)}>
      {getOrderDisplayName(item.order)}
    </div>
  );
}

export default function DeliveryCalendarGrid({ monthDate, items, majorEvents = [], selectedDate, selectedItem = null, onSelectDate, onSelectItem }: Props) {
  const { spanningItems, singleDayItems } = useMemo(() => {
    const viewStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1).getTime();
    const viewEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0, 23, 59, 59).getTime();
    const spanning: EnrichedDeliveryItem[] = [];
    const single: EnrichedDeliveryItem[] = [];

    items.forEach((item) => {
      const windowStart = item.window_start ? new Date(item.window_start).getTime() : null;
      const windowEnd = item.window_end ? new Date(item.window_end).getTime() : null;
      const isSpanningMode = item.plan.planning_mode === 'month' || item.plan.planning_mode === 'custom_period' || item.plan.planning_mode === 'holiday_anchor';
      const hasRange = windowStart != null && windowEnd != null && isSpanningMode;

      if (hasRange) {
        let showInSidebar: boolean;
        if (item.plan.planning_mode === 'holiday_anchor') {
          const target = item.target_date ? new Date(item.target_date).getTime() : null;
          showInSidebar = target != null && target >= viewStart && target <= viewEnd;
        } else {
          showInSidebar = windowStart <= viewEnd && windowEnd >= viewStart;
        }
        if (showInSidebar) spanning.push(item);
      } else {
        single.push(item);
      }
    });

    return { spanningItems: spanning, singleDayItems: single };
  }, [items, monthDate]);

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
    singleDayItems.forEach((item) => {
      const source = item.target_date || item.window_start || item.plan.created_at;
      const key = dateKey(new Date(source));
      const current = map.get(key) || [];
      current.push(item);
      map.set(key, current);
    });
    return map;
  }, [singleDayItems]);

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarDayEvent[]>();
    monthDays.forEach((day) => {
      map.set(dateKey(day), getCalendarDayEvents(day, majorEvents));
    });
    return map;
  }, [majorEvents, monthDays]);

  const todayKey = dateKey(new Date());
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const hasSpanning = spanningItems.length > 0;

  return (
    <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-4 flex gap-2">
      {hasSpanning && (
        <div className={`shrink-0 flex flex-col border-r border-slate-100 transition-[width] duration-200 overflow-hidden ${sidebarCollapsed ? 'w-10 pr-0' : 'w-[6.5rem] pr-3'}`}>
          <div className={`flex items-center gap-1 min-h-[28px] mb-2 ${sidebarCollapsed ? 'justify-center' : 'justify-between'}`}>
            {!sidebarCollapsed && (
              <div className="flex items-center gap-1 text-slate-500 min-w-0">
                <CalendarRange size={14} className="shrink-0" />
                <span className="text-[9px] font-black uppercase tracking-wide leading-tight truncate">Περίοδος</span>
              </div>
            )}
            <button
              type="button"
              onClick={() => setSidebarCollapsed((c) => !c)}
              className="shrink-0 w-8 h-8 rounded-lg border border-slate-200 bg-slate-50 text-slate-500 flex items-center justify-center hover:bg-slate-100"
              title={sidebarCollapsed ? 'Εμφάνιση λίστας' : 'Σύμπτυξη'}
            >
              {sidebarCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
            </button>
          </div>
          {!sidebarCollapsed && (
            <div className="space-y-1.5">
              {spanningItems.map((item) => {
                const isSelected = selectedItem?.plan.id === item.plan.id;
                return (
                  <button
                    key={item.plan.id}
                    type="button"
                  onClick={() => onSelectItem?.(item)}
                    className={`w-full text-left rounded-lg border px-2 py-1.5 transition-all ${
                      isSelected
                        ? 'bg-[#060b00] text-white border-[#060b00]'
                        : 'bg-slate-50 border-slate-100 hover:bg-slate-100 hover:border-slate-200'
                    }`}
                  >
                    <div className="text-[10px] font-bold truncate leading-tight">{getOrderDisplayName(item.order)}</div>
                    <div className={`text-[9px] mt-0.5 truncate ${isSelected ? 'text-white/80' : 'text-slate-500'}`}>
                      {formatDeliveryWindow(item.plan)}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
      <div className="min-w-0 flex-1">
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
                  <DeliveryPill key={item.plan.id} item={item} isSelected={isSelected} />
                ))}
                {hiddenCount > 0 && (
                  <div className={`rounded-xl px-2 py-1 text-[10px] font-black ${isSelected ? 'bg-white/15 text-white/90' : 'bg-slate-200/60 text-slate-600'}`}>
                    +{hiddenCount} ακόμη
                  </div>
                )}
              </div>
            </button>
          );
        })}
        </div>
      </div>
    </div>
  );
}
