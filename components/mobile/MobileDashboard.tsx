import React, { useMemo, useState } from 'react';
import { Product, GlobalSettings, OrderStatus } from '../../types';
import { Activity, Factory, Coins, Plus, ScanBarcode, Zap, Package, ShoppingCart, Users, ScrollText, Settings, CheckCircle, Truck, Eye, EyeOff, ChevronLeft, ChevronRight } from 'lucide-react';
import MobileScreenHeader from './MobileScreenHeader';
import { formatCurrency, formatDecimal } from '../../utils/pricingEngine';
import { useQuery } from '@tanstack/react-query';
import { useOrdersWithItems } from '../../hooks/api/useOrders';
import { productionKeys, productionRepository } from '../../features/production';
import { APP_ICON_ONLY } from '../../constants';
import { useAuth } from '../AuthContext';
import { getOrderStatusClasses, getOrderStatusIcon, getOrderStatusLabel } from '../../features/orders/statusPresentation';
import { useFinanceAnalytics } from '../../hooks/api/useFinanceAnalytics';

interface Props {
    products: Product[];
    settings: GlobalSettings;
    onNavigate?: (page: string) => void;
}

const QuickAction = ({ icon, label, color, onClick }: { icon: React.ReactNode, label: string, color: string, onClick: () => void }) => (
    <button
        onClick={onClick}
        className="flex flex-col items-center justify-center bg-white p-3 rounded-2xl border border-slate-100 shadow-sm active:scale-[0.98] transition-all w-full h-24"
    >
        <div className={`p-2.5 rounded-xl mb-1.5 ${color}`}>{icon}</div>
        <span className="text-[10px] font-bold text-slate-700 text-center leading-tight">{label}</span>
    </button>
);

type StatSlide = {
    id: string;
    title: string;
    value: string;
    sub?: string;
    icon: React.ElementType;
    bg: string;
    text: string;
    blurValue?: boolean;
    showEyeToggle?: boolean;
    isValueVisible?: boolean;
    onToggleVisibility?: () => void;
};

const StatCarousel = ({
    slides,
    activeIndex,
    onPrev,
    onNext,
}: {
    slides: StatSlide[];
    activeIndex: number;
    onPrev: () => void;
    onNext: () => void;
}) => {
    const slide = slides[activeIndex];
    const Icon = slide.icon;

    return (
        <div className={`p-5 pb-6 rounded-2xl ${slide.bg} flex flex-col justify-between h-32 relative overflow-hidden shadow-sm transition-colors duration-300`}>
            <div className="absolute right-0 top-0 p-4 opacity-10 transform scale-150 origin-top-right pointer-events-none">
                <Icon size={48} className={slide.text} />
            </div>

            <div className="flex items-center justify-between gap-2 relative z-10">
                <div className="flex items-center gap-2 min-w-0">
                    <div className="p-1.5 bg-white/20 rounded-lg backdrop-blur-sm shrink-0">
                        <Icon size={16} className={slide.text} />
                    </div>
                    <span className={`text-[10px] font-black uppercase tracking-wider opacity-80 truncate ${slide.text}`}>{slide.title}</span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                    <button
                        type="button"
                        onClick={onPrev}
                        className="p-1 rounded-lg hover:bg-white/10 transition-colors opacity-60 hover:opacity-100"
                        aria-label="Προηγούμενο"
                    >
                        <ChevronLeft size={18} className={slide.text} />
                    </button>
                    <button
                        type="button"
                        onClick={onNext}
                        className="p-1 rounded-lg hover:bg-white/10 transition-colors opacity-60 hover:opacity-100"
                        aria-label="Επόμενο"
                    >
                        <ChevronRight size={18} className={slide.text} />
                    </button>
                </div>
            </div>

            <div className="relative z-10">
                <div className="flex items-center gap-2">
                    <div className={`text-2xl font-black ${slide.text} ${slide.blurValue ? 'blur-lg select-none' : ''}`}>{slide.value}</div>
                    {slide.showEyeToggle && slide.onToggleVisibility && (
                        <button
                            type="button"
                            onClick={slide.onToggleVisibility}
                            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors opacity-60 hover:opacity-100"
                            title={slide.isValueVisible ? 'Απόκρυψη' : 'Εμφάνιση'}
                        >
                            {slide.isValueVisible ? <EyeOff size={16} className={slide.text} /> : <Eye size={16} className={slide.text} />}
                        </button>
                    )}
                </div>
                {slide.sub && <div className={`text-[10px] font-medium opacity-70 ${slide.text}`}>{slide.sub}</div>}
            </div>

            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 z-10">
                {slides.map((s, i) => (
                    <div
                        key={s.id}
                        className={`h-1 rounded-full transition-all duration-300 ${i === activeIndex ? 'w-4 bg-white/80' : 'w-1.5 bg-white/30'}`}
                    />
                ))}
            </div>
        </div>
    );
};

