import { GlobalSettings, MaterialType, Order, OrderStatus, Product } from '../types';
import { calculateProductCost } from './pricingEngine';
import { RETAIL_CUSTOMER_ID, RETAIL_CUSTOMER_NAME } from '../lib/supabase';

export const calculateBusinessStats = (orders: Order[], products: Product[], materials: any[], globalSettings: GlobalSettings) => {
    if (!orders || !products || !materials || !globalSettings) return null;

    const validOrders = orders.filter(o => o.status !== OrderStatus.Cancelled);
    const isSingleOrder = validOrders.length === 1;

    let totalRevenue = 0;
    let totalProfit = 0;
    let totalCost = 0;
    let silverSoldWeight = 0;
    let stonesSold = 0;

    const productsMap = new Map(products.map(p => [p.sku, p]));
    const materialsMap = new Map(materials.map(m => [m.id, m]));

    let silverCostSum = 0;
    let laborCostSum = 0;
    let materialCostSum = 0;
    let totalItemsSold = 0;

    const categoryStats: Record<string, { name: string, revenue: number, profit: number, cost: number }> = {};
    const salesOverTime: Record<string, { revenue: number, profit: number }> = {};
    const customerRanking: Record<string, { name: string, revenue: number, orders: number }> = {};
    const skuRanking: Record<string, { sku: string, qty: number, revenue: number, img: string | null }> = {};
    const itemsBreakdown: any[] = [];

    validOrders.forEach(order => {
        const orderSilverPrice = order.custom_silver_rate || globalSettings.silver_price_gram;
        const effectiveSettings = { ...globalSettings, silver_price_gram: orderSilverPrice };

        const shouldRankCustomer = !(order.customer_id === RETAIL_CUSTOMER_ID || order.customer_name === RETAIL_CUSTOMER_NAME);
        const cKey = order.customer_id || order.customer_name;
        if (shouldRankCustomer) {
            if (!customerRanking[cKey]) customerRanking[cKey] = { name: order.customer_name, revenue: 0, orders: 0 };
            customerRanking[cKey].orders += 1;
        }

        const date = new Date(order.created_at);
        const monthKey = date.toLocaleDateString('el-GR', { month: 'short', year: '2-digit' });
        if (!salesOverTime[monthKey]) salesOverTime[monthKey] = { revenue: 0, profit: 0 };

        const discountFactor = 1 - ((order.discount_percent || 0) / 100);
        const isActiveOrder = order.status !== OrderStatus.Delivered && order.status !== OrderStatus.Cancelled;

        order.items.forEach(item => {
            totalItemsSold += item.quantity;
            const product = products.find(p => p.sku === item.sku);

            let unitPrice = item.price_at_order;
            if (isActiveOrder && product) {
                if (item.variant_suffix) {
                    const v = product.variants?.find(v => v.suffix === item.variant_suffix);
                    if (v && (v.selling_price || 0) > 0) unitPrice = v.selling_price!;
                } else if (product.selling_price > 0) {
                    unitPrice = product.selling_price;
                }
            }

            const revenue = (unitPrice * item.quantity) * discountFactor;
            totalRevenue += revenue;

            const costResult = product ? calculateProductCost(product, effectiveSettings, materials, products, 0, new Set(), undefined, productsMap, materialsMap) : { total: 0, breakdown: { silver: 0, labor: 0, materials: 0 } };
            const unitCost = costResult.total;
            const lineCost = unitCost * item.quantity;
            const profit = revenue - lineCost;
            const margin = revenue > 0 ? (profit / revenue) * 100 : 0;

            totalProfit += profit;
            totalCost += lineCost;

            if (isSingleOrder) {
                itemsBreakdown.push({
                    sku: item.sku,
                    variant: item.variant_suffix,
                    quantity: item.quantity,
                    revenue,
                    cost: lineCost,
                    profit,
                    margin,
                    silverCost: costResult.breakdown.silver * item.quantity,
                    laborCost: costResult.breakdown.labor * item.quantity,
                    materialCost: costResult.breakdown.materials * item.quantity
                });
            }

            silverCostSum += costResult.breakdown.silver * item.quantity;
            laborCostSum += costResult.breakdown.labor * item.quantity;
            materialCostSum += costResult.breakdown.materials * item.quantity;
            silverSoldWeight += ((product?.weight_g || 0) + (product?.secondary_weight_g || 0)) * item.quantity;

            if (product?.category) {
                if (!categoryStats[product.category]) {
                    categoryStats[product.category] = { name: product.category, revenue: 0, profit: 0, cost: 0 };
                }
                categoryStats[product.category].revenue += revenue;
                categoryStats[product.category].profit += profit;
                categoryStats[product.category].cost += lineCost;
            }

            salesOverTime[monthKey].revenue += revenue;
            salesOverTime[monthKey].profit += profit;
            if (shouldRankCustomer) customerRanking[cKey].revenue += revenue;

            if (!skuRanking[item.sku]) {
                skuRanking[item.sku] = { sku: item.sku, qty: 0, revenue: 0, img: product?.image_url || null };
            }
            skuRanking[item.sku].qty += item.quantity;
            skuRanking[item.sku].revenue += revenue;

            if (product?.recipe) {
                product.recipe.forEach(recipeItem => {
                    if (recipeItem.type !== 'raw') return;
                    const material = materials.find((m: any) => m.id === recipeItem.id);
                    if (material?.type === MaterialType.Stone) {
                        stonesSold += recipeItem.quantity * item.quantity;
                    }
                });
            }
        });
    });

    const categoryChartData = Object.values(categoryStats).sort((a, b) => b.revenue - a.revenue);
    const timeChartData = Object.entries(salesOverTime).map(([name, values]) => ({
        name,
        revenue: values.revenue,
        profit: values.profit
    }));
    const topCustomers = Object.values(customerRanking).sort((a, b) => b.revenue - a.revenue).slice(0, 10);
    const topSkus = Object.values(skuRanking).sort((a, b) => b.revenue - a.revenue).slice(0, 10);
    const avgOrderValue = validOrders.length > 0 ? totalRevenue / validOrders.length : 0;
    const avgMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

    return {
        isSingleOrder,
        totalRevenue,
        totalProfit,
        totalCost,
        totalItems: totalItemsSold,
        totalItemsSold,
        orderCount: validOrders.length,
        avgOrderValue,
        averageOrderValue: avgOrderValue,
        avgBasketSize: validOrders.length > 0 ? totalItemsSold / validOrders.length : 0,
        avgMargin,
        profitMargin: avgMargin,
        cogsPercent: totalRevenue > 0 ? (totalCost / totalRevenue) * 100 : 0,
        silverSoldWeight,
        silverSoldKg: silverSoldWeight / 1000,
        stonesSold,
        silverCostSum,
        laborCostSum,
        materialCostSum,
        costBreakdown: {
            silver: silverCostSum,
            labor: laborCostSum,
            materials: materialCostSum
        },
        categoryChartData,
        timeChartData,
        topCustomers,
        topSkus,
        itemsBreakdown: isSingleOrder ? itemsBreakdown : undefined
    };
};
