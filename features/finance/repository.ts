import { withProtectedWrites } from '../../lib/appUpdates';
import { isLocalMode, supabase } from '../../lib/supabase';
import type {
  FinanceBilling,
  FinanceCategory,
  FinanceCustomerTerms,
  FinanceExpense,
  FinanceExpensePayment,
  FinanceOrderBilling,
  FinanceRateCard,
  FinanceReceipt,
  FinanceRecurring,
  FinanceWorkerStatement,
  FinanceWorkspace,
  ProductionStageAssignment,
} from './types';

/** Every finance table. None may ever appear in the inspection allowlists. */
export const FINANCE_TABLES = [
  'finance_categories',
  'finance_recurring',
  'finance_expenses',
  'finance_expense_payments',
  'finance_rate_cards',
  'finance_worker_statements',
  'production_stage_assignments',
  'finance_customer_terms',
  'finance_order_billing',
  'finance_receipts',
] as const;

export type FinanceTable = typeof FINANCE_TABLES[number];

function financeErrorMessage(error: { message?: string; code?: string } | null | undefined): string {
  if (!error) return 'Άγνωστο σφάλμα οικονομικών.';
  if (error.code === '42501') return 'Ο Οικονομικός Έλεγχος είναι διαθέσιμος μόνο σε διαχειριστές.';
  if (error.code === '23505') return 'Η εγγραφή έχει ήδη καταχωριστεί.';
  if (error.code === '23503') return 'Η εγγραφή συνδέεται με άλλα στοιχεία και δεν μπορεί να αλλάξει έτσι.';
  return error.message || 'Αποτυχία αποθήκευσης οικονομικών στοιχείων.';
}

function assertOnline(): void {
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  if (isLocalMode || offline) {
    throw new Error('Ο Οικονομικός Έλεγχος απαιτεί ενεργή σύνδεση. Δεν αποθηκεύτηκε καμία αλλαγή.');
  }
}

async function rows<T>(table: FinanceTable, orderColumn: string, ascending = false): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select('*').order(orderColumn, { ascending }).range(from, from + 999);
    if (error) throw new Error(financeErrorMessage(error));
    all.push(...((data || []) as T[]));
    if (!data || data.length < 1000) return all;
  }
}

const num = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

/** PostgREST returns numeric columns as strings. */
function normalizeExpense(row: any): FinanceExpense {
  return {
    ...row,
    lines: Array.isArray(row.lines) ? row.lines : [],
    amount_net: num(row.amount_net),
    vat_rate: num(row.vat_rate),
    vat_amount: num(row.vat_amount),
    amount_gross: num(row.amount_gross),
    paid_amount: num(row.paid_amount),
  };
}

async function upsertRow<T extends object>(table: FinanceTable, row: T, onConflict = 'id'): Promise<T> {
  assertOnline();
  const { data, error } = await supabase.from(table).upsert(row, { onConflict }).select().single();
  if (error) throw new Error(financeErrorMessage(error));
  return data as T;
}

async function deleteRow(table: FinanceTable, column: string, value: string): Promise<void> {
  assertOnline();
  const { error } = await supabase.from(table).delete().eq(column, value);
  if (error) throw new Error(financeErrorMessage(error));
}

