import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  FilePlus2,
  ImagePlus,
  PackageCheck,
  RotateCcw,
  X,
} from 'lucide-react';
import type {
  Product,
  RepairAttachment,
  RepairCharge,
  RepairCostLine,
  RepairCycle,
  RepairEvent,
  RepairItem,
} from '../../types';
import {
  FINANCIAL_STATUS_LABELS,
  REPAIR_ATTACHMENT_TYPE_LABELS,
  REPAIR_CHARGE_TYPE_LABELS,
  REPAIR_COST_TYPE_LABELS,
  REPAIR_EVENT_LABELS,
  REPAIR_ORIGIN_LABELS,
  REPAIR_QUALITY_STATUS_LABELS,
  REPAIR_STATUS_LABELS,
  formatGreekDateTime,
  formatGreekMoney,
} from '../../features/customerService';
import { customerServiceRepository } from '../../features/customerService/repository';
import { formatOrderId } from '../../utils/orderUtils';
import SkuColorizedText from '../SkuColorizedText';
import RepairBadge from './RepairBadge';
import RepairQrButton from './RepairQrButton';
import { BTN_PRIMARY, BTN_SECONDARY } from '../ui/designTokens';
import ViewportPortal from './ViewportPortal';

export type RepairWorkspaceOperation =
  | { kind: 'quality'; item: RepairItem; passed: boolean }
  | { kind: 'cost'; item: RepairItem }
  | { kind: 'charge'; item: RepairItem }
  | { kind: 'exception'; item: RepairItem; status: 'on_hold' | 'irreparable' | 'cancelled' | 'in_production' };

interface Props {
  item: RepairItem;
  customerName: string;
  sellerName?: string;
  product?: Product;
  previousCode?: string | null;
  cycles: RepairCycle[];
  costs: RepairCostLine[];
  charge?: RepairCharge;
  attachments: RepairAttachment[];
  events: RepairEvent[];
  canSeeCost: boolean;
  isSeller: boolean;
  onClose: () => void;
  onOperation: (operation: RepairWorkspaceOperation) => void;
  onDelivered: () => void;
  onNewLinkedRepair: () => void;
  onLegalDraft: () => void;
  onUpload: (file: File) => void;
}

function RepairPhotoThumb({ attachment }: { attachment: RepairAttachment }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    customerServiceRepository.getAttachmentSignedUrl(attachment.storage_path)
      .then((signed) => { if (active) setUrl(signed); })
      .catch(() => { if (active) setUrl(null); });
    return () => { active = false; };
  }, [attachment.storage_path]);

  const label = REPAIR_ATTACHMENT_TYPE_LABELS[attachment.attachment_type] || attachment.file_name;
  if (!url) {
    return (
      <div className="flex h-20 w-20 flex-col items-center justify-center rounded-xl bg-slate-100 px-1 text-center text-[9px] font-bold text-slate-400">
        {label}
      </div>
    );
  }
  return (
    <a href={url} target="_blank" rel="noreferrer" className="block">
      <img src={url} alt={attachment.file_name} className="h-20 w-20 rounded-xl object-cover" />
    </a>
  );
}

