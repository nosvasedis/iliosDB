
import { createClient } from '@supabase/supabase-js';
import { CalendarDayEvent, GlobalSettings, Material, Product, Mold, ProductVariant, RecipeItem, Gender, PlatingType, Collection, Order, ProductionBatch, OrderStatus, ProductionStage, Customer, Warehouse, Supplier, BatchType, MaterialType, PriceSnapshot, PriceSnapshotItem, ProductionType, Offer, SupplierOrder, AuditLog, VatRegime, OrderDeliveryPlan, OrderDeliveryReminder } from '../types';
import { INITIAL_SETTINGS, MOCK_MATERIALS, requiresAssemblyStage } from '../constants';
import { getVariantComponents } from '../utils/pricingEngine';
import { offlineDb } from './offlineDb';
import { BACKUP_TABLE_REGISTRY, BACKUP_VERSION, BACKUP_FORMAT_MARKER, CONFIG_KEYS, BackupEnvelope, BackupMeta, ProgressCallback, RestoreOptions, RestoreResult } from './backupConfig';
import { syncPlanStatusWithOrder } from '../utils/deliveryScheduling';
import { getOrthodoxCelebrationsForYear } from '../utils/orthodoxHoliday';

// Use the Cloudflare Worker as the public URL for reliable image serving instead of public r2.dev
export const R2_PUBLIC_URL = 'https://ilios-image-handler.iliosdb.workers.dev';
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
 * SMART URL RESOLVER
 */
export const resolveImageUrl = (url: string | null | undefined): string | null => {
    if (!url) return null;
    if (url.startsWith('data:')) return url;
    if (url.includes('picsum.photos')) return url;

    try {
        const parts = url.split('/');
        const filename = parts[parts.length - 1];
        if (filename && filename.trim() !== '') {
            return `${R2_PUBLIC_URL}/${filename}`;
        }
    } catch (e) {
        console.warn("URL resolution failed for:", url);
        return url;
    }
    return url;
};

