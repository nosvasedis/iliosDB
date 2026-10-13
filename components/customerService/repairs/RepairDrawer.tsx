import React, { useEffect, useRef, useState } from 'react';
import {
  Archive,
  ArchiveRestore,
  Banknote,
  Factory,
  FilePlus2,
  ImagePlus,
  Loader2,
  PauseCircle,
  PlayCircle,
  Plus,
  RotateCcw,
  Trash2,
  Undo2,
  XCircle,
} from 'lucide-react';
import type { RepairAttachment, RepairItem } from '../../../types';
import {
  FINANCIAL_STATUS_LABELS,
  REPAIR_ATTACHMENT_TYPE_LABELS,
  REPAIR_CHARGE_TYPE_LABELS,
  REPAIR_COST_TYPE_LABELS,
  REPAIR_EVENT_LABELS,
  REPAIR_ORIGIN_LABELS,
  REPAIR_QUALITY_STATUS_LABELS,
  REPAIR_STATUS_LABELS,
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
import { ActionMenu, ChoicePills, DrawerSection, GHOST_BUTTON, ServiceDrawer, StatusPill, TimelineList } from '../shared/serviceUi';
import { REPAIR_ACTION_META, repairActionFor, runRepairAction } from './RepairCard';

type AttachmentType = 'intake' | 'quality' | 'other';

function PhotoThumb({ attachment }: { attachment: RepairAttachment }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    customerServiceRepository.getAttachmentSignedUrl(attachment.storage_path)
      .then((signed) => { if (active) setUrl(signed); })
      .catch(() => { if (active) setUrl(null); });
    return () => { active = false; };
  }, [attachment.storage_path]);
  const label = REPAIR_ATTACHMENT_TYPE_LABELS[attachment.attachment_type];
  return (
    <a href={url || undefined} target="_blank" rel="noreferrer" className="group relative block h-20 w-20 overflow-hidden rounded-xl bg-slate-100">
      {url ? <img src={url} alt={attachment.file_name} className="h-full w-full object-cover transition group-hover:scale-105" /> : <Loader2 size={16} className="m-auto mt-8 animate-spin text-slate-300" />}
      <span className="absolute inset-x-0 bottom-0 bg-slate-900/60 px-1 py-0.5 text-center text-[9px] font-bold text-white">{label}</span>
    </a>
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

  const upload = async (file: File) => {
    setUploading(true);
    try { await ctl.uploadRepairPhoto(item, file, photoType); } finally { setUploading(false); }
  };

  return (
    <ServiceDrawer
      title={item.code}
      badges={(
        <>
          <RepairStageBadge item={item} batch={batch} />
          {item.current_cycle_number > 1 && <StatusPill tone="rose">{formatGreekNumber(item.current_cycle_number)}ος κύκλος</StatusPill>}
          {archived && <StatusPill>Αρχείο</StatusPill>}
        </>
      )}
      subtitle={<><span className="font-bold text-slate-800">{ctl.customerName(item.customer_id)}</span><span className="text-slate-500"> · παραλαβή {formatGreekDateOnly(item.received_at || item.created_at)}{sellerName ? ` · ${sellerName}` : ''}</span></>}
      headerActions={(
        <>
          <RepairQrButton code={item.code} customerName={ctl.customerName(item.customer_id)} />
          <ActionMenu actions={[
            { key: 'hold', label: held ? 'Συνέχεια εργασίας' : 'Σε αναμονή', icon: held ? <PlayCircle size={14} /> : <PauseCircle size={14} />, onSelect: () => ctl.toggleRepairHold(item), hidden: !staff || closed || archived || (!batch && item.status !== 'on_hold') },
            { key: 'remove', label: 'Αφαίρεση από Παραγωγή', icon: <Undo2 size={14} />, onSelect: () => void ctl.removeRepairFromProduction(item), hidden: !staff || closed || !batch || archived },
            { key: 'rework', label: 'Νέα επανεπισκευή', icon: <RotateCcw size={14} />, onSelect: () => onRework(item), hidden: item.status !== 'delivered' || action === 'rework' },
            { key: 'irreparable', label: 'Μη επισκευάσιμο', icon: <XCircle size={14} />, onSelect: () => ctl.setOperation({ kind: 'exception', item, status: 'irreparable' }), hidden: !staff || closed },
            { key: 'cancel', label: 'Ακύρωση επισκευής', icon: <XCircle size={14} />, onSelect: () => ctl.setOperation({ kind: 'exception', item, status: 'cancelled' }), hidden: !staff || closed },
            { key: 'archive', label: archived ? 'Ανάκτηση από αρχείο' : 'Αρχειοθέτηση', icon: archived ? <ArchiveRestore size={14} /> : <Archive size={14} />, onSelect: () => void ctl.archiveRepair(item), hidden: !staff },
            { key: 'delete', label: 'Διαγραφή', icon: <Trash2 size={14} />, danger: true, onSelect: async () => { if (await ctl.deleteRepair(item)) onClose(); }, hidden: !staff },
          ]} />
        </>
      )}
      onClose={onClose}
      footer={meta && action ? (
        <>
          <button type="button" disabled={ctl.movingRepairId === item.id} className={`inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-black transition disabled:opacity-50 ${meta.className}`} onClick={() => runRepairAction(ctl, item, action, onRework)}>
            {meta.icon} {meta.label}
          </button>
          {action === 'quality' && (
            <button type="button" className="inline-flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-black text-rose-600 ring-1 ring-rose-200 hover:bg-rose-50" onClick={() => ctl.setOperation({ kind: 'quality', item, passed: false })}>
              <RotateCcw size={15} /> Ξανά στην Παραγωγή
            </button>
          )}
        </>
      ) : undefined}
    >
      <DrawerSection title="Τεμάχιο">
        <div className="text-sm font-black text-slate-800">
          {item.product_sku ? <SkuColorizedText sku={item.product_sku} suffix={item.variant_suffix || ''} gender={product?.gender} /> : <span className="text-slate-400">Χωρίς SKU</span>}
        </div>
        <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-slate-700">{item.description}</p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <StatusPill>{REPAIR_ORIGIN_LABELS[item.origin_type]}</StatusPill>
          {item.source_order_id && <StatusPill tone="indigo">Παραγγελία #{formatOrderId(item.source_order_id)}</StatusPill>}
          {item.size_info && <StatusPill>Μέγεθος {item.size_info}</StatusPill>}
          {previous && <StatusPill tone="blue">Συνέχεια της {previous.code}</StatusPill>}
        </div>
        {(item.intake_condition || item.accessories) && (
          <dl className="mt-3 grid gap-1 text-xs text-slate-500">
            {item.intake_condition && <div><dt className="inline font-bold">Κατάσταση παραλαβής: </dt><dd className="inline">{item.intake_condition}</dd></div>}
            {item.accessories && <div><dt className="inline font-bold">Μαζί με: </dt><dd className="inline">{item.accessories}</dd></div>}
          </dl>
        )}
      </DrawerSection>

      {staff && (batch || canSendToProduction) && (
        <DrawerSection title="Παραγωγή">
          {batch && <StageFlowRail batch={batch} disabled={ctl.movingRepairId === item.id || held || archived || closed} onMove={(stage, options) => void ctl.moveRepairToStage(item, stage, options)} />}
          {held && <p className="mt-2 text-xs font-bold text-amber-700">Σε αναμονή — πατήστε «Συνέχεια» για να προχωρήσει.</p>}
          {canSendToProduction && (
            <button type="button" className="inline-flex items-center gap-2 rounded-xl bg-[#060b00] px-4 py-2.5 text-sm font-bold text-white hover:bg-slate-800" onClick={() => void ctl.returnRepairToProduction(item)}>
              <Factory size={15} /> Στείλε στην Παραγωγή
            </button>
          )}
        </DrawerSection>
      )}

      <DrawerSection
        title="Χρέωση πελάτη"
        action={staff && !closed ? <button type="button" className={GHOST_BUTTON} onClick={() => ctl.setOperation({ kind: 'charge', item })}><Banknote size={13} /> {charge ? 'Αλλαγή' : 'Ορισμός'}</button> : undefined}
      >
        {charge ? (
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="text-xs font-bold text-slate-500">{REPAIR_CHARGE_TYPE_LABELS[charge.charge_type]}</div>
              {charge.charge_type === 'chargeable' && <div className="text-xl font-black text-slate-900">{formatGreekMoney(Number(charge.amount))}</div>}
              {charge.notes && <div className="text-[11px] text-slate-400">{charge.notes}</div>}
            </div>
            {charge.charge_type === 'chargeable' && (
              <div className="text-right">
                <StatusPill tone={outstanding > 0 ? 'amber' : 'emerald'}>{outstanding > 0 ? `Υπόλοιπο ${formatGreekMoney(outstanding)}` : FINANCIAL_STATUS_LABELS[charge.payment_status]}</StatusPill>
                {Number(charge.amount) > 0 && !charge.legal_document_id && (
                  <button type="button" className={`${GHOST_BUTTON} mt-1`} onClick={() => void ctl.createRepairLegalDraft(item)}><FilePlus2 size={13} /> Πρόχειρο παραστατικό</button>
                )}
                {charge.legal_document_id && <div className="mt-1 text-[10px] font-bold text-slate-400">Με παραστατικό</div>}
              </div>
            )}
          </div>
        ) : (
          <p className="text-xs text-slate-400">Δεν έχει οριστεί χρέωση.</p>
        )}
      </DrawerSection>

      {ctl.canSeeCost && (
        <DrawerSection title={`Εσωτερικό κόστος · ${formatGreekMoney(internalCost)}`} action={!closed ? <button type="button" className={GHOST_BUTTON} onClick={() => ctl.setOperation({ kind: 'cost', item })}><Plus size={13} /> Κόστος</button> : undefined}>
          {costs.length === 0 ? <p className="text-xs text-slate-400">Δεν έχει καταγραφεί κόστος.</p> : (
            <ul className="space-y-1 text-xs">
              {costs.map((line) => (
                <li key={line.id} className="flex justify-between gap-2"><span className="text-slate-600"><strong>{REPAIR_COST_TYPE_LABELS[line.cost_type]}</strong> · {line.description}{Number(line.quantity) > 1 ? ` ×${formatGreekNumber(Number(line.quantity))}` : ''}</span><span className="font-black text-slate-800">{formatGreekMoney(Number(line.quantity) * Number(line.unit_cost))}</span></li>
              ))}
            </ul>
          )}
        </DrawerSection>
      )}

      <DrawerSection title="Φωτογραφίες">
        <div className="flex flex-wrap gap-2">
          {attachments.map((attachment) => <PhotoThumb key={attachment.id} attachment={attachment} />)}
          <button type="button" disabled={uploading} onClick={() => fileRef.current?.click()} className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-slate-200 text-slate-400 transition hover:border-slate-300 hover:text-slate-600 disabled:opacity-50">
            {uploading ? <Loader2 size={18} className="animate-spin" /> : <ImagePlus size={18} />}
            <span className="text-[10px] font-bold">Προσθήκη</span>
          </button>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); event.currentTarget.value = ''; }} />
        </div>
        <div className="mt-3 flex items-center gap-2">
          <span className="text-[11px] font-bold text-slate-400">Νέα φωτογραφία ως:</span>
          <ChoicePills<AttachmentType> size="sm" value={photoType} onChange={setPhotoType} options={(Object.entries(REPAIR_ATTACHMENT_TYPE_LABELS) as Array<[AttachmentType, string]>).map(([value, label]) => ({ value, label }))} />
        </div>
      </DrawerSection>

      {cycles.length > 1 && (
        <DrawerSection title="Κύκλοι επισκευής">
          <ul className="space-y-1 text-xs">
            {cycles.map((cycle) => (
              <li key={cycle.id} className="flex justify-between gap-2"><span className="font-bold text-slate-700">{formatGreekNumber(cycle.cycle_number)}ος κύκλος · {formatGreekDateOnly(cycle.started_at)}</span><span className="text-slate-500">{REPAIR_QUALITY_STATUS_LABELS[cycle.quality_status]}{cycle.quality_notes ? ` — ${cycle.quality_notes}` : ''}</span></li>
            ))}
          </ul>
        </DrawerSection>
      )}

      <DrawerSection title="Ιστορικό" tone="muted" action={events.length > 6 ? <button type="button" className={GHOST_BUTTON} onClick={() => setShowAllHistory((value) => !value)}>{showAllHistory ? 'Λιγότερα' : `Όλα (${events.length})`}</button> : undefined}>
        <TimelineList events={(showAllHistory ? events : events.slice(0, 6)).map((event) => ({
          id: event.id,
          label: REPAIR_EVENT_LABELS[event.event_type] || 'Κίνηση',
          note: event.event_type === 'status_changed' && typeof event.payload?.status === 'string' ? REPAIR_STATUS_LABELS[event.payload.status as keyof typeof REPAIR_STATUS_LABELS] : null,
          at: formatGreekDateTime(event.created_at),
        }))} />
      </DrawerSection>
    </ServiceDrawer>
  );
}
