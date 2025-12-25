
import { createClient } from '@supabase/supabase-js';
import { GlobalSettings, Material, Product, Mold, ProductVariant, RecipeItem, Gender, PlatingType, Collection, Order, ProductionBatch, OrderStatus, ProductionStage, Customer, Warehouse, Supplier, BatchType, MaterialType, PriceSnapshot, PriceSnapshotItem } from '../types';
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

// If no keys are provided, we check if we have local data to run "Stand-alone"
export const isLocalMode = localStorage.getItem('ILIOS_LOCAL_MODE') === 'true';
export const isConfigured = (!!SUPABASE_URL && !!SUPABASE_KEY) || isLocalMode;

export const supabase = createClient(
    SUPABASE_URL || 'https://placeholder.supabase.co', 
    SUPABASE_KEY || 'placeholder'
);

/**
 * HELPER: fetchWithTimeout
 */
async function fetchWithTimeout(query: any, timeoutMs: number = 3000): Promise<any> {
    const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('TIMEOUT')), timeoutMs)
    );
    return Promise.race([query, timeoutPromise]);
}

async function fetchFullTable(tableName: string, select: string = '*', filter?: (query: any) => any): Promise<any[]> {
    // If explicitly offline or in Local Mode, use local data immediately
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
            } else {
                hasMore = false;
            }
        }
        
        offlineDb.saveTable(tableName, allData);
        return allData;

    } catch (err) {
        console.warn(`Cloud fetch for ${tableName} failed. Using offline mirror.`);
        const localData = await offlineDb.getTable(tableName);
        return localData || [];
    }
}

export const saveConfiguration = (url: string, key: string, workerKey: string, geminiKey: string) => {
    localStorage.setItem('VITE_SUPABASE_URL', url);
    localStorage.setItem('VITE_SUPABASE_ANON_KEY', key);
    localStorage.setItem('VITE_WORKER_AUTH_KEY', workerKey);
    localStorage.setItem('VITE_GEMINI_API_KEY', geminiKey);
    localStorage.removeItem('ILIOS_LOCAL_MODE'); // Disable local mode on re-config
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

const generateUUID = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = Math.random() * 16 | 0;
        const v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
};

export const SYSTEM_IDS = {
    CENTRAL: '00000000-0000-0000-0000-000000000001',
    SHOWROOM: '00000000-0000-0000-0000-000000000002'
};

export const uploadProductImage = async (file: Blob, sku: string): Promise<string | null> => {
    const safeSku = sku.replace(/[^a-zA-Z0-9-\u0370-\u03FF]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, ''); 
    const fileName = `${safeSku.toUpperCase()}_${Date.now()}.jpg`;
    const uploadUrl = `${CLOUDFLARE_WORKER_URL}/${encodeURIComponent(fileName)}`;

    try {
        const response = await fetch(uploadUrl, {
            method: 'POST',
            mode: 'cors',
            headers: { 'Content-Type': 'image/jpeg', 'Authorization': AUTH_KEY_SECRET },
            body: file,
        });
        if (!response.ok) throw new Error(`Status ${response.status}`);
        return `${R2_PUBLIC_URL}/${encodeURIComponent(fileName)}`;
    } catch (error) {
        console.error("R2 Upload Error:", error);
        throw error;
    }
};

