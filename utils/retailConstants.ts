/** Stable identity of the shared retail account; never use it as a person's identity. */
export const RETAIL_CUSTOMER_ID = '00000000-0000-0000-0000-000000000003';
export const RETAIL_CUSTOMER_NAME = 'Λιανική';
export const RETAIL_NOTE_PREFIX = '[ΛΙΑΝΙΚΗ_ΠΕΛΑΤΗΣ]:';

/**
 * Stable identity of the internal-orders account («Εσωτερική παραγγελία»): orders we place for
 * ourselves (stock, showroom, samples). They go through production like any order, but are
 * not sales: excluded from revenue/analytics, commissions, customer KPIs, maps and invoicing.
 */
export const INTERNAL_CUSTOMER_ID = '00000000-0000-0000-0000-000000000004';
export const INTERNAL_CUSTOMER_NAME = 'Εσωτερική παραγγελία';

/** Accounts created by the system, never real customers. */
export const SYSTEM_CUSTOMER_IDS: ReadonlySet<string> = new Set([RETAIL_CUSTOMER_ID, INTERNAL_CUSTOMER_ID]);
export const SYSTEM_CUSTOMER_NAMES: ReadonlySet<string> = new Set([RETAIL_CUSTOMER_NAME, INTERNAL_CUSTOMER_NAME]);

export const isSystemCustomerId = (id?: string | null): boolean => Boolean(id && SYSTEM_CUSTOMER_IDS.has(id));
export const isReservedCustomerName = (name?: string | null): boolean => SYSTEM_CUSTOMER_NAMES.has((name || '').trim());
