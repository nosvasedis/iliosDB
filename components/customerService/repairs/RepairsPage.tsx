import React, { useMemo, useState } from 'react';
import { Archive, ClipboardCheck, Columns3, History, Loader2, Plus, Users, Wrench } from 'lucide-react';
import type { RepairItem } from '../../../types';
import DesktopPageHeader from '../../DesktopPageHeader';
import { BTN_PRIMARY, PAGE_CONTAINER } from '../../ui/designTokens';
import {
  REPAIR_COLUMNS,
  REPAIR_EVENT_LABELS,
  REPAIR_STATUS_LABELS,
  formatGreekDateOnly,
  formatGreekDateTime,
  formatGreekMoney,
  formatGreekNumber,
  isRepairClosed,
  repairColumn,
  repairOutstanding,
  type RepairColumnKey,
} from '../../../features/customerService';
import { normalizedIncludes } from '../../../utils/greekSearch';
import { useServiceController } from '../useServiceController';
import OperationDialog from '../shared/OperationDialog';
import ServiceToolbar from '../shared/ServiceToolbar';
import { EmptyBoard, KanbanBoard, KanbanColumn, KpiChip, StatusPill, type PillTone } from '../shared/serviceUi';
import RepairCard from './RepairCard';
import RepairDrawer from './RepairDrawer';
import QuickRepairForm from './QuickRepairForm';

type View = 'board' | 'clients' | 'history' | 'activity';

const COLUMN_TONES: Record<Exclude<RepairColumnKey, 'history'>, PillTone> = {
  received: 'indigo', production: 'blue', quality: 'amber', ready: 'emerald', on_hold: 'slate',
};

const CLOSED_TONE: Record<string, PillTone> = { delivered: 'emerald', irreparable: 'rose', cancelled: 'slate' };

