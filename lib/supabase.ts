import { createClient } from '@supabase/supabase-js';
import { GlobalSettings, Material, Product, Mold, ProductVariant, RecipeItem, Gender, PlatingType, Collection, Order, ProductionBatch, OrderStatus, ProductionStage, Customer, Warehouse, Supplier, BatchType, MaterialType, PriceSnapshot, PriceSnapshotItem, ProductionType } from '../types';
import { INITIAL_SETTINGS, MOCK_PRODUCTS, MOCK_MATERIALS } from '../constants';
import { offlineDb } from './offlineDb';

export const R2_PUBLIC_URL = 'https://pub-07bab0635aee4da18c155fcc9dc3bb36.r2.dev'; 
export const CLOUDFLARE_WORKER_URL = 'https://ilios-image-handler.iliosdb.workers.dev';

const envUrl = (import.meta as any).env?.VITE_SUPABASE_URL;
const envKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY;
const envWorkerKey = (import.meta as any).env?.VITE_WORKER_AUTH_KEY;
const envGeminiKey = (import.meta as any).env?.VITE_GEMINI_API_KEY;

const SUPABASE_URL = envUrl || localStorage.getItem('VITE_SUPABASE_URL') || '';
const SUPABASE_KEY = envKey || localStorage.getItem('VITE_SUPABASE_ANON_KEY') || '';
export const AUTH_KEY_SECRET = envWorkerKey || localStorage.getItem('VITE_WORKER_AUTH_KEY') || '';
export const GEMINI_API_KEY = envGeminiKey || localStorage.getItem('VITE_GEMINI_API_KEY') || '';

export const isLocalMode = localStorage.getItem('ILIOS_LOCAL_MODE') === 'true';
export const isConfigured = (!!SUPABASE_URL && !!SUPABASE_KEY) || isLocalMode;

export const supabase = createClient(
    SUPABASE_URL || 'https://placeholder.supabase.co', 
    SUPABASE_KEY || 'placeholder'
);

/**
 * STRIPPER: Ensures only real DB columns are sent to Supabase.
 * This prevents "Column not found" errors during sync when UI objects are passed.
 */
const sanitizeProductData = (data: any) => {
    const validColumns = [
        'sku', 'prefix', 'category', 'description', 'gender', 'image_url', 
        'weight_g', 'secondary_weight_g', 'plating_type', 'production_type',
        'active_price', 'draft_price', 'selling_price', 'stock_qty', 'sample_qty',
        'is_component', 'supplier_id', 'supplier_sku', 'supplier_cost',
        'labor_casting', 'labor_setter', 'labor_technician', 'labor_plating_x', 
        'labor_plating_d', 'labor_subcontract', 'labor_stone_setting',
        'labor_casting_manual_override', 'labor_technician_manual_override',
        'labor_plating_x_manual_override', 'labor_plating_d_manual_override'
    ];
    
    const sanitized: any = {};
    validColumns.forEach(col => {
        if (data[col] !== undefined) sanitized[col] = data[col];
    });
    
    // Fallback if labor was passed as nested object in UI
    if (data.labor) {
        if (data.labor.casting_cost !== undefined) sanitized.labor_casting = data.labor.casting_cost;
        if (data.labor.setter_cost !== undefined) sanitized.labor_setter = data.labor.setter_cost;
        if (data.labor.technician_cost !== undefined) sanitized.labor_technician = data.labor.technician_cost;
        if (data.labor.plating_cost_x !== undefined) sanitized.labor_plating_x = data.labor.plating_cost_x;
        if (data.labor.plating_cost_d !== undefined) sanitized.labor_plating_d = data.labor.plating_cost_d;
        if (data.labor.subcontract_cost !== undefined) sanitized.labor_subcontract = data.labor.subcontract_cost;
        if (data.labor.stone_setting_cost !== undefined) sanitized.labor_stone_setting = data.labor.stone_setting_cost;
    }
    
    return sanitized;
};

async function fetchWithTimeout(query: any, timeoutMs: number = 3000): Promise<any> {
    const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('TIMEOUT')), timeoutMs)
    );
    return Promise.race([query, timeoutPromise]);
}

