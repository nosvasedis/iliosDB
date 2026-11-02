import { useEffect, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/supabase';
import { legalKeys } from '../../features/legal/keys';
import { legalRepository } from '../../features/legal/repository';
import { financeKeys } from '../../features/finance/keys';
import { financeRepository } from '../../features/finance/repository';
import { buildCashflowForecast } from '../../features/finance/cashflowForecast';
import { buildSellerCommissions } from '../../features/finance/commissions';
import { budgetUsage, buildPartyBalances, summarizeExpenses } from '../../features/finance/expenseLedger';
import { previousPeriod, toIsoDate } from '../../features/finance/financeMath';
import {
  buildCustomerBalances,
  buildOrderIncome,
  buildPipeline,
  deliveredInPeriod,
  findInvoiceGaps,
  summarizeReceipts,
  type IncomeInput,
} from '../../features/finance/incomeLedger';
import { buildInsights } from '../../features/finance/insights';
import { pendingRecurringExpenses } from '../../features/finance/recurring';
import type { FinanceBilling, FinancePeriod } from '../../features/finance/types';
import type { GlobalSettings, Product } from '../../types';
import { useFinanceWorkspace } from './useFinance';
import { useFinanceAnalytics } from './useFinanceAnalytics';
import { useAllShipmentItems, useAllShipments, useCustomers, useOrdersWithItems } from './useOrders';
import { useProductionBatches } from './useProductionBatches';
import { useSellers } from './useSellers';
import { useSuppliers } from './useSuppliers';
import { useMaterials } from './useMaterials';

const EMPTY: never[] = [];

/** Everything the finance hub shows, derived from the existing modules plus finance_* rows. */
export function useFinanceHub(params: {
  products: Product[];
  settings?: GlobalSettings | null;
  period: FinancePeriod;
  billingFilter: FinanceBilling | 'all';
}) {
  const today = toIsoDate(new Date());
  const workspaceQuery = useFinanceWorkspace();
  const ordersQuery = useOrdersWithItems();
  const shipmentsQuery = useAllShipments();
  const shipmentItemsQuery = useAllShipmentItems();
  const customersQuery = useCustomers();
  const suppliersQuery = useSuppliers();
  const sellersQuery = useSellers();
  const materialsQuery = useMaterials();
  const batchesQuery = useProductionBatches();
  const offersQuery = useQuery({ queryKey: ['offers'], queryFn: api.getOffers });
  const legalQuery = useQuery({ queryKey: legalKeys.documents(), queryFn: legalRepository.getDocuments });
  const { allRealizedEvents, backlogEvents } = useFinanceAnalytics({ products: params.products, settings: params.settings });

  const workspace = workspaceQuery.data;
  const parties = suppliersQuery.data || EMPTY;
  const customers = customersQuery.data || EMPTY;

  const derived = useMemo(() => {
    if (!workspace) return null;
    const incomeInput: IncomeInput = {
      orders: ordersQuery.data || EMPTY,
      shipments: shipmentsQuery.data || EMPTY,
      shipmentItems: shipmentItemsQuery.data || EMPTY,
      customers,
      orderBilling: workspace.orderBilling,
      customerTerms: workspace.customerTerms,
      receipts: workspace.receipts,
      legalDocuments: legalQuery.data || EMPTY,
      today,
    };
    const orderIncome = buildOrderIncome(incomeInput);
    const previous = previousPeriod(params.period);
    const filteredReceipts = params.billingFilter === 'all'
      ? workspace.receipts
      : workspace.receipts.filter((receipt) => receipt.billing === params.billingFilter);
    const expenseSummary = summarizeExpenses(workspace.expenses, workspace.categories, params.period, params.billingFilter);
    const previousExpenseSummary = summarizeExpenses(workspace.expenses, workspace.categories, previous, params.billingFilter);
    const receiptSummary = summarizeReceipts(filteredReceipts, params.period);
    const previousReceiptSummary = summarizeReceipts(filteredReceipts, previous);
    const customerBalances = buildCustomerBalances(orderIncome, workspace.receipts, customers);
    const partyBalances = buildPartyBalances(workspace.expenses, workspace.expensePayments, parties, today);
    const invoiceGaps = findInvoiceGaps(orderIncome);
    const budgets = budgetUsage(expenseSummary, workspace.categories, params.period);
    const commissions = buildSellerCommissions({
      realized: allRealizedEvents,
      backlog: backlogEvents,
      sellers: sellersQuery.data || EMPTY,
      expenses: workspace.expenses,
    });
    const paymentsInPeriod = workspace.expensePayments.filter((payment) =>
      payment.paid_at >= params.period.from && payment.paid_at <= params.period.to
      && (params.billingFilter === 'all' || payment.billing === params.billingFilter));
    return {
      orderIncome,
      receiptSummary,
      previousReceiptSummary,
      delivered: deliveredInPeriod(incomeInput, orderIncome, params.period),
      pipeline: buildPipeline(orderIncome, offersQuery.data || EMPTY, workspace.customerTerms),
      customerBalances,
      invoiceGaps,
      expenseSummary,
      previousExpenseSummary,
      paidOut: paymentsInPeriod.reduce((sum, payment) => sum + payment.amount, 0),
      partyBalances,
      budgets,
      commissions,
      forecast: buildCashflowForecast({
        orderIncome,
        expenses: workspace.expenses,
        recurring: workspace.recurring,
        parties,
        today,
      }),
      insights: buildInsights({
        current: expenseSummary,
        previous: previousExpenseSummary,
        categories: workspace.categories,
        customerBalances,
        partyBalances,
        invoiceGaps,
        budgets,
        commissions,
        assignments: workspace.assignments,
        expenses: workspace.expenses,
        receiptsTotal: receiptSummary.total,
        previousReceiptsTotal: previousReceiptSummary.total,
        today,
      }),
    };
  }, [
    workspace, ordersQuery.data, shipmentsQuery.data, shipmentItemsQuery.data, customers, parties,
    legalQuery.data, offersQuery.data, sellersQuery.data, allRealizedEvents, backlogEvents,
    params.period, params.billingFilter, today,
  ]);

  useMaterializeRecurring(workspace, today);

  return {
    workspace,
    derived,
    today,
    parties,
    customers,
    sellers: sellersQuery.data || EMPTY,
    materials: materialsQuery.data || EMPTY,
    batches: batchesQuery.data || EMPTY,
    orders: ordersQuery.data || EMPTY,
    isLoading: workspaceQuery.isLoading || ordersQuery.isLoading || customersQuery.isLoading || suppliersQuery.isLoading,
    error: workspaceQuery.error || ordersQuery.error,
    refetch: () => workspaceQuery.refetch(),
  };
}

/** Recurring bills appear as «αναμενόμενα» a few days before they are due, once per occurrence. */
function useMaterializeRecurring(workspace: ReturnType<typeof useFinanceWorkspace>['data'], today: string) {
  const queryClient = useQueryClient();
  const attempted = useRef<string>('');
  useEffect(() => {
    if (!workspace) return;
    const pending = pendingRecurringExpenses(workspace.recurring, workspace.expenses, today, 10, workspace.categories);
    const key = pending.map((row) => row.source_id).join('|');
    if (!key || attempted.current === key) return;
    attempted.current = key;
    financeRepository.insertExpensesIgnoringDuplicates(pending)
      .then(() => queryClient.invalidateQueries({ queryKey: financeKeys.all }))
      .catch((error) => console.warn('Recurring finance bills could not be created:', error));
  }, [workspace, today, queryClient]);
}
