import { describe, expect, it } from 'vitest';
import { MaterialType, OrderStatus, type Customer, type Material, type Order, type Product, type Supplier } from '../../types';
import { buildCategoryTree, categoryBreadcrumb, inheritedCategoryValue, reorderSiblings, rollUpTotals, wouldCreateCycle } from '../../features/finance/categoryTree';
import { buildPartyBalances, buildPartyStatement, computeAmounts, summarizeExpenses } from '../../features/finance/expenseLedger';
import { addMonths, previousPeriod, resolvePeriod, splitExpected } from '../../features/finance/financeMath';
import { agingBucket, buildCustomerBalances, buildOrderIncome, buildPipeline, suggestReceiptSplit } from '../../features/finance/incomeLedger';
import { occurrences, pendingRecurringExpenses } from '../../features/finance/recurring';
import { suggestStatement } from '../../features/finance/workerStatements';
import { buildSellerCommissions } from '../../features/finance/commissions';
import { buildCashflowForecast } from '../../features/finance/cashflowForecast';
import type { FinanceCategory, FinanceExpense, FinanceRateCard, FinanceRecurring } from '../../features/finance/types';

const cat = (id: string, parent_id: string | null, extra: Partial<FinanceCategory> = {}): FinanceCategory =>
    ({ id, parent_id, name: id, nature: 'variable', position: 0, is_archived: false, ...extra });

const categories = [
    cat('ops', null, { nature: 'fixed', color: '#0ea5e9', default_billing: 'T' }),
    cat('power', 'ops'),
    cat('dei', 'power', { position: 0 }),
    cat('tel', 'ops', { position: 1 }),
    cat('labor', null, { position: 1 }),
    cat('setter', 'labor'),
];

const expense = (id: string, extra: Partial<FinanceExpense>): FinanceExpense => ({
    id, category_id: 'dei', expense_date: '2026-10-05', lines: [], amount_net: 0, vat_rate: 0, vat_amount: 0,
    amount_gross: 100, billing: 'T', paid_amount: 0, status: 'unpaid', source_kind: 'manual', ...extra,
});

const order = (id: string, extra: Partial<Order> = {}): Order => ({
    id, customer_id: 'c1', customer_name: 'Πελάτης', created_at: '2026-09-01T10:00:00Z', status: OrderStatus.Delivered,
    items: [{ sku: 'RN1', quantity: 10, price_at_order: 10 } as any], total_price: 124, vat_rate: 0.24, discount_percent: 0,
    ...extra,
} as Order);

describe('category tree', () => {
    it('builds a tree, breadcrumbs and inherited values', () => {
        const tree = buildCategoryTree(categories);
        expect(tree.map((node) => node.category.id)).toEqual(['ops', 'labor']);
        expect(tree[0].children[0].children[0].category.id).toBe('dei');
        expect(categoryBreadcrumb('dei', categories)).toBe('ops › power › dei');
        expect(inheritedCategoryValue('dei', categories, 'nature')).toBe('variable');
        expect(inheritedCategoryValue('dei', categories, 'default_billing')).toBe('T');
    });

    it('rolls leaf totals into every ancestor and blocks cycles', () => {
        const totals = rollUpTotals(new Map([['dei', 50], ['tel', 20], ['setter', 7]]), categories);
        expect(totals.get('ops')).toBe(70);
        expect(totals.get('power')).toBe(50);
        expect(totals.get('labor')).toBe(7);
        expect(wouldCreateCycle('ops', 'dei', categories)).toBe(true);
        expect(wouldCreateCycle('dei', 'labor', categories)).toBe(false);
        expect(reorderSiblings('tel', -1, categories).map((row) => row.id)).toEqual(['tel', 'power']);
    });
});

describe('Χ/Τ split math', () => {
    it('adds ΦΠΑ only on the Τ part and respects an agreed total', () => {
        expect(splitExpected(100, 0.24, { mode: 'split', tPercent: 60 })).toEqual({ T: 74.4, X: 40 });
        expect(splitExpected(100, 0.24, { mode: 'X', tPercent: 0 })).toEqual({ T: 0, X: 100 });
        const agreed = splitExpected(100, 0.24, { mode: 'split', tPercent: 60 }, 100);
        expect(agreed.T + agreed.X).toBeCloseTo(100, 2);
    });

    it('computes net/vat/gross from either side', () => {
        expect(computeAmounts({ net: 100, vatRate: 0.24 })).toEqual({ net: 100, vat: 24, gross: 124 });
        expect(computeAmounts({ gross: 124, vatRate: 0.24 })).toEqual({ net: 100, vat: 24, gross: 124 });
    });

    it('resolves periods and previous periods', () => {
        expect(resolvePeriod('month', '2026-11-02')).toEqual({ from: '2026-11-01', to: '2026-11-30' });
        expect(previousPeriod(resolvePeriod('quarter', '2026-11-02'))).toEqual({ from: '2026-07-01', to: '2026-09-30' });
        expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    });
});

