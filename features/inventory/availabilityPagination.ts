export const INVENTORY_AVAILABILITY_PAGE_SIZE = 1000;

export interface InventoryAvailabilityPage<Row> {
  rows: Row[];
  totalCount: number | null;
}

export type InventoryAvailabilityPageLoader<Row> = (
  from: number,
  to: number,
  includeCount: boolean,
) => Promise<InventoryAvailabilityPage<Row>>;

/**
 * PostgREST limits a response to the project's configured maximum row count.
 * Inventory must therefore be read in verified pages; a partial catalogue must
 * never be mistaken for legitimate zero balances.
 */
export async function loadAllInventoryAvailabilityPages<Row>(
  loadPage: InventoryAvailabilityPageLoader<Row>,
  getIdentity: (row: Row) => string,
  pageSize = INVENTORY_AVAILABILITY_PAGE_SIZE,
): Promise<Row[]> {
  if (!Number.isInteger(pageSize) || pageSize <= 0) {
    throw new Error('Δεν ήταν δυνατή η ανάγνωση των υπολοίπων αποθέματος. Το μέγεθος σελίδας δεν είναι έγκυρο. Δεν μεταβλήθηκε κανένα δεδομένο. Ανανεώστε τη σελίδα και δοκιμάστε ξανά.');
  }

  const rows: Row[] = [];
  let expectedCount: number | null = null;

  for (let from = 0; ; from += pageSize) {
    const page = await loadPage(from, from + pageSize - 1, from === 0);

    if (from === 0) {
      expectedCount = page.totalCount;
      if (expectedCount === null || !Number.isInteger(expectedCount) || expectedCount < 0) {
        throw new Error('Δεν ήταν δυνατή η επαλήθευση των υπολοίπων αποθέματος. Η βάση δεδομένων δεν επέστρεψε το συνολικό πλήθος εγγραφών. Δεν μεταβλήθηκε κανένα δεδομένο. Ανανεώστε τη σελίδα και δοκιμάστε ξανά.');
      }
    }

    rows.push(...page.rows);

    if (page.rows.length < pageSize || rows.length >= (expectedCount ?? 0)) break;
  }

  if (expectedCount === null || rows.length !== expectedCount) {
    throw new Error(`Η φόρτωση των υπολοίπων αποθέματος δεν ολοκληρώθηκε. Ανακτήθηκαν ${rows.length.toLocaleString('el-GR')} από ${Number(expectedCount || 0).toLocaleString('el-GR')} εγγραφές. Δεν μεταβλήθηκε κανένα δεδομένο. Ανανεώστε τη σελίδα και δοκιμάστε ξανά.`);
  }

  const identities = new Set<string>();
  for (const row of rows) {
    const identity = getIdentity(row);
    if (identities.has(identity)) {
      throw new Error('Η φόρτωση των υπολοίπων αποθέματος εντόπισε διπλή θέση αποθέματος. Δεν μεταβλήθηκε κανένα δεδομένο. Ανανεώστε τη σελίδα και, αν το πρόβλημα παραμένει, επικοινωνήστε με τον διαχειριστή.');
    }
    identities.add(identity);
  }

  return rows;
}
