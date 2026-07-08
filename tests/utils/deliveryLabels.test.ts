import { describe, expect, it } from 'vitest';
import { RETAIL_CUSTOMER_ID, RETAIL_CUSTOMER_NAME, RETAIL_NOTE_PREFIX } from '../../lib/supabase';
import { getOrderDisplayName } from '../../utils/deliveryLabels';

describe('getOrderDisplayName', () => {
  it('shows the final retail client when the retail order has the system customer id', () => {
    expect(getOrderDisplayName({
      customer_id: RETAIL_CUSTOMER_ID,
      customer_name: RETAIL_CUSTOMER_NAME,
      notes: `${RETAIL_NOTE_PREFIX} Maria Papadopoulou`,
    })).toBe(`${RETAIL_CUSTOMER_NAME} · Maria Papadopoulou`);
  });

  it('shows the final retail client when legacy retail order data only has the retail customer name', () => {
    expect(getOrderDisplayName({
      customer_name: RETAIL_CUSTOMER_NAME,
      notes: `${RETAIL_NOTE_PREFIX} Eleni Nikolaou`,
    })).toBe(`${RETAIL_CUSTOMER_NAME} · Eleni Nikolaou`);
  });
});
