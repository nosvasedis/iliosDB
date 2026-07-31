import React, { useMemo, useState } from 'react';
import { CalendarRange, ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from 'lucide-react';
import { CalendarDayEvent, EnrichedDeliveryItem } from '../../types';
import { formatDeliveryWindow, getOrderDisplayName } from '../../utils/deliveryLabels';
import { getCalendarDayEvents } from '../../utils/namedays';

interface Props {
  monthDate: Date;
  onMonthChange: (date: Date) => void;
  items: EnrichedDeliveryItem[];
  majorEvents?: CalendarDayEvent[];
  selectedDate: Date;
  selectedItem?: EnrichedDeliveryItem | null;
  onSelectDate: (date: Date) => void;
  onSelectItem?: (item: EnrichedDeliveryItem) => void;
  defaultCollapsed?: boolean;
}

function dateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function EventDot({ events, isSelected }: { events: CalendarDayEvent[]; isSelected: boolean }) {
  if (events.length === 0) return null;
  const first = events[0];
  const extra = events.length - 1;
  const title = extra > 0 ? `${first.title} (+${extra})` : first.title;

  return (
    <div
      className={`truncate text-[9px] font-medium leading-tight ${isSelected ? 'text-emerald-800/70' : 'text-slate-400'}`}
      title={events.map((e) => e.title).join(', ')}
    >
      <span
        className={`inline-block w-1.5 h-1.5 rounded-full mr-1 align-middle ${
          isSelected ? 'bg-emerald-600/50' : 'bg-sky-300'
        }`}
      />
      {title}
    </div>
  );
}

function DeliveryPill({
  item,
  isSelected,
  onClick,
}: {
  item: EnrichedDeliveryItem;
  isSelected: boolean;
  onClick?: () => void;
}) {
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
    ? 'bg-emerald-700 text-white border-emerald-700'
    : `${readinessTone} font-bold`;

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      className={`w-full rounded-lg px-1.5 py-1 text-[9px] truncate border text-left ${tone}`}
      title={getOrderDisplayName(item.order)}
    >
      {getOrderDisplayName(item.order)}
    </button>
  );
}

