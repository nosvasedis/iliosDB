import { Check, Link2 } from 'lucide-react';
import type { LegalCarrier, Supplier } from '../../../types';
import { normalizeVatNumber } from '../../../utils/legalDocuments';
import { SupplierAvatar } from '../../suppliers/SupplierCard';
import { ActionButton, SelectInput, TextInput } from './ui';

export interface CarrierDraft {
  name: string;
  vat_number: string;
  vehicle_number: string;
  phone: string;
  supplier_id: string | null;
}

export const EMPTY_CARRIER_DRAFT: CarrierDraft = { name: '', vat_number: '', vehicle_number: '', phone: '', supplier_id: null };

export const carrierToDraft = (carrier: LegalCarrier): CarrierDraft => ({
  name: carrier.name || '',
  vat_number: carrier.vat_number || '',
  vehicle_number: carrier.vehicle_number || '',
  phone: carrier.phone || '',
  supplier_id: carrier.supplier_id || null,
});

/** Carrier record from a draft; keeps id, default flag and other stored fields of an existing carrier. */
export const draftToCarrier = (draft: CarrierDraft, existing: LegalCarrier | null, isFirst: boolean): LegalCarrier => ({
  ...(existing || {}),
  id: existing?.id || crypto.randomUUID(),
  name: draft.name.trim(),
  vat_number: normalizeVatNumber(draft.vat_number) || null,
  vehicle_number: draft.vehicle_number.trim() || null,
  phone: draft.phone.trim() || null,
  supplier_id: draft.supplier_id || null,
  is_default: existing ? existing.is_default : isFirst,
});

export const carrierVatProblem = (vat: string) => (vat && normalizeVatNumber(vat).length !== 9 ? 'Ο ΑΦΜ έχει 9 ψηφία.' : null);

/** Suppliers offered for linking: services (couriers, transport) first, inactive ones only if already linked. */
export function carrierSupplierOptions(suppliers: Supplier[], linkedId?: string | null): Supplier[] {
  return suppliers
    .filter((supplier) => supplier.is_active !== false || supplier.id === linkedId)
    .sort((a, b) => {
      const rank = (supplier: Supplier) => (supplier.kind === 'service' ? 0 : 1);
      return rank(a) - rank(b) || a.name.localeCompare(b.name, 'el');
    });
}

/** The partner a carrier is linked to, for its logo. */
export const linkedSupplier = (suppliers: Supplier[], carrier?: Pick<LegalCarrier, 'supplier_id'> | null) =>
  carrier?.supplier_id ? suppliers.find((supplier) => supplier.id === carrier.supplier_id) || null : null;

/** Add/edit form for a carrier, optionally linked to a «Προμηθευτές & Συνεργάτες» partner. */
export default function CarrierForm({
  value,
  onChange,
  suppliers,
  onSubmit,
  onCancel,
  submitLabel,
  busy,
  compact = false,
}: {
  value: CarrierDraft;
  onChange: (value: CarrierDraft) => void;
  suppliers: Supplier[];
  onSubmit: () => void;
  onCancel?: () => void;
  submitLabel: string;
  busy: boolean;
  /** Two columns, no vehicle/phone: for the quick add inside the Διακίνηση tab. */
  compact?: boolean;
}) {
  const options = carrierSupplierOptions(suppliers, value.supplier_id);
  const linked = value.supplier_id ? suppliers.find((supplier) => supplier.id === value.supplier_id) || null : null;
  const vatProblem = carrierVatProblem(value.vat_number);
  const selectSupplier = (supplierId: string) => {
    const supplier = suppliers.find((item) => item.id === supplierId);
    if (!supplier) {
      onChange({ ...value, supplier_id: null });
      return;
    }
    onChange({
      ...value,
      supplier_id: supplier.id,
      name: supplier.name,
      vat_number: normalizeVatNumber(supplier.vat_number) || value.vat_number,
      phone: supplier.phone || value.phone,
    });
  };

  return (
    <div className="min-w-0 space-y-3">
      <div className="flex items-end gap-2.5">
        {linked ? <SupplierAvatar name={linked.name} logoUrl={linked.logo_url} size="sm" /> : (
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-400"><Link2 size={15} /></span>
        )}
        <div className="min-w-0 flex-1">
          <SelectInput
            label="Σύνδεση με συνεργάτη"
            value={value.supplier_id || ''}
            onChange={selectSupplier}
            help="Από τους «Προμηθευτές & Συνεργάτες»: συμπληρώνει όνομα, ΑΦΜ και τηλέφωνο και δείχνει το λογότυπό του."
          >
            <option value="">— Χωρίς σύνδεση —</option>
            {options.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.name}{supplier.vat_number ? ` · ΑΦΜ ${supplier.vat_number}` : ''}{supplier.is_active === false ? ' (ανενεργός)' : ''}
              </option>
            ))}
          </SelectInput>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <TextInput label="Επωνυμία" required value={value.name} onChange={(name) => onChange({ ...value, name })} />
        <TextInput
          label="ΑΦΜ"
          inputMode="numeric"
          value={value.vat_number}
          problem={vatProblem ? { severity: 'warning', message: vatProblem } : null}
          onChange={(vat_number) => onChange({ ...value, vat_number: normalizeVatNumber(vat_number) })}
        />
        {!compact ? (
          <>
            <TextInput label="Όχημα" value={value.vehicle_number} onChange={(vehicle_number) => onChange({ ...value, vehicle_number })} />
            <TextInput label="Τηλέφωνο" value={value.phone} onChange={(phone) => onChange({ ...value, phone })} />
          </>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2">
        <ActionButton variant={compact ? 'primary' : 'secondary'} onClick={onSubmit} disabled={busy || !value.name.trim() || !!vatProblem}>
          <Check size={15} /> {submitLabel}
        </ActionButton>
        {onCancel ? <ActionButton variant="quiet" onClick={onCancel} disabled={busy}>Άκυρο</ActionButton> : null}
      </div>
    </div>
  );
}
