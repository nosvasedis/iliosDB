import React, { useState } from 'react';
import { Building2, CalendarClock, Car, Check, Clock, MapPin, Package, Plus, RotateCcw, Truck, Warehouse } from 'lucide-react';
import type { Customer, LegalCarrier, LegalDeliveryDetails, LegalDocument, LegalPartyAddress, LegalSettings, Supplier } from '../../../types';
import { SupplierAvatar } from '../../suppliers/SupplierCard';
import CarrierForm, { type CarrierDraft, EMPTY_CARRIER_DRAFT, linkedSupplier } from './CarrierForm';
import { SBZ_MOVE_PURPOSES } from '../../../features/legal/sbz';
import {
  buildDefaultDeliveryDetails,
  documentIncludesDeliveryNote,
  normalizeVatNumber,
  parseLegalPartyAddress,
  resolveCustomerDeliveryAddress,
  resolveLegalLoadingAddress,
  resolveLegalMovePurpose,
  resolveSbzDispatchMethod,
  SBZ_COURIER_DISPATCH_METHOD,
  SBZ_DISPATCH_METHODS,
  SBZ_OWN_MEANS_DISPATCH_METHOD,
  toAthensIsoDate,
  toAthensTime,
} from '../../../utils/legalDocuments';
import { customerBranches } from '../../../features/customers/customerLocation';
import { ActionButton, FieldGroup, FieldMessage, type FieldProblem, Notice, SelectInput, TextInput } from './ui';
import { firstIssueMessage, type DraftIssue } from './draftIssues';

const THIRD_PARTY_DISPATCH_METHOD = SBZ_DISPATCH_METHODS.find((method) => method !== SBZ_OWN_MEANS_DISPATCH_METHOD && method !== SBZ_COURIER_DISPATCH_METHOD) || 'Μεταφορική';

/** Order and copy of the dispatch choices: courier first, since most parcels leave with a courier. */
const DISPATCH_CHOICES: Array<{ value: string; title: string; detail: string; icon: typeof Truck }> = [
  { value: SBZ_COURIER_DISPATCH_METHOD, title: 'Courier', detail: 'π.χ. ACS · χωρίς όχημα', icon: Package },
  { value: SBZ_OWN_MEANS_DISPATCH_METHOD, title: 'Ίδια μέσα', detail: 'Δικό μας όχημα · αρ. κυκλοφορίας', icon: Car },
  { value: THIRD_PARTY_DISPATCH_METHOD, title: 'Μεταφορική', detail: 'Τρίτος μεταφορέας με ΑΦΜ', icon: Truck },
];

const CLEARED_CARRIER: Partial<LegalDeliveryDetails> = {
  carrier_id: null,
  carrier_name: null,
  carrier_vat_number: null,
  carrier_vehicle_number: null,
};

const carrierFields = (carrier?: LegalCarrier | null): Partial<LegalDeliveryDetails> => carrier ? {
  carrier_id: carrier.id,
  carrier_name: carrier.name,
  carrier_vat_number: carrier.vat_number || null,
  carrier_vehicle_number: carrier.vehicle_number || null,
} : CLEARED_CARRIER;

const ACS_PATTERN = /\bacs\b/i;

/**
 * The carrier to pre-select for courier / transport: the one marked default in Settings,
 * else ACS (by name or linked partner), else the only one saved.
 */
export function preferredCarrier(carriers: LegalCarrier[], suppliers: Supplier[] = []): LegalCarrier | null {
  const isAcs = (carrier: LegalCarrier) => ACS_PATTERN.test(carrier.name)
    || ACS_PATTERN.test(suppliers.find((supplier) => supplier.id === carrier.supplier_id)?.name || '');
  return carriers.find((carrier) => carrier.is_default)
    || carriers.find(isAcs)
    || (carriers.length === 1 ? carriers[0] : null);
}