export default function MobileDashboard({ products, settings, onNavigate }: Props) {
    const { data: orders } = useOrdersWithItems();
    const { data: batches } = useQuery({
        queryKey: productionKeys.batches(),
        queryFn: productionRepository.getProductionBatches,
    });
    const { analytics: financeStats } = useFinanceAnalytics({
        products,
        settings,
        period: { mode: 'current_year' },
    });
    const { profile } = useAuth();
    const [showPendingRevenue, setShowPendingRevenue] = useState(false);
    const [showYearRevenue, setShowYearRevenue] = useState(false);
    const [statSlideIndex, setStatSlideIndex] = useState(0);

    const stats = useMemo(() => {
        // Inventory Value (Approx)
        const stockValue = products.reduce((acc, p) => acc + (p.active_price * p.stock_qty), 0);

        // Active Orders
        const activeOrders = orders?.filter(o => o.status === OrderStatus.Pending || o.status === OrderStatus.InProduction || o.status === OrderStatus.Ready || o.status === OrderStatus.PartiallyDelivered) || [];

        // Production
        const activeBatches = batches?.filter(b => b.current_stage !== 'Ready') || [];
        const delayedBatches = activeBatches.filter(b => {
            const lastUpdate = new Date(b.updated_at).getTime();
            const diffHours = (Date.now() - lastUpdate) / (1000 * 60 * 60);
            return diffHours > 48;
        }).length;

        // Recent ACTIVE Activity
        const activeRecentOrders = activeOrders
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
            .slice(0, 5);

        return {
            stockValue,
            pendingRevenue: financeStats?.totals.backlogNet ?? 0,
            realizedRevenue: financeStats?.totals.realizedNet ?? 0,
            shippedPieces: financeStats?.totals.shippedPieces ?? 0,
            activeOrdersCount: financeStats?.totals.activeOrderCount ?? activeOrders.length,
            activeBatchesCount: activeBatches.length,
            delayedBatches,
            recentOrders: activeRecentOrders
        };
    }, [products, orders, batches, financeStats]);

    const statSlides: StatSlide[] = useMemo(() => [
        {
            id: 'pending',
            title: 'Εκκρεμής αξία',
            value: formatCurrency(stats.pendingRevenue),
            sub: `${stats.activeOrdersCount} ανοιχτές παραγγελίες`,
            icon: Activity,
            bg: 'bg-slate-900',
            text: 'text-white',
            blurValue: !showPendingRevenue,
            showEyeToggle: true,
            isValueVisible: showPendingRevenue,
            onToggleVisibility: () => setShowPendingRevenue(v => !v),
        },
        {
            id: 'revenue',
            title: 'Έσοδα έτους',
            value: formatCurrency(stats.realizedRevenue),
            sub: `${stats.shippedPieces} τεμ. απεστάλησαν`,
            icon: Truck,
            bg: 'bg-emerald-600',
            text: 'text-white',
            blurValue: !showYearRevenue,
            showEyeToggle: true,
            isValueVisible: showYearRevenue,
            onToggleVisibility: () => setShowYearRevenue(v => !v),
        },
        {
            id: 'production',
            title: 'Παραγωγή',
            value: stats.activeBatchesCount.toString(),
            sub: stats.delayedBatches > 0 ? `${stats.delayedBatches} καθυστερήσεις` : 'Ομαλή ροή',
            icon: Factory,
            bg: 'bg-amber-500',
            text: 'text-white',
        },
        {
            id: 'silver',
            title: 'Ασήμι',
            value: `${formatDecimal(settings.silver_price_gram, 2)}€`,
            sub: 'Τρέχουσα Τιμή',
            icon: Coins,
            bg: 'bg-indigo-600',
            text: 'text-white',
        },
    ], [stats, settings.silver_price_gram, showPendingRevenue, showYearRevenue]);

    const goToPrevStat = () => setStatSlideIndex(i => (i - 1 + statSlides.length) % statSlides.length);
    const goToNextStat = () => setStatSlideIndex(i => (i + 1) % statSlides.length);

    return (
        <div className="min-h-screen bg-slate-50 pb-28">
            <MobileScreenHeader
                iconElement={<img src={APP_ICON_ONLY} alt="" className="h-7 w-7 object-contain" />}
                iconWrapClassName="border-slate-200/80 bg-white p-1 shadow-sm"
                title="Αρχική"
                subtitle={`Καλησπέρα, ${profile?.full_name?.split(' ')[0] || 'User'} · Ilios ERP`}
            />

            <div className="space-y-6 p-5 pt-4">
            <StatCarousel
                slides={statSlides}
                activeIndex={statSlideIndex}
                onPrev={goToPrevStat}
                onNext={goToNextStat}
            />

            {/* Quick Actions Grid */}
            <div>
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 ml-1">Γρηγορες Ενεργειες</h3>
                <div className="grid grid-cols-4 gap-3">
                    <QuickAction
                        icon={<Plus size={20} />}
                        label="Νέα Παραγγελία"
                        color="bg-emerald-100 text-emerald-700"
                        onClick={() => onNavigate && onNavigate('orders')}
                    />
                    <QuickAction
                        icon={<ScanBarcode size={20} />}
                        label="Scan Stock"
                        color="bg-blue-100 text-blue-700"
                        onClick={() => onNavigate && onNavigate('inventory')}
                    />
                    <QuickAction
                        icon={<Factory size={20} />}
                        label="Παραγωγή"
                        color="bg-amber-100 text-amber-700"
                        onClick={() => onNavigate && onNavigate('production')}
                    />
                    <QuickAction
                        icon={<Package size={20} />}
                        label="Προϊόντα"
                        color="bg-orange-100 text-orange-700"
                        onClick={() => onNavigate && onNavigate('registry')}
                    />
                    <QuickAction
                        icon={<Zap size={20} />}
                        label="AI Studio"
                        color="bg-purple-100 text-purple-700"
                        onClick={() => onNavigate && onNavigate('ai-studio')}
                    />
                    <QuickAction
                        icon={<Users size={20} />}
                        label="Πελάτες"
                        color="bg-cyan-100 text-cyan-700"
                        onClick={() => onNavigate && onNavigate('customers')}
                    />
                    <QuickAction
                        icon={<ScrollText size={20} />}
                        label="Κατάλογος"
                        color="bg-pink-100 text-pink-700"
                        onClick={() => onNavigate && onNavigate('pricelist')}
                    />
                    <QuickAction
                        icon={<Settings size={20} />}
                        label="Ρυθμίσεις"
                        color="bg-slate-100 text-slate-700"
                        onClick={() => onNavigate && onNavigate('settings')}
                    />
                </div>
            </div>

            {/* Recent Activity */}
            <div>
                <div className="flex justify-between items-center mb-3 ml-1">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Ενεργες Παραγγελιες</h3>
                    <button onClick={() => onNavigate && onNavigate('orders')} className="text-xs font-bold text-emerald-600">Όλες</button>
                </div>
                <div className="space-y-3">
                    {stats.recentOrders.map(order => {
                        // FIX: Handle 0% VAT rate correctly
                        const activeVat = order.vat_rate !== undefined ? order.vat_rate : 0.24;
                        const netValue = order.total_price / (1 + activeVat);
                        return (
                            <div
                                key={order.id}
                                onClick={() => onNavigate && onNavigate('orders')}
                                className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-col gap-3 active:scale-[0.98] transition-transform"
                            >
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 border border-slate-100">
                                            <ShoppingCart size={18} />
                                        </div>
                                        <div>
                                            <div className="font-black text-slate-800 text-sm leading-tight">{order.customer_name}</div>
                                            <div className="text-[10px] text-slate-400 font-mono">#{order.id.slice(0, 8)}</div>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="font-black text-slate-900 text-sm">{formatCurrency(netValue)}</div>
                                        <div className="text-[10px] text-slate-400 font-bold">{order.items.length} είδη</div>
                                    </div>
                                </div>

                                {/* STATUS BAR */}
                                <div className="flex items-center justify-between pt-2 border-t border-slate-50">
                                    <div className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase flex items-center gap-1.5 border ${getOrderStatusClasses(order.status, 'mobileDashboard')}`}>
                                        {getOrderStatusIcon(order.status, 14)}
                                        {getOrderStatusLabel(order.status, 'mobileCompact')}
                                    </div>
                                    <div className="text-[10px] text-slate-400 font-medium">
                                        {new Date(order.created_at).toLocaleDateString('el-GR')}
                                    </div>
                                </div>
                            </div>
                        );
                    })}

                    {stats.recentOrders.length === 0 && (
                        <div className="text-center py-10 text-slate-400 text-xs italic bg-white rounded-2xl border border-slate-100 border-dashed">
                            <CheckCircle size={24} className="mx-auto mb-2 opacity-20" />
                            Όλες οι παραγγελίες ολοκληρώθηκαν!
                        </div>
                    )}
                </div>
            </div>
            </div>
        </div>
    );
}
