import React, { useEffect, useRef, useState } from 'react';
import {
  Archive,
  ArchiveRestore,
  Factory,
  FilePlus2,
  ImagePlus,
  Loader2,
  PauseCircle,
  PlayCircle,
  RotateCcw,
  Trash2,
  Undo2,
  XCircle,
} from 'lucide-react';
import type { RepairAttachment, RepairItem } from '../../../types';
import {
  REPAIR_ATTACHMENT_TYPE_LABELS,
  REPAIR_CHARGE_TYPE_LABELS,
  REPAIR_COST_TYPE_LABELS,
  REPAIR_EVENT_LABELS,
  REPAIR_ORIGIN_LABELS,
  REPAIR_QUALITY_STATUS_LABELS,
  REPAIR_STATUS_LABELS,
  daysSince,
  formatGreekDateOnly,
  formatGreekDateTime,
  formatGreekMoney,
  formatGreekNumber,
  isRepairClosed,
  repairOutstanding,
} from '../../../features/customerService';
import { customerServiceRepository } from '../../../features/customerService/repository';
import { formatOrderId } from '../../../utils/orderUtils';
import { StageFlowRail } from '../../production/StageFlowRail';
import SkuColorizedText from '../../SkuColorizedText';
import RepairQrButton from '../RepairQrButton';
import RepairStageBadge from '../RepairStageBadge';
import type { ServiceController } from '../useServiceController';
import {
  ACTION_PRIMARY,
  ACTION_QUIET,
  ActionMenu,
  ChoicePills,
  DrawerSection,
  GHOST_BUTTON,
  ROW_BUTTON,
  ServiceDrawer,
  StatusPill,
  TimelineList,
} from '../shared/serviceUi';
import { REPAIR_ACTION_META, repairActionFor, runRepairAction } from './RepairCard';

type AttachmentType = 'intake' | 'quality' | 'other';
const HISTORY_PREVIEW = 6;

function PhotoThumb({ attachment }: { attachment: RepairAttachment }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    customerServiceRepository.getAttachmentSignedUrl(attachment.storage_path)
      .then((signed) => { if (active) setUrl(signed); })
      .catch(() => { if (active) setUrl(null); });
    return () => { active = false; };
  }, [attachment.storage_path]);
  return (
    <a href={url || undefined} target="_blank" rel="noreferrer" title={REPAIR_ATTACHMENT_TYPE_LABELS[attachment.attachment_type]} className="relative block h-[72px] w-[72px] shrink-0 overflow-hidden rounded-lg bg-slate-100">
      {url
        ? <img src={url} alt={attachment.file_name} className="h-full w-full object-cover" />
        : <span className="flex h-full w-full items-center justify-center"><Loader2 size={16} className="animate-spin text-slate-300" /></span>}
      <span className="absolute inset-x-0 bottom-0 bg-slate-900/55 py-0.5 text-center text-[9px] font-bold text-white">{REPAIR_ATTACHMENT_TYPE_LABELS[attachment.attachment_type]}</span>
    </a>
  );
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1.5 text-xs">
      <dt className="shrink-0 text-slate-500">{label}</dt>
      <dd className="min-w-0 text-right font-bold text-slate-800">{children}</dd>
    </div>
  );
}