/** Delivery fields after the dispatch method changes. */
export function withDispatchMethod(
  delivery: LegalDeliveryDetails,
  method: string,
  carriers: LegalCarrier[],
  suppliers: Supplier[] = [],
): LegalDeliveryDetails {
  if (method === SBZ_OWN_MEANS_DISPATCH_METHOD) {
    return { ...delivery, dispatch_method: method, ...CLEARED_CARRIER };
  }
  const keepCarrier = !!delivery.carrier_id && carriers.some((carrier) => carrier.id === delivery.carrier_id);
  const carrier = keepCarrier ? null : preferredCarrier(carriers, suppliers);
  return {
    ...delivery,
    dispatch_method: method,
    // A courier brings its own vehicle; a plate typed for our own vehicle must not travel with it.
    ...(method === SBZ_COURIER_DISPATCH_METHOD ? { vehicle_number: '' } : {}),
    ...(keepCarrier ? {} : carrierFields(carrier)),
  };
}

const norm = (value: unknown) => String(value ?? '').trim().toLocaleLowerCase('el-GR');
const sameAddress = (a?: LegalPartyAddress | null, b?: LegalPartyAddress | null) => Boolean(a && b)
  && (['street', 'number', 'postal_code', 'city'] as const).every((key) => norm(a?.[key]) === norm(b?.[key]));

/** Which delivery point the current address corresponds to: a shop id, 'fiscal', or 'custom'. */
export function deliveryBranchValue(customer: Customer, address?: LegalPartyAddress | null): string {
  for (const branch of customerBranches(customer)) {
    if (sameAddress(address, resolveCustomerDeliveryAddress(customer, branch.id))) return branch.id;
  }
  if (!address || sameAddress(address, customer.address ? parseLegalPartyAddress(customer.address) : null)) return 'fiscal';
  return 'custom';
}

const missing = (value?: string | null) => !String(value ?? '').trim();

const AddressCard = ({
  icon: Icon,
  title,
  address,
  problem,
  field,
  disabled,
  onChange,
  toolbar,
}: {
  icon: typeof MapPin;
  title: string;
  address?: LegalPartyAddress | null;
  problem: FieldProblem | null;
  field: string;
  disabled: boolean;
  onChange: (updates: Partial<LegalPartyAddress>) => void;
  toolbar?: React.ReactNode;
}) => {
  const flag = (value?: string | null): FieldProblem | null => (problem && missing(value) ? { severity: problem.severity, message: '' } : null);
  return (
    <div
      data-legal-field={field}
      className={`min-w-0 rounded-xl border p-3.5 ${problem ? (problem.severity === 'error' ? 'border-red-200 bg-red-50/30' : 'border-amber-200 bg-amber-50/30') : 'border-slate-200 bg-slate-50/50'}`}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-black text-slate-800">
          <Icon size={15} className="text-slate-500" /> {title}
        </div>
        {toolbar}
      </div>
      <div className="grid grid-cols-6 gap-2">
        <div className="col-span-4">
          <TextInput label="Οδός" required value={address?.street || ''} disabled={disabled} problem={flag(address?.street)} onChange={(street) => onChange({ street })} />
        </div>
        <div className="col-span-2">
          <TextInput label="Αρ." value={address?.number || ''} disabled={disabled} onChange={(number) => onChange({ number })} />
        </div>
        <div className="col-span-2">
          <TextInput label="Τ.Κ." required inputMode="numeric" value={address?.postal_code || ''} disabled={disabled} problem={flag(address?.postal_code)} onChange={(postal_code) => onChange({ postal_code })} />
        </div>
        <div className="col-span-4">
          <TextInput label="Πόλη" required value={address?.city || ''} disabled={disabled} problem={flag(address?.city)} onChange={(city) => onChange({ city })} />
        </div>
      </div>
      <FieldMessage problem={problem} />
    </div>
  );
};

export interface DeliveryPanelProps {
  document: LegalDocument;
  editable: boolean;
  settings: LegalSettings;
  carriers: LegalCarrier[];
  /** Partners («Προμηθευτές & Συνεργάτες»), for carrier logos and linking. */
  suppliers: Supplier[];
  /** Customer of the draft, used for its delivery points. */
  customer: Customer | null;
  issues: DraftIssue[];
  canToggleDelivery: boolean;
  recentVehicles: string[];
  savingCarrier: boolean;
  onUpdate: (updater: (document: LegalDocument) => LegalDocument) => void;
  onToggleDelivery: (include: boolean) => void;
  onCreateCarrier: (draft: CarrierDraft) => Promise<LegalCarrier | null>;
}