export default function RepairDetailModal({
  item,
  customerName,
  sellerName,
  product,
  previousCode,
  cycles,
  costs,
  charge,
  attachments,
  events,
  canSeeCost,
  isSeller,
  onClose,
  onOperation,
  onDelivered,
  onNewLinkedRepair,
  onLegalDraft,
  onUpload,
}: Props) {
  const closed = ['delivered', 'irreparable', 'cancelled'].includes(item.status);
  const internalCost = costs.reduce((sum, line) => sum + Number(line.quantity || 0) * Number(line.unit_cost || 0), 0);

  return (
    <ViewportPortal>
    <div className="fixed inset-0 z-[190] flex items-center justify-center bg-slate-950/55 p-3 backdrop-blur-sm print:hidden" role="dialog" aria-modal="true" aria-label={item.code}>
      <div className="flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-white/40 bg-slate-50 shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-black text-slate-900">{item.code}</h2>
              <RepairBadge compact />
              <span className="rounded-full bg-blue-50 px-2 py-1 text-[10px] font-black text-blue-700">{REPAIR_STATUS_LABELS[item.status]}</span>
              {item.current_cycle_number > 1 && (
                <span className="rounded-full bg-rose-50 px-2 py-1 text-[10px] font-black text-rose-700">Κύκλος {item.current_cycle_number}</span>
              )}
            </div>
            <p className="mt-1 text-xs text-slate-500">{customerName}{sellerName ? ` · πωλητής ${sellerName}` : ''}</p>
          </div>
          <div className="flex items-center gap-2">
            <RepairQrButton code={item.code} customerName={customerName} />
            <button type="button" onClick={onClose} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Κλείσιμο"><X size={19} /></button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <div className="space-y-4">
            <div className={`grid grid-cols-2 gap-3 ${canSeeCost ? 'md:grid-cols-4' : 'md:grid-cols-3'}`}>
              <div className="rounded-2xl bg-blue-50 p-3">
                <div className="text-lg font-black">{item.current_cycle_number}</div>
                <div className="text-[10px] font-bold text-blue-700">Κύκλος επισκευής</div>
              </div>
              {canSeeCost && (
                <div className="rounded-2xl bg-slate-50 p-3">
                  <div className="text-lg font-black">{formatGreekMoney(internalCost)}</div>
                  <div className="text-[10px] font-bold text-slate-500">Εσωτερικό κόστος</div>
                </div>
              )}
              <div className="rounded-2xl bg-slate-50 p-3">
                <div className="text-lg font-black">{formatGreekMoney(Number(charge?.amount || 0))}</div>
                <div className="text-[10px] font-bold text-slate-500">Χρέωση πελάτη</div>
              </div>
              <div className="rounded-2xl bg-emerald-50 p-3">
                <div className="text-sm font-black text-emerald-800">
                  {charge ? REPAIR_CHARGE_TYPE_LABELS[charge.charge_type] : 'Χωρίς καταχώριση'}
                </div>
                <div className="text-[10px] font-bold text-emerald-700">
                  {charge ? FINANCIAL_STATUS_LABELS[charge.payment_status] : '—'}
                </div>
              </div>
            </div>

            <section className="rounded-2xl border border-slate-100 bg-white p-4">
              <div className="text-xs font-black text-slate-700">
                {item.product_sku
                  ? <SkuColorizedText sku={item.product_sku} suffix={item.variant_suffix || ''} gender={product?.gender} />
                  : 'Χωρίς συνδεδεμένο SKU'}
              </div>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{item.description}</p>
              <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-bold text-slate-500">
                <span className="rounded-full bg-slate-100 px-2 py-1">{REPAIR_ORIGIN_LABELS[item.origin_type]}</span>
                {item.source_order_id && <span className="rounded-full bg-slate-100 px-2 py-1">Παραγγελία #{formatOrderId(item.source_order_id)}</span>}
                {item.size_info && <span className="rounded-full bg-slate-100 px-2 py-1">Μέγεθος {item.size_info}</span>}
                {previousCode && <span className="rounded-full bg-blue-50 px-2 py-1 text-blue-700">Προηγούμενη {previousCode}</span>}
              </div>
              {item.intake_condition && <p className="mt-2 text-[11px] text-slate-500">Κατάσταση παραλαβής: {item.intake_condition}</p>}
              {item.accessories && <p className="mt-1 text-[11px] text-slate-500">Παρελκόμενα: {item.accessories}</p>}
            </section>

            <div className="flex flex-wrap gap-2">
              {!isSeller && item.status === 'quality_check' && (
                <>
                  <button className={BTN_PRIMARY} onClick={() => onOperation({ kind: 'quality', item, passed: true })}><CheckCircle2 size={14} /> Επιτυχής έλεγχος</button>
                  <button className={BTN_SECONDARY} onClick={() => onOperation({ kind: 'quality', item, passed: false })}><RotateCcw size={14} /> Επανεργασία</button>
                </>
              )}
              {item.status === 'ready_for_return' && (
                <button className={BTN_PRIMARY} onClick={onDelivered}><PackageCheck size={14} /> Παραδόθηκε</button>
              )}
              {item.status === 'delivered' && (
                <button className={BTN_SECONDARY} onClick={onNewLinkedRepair}><RotateCcw size={14} /> Νέα συνδεδεμένη Επισκευή</button>
              )}
              {!isSeller && !closed && (
                <>
                  <button className={BTN_SECONDARY} onClick={() => onOperation({ kind: 'cost', item })}>Καταγραφή κόστους</button>
                  <button className={BTN_SECONDARY} onClick={() => onOperation({ kind: 'charge', item })}>Χρέωση</button>
                  <button className={BTN_SECONDARY} onClick={() => onOperation({ kind: 'exception', item, status: 'on_hold' })}>Σε αναμονή</button>
                </>
              )}
              {charge?.charge_type === 'chargeable' && Number(charge.amount) > 0 && !charge.legal_document_id && (
                <button className={BTN_SECONDARY} onClick={onLegalDraft}><FilePlus2 size={14} /> Πρόχειρο παραστατικό</button>
              )}
              <label className={`${BTN_SECONDARY} cursor-pointer`}>
                <ImagePlus size={14} /> Φωτογραφία
                <input type="file" accept="image/*" className="hidden" onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) onUpload(file);
                  event.currentTarget.value = '';
                }} />
              </label>
            </div>

            {attachments.length > 0 && (
              <section className="rounded-2xl border border-slate-100 bg-white p-4">
                <h4 className="mb-2 text-xs font-black uppercase text-slate-400">Φωτογραφίες</h4>
                <div className="flex flex-wrap gap-2">
                  {attachments.map((attachment) => <RepairPhotoThumb key={attachment.id} attachment={attachment} />)}
                </div>
              </section>
            )}

            <div className="grid gap-3 md:grid-cols-2">
              <section className="rounded-2xl border border-slate-100 bg-white p-4">
                <h4 className="mb-2 text-xs font-black uppercase text-slate-400">Κύκλοι / κόστος</h4>
                <div className="space-y-2">
                  {[...cycles].sort((a, b) => a.cycle_number - b.cycle_number).map((cycle) => (
                    <div key={cycle.id} className="rounded-xl bg-slate-50 p-2.5 text-xs">
                      <div className="flex justify-between font-bold">
                        <span>Κύκλος {cycle.cycle_number}</span>
                        <span>{REPAIR_QUALITY_STATUS_LABELS[cycle.quality_status]}</span>
                      </div>
                      <div className="mt-1 text-slate-400">{formatGreekDateTime(cycle.started_at)}</div>
                    </div>
                  ))}
                  {canSeeCost && costs.map((line) => (
                    <div key={line.id} className="rounded-xl bg-slate-50 p-2.5 text-xs">
                      <div className="flex justify-between font-bold">
                        <span>{REPAIR_COST_TYPE_LABELS[line.cost_type]} · {line.description}</span>
                        <span>{formatGreekMoney(Number(line.quantity) * Number(line.unit_cost))}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
              <section className="rounded-2xl border border-slate-100 bg-white p-4">
                <h4 className="mb-2 text-xs font-black uppercase text-slate-400">Χρονολόγιο</h4>
                <div className="space-y-2">
                  {[...events].sort((a, b) => b.created_at.localeCompare(a.created_at)).map((event) => (
                    <div key={event.id} className="text-xs">
                      <div className="font-black text-slate-700">{REPAIR_EVENT_LABELS[event.event_type] || event.event_type}</div>
                      <div className="text-slate-400">{formatGreekDateTime(event.created_at)}</div>
                    </div>
                  ))}
                </div>
              </section>
            </div>

            <p className="text-[10px] text-slate-400">
              Παραλαβή: {formatGreekDateTime(item.received_at || item.created_at)}. Το τεμάχιο είναι περιουσία του πελάτη και δεν μπαίνει στο απόθεμα. Η παράδοση δεν μπλοκάρεται από οικονομική εκκρεμότητα.
            </p>
          </div>
        </div>
      </div>
    </div>
    </ViewportPortal>
  );
}
