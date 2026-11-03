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
import SkuProductPicker from '../../components/legal/SkuProductPicker';
import { getLegalDocumentCatalogProducts } from '../../utils/legalDocuments';
import RecipeItemSelectorModal from '../../components/ProductDetails/RecipeItemSelectorModal';
import PriceListPage from '../../components/PriceListPage';
import MobilePriceList from '../../components/mobile/MobilePriceList';
import MobileRegistry from '../../components/mobile/MobileRegistry';
import ProductCategorySelection from '../../components/catalog/ProductCategorySelection';

const materials: Material[] = [
  { id: 'pearl', name: 'Μαργαριτάρι 2,5-3,0', type: MaterialType.Component, unit: 'Τεμ', cost_per_unit: 0.5, variant_prices: { SB: 0.8 } },
  { id: 'stone', name: 'Ζιργκόν 3mm', type: MaterialType.Stone, unit: 'Τεμ', cost_per_unit: 0.2 },
  { id: 'cord', name: 'Κορδόνι μπλε', type: MaterialType.Cord, unit: 'm', cost_per_unit: 1 },
];
const base: Product = { sku: 'DA001', prefix: 'DA', category: 'Δαχτυλίδι', gender: Gender.Women, image_url: null, weight_g: 2, plating_type: PlatingType.None, production_type: ProductionType.InHouse, active_price: 10, draft_price: 10, selling_price: 20, stock_qty: 0, sample_qty: 0, molds: [], is_component: false, recipe: [{ type: 'component', sku: 'STX001', quantity: 2 }, { type: 'raw', id: 'cord', quantity: 0.125 }, ...materials.slice(2).map((material) => ({ type: 'raw' as const, id: material.id, quantity: 1 }))], labor: { casting_cost: 0, setter_cost: 0, technician_cost: 0, stone_setting_cost: 0, plating_cost_x: 0, plating_cost_d: 0, subcontract_cost: 0 } };
const definitions = [
  ['KL001', 'Κολιέ Πετράτο', Gender.Women, [1]],
  ['KL002', 'Κολιέ Μασίφ', Gender.Men, []],
  ['KL003', 'Μενταγιόν', Gender.Women, []],
  ['XR001', 'Βραχιόλι με Πέτρες', Gender.Men, []],
  ['XR002', 'Βραχιόλι Μασίφ', Gender.Men, []],
  ['XR003', 'Βραχιόλι Δερμάτινο Θρησκευτικό', Gender.Men, []],
  ['RN001', 'Δαχτυλίδι', Gender.Men, [5]],
  ['RN002', 'Δαχτυλίδι', Gender.Women, []],
  ['RZ001', 'Ροζάριο', Gender.Unisex, []],
  ['KD0155', 'Καδένα', Gender.Unisex, []],
  ['KD0255', 'Καδένα', Gender.Unisex, []],
  ['KOU8', 'Κούμπωμα', Gender.Unisex, []],
] as const;
const products: Product[] = definitions.map(([sku, category, gender, collections]) => ({ ...base, sku, category, gender, collections: [...collections], recipe: [] }));
products.push(...[['STX134', 'Καδένα 150'], ['STX177', 'Πλακέ'], ['STX185', 'Τελειώματα καδένα'], ['STX307', 'Γράνα σκουλαρικιών'], ['STX314', 'Σφραγίδα μικρή 925'], ['STX318', 'Κρίκος μεγάλος'], ['STX321', 'Μπαρίτσα κυρτή']].map(([sku, description]) => ({ ...base, sku, description, category: 'Εξάρτημα (STX)', is_component: true, recipe: [{ type: 'raw' as const, id: 'pearl', quantity: 3 }] })));
products[0].recipe = [{ type: 'component', sku: 'STX134', quantity: 2 }, { type: 'component', sku: 'STX177', quantity: 1 }];
const collections = [{ id: 1, name: 'Άνοιξη' }, { id: 5, name: 'Ψαλμός' }];
const now = new Date();
const created_at = new Date(now.getFullYear(), now.getMonth(), 1, 10).toISOString();
const orders = products.filter(product => !product.is_component).map((product, index) => ({ id: `order-${index}`, customer_name: 'Δοκιμαστικός πελάτης', created_at, status: OrderStatus.Delivered, total_price: 100, items: [{ sku: product.sku, quantity: index + 1, price_at_order: 20, line_id: `line-${index}` }] }));
const shipments = [];
const shipmentItems = [];
const settings = { silver_price_gram: 1, loss_percentage: 0, barcode_width_mm: 50, barcode_height_mm: 30, retail_barcode_width_mm: 72, retail_barcode_height_mm: 10, last_calc_silver_price: 1 };
const input = { orders, shipments, shipmentItems, materials, products, settings, collections, period: { mode: 'all_time' as const } };
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
for (const [key, value] of [[['orders'], orders], [['orders', 'shipments'], shipments], [['orders', 'shipment-items'], shipmentItems], [['materials'], materials], [['settings'], settings], [['collections'], collections], [['products'], products], [['product-links'], { groups: [], members: [] }], [['sellers'], []], [['legal_documents'], []], [['customers'], []], [['suppliers'], []], [['production', 'batches'], []], [['offers'], []]] as const) cache.setQueryData(key, value);
cache.setQueryData(financeKeys.workspace(), { categories: [{ id: 'stones', name: 'Πέτρες', link_kind: 'stones', parent_id: null, nature: 'variable', position: 0, is_archived: false }], expenses: [{ id: 'purchase', category_id: 'stones', expense_date: created_at.slice(0, 10), lines: [{ label: 'Ζιργκόν 3mm', material_id: 'stone', qty: 1234, unit: 'τεμ.', unit_price: 0.2 }], amount_net: 246.8, amount_gross: 246.8, vat_rate: 0, vat_amount: 0, billing: 'X', paid_amount: 0, status: 'unpaid', source_kind: 'supplier_order', doc_ref: 'TEST-001' }], expensePayments: [], recurring: [], rateCards: [], statements: [], assignments: [], customerTerms: [], orderBilling: [], receipts: [] });
// Block accidental remote fetches even if a new dependency adds a query later.
const originalFetch = window.fetch.bind(window);
window.fetch = (request, options) => {
  const url = new URL(typeof request === 'string' ? request : request instanceof URL ? request.href : request.url, location.href);
  if (url.origin !== location.origin) return Promise.reject(new Error('Remote calls disabled in synthetic fixture'));
  return originalFetch(request, options);
};

