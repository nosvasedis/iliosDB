import React, { useState } from 'react';
import { Banknote, FilePlus2, Pencil, RotateCcw, Tag, Undo2, Wallet, X } from 'lucide-react';
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
import { ActionMenu, DrawerSection, GHOST_BUTTON, ServiceDrawer, StatusPill, TimelineList, type PillTone } from '../shared/serviceUi';
import { CONSIGNMENT_ACTION_META, runConsignmentAction } from './ConsignmentCard';

const STATUS_TONE: Record<string, PillTone> = {
  draft: 'slate', pending_handoff: 'violet', active: 'indigo', partially_settled: 'blue', completed: 'emerald', cancelled: 'slate',
};
const SETTLEMENT_TONE: Record<ConsignmentSettlement['status'], PillTone> = { due: 'rose', partial: 'amber', paid: 'emerald', reversed: 'slate' };

function Stat({ label, value, tone = 'text-slate-900' }: { label: string; value: React.ReactNode; tone?: string }) {
  return (
    <div className="rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-100">
      <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</div>
      <div className={`mt-0.5 text-base font-black ${tone}`}>{value}</div>
    </div>
  );
}

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
    return line ? `${line.product_sku}${line.variant_suffix || ''}` : '';
  };

  return (
    <ServiceDrawer
      title={entry.code}
      badges={(
        <>
          <StatusPill tone={STATUS_TONE[entry.status]}>{CONSIGNMENT_STATUS_LABELS[entry.status]}</StatusPill>
          {summary.overdue && <StatusPill tone="rose">Εκπρόθεσμη</StatusPill>}
        </>
      )}
      subtitle={<><span className="font-bold text-slate-800">{ctl.customerName(entry.customer_id)}</span>{sellerName ? <span className="text-slate-500"> · πωλητής {sellerName}</span> : null}</>}
      headerActions={(
        <ActionMenu actions={[
          { key: 'edit', label: 'Επεξεργασία', icon: <Pencil size={14} />, onSelect: onEdit, hidden: !canEditPendingConsignment(entry.status, entry.handed_off_at) },
          { key: 'settle', label: 'Απολογισμός', icon: <Banknote size={14} />, onSelect: () => ctl.setOperation({ kind: 'settle', entry }), hidden: !isOpen || summary.pending === 0 },
          { key: 'cancel', label: 'Ακύρωση Παρακαταθήκης', icon: <X size={14} />, danger: true, onSelect: () => ctl.setOperation({ kind: 'cancel-consignment', entry }), hidden: !(ctl.isAdmin && entry.status === 'pending_handoff') },
        ]} />
      )}
      onClose={onClose}
      footer={meta && action ? (
        <button type="button" className={`inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-black transition ${meta.className}`} onClick={() => runConsignmentAction(ctl, bundle, action)}>
          {meta.icon} {meta.label}
        </button>
      ) : undefined}
    >
      <div className={`grid gap-2 ${ctl.canSeeCost ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3'}`}>
        <Stat label="Στον πελάτη" value={`${formatGreekNumber(summary.pending)} τεμ.`} tone="text-indigo-700" />
        <Stat label="Αξία" value={formatGreekMoney(summary.value)} />
        {ctl.canSeeCost && <Stat label="Κόστος" value={formatGreekMoney(summary.cost)} tone="text-slate-500" />}
        <Stat label="Οφειλή" value={formatGreekMoney(summary.due)} tone={summary.due > 0 ? 'text-rose-600' : 'text-slate-400'} />
      </div>
      <p className="px-1 text-xs text-slate-500">
        Επανέλεγχος <strong className={summary.overdue ? 'text-rose-600' : 'text-slate-700'}>{formatGreekDateOnly(entry.review_due_at)}</strong>
        {entry.handed_off_at ? <> · παραδόθηκε {formatGreekDateOnly(entry.handed_off_at)}</> : null}
        {entry.notes ? <> · {entry.notes}</> : null}
      </p>

      <DrawerSection title={`Τεμάχια (${formatGreekNumber(lines.length)})`}>
        <div className="divide-y divide-slate-100">
          {lines.map((line) => {
            const product = ctl.productBySku.get(line.product_sku);
            return (
              <div key={line.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                <ConsignmentSkuThumb product={product} sku={line.product_sku} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-black"><SkuColorizedText sku={line.product_sku} suffix={line.variant_suffix || ''} gender={product?.gender} /></div>
                  <div className="mt-0.5 flex flex-wrap gap-x-2 text-[11px] text-slate-500">
                    <span>{formatGreekMoney(Number(line.locked_unit_price))}/τεμ.</span>
                    {line.size_info && <span>μέγ. {line.size_info}</span>}
                    {line.sold_quantity > 0 && <span className="text-emerald-700">πουλήθηκαν {formatGreekNumber(line.sold_quantity)}</span>}
                    {line.returned_quantity > 0 && <span className="text-amber-700">επιστράφηκαν {formatGreekNumber(line.returned_quantity)}</span>}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-black text-indigo-700">{formatGreekNumber(isOpen ? line.pending_quantity : line.quantity)}</div>
                  <div className="text-[9px] font-bold uppercase text-slate-400">{isOpen ? 'στον πελάτη' : 'τεμ.'}</div>
                </div>
                {isOpen && (
                  <ActionMenu actions={[
                    { key: 'sale', label: 'Πώληση', icon: <Banknote size={14} />, onSelect: () => ctl.setOperation({ kind: 'sale', line }), hidden: line.pending_quantity === 0 },
                    { key: 'return', label: 'Επιστροφή', icon: <Undo2 size={14} />, onSelect: () => ctl.setOperation({ kind: 'return', line }), hidden: line.pending_quantity === 0 },
                    { key: 'price', label: 'Αλλαγή τιμής', icon: <Tag size={14} />, onSelect: () => ctl.setOperation({ kind: 'price', line }), hidden: !ctl.isAdmin },
                  ]} />
                )}
              </div>
            );
          })}
        </div>
      </DrawerSection>

      {inspection.length > 0 && (
        <DrawerSection title="Επιστροφές σε έλεγχο">
          <div className="space-y-2">
            {inspection.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-2 rounded-xl bg-amber-50 p-2.5">
                <div className="text-xs"><span className="font-black text-amber-900">{formatGreekNumber(item.quantity)} × {lineLabel(item.consignment_line_id)}</span><span className="text-amber-700"> · {formatGreekDateOnly(item.received_at)}</span></div>
                <div className="flex items-center gap-1">
                  <button type="button" className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-black text-white hover:bg-amber-600" onClick={() => ctl.setOperation({ kind: 'route-return', item })}>Τακτοποίηση</button>
                  {ctl.isAdmin && <ActionMenu actions={[{ key: 'reverse', label: 'Αντιστροφή επιστροφής', icon: <RotateCcw size={14} />, danger: true, onSelect: () => ctl.setOperation({ kind: 'reverse-return', item }) }]} />}
                </div>
              </div>
            ))}
          </div>
        </DrawerSection>
      )}

      {liveSettlements.length > 0 && (
        <DrawerSection title="Πωλήσεις & εισπράξεις">
          <div className="space-y-2">
            {liveSettlements.map((settlement) => {
              const outstanding = Number(settlement.total_amount) - Number(settlement.paid_amount);
              return (
                <div key={settlement.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-100 p-2.5">
                  <div className="min-w-0 flex-1 text-xs">
                    <div className="font-black text-slate-800">{formatGreekNumber(settlement.quantity)} × {lineLabel(settlement.consignment_line_id)} · {formatGreekMoney(Number(settlement.total_amount))}</div>
                    <div className="text-slate-500">{formatGreekDateOnly(settlement.sold_at)}{outstanding > 0 && settlement.status !== 'due' ? ` · υπόλοιπο ${formatGreekMoney(outstanding)}` : ''}{settlement.legal_document_id ? ' · με παραστατικό' : ''}</div>
                  </div>
                  <StatusPill tone={SETTLEMENT_TONE[settlement.status]}>{SETTLEMENT_STATUS_LABELS[settlement.status]}</StatusPill>
                  {settlement.status !== 'paid' && (
                    <button type="button" className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-black text-white hover:bg-emerald-700" onClick={() => ctl.setOperation({ kind: 'payment', settlement })}><Wallet size={13} /> Είσπραξη</button>
                  )}
                  <ActionMenu actions={[
                    { key: 'legal', label: 'Πρόχειρο παραστατικό', icon: <FilePlus2 size={14} />, onSelect: () => void ctl.createConsignmentLegalDraft(settlement.id), hidden: !!settlement.legal_document_id },
                    { key: 'reverse', label: 'Αντιστροφή πώλησης', icon: <RotateCcw size={14} />, danger: true, onSelect: () => ctl.setOperation({ kind: 'reverse-sale', settlement }), hidden: !(ctl.isAdmin && Number(settlement.paid_amount) === 0 && !settlement.legal_document_id) },
                  ]} />
                </div>
              );
            })}
          </div>
        </DrawerSection>
      )}

      {resolvedReturns.length > 0 && (
        <DrawerSection title="Επιστροφές που τακτοποιήθηκαν">
          <ul className="space-y-1 text-xs text-slate-600">
            {resolvedReturns.map((item) => (
              <li key={item.id}>{formatGreekNumber(item.quantity)} × {lineLabel(item.consignment_line_id)} — {CONSIGNMENT_RETURN_STATUS_LABELS[item.status]} · {formatGreekDateOnly(item.resolved_at || item.received_at)}</li>
            ))}
          </ul>
        </DrawerSection>
      )}

      <DrawerSection title="Ιστορικό" tone="muted" action={events.length > 6 ? <button type="button" className={GHOST_BUTTON} onClick={() => setShowAllHistory((value) => !value)}>{showAllHistory ? 'Λιγότερα' : `Όλα (${events.length})`}</button> : undefined}>
        <TimelineList events={(showAllHistory ? events : events.slice(0, 6)).map((event) => ({
          id: event.id,
          label: CONSIGNMENT_EVENT_LABELS[event.event_type] || 'Κίνηση',
          at: formatGreekDateTime(event.created_at),
        }))} />
      </DrawerSection>
    </ServiceDrawer>
  );
}