describe('income ledger', () => {
    const customers = [{ id: 'c1', full_name: 'Κοσμηματοπωλείο', profile: { credit_days: 30, credit_limit: 50 } } as unknown as Customer];
    const base = {
        shipments: [], shipmentItems: [], customers, customerTerms: [{ customer_id: 'c1', default_mode: 'split' as const, t_percent: 50 }],
        legalDocuments: [], today: '2026-11-02',
    };

    it('splits orders by customer terms, applies receipts and ages the rest', () => {
        const income = buildOrderIncome({
            ...base,
            orders: [order('O1')],
            orderBilling: [],
            receipts: [{ id: 'r1', order_id: 'O1', customer_id: 'c1', amount: 20, billing: 'X', method: 'cash', received_at: '2026-09-10' }],
        });
        expect(income[0].expected).toEqual({ T: 62, X: 50 });
        expect(income[0].outstanding).toEqual({ T: 62, X: 30 });
        expect(income[0].dueDate).toBe('2026-10-01');
        expect(income[0].daysOverdue).toBe(32);
        expect(agingBucket(income[0].daysOverdue)).toBe('d60');
        const balances = buildCustomerBalances(income, [], customers);
        expect(balances[0].total).toBe(92);
        expect(balances[0].overCreditLimit).toBe(true);
    });

    it('lets an order override the customer split and keeps undelivered value in the pipeline', () => {
        const income = buildOrderIncome({
            ...base,
            orders: [order('O2', { status: OrderStatus.Pending })],
            orderBilling: [{ order_id: 'O2', mode: 'T', t_percent: 100 }],
            receipts: [],
        });
        expect(income[0].expected).toEqual({ T: 124, X: 0 });
        expect(income[0].due).toEqual({ T: 0, X: 0 });
        expect(buildPipeline(income, [], []).backlog.T).toBe(124);
        expect(suggestReceiptSplit(income[0], 50)).toEqual({ T: 50, X: 0 });
    });

    it('applies on-account receipts to the customer balance', () => {
        const income = buildOrderIncome({ ...base, orders: [order('O1')], orderBilling: [], receipts: [] });
        const balances = buildCustomerBalances(income, [{ id: 'r2', customer_id: 'c1', amount: 112, billing: 'T', method: 'bank', received_at: '2026-10-20' }], customers);
        expect(balances[0].total).toBe(0);
        expect(balances[0].aging.d60).toBe(0);
    });
});

describe('expense ledger', () => {
    const parties = [{ id: 'p1', name: 'ΔΕΗ', payment_terms_days: 10 } as Supplier];

    it('summarizes by Χ/Τ, nature and month, ignoring expected bills', () => {
        const summary = summarizeExpenses([
            expense('e1', { billing: 'T', amount_gross: 124, vat_amount: 24 }),
            expense('e2', { billing: 'X', category_id: 'setter', amount_gross: 50 }),
            expense('e3', { status: 'expected', amount_gross: 999 }),
        ], categories, { from: '2026-10-01', to: '2026-10-31' });
        expect(summary.byBilling).toEqual({ T: 124, X: 50 });
        expect(summary.byCategory.get('ops')).toBe(124);
        expect(summary.vat).toBe(24);
        expect(summary.byMonth).toEqual([{ month: '2026-10', T: 124, X: 50, total: 174 }]);
    });

    it('allocates on-account payments oldest first and builds the running statement', () => {
        const expenses = [
            expense('old', { party_id: 'p1', expense_date: '2026-09-01', amount_gross: 100, paid_amount: 40 }),
            expense('new', { party_id: 'p1', expense_date: '2026-10-25', amount_gross: 80 }),
        ];
        const payments = [
            { id: 'pay1', expense_id: 'old', party_id: 'p1', amount: 40, paid_at: '2026-09-05', method: 'cash' as const, billing: 'T' as const },
            { id: 'pay2', party_id: 'p1', amount: 70, paid_at: '2026-10-01', method: 'bank' as const, billing: 'T' as const },
        ];
        const [balance] = buildPartyBalances(expenses, payments, parties, '2026-11-02');
        expect(balance.balance).toBe(70);
        expect(balance.open.map((row) => [row.expense.id, row.open])).toEqual([['new', 70]]);
        expect(balance.overdue).toBe(0);
        const statement = buildPartyStatement('p1', expenses, payments, categories);
        expect(statement[statement.length - 1].balance).toBe(70);
    });
});

