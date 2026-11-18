import { describe, expect, it } from 'vitest';
import { preferredCarrier, withDispatchMethod } from '../../components/legal/issue/DeliveryPanel';
import { SBZ_COURIER_DISPATCH_METHOD, SBZ_OWN_MEANS_DISPATCH_METHOD } from '../../utils/legalDocuments';
import type { LegalCarrier, Supplier } from '../../types';

const carrier = (id: string, name: string, extra: Partial<LegalCarrier> = {}): LegalCarrier => ({ id, name, ...extra });
const acsPartner: Supplier = { id: 'sup-acs', name: 'ACS Ταχυδρομικές Υπηρεσίες', kind: 'service' };

describe('default carrier for delivery notes', () => {
  it('picks ACS when no carrier is marked default', () => {
    const carriers = [carrier('a', 'Γενική Ταχυδρομική'), carrier('b', 'ACS Courier')];
    expect(preferredCarrier(carriers)?.id).toBe('b');
  });

  it('recognises ACS through the linked partner', () => {
    const carriers = [carrier('a', 'Γενική Ταχυδρομική'), carrier('b', 'Courier Αθήνας', { supplier_id: 'sup-acs' })];
    expect(preferredCarrier(carriers, [acsPartner])?.id).toBe('b');
  });

  it('respects the carrier marked default in Settings', () => {
    const carriers = [carrier('a', 'Γενική Ταχυδρομική', { is_default: true }), carrier('b', 'ACS Courier')];
    expect(preferredCarrier(carriers)?.id).toBe('a');
  });

  it('switching to courier selects ACS and drops our own plate; own means clears the carrier', () => {
    const carriers = [carrier('b', 'ACS Courier', { vat_number: '123456789' })];
    const courier = withDispatchMethod({ dispatch_method: SBZ_OWN_MEANS_DISPATCH_METHOD, vehicle_number: 'ΙΚΑ1234' }, SBZ_COURIER_DISPATCH_METHOD, carriers);
    expect(courier).toMatchObject({ dispatch_method: SBZ_COURIER_DISPATCH_METHOD, carrier_id: 'b', carrier_name: 'ACS Courier', carrier_vat_number: '123456789', vehicle_number: '' });
    const own = withDispatchMethod(courier, SBZ_OWN_MEANS_DISPATCH_METHOD, carriers);
    expect(own).toMatchObject({ dispatch_method: SBZ_OWN_MEANS_DISPATCH_METHOD, carrier_id: null, carrier_name: null });
  });
});
