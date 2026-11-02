// Synthetic browser fixture: seeded queries, no live database calls or writes.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '../../index.css';
import { Gender, MaterialType, OrderStatus, PlatingType, ProductionType, type Material, type Product } from '../../types';
import { buildFinanceAnalytics, buildFinanceLineEvents, rankFinanceAnalyticsFromEvents } from '../../utils/financeAnalytics';
import ResourceQuantitiesPanel from '../../components/finance/ResourceQuantitiesPanel';
import AnalyticsView from '../../components/AnalyticsView';
import MobileAnalytics from '../../components/mobile/MobileAnalytics';
import FinancePage from '../../components/finance/FinancePage';
import MobileFinance from '../../components/finance/MobileFinance';
import AnalyticsPrintReport from '../../components/AnalyticsPrintReport';
import OrderFinancialReport from '../../components/OrderFinancialReport';
import { FinanceTab } from '../../components/dashboard/DashboardTabs';
import { UIProvider } from '../../components/UIProvider';
import { financeKeys } from '../../features/finance/keys';
import MaterialsPage from '../../components/MaterialsPage';
import MobileResources from '../../components/mobile/MobileResources';
import { api } from '../../lib/supabase';

const materials: Material[] = [
  { id: 'stone', name: 'Ζιργκόν', description: '3mm · διάφανο', type: MaterialType.Stone, unit: 'τεμ.', cost_per_unit: 0.2 },
  { id: 'cord', name: 'Κορδόνι', description: 'Μπλε 1mm', type: MaterialType.Cord, unit: 'm', cost_per_unit: 1 },
  { id: 'doublet', name: '10x12 οβάλ Γυναικεία', type: MaterialType.Stone, unit: 'Τεμ', cost_per_unit: 2.3, variant_prices: { SB: 4.2 } },
  { id: 'necklace', name: 'Κορδόνι Αιματίτης (XR)', type: MaterialType.Stone, unit: 'Τεμ', cost_per_unit: 2 },
  { id: 'necklace-onyx', name: 'Κορδόνι Όνυχας (XR)', type: MaterialType.Stone, unit: 'Τεμ', cost_per_unit: 2 },
  { id: 'strand', name: '001TXAOL(16)', type: MaterialType.Stone, unit: 'Τεμ', cost_per_unit: 0.24, stones_per_strand: 25 },
  ...Array.from({ length: 58 }, (_, i) => ({ id: `raw-${i}`, name: `Υλικό ${i + 1}`, description: 'Πολύ μεγάλη περιγραφή για έλεγχο αναδίπλωσης σε μικρή οθόνη', type: MaterialType.Component, unit: 'τεμ.', cost_per_unit: 0.1 })),
];
const base: Product = { sku: 'DA001', prefix: 'DA', category: 'Δαχτυλίδι', gender: Gender.Women, image_url: null, weight_g: 2, plating_type: PlatingType.None, production_type: ProductionType.InHouse, active_price: 10, draft_price: 10, selling_price: 20, stock_qty: 0, sample_qty: 0, molds: [], is_component: false, recipe: [{ type: 'component', sku: 'STX001', quantity: 2 }, { type: 'raw', id: 'cord', quantity: 0.125 }, ...materials.slice(2).map((material) => ({ type: 'raw' as const, id: material.id, quantity: 1 }))], labor: { casting_cost: 0, setter_cost: 0, technician_cost: 0, stone_setting_cost: 0, plating_cost_x: 0, plating_cost_d: 0, subcontract_cost: 0 } };
const products = [base, { ...base, sku: 'STX001', prefix: 'STX', is_component: true, description: 'Στοιχείο με πέτρες', recipe: [{ type: 'raw' as const, id: 'stone', quantity: 3 }] }];
const now = new Date();
const created_at = new Date(now.getFullYear(), now.getMonth(), 1, 10).toISOString();
const orders = [{ id: 'fixture-order', customer_name: 'Δοκιμαστικός πελάτης', created_at, status: OrderStatus.PartiallyDelivered, total_price: 100, items: [{ sku: 'DA001', variant_suffix: 'X', quantity: 5, price_at_order: 20, line_id: 'line' }] }];
const shipments = [{ id: 'fixture-ship', order_id: 'fixture-order', shipment_number: 1, shipped_at: created_at, created_at, shipped_by: 'fixture' }];
const shipmentItems = [{ id: 'fixture-item', shipment_id: 'fixture-ship', sku: 'DA001', variant_suffix: 'X', quantity: 2, price_at_order: 20, line_id: 'line' }];
const settings = { silver_price_gram: 1, loss_percentage: 0, barcode_width_mm: 50, barcode_height_mm: 30, retail_barcode_width_mm: 72, retail_barcode_height_mm: 10, last_calc_silver_price: 1 };
const input = { orders, shipments, shipmentItems, materials, products, settings, period: { mode: 'all_time' as const } };
const stats = buildFinanceAnalytics(input);
const incomplete = rankFinanceAnalyticsFromEvents({ orders, period: { mode: 'all_time' } }, { ...buildFinanceLineEvents(input), realized: [...stats.events.realized, { ...stats.events.realized[0], orderId: 'missing-order', sku: 'MISSING', recipeResources: { items: [], warnings: ['Λείπει προϊόν/εξάρτημα: MISSING'] } }] });
const cache = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, refetchOnMount: false, refetchOnWindowFocus: false } } });
let fixtureMaterials = materials;
api.getMaterials = async () => fixtureMaterials;
api.saveMaterial = async (material) => {
  const saved = { ...material, id: material.id || `fixture-${Date.now()}` };
  fixtureMaterials = material.id ? fixtureMaterials.map((item) => item.id === material.id ? saved : item) : [...fixtureMaterials, saved];
  return { error: null, queued: false };
};
cache.setQueryData(['molds'], []);
for (const [key, value] of [[['orders'], orders], [['orders', 'shipments'], shipments], [['orders', 'shipment-items'], shipmentItems], [['materials'], materials], [['settings'], settings], [['collections'], []], [['sellers'], []], [['legal_documents'], []], [['customers'], []], [['suppliers'], []], [['production', 'batches'], []], [['offers'], []]] as const) cache.setQueryData(key, value);
cache.setQueryData(financeKeys.workspace(), { categories: [{ id: 'stones', name: 'Πέτρες', link_kind: 'stones', parent_id: null, nature: 'variable', position: 0, is_archived: false }], expenses: [{ id: 'purchase', category_id: 'stones', expense_date: created_at.slice(0, 10), lines: [{ label: 'Ζιργκόν 3mm', material_id: 'stone', qty: 1234, unit: 'τεμ.', unit_price: 0.2 }], amount_net: 246.8, amount_gross: 246.8, vat_rate: 0, vat_amount: 0, billing: 'X', paid_amount: 0, status: 'unpaid', source_kind: 'supplier_order', doc_ref: 'TEST-001' }], expensePayments: [], recurring: [], rateCards: [], statements: [], assignments: [], customerTerms: [], orderBilling: [], receipts: [] });
// Block accidental remote fetches even if a new dependency adds a query later.
const originalFetch = window.fetch.bind(window);
window.fetch = (request, options) => {
  const url = new URL(typeof request === 'string' ? request : request instanceof URL ? request.href : request.url, location.href);
  if (url.origin !== location.origin) return Promise.reject(new Error('Remote calls disabled in synthetic fixture'));
  return originalFetch(request, options);
};