export default function DeliveryCalendarGrid({
  monthDate,
  onMonthChange,
  items,
  majorEvents = [],
  selectedDate,
  selectedItem = null,
  onSelectDate,
  onSelectItem,
  defaultCollapsed = false,
}: Props) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const { spanningItems, singleDayItems } = useMemo(() => {
    const viewStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1).getTime();
    const viewEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0, 23, 59, 59).getTime();
    const spanning: EnrichedDeliveryItem[] = [];
    const single: EnrichedDeliveryItem[] = [];

    items.forEach((item) => {
      const windowStart = item.window_start ? new Date(item.window_start).getTime() : null;
      const windowEnd = item.window_end ? new Date(item.window_end).getTime() : null;
      const isSpanningMode =
        item.plan.planning_mode === 'month'
        || item.plan.planning_mode === 'custom_period'
        || item.plan.planning_mode === 'holiday_anchor';
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
  const hasSpanning = spanningItems.length > 0;

  return (
    <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-b border-slate-100">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onMonthChange(new Date(monthDate.getFullYear(), monthDate.getMonth() - 1, 1))}
            className="w-8 h-8 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-100"
            aria-label="Προηγούμενος μήνας"
          >
            <ChevronLeft size={16} />
          </button>
          <div className="min-w-[9rem] text-center text-sm font-bold text-[#060b00] capitalize">
            {monthDate.toLocaleDateString('el-GR', { month: 'long', year: 'numeric' })}
          </div>
          <button
            type="button"
            onClick={() => onMonthChange(new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 1))}
            className="w-8 h-8 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-100"
            aria-label="Επόμενος μήνας"
          >
            <ChevronRight size={16} />
          </button>
        </div>
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-slate-500 hover:bg-slate-50"
        >
          Ημερολόγιο
          {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        </button>
      </div>

      {!collapsed && (
        <div className="p-3 flex gap-2">
          {hasSpanning && (
            <div
              className={`shrink-0 flex flex-col border-r border-slate-100 transition-[width] duration-200 overflow-hidden ${
                sidebarCollapsed ? 'w-9 pr-0' : 'w-[6.5rem] pr-2'
              }`}
            >
              <div className={`flex items-center gap-1 min-h-[28px] mb-2 ${sidebarCollapsed ? 'justify-center' : 'justify-between'}`}>
                {!sidebarCollapsed && (
                  <div className="flex items-center gap-1 text-slate-500 min-w-0">
                    <CalendarRange size={12} className="shrink-0" />
                    <span className="text-[9px] font-black uppercase tracking-wide leading-tight truncate">
                      Περίοδος
                    </span>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setSidebarCollapsed((c) => !c)}
                  className="shrink-0 w-7 h-7 rounded-lg border border-slate-200 bg-slate-50 text-slate-500 flex items-center justify-center hover:bg-slate-100"
                  title={sidebarCollapsed ? 'Εμφάνιση λίστας' : 'Σύμπτυξη'}
                >
                  {sidebarCollapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
                </button>
              </div>
              {!sidebarCollapsed && (
                <div className="space-y-1">
                  {spanningItems.map((item) => {
                    const isSelected = selectedItem?.plan.id === item.plan.id;
                    return (
                      <button
                        key={item.plan.id}
                        type="button"
                        onClick={() => onSelectItem?.(item)}
                        className={`w-full text-left rounded-lg border px-1.5 py-1 transition-all ${
                          isSelected
                            ? 'bg-[#060b00] text-white border-[#060b00]'
                            : 'bg-slate-50 border-slate-100 hover:bg-slate-100'
                        }`}
                      >
                        <div className="text-[9px] font-bold truncate leading-tight">
                          {getOrderDisplayName(item.order)}
                        </div>
                        <div className={`text-[8px] mt-0.5 truncate ${isSelected ? 'text-white/80' : 'text-slate-500'}`}>
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
            <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-black uppercase tracking-wide text-slate-400 mb-1">
              {['Δευ', 'Τρι', 'Τετ', 'Πεμ', 'Παρ', 'Σαβ', 'Κυρ'].map((label) => (
                <div key={label} className="py-1">{label}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {monthDays.map((day) => {
                const key = dateKey(day);
                const dayItems = itemsByDate.get(key) || [];
                const dayEvents = eventsByDate.get(key) || [];
                const isCurrentMonth = day.getMonth() === monthDate.getMonth();
                const isSelected = key === dateKey(selectedDate);
                const isToday = key === todayKey;
                const visibleItems = dayItems.slice(0, 2);
                const hiddenCount = Math.max(0, dayItems.length - visibleItems.length);

                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => onSelectDate(day)}
                    className={`min-h-[72px] rounded-xl border p-1.5 text-left transition-all ${
                      isSelected
                        ? 'bg-emerald-50 text-[#060b00] border-emerald-200 ring-2 ring-emerald-500/20'
                        : isToday
                          ? 'bg-white border-emerald-200 hover:bg-emerald-50/40'
                          : isCurrentMonth
                            ? 'bg-slate-50/80 border-slate-100 hover:bg-white hover:border-slate-200'
                            : 'bg-slate-50/40 border-transparent text-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={`text-xs font-bold ${
                          isToday && !isSelected ? 'text-emerald-700' : ''
                        }`}
                      >
                        {day.getDate()}
                      </span>
                      {isToday && isCurrentMonth && (
                        <span className="text-[8px] font-black uppercase text-emerald-600">Σήμ.</span>
                      )}
                    </div>
                    <div className="mt-1 space-y-0.5">
                      {visibleItems.map((item) => (
                        <DeliveryPill
                          key={item.plan.id}
                          item={item}
                          isSelected={selectedItem?.plan.id === item.plan.id}
                          onClick={() => {
                            onSelectDate(day);
                            onSelectItem?.(item);
                          }}
                        />
                      ))}
                      <EventDot events={dayEvents} isSelected={isSelected} />
                      {hiddenCount > 0 && (
                        <div className="text-[9px] font-bold text-slate-500 px-0.5">
                          +{hiddenCount}
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
