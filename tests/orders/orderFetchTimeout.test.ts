import { describe, expect, it } from 'vitest';
import { getTablePageTimeoutMs } from '../../lib/supabase';

describe('order fetch timeout configuration', () => {
  it('gives full orders reads enough time before using offline cache fallback', () => {
    expect(getTablePageTimeoutMs('orders')).toBeGreaterThanOrEqual(12000);
  });

  it('keeps lightweight tables on the default timeout', () => {
    expect(getTablePageTimeoutMs('customers')).toBe(4000);
  });
});