describe('recurring bills', () => {
    const template: FinanceRecurring = {
        id: 't1', category_id: 'dei', estimated_amount: 180, billing: 'T', frequency: 'bimonthly', day_of_period: 15, next_due: '2026-01-15', is_active: true,
    };

    it('lists occurrences and creates each expected bill once', () => {
        expect(occurrences(template, '2026-01-01', '2026-07-31')).toEqual(['2026-01-15', '2026-03-15', '2026-05-15', '2026-07-15']);
        const pending = pendingRecurringExpenses([template], [], '2026-11-10');
        expect(pending.map((row) => row.expense_date)).toEqual(['2026-09-15', '2026-11-15']);
        const again = pendingRecurringExpenses([template], pending.map((row, index) => expense(`x${index}`, row)), '2026-11-10');
        expect(again).toEqual([]);
    });
});

describe('worker statements', () => {
    const materials = [{ id: 'zr', name: 'Ζιργκόν', type: MaterialType.Stone, cost_per_unit: 0.1, unit: 'τεμ' } as Material];
    const products = [{ sku: 'RN100', category: 'Δαχτυλίδι', weight_g: 3, recipe: [{ type: 'raw', id: 'zr', quantity: 6 }] } as unknown as Product];
    const cards: FinanceRateCard[] = [
        { id: 'generic', party_id: 'p1', label: 'Πέτρα', unit: 'per_stone', rate: 0.1, match: {}, priority: 0, is_active: true },
        { id: 'zircon', party_id: 'p1', label: 'Ζιργκόν', unit: 'per_stone', rate: 0.12, match: { material_id: 'zr' }, priority: 0, is_active: true },
    ];

    it('prices stones × pieces with the most specific card and reports unmatched work', () => {
        const suggestion = suggestStatement({
            assignments: [
                { id: 'a1', batch_id: 'B1', stage: 'Setting', party_id: 'p1', sku: 'RN100', quantity: 10, assigned_at: '2026-10-01' },
                { id: 'a2', batch_id: 'B2', stage: 'Setting', party_id: 'p1', sku: 'XX1', quantity: 5, assigned_at: '2026-10-02' },
                { id: 'a3', batch_id: 'B3', stage: 'Setting', party_id: 'p1', sku: 'RN100', quantity: 1, assigned_at: '2026-10-02', statement_id: 's0' },
            ],
            rateCards: cards, products, materials,
        });
        expect(suggestion.lines).toHaveLength(1);
        expect(suggestion.lines[0]).toMatchObject({ rate_card_id: 'zircon', units: 60, amount: 7.2 });
        expect(suggestion.unmatched.map((row) => row.assignment.id)).toEqual(['a2']);
        expect(suggestion.total).toBe(7.2);
    });

    it('prefers higher priority cards and supports per-gram rates', () => {
        const suggestion = suggestStatement({
            assignments: [{ id: 'a1', batch_id: 'B1', stage: 'Polishing', party_id: 'p1', sku: 'RN100', quantity: 2, assigned_at: '2026-10-01' }],
            rateCards: [
                { id: 'g', party_id: 'p1', label: 'Τεχνίτης', unit: 'per_gram', rate: 0.5, match: { stage: 'Polishing' }, priority: 1, is_active: true },
                { id: 'p', party_id: 'p1', label: 'Κομμάτι', unit: 'per_piece', rate: 9, match: {}, priority: 0, is_active: true },
            ],
            products, materials: [],
        });
        expect(suggestion.lines[0]).toMatchObject({ rate_card_id: 'g', units: 6, amount: 3 });
    });
});

