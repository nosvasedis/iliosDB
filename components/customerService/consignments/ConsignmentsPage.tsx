import React, { useMemo, useState } from 'react';
import { Boxes, ClipboardCheck, Columns3, HandHeart, Layers, Loader2, Plus, ShieldCheck, Users } from 'lucide-react';
import DesktopPageHeader from '../../DesktopPageHeader';
import { BTN_PRIMARY, PAGE_CONTAINER } from '../../ui/designTokens';
import {
  CONSIGNMENT_COLUMNS,
  CONSIGNMENT_EVENT_LABELS,
  consignmentColumn,
  formatGreekDateTime,
  formatGreekMoney,
  formatGreekNumber,
  type ConsignmentColumnKey,
} from '../../../features/customerService';
import { normalizedIncludes } from '../../../utils/greekSearch';
import BulkConsignmentWorkbench from '../BulkConsignmentWorkbench';
import ConsignmentEditModal from '../ConsignmentEditModal';
import { useServiceController, type ConsignmentBundle } from '../useServiceController';
import OperationDialog from '../shared/OperationDialog';
import ServiceToolbar from '../shared/ServiceToolbar';
import { ActionMenu, EmptyBoard, KanbanBoard, KanbanColumn, KpiChip, type PillTone } from '../shared/serviceUi';
import ConsignmentCard from './ConsignmentCard';
import ConsignmentDrawer from './ConsignmentDrawer';
import QuickConsignmentForm from './QuickConsignmentForm';

type View = 'board' | 'clients' | 'activity';

const COLUMN_TONES: Record<ConsignmentColumnKey, PillTone> = { handoff: 'violet', at_customer: 'indigo', to_collect: 'rose', closed: 'emerald' };

function sortForColumn(key: ConsignmentColumnKey, items: ConsignmentBundle[]): ConsignmentBundle[] {
  const copy = [...items];
  if (key === 'at_customer') return copy.sort((a, b) => Number(b.summary.overdue) - Number(a.summary.overdue) || (a.entry.review_due_at || '').localeCompare(b.entry.review_due_at || ''));
  if (key === 'to_collect') return copy.sort((a, b) => b.summary.due - a.summary.due);
  return copy.sort((a, b) => (b.entry.updated_at || b.entry.created_at).localeCompare(a.entry.updated_at || a.entry.created_at));
}