function Fixture() {
  const [view, setView] = useState('registry');
  const [legalSelection, setLegalSelection] = useState({ sku: '', variant_suffix: null, displaySku: '' });
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [printed, setPrinted] = useState('');
  const [mobile, setMobile] = useState(false);
  const [warning, setWarning] = useState(false);
  return <QueryClientProvider client={cache}><UIProvider><main className="mx-auto max-w-7xl space-y-4 p-4">
    <p className="text-xs font-bold text-slate-500">Έλεγχος συνθετικών δεδομένων · αποθήκευση μόνο στη μνήμη</p>
    <nav className="flex flex-wrap gap-2 rounded-xl bg-white p-3">{['registry', 'panel', 'materials', 'mobileMaterials', 'analytics', 'mobileAnalytics', 'priceList', 'mobilePriceList', 'legal', 'recipePicker', 'print'].map((name) => <button type="button" key={name} onClick={() => setView(name)} className="rounded border p-2">{name}</button>)}<button type="button" onClick={() => setMobile(!mobile)} className="rounded border p-2">390px</button><button type="button" onClick={() => setWarning(!warning)} className="rounded border p-2">Missing recipe</button></nav>
    <div style={mobile ? { width: 390, maxWidth: '100%', margin: 'auto' } : undefined}>
      {view === 'legal' && <section className="rounded-2xl bg-white p-4"><h2>Επιλογή είδους παραστατικού</h2><SkuProductPicker legalDocument sku={legalSelection.sku} variantSuffix={legalSelection.variant_suffix} products={getLegalDocumentCatalogProducts(products)} onSelect={setLegalSelection} /><pre aria-label="Legal selection">{JSON.stringify(legalSelection)}</pre></section>}
      {view === 'recipePicker' && <RecipeItemSelectorModal type="component" productCategory="Κολιέ" allMaterials={materials} allProducts={products} onClose={() => setView('registry')} onSelect={selection => { setPrinted(JSON.stringify(selection)); setView('registry'); }} />}
      {view === 'priceList' && <PriceListPage products={products} collections={collections} onPrint={data => setPrinted(JSON.stringify(data, null, 2))} />}
      {view === 'mobilePriceList' && <MobilePriceList onPrint={data => setPrinted(JSON.stringify(data, null, 2))} />}
      {view === 'registry' && <MobileRegistry products={products} onProductSelect={() => {}} />}
      {view === 'categorySelection' && <><ProductCategorySelection available={products.map(product => product.category)} selected={selectedCategories} onChange={setSelectedCategories} /><pre>{JSON.stringify(selectedCategories)}</pre></>}
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
    {printed && <pre aria-label="Print payload" className="whitespace-pre-wrap break-words text-xs">{printed}</pre>}
  </main></UIProvider></QueryClientProvider>;
}
const root = createRoot(document.getElementById('root')!);
root.render(<Fixture />);
if (import.meta.hot) import.meta.hot.dispose(() => root.unmount());
