import { expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: mocks.from }) }));
import { api } from '../../lib/supabase';
import { RETAIL_CUSTOMER_ID } from '../../utils/retailConstants';

it('rejects all public mutations of the shared retail identity before touching storage', async () => {
  await expect(api.saveCustomer({ id: RETAIL_CUSTOMER_ID, vat_number: '124471700' })).rejects.toThrow('ξεχωριστή καρτέλα');
  await expect(api.saveCustomer({ id: RETAIL_CUSTOMER_ID, full_name: 'A person' })).rejects.toThrow();
  await expect(api.updateCustomer(RETAIL_CUSTOMER_ID, { vat_number: '124471700' })).rejects.toThrow();
  await expect(api.deleteCustomer(RETAIL_CUSTOMER_ID)).rejects.toThrow();
  expect(mocks.from).not.toHaveBeenCalled();
});