export default function ConsignmentsPage() {
  const [showForm, setShowForm] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const ctl = useServiceController({ loadOrders: showForm || showBulk });
  const [view, setView] = useState<View>('board');
  const [search, setSearch] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const filtered = useMemo(() => ctl.consignmentBundles.filter(({ entry, lines, summary }) => {
    if (customerId && entry.customer_id !== customerId) return false;
    if (overdueOnly && !summary.overdue) return false;
    if (!search.trim()) return true;
    const haystack = [entry.code, ctl.customerName(entry.customer_id), entry.source_order_id || '', entry.notes || '', ...lines.map((line) => `${line.product_sku}${line.variant_suffix || ''}`)].join(' ');
    return normalizedIncludes(haystack, search);
  }), [ctl, customerId, overdueOnly, search]);

  const columns = useMemo(() => {
    const groups = new Map<ConsignmentColumnKey, ConsignmentBundle[]>(CONSIGNMENT_COLUMNS.map((column) => [column.key, []]));
    for (const bundle of filtered) groups.get(consignmentColumn(bundle.entry, bundle.summary))!.push(bundle);
    return CONSIGNMENT_COLUMNS.map((column) => ({ ...column, items: sortForColumn(column.key, groups.get(column.key) || []) }));
  }, [filtered]);

  const kpis = useMemo(() => {
    const open = ctl.consignmentBundles.filter((bundle) => bundle.entry.status !== 'cancelled');
    return {
      pieces: open.reduce((sum, bundle) => sum + (['active', 'partially_settled'].includes(bundle.entry.status) ? bundle.summary.pending : 0), 0),
      value: open.reduce((sum, bundle) => sum + (['active', 'partially_settled'].includes(bundle.entry.status) ? bundle.summary.value : 0), 0),
      due: open.reduce((sum, bundle) => sum + bundle.summary.due, 0),
      overdue: open.filter((bundle) => bundle.summary.overdue).length,
    };
  }, [ctl.consignmentBundles]);

  const byClient = useMemo(() => {
    const groups = new Map<string, ConsignmentBundle[]>();
    for (const bundle of filtered) {
      if (bundle.entry.status === 'cancelled') continue;
      if (!groups.has(bundle.entry.customer_id)) groups.set(bundle.entry.customer_id, []);
      groups.get(bundle.entry.customer_id)!.push(bundle);
    }
    return [...groups.entries()]
      .map(([id, bundles]) => ({
        id,
        bundles: bundles.sort((a, b) => b.entry.created_at.localeCompare(a.entry.created_at)),
        pending: bundles.reduce((sum, bundle) => sum + (['active', 'partially_settled'].includes(bundle.entry.status) ? bundle.summary.pending : 0), 0),
        value: bundles.reduce((sum, bundle) => sum + (['active', 'partially_settled'].includes(bundle.entry.status) ? bundle.summary.value : 0), 0),
        due: bundles.reduce((sum, bundle) => sum + bundle.summary.due, 0),
      }))
      .sort((a, b) => b.due - a.due || b.pending - a.pending);
  }, [filtered]);

  const activity = useMemo(() => {
    const visible = new Set(filtered.map((bundle) => bundle.entry.id));
    const byId = new Map(ctl.consignmentBundles.map((bundle) => [bundle.entry.id, bundle.entry]));
    return [...(ctl.data?.consignmentEvents || [])]
      .filter((event) => visible.has(event.consignment_id))
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, 150)
      .map((event) => ({ event, entry: byId.get(event.consignment_id) }));
  }, [ctl.consignmentBundles, ctl.data?.consignmentEvents, filtered]);

  const selected = ctl.consignmentBundles.find((bundle) => bundle.entry.id === selectedId) || null;
  const editing = ctl.consignmentBundles.find((bundle) => bundle.entry.id === editingId) || null;
  const renderCard = (bundle: ConsignmentBundle) => <ConsignmentCard key={bundle.entry.id} ctl={ctl} bundle={bundle} onOpen={() => setSelectedId(bundle.entry.id)} />;
  const hasAny = ctl.consignmentBundles.length > 0;

  return (
    <div className={`${PAGE_CONTAINER} min-h-full bg-slate-50 px-3 py-4 sm:px-5 lg:px-7`}>
      <div className="mx-auto flex w-full max-w-[1700px] flex-col gap-4">
        <DesktopPageHeader
          icon={HandHeart}
          title="Παρακαταθήκες"
          subtitle="Τεμάχια σε πελάτες, που πληρώνονται όταν πουληθούν."
          tail={(
            <>
              <button type="button" className={BTN_PRIMARY} onClick={() => setShowForm(true)}><Plus size={17} /> Νέα Παρακαταθήκη</button>
              <ActionMenu actions={[
                { key: 'bulk', label: 'Μαζική δημιουργία (πολλοί πελάτες)', icon: <Layers size={14} />, onSelect: () => setShowBulk(true) },
                { key: 'check', label: 'Έλεγχος συμφωνίας αποθήκης', icon: <ShieldCheck size={14} />, onSelect: () => void ctl.checkConsignmentInventory(), hidden: !ctl.canSeeCost },
              ]} />
            </>
          )}
        />

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <KpiChip label="Τεμάχια σε πελάτες" value={formatGreekNumber(kpis.pieces)} tone="indigo" />
          <KpiChip label="Αξία σε πελάτες" value={formatGreekMoney(kpis.value)} tone="blue" />
          <KpiChip label="Ανείσπρακτα" value={formatGreekMoney(kpis.due)} tone={kpis.due > 0 ? 'rose' : 'slate'} />
          <KpiChip label="Εκπρόθεσμες" value={formatGreekNumber(kpis.overdue)} tone={kpis.overdue > 0 ? 'amber' : 'slate'} onClick={kpis.overdue > 0 || overdueOnly ? () => setOverdueOnly((value) => !value) : undefined} active={overdueOnly} />
        </div>

        <ServiceToolbar<View>
          search={search}
          onSearch={setSearch}
          searchPlaceholder="Πελάτης, κωδικός, SKU…"
          customers={ctl.customers}
          customerId={customerId}
          onCustomer={setCustomerId}
          view={view}
          onView={setView}
          views={[
            { value: 'board', label: 'Πίνακας', icon: <Columns3 size={13} /> },
            { value: 'clients', label: 'Ανά πελάτη', icon: <Users size={13} /> },
            { value: 'activity', label: 'Κινήσεις', icon: <ClipboardCheck size={13} /> },
          ]}
        />

        {ctl.isLoading ? (
          <div className="flex min-h-64 items-center justify-center text-slate-500"><Loader2 className="mr-2 animate-spin" /> Φόρτωση…</div>
        ) : ctl.error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm font-bold text-rose-700">Δεν ήταν δυνατή η φόρτωση: {ctl.error.message}</div>
        ) : !hasAny ? (
          <EmptyBoard
            icon={<Boxes size={32} />}
            title="Καμία Παρακαταθήκη ακόμη"
            text="Δώστε τεμάχια σε έναν πελάτη για να τα πουλήσει· εδώ θα βλέπετε τι έχει, τι πούλησε και τι σας οφείλει."
            action={<button type="button" className={BTN_PRIMARY} onClick={() => setShowForm(true)}><Plus size={16} /> Πρώτη Παρακαταθήκη</button>}
          />
        ) : view === 'board' ? (
          <KanbanBoard>
            {columns.map((column) => (
              <KanbanColumn key={column.key} title={column.label} hint={column.hint} tone={COLUMN_TONES[column.key]} items={column.items} renderItem={renderCard} emptyText={column.key === 'handoff' ? 'Όλα παραδόθηκαν' : undefined} />
            ))}
          </KanbanBoard>
        ) : view === 'clients' ? (
          <div className="space-y-3">
            {byClient.length === 0 && <p className="py-10 text-center text-sm text-slate-400">Δεν βρέθηκαν αποτελέσματα.</p>}
            {byClient.map((group) => (
              <section key={group.id} className="rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2 px-1">
                  <h3 className="font-black text-slate-900">{ctl.customerName(group.id)}</h3>
                  <div className="flex flex-wrap gap-3 text-xs">
                    <span className="font-bold text-indigo-700">{formatGreekNumber(group.pending)} τεμ. · {formatGreekMoney(group.value)}</span>
                    {group.due > 0 && <span className="font-black text-rose-600">Οφείλει {formatGreekMoney(group.due)}</span>}
                  </div>
                </div>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">{group.bundles.map(renderCard)}</div>
              </section>
            ))}
          </div>
        ) : (
          <div className="divide-y divide-slate-100 rounded-2xl border border-slate-100 bg-white shadow-sm">
            {activity.length === 0 && <p className="p-8 text-center text-sm text-slate-400">Δεν υπάρχουν κινήσεις.</p>}
            {activity.map(({ event, entry }) => (
              <button key={event.id} type="button" className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50" onClick={() => setSelectedId(event.consignment_id)}>
                <div className="min-w-0">
                  <div className="text-sm font-black text-slate-800">{CONSIGNMENT_EVENT_LABELS[event.event_type] || 'Κίνηση'}</div>
                  <div className="truncate text-xs text-slate-500">{ctl.customerName(entry?.customer_id)} · <span className="font-mono">{entry?.code}</span></div>
                </div>
                <div className="shrink-0 text-[11px] font-bold text-slate-400">{formatGreekDateTime(event.created_at)}</div>
              </button>
            ))}
          </div>
        )}
      </div>

      {selected && (
        <ConsignmentDrawer ctl={ctl} bundle={selected} onClose={() => setSelectedId(null)} onEdit={() => { setSelectedId(null); setEditingId(selected.entry.id); }} />
      )}
      {showForm && (
        <QuickConsignmentForm ctl={ctl} presetCustomerId={customerId || undefined} onClose={() => setShowForm(false)} onOpenBulk={() => { setShowForm(false); setShowBulk(true); }} />
      )}
      {showBulk && (
        <BulkConsignmentWorkbench
          customers={ctl.customers}
          products={ctl.products}
          orders={ctl.orders}
          existingOrderLineIds={ctl.existingOrderLineIds}
          warehouses={ctl.sourceWarehouses}
          defaultSellerId={ctl.defaultSellerId}
          canSeeCost={ctl.canSeeCost}
          onClose={() => setShowBulk(false)}
          onSubmit={async (groups) => { if (await ctl.createConsignments(groups, false)) setShowBulk(false); }}
          saving={ctl.actions.createBulkConsignments.isPending}
        />
      )}
      {editing && (
        <ConsignmentEditModal
          entry={editing.entry}
          lines={editing.lines}
          customers={ctl.customers}
          products={ctl.products}
          warehouses={ctl.sourceWarehouses}
          canSeeCost={ctl.canSeeCost}
          saving={ctl.actions.updatePendingConsignment.isPending}
          onClose={() => setEditingId(null)}
          onSubmit={async (input) => {
            if (await ctl.safeAction(() => ctl.actions.updatePendingConsignment.mutateAsync(input), 'Η Παρακαταθήκη ενημερώθηκε.')) setEditingId(null);
          }}
        />
      )}
      <OperationDialog ctl={ctl} />
    </div>
  );
}
