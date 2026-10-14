import React, { useState } from 'react';
import { Banknote, FilePlus2, Pencil, RotateCcw, Tag, Undo2, X } from 'lucide-react';
import {
  CONSIGNMENT_EVENT_LABELS,
  CONSIGNMENT_RETURN_STATUS_LABELS,
  CONSIGNMENT_STATUS_LABELS,
  SETTLEMENT_STATUS_LABELS,
  canEditPendingConsignment,
  formatGreekDateOnly,
  formatGreekDateTime,
  formatGreekMoney,
  formatGreekNumber,
  nextConsignmentAction,
} from '../../../features/customerService';
import type { ConsignmentSettlement } from '../../../types';
import SkuColorizedText from '../../SkuColorizedText';
import ConsignmentSkuThumb from '../ConsignmentSkuThumb';
import type { ConsignmentBundle, ServiceController } from '../useServiceController';
import {
  ACTION_PRIMARY,
  ActionMenu,
  DrawerSection,
  GHOST_BUTTON,
  ROW_BUTTON,
  ServiceDrawer,
  StatusPill,
  SummaryGrid,
  TimelineList,
  type PillTone,
} from '../shared/serviceUi';
import { CONSIGNMENT_ACTION_META, runConsignmentAction } from './ConsignmentCard';

const STATUS_TONE: Record<string, PillTone> = {
  draft: 'slate', pending_handoff: 'violet', active: 'indigo', partially_settled: 'blue', completed: 'emerald', cancelled: 'slate',
};
const SETTLEMENT_TONE: Record<ConsignmentSettlement['status'], PillTone> = { due: 'rose', partial: 'amber', paid: 'emerald', reversed: 'slate' };
const HISTORY_PREVIEW = 6;

