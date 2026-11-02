/** Τ = με παραστατικό (τιμολόγιο), Χ = χωρίς παραστατικό (μετρητά). */
export type FinanceBilling = 'T' | 'X';
export type FinanceBillingMode = 'T' | 'X' | 'split';
export type FinancePaymentMethod = 'cash' | 'bank' | 'card' | 'cheque';
export type FinancePartyKind = 'supplier' | 'worker' | 'utility' | 'service' | 'person';
export type FinanceCategoryNature = 'fixed' | 'variable';
export type FinanceCategoryLinkKind =
  | 'materials' | 'stx' | 'metal' | 'stones' | 'worker' | 'seller_commission' | 'travel' | 'utility';
export type FinanceExpenseStatus = 'unpaid' | 'partial' | 'paid' | 'expected';
export type FinanceExpenseSource = 'manual' | 'supplier_order' | 'worker_statement' | 'commission' | 'recurring';
export type FinanceRecurringFrequency = 'monthly' | 'bimonthly' | 'quarterly' | 'yearly';
export type FinanceRateUnit = 'per_stone' | 'per_piece' | 'per_gram' | 'per_hour' | 'fixed';

export interface FinanceCategory {
  id: string;
  parent_id: string | null;
  name: string;
  icon?: string | null;
  color?: string | null;
  nature: FinanceCategoryNature;
  link_kind?: FinanceCategoryLinkKind | null;
  default_party_id?: string | null;
  default_billing?: FinanceBilling | null;
  monthly_budget?: number | null;
  position: number;
  is_archived: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface FinanceExpenseLine {
  label: string;
  qty: number;
  unit?: string;
  unit_price: number;
  /** Optional references kept when a line is generated from another module. */
  assignment_id?: string;
  material_id?: string;
  sku?: string;
}

export interface FinanceExpense {
  id: string;
  category_id: string;
  party_id?: string | null;
  expense_date: string;
  due_date?: string | null;
  description?: string | null;
  doc_ref?: string | null;
  lines: FinanceExpenseLine[];
  amount_net: number;
  vat_rate: number;
  vat_amount: number;
  amount_gross: number;
  billing: FinanceBilling;
  paid_amount: number;
  status: FinanceExpenseStatus;
  payment_method?: FinancePaymentMethod | null;
  attachment_key?: string | null;
  source_kind: FinanceExpenseSource;
  source_id?: string | null;
  recurring_id?: string | null;
  notes?: string | null;
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface FinanceExpensePayment {
  id: string;
  party_id?: string | null;
  expense_id?: string | null;
  paid_at: string;
  amount: number;
  method: FinancePaymentMethod;
  billing: FinanceBilling;
  notes?: string | null;
  created_at?: string;
}

export interface FinanceRecurring {
  id: string;
  category_id: string;
  party_id?: string | null;
  description?: string | null;
  estimated_amount: number;
  billing: FinanceBilling;
  frequency: FinanceRecurringFrequency;
  day_of_period: number;
  /** Anchor date of the first occurrence; later ones follow the frequency. */
  next_due: string;
  is_active: boolean;
}

export interface FinanceRateCardMatch {
  stage?: string;
  material_id?: string;
  stone_code?: string;
  category?: string;
  sku_prefix?: string;
}

export interface FinanceRateCard {
  id: string;
  party_id: string;
  label: string;
  unit: FinanceRateUnit;
  rate: number;
  match: FinanceRateCardMatch;
  priority: number;
  is_active: boolean;
}

export interface ProductionStageAssignment {
  id: string;
  batch_id: string;
  stage: string;
  party_id: string;
  sku?: string | null;
  variant_suffix?: string | null;
  quantity: number;
  assigned_at: string;
  statement_id?: string | null;
  notes?: string | null;
}

export interface FinanceStatementLine {
  assignment_id?: string;
  batch_id?: string;
  sku?: string;
  variant_suffix?: string | null;
  quantity: number;
  rate_card_id?: string;
  label: string;
  unit: FinanceRateUnit;
  units: number;
  rate: number;
  amount: number;
}

export interface FinanceWorkerStatement {
  id: string;
  party_id: string;
  period_from?: string | null;
  period_to?: string | null;
  status: 'draft' | 'confirmed';
  lines: FinanceStatementLine[];
  total: number;
  expense_id?: string | null;
  notes?: string | null;
  created_at?: string;
  confirmed_at?: string | null;
}

export interface FinanceCustomerTerms {
  customer_id: string;
  default_mode: FinanceBillingMode;
  t_percent: number;
  notes?: string | null;
}

export interface FinanceOrderBilling {
  order_id: string;
  mode: FinanceBillingMode;
  t_percent: number;
  agreed_total?: number | null;
  due_date?: string | null;
  notes?: string | null;
}

export interface FinanceReceipt {
  id: string;
  customer_id?: string | null;
  order_id?: string | null;
  received_at: string;
  amount: number;
  billing: FinanceBilling;
  method: FinancePaymentMethod;
  legal_document_id?: string | null;
  notes?: string | null;
  created_at?: string;
}

export interface FinanceWorkspace {
  categories: FinanceCategory[];
  expenses: FinanceExpense[];
  expensePayments: FinanceExpensePayment[];
  recurring: FinanceRecurring[];
  rateCards: FinanceRateCard[];
  statements: FinanceWorkerStatement[];
  assignments: ProductionStageAssignment[];
  customerTerms: FinanceCustomerTerms[];
  orderBilling: FinanceOrderBilling[];
  receipts: FinanceReceipt[];
}

export interface FinancePeriod {
  /** Inclusive ISO date (yyyy-mm-dd). */
  from: string;
  /** Inclusive ISO date (yyyy-mm-dd). */
  to: string;
}
