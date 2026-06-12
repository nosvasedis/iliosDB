import {
  Collection,
  GlobalSettings,
  LegalDocument,
  Material,
  Order,
  OrderShipment,
  OrderShipmentItem,
  Product,
  UserProfile,
} from '../types';
import { buildFinanceAnalytics, FinancePeriodSelection } from './financeAnalytics';

interface BusinessStatsOptions {
  shipments?: OrderShipment[];
  shipmentItems?: OrderShipmentItem[];
  collections?: Collection[];
  sellers?: UserProfile[];
  legalDocuments?: LegalDocument[];
  period?: FinancePeriodSelection;
}

/**
 * Compatibility adapter for older callers.
 *
 * New surfaces should use buildFinanceAnalytics/useFinanceAnalytics directly so
 * shipments, backlog, sellers, collections and legal reconciliation stay visible.
 */
export const calculateBusinessStats = (
  orders: Order[],
  products: Product[],
  materials: Material[],
  globalSettings: GlobalSettings,
  options: BusinessStatsOptions = {},
) => {
  if (!orders || !products || !materials || !globalSettings) return null;
  return buildFinanceAnalytics({
    orders,
    products,
    materials,
    settings: globalSettings,
    shipments: options.shipments || [],
    shipmentItems: options.shipmentItems || [],
    collections: options.collections || [],
    sellers: options.sellers || [],
    legalDocuments: options.legalDocuments || [],
    period: options.period || { mode: 'all_time' },
  });
};