export default function ConsignmentDrawer({ ctl, bundle, onClose, onEdit }: { ctl: ServiceController; bundle: ConsignmentBundle; onClose: () => void; onEdit: () => void }) {
  const { entry, lines, settlements, returns, summary } = bundle;
  const [showAllHistory, setShowAllHistory] = useState(false);
  const action = nextConsignmentAction(entry, summary);
  const meta = action ? CONSIGNMENT_ACTION_META[action] : null;
  const isOpen = ['active', 'partially_settled'].includes(entry.status);
  const lineById = new Map(lines.map((line) => [line.id, line]));
  const liveSettlements = settlements.filter((item) => item.status !== 'reversed').sort((a, b) => b.sold_at.localeCompare(a.sold_at));
  const inspection = returns.filter((item) => item.status === 'inspection');
  const resolvedReturns = returns.filter((item) => item.status !== 'inspection' && item.status !== 'reversed');
  const events = (ctl.data?.consignmentEvents || [])
    .filter((event) => event.consignment_id === entry.id)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const sellerName = entry.seller_id ? ctl.sellerById.get(entry.seller_id)?.full_name : undefined;
  const lineLabel = (lineId: string) => {
    const line = lineById.get(lineId);
    return line ? `${line.product_sku}${line.variant_suffix || ''}` : '—';
  };

  const subtitleParts = [
    entry.handed_off_at ? `Παραδόθηκε ${formatGreekDateOnly(entry.handed_off_at)}` : 'Δεν έχει παραδοθεί',
    isOpen ? `επανέλεγχος ${formatGreekDateOnly(entry.review_due_at)}` : null,
    sellerName ? `πωλητής ${sellerName}` : null,
  ].filter(Boolean);

  return (
    <ServiceDrawer
      eyebrow={(
        <>
          <span className="font-mono">{entry.code}</span>
          <StatusPill tone={STATUS_TONE[entry.status]}>{CONSIGNMENT_STATUS_LABELS[entry.status]}</StatusPill>
          {summary.overdue && <StatusPill tone="rose">Εκπρόθεσμη</StatusPill>}
        </>
      )}
      title={ctl.customerName(entry.customer_id)}
      subtitle={subtitleParts.join(' · ')}
      headerActions={(
        <ActionMenu actions={[
          { key: 'edit', label: 'Επεξεργασία', icon: <Pencil size={14} />, onSelect: onEdit, hidden: !canEditPendingConsignment(entry.status, entry.handed_off_at) },
          { key: 'settle', label: 'Απολογισμός', icon: <Banknote size={14} />, onSelect: () => ctl.setOperation({ kind: 'settle', entry }), hidden: !isOpen || summary.pending === 0 || action === 'settle' },
          { key: 'cancel', label: 'Ακύρωση Παρακαταθήκης', icon: <X size={14} />, danger: true, onSelect: () => ctl.setOperation({ kind: 'cancel-consignment', entry }), hidden: !(ctl.isAdmin && entry.status === 'pending_handoff') },
        ]} />
      )}
      onClose={onClose}
      footer={meta && action ? (
        <button type="button" className={ACTION_PRIMARY} onClick={() => runConsignmentAction(ctl, bundle, action)}>
          {meta.icon} {meta.label}
        </button>
      ) : undefined}
    >
      <SummaryGrid items={[
        { label: 'Στον πελάτη', value: `${formatGreekNumber(summary.pending)} τεμ.` },
        { label: 'Αξία', value: formatGreekMoney(summary.value) },
        ...(ctl.canSeeCost ? [{ label: 'Κόστος', value: formatGreekMoney(summary.cost), tone: 'muted' as const }] : []),
        { label: 'Οφειλή', value: formatGreekMoney(summary.due), tone: summary.due > 0 ? 'alert' as const : 'muted' as const },
      ]} />
      {entry.notes && <p className="px-1 text-xs text-slate-500">{entry.notes}</p>}

      <DrawerSection title={`Τεμάχια · ${formatGreekNumber(lines.length)}`}>
        <ul className="-my-1 divide-y divide-slate-100">
          {lines.map((line) => {
            const product = ctl.productBySku.get(line.product_sku);
            const details = [
              `${formatGreekMoney(Number(line.locked_unit_price))}/τεμ.`,
              line.size_info ? `μέγ. ${line.size_info}` : null,
              line.sold_quantity > 0 ? `πουλήθηκαν ${formatGreekNumber(line.sold_quantity)}` : null,
              line.returned_quantity > 0 ? `επιστράφηκαν ${formatGreekNumber(line.returned_quantity)}` : null,
            ].filter(Boolean);
            return (
              <li key={line.id} className="grid grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-3 py-2.5">
                <ConsignmentSkuThumb product={product} sku={line.product_sku} />
                <div className="min-w-0">
                  <div className="truncate text-sm font-bold"><SkuColorizedText sku={line.product_sku} suffix={line.variant_suffix || ''} gender={product?.gender} /></div>
                  <div className="truncate text-[11px] text-slate-500">{details.join(' · ')}</div>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-14 text-right">
                    <div className="text-sm font-black tabular-nums text-slate-900">{formatGreekNumber(isOpen ? line.pending_quantity : line.quantity)}</div>
                    <div className="text-[10px] text-slate-400">{isOpen ? 'στον πελάτη' : 'τεμ.'}</div>
                  </div>
                  {isOpen ? (
                    <ActionMenu label={`Ενέργειες για ${line.product_sku}`} actions={[
                      { key: 'sale', label: 'Πώληση', icon: <Banknote size={14} />, onSelect: () => ctl.setOperation({ kind: 'sale', line }), hidden: line.pending_quantity === 0 },
                      { key: 'return', label: 'Επιστροφή', icon: <Undo2 size={14} />, onSelect: () => ctl.setOperation({ kind: 'return', line }), hidden: line.pending_quantity === 0 },
                      { key: 'price', label: 'Αλλαγή τιμής', icon: <Tag size={14} />, onSelect: () => ctl.setOperation({ kind: 'price', line }), hidden: !ctl.isAdmin },
                    ]} />
                  ) : <span className="w-9" />}
                </div>
              </li>
            );
          })}
        </ul>
      </DrawerSection>

      {inspection.length > 0 && (
        <DrawerSection title="Επιστροφές που περιμένουν έλεγχο">
          <ul className="-my-1 divide-y divide-slate-100">
            {inspection.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <div className="truncate text-sm font-bold text-slate-800">{formatGreekNumber(item.quantity)} × {lineLabel(item.consignment_line_id)}</div>
                  <div className="text-[11px] text-slate-500">Παραλήφθηκε {formatGreekDateOnly(item.received_at)}</div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button type="button" className={ROW_BUTTON} onClick={() => ctl.setOperation({ kind: 'route-return', item })}>Τακτοποίηση</button>
                  {ctl.isAdmin && <ActionMenu actions={[{ key: 'reverse', label: 'Αντιστροφή επιστροφής', icon: <RotateCcw size={14} />, danger: true, onSelect: () => ctl.setOperation({ kind: 'reverse-return', item }) }]} />}
                </div>
              </li>
            ))}
          </ul>
        </DrawerSection>
      )}

      {liveSettlements.length > 0 && (
        <DrawerSection title="Πωλήσεις & εισπράξεις">
          <ul className="-my-1 divide-y divide-slate-100">
            {liveSettlements.map((settlement) => {
              const outstanding = Number(settlement.total_amount) - Number(settlement.paid_amount);
              const canReverse = ctl.isAdmin && Number(settlement.paid_amount) === 0 && !settlement.legal_document_id;
              return (
                <li key={settlement.id} className="py-2.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <div className="min-w-0 truncate text-sm font-bold text-slate-800">{formatGreekNumber(settlement.quantity)} × {lineLabel(settlement.consignment_line_id)}</div>
                    <div className="shrink-0 text-sm font-black tabular-nums text-slate-900">{formatGreekMoney(Number(settlement.total_amount))}</div>
                  </div>
                  <div className="mt-1.5 flex items-center justify-between gap-3">
                    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-500">
                      <StatusPill tone={SETTLEMENT_TONE[settlement.status]}>{SETTLEMENT_STATUS_LABELS[settlement.status]}</StatusPill>
                      <span>{formatGreekDateOnly(settlement.sold_at)}</span>
                      {settlement.status === 'partial' && <span>υπόλοιπο {formatGreekMoney(outstanding)}</span>}
                      {settlement.legal_document_id && <span>με παραστατικό</span>}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {settlement.status !== 'paid' && <button type="button" className={ROW_BUTTON} onClick={() => ctl.setOperation({ kind: 'payment', settlement })}>Είσπραξη</button>}
                      <ActionMenu actions={[
                        { key: 'legal', label: 'Πρόχειρο παραστατικό', icon: <FilePlus2 size={14} />, onSelect: () => void ctl.createConsignmentLegalDraft(settlement.id), hidden: !!settlement.legal_document_id },
                        { key: 'reverse', label: 'Αντιστροφή πώλησης', icon: <RotateCcw size={14} />, danger: true, onSelect: () => ctl.setOperation({ kind: 'reverse-sale', settlement }), hidden: !canReverse },
                      ]} />
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </DrawerSection>
      )}

      {resolvedReturns.length > 0 && (
        <DrawerSection title="Επιστροφές που τακτοποιήθηκαν">
          <ul className="space-y-1.5 text-xs text-slate-600">
            {resolvedReturns.map((item) => (
              <li key={item.id} className="flex justify-between gap-3">
                <span className="min-w-0 truncate">{formatGreekNumber(item.quantity)} × {lineLabel(item.consignment_line_id)} · {CONSIGNMENT_RETURN_STATUS_LABELS[item.status]}</span>
                <span className="shrink-0 text-slate-400">{formatGreekDateOnly(item.resolved_at || item.received_at)}</span>
              </li>
            ))}
          </ul>
        </DrawerSection>
      )}

      <DrawerSection
        title="Ιστορικό"
        tone="muted"
        action={events.length > HISTORY_PREVIEW ? <button type="button" className={GHOST_BUTTON} onClick={() => setShowAllHistory((value) => !value)}>{showAllHistory ? 'Λιγότερα' : `Όλα (${events.length})`}</button> : undefined}
      >
        <TimelineList events={(showAllHistory ? events : events.slice(0, HISTORY_PREVIEW)).map((event) => ({
          id: event.id,
          label: CONSIGNMENT_EVENT_LABELS[event.event_type] || 'Κίνηση',
          at: formatGreekDateTime(event.created_at),
        }))} />
      </DrawerSection>
    </ServiceDrawer>
  );
}