/**
 * STRIPPER
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

    if (data.labor) {
        if (data.labor.casting_cost !== undefined) sanitized.labor_casting = data.labor.casting_cost;
        if (data.labor.setter_cost !== undefined) sanitized.labor_setter = data.labor.setter_cost;
        if (data.labor.technician_cost !== undefined) sanitized.labor_technician = data.labor.technician_cost;
        if (data.labor.plating_cost_x !== undefined) sanitized.labor_plating_x = data.labor.plating_cost_x;
        if (data.labor.with_gold_plating !== undefined) sanitized.labor_plating_x = data.labor.with_gold_plating;
        if (data.labor.plating_cost_d !== undefined) sanitized.labor_plating_d = data.labor.plating_cost_d;
        if (data.labor.subcontract_cost !== undefined) sanitized.labor_subcontract = data.labor.subcontract_cost;
        if (data.labor.stone_setting_cost !== undefined) sanitized.labor_stone_setting = data.labor.stone_setting_cost;
    }

    return sanitized;
};

// Batch Sanitizer for Production
const sanitizeBatchData = (data: any) => {
    const validColumns = [
        'id', 'order_id', 'sku', 'variant_suffix', 'quantity', 'current_stage',
        'created_at', 'updated_at', 'priority', 'type', 'notes', 'requires_setting', 'requires_assembly',
        'size_info', 'on_hold', 'on_hold_reason'
    ];
    const sanitized: any = {};
    validColumns.forEach(col => {
        if (data[col] !== undefined) sanitized[col] = data[col];
    });
    return sanitized;
};

async function fetchWithTimeout(query: any, timeoutMs: number = 3000): Promise<any> {
    const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('TIMEOUT')), timeoutMs)
    );
    return Promise.race([query, timeoutPromise]);
}

function blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            if (typeof reader.result === 'string') resolve(reader.result);
            else reject(new Error('Failed to convert blob'));
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

async function safeMutate(
    tableName: string,
    method: 'INSERT' | 'UPDATE' | 'DELETE' | 'UPSERT',
    data: any,
    options?: { match?: Record<string, any>, onConflict?: string, ignoreDuplicates?: boolean, noSelect?: boolean }
): Promise<{ data: any, error: any, queued: boolean }> {
    if (isLocalMode) {
        const table = await offlineDb.getTable(tableName) || [];
        let newTable = [...table];
        const payload = Array.isArray(data) ? data : (data ? [data] : []);

        if (method === 'INSERT') {
            newTable = [...newTable, ...payload];
        }
        else if (method === 'UPDATE' || method === 'UPSERT') {
            if (options?.match) {
                const matchEntries = Object.entries(options.match);
                newTable = newTable.map(row => {
                    const isMatch = matchEntries.every(([k, v]) => row[k] === v);
                    return isMatch ? { ...row, ...payload[0] } : row;
                });
            } else {
                payload.forEach(item => {
                    const idx = newTable.findIndex(row => {
                        if (row.id && item.id) return row.id === item.id;
                        if (row.sku && item.sku) return row.sku === item.sku;
                        return false;
                    });
                    if (idx >= 0) {
                        if (method === 'UPSERT' && options?.ignoreDuplicates) return;
                        newTable[idx] = { ...newTable[idx], ...item };
                    }
                    else if (method === 'UPSERT') newTable.push(item);
                });
            }
        }
        else if (method === 'DELETE') {
            if (options?.match) newTable = newTable.filter(row => !Object.entries(options.match!).every(([k, v]) => row[k] === v));
            else if (data) {
                const targets = Array.isArray(data) ? data : [data];
                newTable = newTable.filter(row => !targets.some(t => (t.id && row.id === t.id) || (t.sku && row.sku === t.sku)));
            }
        }

        await offlineDb.saveTable(tableName, newTable);
        return { data: data, error: null, queued: false };
    }

    const queueId = await offlineDb.enqueue({
        type: 'MUTATION',
        table: tableName,
        method,
        data,
        match: options?.match,
        onConflict: options?.onConflict,
        ignoreDuplicates: options?.ignoreDuplicates,
        noSelect: options?.noSelect
    });

    if (!navigator.onLine) {
        return { data: null, error: null, queued: true };
    }

    try {
        let query;
        if (method === 'INSERT') {
            query = options?.noSelect
                ? supabase.from(tableName).insert(data)
                : supabase.from(tableName).insert(data).select();
        } else if (method === 'UPDATE') {
            query = options?.noSelect
                ? supabase.from(tableName).update(data).match(options?.match || { id: data.id || data.sku })
                : supabase.from(tableName).update(data).match(options?.match || { id: data.id || data.sku }).select();
        } else if (method === 'DELETE') {
            query = supabase.from(tableName).delete().match(options?.match || { id: data.id || data.sku });
        } else if (method === 'UPSERT') {
            query = supabase.from(tableName).upsert(data, {
                onConflict: options?.onConflict,
                ignoreDuplicates: options?.ignoreDuplicates
            }).select();
        }

        const { data: resData, error } = await query!;
        if (error) throw error;
        await offlineDb.dequeue(queueId);
        return { data: Array.isArray(resData) ? resData[0] : resData, error: null, queued: false };
    } catch (err) {
        console.warn(`Cloud mutation failed. Keeping in queue for retry:`, err);
        return { data: null, error: null, queued: true };
    }
}

async function fetchFullTable(tableName: string, select: string = '*', filter?: (query: any) => any): Promise<any[]> {
    if (isLocalMode) {
        const localData = await offlineDb.getTable(tableName);
        return localData || [];
    }

    let baseData: any[] = [];
    if (!navigator.onLine) {
        baseData = await offlineDb.getTable(tableName) || [];
    } else {
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
            baseData = allData;
            offlineDb.saveTable(tableName, allData);
        } catch (err) {
            baseData = await offlineDb.getTable(tableName) || [];
        }
    }

    const queue = await offlineDb.getQueue();
    const pendingOps = queue.filter(op => op.table === tableName);
    if (pendingOps.length === 0) return baseData;

    let mergedData = [...baseData];
    pendingOps.forEach(op => {
        const payload = Array.isArray(op.data) ? op.data : (op.data ? [op.data] : []);
        if (op.method === 'INSERT') {
            mergedData = [...mergedData, ...payload];
        }
        else if (op.method === 'UPDATE' || op.method === 'UPSERT') {
            if (op.match) {
                const matchEntries = Object.entries(op.match);
                mergedData = mergedData.map(row => {
                    const isMatch = matchEntries.every(([k, v]) => row[k] === v);
                    return isMatch ? { ...row, ...payload[0] } : row;
                });
            } else {
                payload.forEach((item: any) => {
                    const idx = mergedData.findIndex((row: any) => {
                        if (row.id && item.id) return row.id === item.id;
                        if (row.sku && item.sku) return row.sku === item.sku;
                        return false;
                    });
                    if (idx >= 0) {
                        if (op.method === 'UPSERT' && op.ignoreDuplicates) return;
                        mergedData[idx] = { ...mergedData[idx], ...item };
                    }
                    else if (op.method === 'UPSERT') mergedData.push(item);
                });
            }
        }
        else if (op.method === 'DELETE') {
            if (op.match) {
                mergedData = mergedData.filter((row: any) => !Object.entries(op.match).every(([k, v]) => row[k] === v));
            } else if (op.data) {
                const targets = payload;
                mergedData = mergedData.filter((row: any) => !targets.some((t: any) => (t.id && row.id === t.id) || (t.sku && row.sku === t.sku)));
            }
        }
    });

    return mergedData;
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

export const RETAIL_CUSTOMER_ID = '00000000-0000-0000-0000-000000000003';
export const RETAIL_CUSTOMER_NAME = 'Λιανική';
export const RETAIL_NOTE_PREFIX = '[ΛΙΑΝΙΚΗ_ΠΕΛΑΤΗΣ]:';

const getRetailCustomerPayload = (): Partial<Customer> => ({
    id: RETAIL_CUSTOMER_ID,
    full_name: RETAIL_CUSTOMER_NAME,
    phone: '',
    vat_rate: VatRegime.Standard,
    notes: '',
    created_at: new Date(0).toISOString()
});

export const uploadProductImage = async (file: Blob, sku: string): Promise<string | null> => {
    // Feature 3C: Local Image Storage Support
    let useLocal = isLocalMode || !navigator.onLine;
    if (!useLocal) {
        try {
            const settings = await api.getSettings();
            if (settings?.local_image_storage) useLocal = true;
        } catch (e) {
            console.warn("Could not fetch settings for image upload, defaulting to standard behavior", e);
        }
    }

    if (useLocal) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                if (typeof reader.result === 'string') {
                    resolve(reader.result);
                } else {
                    reject(new Error("Failed to convert image to Base64"));
                }
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

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
    lookupAfm: async (afm: string): Promise<{ name: string; address: string | null; phone: string | null; email: string | null } | null> => {
        // Strip any country prefix and whitespace/dashes the user may have typed
        const cleanAfm = afm.replace(/^EL/i, '').replace(/[-\s]/g, '').trim();

        if (!cleanAfm || cleanAfm.length !== 9 || !/^\d{9}$/.test(cleanAfm)) {
            throw new Error("Μη έγκυρο ΑΦΜ: πρέπει να αποτελείται από 9 ψηφία.");
        }

        // Call our Cloudflare Worker proxy — it runs server-side so there are no CORS issues.
        const proxyUrl = `${CLOUDFLARE_WORKER_URL}/vat-lookup?afm=${cleanAfm}`;
        try {
            const response = await fetch(proxyUrl);
            const data = await response.json() as any;

            if (!response.ok) {
                // Worker returned a 404 (no data found) or 400 (bad request)
                const msg = data?.error || "Δεν βρέθηκαν στοιχεία για το ΑΦΜ αυτό.";
                throw new Error(msg);
            }

            if (data.name) {
                return {
                    name: data.name,
                    address: data.address || null,
                    phone: data.phone || null,
                    email: data.email || null,
                };
            }

            throw new Error("Δεν βρέθηκαν στοιχεία. Ελέγξτε το ΑΦΜ ή τη σύνδεση.");
        } catch (err: any) {
            // Re-throw with the original message so the UI can display it
            throw new Error(err.message || "Σφάλμα κατά την αναζήτηση ΑΦΜ.");
        }
    },


    getSettings: async (): Promise<GlobalSettings> => {
        const local = await offlineDb.getTable('global_settings');
        if (isLocalMode) return (local && local.length > 0) ? local[0] : { ...INITIAL_SETTINGS, last_calc_silver_price: 1.00 };
        try {
            const { data, error } = await fetchWithTimeout(supabase.from('global_settings').select('*').single(), 3000);
            if (error || !data) throw new Error('Data Error');
            const settings = {
                silver_price_gram: Number(data.silver_price_gram),
                loss_percentage: Number(data.loss_percentage),
                barcode_width_mm: Number(data.barcode_width_mm) || INITIAL_SETTINGS.barcode_width_mm,
                barcode_height_mm: Number(data.barcode_height_mm) || INITIAL_SETTINGS.barcode_height_mm,
                retail_barcode_width_mm: Number(data.retail_barcode_width_mm) || INITIAL_SETTINGS.retail_barcode_width_mm,
                retail_barcode_height_mm: Number(data.retail_barcode_height_mm) || INITIAL_SETTINGS.retail_barcode_height_mm,
                last_calc_silver_price: Number(data.last_calc_silver_price || 1.00)
            };
            offlineDb.saveTable('global_settings', [settings]);
            return settings;
        } catch (e) {
            return (local && local.length > 0) ? local[0] : { ...INITIAL_SETTINGS, last_calc_silver_price: 1.00 };
        }
    },

    updateSettings: async (settings: GlobalSettings): Promise<void> => {
        // Use UPSERT on ID 1
        const payload = { ...settings, id: 1 };
        await safeMutate('global_settings', 'UPSERT', payload, { onConflict: 'id' });
        // Update local mirror immediately to ensure persistence across reloads even if offline sync is pending
        await offlineDb.saveTable('global_settings', [settings]);
    },

    getMaterials: async (): Promise<Material[]> => {
        const data = await fetchFullTable('materials');
        return data.map((m: any) => ({
            id: m.id,
            name: m.name,
            description: m.description || '', // Map description
            type: m.type,
            cost_per_unit: Number(m.cost_per_unit),
            unit: m.unit,
            variant_prices: m.variant_prices || {},
            supplier_id: m.supplier_id || null,
            stock_qty: Number(m.stock_qty || 0),
            stones_per_strand: m.stones_per_strand ? Number(m.stones_per_strand) : undefined
        }));
    },

    saveMaterial: async (m: Material) => {
        return safeMutate('materials', m.id ? 'UPDATE' : 'INSERT', m, m.id ? { match: { id: m.id } } : undefined);
    },

    getMolds: async (): Promise<Mold[]> => {
        const data = await fetchFullTable('molds');
        return data.map((m: any) => ({
            code: m.code,
            location: m.location,
            description: m.description,
            weight_g: m.weight_g ? Number(m.weight_g) : undefined // New column mapping
        }));
    },

    getSuppliers: async (): Promise<Supplier[]> => {
        return fetchFullTable('suppliers', '*', (q) => q.order('name'));
    },

    getSupplierOrders: async (): Promise<SupplierOrder[]> => {
        return fetchFullTable('supplier_orders', '*', (q) => q.order('created_at', { ascending: false }));
    },

    saveSupplierOrder: async (order: SupplierOrder): Promise<void> => {
        await safeMutate('supplier_orders', 'INSERT', order);
    },

    updateSupplierOrder: async (order: SupplierOrder): Promise<void> => {
        await safeMutate('supplier_orders', 'UPDATE', order, { match: { id: order.id } });
    },

    receiveSupplierOrder: async (order: SupplierOrder): Promise<void> => {
        // 1. Mark Order as Received
        const receivedOrder = { ...order, status: 'Received', received_at: new Date().toISOString() };
        await safeMutate('supplier_orders', 'UPDATE', receivedOrder, { match: { id: order.id } });

        // 2. Batch-fetch current stock for all products and materials in this order
        const productSkus = [...new Set(order.items.filter(i => i.item_type === 'Product').map(i => i.item_id))];
        const materialIds = [...new Set(order.items.filter(i => i.item_type === 'Material').map(i => i.item_id))];

        let productRows: { sku: string; stock_qty: number }[] = [];
        let materialRows: { id: string; stock_qty: number }[] = [];

        if (productSkus.length > 0) {
            const { data } = await supabase.from('products').select('sku, stock_qty').in('sku', productSkus);
            productRows = data || [];
        }
        if (materialIds.length > 0) {
            const { data } = await supabase.from('materials').select('id, stock_qty').in('id', materialIds);
            materialRows = data || [];
        }

        const productMap = new Map(productRows.map(p => [p.sku, p.stock_qty ?? 0]));
        const materialMap = new Map(materialRows.map(m => [m.id, m.stock_qty ?? 0]));

        // 3. Apply stock updates in parallel (same logic as before, one update per item)
        const updatePromises: Promise<any>[] = [];
        for (const item of order.items) {
            if (item.item_type === 'Product') {
                const current = productMap.get(item.item_id);
                if (current !== undefined) {
                    updatePromises.push(
                        safeMutate('products', 'UPDATE', { stock_qty: current + item.quantity }, { match: { sku: item.item_id } })
                    );
                    updatePromises.push(recordStockMovement(item.item_id, item.quantity, `Supplier Order #${order.id.slice(0, 6)}`));
                }
            } else if (item.item_type === 'Material') {
                const current = materialMap.get(item.item_id);
                if (current !== undefined) {
                    updatePromises.push(
                        safeMutate('materials', 'UPDATE', { stock_qty: current + item.quantity }, { match: { id: item.item_id } })
                    );
                }
            }
        }
        await Promise.all(updatePromises);
    },

    getCollections: async (): Promise<Collection[]> => {
        return fetchFullTable('collections', '*', (q) => q.order('name'));
    },

    saveCollection: async (name: string): Promise<void> => {
        const payload: any = { name };
        if (isLocalMode) payload.id = Date.now();
        await safeMutate('collections', 'INSERT', payload);
    },

    updateCollection: async (id: number, updates: Partial<Collection>): Promise<void> => {
        await safeMutate('collections', 'UPDATE', updates, { match: { id } });
    },

    deleteCollection: async (id: number): Promise<void> => {
        await safeMutate('collections', 'DELETE', null, { match: { id } });
    },

    getProducts: async (): Promise<Product[]> => {
        const prodData = await fetchFullTable('products', '*, suppliers(*)');
        if (!prodData || prodData.length === 0) return [];

        const [varData, recData, prodMoldsData, prodCollData, stockData] = await Promise.all([
            fetchFullTable('product_variants'),
            fetchFullTable('recipes'),
            fetchFullTable('product_molds'),
            fetchFullTable('product_collections'),
            fetchFullTable('product_stock')
        ]);

        const stockMap = new Map();
        stockData?.forEach((s: any) => {
            const key = s.variant_suffix ? `${s.product_sku}::${s.variant_suffix}` : s.product_sku;
            if (!stockMap.has(key)) stockMap.set(key, []);
            stockMap.get(key).push(s);
        });

        const variantMap = new Map();
        varData?.forEach((v: any) => {
            if (!variantMap.has(v.product_sku)) variantMap.set(v.product_sku, []);
            variantMap.get(v.product_sku).push(v);
        });

        const recipeMap = new Map();
        recData?.forEach((r: any) => {
            if (!recipeMap.has(r.parent_sku)) recipeMap.set(r.parent_sku, []);
            recipeMap.get(r.parent_sku).push(r);
        });

        const moldsMap = new Map();
        prodMoldsData?.forEach((pm: any) => {
            if (!moldsMap.has(pm.product_sku)) moldsMap.set(pm.product_sku, []);
            moldsMap.get(pm.product_sku).push(pm);
        });

        const collectionsMap = new Map();
        prodCollData?.forEach((pc: any) => {
            if (!collectionsMap.has(pc.product_sku)) collectionsMap.set(pc.product_sku, []);
            collectionsMap.get(pc.product_sku).push(pc.collection_id);
        });

        return prodData.map((p: any) => {
            const customStock: Record<string, number> = {};
            const pStock = stockMap.get(p.sku) || [];
            pStock.forEach((s: any) => { customStock[s.warehouse_id] = s.quantity; });
            customStock[SYSTEM_IDS.CENTRAL] = p.stock_qty;
            customStock[SYSTEM_IDS.SHOWROOM] = p.sample_qty;

            const baseVariants = variantMap.get(p.sku) || [];
            const pVariants: ProductVariant[] = baseVariants.map((v: any) => {
                const vCustomStock: Record<string, number> = {};
                const vStock = stockMap.get(`${p.sku}::${v.suffix}`) || [];
                vStock.forEach((s: any) => { vCustomStock[s.warehouse_id] = s.quantity; });
                vCustomStock[SYSTEM_IDS.CENTRAL] = v.stock_qty;
                return { suffix: v.suffix, description: v.description, stock_qty: v.stock_qty, stock_by_size: v.stock_by_size || {}, location_stock: vCustomStock, active_price: v.active_price ? Number(v.active_price) : null, selling_price: v.selling_price ? Number(v.selling_price) : null };
            });

            const pBaseMolds = moldsMap.get(p.sku) || [];
            const uniqueMoldsMap = new Map<string, { code: string, quantity: number }>();
            pBaseMolds.forEach((pm: any) => {
                uniqueMoldsMap.set(pm.mold_code, { code: pm.mold_code, quantity: pm.quantity || 1 });
            });
            const pMolds = Array.from(uniqueMoldsMap.values());

            const pBaseRecipes = recipeMap.get(p.sku) || [];
            const mappedRecipes = pBaseRecipes.map((r: any) => ({ type: r.type, id: r.material_id, sku: r.component_sku, quantity: Number(r.quantity) }));

            return {
                sku: p.sku, prefix: p.prefix, category: p.category, description: p.description, gender: p.gender as Gender,
                image_url: resolveImageUrl(p.image_url),
                weight_g: Number(p.weight_g), secondary_weight_g: p.secondary_weight_g ? Number(p.secondary_weight_g) : undefined, plating_type: p.plating_type as PlatingType, production_type: p.production_type || 'InHouse', supplier_id: p.supplier_id,
                supplier_sku: p.supplier_sku,
                supplier_cost: Number(p.supplier_cost || 0), supplier_details: p.suppliers, active_price: Number(p.active_price), draft_price: Number(p.draft_price), selling_price: Number(p.selling_price || 0), stock_qty: p.stock_qty, sample_qty: p.sample_qty, stock_by_size: p.stock_by_size || {}, sample_stock_by_size: p.sample_stock_by_size || {}, location_stock: customStock,
                molds: pMolds,
                is_component: p.is_component, variants: pVariants, recipe: mappedRecipes, collections: collectionsMap.get(p.sku) || [],
                labor: { casting_cost: Number(p.labor_casting), setter_cost: Number(p.labor_setter), technician_cost: Number(p.labor_technician), plating_cost_x: Number(p.labor_plating_x || 0), plating_cost_d: Number(p.labor_plating_d || 0), subcontract_cost: Number(p.labor_subcontract || 0), technician_cost_manual_override: p.labor_technician_manual_override, plating_cost_x_manual_override: p.labor_plating_x_manual_override, plating_cost_d_manual_override: p.labor_plating_d_manual_override, stone_setting_cost: Number(p.labor_stone_setting || 0) }
            };
        });
    },

    getProductsCatalog: async (params: { limit?: number; offset?: number } = {}): Promise<{ products: Product[]; hasMore: boolean }> => {
        const limit = Math.min(params.limit ?? 60, 100);
        const offset = params.offset ?? 0;
        if (isLocalMode || !navigator.onLine) {
            const all = await api.getProducts();
            const products = all.slice(offset, offset + limit);
            return { products, hasMore: offset + limit < all.length };
        }
        try {
            const { data: prodData, error: prodErr } = await fetchWithTimeout(
                supabase.from('products').select('*, suppliers(*)').order('sku').range(offset, offset + limit - 1),
                6000
            );
            if (prodErr) throw prodErr;
            if (!prodData || prodData.length === 0) return { products: [], hasMore: false };
            const skus = prodData.map((p: any) => p.sku);
            const [varRes, collRes, stockRes] = await Promise.all([
                supabase.from('product_variants').select('*').in('product_sku', skus),
                supabase.from('product_collections').select('*').in('product_sku', skus),
                supabase.from('product_stock').select('*').in('product_sku', skus)
            ]);
            const varData = varRes.data || [];
            const prodCollData = collRes.data || [];
            const stockData = stockRes.data || [];
            const stockMap = new Map<string, any[]>();
            stockData.forEach((s: any) => {
                const key = s.variant_suffix ? `${s.product_sku}::${s.variant_suffix}` : s.product_sku;
                if (!stockMap.has(key)) stockMap.set(key, []);
                stockMap.get(key)!.push(s);
            });
            const variantMap = new Map<string, any[]>();
            varData.forEach((v: any) => {
                if (!variantMap.has(v.product_sku)) variantMap.set(v.product_sku, []);
                variantMap.get(v.product_sku)!.push(v);
            });
            const collectionsMap = new Map<string, number[]>();
            prodCollData.forEach((pc: any) => {
                if (!collectionsMap.has(pc.product_sku)) collectionsMap.set(pc.product_sku, []);
                collectionsMap.get(pc.product_sku)!.push(pc.collection_id);
            });
            const products: Product[] = prodData.map((p: any) => {
                const customStock: Record<string, number> = {};
                const pStock = stockMap.get(p.sku) || [];
                pStock.forEach((s: any) => { customStock[s.warehouse_id] = s.quantity; });
                customStock[SYSTEM_IDS.CENTRAL] = p.stock_qty;
                customStock[SYSTEM_IDS.SHOWROOM] = p.sample_qty;
                const baseVariants = variantMap.get(p.sku) || [];
                const pVariants: ProductVariant[] = baseVariants.map((v: any) => {
                    const vCustomStock: Record<string, number> = {};
                    const vStock = stockMap.get(`${p.sku}::${v.suffix}`) || [];
                    vStock.forEach((s: any) => { vCustomStock[s.warehouse_id] = s.quantity; });
                    vCustomStock[SYSTEM_IDS.CENTRAL] = v.stock_qty;
                    return { suffix: v.suffix, description: v.description, stock_qty: v.stock_qty, stock_by_size: v.stock_by_size || {}, location_stock: vCustomStock, active_price: v.active_price ? Number(v.active_price) : null, selling_price: v.selling_price ? Number(v.selling_price) : null };
                });
                return {
                    sku: p.sku, prefix: p.prefix, category: p.category, description: p.description, gender: p.gender as Gender,
                    image_url: resolveImageUrl(p.image_url),
                    weight_g: Number(p.weight_g), secondary_weight_g: p.secondary_weight_g ? Number(p.secondary_weight_g) : undefined, plating_type: p.plating_type as PlatingType, production_type: (p.production_type as ProductionType) || 'InHouse', supplier_id: p.supplier_id,
                    supplier_sku: p.supplier_sku,
                    supplier_cost: Number(p.supplier_cost || 0), supplier_details: p.suppliers, active_price: Number(p.active_price), draft_price: Number(p.draft_price), selling_price: Number(p.selling_price || 0), stock_qty: p.stock_qty, sample_qty: p.sample_qty, stock_by_size: p.stock_by_size || {}, sample_stock_by_size: p.sample_stock_by_size || {}, location_stock: customStock,
                    molds: [],
                    is_component: p.is_component, variants: pVariants, recipe: [], collections: collectionsMap.get(p.sku) || [],
                    labor: { casting_cost: Number(p.labor_casting), setter_cost: Number(p.labor_setter), technician_cost: Number(p.labor_technician), plating_cost_x: Number(p.labor_plating_x || 0), plating_cost_d: Number(p.labor_plating_d || 0), subcontract_cost: Number(p.labor_subcontract || 0), technician_cost_manual_override: p.labor_technician_manual_override, plating_cost_x_manual_override: p.labor_plating_x_manual_override, plating_cost_d_manual_override: p.labor_plating_d_manual_override, stone_setting_cost: Number(p.labor_stone_setting || 0) },
                    created_at: p.created_at || new Date(0).toISOString()
                };
            });
            return { products, hasMore: products.length === limit };
        } catch (err) {
            const all = await offlineDb.getTable('products').then((d: any[]) => d || []);
            const fallback = all.slice(offset, offset + limit).map((p: any) => ({
                ...p,
                variants: [],
                collections: [],
                labor: {}
            }));
            return { products: fallback as any, hasMore: offset + limit < all.length };
        }
    },

    getWarehouses: async (): Promise<Warehouse[]> => {
        const data = await fetchFullTable('warehouses', '*', (q) => q.order('created_at'));
        if (!data || data.length === 0) return [{ id: SYSTEM_IDS.CENTRAL, name: 'Κεντρική Αποθήκη', type: 'Central', is_system: true }, { id: SYSTEM_IDS.SHOWROOM, name: 'Δειγματολόγιο', type: 'Showroom', is_system: true }];
        return data as Warehouse[];
    },

    getCustomers: async (): Promise<Customer[]> => {
        await api.ensureRetailCustomer();
        const list = await fetchFullTable('customers', '*', (q) => q.order('full_name'));
        return (list as Customer[]).sort((a, b) => (a.full_name || '').localeCompare(b.full_name || '', 'el', { sensitivity: 'base' }));
    },

    getOrders: async (): Promise<Order[]> => {
        return fetchFullTable('orders', '*', (q) => q.order('created_at', { ascending: false }));
    },

    getOrderDeliveryPlans: async (): Promise<OrderDeliveryPlan[]> => {
        return fetchFullTable('order_delivery_plans', '*', (q) => q.order('updated_at', { ascending: false }));
    },

    getOrderDeliveryReminders: async (): Promise<OrderDeliveryReminder[]> => {
        return fetchFullTable('order_delivery_reminders', '*', (q) => q.order('trigger_at', { ascending: true }));
    },

    /** Fetches Orthodox calendar events for a year. Expects worker GET /orthodox-calendar?year=YYYY returning { events: CalendarDayEvent[] } or CalendarDayEvent[]; falls back to local generator on failure. */
    getOrthodoxCalendarEvents: async (year: number): Promise<CalendarDayEvent[]> => {
        try {
            const response = await fetch(`${CLOUDFLARE_WORKER_URL}/orthodox-calendar?year=${year}`);
            if (!response.ok) throw new Error(`Orthodox calendar fetch failed: ${response.status}`);
            const data = await response.json();
            if (Array.isArray(data?.events)) return data.events as CalendarDayEvent[];
            if (Array.isArray(data)) return data as CalendarDayEvent[];
            throw new Error('Invalid orthodox calendar response');
        } catch (error) {
            console.warn('Orthodox calendar fetch failed, using local fallback:', error);
            return getOrthodoxCelebrationsForYear(year);
        }
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

    renameProduct: async (oldSku: string, newSku: string): Promise<void> => {
        if (isLocalMode) {
            // ... (Same as before)
            return;
        }

        const { data: product } = await supabase.from('products').select('*').eq('sku', oldSku).single();
        if (!product) throw new Error('Original product not found');

        const [
            { data: variants }, { data: parentRecipes }, { data: componentRecipes }, { data: molds }, { data: collections }, { data: stock }, { data: batches }, { data: movements }
        ] = await Promise.all([
            supabase.from('product_variants').select('*').eq('product_sku', oldSku),
            supabase.from('recipes').select('*').eq('parent_sku', oldSku),
            supabase.from('recipes').select('*').eq('component_sku', oldSku),
            supabase.from('product_molds').select('*').eq('product_sku', oldSku),
            supabase.from('product_collections').select('*').eq('product_sku', oldSku),
            supabase.from('product_stock').select('*').eq('product_sku', oldSku),
            supabase.from('production_batches').select('*').eq('sku', oldSku),
            supabase.from('stock_movements').select('*').eq('product_sku', oldSku)
        ]);

        const { id, ...productData } = product;
        const newProductPayload = { ...productData, sku: newSku };
        const { error: createError } = await supabase.from('products').insert(newProductPayload);
        if (createError) throw createError;

        try {
            if (variants?.length) await supabase.from('product_variants').insert(variants.map(v => { const { id, ...r } = v; return { ...r, product_sku: newSku }; }));
            if (parentRecipes?.length) await supabase.from('recipes').insert(parentRecipes.map(r => { const { id, ...rest } = r; return { ...rest, parent_sku: newSku }; }));
            if (molds?.length) await supabase.from('product_molds').insert(molds.map(m => { const { id, ...rest } = m; return { ...rest, product_sku: newSku }; }));
            if (collections?.length) await supabase.from('product_collections').insert(collections.map(c => { const { id, ...rest } = c; return { ...rest, product_sku: newSku }; }));
            if (stock?.length) await supabase.from('product_stock').insert(stock.map(s => { const { id, ...rest } = s; return { ...rest, product_sku: newSku }; }));
            if (componentRecipes?.length) await supabase.from('recipes').update({ component_sku: newSku }).eq('component_sku', oldSku);
            if (batches?.length) await supabase.from('production_batches').update({ sku: newSku }).eq('sku', oldSku);
            if (movements?.length) await supabase.from('stock_movements').update({ product_sku: newSku }).eq('product_sku', oldSku);

            await supabase.from('product_variants').delete().eq('product_sku', oldSku);
            await supabase.from('recipes').delete().eq('parent_sku', oldSku);
            await supabase.from('product_molds').delete().eq('product_sku', oldSku);
            await supabase.from('product_collections').delete().eq('product_sku', oldSku);
            await supabase.from('product_stock').delete().eq('product_sku', oldSku);
            await supabase.from('products').delete().eq('sku', oldSku);
        } catch (err) {
            await supabase.from('products').delete().eq('sku', newSku);
            throw err;
        }
    },

    saveProductVariant: async (variantData: any) => {
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
        // Robust Save: Use UPSERT and ensure empty IDs are handled to allow auto-generation if needed.
        const payload = { ...c };
        if ((payload.full_name || '').trim() === RETAIL_CUSTOMER_NAME && payload.id !== RETAIL_CUSTOMER_ID) {
            throw new Error("Το όνομα 'Λιανική' είναι δεσμευμένο από το σύστημα.");
        }
        if (payload.id === '') delete payload.id;

        const result = await safeMutate('customers', 'UPSERT', payload, { onConflict: 'id' });
        return result.data;
    },

    ensureRetailCustomer: async (): Promise<Customer> => {
        const retailDefaults = getRetailCustomerPayload();
        const customers = await fetchFullTable('customers', '*', (q) => q.eq('id', RETAIL_CUSTOMER_ID));
        const existing = (customers || [])[0] as Customer | undefined;

        const needsUpsert = !existing || existing.full_name !== RETAIL_CUSTOMER_NAME;
        if (needsUpsert) {
            await api.saveCustomer({
                ...(existing || {}),
                ...retailDefaults
            });
        }

        return {
            ...(existing || {}),
            ...retailDefaults
        } as Customer;
    },

    updateCustomer: async (id: string, updates: Partial<Customer>): Promise<void> => {
        if (id === RETAIL_CUSTOMER_ID) {
            throw new Error('Ο πελάτης Λιανική είναι προστατευμένος και δεν μπορεί να τροποποιηθεί.');
        }
        if ((updates.full_name || '').trim() === RETAIL_CUSTOMER_NAME) {
            throw new Error("Το όνομα 'Λιανική' είναι δεσμευμένο από το σύστημα.");
        }
        await safeMutate('customers', 'UPDATE', updates, { match: { id } });
    },

    deleteCustomer: async (id: string): Promise<void> => {
        if (id === RETAIL_CUSTOMER_ID) {
            throw new Error('Ο πελάτης Λιανική είναι προστατευμένος και δεν μπορεί να διαγραφεί.');
        }
        await safeMutate('customers', 'DELETE', null, { match: { id } });
    },
    saveOrder: async (o: Order): Promise<void> => {
        // noSelect: orders RLS allows INSERT but blocks read-back → causes PGRST204 with .select()
        await safeMutate('orders', 'INSERT', o, { noSelect: true });
    },

    saveOrderDeliveryPlan: async (plan: OrderDeliveryPlan, reminders: OrderDeliveryReminder[]): Promise<void> => {
        await safeMutate('order_delivery_plans', 'INSERT', plan, { noSelect: true });
        await safeMutate('order_delivery_reminders', 'DELETE', null, { match: { plan_id: plan.id } });
        if (reminders.length > 0) {
            await safeMutate('order_delivery_reminders', 'INSERT', reminders, { noSelect: true });
        }
    },

    updateOrderDeliveryPlan: async (plan: OrderDeliveryPlan, reminders: OrderDeliveryReminder[]): Promise<void> => {
        await safeMutate('order_delivery_plans', 'UPDATE', plan, { match: { id: plan.id }, noSelect: true });
        await safeMutate('order_delivery_reminders', 'DELETE', null, { match: { plan_id: plan.id } });
        if (reminders.length > 0) {
            await safeMutate('order_delivery_reminders', 'INSERT', reminders, { noSelect: true });
        }
    },

    deleteOrderDeliveryPlan: async (planId: string): Promise<void> => {
        await safeMutate('order_delivery_reminders', 'DELETE', null, { match: { plan_id: planId } });
        await safeMutate('order_delivery_plans', 'DELETE', null, { match: { id: planId } });
    },

    acknowledgeDeliveryReminder: async (reminderId: string): Promise<void> => {
        const now = new Date().toISOString();
        await safeMutate('order_delivery_reminders', 'UPDATE', {
            acknowledged_at: now,
            updated_at: now
        }, { match: { id: reminderId }, noSelect: true });
    },

    completeDeliveryReminder: async (reminderId: string, completionNote?: string, completedBy?: string): Promise<void> => {
        const now = new Date().toISOString();
        await safeMutate('order_delivery_reminders', 'UPDATE', {
            completed_at: now,
            completion_note: completionNote || null,
            completed_by: completedBy || null,
            updated_at: now
        }, { match: { id: reminderId }, noSelect: true });
    },

    snoozeDeliveryReminder: async (reminderId: string, until: string): Promise<void> => {
        await safeMutate('order_delivery_reminders', 'UPDATE', {
            snoozed_until: until,
            updated_at: new Date().toISOString()
        }, { match: { id: reminderId }, noSelect: true });
    },

    completeOrderDeliveryPlan: async (planId: string, orderId: string): Promise<void> => {
        const now = new Date().toISOString();
        await safeMutate('order_delivery_plans', 'UPDATE', {
            plan_status: 'completed',
            completed_at: now,
            updated_at: now
        }, { match: { id: planId }, noSelect: true });
        await safeMutate('order_delivery_reminders', 'UPDATE', {
            completed_at: now,
            updated_at: now
        }, { match: { plan_id: planId }, noSelect: true });
        await api.updateOrderStatus(orderId, OrderStatus.Delivered);
    },

    cancelOrderDeliveryPlan: async (planId: string): Promise<void> => {
        const now = new Date().toISOString();
        await safeMutate('order_delivery_plans', 'UPDATE', {
            plan_status: 'cancelled',
            cancelled_at: now,
            updated_at: now
        }, { match: { id: planId }, noSelect: true });
    },

    // NEW: Modified updateOrder to check for production batch sync
    updateOrder: async (o: Order): Promise<void> => {
        await safeMutate('orders', 'UPDATE', o, { match: { id: o.id }, noSelect: true });

        // Smart Reconciliation: If order is in production, sync items to batches
        // We ALWAYS reconcile now if batches exist to avoid the "4 items instead of 2" issue
        await api.reconcileOrderBatches(o);
    },

    deleteOrder: async (id: string): Promise<void> => {
        await safeMutate('production_batches', 'DELETE', null, { match: { order_id: id } });
        await safeMutate('orders', 'DELETE', null, { match: { id: id } });
    },

    updateBatchStage: async (id: string, stage: ProductionStage, userName?: string): Promise<void> => {
        // First get current batch to log the transition
        const { data: currentBatch } = await supabase.from('production_batches').select('current_stage').eq('id', id).single();

        await safeMutate('production_batches', 'UPDATE', { current_stage: stage, updated_at: new Date().toISOString() }, { match: { id } });

        // Log the stage transition in history
        try {
            await supabase.from('batch_stage_history').insert({
                id: crypto.randomUUID(),
                batch_id: id,
                from_stage: currentBatch?.current_stage || null,
                to_stage: stage,
                moved_by: userName || 'System',
                moved_at: new Date().toISOString()
            });
        } catch (e) {
            console.warn('Failed to log batch history:', e);
        }
    },
    deleteProductionBatch: async (id: string): Promise<void> => { await safeMutate('production_batches', 'DELETE', null, { match: { id } }); },

    // Batch History
    getBatchHistory: async (batchId: string): Promise<any[]> => {
        if (isLocalMode) return [];
        try {
            const { data, error } = await supabase
                .from('batch_stage_history')
                .select('*')
                .eq('batch_id', batchId)
                .order('moved_at', { ascending: true });
            if (error) throw error;
            return data || [];
        } catch (e) {
            console.warn('Failed to fetch batch history:', e);
            return [];
        }
    },

    logBatchHistory: async (batchId: string, fromStage: ProductionStage | null, toStage: ProductionStage, userName: string, notes?: string): Promise<void> => {
        if (isLocalMode) return;
        try {
            await supabase.from('batch_stage_history').insert({
                id: crypto.randomUUID(),
                batch_id: batchId,
                from_stage: fromStage,
                to_stage: toStage,
                moved_by: userName,
                moved_at: new Date().toISOString(),
                notes
            });
        } catch (e) {
            console.warn('Failed to log batch history:', e);
        }
    },

    // NEW: Toggle Hold Status
    toggleBatchHold: async (id: string, isHeld: boolean, reason?: string): Promise<void> => {
        await safeMutate('production_batches', 'UPDATE', {
            on_hold: isHeld,
            on_hold_reason: reason || null,
            updated_at: new Date().toISOString()
        }, { match: { id } });
    },

    updateOrderStatus: async (id: string, status: OrderStatus): Promise<void> => {
        await safeMutate('orders', 'UPDATE', { status }, { match: { id: id } });
        if (status === OrderStatus.Delivered || status === OrderStatus.Cancelled) {
            const now = new Date().toISOString();
            const planUpdate: Record<string, any> = {
                plan_status: syncPlanStatusWithOrder(status),
                updated_at: now
            };
            if (status === OrderStatus.Delivered) planUpdate.completed_at = now;
            if (status === OrderStatus.Cancelled) planUpdate.cancelled_at = now;
            await safeMutate('order_delivery_plans', 'UPDATE', planUpdate, { match: { order_id: id }, noSelect: true });
        }
        if (status === OrderStatus.Delivered || status === OrderStatus.Cancelled || status === OrderStatus.Pending) {
            await safeMutate('production_batches', 'DELETE', null, { match: { order_id: id } });
        }
    },

    setProductCollections: async (sku: string, collectionIds: number[]): Promise<void> => {
        await safeMutate('product_collections', 'DELETE', null, { match: { product_sku: sku } });
        if (collectionIds.length > 0) {
            const inserts = collectionIds.map(id => ({ product_sku: sku, collection_id: id }));
            await safeMutate('product_collections', 'INSERT', inserts);
        }
    },

    addProductsToCollection: async (items: { product_sku: string, collection_id: number }[]): Promise<void> => {
        if (items.length === 0) return;
        await safeMutate('product_collections', 'UPSERT', items, {
            onConflict: 'product_sku, collection_id',
            ignoreDuplicates: true
        });
    },

    createPriceSnapshot: async (notes: string, products: Product[]): Promise<void> => {
        if (isLocalMode) return;
        const items: any[] = [];
        products.forEach(p => {
            if (p.is_component) return;
            if (p.variants?.length) {
                p.variants.forEach(v => { items.push({ product_sku: p.sku, variant_suffix: v.suffix, price: v.selling_price || 0 }); });
            } else {
                items.push({ product_sku: p.sku, variant_suffix: null, price: p.selling_price || 0 });
            }
        });

        if (!navigator.onLine) {
            await safeMutate('price_snapshots', 'INSERT', { notes, item_count: items.length, created_at: new Date().toISOString() });
            return;
        }

        const { error } = await supabase.rpc('create_price_snapshot_v2', { p_notes: notes, p_items: items });
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
            if (item.variant_suffix) await safeMutate('product_variants', 'UPDATE', { selling_price: item.price }, { match: { product_sku: item.product_sku, suffix: item.variant_suffix } });
            else await safeMutate('products', 'UPDATE', { selling_price: item.price }, { match: { sku: item.product_sku } });
        }
    },

    // NEW: Bulletproof Reconciliation Function
    // This function handles additions, quantity reductions, and item removals for orders already in production.
    reconcileOrderBatches: async (order: Order): Promise<void> => {
        try {
            // 1. Fetch existing batches
            let existingBatches: any[] = [];
            if (isLocalMode) {
                const local = await offlineDb.getTable('production_batches');
                existingBatches = local?.filter(b => b.order_id === order.id) || [];
            } else {
                const { data } = await supabase.from('production_batches').select('*').eq('order_id', order.id);
                existingBatches = data || [];
            }

            if (existingBatches.length === 0 && order.status !== OrderStatus.InProduction && order.status !== OrderStatus.Ready) {
                // If no batches exist and we aren't "In Production", do nothing
                return;
            }

            // 2. Fetch dependencies
            const allProducts = await api.getProducts();
            const allMaterials = await api.getMaterials();
            const ZIRCON_CODES = ['LE', 'PR', 'AK', 'MP', 'KO', 'MV', 'RZ'];
            const NON_ZIRCON_STONE_CODES = ['TKO', 'TPR', 'TMP'];

            // 3. Define "Natural Key" for matching: SKU + Variant + Size
            const getNaturalKey = (sku: string, variant: string | null | undefined, size: string | null | undefined) => {
                return `${sku.toUpperCase()}::${(variant || '').toUpperCase()}::${(size || '').toUpperCase()}`;
            };

            // 4. Map Demand (What the order says NOW)
            const demandMap: Record<string, { qty: number, item: any }> = {};
            order.items.forEach(item => {
                const key = getNaturalKey(item.sku, item.variant_suffix, item.size_info);
                if (!demandMap[key]) demandMap[key] = { qty: 0, item };
                demandMap[key].qty += item.quantity;
            });

            // 5. Map Supply (What batches currently exist)
            const supplyMap: Record<string, ProductionBatch[]> = {};
            existingBatches.forEach((b: any) => {
                const key = getNaturalKey(b.sku, b.variant_suffix, b.size_info);
                if (!supplyMap[key]) supplyMap[key] = [];
                supplyMap[key].push(b);
            });

            // 6. RECONCILE: Iterate all unique keys; collect batch inserts, surplus ops, and metadata syncs
            const allKeys = new Set([...Object.keys(demandMap), ...Object.keys(supplyMap)]);
            const batchesToInsert: any[] = [];
            const batchIdsToDelete: string[] = [];
            const batchUpdates: { id: string; quantity: number; updated_at: string; notes?: string | null; size_info?: string | null }[] = [];
            const batchMetadataUpdates: { id: string; notes: string | null; size_info: string | null; updated_at: string }[] = [];

            for (const key of allKeys) {
                const targetQty = demandMap[key]?.qty || 0;
                const existingList = supplyMap[key] || [];
                const currentQty = existingList.reduce((s, b) => s + b.quantity, 0);
                const demandItem = demandMap[key]?.item;

                // CASE A: Deficit (Need more items) — collect rows for one bulk insert
                if (targetQty > currentQty) {
                    const diff = targetQty - currentQty;
                    const { item } = demandMap[key];
                    const product = allProducts.find(p => p.sku === item.sku);

                    if (product) {
                        const suffix = item.variant_suffix || '';
                        const stone = getVariantComponents(suffix, product.gender).stone;
                        const hasZirconsFromSuffix = stone?.code && ZIRCON_CODES.includes(stone.code) && !NON_ZIRCON_STONE_CODES.includes(stone.code);
                        const hasZirconsFromRecipe = product.recipe.some((r: any) => {
                            if (r.type !== 'raw') return false;
                            const material = allMaterials.find(m => m.id === r.id);
                            return material?.type === MaterialType.Stone && ZIRCON_CODES.some(code => material.name.includes(code));
                        });
                        const hasZircons = hasZirconsFromSuffix || hasZirconsFromRecipe;

                        const stage = product.production_type === ProductionType.Imported ? ProductionStage.AwaitingDelivery : ProductionStage.Waxing;
                        const now = new Date().toISOString();
                        batchesToInsert.push({
                            id: crypto.randomUUID(),
                            order_id: order.id,
                            sku: item.sku,
                            variant_suffix: item.variant_suffix || null,
                            quantity: diff,
                            current_stage: stage,
                            size_info: item.size_info || null,
                            notes: item.notes || null,
                            priority: 'Normal',
                            type: 'Νέα',
                            requires_setting: hasZircons,
                            created_at: now,
                            updated_at: now
                        });
                    }
                }
                // CASE B: Surplus — collect ids to delete and payloads to update (same order: earliest stage first)
                else if (currentQty > targetQty) {
                    let surplus = currentQty - targetQty;
                    const sortedSupply = [...existingList].sort((a, b) => {
                        const stages = Object.values(ProductionStage);
                        return stages.indexOf(a.current_stage) - stages.indexOf(b.current_stage);
                    });

                    for (const batch of sortedSupply) {
                        if (surplus <= 0) break;
                        if (batch.quantity <= surplus) {
                            batchIdsToDelete.push(batch.id);
                            surplus -= batch.quantity;
                        } else {
                            const now = new Date().toISOString();
                            batchUpdates.push({
                                id: batch.id,
                                quantity: batch.quantity - surplus,
                                updated_at: now,
                                notes: demandItem ? (demandItem.notes ?? null) : undefined,
                                size_info: demandItem ? (demandItem.size_info ?? null) : undefined
                            });
                            surplus = 0;
                        }
                    }
                }
                // CASE C: Exact match — sync notes/size_info from order so re-edits to notes/size are reflected
                if (targetQty === currentQty && demandItem && existingList.length > 0) {
                    const now = new Date().toISOString();
                    const notes = demandItem.notes ?? null;
                    const size_info = demandItem.size_info ?? null;
                    for (const b of existingList) {
                        batchMetadataUpdates.push({ id: b.id, notes, size_info, updated_at: now });
                    }
                }
            }

            // Apply deficit: single bulk insert
            if (batchesToInsert.length > 0) {
                await safeMutate('production_batches', 'INSERT', batchesToInsert);
            }
            // Apply surplus: parallel deletes and parallel updates (behavior unchanged)
            if (batchIdsToDelete.length > 0) {
                await Promise.all(batchIdsToDelete.map(id => api.deleteProductionBatch(id)));
            }
            if (batchUpdates.length > 0) {
                await Promise.all(batchUpdates.map(u => {
                    const payload: any = { quantity: u.quantity, updated_at: u.updated_at };
                    if (u.notes !== undefined) payload.notes = u.notes;
                    if (u.size_info !== undefined) payload.size_info = u.size_info;
                    return safeMutate('production_batches', 'UPDATE', payload, { match: { id: u.id } });
                }));
            }
            // Sync notes/size_info when qty matches so order re-edits (notes, size) are reflected
            if (batchMetadataUpdates.length > 0) {
                await Promise.all(batchMetadataUpdates.map(u =>
                    safeMutate('production_batches', 'UPDATE', { notes: u.notes, size_info: u.size_info, updated_at: u.updated_at }, { match: { id: u.id } })
                ));
            }
        } catch (err) {
            console.error("Batch Reconciliation Failed:", err);
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

        // Mark as In Production first
        await safeMutate('orders', 'UPDATE', { status: OrderStatus.InProduction }, { match: { id: orderId } });

        // Delegate to the bulletproof reconciliation logic
        // This prevents the "Four instead of Two" issue by checking existing supply first.
        await api.reconcileOrderBatches(order);
    },

    // NEW: PARTIAL SEND TO PRODUCTION
    sendPartialOrderToProduction: async (orderId: string, itemsToSend: { sku: string, variant: string | null, qty: number, size_info?: string, notes?: string }[], allProducts: Product[], allMaterials: Material[]): Promise<void> => {
        if (itemsToSend.length === 0) return;

        const ZIRCON_CODES = ['LE', 'PR', 'AK', 'MP', 'KO', 'MV', 'RZ'];
        const NON_ZIRCON_STONE_CODES = ['TKO', 'TPR', 'TMP'];
        const batches: any[] = [];

        for (const item of itemsToSend) {
            if (item.qty <= 0) continue;

            const product = allProducts.find(p => p.sku === item.sku);
            if (!product) continue;

            const suffix = item.variant || '';
            const stone = getVariantComponents(suffix, product.gender).stone;
            const hasZirconsFromSuffix = stone?.code && ZIRCON_CODES.includes(stone.code) && !NON_ZIRCON_STONE_CODES.includes(stone.code);
            const hasZirconsFromRecipe = product.recipe.some(r => {
                if (r.type !== 'raw') return false;
                const material = allMaterials.find(m => m.id === r.id);
                return material?.type === MaterialType.Stone && ZIRCON_CODES.some(code => material.name.includes(code));
            });
            const hasZircons = hasZirconsFromSuffix || hasZirconsFromRecipe;

            const stage = product.production_type === ProductionType.Imported ? ProductionStage.AwaitingDelivery : ProductionStage.Waxing;

            // Check if assembly stage is required based on SKU
            const requires_assembly = requiresAssemblyStage(item.sku);

            batches.push({
                id: crypto.randomUUID(),
                order_id: orderId,
                sku: item.sku,
                variant_suffix: item.variant || null,
                quantity: item.qty,
                current_stage: stage,
                size_info: item.size_info || null,
                notes: item.notes || null,
                priority: 'Normal',
                type: 'Νέα',
                requires_setting: hasZircons,
                requires_assembly,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            });
        }

        if (batches.length > 0) {
            await safeMutate('production_batches', 'UPSERT', batches);
        }

        // Always ensure order is marked In Production if we send something
        await safeMutate('orders', 'UPDATE', { status: OrderStatus.InProduction }, { match: { id: orderId } });
    },

    // NEW: REVERT FROM PRODUCTION
    revertOrderFromProduction: async (orderId: string): Promise<void> => {
        // 1. Delete all batches
        await safeMutate('production_batches', 'DELETE', null, { match: { order_id: orderId } });
        // 2. Set order status back to Pending
        await safeMutate('orders', 'UPDATE', { status: OrderStatus.Pending }, { match: { id: orderId } });
    },

    splitBatch: async (originalBatchId: string, originalNewQty: number, newBatchData: any, userName?: string): Promise<void> => {
        // Sanitize the split data to avoid blockages
        const sanitizedNew = sanitizeBatchData(newBatchData);
        await safeMutate('production_batches', 'UPDATE', { quantity: originalNewQty, updated_at: new Date().toISOString() }, { match: { id: originalBatchId } });
        await safeMutate('production_batches', 'INSERT', sanitizedNew);

        // Log history for the new batch (creation at target stage)
        try {
            await supabase.from('batch_stage_history').insert({
                id: crypto.randomUUID(),
                batch_id: sanitizedNew.id,
                from_stage: null,
                to_stage: sanitizedNew.current_stage,
                moved_by: userName || 'System',
                moved_at: new Date().toISOString(),
                notes: `Διαχωρισμός από παρτίδα ${originalBatchId} (ποσότητα: ${sanitizedNew.quantity})`
            });
        } catch (e) {
            console.warn('Failed to log batch split history:', e);
        }
    },

    mergeBatches: async (targetBatchId: string, sourceBatchIds: string[], totalQty: number): Promise<void> => {
        // Update target
        await safeMutate('production_batches', 'UPDATE', { quantity: totalQty, updated_at: new Date().toISOString() }, { match: { id: targetBatchId } });
        // Delete sources
        for (const id of sourceBatchIds) {
            await safeMutate('production_batches', 'DELETE', null, { match: { id } });
        }
    },

    syncOfflineData: async (): Promise<number> => {
        if (isLocalMode) return 0;
        const queue = await offlineDb.getQueue();
        if (queue.length === 0) return 0;
        let successCount = 0;
        for (const item of queue) {
            try {
                let query;
                const cleanData = item.table === 'products' ? sanitizeProductData(item.data) : (item.table === 'production_batches' ? sanitizeBatchData(item.data) : item.data);

                // FEATURE 3A: Conflict Resolution Check
                // Attempt to fetch current state from server to compare timestamps
                if (['UPDATE', 'UPSERT', 'DELETE'].includes(item.method) && cleanData.id && cleanData.updated_at) {
                    try {
                        const { data: serverData, error: fetchErr } = await supabase.from(item.table).select('updated_at').match(item.match || { id: cleanData.id }).single();
                        if (!fetchErr && serverData && serverData.updated_at) {
                            const localTime = new Date(cleanData.updated_at).getTime();
                            const serverTime = new Date(serverData.updated_at).getTime();

                            // If Server is newer (by more than 1 second to account for minor drift/processing time), reject
                            if (serverTime > localTime + 1000) {
                                await offlineDb.dequeue(item.id);
                                window.dispatchEvent(new CustomEvent('ilios-sync-error', {
                                    detail: {
                                        message: `Διαφωνία δεδομένων στον πίνακα ${item.table}. Η αλλαγή σας απορρίφθηκε επειδή τα δεδομένα τροποποιήθηκαν από άλλον χρήστη.`
                                    }
                                }));
                                continue; // Skip mapping this item
                            }
                        }
                    } catch (e) {
                        // Missing or fetching error, proceed with sync safely
                        console.warn("Conflict check skipped:", e);
                    }
                }

                if (item.method === 'INSERT') query = supabase.from(item.table).insert(cleanData);
                else if (item.method === 'UPDATE') query = supabase.from(item.table).update(cleanData).match(item.match || { id: item.data.id || item.data.sku });
                else if (item.method === 'DELETE') query = supabase.from(item.table).delete().match(item.match || { id: item.data.id || item.data.sku });
                else if (item.method === 'UPSERT') query = supabase.from(item.table).upsert(cleanData, { onConflict: item.onConflict, ignoreDuplicates: item.ignoreDuplicates });

                const { error } = await query!;
                if (!error) { await offlineDb.dequeue(item.id); successCount++; }
                else {
                    const errCode = error.code || '';
                    if (errCode === '42501' || errCode.startsWith('42') || errCode.startsWith('PGRST') || errCode === '23505') {
                        await offlineDb.dequeue(item.id);
                        window.dispatchEvent(new CustomEvent('ilios-sync-error', { detail: { message: `Αποτυχία συγχρονισμού για ${item.table} (${errCode}).` } }));
                    }
                }
            } catch (err) { console.error("Sync error:", err); }
        }
        return successCount;
    },

    getFullSystemExport: async (onProgress?: ProgressCallback): Promise<BackupEnvelope> => {
        const tableData: Record<string, any[]> = {};
        const totalTables = BACKUP_TABLE_REGISTRY.length;

        // Phase 1: Fetch all tables
        for (let i = 0; i < totalTables; i++) {
            const entry = BACKUP_TABLE_REGISTRY[i];
            onProgress?.({ phase: 'tables', current: i + 1, total: totalTables, tableName: entry.table, message: `Εξαγωγή ${entry.displayName} (${i + 1}/${totalTables})...` });
            try {
                tableData[entry.table] = await fetchFullTable(entry.table);
            } catch {
                tableData[entry.table] = [];
            }
        }

        // Phase 2: Download product images
        const images: Record<string, string> = {};
        const failedImages: string[] = [];
        const products = tableData['products'] || [];
        const uniqueUrls = new Map<string, string>(); // filename -> full URL

        for (const p of products) {
            const url = p.image_url;
            if (!url || typeof url !== 'string') continue;
            if (url.startsWith('data:')) continue;
            if (url.includes('picsum.photos')) continue;
            try {
                const parts = url.split('/');
                const filename = decodeURIComponent(parts[parts.length - 1]);
                if (filename && filename.trim() !== '') {
                    uniqueUrls.set(filename, `${R2_PUBLIC_URL}/${encodeURIComponent(filename)}`);
                }
            } catch { /* skip malformed URLs */ }
        }

        const imageEntries = Array.from(uniqueUrls.entries());
        const totalImages = imageEntries.length;
        const CONCURRENCY = 10;

        for (let i = 0; i < totalImages; i += CONCURRENCY) {
            const batch = imageEntries.slice(i, i + CONCURRENCY);
            const results = await Promise.allSettled(
                batch.map(async ([filename, url]) => {
                    const controller = new AbortController();
                    const timeout = setTimeout(() => controller.abort(), 8000);
                    try {
                        const resp = await fetch(url, { signal: controller.signal });
                        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
                        const blob = await resp.blob();
                        return { filename, dataUrl: await blobToDataUrl(blob) };
                    } finally {
                        clearTimeout(timeout);
                    }
                })
            );
            for (const r of results) {
                if (r.status === 'fulfilled') {
                    images[r.value.filename] = r.value.dataUrl;
                } else {
                    const failedFile = batch[results.indexOf(r)]?.[0] || 'unknown';
                    failedImages.push(failedFile);
                }
            }
            onProgress?.({ phase: 'images', current: Math.min(i + CONCURRENCY, totalImages), total: totalImages, message: `Λήψη εικόνων (${Math.min(i + CONCURRENCY, totalImages)}/${totalImages})...` });
        }

        // Phase 3: Config
        onProgress?.({ phase: 'config', current: 1, total: 1, message: 'Αποθήκευση ρυθμίσεων σύνδεσης...' });
        const config: Record<string, string> = {};
        for (const key of CONFIG_KEYS) {
            const val = localStorage.getItem(key);
            if (val !== null) config[key] = val;
        }

        // Phase 4: Sync queue
        onProgress?.({ phase: 'sync_queue', current: 1, total: 1, message: 'Αποθήκευση ουράς συγχρονισμού...' });
        const syncQueue = await offlineDb.getQueue();

        // Build envelope
        const tableCounts: Record<string, number> = {};
        for (const [key, arr] of Object.entries(tableData)) {
            tableCounts[key] = arr.length;
        }

        const meta: BackupMeta = {
            version: BACKUP_VERSION,
            format: BACKUP_FORMAT_MARKER,
            created_at: new Date().toISOString(),
            table_counts: tableCounts,
            image_count: Object.keys(images).length,
            failed_images: failedImages,
            total_tables: totalTables,
            is_local_mode: isLocalMode,
        };

        return { _meta: meta, _config: config, _images: images, _sync_queue: syncQueue, tables: tableData };
    },

    restoreFullSystem: async (backupData: BackupEnvelope | Record<string, any[]>, options?: RestoreOptions): Promise<RestoreResult> => {
        const onProgress = options?.onProgress;
        const errors: Array<{ table: string; message: string }> = [];

        // Format detection: v2 (envelope) vs v1 (flat table map)
        const isV2 = !!(backupData as any)._meta;
        const tables: Record<string, any[]> = isV2 ? (backupData as BackupEnvelope).tables : (backupData as Record<string, any[]>);
        const envelope = isV2 ? (backupData as BackupEnvelope) : null;

        const registryOrder = BACKUP_TABLE_REGISTRY;
        const totalTables = registryOrder.length;

        // ── LOCAL MODE ──
        if (isLocalMode || !SUPABASE_URL) {
            for (let i = 0; i < totalTables; i++) {
                const entry = registryOrder[i];
                const data = tables[entry.table];
                if (data) {
                    await offlineDb.saveTable(entry.table, data);
                }
                onProgress?.({ phase: 'tables', current: i + 1, total: totalTables, tableName: entry.table, message: `Επαναφορά ${entry.displayName} (${i + 1}/${totalTables})...` });
            }

            // Restore images into product data as data URLs
            if (envelope?._images && Object.keys(envelope._images).length > 0) {
                const products = (await offlineDb.getTable('products')) || [];
                const imageMap = envelope._images;
                let updated = false;
                for (const p of products) {
                    if (p.image_url && typeof p.image_url === 'string' && !p.image_url.startsWith('data:')) {
                        try {
                            const parts = p.image_url.split('/');
                            const filename = decodeURIComponent(parts[parts.length - 1]);
                            if (imageMap[filename]) {
                                p.image_url = imageMap[filename];
                                updated = true;
                            }
                        } catch { /* skip */ }
                    }
                }
                if (updated) await offlineDb.saveTable('products', products);
            }

            // Restore config
            if (options?.restoreConfig && envelope?._config) {
                for (const [key, val] of Object.entries(envelope._config)) {
                    localStorage.setItem(key, val);
                }
            }

            // Restore sync queue
            if (envelope?._sync_queue?.length) {
                for (const item of envelope._sync_queue) {
                    const { id, ...rest } = item;
                    await offlineDb.enqueue(rest);
                }
            }

            localStorage.setItem('ILIOS_LOCAL_MODE', 'true');
            return { errors };
        }

        // ── CLOUD MODE ──

        // Phase: Cleanup -- delete in reverse order
        const reverseOrder = [...registryOrder].reverse();
        for (let i = 0; i < reverseOrder.length; i++) {
            const entry = reverseOrder[i];
            onProgress?.({ phase: 'cleanup', current: i + 1, total: reverseOrder.length, tableName: entry.table, message: `Εκκαθάριση ${entry.displayName} (${i + 1}/${reverseOrder.length})...` });
            try {
                const pk = entry.primaryKey;
                const pkType = entry.primaryKeyType;
                if (pkType === 'uuid') {
                    await supabase.from(entry.table).delete().gte(pk, '00000000-0000-0000-0000-000000000000');
                } else if (pkType === 'integer') {
                    await supabase.from(entry.table).delete().gte(pk, 0);
                } else {
                    // string-keyed (sku, code, product_sku, etc.)
                    await supabase.from(entry.table).delete().neq(pk, '');
                }
            } catch (err: any) {
                errors.push({ table: entry.table, message: `Εκκαθάριση: ${err.message || err}` });
            }
        }

        // Phase: Insert tables in forward order
        const chunkSize = 200;
        for (let i = 0; i < totalTables; i++) {
            const entry = registryOrder[i];
            const data = tables[entry.table];
            onProgress?.({ phase: 'tables', current: i + 1, total: totalTables, tableName: entry.table, message: `Επαναφορά ${entry.displayName} (${i + 1}/${totalTables})...` });
            if (data?.length) {
                try {
                    for (let j = 0; j < data.length; j += chunkSize) {
                        const { error } = await supabase.from(entry.table).insert(data.slice(j, j + chunkSize));
                        if (error) throw error;
                    }
                } catch (err: any) {
                    errors.push({ table: entry.table, message: `Εισαγωγή: ${err.message || err}` });
                }
            }
        }

        // Phase: Restore images (cloud mode -- re-upload to R2)
        if (envelope?._images && Object.keys(envelope._images).length > 0) {
            const imageEntries = Object.entries(envelope._images);
            const totalImages = imageEntries.length;
            for (let i = 0; i < totalImages; i++) {
                const [filename, dataUrl] = imageEntries[i];
                onProgress?.({ phase: 'images', current: i + 1, total: totalImages, message: `Ανέβασμα εικόνων (${i + 1}/${totalImages})...` });
                try {
                    const resp = await fetch(dataUrl);
                    const blob = await resp.blob();
                    const uploadUrl = `${CLOUDFLARE_WORKER_URL}/${encodeURIComponent(filename)}`;
                    await fetch(uploadUrl, {
                        method: 'POST',
                        mode: 'cors',
                        headers: { 'Content-Type': 'image/jpeg', 'Authorization': AUTH_KEY_SECRET },
                        body: blob,
                    });
                } catch {
                    // Non-critical: image restore failure doesn't block table restore
                }
            }
        }

        // Phase: Restore config
        if (options?.restoreConfig && envelope?._config) {
            onProgress?.({ phase: 'config', current: 1, total: 1, message: 'Επαναφορά ρυθμίσεων σύνδεσης...' });
            for (const [key, val] of Object.entries(envelope._config)) {
                localStorage.setItem(key, val);
            }
        }

        // Phase: Restore sync queue (only if same environment)
        if (envelope?._sync_queue?.length) {
            const currentUrl = localStorage.getItem('VITE_SUPABASE_URL') || '';
            const backupUrl = envelope._config?.VITE_SUPABASE_URL || '';
            if (currentUrl === backupUrl || !currentUrl) {
                onProgress?.({ phase: 'sync_queue', current: 1, total: 1, message: 'Επαναφορά ουράς συγχρονισμού...' });
                for (const item of envelope._sync_queue) {
                    const { id, ...rest } = item;
                    await offlineDb.enqueue(rest);
                }
            }
        }

        return { errors };
    },

    getOffers: async (): Promise<Offer[]> => { return fetchFullTable('offers', '*', (q) => q.order('created_at', { ascending: false })); },
    saveOffer: async (offer: Offer): Promise<void> => { await safeMutate('offers', 'INSERT', offer); },
    updateOffer: async (offer: Offer): Promise<void> => { await safeMutate('offers', 'UPDATE', offer, { match: { id: offer.id } }); },
    deleteOffer: async (id: string): Promise<void> => { await safeMutate('offers', 'DELETE', null, { match: { id } }); },

    // Archive an order
    archiveOrder: async (orderId: string, archive: boolean): Promise<void> => {
        await safeMutate('orders', 'UPDATE', { is_archived: archive }, { match: { id: orderId } });
    },

    // --- AUDIT LOGS ---
    getAuditLogs: async (): Promise<AuditLog[]> => {
        if (isLocalMode) return [];
        const { data, error } = await supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(200);
        if (error) {
            console.error("Failed to fetch audit logs:", error);
            return [];
        }
        return data || [];
    },

    logAction: async (user_name: string, action: string, details?: any): Promise<void> => {
        if (isLocalMode) return; // Simple skipping for local mode
        try {
            await supabase.from('audit_logs').insert({
                user_name,
                action,
                details
            });
        } catch (e) {
            console.warn("Failed to log action:", e);
        }
    }
};