export const financeRepository = withProtectedWrites({
  async getWorkspace(): Promise<FinanceWorkspace> {
    if (isLocalMode) {
      return {
        categories: [], expenses: [], expensePayments: [], recurring: [], rateCards: [],
        statements: [], assignments: [], customerTerms: [], orderBilling: [], receipts: [],
      };
    }
    const [
      categories, expenses, expensePayments, recurring, rateCards,
      statements, assignments, customerTerms, orderBilling, receipts,
    ] = await Promise.all([
      rows<FinanceCategory>('finance_categories', 'position', true),
      rows<any>('finance_expenses', 'expense_date'),
      rows<any>('finance_expense_payments', 'paid_at'),
      rows<any>('finance_recurring', 'next_due', true),
      rows<any>('finance_rate_cards', 'priority'),
      rows<any>('finance_worker_statements', 'created_at'),
      rows<ProductionStageAssignment>('production_stage_assignments', 'assigned_at'),
      rows<any>('finance_customer_terms', 'updated_at'),
      rows<any>('finance_order_billing', 'updated_at'),
      rows<any>('finance_receipts', 'received_at'),
    ]);
    return {
      categories: categories.map((row) => ({ ...row, monthly_budget: row.monthly_budget == null ? null : num(row.monthly_budget) })),
      expenses: expenses.map(normalizeExpense),
      expensePayments: expensePayments.map((row) => ({ ...row, amount: num(row.amount) })),
      recurring: recurring.map((row) => ({ ...row, estimated_amount: num(row.estimated_amount) })),
      rateCards: rateCards.map((row) => ({ ...row, rate: num(row.rate), match: row.match || {} })),
      statements: statements.map((row) => ({ ...row, total: num(row.total), lines: Array.isArray(row.lines) ? row.lines : [] })),
      assignments,
      customerTerms: customerTerms.map((row) => ({ ...row, t_percent: num(row.t_percent) })),
      orderBilling: orderBilling.map((row) => ({
        ...row,
        t_percent: num(row.t_percent),
        agreed_total: row.agreed_total == null ? null : num(row.agreed_total),
      })),
      receipts: receipts.map((row) => ({ ...row, amount: num(row.amount) })),
    };
  },

  saveCategory: (category: Partial<FinanceCategory> & { name: string }) =>
    upsertRow('finance_categories', { ...category, updated_at: new Date().toISOString() }),
  async saveCategoryOrder(updates: Array<Pick<FinanceCategory, 'id' | 'parent_id' | 'position'>>): Promise<void> {
    assertOnline();
    for (const update of updates) {
      const { error } = await supabase.from('finance_categories')
        .update({ parent_id: update.parent_id, position: update.position, updated_at: new Date().toISOString() })
        .eq('id', update.id);
      if (error) throw new Error(financeErrorMessage(error));
    }
  },
  deleteCategory: (id: string) => deleteRow('finance_categories', 'id', id),

  async saveExpense(expense: Partial<FinanceExpense> & Pick<FinanceExpense, 'category_id' | 'amount_gross'>): Promise<FinanceExpense> {
    const { paid_amount: _paid, ...writable } = expense;
    return normalizeExpense(await upsertRow('finance_expenses', { ...writable, updated_at: new Date().toISOString() }));
  },
  /** Creates automatic expenses once per source; an existing source row is left untouched. */
  async insertExpensesIgnoringDuplicates(expenses: Array<Partial<FinanceExpense>>): Promise<void> {
    if (expenses.length === 0) return;
    assertOnline();
    for (const expense of expenses) {
      const { error } = await supabase.from('finance_expenses').insert(expense);
      if (error && error.code !== '23505') throw new Error(financeErrorMessage(error));
    }
  },
  deleteExpense: (id: string) => deleteRow('finance_expenses', 'id', id),

  savePayment: (payment: Partial<FinanceExpensePayment> & Pick<FinanceExpensePayment, 'amount'>) =>
    upsertRow('finance_expense_payments', payment),
  deletePayment: (id: string) => deleteRow('finance_expense_payments', 'id', id),

  saveRecurring: (recurring: Partial<FinanceRecurring> & Pick<FinanceRecurring, 'category_id' | 'next_due'>) =>
    upsertRow('finance_recurring', { ...recurring, updated_at: new Date().toISOString() }),
  deleteRecurring: (id: string) => deleteRow('finance_recurring', 'id', id),

  saveRateCard: (card: Partial<FinanceRateCard> & Pick<FinanceRateCard, 'party_id' | 'label'>) =>
    upsertRow('finance_rate_cards', { ...card, updated_at: new Date().toISOString() }),
  deleteRateCard: (id: string) => deleteRow('finance_rate_cards', 'id', id),

  async saveAssignments(assignments: Array<Omit<ProductionStageAssignment, 'id' | 'assigned_at'> & { id?: string }>): Promise<void> {
    if (assignments.length === 0) return;
    assertOnline();
    const { error } = await supabase.from('production_stage_assignments')
      .upsert(assignments, { onConflict: 'batch_id,stage' });
    if (error) throw new Error(financeErrorMessage(error));
  },
  deleteAssignment: (id: string) => deleteRow('production_stage_assignments', 'id', id),

  saveStatement: (statement: Partial<FinanceWorkerStatement> & Pick<FinanceWorkerStatement, 'party_id'>) =>
    upsertRow('finance_worker_statements', statement),
  deleteStatement: (id: string) => deleteRow('finance_worker_statements', 'id', id),
  async confirmStatement(statementId: string, categoryId: string, billing: FinanceBilling, expenseDate: string): Promise<string> {
    assertOnline();
    const { data, error } = await supabase.rpc('finance_confirm_worker_statement_v1', {
      p_statement_id: statementId,
      p_category_id: categoryId,
      p_billing: billing,
      p_expense_date: expenseDate,
    });
    if (error) throw new Error(financeErrorMessage(error));
    return data as string;
  },

  saveCustomerTerms: (terms: FinanceCustomerTerms) =>
    upsertRow('finance_customer_terms', { ...terms, updated_at: new Date().toISOString() }, 'customer_id'),
  saveOrderBilling: (billing: FinanceOrderBilling) =>
    upsertRow('finance_order_billing', { ...billing, updated_at: new Date().toISOString() }, 'order_id'),
  deleteOrderBilling: (orderId: string) => deleteRow('finance_order_billing', 'order_id', orderId),

  saveReceipt: (receipt: Partial<FinanceReceipt> & Pick<FinanceReceipt, 'amount' | 'billing'>) =>
    upsertRow('finance_receipts', receipt),
  deleteReceipt: (id: string) => deleteRow('finance_receipts', 'id', id),
});