async function safeMutate(tableName: string, method: 'INSERT' | 'UPDATE' | 'DELETE' | 'UPSERT', data: any, options?: { match?: Record<string, any>, onConflict?: string }): Promise<{ data: any, error: any, queued: boolean }> {
    if (isLocalMode) {
        if (method === 'UPSERT' || method === 'INSERT' || method === 'UPDATE') {
            const table = await offlineDb.getTable(tableName) || [];
            offlineDb.saveTable(tableName, [...table, ...(Array.isArray(data) ? data : [data])]);
        }
        return { data: null, error: null, queued: false };
    }

    if (!navigator.onLine) {
        await offlineDb.enqueue({ type: 'MUTATION', table: tableName, method, data, match: options?.match, onConflict: options?.onConflict });
        return { data: null, error: null, queued: true };
    }

    try {
        let query;
        if (method === 'INSERT') query = supabase.from(tableName).insert(data).select();
        else if (method === 'UPDATE') query = supabase.from(tableName).update(data).match(options?.match || { id: data.id || data.sku }).select();
        else if (method === 'DELETE') query = supabase.from(tableName).delete().match(options?.match || { id: data.id || data.sku });
        else if (method === 'UPSERT') query = supabase.from(tableName).upsert(data, { onConflict: options?.onConflict }).select();
        
        const { data: resData, error } = await query!;
        if (error) throw error;
        return { data: Array.isArray(resData) ? resData[0] : resData, error: null, queued: false };
    } catch (err) {
        console.warn(`Cloud mutation failed. Enqueueing for retry:`, err);
        await offlineDb.enqueue({ type: 'MUTATION', table: tableName, method, data, match: options?.match, onConflict: options?.onConflict });
        return { data: null, error: null, queued: true };
    }
}

async function fetchFullTable(tableName: string, select: string = '*', filter?: (query: any) => any): Promise<any[]> {
    if (!navigator.onLine || isLocalMode) {
        const localData = await offlineDb.getTable(tableName);
        return localData || [];
    }

    try {
        let allData: any[] = [];
        let from = 0;
        let to = 999;
        let hasMore = true;

        while (hasMore) {
            let query = supabase.from(tableName).select(select).range(from, to);
            if (filter) query = filter(query);
            const { data, error } = await fetchWithTimeout(query, 4000);
            if (error) throw error;
            if (data && data.length > 0) {
                allData = [...allData, ...data];
                if (data.length < 1000) hasMore = false;
                else { from += 1000; to += 1000; }
            } else hasMore = false;
        }
        
        offlineDb.saveTable(tableName, allData);
        return allData;
    } catch (err) {
        const localData = await offlineDb.getTable(tableName);
        return localData || [];
    }
}

export const saveConfiguration = (url: string, key: string, workerKey: string, geminiKey: string) => {
    localStorage.setItem('VITE_SUPABASE_URL', url);
    localStorage.setItem('VITE_SUPABASE_ANON_KEY', key);
    localStorage.setItem('VITE_WORKER_AUTH_KEY', workerKey);
    localStorage.setItem('VITE_GEMINI_API_KEY', geminiKey);
    localStorage.removeItem('ILIOS_LOCAL_MODE');
    window.location.reload();
};

export const clearConfiguration = () => {
    localStorage.removeItem('VITE_SUPABASE_URL');
    localStorage.removeItem('VITE_SUPABASE_ANON_KEY');
    localStorage.removeItem('VITE_WORKER_AUTH_KEY');
    localStorage.removeItem('VITE_GEMINI_API_KEY');
    localStorage.removeItem('ILIOS_LOCAL_MODE');
    window.location.reload();
};

export const SYSTEM_IDS = {
    CENTRAL: '00000000-0000-0000-0000-000000000001',
    SHOWROOM: '00000000-0000-0000-0000-000000000002'
};