export default function DeliveryPanel({
  document,
  editable,
  settings,
  carriers,
  suppliers,
  customer,
  issues,
  canToggleDelivery,
  recentVehicles,
  savingCarrier,
  onUpdate,
  onToggleDelivery,
  onCreateCarrier,
}: DeliveryPanelProps) {
  const includesDelivery = documentIncludesDeliveryNote(document);
  const isStandalone = document.document_kind === 'delivery_note';
  const delivery = document.delivery || null;
  const method = resolveSbzDispatchMethod(delivery);
  const ownMeans = method === SBZ_OWN_MEANS_DISPATCH_METHOD;
  const courier = method === SBZ_COURIER_DISPATCH_METHOD;
  const problem = (field: string): FieldProblem | null => firstIssueMessage(issues, field);
  const [carrierDraft, setCarrierDraft] = useState<CarrierDraft | null>(null);

  const updateDelivery = (updates: Partial<LegalDeliveryDetails> | ((current: LegalDeliveryDetails) => LegalDeliveryDetails)) => onUpdate((current) => {
    const base = current.delivery || buildDefaultDeliveryDetails(settings, customer, undefined, current.aade_document_type);
    return { ...current, delivery: typeof updates === 'function' ? updates(base) : { ...base, ...updates } };
  });
  const updateAddress = (key: 'loading_address' | 'delivery_address', updates: Partial<LegalPartyAddress>) => updateDelivery((current) => ({
    ...current,
    [key]: { ...(current[key] || {}), ...updates },
  }));
  const selectMethod = (value: string) => {
    if (!editable) return;
    updateDelivery((current) => {
      const next = withDispatchMethod(current, value, carriers, suppliers);
      // Own vehicle: reuse the most recent plate so it is one click, not typing.
      return value === SBZ_OWN_MEANS_DISPATCH_METHOD && !next.vehicle_number && recentVehicles[0]
        ? { ...next, vehicle_number: recentVehicles[0] }
        : next;
    });
  };
  const selectCarrier = (carrierId: string) => {
    const carrier = carriers.find((item) => item.id === carrierId) || null;
    updateDelivery(carrierFields(carrier));
  };
  const openCarrierDraft = () => setCarrierDraft({ ...EMPTY_CARRIER_DRAFT, name: courier && carriers.length === 0 ? 'ACS Courier' : '' });
  const saveCarrierDraft = async () => {
    if (!carrierDraft?.name.trim()) return;
    const saved = await onCreateCarrier(carrierDraft);
    if (saved) {
      updateDelivery(carrierFields(saved));
      setCarrierDraft(null);
    }
  };

  const movePurposeSelect = (
    <SelectInput
      label="Σκοπός διακίνησης"
      field="delivery.move_purpose"
      required={includesDelivery}
      disabled={!editable}
      problem={problem('delivery.move_purpose')}
      value={delivery?.move_purpose || resolveLegalMovePurpose(null, settings, document.aade_document_type)}
      onChange={(value) => updateDelivery({ move_purpose: Number(value) || 1 })}
    >
      {Object.entries(SBZ_MOVE_PURPOSES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
    </SelectInput>
  );

  const toggle = canToggleDelivery ? (
    <label
      className={`flex cursor-pointer items-center justify-between gap-4 rounded-xl border p-3.5 transition ${includesDelivery ? 'border-emerald-300 bg-emerald-50/60' : 'border-slate-200 bg-white hover:border-slate-300'} ${!editable ? 'cursor-not-allowed opacity-70' : ''}`}
    >
      <span className="flex min-w-0 items-center gap-3">
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${includesDelivery ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-500'}`}><Truck size={18} /></span>
        <span className="min-w-0">
          <span className="block text-sm font-black text-slate-900">
            {includesDelivery ? 'Τιμολόγιο – Δελτίο Αποστολής' : 'Μόνο τιμολόγιο, χωρίς διακίνηση'}
          </span>
          <span className="block text-xs font-medium leading-snug text-slate-500">
            {includesDelivery
              ? 'Η διακίνηση διαβιβάζεται στη myDATA με την έκδοση και τυπώνεται το QR διακίνησης.'
              : 'Επιλέξτε το μόνο όταν δεν φεύγουν αγαθά με αυτό το τιμολόγιο.'}
          </span>
        </span>
      </span>
      <span className="relative inline-flex shrink-0 items-center">
        <input
          type="checkbox"
          className="peer sr-only"
          checked={includesDelivery}
          disabled={!editable}
          onChange={(event) => onToggleDelivery(event.target.checked)}
          aria-label="Με δελτίο διακίνησης"
        />
        <span className="h-6 w-11 rounded-full bg-slate-300 transition peer-checked:bg-emerald-600 peer-focus-visible:ring-2 peer-focus-visible:ring-emerald-300" />
        <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition peer-checked:translate-x-5" />
      </span>
    </label>
  ) : null;

  if (!includesDelivery) {
    return (
      <div className="min-w-0 space-y-4">
        {toggle}
        <fieldset disabled={!editable} className={`grid min-w-0 gap-3 sm:grid-cols-2 ${!editable ? 'opacity-60' : ''}`}>
          <SelectInput label="Τρόπος αποστολής" value={method} onChange={selectMethod} help="Εμφανίζεται μόνο στο PDF του παρόχου.">
            {SBZ_DISPATCH_METHODS.map((value) => <option key={value} value={value}>{value}</option>)}
          </SelectInput>
          {movePurposeSelect}
        </fieldset>
      </div>
    );
  }

  const branches = customer ? customerBranches(customer) : [];
  const counterpartAddress = document.counterpart.address || null;
  const settingsLoadingAddress = resolveLegalLoadingAddress(settings);
  const dispatchProblem = problem('delivery.dispatch');

  return (
    <div className="min-w-0 space-y-5">
      {toggle}
      {isStandalone ? (
        <Notice tone="sky" icon={Truck}>Δελτίο αποστολής 9.3: τα στοιχεία διακίνησης είναι υποχρεωτικά.</Notice>
      ) : null}

      <fieldset disabled={!editable} className={`min-w-0 space-y-5 ${!editable ? 'opacity-60' : ''}`}>
        <FieldGroup title="Πώς φεύγει το εμπόρευμα">
          <div role="radiogroup" aria-label="Τρόπος αποστολής" className="grid gap-2 sm:grid-cols-3">
            {DISPATCH_CHOICES.map((choice) => {
              const Icon = choice.icon;
              const active = method === choice.value;
              return (
                <button
                  key={choice.value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => selectMethod(choice.value)}
                  className={`flex items-center gap-3 rounded-xl border p-3 text-left transition ${active ? 'border-emerald-500 bg-emerald-50/70 ring-2 ring-emerald-100' : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'}`}
                >
                  <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${active ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-500'}`}><Icon size={17} /></span>
                  <span className="min-w-0 flex-1">
                    <span className={`block text-sm font-black ${active ? 'text-emerald-950' : 'text-slate-800'}`}>{choice.title}</span>
                    <span className="block truncate text-[11px] font-medium text-slate-500">{choice.detail}</span>
                  </span>
                  {active ? <Check size={16} className="shrink-0 text-emerald-600" /> : null}
                </button>
              );
            })}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {!ownMeans ? (
              <div className="min-w-0 space-y-2">
                <div data-legal-field="delivery.carrier" className="min-w-0">
                  <div className="mb-1 flex items-center gap-1 text-[11px] font-black uppercase tracking-wide text-slate-500">
                    {courier ? 'Εταιρεία courier' : 'Μεταφορέας'}<span className="text-red-500" aria-hidden>*</span>
                  </div>
                  {carriers.length > 0 ? (
                    <div role="radiogroup" aria-label={courier ? 'Εταιρεία courier' : 'Μεταφορέας'} className="grid gap-1.5">
                      {carriers.map((carrier) => {
                        const partner = linkedSupplier(suppliers, carrier);
                        const active = delivery?.carrier_id === carrier.id;
                        return (
                          <button
                            key={carrier.id}
                            type="button"
                            role="radio"
                            aria-checked={active}
                            onClick={() => selectCarrier(active ? '' : carrier.id)}
                            className={`flex items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left transition ${active ? 'border-emerald-500 bg-emerald-50/70 ring-2 ring-emerald-100' : problem('delivery.carrier') ? 'border-amber-300 bg-white hover:border-amber-400' : 'border-slate-200 bg-white hover:border-slate-300'}`}
                          >
                            <SupplierAvatar name={partner?.name || carrier.name} logoUrl={partner?.logo_url} size="sm" />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-black text-slate-900">{carrier.name}</span>
                              <span className="block truncate text-[11px] font-medium text-slate-500">
                                {[carrier.vat_number ? `ΑΦΜ ${carrier.vat_number}` : 'Χωρίς ΑΦΜ', carrier.is_default ? 'Προεπιλογή' : null].filter(Boolean).join(' · ')}
                              </span>
                            </span>
                            {active ? <Check size={16} className="shrink-0 text-emerald-600" /> : null}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-3 text-xs font-medium text-slate-500">
                      Δεν υπάρχουν αποθηκευμένοι μεταφορείς.
                    </div>
                  )}
                  {delivery?.carrier_name && !carriers.some((carrier) => carrier.id === delivery.carrier_id) ? (
                    <p className="mt-1 text-[11px] font-bold text-slate-500">Στο παραστατικό: {delivery.carrier_name}</p>
                  ) : null}
                  <FieldMessage problem={problem('delivery.carrier')} />
                </div>
                {carrierDraft ? (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-3">
                    <CarrierForm
                      compact
                      value={carrierDraft}
                      onChange={setCarrierDraft}
                      suppliers={suppliers}
                      busy={savingCarrier}
                      submitLabel="Αποθήκευση & επιλογή"
                      onSubmit={() => void saveCarrierDraft()}
                      onCancel={() => setCarrierDraft(null)}
                    />
                    <p className="mt-2 text-[11px] font-medium text-slate-500">Αποθηκεύεται στους μεταφορείς (Ρυθμίσεις) για τα επόμενα παραστατικά.</p>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={openCarrierDraft}
                    className="inline-flex items-center gap-1 rounded-lg px-1 py-0.5 text-xs font-black text-emerald-700 transition hover:bg-emerald-50"
                  >
                    <Plus size={13} /> {carriers.length === 0 && courier ? 'Προσθήκη ACS (ή άλλου courier)' : 'Νέος μεταφορέας'}
                  </button>
                )}
              </div>
            ) : null}

            {!courier ? (
              <div className="min-w-0 space-y-2">
                <TextInput
                  label={ownMeans ? 'Αρ. κυκλοφορίας οχήματος' : 'Όχημα μεταφορέα'}
                  field="delivery.vehicle"
                  value={delivery?.vehicle_number || ''}
                  placeholder={delivery?.carrier_vehicle_number || 'π.χ. ΙΚΑ 1234'}
                  problem={problem('delivery.vehicle')}
                  onChange={(vehicle_number) => updateDelivery({ vehicle_number: vehicle_number.toLocaleUpperCase('el-GR') })}
                />
                {ownMeans && recentVehicles.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] font-bold text-slate-400">Πρόσφατα:</span>
                    {recentVehicles.map((vehicle) => (
                      <button
                        key={vehicle}
                        type="button"
                        onClick={() => updateDelivery({ vehicle_number: vehicle })}
                        className={`rounded-full border px-2.5 py-0.5 font-mono text-[11px] font-black transition ${delivery?.vehicle_number === vehicle ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}
                      >
                        {vehicle}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </FieldGroup>

        <FieldGroup title="Έναρξη διακίνησης" hint="Ώρα Ελλάδας">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)_auto_minmax(0,1.4fr)] sm:items-start" data-legal-field="delivery.dispatch">
            <TextInput
              label="Ημερομηνία"
              type="date"
              required
              min={toAthensIsoDate()}
              value={delivery?.dispatch_date || ''}
              problem={dispatchProblem && (dispatchProblem.severity === 'error' ? { ...dispatchProblem, message: '' } : null)}
              onChange={(dispatch_date) => updateDelivery({ dispatch_date })}
            />
            <TextInput
              label="Ώρα"
              type="time"
              required
              value={(delivery?.dispatch_time || '').slice(0, 5)}
              problem={dispatchProblem && !delivery?.dispatch_time ? { ...dispatchProblem, message: '' } : null}
              onChange={(value) => updateDelivery({ dispatch_time: value ? `${value}:00` : '' })}
            />
            <div className="pt-5">
              <button
                type="button"
                onClick={() => updateDelivery({ dispatch_date: toAthensIsoDate(), dispatch_time: toAthensTime() })}
                className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-800"
                title="Ημερομηνία και ώρα τώρα (Ελλάδα)"
              >
                <Clock size={14} /> Τώρα
              </button>
            </div>
            {movePurposeSelect}
          </div>
          <FieldMessage problem={dispatchProblem} />
        </FieldGroup>

        <FieldGroup title="Από πού προς πού">
          <div className="grid gap-3 lg:grid-cols-2">
            <AddressCard
              icon={Warehouse}
              title="Φόρτωση"
              field="delivery.loading_address"
              address={delivery?.loading_address}
              problem={problem('delivery.loading_address')}
              disabled={!editable}
              onChange={(updates) => updateAddress('loading_address', updates)}
              toolbar={settingsLoadingAddress && !sameAddress(delivery?.loading_address, settingsLoadingAddress) ? (
                <button
                  type="button"
                  onClick={() => updateDelivery({ loading_address: { ...settingsLoadingAddress } })}
                  className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-black text-slate-500 transition hover:bg-white hover:text-slate-800"
                >
                  <RotateCcw size={12} /> Από ρυθμίσεις
                </button>
              ) : null}
            />
            <AddressCard
              icon={MapPin}
              title="Παράδοση"
              field="delivery.delivery_address"
              address={delivery?.delivery_address}
              problem={problem('delivery.delivery_address')}
              disabled={!editable}
              onChange={(updates) => updateAddress('delivery_address', updates)}
              toolbar={(
                <div className="flex flex-wrap items-center gap-1.5">
                  {customer && branches.length > 0 ? (
                    <select
                      aria-label="Σημείο παράδοσης πελάτη"
                      value={deliveryBranchValue(customer, delivery?.delivery_address)}
                      onChange={(event) => {
                        const value = event.target.value;
                        if (value === 'custom') return;
                        updateDelivery({
                          delivery_address: resolveCustomerDeliveryAddress(customer, value === 'fiscal' ? null : value)
                            ?? (value === 'fiscal' && customer.address ? parseLegalPartyAddress(customer.address) : null),
                        });
                      }}
                      className="h-7 max-w-52 rounded-md border border-slate-200 bg-white px-1.5 text-[11px] font-bold text-slate-700 outline-hidden focus:border-emerald-500"
                    >
                      {deliveryBranchValue(customer, delivery?.delivery_address) === 'custom' && <option value="custom">Χειροκίνητη διεύθυνση</option>}
                      {branches.map((branch) => (
                        <option key={branch.id} value={branch.id}>Κατάστημα: {branch.label}{branch.city ? ` (${branch.city})` : ''}</option>
                      ))}
                      <option value="fiscal">Φορολογική έδρα</option>
                    </select>
                  ) : null}
                  {counterpartAddress?.street && !sameAddress(delivery?.delivery_address, counterpartAddress) ? (
                    <button
                      type="button"
                      onClick={() => updateDelivery({ delivery_address: { ...counterpartAddress } })}
                      className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-black text-slate-500 transition hover:bg-white hover:text-slate-800"
                    >
                      <Building2 size={12} /> {document.counterpart.supplier_id ? 'Έδρα συνεργάτη' : 'Έδρα πελάτη'}
                    </button>
                  ) : null}
                </div>
              )}
            />
          </div>
        </FieldGroup>
      </fieldset>
      {!editable ? null : (
        <p className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400">
          <CalendarClock size={12} /> Η έναρξη δεν μπορεί να είναι σε παρελθούσα ημερομηνία. Αν εκδώσετε άλλη μέρα, πατήστε «Τώρα».
        </p>
      )}
    </div>
  );
}
