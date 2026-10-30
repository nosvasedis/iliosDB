import React, { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import AppShell, { type ShellConnectivity } from '../shell/AppShell';
import SellerDashboard from './SellerDashboard';
import SellerOrders from './SellerOrders';
import SellerCatalog from './SellerCatalog';
import SellerCollections from './SellerCollections';
import { Order } from '../../types';
import { useQuery } from '@tanstack/react-query';
import type { SellerPage } from '../../surfaces/pageIds';
import { productKeys, productsRepository } from '../../features/products';
import IliosLoader from '../ui/IliosLoader';
import { useSellerCatalog } from '../../features/sellerCatalog/useSellerCatalog';
import { ViewportProvider, useViewport } from '../shell/viewport';
import { sellerNavSections } from '../../surfaces/navConfig';

// Heavy, rarely-first screens load on demand so the seller shell opens fast on weak phones.
const loadMobileOrderBuilder = () => import('../mobile/MobileOrderBuilder');
const MobileOrderBuilder = lazy(loadMobileOrderBuilder);
const DesktopOrderBuilderPanel = lazy(() => import('../shell/DesktopOrderBuilderPanel'));
const SellerCustomers = lazy(() => import('./SellerCustomers'));
const CustomerServiceWorkspace = lazy(() => import('../CustomerServiceWorkspace'));

const sellerLoadingDetails: Record<SellerPage, string> = {
  dashboard: 'Αρχική',
  catalog: 'Κατάλογος',
  collections: 'Συλλογές',
  orders: 'Παραγγελίες',
  customers: 'Πελάτες',
  consignments: 'Παρακαταθήκες',
  repairs: 'Επισκευές',
  'order-builder': 'Νέα παραγγελία',
};

const navItem = (id: SellerPage) => sellerNavSections.flatMap((s) => s.items).find((i) => i.id === id)!;
const SELLER_BAR_ITEMS = [navItem('dashboard'), navItem('catalog'), navItem('orders')] as const;

/** Screens whose filters and scroll position survive switching away and back. */
const KEEP_ALIVE_PAGES: SellerPage[] = ['catalog', 'collections'];

const hiddenPageStyle: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  visibility: 'hidden',
  pointerEvents: 'none',
  contentVisibility: 'hidden',
};

function SellerWorkspace({ connectivity }: { connectivity: ShellConnectivity }) {
  const { isDesktop } = useViewport();
  const [activePage, setActivePage] = useState<SellerPage>('dashboard');
  const [visited, setVisited] = useState<ReadonlySet<SellerPage>>(() => new Set<SellerPage>(['dashboard']));
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const { snapshot: sellerCatalog } = useSellerCatalog();
  const needsFullProducts = activePage === 'order-builder';
  const { data: products, isLoading: productsLoading } = useQuery({
    queryKey: productKeys.all,
    queryFn: productsRepository.getProducts,
    enabled: needsFullProducts,
  });

  const navigate = useCallback((page: SellerPage) => {
    setActivePage(page);
    setVisited((prev) => (prev.has(page) ? prev : new Set(prev).add(page)));
  }, []);

  // Warm the order-builder code while the seller browses, so "Νέα" opens instantly.
  useEffect(() => {
    const idle = (window as Window & { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback;
    const run = () => { void loadMobileOrderBuilder(); };
    const handle = idle ? idle(run) : window.setTimeout(run, 2500);
    return () => {
      const cancel = (window as Window & { cancelIdleCallback?: (h: number) => void }).cancelIdleCallback;
      if (idle && cancel) cancel(handle); else window.clearTimeout(handle);
    };
  }, []);

  const handleCreateOrder = useCallback(() => {
    setEditingOrder(null);
    navigate('order-builder');
  }, [navigate]);

  const handleEditOrder = useCallback((order: Order) => {
    setEditingOrder(order);
    navigate('order-builder');
  }, [navigate]);

  const handleOrderBack = useCallback(() => {
    setEditingOrder(null);
    navigate('orders');
  }, [navigate]);

  const loadingView = <IliosLoader variant="section" detail={sellerLoadingDetails[activePage]} className="h-full min-h-full bg-slate-50" />;
  const scrollPage = (node: React.ReactNode) => <div className="h-full overflow-y-auto overscroll-contain p-3 custom-scrollbar sm:p-4 lg:p-0">{node}</div>;

  const renderPage = (page: SellerPage): React.ReactNode => {
    switch (page) {
      case 'dashboard':
        return <SellerDashboard onNavigate={navigate} onCreateOrder={handleCreateOrder} />;
      case 'orders':
        return <SellerOrders onCreate={handleCreateOrder} onEdit={handleEditOrder} />;
      case 'order-builder':
        if (productsLoading || !products) return loadingView;
        return isDesktop ? (
          <DesktopOrderBuilderPanel onBack={handleOrderBack} initialOrder={editingOrder} products={products} />
        ) : (
          <div className="h-full bg-white">
            <MobileOrderBuilder onBack={handleOrderBack} initialOrder={editingOrder} products={products} attachSeller={true} />
          </div>
        );
      case 'catalog':
        return !sellerCatalog ? loadingView : <SellerCatalog products={sellerCatalog.products} collections={sellerCatalog.collections} />;
      case 'collections':
        return !sellerCatalog ? loadingView : <SellerCollections products={sellerCatalog.products} collections={sellerCatalog.collections} />;
      case 'customers':
        return <SellerCustomers />;
      case 'consignments':
        return scrollPage(<CustomerServiceWorkspace mode="consignments" />);
      case 'repairs':
        return scrollPage(<CustomerServiceWorkspace mode="repairs" />);
    }
  };

  const keepAlive = KEEP_ALIVE_PAGES.filter((page) => visited.has(page) && sellerCatalog);
  const activeIsKeptAlive = keepAlive.includes(activePage);

  return (
    <AppShell
      activePage={activePage}
      onNavigate={navigate}
      sections={sellerNavSections}
      barItems={SELLER_BAR_ITEMS}
      primaryAction={{ label: 'Νέα παραγγελία', onClick: handleCreateOrder, isActive: activePage === 'order-builder' }}
      workspaceLabel="Χώρος πλασιέ"
      connectivity={connectivity}
      hideBottomBar={activePage === 'order-builder'}
      storageKey="ilios-seller-sidebar-collapsed"
    >
      <div className="relative h-full">
        {keepAlive.map((page) => (
          <div
            key={page}
            className="h-full"
            style={page === activePage ? undefined : hiddenPageStyle}
            aria-hidden={page === activePage ? undefined : true}
          >
            {renderPage(page)}
          </div>
        ))}
        {!activeIsKeptAlive && (
          <Suspense fallback={loadingView}>
            <div key={activePage} className="h-full">{renderPage(activePage)}</div>
          </Suspense>
        )}
      </div>
    </AppShell>
  );
}

export default function SellerApp({ connectivity }: { connectivity: ShellConnectivity }) {
  return (
    <ViewportProvider>
      <SellerWorkspace connectivity={connectivity} />
    </ViewportProvider>
  );
}