export default function RepairsPage() {
  const [form, setForm] = useState<{ previous: RepairItem | null } | null>(null);
  const ctl = useServiceController({ loadOrders: Boolean(form) });
  const [view, setView] = useState<View>('board');
  const [search, setSearch] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const allItems = ctl.data?.repairItems || [];
  const filtered = useMemo(() => allItems.filter((item) => {
    if (customerId && item.customer_id !== customerId) return false;
    if (!search.trim()) return true;
    return normalizedIncludes([item.code, ctl.customerName(item.customer_id), item.product_sku || '', item.description, item.source_order_id || ''].join(' '), search);
  }), [allItems, ctl, customerId, search]);

  const active = useMemo(() => filtered.filter((item) => !item.is_archived && !isRepairClosed(item)), [filtered]);

  const columns = useMemo(() => {
    const groups = new Map<RepairColumnKey, RepairItem[]>(REPAIR_COLUMNS.map((column) => [column.key, []]));
    for (const item of active) {
      const batch = ctl.liveRepairBatch(item);
      groups.get(repairColumn(item, !!batch, !!batch?.on_hold))?.push(item);
    }
    // Οι παλαιότερες πρώτα: αυτές περιμένουν περισσότερο.
    return REPAIR_COLUMNS.map((column) => ({ ...column, items: (groups.get(column.key) || []).sort((a, b) => a.created_at.localeCompare(b.created_at)) }));
  }, [active, ctl]);

  const history = useMemo(
    () => filtered
      .filter((item) => (showArchived ? item.is_archived : !item.is_archived && isRepairClosed(item)))
      .sort((a, b) => (b.delivered_at || b.updated_at).localeCompare(a.delivered_at || a.updated_at)),
    [filtered, showArchived],
  );

  const byClient = useMemo(() => {
    const groups = new Map<string, RepairItem[]>();
    for (const item of active) {
      if (!groups.has(item.customer_id)) groups.set(item.customer_id, []);
      groups.get(item.customer_id)!.push(item);
    }
    return [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [active]);

  const activity = useMemo(() => {
    const visible = new Map(filtered.map((item) => [item.id, item]));
    return [...(ctl.data?.repairEvents || [])]
      .filter((event) => visible.has(event.repair_item_id))
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, 150)
      .map((event) => ({ event, item: visible.get(event.repair_item_id)! }));
  }, [ctl.data?.repairEvents, filtered]);

  const kpis = useMemo(() => {
    const live = allItems.filter((item) => !item.is_archived && !isRepairClosed(item));
    const count = (key: RepairColumnKey) => live.filter((item) => { const batch = ctl.liveRepairBatch(item); return repairColumn(item, !!batch, !!batch?.on_hold) === key; }).length;
    return {
      active: live.length,
      quality: count('quality'),
      ready: count('ready'),
      outstanding: allItems.filter((item) => !item.is_archived).reduce((sum, item) => sum + repairOutstanding(ctl.chargeByRepairId.get(item.id)), 0),
    };
  }, [allItems, ctl]);

  const selected = allItems.find((item) => item.id === selectedId) || null;
  const openRework = (item: RepairItem) => { setSelectedId(null); setForm({ previous: item }); };
  const renderCard = (item: RepairItem) => <RepairCard key={item.id} ctl={ctl} item={item} onOpen={() => setSelectedId(item.id)} onRework={openRework} />;

  return (
    <div className={`${PAGE_CONTAINER} min-h-full bg-slate-50 px-3 py-4 sm:px-5 lg:px-7`}>
      <div className="mx-auto flex w-full max-w-[1700px] flex-col gap-4">
        <DesktopPageHeader
          icon={Wrench}
          title="Επισκευές"
          subtitle="Από την παραλαβή μέχρι την παράδοση στον πελάτη."
          tail={<button type="button" className={BTN_PRIMARY} onClick={() => setForm({ previous: null })}><Plus size={17} /> Νέα παραλαβή</button>}
        />

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <KpiChip label="Σε εξέλιξη" value={formatGreekNumber(kpis.active)} tone="blue" />
          <KpiChip label="Περιμένουν έλεγχο" value={formatGreekNumber(kpis.quality)} tone={kpis.quality > 0 ? 'amber' : 'slate'} />
          <KpiChip label="Έτοιμες για παράδοση" value={formatGreekNumber(kpis.ready)} tone={kpis.ready > 0 ? 'emerald' : 'slate'} />
          <KpiChip label="Ανείσπρακτα" value={formatGreekMoney(kpis.outstanding)} tone={kpis.outstanding > 0 ? 'rose' : 'slate'} alert={kpis.outstanding > 0} />
        </div>

        <ServiceToolbar<View>
          search={search}
          onSearch={setSearch}
          searchPlaceholder="Πελάτης, κωδικός, SKU, βλάβη…"
          customers={ctl.customers}
          customerId={customerId}
          onCustomer={setCustomerId}
          view={view}
          onView={setView}
          views={[
            { value: 'board', label: 'Πίνακας', icon: <Columns3 size={13} /> },
            { value: 'clients', label: 'Ανά πελάτη', icon: <Users size={13} /> },
            { value: 'history', label: 'Ιστορικό', icon: <History size={13} /> },
            { value: 'activity', label: 'Κινήσεις', icon: <ClipboardCheck size={13} /> },
          ]}
        />

        {ctl.isLoading ? (
          <div className="flex min-h-64 items-center justify-center text-slate-500"><Loader2 className="mr-2 animate-spin" /> Φόρτωση…</div>
        ) : ctl.error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm font-bold text-rose-700">Δεν ήταν δυνατή η φόρτωση: {ctl.error.message}</div>
        ) : allItems.length === 0 ? (
          <EmptyBoard
            icon={<Wrench size={32} />}
            title="Καμία επισκευή ακόμη"
            text="Καταχωρίστε ένα κόσμημα που φέρνει ο πελάτης· μπαίνει αυτόματα στην Παραγωγή και το παρακολουθείτε μέχρι την παράδοση."
            action={<button type="button" className={BTN_PRIMARY} onClick={() => setForm({ previous: null })}><Plus size={16} /> Πρώτη παραλαβή</button>}
          />
        ) : view === 'board' ? (
          <KanbanBoard>
            {columns.map((column) => (
              <KanbanColumn key={column.key} title={column.label} hint={column.hint} tone={COLUMN_TONES[column.key as Exclude<RepairColumnKey, 'history'>]} items={column.items} renderItem={renderCard} />
            ))}
          </KanbanBoard>
        ) : view === 'clients' ? (
          <div className="space-y-3">
            {byClient.length === 0 && <p className="py-10 text-center text-sm text-slate-400">Καμία επισκευή σε εξέλιξη.</p>}
            {byClient.map(([id, items]) => (
              <section key={id} className="rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
                <h3 className="mb-3 px-1 font-black text-slate-900">{ctl.customerName(id)} <span className="text-xs font-bold text-slate-400">· {formatGreekNumber(items.length)} σε εξέλιξη</span></h3>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">{items.map(renderCard)}</div>
              </section>
            ))}
          </div>
        ) : view === 'history' ? (
          <div className="space-y-2">
            <label className="inline-flex cursor-pointer items-center gap-2 px-1 text-xs font-bold text-slate-500">
              <input type="checkbox" className="accent-[#060b00]" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} />
              <Archive size={13} /> Μόνο αρχειοθετημένες
            </label>
            <div className="divide-y divide-slate-100 rounded-2xl border border-slate-100 bg-white shadow-sm">
              {history.length === 0 && <p className="p-8 text-center text-sm text-slate-400">Δεν υπάρχουν κλεισμένες επισκευές.</p>}
              {history.map((item) => (
                <button key={item.id} type="button" className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50" onClick={() => setSelectedId(item.id)}>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-black text-slate-800">{ctl.customerName(item.customer_id)} <span className="font-mono text-[11px] font-bold text-slate-400">{item.code}</span></div>
                    <div className="truncate text-xs text-slate-500">{item.product_sku ? `${item.product_sku}${item.variant_suffix || ''} · ` : ''}{item.description}</div>
                  </div>
                  <StatusPill tone={CLOSED_TONE[item.status] || 'slate'}>{REPAIR_STATUS_LABELS[item.status]}</StatusPill>
                  <span className="hidden w-24 shrink-0 text-right text-[11px] font-bold text-slate-400 sm:block">{formatGreekDateOnly(item.delivered_at || item.updated_at)}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 rounded-2xl border border-slate-100 bg-white shadow-sm">
            {activity.length === 0 && <p className="p-8 text-center text-sm text-slate-400">Δεν υπάρχουν κινήσεις.</p>}
            {activity.map(({ event, item }) => (
              <button key={event.id} type="button" className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50" onClick={() => setSelectedId(item.id)}>
                <div className="min-w-0">
                  <div className="text-sm font-black text-slate-800">{REPAIR_EVENT_LABELS[event.event_type] || 'Κίνηση'}</div>
                  <div className="truncate text-xs text-slate-500">{ctl.customerName(item.customer_id)} · <span className="font-mono">{item.code}</span></div>
                </div>
                <div className="shrink-0 text-[11px] font-bold text-slate-400">{formatGreekDateTime(event.created_at)}</div>
              </button>
            ))}
          </div>
        )}
      </div>

      {selected && <RepairDrawer ctl={ctl} item={selected} onClose={() => setSelectedId(null)} onRework={openRework} />}
      {form && <QuickRepairForm ctl={ctl} presetCustomerId={form.previous ? undefined : customerId || undefined} previousRepairItem={form.previous} onClose={() => setForm(null)} />}
      <OperationDialog ctl={ctl} />
    </div>
  );
}