export default function RepairDrawer({ ctl, item, onClose, onRework }: { ctl: ServiceController; item: RepairItem; onClose: () => void; onRework: (item: RepairItem) => void }) {
  const batch = ctl.liveRepairBatch(item);
  const product = item.product_sku ? ctl.productBySku.get(item.product_sku) : undefined;
  const charge = ctl.chargeByRepairId.get(item.id);
  const outstanding = repairOutstanding(charge);
  const closed = isRepairClosed(item);
  const archived = item.is_archived === true;
  const held = !!batch?.on_hold || item.status === 'on_hold';
  const staff = !ctl.isSeller;
  const action = repairActionFor(ctl, item);
  const meta = action ? REPAIR_ACTION_META[action] : null;
  const busy = ctl.movingRepairId === item.id;
  const [photoType, setPhotoType] = useState<AttachmentType>(item.status === 'quality_check' ? 'quality' : item.status === 'received' ? 'intake' : 'other');
  const [uploading, setUploading] = useState(false);
  const [showAllHistory, setShowAllHistory] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const cycles = (ctl.data?.repairCycles || []).filter((cycle) => cycle.repair_item_id === item.id).sort((a, b) => a.cycle_number - b.cycle_number);
  const costs = (ctl.data?.repairCostLines || []).filter((line) => line.repair_item_id === item.id);
  const internalCost = costs.reduce((sum, line) => sum + Number(line.quantity || 0) * Number(line.unit_cost || 0), 0);
  const attachments = (ctl.data?.repairAttachments || []).filter((attachment) => attachment.repair_item_id === item.id);
  const events = (ctl.data?.repairEvents || []).filter((event) => event.repair_item_id === item.id).sort((a, b) => b.created_at.localeCompare(a.created_at));
  const previous = item.previous_repair_item_id ? (ctl.data?.repairItems || []).find((candidate) => candidate.id === item.previous_repair_item_id) : undefined;
  const sellerName = item.seller_id ? ctl.sellerById.get(item.seller_id)?.full_name : undefined;
  const canSendToProduction = staff && !batch && ['received', 'on_hold', 'in_production'].includes(item.status) && !archived && !closed;
  const received = item.received_at || item.created_at;
  const days = daysSince(received);

  const upload = async (file: File) => {
    setUploading(true);
    try { await ctl.uploadRepairPhoto(item, file, photoType); } finally { setUploading(false); }
  };

  // Υποσέλιδο: ένα κύριο κουμπί· στον έλεγχο, δίπλα του το «Ξανά στην Παραγωγή».
  // Η «Ολοκλήρωση Παραγωγής» είναι συντόμευση, γι' αυτό εμφανίζεται ως ήσυχο κουμπί.
  const footer = meta && action ? (
    <>
      <button type="button" disabled={busy} className={action === 'open-production' || action === 'rework' ? ACTION_QUIET : ACTION_PRIMARY} onClick={() => runRepairAction(ctl, item, action, onRework)}>
        {meta.icon} {meta.label}
      </button>
      {action === 'quality' && (
        <button type="button" className={ACTION_QUIET} onClick={() => ctl.setOperation({ kind: 'quality', item, passed: false })}>
          <RotateCcw size={15} /> Ξανά στην Παραγωγή
        </button>
      )}
    </>
  ) : undefined;

  return (
    <ServiceDrawer
      eyebrow={(
        <>
          <span className="font-mono">{item.code}</span>
          <RepairStageBadge item={item} batch={batch} />
          {item.current_cycle_number > 1 && <StatusPill tone="rose">{formatGreekNumber(item.current_cycle_number)}ος κύκλος</StatusPill>}
          {archived && <StatusPill>Αρχείο</StatusPill>}
        </>
      )}
      title={ctl.customerName(item.customer_id)}
      subtitle={[
        `Παραλαβή ${formatGreekDateOnly(received)}`,
        !closed ? (days === 0 ? 'σήμερα' : `πριν ${formatGreekNumber(days)} ${days === 1 ? 'ημέρα' : 'ημέρες'}`) : null,
        sellerName,
      ].filter(Boolean).join(' · ')}
      headerActions={(
        <>
          <RepairQrButton variant="icon" code={item.code} customerName={ctl.customerName(item.customer_id)} />
          <ActionMenu actions={[
            { key: 'hold', label: held ? 'Συνέχεια εργασίας' : 'Σε αναμονή', icon: held ? <PlayCircle size={14} /> : <PauseCircle size={14} />, onSelect: () => ctl.toggleRepairHold(item), hidden: !staff || closed || archived || (!batch && item.status !== 'on_hold') || action === 'resume' },
            { key: 'remove', label: 'Αφαίρεση από Παραγωγή', icon: <Undo2 size={14} />, onSelect: () => void ctl.removeRepairFromProduction(item), hidden: !staff || closed || !batch || archived },
            { key: 'irreparable', label: 'Μη επισκευάσιμο', icon: <XCircle size={14} />, onSelect: () => ctl.setOperation({ kind: 'exception', item, status: 'irreparable' }), hidden: !staff || closed },
            { key: 'archive', label: archived ? 'Ανάκτηση από αρχείο' : 'Αρχειοθέτηση', icon: archived ? <ArchiveRestore size={14} /> : <Archive size={14} />, onSelect: () => void ctl.archiveRepair(item), hidden: !staff },
            { key: 'cancel', label: 'Ακύρωση επισκευής', icon: <XCircle size={14} />, danger: true, onSelect: () => ctl.setOperation({ kind: 'exception', item, status: 'cancelled' }), hidden: !staff || closed },
            { key: 'delete', label: 'Διαγραφή', icon: <Trash2 size={14} />, danger: true, onSelect: async () => { if (await ctl.deleteRepair(item)) onClose(); }, hidden: !staff },
          ]} />
        </>
      )}
      onClose={onClose}
      footer={footer}
    >
      <DrawerSection title="Τεμάχιο">
        {item.product_sku && <div className="text-sm font-bold"><SkuColorizedText sku={item.product_sku} suffix={item.variant_suffix || ''} gender={product?.gender} /></div>}
        <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-slate-700">{item.description}</p>
        <dl className="mt-3 divide-y divide-slate-100 border-t border-slate-100">
          <InfoRow label="Προέλευση">{REPAIR_ORIGIN_LABELS[item.origin_type]}</InfoRow>
          {item.source_order_id && <InfoRow label="Παραγγελία">#{formatOrderId(item.source_order_id)}</InfoRow>}
          {item.size_info && <InfoRow label="Μέγεθος">{item.size_info}</InfoRow>}
          {item.intake_condition && <InfoRow label="Κατάσταση παραλαβής">{item.intake_condition}</InfoRow>}
          {item.accessories && <InfoRow label="Μαζί με">{item.accessories}</InfoRow>}
          {previous && <InfoRow label="Συνέχεια της">{previous.code}</InfoRow>}
        </dl>
      </DrawerSection>

      {staff && (batch || canSendToProduction) && (
        <DrawerSection title="Παραγωγή">
          {batch && (
            <div className="overflow-x-auto">
              <StageFlowRail batch={batch} disabled={busy || held || archived || closed} onMove={(stage, options) => void ctl.moveRepairToStage(item, stage, options)} />
            </div>
          )}
          {held && <p className="mt-2 text-xs text-amber-700">Σε αναμονή. Συνεχίζει με «Συνέχεια εργασίας».</p>}
          {canSendToProduction && (
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-slate-500">Δεν βρίσκεται στην Παραγωγή.</p>
              <button type="button" className={ROW_BUTTON} onClick={() => void ctl.returnRepairToProduction(item)}><Factory size={13} /> Στείλε στην Παραγωγή</button>
            </div>
          )}
        </DrawerSection>
      )}

      <DrawerSection
        title="Χρέωση πελάτη"
        action={staff && !closed ? <button type="button" className={GHOST_BUTTON} onClick={() => ctl.setOperation({ kind: 'charge', item })}>{charge ? 'Αλλαγή' : 'Ορισμός'}</button> : undefined}
      >
        {charge ? (
          <dl className="divide-y divide-slate-100">
            <InfoRow label="Τύπος">{REPAIR_CHARGE_TYPE_LABELS[charge.charge_type]}</InfoRow>
            {charge.charge_type === 'chargeable' && (
              <>
                <InfoRow label="Ποσό">{formatGreekMoney(Number(charge.amount))}</InfoRow>
                <InfoRow label="Πληρώθηκαν">{formatGreekMoney(Number(charge.paid_amount))}</InfoRow>
                <InfoRow label="Υπόλοιπο"><span className={outstanding > 0 ? 'text-rose-600' : 'text-emerald-700'}>{outstanding > 0 ? formatGreekMoney(outstanding) : 'Εξοφλήθηκε'}</span></InfoRow>
              </>
            )}
            {charge.notes && <InfoRow label="Σημείωση">{charge.notes}</InfoRow>}
          </dl>
        ) : (
          <p className="text-xs text-slate-400">Δεν έχει οριστεί χρέωση.</p>
        )}
        {charge?.charge_type === 'chargeable' && Number(charge.amount) > 0 && (
          <div className="mt-2 flex justify-end">
            {charge.legal_document_id
              ? <span className="text-[11px] text-slate-400">Έχει εκδοθεί παραστατικό</span>
              : <button type="button" className={GHOST_BUTTON} onClick={() => void ctl.createRepairLegalDraft(item)}><FilePlus2 size={13} /> Πρόχειρο παραστατικό</button>}
          </div>
        )}
      </DrawerSection>

      {ctl.canSeeCost && (
        <DrawerSection title={`Εσωτερικό κόστος · ${formatGreekMoney(internalCost)}`} action={!closed ? <button type="button" className={GHOST_BUTTON} onClick={() => ctl.setOperation({ kind: 'cost', item })}>Προσθήκη</button> : undefined}>
          {costs.length === 0 ? <p className="text-xs text-slate-400">Δεν έχει καταγραφεί κόστος.</p> : (
            <ul className="divide-y divide-slate-100">
              {costs.map((line) => (
                <li key={line.id} className="flex justify-between gap-4 py-1.5 text-xs">
                  <span className="min-w-0 text-slate-600"><span className="text-slate-400">{REPAIR_COST_TYPE_LABELS[line.cost_type]}</span> · {line.description}{Number(line.quantity) > 1 ? ` ×${formatGreekNumber(Number(line.quantity))}` : ''}</span>
                  <span className="shrink-0 font-bold tabular-nums text-slate-800">{formatGreekMoney(Number(line.quantity) * Number(line.unit_cost))}</span>
                </li>
              ))}
            </ul>
          )}
        </DrawerSection>
      )}

      <DrawerSection title={`Φωτογραφίες${attachments.length ? ` · ${formatGreekNumber(attachments.length)}` : ''}`}>
        <div className="flex flex-wrap gap-2">
          {attachments.map((attachment) => <PhotoThumb key={attachment.id} attachment={attachment} />)}
          <button type="button" disabled={uploading} onClick={() => fileRef.current?.click()} className="flex h-[72px] w-[72px] shrink-0 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-slate-300 text-slate-400 transition hover:border-slate-400 hover:text-slate-600 disabled:opacity-50">
            {uploading ? <Loader2 size={16} className="animate-spin" /> : <ImagePlus size={16} />}
            <span className="text-[10px] font-bold">Προσθήκη</span>
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); event.currentTarget.value = ''; }} />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-[11px] text-slate-500">Νέες φωτογραφίες ως</span>
          <ChoicePills<AttachmentType> size="sm" value={photoType} onChange={setPhotoType} options={(Object.entries(REPAIR_ATTACHMENT_TYPE_LABELS) as Array<[AttachmentType, string]>).map(([value, label]) => ({ value, label }))} />
        </div>
      </DrawerSection>

      {cycles.length > 1 && (
        <DrawerSection title="Κύκλοι επισκευής">
          <ul className="divide-y divide-slate-100">
            {cycles.map((cycle) => (
              <li key={cycle.id} className="py-1.5 text-xs">
                <div className="flex justify-between gap-4">
                  <span className="font-bold text-slate-700">{formatGreekNumber(cycle.cycle_number)}ος κύκλος</span>
                  <span className="text-slate-500">{REPAIR_QUALITY_STATUS_LABELS[cycle.quality_status]} · {formatGreekDateOnly(cycle.started_at)}</span>
                </div>
                {cycle.quality_notes && <div className="mt-0.5 text-slate-500">{cycle.quality_notes}</div>}
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
          label: REPAIR_EVENT_LABELS[event.event_type] || 'Κίνηση',
          note: event.event_type === 'status_changed' && typeof event.payload?.status === 'string' ? REPAIR_STATUS_LABELS[event.payload.status as keyof typeof REPAIR_STATUS_LABELS] : null,
          at: formatGreekDateTime(event.created_at),
        }))} />
      </DrawerSection>
    </ServiceDrawer>
  );
}