function Fixture() {
  const [view, setView] = useState('panel');
  const [mobile, setMobile] = useState(false);
  const [warning, setWarning] = useState(false);
  return <QueryClientProvider client={cache}><UIProvider><main className="mx-auto max-w-7xl space-y-4 p-4">
    <p className="text-xs font-bold text-slate-500">Έλεγχος συνθετικών δεδομένων · αποθήκευση μόνο στη μνήμη</p>
    <nav className="flex flex-wrap gap-2 rounded-xl bg-white p-3">{['materials', 'mobileMaterials', 'panel', 'analytics', 'mobileAnalytics', 'hub', 'mobileHub', 'dashboard', 'print', 'orderPrint'].map((name) => <button type="button" key={name} onClick={() => setView(name)} className="rounded border p-2">{name}</button>)}<button type="button" onClick={() => setMobile(!mobile)} className="rounded border p-2">390px</button><button type="button" onClick={() => setWarning(!warning)} className="rounded border p-2">Missing recipe</button></nav>
    <div style={mobile ? { width: 390, maxWidth: '100%', margin: 'auto' } : undefined}>
      {view === 'panel' && <ResourceQuantitiesPanel realized={(warning ? incomplete : stats).resourceQuantities} backlog={stats.backlogResourceQuantities} periodLabel="Δοκιμαστική περίοδος" />}
      {view === 'materials' && <MaterialsPage settings={settings} products={products} />}
      {view === 'mobileMaterials' && <MobileResources products={products} />}
      {view === 'analytics' && <AnalyticsView products={products} />}
      {view === 'mobileAnalytics' && <MobileAnalytics products={products} />}
      {view === 'hub' && <FinancePage products={products} settings={settings} onNavigate={() => {}} onPrintAnalytics={() => {}} />}
      {view === 'mobileHub' && <MobileFinance products={products} settings={settings} onOpenAnalytics={() => setView('mobileAnalytics')} />}
      {view === 'dashboard' && <FinanceTab isLoading={false} periodLabel="Δοκιμή" finance={stats} trend={[]} activeOrderCount={1} silverPrice={1} silverForProduction={{ active: 6, delivered: 4, all_non_cancelled: 10 }} silverScope="active" onSilverScopeChange={() => {}} missingCostCount={0} onOpenMissingCosts={() => {}} onNavigate={() => {}} />}
      {view === 'print' && <AnalyticsPrintReport stats={stats} />}
      {view === 'orderPrint' && <OrderFinancialReport stats={stats} orderId="fixture-order" customerName="Δοκιμή" date="Δοκιμή" silverPrice={1} />}
    </div>
  </main></UIProvider></QueryClientProvider>;
}
const root = createRoot(document.getElementById('root')!);
root.render(<Fixture />);
if (import.meta.hot) import.meta.hot.dispose(() => root.unmount());