describe('commissions and forecast', () => {
    it('subtracts booked payouts from earned commission', () => {
        const event = (net: number) => ({ sellerId: 's1', sellerName: 'Αλέκος', sellerCommissionPercent: 10, net } as any);
        const [row] = buildSellerCommissions({
            realized: [event(1000)], backlog: [event(500)], sellers: [],
            expenses: [expense('c', { source_kind: 'commission', source_id: 'seller:s1:abc', amount_gross: 40, expense_date: '2026-10-01' })],
        });
        expect(row).toMatchObject({ earned: 100, pending: 50, paid: 40, owed: 60 });
    });

    it('puts overdue items on day zero and projects recurring bills', () => {
        const forecast = buildCashflowForecast({
            orderIncome: [{ outstanding: { T: 100, X: 0 }, dueDate: '2026-10-01', customerName: 'Α' } as any],
            expenses: [expense('e', { amount_gross: 30, due_date: '2026-11-05' })],
            recurring: [{ id: 't', category_id: 'dei', estimated_amount: 20, billing: 'T', frequency: 'monthly', day_of_period: 20, next_due: '2026-11-20', is_active: true }],
            parties: [],
            today: '2026-11-02',
            days: 30,
        });
        expect(forecast.points[0]).toMatchObject({ inflow: 100, cumulative: 100 });
        expect(forecast.totalOut).toBe(50);
        expect(forecast.points[forecast.points.length - 1].cumulative).toBe(50);
        expect(forecast.events[0]).toMatchObject({ kind: 'collection', overdue: true });
    });
});

describe('purchase booking from supplier receipts', () => {
    it('maps stones, materials and STX to their categories and groups one expense per category', async () => {
        const { buildPurchaseBooking, purchaseExpenses, changedMaterialCosts } = await import('../../features/finance/purchaseBooking');
        const bookingCategories = [
            cat('raw', null), cat('stones', 'raw', { link_kind: 'stones' }), cat('mats', 'raw', { link_kind: 'materials' }), cat('stx', null, { link_kind: 'stx' }),
        ];
        const order = {
            id: 'po-123456789', supplier_id: 'p1', supplier_name: 'Πέτρες ΑΕ', created_at: '', status: 'Pending', total_amount: 0,
            items: [
                { id: '1', item_type: 'Material', item_id: 'zr', item_name: 'Ζιργκόν', quantity: 100, unit_cost: 0, total_cost: 0 },
                { id: '2', item_type: 'Material', item_id: 'cord', item_name: 'Κορδόνι', quantity: 10, unit_cost: 0.5, total_cost: 0 },
                { id: '3', item_type: 'Product', item_id: 'STX1', item_name: 'STX1', quantity: 20, unit_cost: 0, total_cost: 0 },
            ],
        } as any;
        const lines = buildPurchaseBooking({
            order,
            materials: [
                { id: 'zr', name: 'Ζιργκόν', type: MaterialType.Stone, cost_per_unit: 0.1, unit: 'τεμ' },
                { id: 'cord', name: 'Κορδόνι', type: MaterialType.Cord, cost_per_unit: 0.4, unit: 'τεμ' },
            ] as Material[],
            products: [{ sku: 'STX1', is_component: true, supplier_cost: 1.2 } as Product],
            categories: bookingCategories,
        });
        expect(lines.map((line) => [line.categoryId, line.unitCost])).toEqual([['stones', 0.1], ['mats', 0.5], ['stx', 1.2]]);
        expect(changedMaterialCosts(lines).map((line) => line.itemId)).toEqual(['cord']);
        const expenses = purchaseExpenses({ order, lines, billing: 'T', vatRate: 0.24, date: '2026-11-02' });
        expect(expenses.map((expense) => [expense.source_id, expense.amount_gross])).toEqual([
            ['po-123456789:stones', 12.4], ['po-123456789:mats', 6.2], ['po-123456789:stx', 29.76],
        ]);
    });
});

describe('category icons', () => {
    it('inherits the nearest icon and finds icons by Greek words without accents', async () => {
        const { categoryIconKey } = await import('../../features/finance/categoryTree');
        const { searchCategoryIcons, CATEGORY_ICON_MAP } = await import('../../components/finance/categoryIcons');
        const tree = [cat('travel', null, { icon: 'plane' }), cat('thess', 'travel'), cat('hotel', 'thess', { icon: 'hotel' })];
        expect(categoryIconKey('thess', tree)).toBe('plane');
        expect(categoryIconKey('hotel', tree)).toBe('hotel');
        expect(searchCategoryIcons('ταξιδι').flatMap((group) => group.icons.map((icon) => icon.key))).toContain('plane');
        expect(searchCategoryIcons('δερματα').flatMap((group) => group.icons.map((icon) => icon.key))).toContain('shirt');
        // Keys stored by the first release must keep resolving.
        ['building', 'zap', 'phone', 'hammer', 'gem', 'puzzle', 'plane', 'handshake'].forEach((key) => expect(CATEGORY_ICON_MAP[key]).toBeTruthy());
    });
});
