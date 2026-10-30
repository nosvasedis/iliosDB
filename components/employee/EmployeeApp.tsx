import React, { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import EmployeeDashboard from './EmployeeDashboard';
import EmployeeOrders from './EmployeeOrders';
import EmployeeRegistry from './EmployeeRegistry';
import EmployeeCollections from './EmployeeCollections';
import { Product, ProductVariant, Order } from '../../types';
import type { EmployeePage } from '../../surfaces/pageIds';
import { employeeNavItems, employeeNavSections } from '../../surfaces/navConfig';
import { useProducts } from '../../hooks/api/useProducts';
import { useDeliveryNavBadge } from '../../hooks/api/useOrderDeliveryPlans';
import { orderKeys, ordersRepository } from '../../features/orders';
import { useUI } from '../UIProvider';
import IliosLoader from '../ui/IliosLoader';
import AppShell, { type ShellConnectivity } from '../shell/AppShell';
import { ViewportProvider, useViewport } from '../shell/viewport';

// Heavy, rarely-first screens load on demand so the store shell opens fast on weak phones.
const loadMobileOrderBuilder = () => import('../mobile/MobileOrderBuilder');
const MobileOrderBuilder = lazy(loadMobileOrderBuilder);
const DesktopOrderBuilderPanel = lazy(() => import('../shell/DesktopOrderBuilderPanel'));
const DeliveriesPage = lazy(() => import('../DeliveriesPage'));
const MobileDeliveries = lazy(() => import('../mobile/MobileDeliveries'));
const EmployeeCustomers = lazy(() => import('./EmployeeCustomers'));
const EmployeeProduction = lazy(() => import('./EmployeeProduction'));
const EmployeeInventory = lazy(() => import('./EmployeeInventory'));
const CustomerServiceWorkspace = lazy(() => import('../CustomerServiceWorkspace'));

type PrintItem = { product: Product; variant?: ProductVariant; quantity: number, format?: 'standard' | 'simple' | 'retail' };

interface Props {
    setPrintItems?: (items: PrintItem[]) => void;
    connectivity: ShellConnectivity;
}

const pageLabel = (page: EmployeePage) => employeeNavItems.find((i) => i.id === page)?.label ?? '';
const navItem = (id: EmployeePage) => employeeNavItems.find((i) => i.id === id)!;
const STORE_BAR_ITEMS = [navItem('dashboard'), navItem('registry'), navItem('orders')] as const;

/** Screens whose filters and scroll position survive switching away and back. */
const KEEP_ALIVE_PAGES: EmployeePage[] = ['registry', 'collections'];

const hiddenPageStyle: React.CSSProperties = {
    position: 'absolute',
    inset: 0,
    visibility: 'hidden',
    pointerEvents: 'none',
    contentVisibility: 'hidden',
};

function StoreWorkspace({ setPrintItems, connectivity }: Props) {
    const { isDesktop } = useViewport();
    const queryClient = useQueryClient();
    const { showToast } = useUI();
    const [activePage, setActivePage] = useState<EmployeePage>('dashboard');
    const [visited, setVisited] = useState<ReadonlySet<EmployeePage>>(() => new Set<EmployeePage>(['dashboard']));
    const [builder, setBuilder] = useState<{ order: Order | null } | null>(null);
    const [openingId, setOpeningId] = useState<string | null>(null);
    const [pendingDeliveryOrderId, setPendingDeliveryOrderId] = useState<string | null>(null);
    const { data: products } = useProducts();
    const { badgeCount } = useDeliveryNavBadge();

    const navigate = useCallback((page: EmployeePage) => {
        setBuilder(null);
        setActivePage(page);
        setVisited((prev) => (prev.has(page) ? prev : new Set(prev).add(page)));
    }, []);

    // Warm the order-builder code while the clerk browses, so "Νέα" opens instantly.
    useEffect(() => {
        const w = window as Window & { requestIdleCallback?: (cb: () => void) => number; cancelIdleCallback?: (h: number) => void };
        const run = () => { void loadMobileOrderBuilder(); };
        const handle = w.requestIdleCallback ? w.requestIdleCallback(run) : window.setTimeout(run, 2500);
        return () => { if (w.requestIdleCallback && w.cancelIdleCallback) w.cancelIdleCallback(handle); else window.clearTimeout(handle); };
    }, []);

    const handleCreateOrder = useCallback(() => {
        setActivePage('orders');
        setBuilder({ order: null });
    }, []);

    // The orders list is the light query (no line items); load the full order before editing.
    const handleEditOrder = useCallback(async (order: Order) => {
        if (order.items?.length) {
            setBuilder({ order });
            return;
        }
        setOpeningId(order.id);
        try {
            const full = await queryClient.fetchQuery({
                queryKey: orderKeys.detail(order.id),
                queryFn: () => ordersRepository.getOrderById(order.id),
            });
            if (full) setBuilder({ order: full });
            else showToast('Η παραγγελία δεν βρέθηκε.', 'error');
        } catch {
            showToast('Σφάλμα φόρτωσης παραγγελίας.', 'error');
        } finally {
            setOpeningId(null);
        }
    }, [queryClient, showToast]);

    const closeBuilder = useCallback(() => setBuilder(null), []);

    const openDeliveries = useCallback((order: Order) => {
        setPendingDeliveryOrderId(order.id);
        navigate('deliveries');
    }, [navigate]);

    const loadingView = (detail: string) => <IliosLoader variant="section" detail={detail} className="h-full min-h-full bg-slate-50" />;
    const scrollPage = (node: React.ReactNode) => <div className="h-full overflow-y-auto overscroll-contain p-3 custom-scrollbar sm:p-4 lg:p-0">{node}</div>;

    const renderPage = (page: EmployeePage): React.ReactNode => {
        switch (page) {
            case 'dashboard':
                return <EmployeeDashboard onNavigate={navigate} onCreateOrder={handleCreateOrder} />;
            case 'orders':
                return <EmployeeOrders onCreate={handleCreateOrder} onEdit={handleEditOrder} onOpenDeliveries={openDeliveries} openingId={openingId} />;
            case 'deliveries':
                return isDesktop
                    ? scrollPage(<DeliveriesPage pendingOrderId={pendingDeliveryOrderId} onConsumePendingOrderId={() => setPendingDeliveryOrderId(null)} onOpenOrder={() => navigate('orders')} />)
                    : <div className="h-full overflow-y-auto overscroll-contain"><MobileDeliveries pendingOrderId={pendingDeliveryOrderId} onConsumePendingOrderId={() => setPendingDeliveryOrderId(null)} onOpenOrder={() => navigate('orders')} /></div>;
            case 'production':
                return <EmployeeProduction />;
            case 'consignments':
                return scrollPage(<CustomerServiceWorkspace mode="consignments" />);
            case 'repairs':
                return scrollPage(<CustomerServiceWorkspace mode="repairs" />);
            case 'registry':
                return <EmployeeRegistry setPrintItems={setPrintItems} />;
            case 'customers':
                return <EmployeeCustomers />;
            case 'collections':
                return <EmployeeCollections setPrintItems={setPrintItems} />;
            case 'inventory':
                return scrollPage(<EmployeeInventory />);
        }
    };

    const renderBuilder = () => {
        if (!products) return loadingView('Νέα παραγγελία');
        return isDesktop ? (
            <DesktopOrderBuilderPanel onBack={closeBuilder} initialOrder={builder?.order ?? null} products={products} />
        ) : (
            <div className="h-full bg-white">
                <MobileOrderBuilder onBack={closeBuilder} initialOrder={builder?.order ?? null} products={products} />
            </div>
        );
    };

    const keepAlive = KEEP_ALIVE_PAGES.filter((page) => visited.has(page));
    const showKeptAlive = !builder && keepAlive.includes(activePage);

    return (
        <AppShell
            activePage={activePage}
            onNavigate={navigate}
            sections={employeeNavSections}
            barItems={STORE_BAR_ITEMS}
            primaryAction={{ label: 'Νέα παραγγελία', onClick: handleCreateOrder, isActive: !!builder }}
            workspaceLabel="Κατάστημα"
            connectivity={connectivity}
            badges={{ deliveries: badgeCount }}
            hideBottomBar={!!builder}
            storageKey="ilios-store-sidebar-collapsed"
        >
            <div className="relative h-full">
                {keepAlive.map((page) => {
                    const visible = showKeptAlive && page === activePage;
                    return (
                        <div key={page} className="h-full" style={visible ? undefined : hiddenPageStyle} aria-hidden={visible ? undefined : true}>
                            {renderPage(page)}
                        </div>
                    );
                })}
                {!showKeptAlive && (
                    <Suspense fallback={loadingView(builder ? 'Νέα παραγγελία' : pageLabel(activePage))}>
                        <div key={builder ? 'builder' : activePage} className="h-full">
                            {builder ? renderBuilder() : renderPage(activePage)}
                        </div>
                    </Suspense>
                )}
            </div>
        </AppShell>
    );
}

export default function EmployeeApp(props: Props) {
    return (
        <ViewportProvider>
            <StoreWorkspace {...props} />
        </ViewportProvider>
    );
}