export const deleteProduct = async (sku: string, imageUrl?: string | null): Promise<{ success: boolean; error?: string }> => {
    try {
        if (isLocalMode) {
            const table = await offlineDb.getTable('products') || [];
            await offlineDb.saveTable('products', table.filter((p: any) => p.sku !== sku));
            return { success: true };
        }
        
        const { data: used } = await supabase.from('recipes').select('parent_sku').eq('component_sku', sku);
        if (used && used.length > 0) return { success: false, error: `Χρησιμοποιείται σε συνταγή.` };
        
        await Promise.all([
            supabase.from('product_variants').delete().eq('product_sku', sku),
            supabase.from('recipes').delete().eq('parent_sku', sku),
            supabase.from('product_molds').delete().eq('product_sku', sku),
            supabase.from('product_collections').delete().eq('product_sku', sku),
            supabase.from('stock_movements').delete().eq('product_sku', sku),
            supabase.from('product_stock').delete().eq('product_sku', sku)
        ]);
        
        const { error: deleteError } = await supabase.from('products').delete().eq('sku', sku);
        if (deleteError) throw deleteError;
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
};

export const recordStockMovement = async (sku: string, change: number, reason: string, variantSuffix?: string) => {
    const data = { product_sku: sku, variant_suffix: variantSuffix || null, change_amount: change, reason: reason, created_at: new Date().toISOString() };
    if (isLocalMode) return;
    try {
        const { error } = await supabase.from('stock_movements').insert(data);
        if (error) throw error;
    } catch (e) {
        await offlineDb.enqueue({ type: 'STOCK_MOVE', table: 'stock_movements', method: 'INSERT', data });
    }
};

export const api = {
    getSettings: async (): Promise<GlobalSettings> => {
        if (!navigator.onLine || isLocalMode) {
            const local = await offlineDb.getTable('global_settings');
            return (local && local.length > 0) ? local[0] : INITIAL_SETTINGS;
        }

        try {
            const { data, error } = await fetchWithTimeout(supabase.from('global_settings').select('*').single(), 3000);
            if (error || !data) throw new Error('Data Error');
            const settings = { silver_price_gram: Number(data.silver_price_gram), loss_percentage: Number(data.loss_percentage), barcode_width_mm: Number(data.barcode_width_mm) || 50, barcode_height_mm: Number(data.barcode_height_mm) || 30 };
            offlineDb.saveTable('global_settings', [settings]);
            return settings;
        } catch (e) {
            const local = await offlineDb.getTable('global_settings');
            return (local && local.length > 0) ? local[0] : INITIAL_SETTINGS;
        }
    },

    getMaterials: async (): Promise<Material[]> => {
        const data = await fetchFullTable('materials');
        if (!data || data.length === 0) return MOCK_MATERIALS;
        return data.map((m: any) => ({ id: m.id, name: m.name, type: m.type, cost_per_unit: Number(m.cost_per_unit), unit: m.unit, variant_prices: m.variant_prices || {} }));
    },

    getMolds: async (): Promise<Mold[]> => {
        const data = await fetchFullTable('molds');
        return data.map((m: any) => ({ code: m.code, location: m.location, description: m.description })) || [];
    },

    getSuppliers: async (): Promise<Supplier[]> => {
        return fetchFullTable('suppliers', '*', (q) => q.order('name'));
    },

    saveSupplier: async (supplier: Partial<Supplier>): Promise<void> => {
        if (isLocalMode) return;
        try {
            if (supplier.id) await supabase.from('suppliers').update(supplier).eq('id', supplier.id);
            else await supabase.from('suppliers').insert(supplier);
        } catch (e) {
            await offlineDb.enqueue({ type: 'SUPPLIER', table: 'suppliers', method: supplier.id ? 'UPDATE' : 'INSERT', data: supplier });
        }
    },

    deleteSupplier: async (id: string): Promise<void> => {
        if (isLocalMode) return;
        await supabase.from('suppliers').delete().eq('id', id);
    },

    getCollections: async (): Promise<Collection[]> => {
        return fetchFullTable('collections', '*', (q) => q.order('name'));
    },

    setProductCollections: async(sku: string, collectionIds: number[]): Promise<void> => {
        if (isLocalMode) return;
        await supabase.from('product_collections').delete().eq('product_sku', sku);
        if (collectionIds.length > 0) {
            const newLinks = collectionIds.map(id => ({ product_sku: sku, collection_id: id }));
            await supabase.from('product_collections').insert(newLinks);
        }
    },

    getProducts: async (): Promise<Product[]> => {
        try {
            const prodData = await fetchFullTable('products', '*, suppliers(*)'); 
            if (!prodData || prodData.length === 0) return MOCK_PRODUCTS;
            const skus = prodData.map(p => p.sku);
            const [varData, recData, prodMoldsData, prodCollData, stockData] = await Promise.all([
                fetchFullTable('product_variants', '*', (q) => q.in('product_sku', skus)),
                fetchFullTable('recipes', '*', (q) => q.in('parent_sku', skus)),
                fetchFullTable('product_molds', '*', (q) => q.in('product_sku', skus)),
                fetchFullTable('product_collections', '*', (q) => q.in('product_sku', skus)),
                fetchFullTable('product_stock', '*', (q) => q.in('product_sku', skus))
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

                return {
                  sku: p.sku, prefix: p.prefix, category: p.category, description: p.description, gender: p.gender as Gender, image_url: p.image_url, weight_g: Number(p.weight_g), secondary_weight_g: p.secondary_weight_g ? Number(p.secondary_weight_g) : undefined, plating_type: p.plating_type as PlatingType, production_type: p.production_type || 'InHouse', supplier_id: p.supplier_id, supplier_cost: Number(p.supplier_cost || 0), supplier_details: p.suppliers, active_price: Number(p.active_price), draft_price: Number(p.draft_price), selling_price: Number(p.selling_price || 0), stock_qty: p.stock_qty, sample_qty: p.sample_qty, stock_by_size: p.stock_by_size || {}, sample_stock_by_size: p.sample_stock_by_size || {}, location_stock: customStock, molds: prodMoldsData?.filter((pm: any) => pm.product_sku === p.sku).map((pm: any) => ({ code: pm.mold_code, quantity: pm.quantity || 1 })) || [], is_component: p.is_component, variants: pVariants, recipe: (recData?.filter((r: any) => r.parent_sku === p.sku) || []).map((r: any) => ({ type: r.type, id: r.material_id, sku: r.component_sku, quantity: Number(r.quantity) })), collections: prodCollData?.filter((pc: any) => pc.product_sku === p.sku).map((pc: any) => pc.collection_id) || [],
                  labor: { casting_cost: Number(p.labor_casting), setter_cost: Number(p.labor_setter), technician_cost: Number(p.labor_technician), plating_cost_x: Number(p.labor_plating_x || 0), plating_cost_d: Number(p.labor_plating_d || 0), subcontract_cost: Number(p.labor_subcontract || 0), technician_cost_manual_override: p.labor_technician_manual_override, plating_cost_x_manual_override: p.labor_plating_x_manual_override, plating_cost_d_manual_override: p.labor_plating_d_manual_override, stone_setting_cost: Number(p.labor_stone_setting || 0) }
                };
            });
        } catch (e) {
            return MOCK_PRODUCTS;
        }
    },
    
    getWarehouses: async (): Promise<Warehouse[]> => {
        const data = await fetchFullTable('warehouses', '*', (q) => q.order('created_at'));
        if (!data || data.length === 0) return [{ id: SYSTEM_IDS.CENTRAL, name: 'Κεντρική Αποθήκη', type: 'Central', is_system: true }, { id: SYSTEM_IDS.SHOWROOM, name: 'Δειγματολόγιο', type: 'Showroom', is_system: true }];
        return data as Warehouse[];
    },

    saveWarehouse: async (wh: Partial<Warehouse>): Promise<Warehouse> => {
        if (isLocalMode) throw new Error("Unavailable in Local Mode");
        const { data, error } = await supabase.from('warehouses').insert(wh).select().single();
        if (error) throw error;
        return data;
    },

    updateWarehouse: async (id: string, updates: Partial<Warehouse>): Promise<void> => {
        if (isLocalMode) return;
        await supabase.from('warehouses').update(updates).eq('id', id);
    },

    deleteWarehouse: async (id: string): Promise<void> => {
        if (isLocalMode) return;
        await supabase.from('warehouses').delete().eq('id', id);
    },

    getCustomers: async (): Promise<Customer[]> => {
        return fetchFullTable('customers', '*', (q) => q.order('full_name'));
    },

    saveCustomer: async (customer: Partial<Customer>): Promise<Customer | null> => {
        if (isLocalMode) return null;
        try {
            const { data, error } = await supabase.from('customers').insert(customer).select().single();
            if (error) throw error;
            return data;
        } catch (e) {
            await offlineDb.enqueue({ type: 'CUSTOMER', table: 'customers', method: 'INSERT', data: customer });
            return null;
        }
    },

    updateCustomer: async (id: string, updates: Partial<Customer>): Promise<void> => {
        if (isLocalMode) return;
        try {
            await supabase.from('customers').update(updates).eq('id', id);
        } catch (e) {
            await offlineDb.enqueue({ type: 'CUSTOMER', table: 'customers', method: 'UPDATE', data: { ...updates, id } });
        }
    },

    deleteCustomer: async (id: string): Promise<void> => {
        if (isLocalMode) return;
        await supabase.from('customers').delete().eq('id', id);
    },

    getOrders: async (): Promise<Order[]> => {
        return fetchFullTable('orders', '*', (q) => q.order('created_at', { ascending: false }));
    },

    saveOrder: async (order: Order): Promise<void> => {
        if (isLocalMode) return;
        const data = { id: order.id, customer_id: order.customer_id, customer_name: order.customer_name, customer_phone: order.customer_phone, status: order.status, total_price: order.total_price, items: order.items, created_at: order.created_at, notes: order.notes };
        try {
            await supabase.from('orders').insert(data);
        } catch (error) {
            await offlineDb.enqueue({ type: 'ORDER', table: 'orders', method: 'INSERT', data });
        }
    },

    updateOrder: async (order: Order): Promise<void> => {
        if (isLocalMode) return;
        const data = { customer_id: order.customer_id, customer_name: order.customer_name, customer_phone: order.customer_phone, items: order.items, total_price: order.total_price, notes: order.notes };
        try {
            await supabase.from('orders').update(data).eq('id', order.id);
        } catch (error) {
            await offlineDb.enqueue({ type: 'ORDER', table: 'orders', method: 'UPDATE', data: { ...data, id: order.id } });
        }
    },
    
    sendOrderToProduction: async (orderId: string, allProducts: Product[], allMaterials: Material[]): Promise<void> => {
        if (isLocalMode) return;
        const { data: order } = await supabase.from('orders').select('*').eq('id', orderId).single();
        if (!order) return;
        await supabase.from('production_batches').delete().eq('order_id', orderId).or(`current_stage.eq.${ProductionStage.Waxing},current_stage.eq.${ProductionStage.AwaitingDelivery}`);
        const batchesToInsert = order.items.map((item: any) => {
            const product = allProducts.find(p => p.sku === item.sku);
            if (!product) return null;
            const requiresSetting = (product.labor.stone_setting_cost || 0) > 0 || product.recipe.some(r => r.type === 'raw' && allMaterials.find(m => m.id === r.id)?.type === 'Stone');
            return { id: generateUUID(), order_id: orderId, sku: item.sku, variant_suffix: item.variant_suffix || '', quantity: item.quantity, current_stage: product.production_type === 'Imported' ? ProductionStage.AwaitingDelivery : ProductionStage.Waxing, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), priority: 'Normal', type: 'Νέα', notes: item.notes || '', requires_setting: requiresSetting, size_info: item.size_info || null };
        }).filter(Boolean);
        if (batchesToInsert.length > 0) await supabase.from('production_batches').insert(batchesToInsert);
        await supabase.from('orders').update({ status: OrderStatus.InProduction }).eq('id', orderId);
    },
    
    updateOrderStatus: async (orderId: string, status: OrderStatus): Promise<void> => {
        if (isLocalMode) return;
        await supabase.from('orders').update({ status }).eq('id', orderId);
        if (status === OrderStatus.Delivered) await supabase.from('production_batches').delete().eq('order_id', orderId);
    },

    deleteOrder: async (orderId: string): Promise<void> => {
        if (isLocalMode) return;
        await supabase.from('production_batches').delete().eq('order_id', orderId);
        await supabase.from('orders').delete().eq('id', orderId);
    },

    getProductionBatches: async (): Promise<ProductionBatch[]> => {
        return fetchFullTable('production_batches', '*', (q) => q.order('created_at', { ascending: false }));
    },

    createProductionBatch: async (batch: Partial<ProductionBatch>): Promise<void> => {
        if (isLocalMode) return;
        const { id, product_details, product_image, diffHours, isDelayed, ...insertData } = batch;
        await supabase.from('production_batches').insert({ ...insertData, id: generateUUID(), type: batch.type || 'Νέα' });
    },

    updateBatchStage: async (batchId: string, stage: ProductionStage): Promise<void> => {
        if (isLocalMode) return;
        const { data: updatedBatch } = await supabase.from('production_batches').update({ current_stage: stage, updated_at: new Date().toISOString() }).eq('id', batchId).select().single();
        if (updatedBatch && updatedBatch.order_id) {
            const { data: orderBatches } = await supabase.from('production_batches').select('current_stage').eq('order_id', updatedBatch.order_id);
            if (orderBatches) {
                const allReady = orderBatches.every((b: any) => b.current_stage === ProductionStage.Ready);
                await api.updateOrderStatus(updatedBatch.order_id, allReady ? OrderStatus.Ready : OrderStatus.InProduction);
            }
        }
    },
    
    splitBatch: async (originalBatchId: string, originalBatchNewQty: number, newBatchData: any): Promise<void> => {
        if (isLocalMode) return;
        await supabase.from('production_batches').update({ quantity: originalBatchNewQty, updated_at: new Date().toISOString() }).eq('id', originalBatchId);
        await supabase.from('production_batches').insert({ ...newBatchData, id: generateUUID() });
    },

    deleteProductionBatch: async (batchId: string): Promise<void> => {
        if (isLocalMode) return;
        await supabase.from('production_batches').delete().eq('id', batchId);
    },

    getPriceSnapshots: async (): Promise<PriceSnapshot[]> => {
        if (isLocalMode) return [];
        const { data } = await supabase.from('price_snapshots').select('*').order('created_at', { ascending: false });
        return data || [];
    },

    createPriceSnapshot: async (notes: string): Promise<void> => {
        if (isLocalMode) return;
        const { data: products } = await supabase.from('products').select('sku, selling_price');
        const { data: variants } = await supabase.from('product_variants').select('product_sku, suffix, selling_price');
        const items = [...(products || []).map(p => ({ product_sku: p.sku, variant_suffix: null, price: p.selling_price || 0 })), ...(variants || []).map(v => ({ product_sku: v.product_sku, variant_suffix: v.suffix, price: v.selling_price || 0 }))];
        const { data: snapshot } = await supabase.from('price_snapshots').insert({ notes, item_count: items.length }).select().single();
        if (snapshot) {
            const chunkSize = 500;
            for (let i = 0; i < items.length; i += chunkSize) {
                await supabase.from('price_snapshot_items').insert(items.slice(i, i + chunkSize).map(item => ({ ...item, snapshot_id: snapshot.id })));
            }
        }
    },

    getPriceSnapshotItems: async (snapshotId: string): Promise<PriceSnapshotItem[]> => {
        if (isLocalMode) return [];
        const { data } = await supabase.from('price_snapshot_items').select('*').eq('snapshot_id', snapshotId);
        return data || [];
    },

    revertToPriceSnapshot: async (snapshotId: string): Promise<void> => {
        if (isLocalMode) return;
        const items = await api.getPriceSnapshotItems(snapshotId);
        for (const item of items) {
            if (!item.variant_suffix) await supabase.from('products').update({ selling_price: item.price }).eq('sku', item.product_sku);
            else await supabase.from('product_variants').update({ selling_price: item.price }).match({ product_sku: item.product_sku, suffix: item.variant_suffix });
        }
    },

    syncOfflineData: async (): Promise<number> => {
        if (isLocalMode) return 0;
        const queue = await offlineDb.getQueue();
        if (queue.length === 0) return 0;
        let successCount = 0;
        for (const item of queue) {
            try {
                let error;
                if (item.method === 'INSERT') { error = (await supabase.from(item.table).insert(item.data)).error; }
                else if (item.method === 'UPDATE') { 
                    const { id, sku, ...updateData } = item.data;
                    let query = supabase.from(item.table).update(updateData);
                    if (id) query = query.eq('id', id); else if (sku) query = query.eq('sku', sku);
                    error = (await query).error;
                }
                else if (item.method === 'DELETE') { error = (await supabase.from(item.table).delete().eq('id', item.data.id || item.data.sku)).error; }
                if (!error) { await offlineDb.dequeue(item.id); successCount++; }
            } catch (err) { console.error("Sync failed:", err); }
        }
        return successCount;
    },

    getFullSystemExport: async (): Promise<Record<string, any[]>> => {
        const tables = ['products', 'product_variants', 'materials', 'molds', 'orders', 'customers', 'suppliers', 'warehouses', 'production_batches', 'product_stock', 'stock_movements', 'recipes', 'product_molds', 'collections', 'product_collections', 'global_settings'];
        const results: Record<string, any[]> = {};
        
        if (isLocalMode) {
            for (const table of tables) {
                results[table] = await offlineDb.getTable(table) || [];
            }
            return results;
        }

        await Promise.all(tables.map(async (table) => { results[table] = await fetchFullTable(table); }));
        return results;
    },

    restoreFullSystem: async (backupData: Record<string, any[]>): Promise<void> => {
        const order = [
            'suppliers', 'warehouses', 'customers', 'materials', 'molds', 'collections',
            'products', 'product_variants', 'recipes', 'product_molds', 'product_collections',
            'orders', 'production_batches', 'product_stock', 'stock_movements', 'global_settings'
        ];

        // If local mode or standalone restore, just push to IndexedDB
        if (isLocalMode || !SUPABASE_URL) {
            for (const table of order) {
                if (backupData[table]) {
                    await offlineDb.saveTable(table, backupData[table]);
                }
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
                    const { error } = await supabase.from(table).insert(data.slice(i, i + chunkSize));
                    if (error) console.error(`Restore failed for ${table}:`, error);
                }
            }
        }
    }
};