export const uploadProductImage = async (file: Blob, sku: string): Promise<string | null> => {
    if (!navigator.onLine || isLocalMode) throw new Error("Image upload requires internet.");
    const safeSku = sku.replace(/[^a-zA-Z0-9-\u0370-\u03FF]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, ''); 
    const fileName = `${safeSku.toUpperCase()}_${Date.now()}.jpg`;
    const uploadUrl = `${CLOUDFLARE_WORKER_URL}/${encodeURIComponent(fileName)}`;
    const response = await fetch(uploadUrl, {
        method: 'POST',
        mode: 'cors',
        headers: { 'Content-Type': 'image/jpeg', 'Authorization': AUTH_KEY_SECRET },
        body: file,
    });
    if (!response.ok) throw new Error(`Status ${response.status}`);
    return `${R2_PUBLIC_URL}/${encodeURIComponent(fileName)}`;
};

export const deleteProduct = async (sku: string, imageUrl?: string | null): Promise<{ success: boolean; error?: string }> => {
    try {
        await safeMutate('product_variants', 'DELETE', null, { match: { product_sku: sku } });
        await safeMutate('recipes', 'DELETE', null, { match: { parent_sku: sku } });
        await safeMutate('product_molds', 'DELETE', null, { match: { product_sku: sku } });
        await safeMutate('product_collections', 'DELETE', null, { match: { product_sku: sku } });
        await safeMutate('product_stock', 'DELETE', null, { match: { product_sku: sku } });
        
        const { error } = await safeMutate('products', 'DELETE', null, { match: { sku: sku } });
        if (error) throw error;

        if (imageUrl && imageUrl.startsWith(R2_PUBLIC_URL)) {
             const filename = imageUrl.split('/').pop();
             if (filename) {
                 await fetch(`${CLOUDFLARE_WORKER_URL}/${filename}`, {
                     method: 'DELETE',
                     headers: { 'Authorization': AUTH_KEY_SECRET }
                 });
             }
        }

        return { success: true };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
};

export const recordStockMovement = async (sku: string, change: number, reason: string, variantSuffix?: string) => {
    const data = { product_sku: sku, variant_suffix: variantSuffix || null, change_amount: change, reason: reason, created_at: new Date().toISOString() };
    await safeMutate('stock_movements', 'INSERT', data);
};

export const api = {
    getSettings: async (): Promise<GlobalSettings> => {
        const local = await offlineDb.getTable('global_settings');
        if (isLocalMode) return (local && local.length > 0) ? local[0] : { ...INITIAL_SETTINGS, last_calc_silver_price: 1.00 };
        try {
            const { data, error } = await fetchWithTimeout(supabase.from('global_settings').select('*').single(), 3000);
            if (error || !data) throw new Error('Data Error');
            const settings = { 
              silver_price_gram: Number(data.silver_price_gram), 
              loss_percentage: Number(data.loss_percentage), 
              barcode_width_mm: Number(data.barcode_width_mm) || 50, 
              barcode_height_mm: Number(data.barcode_height_mm) || 30,
              retail_barcode_width_mm: Number(data.retail_barcode_width_mm) || 40,
              retail_barcode_height_mm: Number(data.retail_barcode_height_mm) || 20,
              last_calc_silver_price: Number(data.last_calc_silver_price || 1.00)
            };
            offlineDb.saveTable('global_settings', [settings]);
            return settings;
        } catch (e) {
            return (local && local.length > 0) ? local[0] : { ...INITIAL_SETTINGS, last_calc_silver_price: 1.00 };
        }
    },

    getMaterials: async (): Promise<Material[]> => {
        const data = await fetchFullTable('materials');
        return data.map((m: any) => ({ id: m.id, name: m.name, type: m.type, cost_per_unit: Number(m.cost_per_unit), unit: m.unit, variant_prices: m.variant_prices || {} }));
    },

    getMolds: async (): Promise<Mold[]> => {
        const data = await fetchFullTable('molds');
        return data.map((m: any) => ({ code: m.code, location: m.location, description: m.description }));
    },

    getSuppliers: async (): Promise<Supplier[]> => {
        return fetchFullTable('suppliers', '*', (q) => q.order('name'));
    },

    getCollections: async (): Promise<Collection[]> => {
        return fetchFullTable('collections', '*', (q) => q.order('name'));
    },

    getProducts: async (): Promise<Product[]> => {
        const prodData = await fetchFullTable('products', '*, suppliers(*)'); 
        if (!prodData || prodData.length === 0) return MOCK_PRODUCTS;
        
        const [varData, recData, prodMoldsData, prodCollData, stockData] = await Promise.all([
            fetchFullTable('product_variants'),
            fetchFullTable('recipes'),
            fetchFullTable('product_molds'),
            fetchFullTable('product_collections'),
            fetchFullTable('product_stock')
        ]);

        return prodData.map((p: any) => {
            const customStock: Record<string, number> = {};
            stockData?.filter((s: any) => s.product_sku === p.sku && !s.variant_suffix).forEach((s: any) => { customStock[s.warehouse_id] = s.quantity; });
            customStock[SYSTEM_IDS.CENTRAL] = p.stock_qty;
            customStock[SYSTEM_IDS.SHOWROOM] = p.sample_qty;

            const pVariants: ProductVariant[] = varData?.filter((v: any) => v.product_sku === p.sku).map((v: any) => {
                const vCustomStock: Record<string, number> = {};
                stockData?.filter((s: any) => s.product_sku === p.sku && s.variant_suffix === v.suffix).forEach((s: any) => { vCustomStock[s.warehouse_id] = s.quantity; });
                vCustomStock[SYSTEM_IDS.CENTRAL] = v.stock_qty;
                return { suffix: v.suffix, description: v.description, stock_qty: v.stock_qty, stock_by_size: v.stock_by_size || {}, location_stock: vCustomStock, active_price: v.active_price ? Number(v.active_price) : null, selling_price: v.selling_price ? Number(v.selling_price) : null };
            }) || [];

            const uniqueMoldsMap = new Map<string, { code: string, quantity: number }>();
            prodMoldsData?.filter((pm: any) => pm.product_sku === p.sku).forEach((pm: any) => {
                uniqueMoldsMap.set(pm.mold_code, { code: pm.mold_code, quantity: pm.quantity || 1 });
            });
            const pMolds = Array.from(uniqueMoldsMap.values());

            return {
                sku: p.sku, prefix: p.prefix, category: p.category, description: p.description, gender: p.gender as Gender, image_url: p.image_url, weight_g: Number(p.weight_g), secondary_weight_g: p.secondary_weight_g ? Number(p.secondary_weight_g) : undefined, plating_type: p.plating_type as PlatingType, production_type: p.production_type || 'InHouse', supplier_id: p.supplier_id, 
                supplier_sku: p.supplier_sku,
                supplier_cost: Number(p.supplier_cost || 0), supplier_details: p.suppliers, active_price: Number(p.active_price), draft_price: Number(p.draft_price), selling_price: Number(p.selling_price || 0), stock_qty: p.stock_qty, sample_qty: p.sample_qty, stock_by_size: p.stock_by_size || {}, sample_stock_by_size: p.sample_stock_by_size || {}, location_stock: customStock, 
                molds: pMolds, 
                is_component: p.is_component, variants: pVariants, recipe: (recData?.filter((r: any) => r.parent_sku === p.sku) || []).map((r: any) => ({ type: r.type, id: r.material_id, sku: r.component_sku, quantity: Number(r.quantity) })), collections: prodCollData?.filter((pc: any) => pc.product_sku === p.sku).map((pc: any) => pc.collection_id) || [],
                labor: { casting_cost: Number(p.labor_casting), setter_cost: Number(p.labor_setter), technician_cost: Number(p.labor_technician), plating_cost_x: Number(p.labor_plating_x || 0), plating_cost_d: Number(p.labor_plating_d || 0), subcontract_cost: Number(p.labor_subcontract || 0), technician_cost_manual_override: p.labor_technician_manual_override, plating_cost_x_manual_override: p.labor_plating_x_manual_override, plating_cost_d_manual_override: p.labor_plating_d_manual_override, stone_setting_cost: Number(p.labor_stone_setting || 0) }
            };
        });
    },

    getWarehouses: async (): Promise<Warehouse[]> => {
        const data = await fetchFullTable('warehouses', '*', (q) => q.order('created_at'));
        if (!data || data.length === 0) return [{ id: SYSTEM_IDS.CENTRAL, name: 'Κεντρική Αποθήκη', type: 'Central', is_system: true }, { id: SYSTEM_IDS.SHOWROOM, name: 'Δειγματολόγιο', type: 'Showroom', is_system: true }];
        return data as Warehouse[];
    },

    getCustomers: async (): Promise<Customer[]> => {
        return fetchFullTable('customers', '*', (q) => q.order('full_name'));
    },

    getOrders: async (): Promise<Order[]> => {
        return fetchFullTable('orders', '*', (q) => q.order('created_at', { ascending: false }));
    },

    getProductionBatches: async (): Promise<ProductionBatch[]> => {
        return fetchFullTable('production_batches', '*', (q) => q.order('created_at', { ascending: false }));
    },

    getPriceSnapshots: async (): Promise<PriceSnapshot[]> => {
        return fetchFullTable('price_snapshots', '*', (q) => q.order('created_at', { ascending: false }));
    },

    getPriceSnapshotItems: async (snapshotId: string): Promise<PriceSnapshotItem[]> => {
        return fetchFullTable('price_snapshot_items', '*', (q) => q.eq('snapshot_id', snapshotId));
    },

    saveProduct: async (productData: any) => { 
        const sanitized = sanitizeProductData(productData);
        return safeMutate('products', 'UPSERT', sanitized, { onConflict: 'sku' }); 
    },
    saveProductVariant: async (variantData: any) => { 
        // Cleanup variant to prevent extra keys
        const { location_stock, stock_by_size, ...cleanVariant } = variantData;
        return safeMutate('product_variants', 'UPSERT', cleanVariant, { onConflict: 'product_sku, suffix' }); 
    },
    deleteProductVariants: async (sku: string) => { return safeMutate('product_variants', 'DELETE', null, { match: { product_sku: sku } }); },
    deleteProductRecipes: async (sku: string) => { return safeMutate('recipes', 'DELETE', null, { match: { parent_sku: sku } }); },
    insertRecipe: async (recipeData: any) => { return safeMutate('recipes', 'INSERT', recipeData); },
    deleteProductMolds: async (sku: string) => { return safeMutate('product_molds', 'DELETE', null, { match: { product_sku: sku } }); },
    insertProductMold: async (moldData: any) => { return safeMutate('product_molds', 'INSERT', moldData); },

    saveWarehouse: async (wh: Partial<Warehouse>): Promise<void> => { await safeMutate('warehouses', 'INSERT', wh); },
    updateWarehouse: async (id: string, updates: Partial<Warehouse>): Promise<void> => { await safeMutate('warehouses', 'UPDATE', updates, { match: { id } }); },
    deleteWarehouse: async (id: string): Promise<void> => { await safeMutate('warehouses', 'DELETE', null, { match: { id } }); },
    saveSupplier: async (s: Partial<Supplier>): Promise<void> => { await safeMutate('suppliers', s.id ? 'UPDATE' : 'INSERT', s, s.id ? { match: { id: s.id } } : undefined); },
    deleteSupplier: async (id: string): Promise<void> => { await safeMutate('suppliers', 'DELETE', null, { match: { id } }); },
    saveCustomer: async (c: Partial<Customer>): Promise<Customer | null> => { 
        const result = await safeMutate('customers', c.id ? 'UPDATE' : 'INSERT', c, c.id ? { match: { id: c.id } } : undefined); 
        return result.data;
    },
    updateCustomer: async (id: string, updates: Partial<Customer>): Promise<void> => { await safeMutate('customers', 'UPDATE', updates, { match: { id } }); },
    deleteCustomer: async (id: string): Promise<void> => { await safeMutate('customers', 'DELETE', null, { match: { id } }); },
    saveOrder: async (o: Order): Promise<void> => { await safeMutate('orders', 'INSERT', o); },
    updateOrder: async (o: Order): Promise<void> => { await safeMutate('orders', 'UPDATE', o, { match: { id: o.id } }); },
    deleteOrder: async (id: string): Promise<void> => { await safeMutate('orders', 'DELETE', null, { match: { id } }); },
    updateBatchStage: async (id: string, stage: ProductionStage): Promise<void> => { await safeMutate('production_batches', 'UPDATE', { current_stage: stage, updated_at: new Date().toISOString() }, { match: { id } }); },
    deleteProductionBatch: async (id: string): Promise<void> => { await safeMutate('production_batches', 'DELETE', null, { match: { id } }); },
    updateOrderStatus: async (id: string, status: OrderStatus): Promise<void> => { await safeMutate('orders', 'UPDATE', { status }, { match: { id } }); },

    setProductCollections: async (sku: string, collectionIds: number[]): Promise<void> => {
        await safeMutate('product_collections', 'DELETE', null, { match: { product_sku: sku } });
        if (collectionIds.length > 0) {
            const inserts = collectionIds.map(id => ({ product_sku: sku, collection_id: id }));
            await safeMutate('product_collections', 'INSERT', inserts);
        }
    },

    createPriceSnapshot: async (notes: string, products: Product[]): Promise<void> => {
        if (isLocalMode) return;
        
        const items: any[] = [];
        products.forEach(p => {
            if (!p.is_component) {
                items.push({ product_sku: p.sku, variant_suffix: null, price: p.selling_price || 0 });
            }
            p.variants?.forEach(v => {
                items.push({ product_sku: p.sku, variant_suffix: v.suffix, price: v.selling_price || 0 });
            });
        });

        if (!navigator.onLine) {
            await safeMutate('price_snapshots', 'INSERT', { 
                notes, 
                item_count: items.length,
                created_at: new Date().toISOString()
            });
            return;
        }

        const { error } = await supabase.rpc('create_price_snapshot_v2', { 
            p_notes: notes, 
            p_items: items 
        });
        
        if (error) throw error;
    },

    deletePriceSnapshot: async (id: string): Promise<void> => {
        await safeMutate('price_snapshot_items', 'DELETE', null, { match: { snapshot_id: id } });
        await safeMutate('price_snapshots', 'DELETE', null, { match: { id } });
    },

    revertToPriceSnapshot: async (id: string): Promise<void> => {
        const { data: items } = await supabase.from('price_snapshot_items').select('*').eq('snapshot_id', id);
        if (!items) return;

        for (const item of items) {
            if (item.variant_suffix) {
                await safeMutate('product_variants', 'UPDATE', { selling_price: item.price }, { match: { product_sku: item.product_sku, suffix: item.variant_suffix } });
            } else {
                await safeMutate('products', 'UPDATE', { selling_price: item.price }, { match: { sku: item.product_sku } });
            }
        }
    },

    sendOrderToProduction: async (orderId: string, allProducts: Product[], allMaterials: Material[]): Promise<void> => {
        let order: Order | null = null;
        try {
            const { data } = await supabase.from('orders').select('*').eq('id', orderId).single();
            order = data;
        } catch (e) {
            const localOrders = await offlineDb.getTable('orders');
            order = localOrders?.find(o => o.id === orderId) || null;
        }

        if (!order) throw new Error("Order not found.");

        const batches: any[] = [];
        for (const item of order.items) {
            const product = allProducts.find(p => p.sku === item.sku);
            if (!product) continue;

            const hasStones = product.recipe.some(r => {
                if (r.type !== 'raw') return false;
                const material = allMaterials.find(m => m.id === r.id);
                return material?.type === MaterialType.Stone;
            });

            const stage = product.production_type === ProductionType.Imported ? ProductionStage.AwaitingDelivery : ProductionStage.Waxing;

            batches.push({
                id: crypto.randomUUID?.() || Math.random().toString(36).substring(2, 15), 
                order_id: orderId,
                sku: item.sku,
                variant_suffix: item.variant_suffix || null,
                quantity: item.quantity,
                current_stage: stage,
                size_info: item.size_info || null,
                priority: 'Normal',
                type: 'Νέα',
                requires_setting: hasStones,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            });
        }

        if (batches.length > 0) {
            await safeMutate('production_batches', 'UPSERT', batches, { onConflict: 'id' });
        }

        await safeMutate('orders', 'UPDATE', { status: OrderStatus.InProduction }, { match: { id: orderId } });
    },

    splitBatch: async (originalBatchId: string, originalNewQty: number, newBatchData: any): Promise<void> => {
        await safeMutate('production_batches', 'UPDATE', { quantity: originalNewQty, updated_at: new Date().toISOString() }, { match: { id: originalBatchId } });
        await safeMutate('production_batches', 'INSERT', newBatchData);
    },

    syncOfflineData: async (): Promise<number> => {
        if (isLocalMode) return 0;
        const queue = await offlineDb.getQueue();
        if (queue.length === 0) return 0;
        let successCount = 0;
        for (const item of queue) {
            try {
                let query;
                // Double sanitization during sync loop to ensure non-recoverable items are cleaned
                const cleanData = item.table === 'products' ? sanitizeProductData(item.data) : item.data;

                if (item.method === 'INSERT') query = supabase.from(item.table).insert(cleanData);
                else if (item.method === 'UPDATE') query = supabase.from(item.table).update(cleanData).match(item.match || { id: item.data.id || item.data.sku });
                else if (item.method === 'DELETE') query = supabase.from(item.table).delete().match(item.match || { id: item.data.id || item.data.sku });
                else if (item.method === 'UPSERT') query = supabase.from(item.table).upsert(cleanData, { onConflict: item.onConflict });
                
                const { error } = await query!;
                
                if (!error) {
                    await offlineDb.dequeue(item.id);
                    successCount++;
                } else {
                    console.error(`Sync item failed [${item.table}]: ${error.message || JSON.stringify(error)}`, { data: item.data });
                    const errCode = error.code || '';
                    if (errCode.startsWith('42') || errCode.startsWith('PGRST') || errCode === '23505') {
                        console.warn("Discarding non-recoverable sync item:", item);
                        await offlineDb.dequeue(item.id);
                        window.dispatchEvent(new CustomEvent('ilios-sync-error', { 
                            detail: { message: `Αποτυχία συγχρονισμού για ${item.table}. Η ενέργεια απορρίφθηκε λόγω σφάλματος δεδομένων.` } 
                        }));
                    }
                }
            } catch (err) {
                console.error("Sync network/unexpected error:", err);
            }
        }
        return successCount;
    },

    getFullSystemExport: async (): Promise<Record<string, any[]>> => {
        const tables = [
            'products', 'product_variants', 'materials', 'molds', 'orders', 
            'customers', 'suppliers', 'warehouses', 'production_batches', 
            'product_stock', 'stock_movements', 'recipes', 'product_molds', 
            'collections', 'product_collections', 'global_settings',
            'price_snapshots', 'price_snapshot_items'
        ];
        const results: Record<string, any[]> = {};
        for (const table of tables) {
            results[table] = await fetchFullTable(table);
        }
        return results;
    },

    restoreFullSystem: async (backupData: Record<string, any[]>): Promise<void> => {
        const order = [
            'suppliers', 'warehouses', 'customers', 'materials', 'molds', 'collections',
            'products', 'product_variants', 'recipes', 'product_molds', 'product_collections',
            'orders', 'production_batches', 'product_stock', 'stock_movements', 'global_settings',
            'price_snapshots', 'price_snapshot_items'
        ];

        if (isLocalMode || !SUPABASE_URL) {
            for (const table of order) {
                if (backupData[table]) await offlineDb.saveTable(table, backupData[table]);
            }
            localStorage.setItem('ILIOS_LOCAL_MODE', 'true');
            return;
        }

        for (const table of [...order].reverse()) {
            await supabase.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000').is('id', 'not.null');
            if (table === 'products') await supabase.from(table).delete().neq('sku', 'WIPE_ALL');
        }

        for (const table of order) {
            const data = backupData[table];
            if (data && data.length > 0) {
                const chunkSize = 200;
                for (let i = 0; i < data.length; i += chunkSize) {
                    await supabase.from(table).insert(data.slice(i, i + chunkSize));
                }
            }
        }
    }
};