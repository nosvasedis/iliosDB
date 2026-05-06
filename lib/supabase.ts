
import { createClient } from '@supabase/supabase-js';
import { CalendarDayEvent, GlobalSettings, Material, Product, Mold, ProductVariant, RecipeItem, Gender, PlatingType, Collection, Order, OrderItem, ProductionBatch, OrderStatus, ProductionStage, Customer, Warehouse, Supplier, BatchType, MaterialType, PriceSnapshot, PriceSnapshotItem, ProductionType, Offer, SupplierOrder, AuditLog, VatRegime, OrderDeliveryPlan, OrderDeliveryReminder, OrderShipment, OrderShipmentItem, BatchStageHistoryEntry, SyncOfflineResult } from '../types';
import { INITIAL_SETTINGS, MOCK_MATERIALS, requiresAssemblyStage, requiresSettingStage } from '../constants';
import { getVariantComponents } from '../utils/pricingEngine';
import { offlineDb } from './offlineDb';
import { BACKUP_TABLE_REGISTRY, BACKUP_VERSION, BACKUP_FORMAT_MARKER, CONFIG_KEYS, BackupEnvelope, BackupMeta, ProgressCallback, RestoreOptions, RestoreResult } from './backupConfig';
import { buildDefaultReminderDrafts, syncPlanStatusWithOrder } from '../utils/deliveryScheduling';
import { getOrthodoxCelebrationsForYear } from '../utils/orthodoxHoliday';
import { buildItemIdentityKey } from '../utils/itemIdentity';
import { isSpecialCreationSku } from '../utils/specialCreationSku';
import { buildOrderShipmentItemKey, buildStockDeductionEntries, checkStockForOrderItems as checkStockForOrderItemsHelper, getOrderShipmentsSnapshotFromTables, getOrderSnapshotById as getOrderSnapshotByIdHelper } from '../features/orders/supabaseHelpers';
import { buildInitialBatchHistoryEntry, canMoveBatchToStage as canMoveBatchToStageHelper, getBatchSnapshotById } from '../features/production/supabaseHelpers';
import { mapCatalogProductsWithRelations, mapProductsWithRelations, resolveProductImageUrl } from '../features/products/mappers';

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
export const resolveImageUrl = (url: string | null | undefined): string | null =>
    resolveProductImageUrl(url, R2_PUBLIC_URL);

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
        'size_info', 'cord_color', 'enamel_color', 'line_id', 'on_hold', 'on_hold_reason', 'pending_dispatch'
    ];
    const sanitized: any = {};
    validColumns.forEach(col => {
        if (data[col] !== undefined) sanitized[col] = data[col];
    });
    return sanitized;
};

const sanitizeDeliveryPlanData = (data: any) => {
    const validColumns = [
        'id', 'order_id', 'plan_status', 'planning_mode', 'target_at', 'window_start', 'window_end',
        'holiday_anchor', 'holiday_year', 'holiday_offset_days', 'contact_phone_override',
        'internal_notes', 'snoozed_until', 'completed_at', 'cancelled_at', 'created_by',
        'updated_by', 'created_at', 'updated_at'
    ];
    const sanitized: any = {};
    validColumns.forEach(col => {
        if (data?.[col] !== undefined) sanitized[col] = data[col];
    });
    return sanitized;
};

const sanitizeDeliveryReminderData = (data: any) => {
    const validColumns = [
        'id', 'plan_id', 'trigger_at', 'action_type', 'reason', 'sort_order', 'source',
        'acknowledged_at', 'completed_at', 'completion_note', 'completed_by',
        'snoozed_until', 'created_at', 'updated_at'
    ];
    const sanitized: any = {};
    validColumns.forEach(col => {
        if (data?.[col] !== undefined) sanitized[col] = data[col];
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
            query = options?.noSelect
                ? supabase.from(tableName).upsert(data, {
                    onConflict: options?.onConflict,
                    ignoreDuplicates: options?.ignoreDuplicates
                })
                : supabase.from(tableName).upsert(data, {
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
            // Skip items already present in the live server data (by id) to avoid phantom
            // duplicates when an INSERT succeeded in Supabase but failed to dequeue locally.
            const existingIds = new Set(mergedData.map((row: any) => row.id).filter(Boolean));
            const newItems = payload.filter((item: any) => !item.id || !existingIds.has(item.id));
            mergedData = [...mergedData, ...newItems];
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

async function getOrderShipmentsSnapshot(orderId: string): Promise<{ shipments: OrderShipment[]; items: OrderShipmentItem[] }> {
    const [shipments, items] = await Promise.all([
        fetchFullTable('order_shipments'),
        fetchFullTable('order_shipment_items')
    ]);
    return getOrderShipmentsSnapshotFromTables(shipments as OrderShipment[], items as OrderShipmentItem[], orderId);
}

async function getBatchSnapshot(batchId: string): Promise<ProductionBatch | null> {
    const batches = await fetchFullTable('production_batches');
    return getBatchSnapshotById(batches as ProductionBatch[], batchId);
}

async function getOrderSnapshot(orderId: string): Promise<Order | null> {
    const orders = await fetchFullTable('orders');
    return getOrderSnapshotByIdHelper(orders as Order[], orderId);
}

async function restoreStockForBatch(batch: ProductionBatch): Promise<void> {
    if (batch.type !== 'Από Stock') return;

    const products = await api.getProducts();
    const product = products.find((item) => item.sku === batch.sku);
    if (!product) {
        throw new Error(`Δεν βρέθηκε προϊόν για επαναφορά stock (${batch.sku}).`);
    }

    if (batch.variant_suffix) {
        const variant = product.variants?.find((item) => item.suffix === batch.variant_suffix);
        if (!variant) {
            throw new Error(`Δεν βρέθηκε παραλλαγή για επαναφορά stock (${batch.sku}${batch.variant_suffix}).`);
        }

        const updateData: any = {
            stock_qty: (variant.stock_qty || 0) + batch.quantity
        };

        if (batch.size_info) {
            const nextBySize = { ...(variant.stock_by_size || {}) };
            nextBySize[batch.size_info] = (nextBySize[batch.size_info] || 0) + batch.quantity;
            updateData.stock_by_size = nextBySize;
        }

        await safeMutate('product_variants', 'UPDATE', updateData, {
            match: { product_sku: batch.sku, suffix: batch.variant_suffix }
        });
    } else {
        const updateData: any = {
            stock_qty: (product.stock_qty || 0) + batch.quantity
        };

        if (batch.size_info) {
            const nextBySize = { ...(product.stock_by_size || {}) };
            nextBySize[batch.size_info] = (nextBySize[batch.size_info] || 0) + batch.quantity;
            updateData.stock_by_size = nextBySize;
        }

        await safeMutate('products', 'UPDATE', updateData, { match: { sku: batch.sku } });
    }

    await recordStockMovement(
        batch.sku,
        batch.quantity,
        `Επαναφορά από παραγωγή — Παραγγελία #${(batch.order_id || '').slice(0, 12) || 'χωρίς κωδικό'}`,
        batch.variant_suffix || undefined
    );
}

async function syncOrderStatusAfterBatchChange(orderId?: string): Promise<void> {
    if (!orderId) return;

    const [order, batches] = await Promise.all([
        getOrderSnapshot(orderId),
        fetchFullTable('production_batches')
    ]);

    if (!order) return;

    const remainingBatches = (batches as ProductionBatch[]).filter((batch) => batch.order_id === orderId);

    if (remainingBatches.length === 0) {
        if (order.status === OrderStatus.InProduction || order.status === OrderStatus.Ready) {
            await safeMutate('orders', 'UPDATE', { status: OrderStatus.Pending }, { match: { id: orderId }, noSelect: true });
        }
        return;
    }

    const hasInProgressBatch = remainingBatches.some((batch) => batch.current_stage !== ProductionStage.Ready);
    if (hasInProgressBatch && order.status === OrderStatus.Ready) {
        await safeMutate('orders', 'UPDATE', { status: OrderStatus.InProduction }, { match: { id: orderId }, noSelect: true });
        return;
    }

    if (order.status === OrderStatus.Pending) {
        await safeMutate('orders', 'UPDATE', { status: OrderStatus.InProduction }, { match: { id: orderId }, noSelect: true });
    }
}

async function insertBatchStageHistory(entry: BatchStageHistoryEntry): Promise<void> {
    await safeMutate('batch_stage_history', 'INSERT', {
        ...entry,
        notes: entry.notes ?? null
    }, { noSelect: true });
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

type BulkBatchStageUpdateSummary = {
    movedCount: number;
    skippedCount: number;
    impactedOrderIds: string[];
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

/** Check stock availability for order items (pure function, no DB call — reads from in-memory products). */
export function checkStockForOrderItems(
    itemsToSend: { sku: string; variant: string | null; qty: number; size_info?: string; cord_color?: string | null; enamel_color?: string | null; line_id?: string | null }[],
    allProducts: Product[]
): Array<{ sku: string; variant_suffix: string | null; size_info: string | null; cord_color?: string | null; enamel_color?: string | null; line_id?: string | null; requested_qty: number; available_in_stock: number }> {
    return checkStockForOrderItemsHelper(itemsToSend, allProducts);
}

/** Deduct stock for items fulfilled from inventory when sending an order to production. */
export async function deductStockForOrder(
    orderId: string,
    items: { sku: string; variant_suffix: string | null; qty: number; size_info?: string | null; cord_color?: string | null; enamel_color?: string | null }[],
    allProducts: Product[]
): Promise<void> {
    const entries = buildStockDeductionEntries(orderId, items, allProducts);
    for (const entry of entries) {
        await safeMutate(entry.table, 'UPDATE', entry.updateData, { match: entry.match });
        await recordStockMovement(entry.sku, -entry.qty, entry.movementReason, entry.variantSuffix || undefined);
    }
}

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

    deleteSupplierOrder: async (id: string): Promise<void> => {
        await safeMutate('supplier_orders', 'DELETE', null, { match: { id } });
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
        return mapProductsWithRelations(
            prodData as any,
            {
                variants: varData as any,
                recipes: recData as any,
                molds: prodMoldsData as any,
                collections: prodCollData as any,
                stock: stockData as any,
            },
            {
                publicImageBaseUrl: R2_PUBLIC_URL,
                centralWarehouseId: SYSTEM_IDS.CENTRAL,
                showroomWarehouseId: SYSTEM_IDS.SHOWROOM,
            }
        );
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
            const products: Product[] = mapCatalogProductsWithRelations(
                prodData as any,
                {
                    variants: varRes.data || [],
                    collections: collRes.data || [],
                    stock: stockRes.data || [],
                },
                {
                    publicImageBaseUrl: R2_PUBLIC_URL,
                    centralWarehouseId: SYSTEM_IDS.CENTRAL,
                    showroomWarehouseId: SYSTEM_IDS.SHOWROOM,
                }
            );
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

    getBatchStageHistoryEntries: async (): Promise<BatchStageHistoryEntry[]> => {
        return fetchFullTable('batch_stage_history', '*', (q) => q.order('moved_at', { ascending: false }));
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

    // --- Seller / Πλασιέ Management ---
    getSellers: async (): Promise<import('../types').UserProfile[]> => {
        const { data, error } = await supabase.from('profiles').select('*').eq('role', 'seller').order('full_name');
        if (error) throw error;
        return (data || []) as import('../types').UserProfile[];
    },
    createSeller: async (payload: { email: string; password: string; full_name: string; commission_percent?: number }): Promise<any> => {
        const res = await fetch(`${CLOUDFLARE_WORKER_URL}/admin/create-seller`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': AUTH_KEY_SECRET },
            body: JSON.stringify(payload),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Σφάλμα δημιουργίας πλασιέ');
        return json;
    },
    updateSeller: async (payload: { id: string; full_name?: string; commission_percent?: number | null; is_approved?: boolean; new_password?: string }): Promise<void> => {
        const res = await fetch(`${CLOUDFLARE_WORKER_URL}/admin/update-seller`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': AUTH_KEY_SECRET },
            body: JSON.stringify(payload),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Σφάλμα ενημέρωσης πλασιέ');
    },
    deleteSeller: async (id: string): Promise<void> => {
        const res = await fetch(`${CLOUDFLARE_WORKER_URL}/admin/delete-seller`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': AUTH_KEY_SECRET },
            body: JSON.stringify({ id }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Σφάλμα απενεργοποίησης πλασιέ');
    },

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
        await safeMutate('order_delivery_plans', 'UPSERT', sanitizeDeliveryPlanData(plan), { onConflict: 'id', noSelect: true });
        await safeMutate('order_delivery_reminders', 'DELETE', null, { match: { plan_id: plan.id } });
        if (reminders.length > 0) {
            await safeMutate('order_delivery_reminders', 'UPSERT', reminders.map(sanitizeDeliveryReminderData), { onConflict: 'id', noSelect: true });
        }
    },

    updateOrderDeliveryPlan: async (plan: OrderDeliveryPlan, reminders: OrderDeliveryReminder[]): Promise<void> => {
        await safeMutate('order_delivery_plans', 'UPSERT', sanitizeDeliveryPlanData(plan), { onConflict: 'id', noSelect: true });
        await safeMutate('order_delivery_reminders', 'DELETE', null, { match: { plan_id: plan.id } });
        if (reminders.length > 0) {
            await safeMutate('order_delivery_reminders', 'UPSERT', reminders.map(sanitizeDeliveryReminderData), { onConflict: 'id', noSelect: true });
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

    // ─── Shipment Tracking ─────────────────────────────────────────────────────

    getOrderShipments: async (): Promise<OrderShipment[]> => {
        return fetchFullTable('order_shipments', '*', (q) => q.order('created_at', { ascending: false }));
    },

    getOrderShipmentItems: async (shipmentId: string): Promise<OrderShipmentItem[]> => {
        const items = await fetchFullTable('order_shipment_items');
        return (items as OrderShipmentItem[]).filter((item) => item.shipment_id === shipmentId);
    },

    getShipmentsForOrder: async (orderId: string): Promise<{ shipments: OrderShipment[]; items: OrderShipmentItem[] }> => {
        return getOrderShipmentsSnapshot(orderId);
    },

    createPartialShipment: async (params: {
        orderId: string;
        orderItems: Array<{ sku: string; variant_suffix?: string; quantity: number; price_at_order: number; size_info?: string; cord_color?: string | null; enamel_color?: string | null; line_id?: string | null }>;
        items: Array<{ sku: string; variant_suffix?: string | null; size_info?: string | null; cord_color?: string | null; enamel_color?: string | null; quantity: number; price_at_order: number; line_id?: string | null }>;
        shippedBy: string;
        deliveryPlanId?: string | null;
        notes?: string | null;
        allBatches: ProductionBatch[];
    }): Promise<OrderShipment> => {
        const now = new Date().toISOString();
        const existingShipmentSnapshot = await getOrderShipmentsSnapshot(params.orderId);
        const shipmentNumber = existingShipmentSnapshot.shipments.reduce(
            (maxNumber, shipment) => Math.max(maxNumber, shipment.shipment_number || 0),
            0
        ) + 1;
        const shipmentId = crypto.randomUUID();
        const shipment: OrderShipment = {
            id: shipmentId,
            order_id: params.orderId,
            shipment_number: shipmentNumber,
            shipped_at: now,
            shipped_by: params.shippedBy,
            delivery_plan_id: params.deliveryPlanId || null,
            notes: params.notes || null,
            created_at: now
        };
        const shipmentItems: OrderShipmentItem[] = params.items.map(item => ({
            id: crypto.randomUUID(),
            shipment_id: shipmentId,
            sku: item.sku,
            variant_suffix: item.variant_suffix || null,
            size_info: item.size_info || null,
            cord_color: (item.cord_color || null) as OrderShipmentItem['cord_color'],
            enamel_color: (item.enamel_color || null) as OrderShipmentItem['enamel_color'],
            quantity: item.quantity,
            price_at_order: item.price_at_order,
            line_id: item.line_id || null
        }));

        const orderBatches = params.allBatches.filter(b => b.order_id === params.orderId);
        const batchMutations: Array<{ method: 'UPDATE' | 'DELETE'; data: any; match: Record<string, any> }> = [];
        for (const item of params.items) {
            let remainingToShip = item.quantity;
            const matchingReadyBatches = orderBatches
                .filter(b =>
                    b.sku === item.sku &&
                    (b.variant_suffix || null) === (item.variant_suffix || null) &&
                    (b.size_info || null) === (item.size_info || null) &&
                    (b.cord_color || null) === (item.cord_color || null) &&
                    (b.enamel_color || null) === (item.enamel_color || null) &&
                    b.current_stage === ProductionStage.Ready
                )
                .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()); // FIFO

            for (const batch of matchingReadyBatches) {
                if (remainingToShip <= 0) break;
                if (batch.quantity <= remainingToShip) {
                    batchMutations.push({ method: 'DELETE', data: null, match: { id: batch.id } });
                    remainingToShip -= batch.quantity;
                } else {
                    batchMutations.push({ method: 'UPDATE', data: {
                        quantity: batch.quantity - remainingToShip,
                        updated_at: now
                    }, match: { id: batch.id } });
                    remainingToShip = 0;
                }
            }
        }

        const shippedMap = new Map<string, number>();
        existingShipmentSnapshot.items.forEach((row) => {
            const key = buildOrderShipmentItemKey(row.sku, row.variant_suffix, row.size_info, row.cord_color, row.enamel_color, row.line_id);
            shippedMap.set(key, (shippedMap.get(key) || 0) + row.quantity);
        });
        shipmentItems.forEach((row) => {
            const key = buildOrderShipmentItemKey(row.sku, row.variant_suffix, row.size_info, row.cord_color, row.enamel_color, row.line_id);
            shippedMap.set(key, (shippedMap.get(key) || 0) + row.quantity);
        });

        let hasRemaining = false;
        for (const orderItem of params.orderItems) {
            const key = buildOrderShipmentItemKey(orderItem.sku, orderItem.variant_suffix, orderItem.size_info, orderItem.cord_color, orderItem.enamel_color, orderItem.line_id);
            const shipped = shippedMap.get(key) || 0;
            if (shipped < orderItem.quantity) {
                hasRemaining = true;
                break;
            }
        }

        const newStatus = hasRemaining ? OrderStatus.PartiallyDelivered : OrderStatus.Delivered;
        let nextPlan: OrderDeliveryPlan | null = null;
        let nextPlanReminders: OrderDeliveryReminder[] = [];
        if (hasRemaining) {
            const targetDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
            targetDate.setHours(10, 0, 0, 0);
            const newPlanId = crypto.randomUUID();
            nextPlan = {
                id: newPlanId,
                order_id: params.orderId,
                plan_status: 'active',
                planning_mode: 'exact',
                target_at: targetDate.toISOString(),
                window_start: null,
                window_end: null,
                holiday_anchor: null,
                holiday_year: null,
                holiday_offset_days: null,
                contact_phone_override: null,
                internal_notes: `Αυτόματο πλάνο για υπόλοιπο παραγγελίας μετά από αποστολή #${shipmentNumber}.`,
                snoozed_until: null,
                completed_at: null,
                cancelled_at: null,
                created_by: params.shippedBy,
                updated_by: null,
                created_at: now,
                updated_at: now
            };
            const reminderDrafts = buildDefaultReminderDrafts('exact', targetDate);
            nextPlanReminders = reminderDrafts.map((draft) => ({
                id: crypto.randomUUID(),
                plan_id: newPlanId,
                trigger_at: draft.trigger_at,
                action_type: draft.action_type,
                reason: draft.reason,
                sort_order: draft.sort_order,
                source: draft.source as 'auto' | 'manual',
                acknowledged_at: null,
                completed_at: null,
                completion_note: null,
                completed_by: null,
                snoozed_until: null,
                created_at: now,
                updated_at: now
            }));
        }

        await safeMutate('order_shipments', 'INSERT', shipment, { noSelect: true });
        if (shipmentItems.length > 0) {
            await safeMutate('order_shipment_items', 'INSERT', shipmentItems, { noSelect: true });
        }
        for (const mutation of batchMutations) {
            await safeMutate('production_batches', mutation.method, mutation.data, { match: mutation.match });
        }
        await safeMutate('orders', 'UPDATE', { status: newStatus }, { match: { id: params.orderId }, noSelect: true });

        if (params.deliveryPlanId) {
            await safeMutate('order_delivery_plans', 'UPDATE', {
                plan_status: 'completed',
                completed_at: now,
                updated_at: now
            }, { match: { id: params.deliveryPlanId }, noSelect: true });
            await safeMutate('order_delivery_reminders', 'UPDATE', {
                completed_at: now,
                updated_at: now
            }, { match: { plan_id: params.deliveryPlanId }, noSelect: true });
        }

        if (nextPlan) {
            await safeMutate('order_delivery_plans', 'UPSERT', sanitizeDeliveryPlanData(nextPlan), { onConflict: 'id', noSelect: true });
        }
        if (nextPlanReminders.length > 0) {
            await safeMutate('order_delivery_reminders', 'UPSERT', nextPlanReminders.map(sanitizeDeliveryReminderData), { onConflict: 'id', noSelect: true });
        }

        if (!hasRemaining) {
            await safeMutate('production_batches', 'DELETE', null, { match: { order_id: params.orderId } });
        }

        return shipment;
    },

    revertPartialShipment: async (params: {
        shipmentId: string;
        orderId: string;
        revertedBy: string;
    }): Promise<void> => {
        const now = new Date().toISOString();

        // 1. Fetch all shipments + items for this order
        const snapshot = await getOrderShipmentsSnapshot(params.orderId);
        const allOrderShipments = snapshot.shipments.sort((a, b) => b.shipment_number - a.shipment_number);
        const targetShipment = allOrderShipments.find((s) => s.id === params.shipmentId);
        if (!targetShipment) throw new Error('Η αποστολή δεν βρέθηκε.');

        // 2. Safety guard: only the latest shipment can be reverted
        const latestShipment = allOrderShipments[0];
        if (latestShipment.id !== params.shipmentId) {
            throw new Error('Μπορείτε να αναιρέσετε μόνο την τελευταία αποστολή.');
        }

        // 3. Fetch the items belonging to this specific shipment
        const shipmentItems = snapshot.items.filter((i) => i.shipment_id === params.shipmentId);

        // 4. Restore production batches for each shipped item (back to Ready stage)
        for (const item of shipmentItems) {
            if (item.quantity <= 0) continue;
            const restoredBatch: ProductionBatch = {
                id: crypto.randomUUID(),
                order_id: params.orderId,
                sku: item.sku,
                variant_suffix: item.variant_suffix || undefined,
                size_info: item.size_info || undefined,
                cord_color: (item.cord_color || undefined) as ProductionBatch['cord_color'],
                enamel_color: (item.enamel_color || undefined) as ProductionBatch['enamel_color'],
                line_id: item.line_id || null,
                quantity: item.quantity,
                current_stage: ProductionStage.Ready,
                priority: 'Normal',
                requires_setting: false,
                requires_assembly: false,
                on_hold: false,
                pending_dispatch: false,
                created_at: now,
                updated_at: now,
            };
            await safeMutate('production_batches', 'INSERT', restoredBatch, { noSelect: true });
        }

        // 5. Delete shipment items and the shipment record
        await safeMutate('order_shipment_items', 'DELETE', null, { match: { shipment_id: params.shipmentId } });
        await safeMutate('order_shipments', 'DELETE', null, { match: { id: params.shipmentId } });

        // 6. Determine new order status
        const remainingShipments = allOrderShipments.filter((s) => s.id !== params.shipmentId);
        const newStatus = remainingShipments.length > 0 ? OrderStatus.PartiallyDelivered : OrderStatus.InProduction;
        await safeMutate('orders', 'UPDATE', { status: newStatus }, { match: { id: params.orderId }, noSelect: true });

        // 7. Delivery plan handling
        // 7a. Cancel the auto-created "next plan" that was created by this shipment
        const allPlans = (await fetchFullTable('order_delivery_plans') as OrderDeliveryPlan[])
            .filter((p) => p.order_id === params.orderId);
        const autoCreatedPlan = allPlans.find(
            (p) =>
                p.plan_status === 'active' &&
                p.internal_notes?.includes(`Αυτόματο πλάνο για υπόλοιπο παραγγελίας μετά από αποστολή #${targetShipment.shipment_number}`)
        );
        if (autoCreatedPlan) {
            await safeMutate('order_delivery_plans', 'UPDATE', {
                plan_status: 'cancelled',
                cancelled_at: now,
                updated_at: now,
            }, { match: { id: autoCreatedPlan.id }, noSelect: true });
        }

        // 7b. Re-activate the original delivery plan that was completed by this shipment
        if (targetShipment.delivery_plan_id) {
            await safeMutate('order_delivery_plans', 'UPDATE', {
                plan_status: 'active',
                completed_at: null,
                updated_at: now,
            }, { match: { id: targetShipment.delivery_plan_id }, noSelect: true });
            // Re-open the reminders that were auto-completed by the shipment
            await safeMutate('order_delivery_reminders', 'UPDATE', {
                completed_at: null,
                completion_note: null,
                completed_by: null,
                updated_at: now,
            }, { match: { plan_id: targetShipment.delivery_plan_id } });
        }

        // 8. Audit log
        await api.logAction(params.revertedBy, 'Αναίρεση Μερικής Αποστολής', {
            orderId: params.orderId,
            shipmentId: params.shipmentId,
            shipmentNumber: targetShipment.shipment_number,
            itemCount: shipmentItems.reduce((sum, i) => sum + i.quantity, 0),
        });
    },

    // NEW: Modified updateOrder to check for production batch sync
    updateOrder: async (o: Order, isNewPart?: boolean): Promise<void> => {
        await safeMutate('orders', 'UPDATE', o, { match: { id: o.id }, noSelect: true });

        // Smart Reconciliation: If order is in production, sync items to batches
        // We ALWAYS reconcile now if batches exist to avoid the "4 items instead of 2" issue
        await api.reconcileOrderBatches(o, isNewPart);
    },

    deleteOrder: async (id: string): Promise<void> => {
        await safeMutate('production_batches', 'DELETE', null, { match: { order_id: id } });
        await safeMutate('orders', 'DELETE', null, { match: { id: id } });
    },

    updateBatchStage: async (id: string, stage: ProductionStage, userName?: string, pendingDispatch?: boolean): Promise<void> => {
        const now = new Date().toISOString();
        const currentBatch = await getBatchSnapshot(id);
        if (!currentBatch) return;
        if (!canMoveBatchToStageHelper(currentBatch, stage)) return;

        const updatePayload: Record<string, any> = { current_stage: stage, updated_at: now };
        // Auto-flag pending_dispatch when entering Polishing (Τεχνίτης)
        if (stage === ProductionStage.Polishing) {
            updatePayload.pending_dispatch = pendingDispatch ?? true;
        }
        // Clear pending_dispatch when leaving Polishing
        if (currentBatch.current_stage === ProductionStage.Polishing && stage !== ProductionStage.Polishing) {
            updatePayload.pending_dispatch = false;
        }

        await safeMutate('production_batches', 'UPDATE', updatePayload, { match: { id } });
        await insertBatchStageHistory({
            id: crypto.randomUUID(),
            batch_id: id,
            from_stage: currentBatch?.current_stage || null,
            to_stage: stage,
            moved_by: userName || 'System',
            moved_at: now
        });
        await syncOrderStatusAfterBatchChange(currentBatch?.order_id);
    },
    bulkUpdateBatchStages: async (batchIds: string[], stage: ProductionStage, userName?: string, pendingDispatch?: boolean): Promise<BulkBatchStageUpdateSummary> => {
        const uniqueIds = Array.from(new Set(batchIds.filter(Boolean)));
        if (uniqueIds.length === 0) {
            return { movedCount: 0, skippedCount: 0, impactedOrderIds: [] };
        }

        const now = new Date().toISOString();
        const allBatches = await fetchFullTable('production_batches');
        const selectedBatches = (allBatches as ProductionBatch[]).filter((batch) => uniqueIds.includes(batch.id));

        const movableBatches = selectedBatches.filter((batch) => canMoveBatchToStageHelper(batch, stage));
        if (movableBatches.length === 0) {
            return {
                movedCount: 0,
                skippedCount: uniqueIds.length,
                impactedOrderIds: []
            };
        }

        const impactedOrderIds = Array.from(new Set(movableBatches.map((batch) => batch.order_id).filter(Boolean))) as string[];

        await Promise.all(movableBatches.map((batch) =>
            safeMutate(
                'production_batches',
                'UPDATE',
                {
                    current_stage: stage,
                    updated_at: now,
                    // Auto-flag pending_dispatch when entering Polishing
                    ...(stage === ProductionStage.Polishing ? { pending_dispatch: pendingDispatch ?? true } : {}),
                    // Clear pending_dispatch when leaving Polishing
                    ...(batch.current_stage === ProductionStage.Polishing && stage !== ProductionStage.Polishing ? { pending_dispatch: false } : {}),
                },
                { match: { id: batch.id } }
            )
        ));

        await safeMutate(
            'batch_stage_history',
            'INSERT',
            movableBatches.map((batch) => ({
                id: crypto.randomUUID(),
                batch_id: batch.id,
                from_stage: batch.current_stage || null,
                to_stage: stage,
                moved_by: userName || 'System',
                moved_at: now,
                notes: null
            })),
            { noSelect: true }
        );

        await Promise.all(impactedOrderIds.map((orderId) => syncOrderStatusAfterBatchChange(orderId)));

        return {
            movedCount: movableBatches.length,
            skippedCount: uniqueIds.length - movableBatches.length,
            impactedOrderIds
        };
    },
    deleteProductionBatch: async (id: string): Promise<void> => {
        const batch = await getBatchSnapshot(id);
        if (!batch) return;

        await restoreStockForBatch(batch);
        await safeMutate('production_batches', 'DELETE', null, { match: { id } });
        await syncOrderStatusAfterBatchChange(batch.order_id);
    },

    // Batch History
    getBatchHistory: async (batchId: string): Promise<BatchStageHistoryEntry[]> => {
        const history = await fetchFullTable('batch_stage_history');
        return (history as BatchStageHistoryEntry[])
            .filter((entry) => entry.batch_id === batchId)
            .sort((a, b) => new Date(a.moved_at).getTime() - new Date(b.moved_at).getTime());
    },

    logBatchHistory: async (batchId: string, fromStage: ProductionStage | null, toStage: ProductionStage, userName: string, notes?: string): Promise<void> => {
        await insertBatchStageHistory({
            id: crypto.randomUUID(),
            batch_id: batchId,
            from_stage: fromStage,
            to_stage: toStage,
            moved_by: userName,
            moved_at: new Date().toISOString(),
            notes: notes ?? null
        });
    },

    // NEW: Toggle Hold Status
    toggleBatchHold: async (id: string, isHeld: boolean, reason?: string): Promise<void> => {
        await safeMutate('production_batches', 'UPDATE', {
            on_hold: isHeld,
            on_hold_reason: reason || null,
            updated_at: new Date().toISOString()
        }, { match: { id } });
    },

    // Mark batches as dispatched to technician (pending_dispatch = false)
    markBatchesDispatched: async (batchIds: string[], userName?: string): Promise<number> => {
        const uniqueIds = Array.from(new Set(batchIds.filter(Boolean)));
        if (uniqueIds.length === 0) return 0;

        const now = new Date().toISOString();
        await Promise.all(uniqueIds.map((id) =>
            safeMutate('production_batches', 'UPDATE', {
                pending_dispatch: false,
                updated_at: now,
            }, { match: { id }, noSelect: true })
        ));

        // Log history entries for audit trail
        await safeMutate(
            'batch_stage_history',
            'INSERT',
            uniqueIds.map((id) => ({
                id: crypto.randomUUID(),
                batch_id: id,
                from_stage: ProductionStage.Polishing,
                to_stage: ProductionStage.Polishing,
                moved_by: userName || 'System',
                moved_at: now,
                notes: 'Αποστολή στον Τεχνίτη'
            })),
            { noSelect: true }
        );

        return uniqueIds.length;
    },

    // Recall batches back to pending dispatch (pending_dispatch = true)
    markBatchesPendingDispatch: async (batchIds: string[], userName?: string): Promise<number> => {
        const uniqueIds = Array.from(new Set(batchIds.filter(Boolean)));
        if (uniqueIds.length === 0) return 0;

        const now = new Date().toISOString();
        await Promise.all(uniqueIds.map((id) =>
            safeMutate('production_batches', 'UPDATE', {
                pending_dispatch: true,
                updated_at: now,
            }, { match: { id }, noSelect: true })
        ));

        // Log history entries for audit trail
        await safeMutate(
            'batch_stage_history',
            'INSERT',
            uniqueIds.map((id) => ({
                id: crypto.randomUUID(),
                batch_id: id,
                from_stage: ProductionStage.Polishing,
                to_stage: ProductionStage.Polishing,
                moved_by: userName || 'System',
                moved_at: now,
                notes: 'Επιστροφή σε Αναμονή Αποστολής'
            })),
            { noSelect: true }
        );

        return uniqueIds.length;
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
        // PartiallyDelivered must NOT delete batches — remaining items are still in production
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
    // isNewPart=true  → new batches get a fresh timestamp (appear as a separate part in history)
    // isNewPart=false → new batches inherit the earliest existing batch timestamp (stay in same group)
    // isNewPart=undefined → fresh timestamp (legacy / called without user choice)
    reconcileOrderBatches: async (order: Order, isNewPart?: boolean): Promise<void> => {
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

            // 3. Define "Natural Key" for matching: SKU + Variant + Size + extra XR options (catalog — no line_id)
            const getNaturalKey = (
                sku: string,
                variant: string | null | undefined,
                size: string | null | undefined,
                cordColor?: string | null,
                enamelColor?: string | null
            ) => buildItemIdentityKey({
                sku: sku.toUpperCase(),
                variant_suffix: (variant || '').toUpperCase(),
                size_info: (size || '').toUpperCase(),
                cord_color: ((cordColor || '').toLowerCase() || null) as any,
                enamel_color: ((enamelColor || '').toLowerCase() || null) as any
            });

            // Pre-scan: count how many demand entries share each natural key.
            // When count > 1 the entries differ only by notes, so notes must be
            // part of the reconciliation key to keep them separate.
            const naturalKeyDemandCount: Record<string, number> = {};
            order.items.forEach((item: any) => {
                if (isSpecialCreationSku(item.sku)) return;
                const nk = getNaturalKey(item.sku, item.variant_suffix, item.size_info, item.cord_color, item.enamel_color);
                naturalKeyDemandCount[nk] = (naturalKeyDemandCount[nk] || 0) + 1;
            });

            const demandKeyForItem = (item: any) => {
                if (isSpecialCreationSku(item.sku)) {
                    return buildItemIdentityKey({
                        sku: (item.sku || '').toUpperCase(),
                        variant_suffix: (item.variant_suffix || '').toUpperCase(),
                        size_info: (item.size_info || '').toUpperCase(),
                        cord_color: ((item.cord_color || '').toLowerCase() || null) as any,
                        enamel_color: ((item.enamel_color || '').toLowerCase() || null) as any,
                        line_id: item.line_id ?? null
                    });
                }
                const nk = getNaturalKey(item.sku, item.variant_suffix, item.size_info, item.cord_color, item.enamel_color);
                // Only include notes in the key when there are multiple demand entries
                // for this natural key (i.e., same SKU+variant+size but different notes).
                return naturalKeyDemandCount[nk] > 1 ? nk + '::' + (item.notes || '') : nk;
            };

            const supplyKeyForBatch = (b: any) => {
                if (isSpecialCreationSku(b.sku)) {
                    return buildItemIdentityKey({
                        sku: (b.sku || '').toUpperCase(),
                        variant_suffix: (b.variant_suffix || '').toUpperCase(),
                        size_info: (b.size_info || '').toUpperCase(),
                        cord_color: ((b.cord_color || '').toLowerCase() || null) as any,
                        enamel_color: ((b.enamel_color || '').toLowerCase() || null) as any,
                        line_id: b.line_id ?? null
                    });
                }
                const nk = getNaturalKey(b.sku, b.variant_suffix, b.size_info, b.cord_color, b.enamel_color);
                // Mirror the demand key logic: include notes only for collision natural keys.
                return naturalKeyDemandCount[nk] > 1 ? nk + '::' + (b.notes || '') : nk;
            };

            // 3.5. For PartiallyDelivered orders, fetch shipped quantities so we don't
            // re-create batches for items that have already been shipped to the client.
            let shippedByDemandKey: Record<string, number> = {};
            if (order.status === OrderStatus.PartiallyDelivered) {
                const shipmentSnapshot = await getOrderShipmentsSnapshot(order.id);
                for (const si of shipmentSnapshot.items) {
                    const key = demandKeyForItem(si);
                    shippedByDemandKey[key] = (shippedByDemandKey[key] || 0) + si.quantity;
                }
            }

            // 4. Map Demand (What the order says NOW) — includes SP (ειδική δημιουργία) per line_id
            //    For PartiallyDelivered orders, demand is reduced by already-shipped quantities.
            const demandMap: Record<string, { qty: number, item: any }> = {};
            order.items.forEach(item => {
                const key = demandKeyForItem(item);
                if (!demandMap[key]) demandMap[key] = { qty: 0, item };
                demandMap[key].qty += item.quantity;
            });
            // Subtract already-shipped quantities so reconciliation doesn't create phantom batches
            for (const key of Object.keys(shippedByDemandKey)) {
                if (demandMap[key]) {
                    demandMap[key].qty = Math.max(0, demandMap[key].qty - shippedByDemandKey[key]);
                }
            }

            // 5. Map Supply (What batches currently exist)
            const supplyMap: Record<string, ProductionBatch[]> = {};
            existingBatches.forEach((b: any) => {
                const key = supplyKeyForBatch(b);
                if (!supplyMap[key]) supplyMap[key] = [];
                supplyMap[key].push(b);
            });

            // 6. RECONCILE: Iterate all unique keys; collect batch inserts, surplus ops, and metadata syncs
            // When isNewPart===false (adjustment), new batches inherit the earliest existing created_at
            // so groupBatchesByShipment keeps them in the same time-bucket (no phantom split).
            const batchCreatedAt = (isNewPart === false && existingBatches.length > 0)
                ? existingBatches.reduce(
                    (earliest: string, b: any) => (b.created_at < earliest ? b.created_at : earliest),
                    existingBatches[0].created_at as string
                  )
                : new Date().toISOString();

            const allKeys = new Set([...Object.keys(demandMap), ...Object.keys(supplyMap)]);
            const batchesToInsert: any[] = [];
            const batchIdsToDelete: string[] = [];
            const batchUpdates: { id: string; quantity: number; updated_at: string; notes?: string | null; size_info?: string | null; cord_color?: string | null; enamel_color?: string | null }[] = [];
            const batchMetadataUpdates: { id: string; notes: string | null; size_info: string | null; cord_color: string | null; enamel_color: string | null; updated_at: string }[] = [];

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

                    if (isSpecialCreationSku(item.sku)) {
                        const nowUpdated = new Date().toISOString();
                        batchesToInsert.push({
                            id: crypto.randomUUID(),
                            order_id: order.id,
                            sku: item.sku,
                            variant_suffix: item.variant_suffix || null,
                            quantity: diff,
                            current_stage: ProductionStage.Waxing,
                            size_info: item.size_info || null,
                            cord_color: item.cord_color || null,
                            enamel_color: item.enamel_color || null,
                            notes: item.notes || null,
                            line_id: item.line_id ?? null,
                            priority: 'Normal',
                            type: 'Νέα',
                            requires_setting: false,
                            requires_assembly: false,
                            created_at: batchCreatedAt,
                            updated_at: nowUpdated
                        });
                    } else if (product) {
                        const suffix = item.variant_suffix || '';
                        const stone = getVariantComponents(suffix, product.gender).stone;
                        const hasZirconsFromSuffix = stone?.code && ZIRCON_CODES.includes(stone.code) && !NON_ZIRCON_STONE_CODES.includes(stone.code);
                        const hasZirconsFromRecipe = product.recipe.some((r: any) => {
                            if (r.type !== 'raw') return false;
                            const material = allMaterials.find(m => m.id === r.id);
                            return material?.type === MaterialType.Stone && ZIRCON_CODES.some(code => material.name.includes(code));
                        });
                        const hasZircons = hasZirconsFromSuffix || hasZirconsFromRecipe || requiresSettingStage(item.sku);

                        const stage = product.production_type === ProductionType.Imported ? ProductionStage.AwaitingDelivery : ProductionStage.Waxing;
                        const nowUpdated = new Date().toISOString();
                        batchesToInsert.push({
                            id: crypto.randomUUID(),
                            order_id: order.id,
                            sku: item.sku,
                            variant_suffix: item.variant_suffix || null,
                            quantity: diff,
                            current_stage: stage,
                            size_info: item.size_info || null,
                            cord_color: item.cord_color || null,
                            enamel_color: item.enamel_color || null,
                            notes: item.notes || null,
                            priority: 'Normal',
                            type: 'Νέα',
                            requires_setting: hasZircons,
                            created_at: batchCreatedAt,
                            updated_at: nowUpdated
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
                                // Only push order notes when they exist; otherwise preserve the batch-level note
                                notes: demandItem ? (demandItem.notes != null ? demandItem.notes : (batch.notes ?? null)) : undefined,
                                size_info: demandItem ? (demandItem.size_info ?? null) : undefined,
                                cord_color: demandItem ? (demandItem.cord_color ?? null) : undefined,
                                enamel_color: demandItem ? (demandItem.enamel_color ?? null) : undefined
                            });
                            surplus = 0;
                        }
                    }
                }
                // CASE C: Exact match — sync metadata from order so re-edits are reflected.
                // Notes are only overwritten when the order line actually carries notes; otherwise
                // any note added directly in Παραγωγή is preserved.
                if (targetQty === currentQty && demandItem && existingList.length > 0) {
                    const now = new Date().toISOString();
                    const size_info = demandItem.size_info ?? null;
                    const cord_color = demandItem.cord_color ?? null;
                    const enamel_color = demandItem.enamel_color ?? null;
                    for (const b of existingList) {
                        const notes = demandItem.notes != null ? demandItem.notes : (b.notes ?? null);
                        batchMetadataUpdates.push({ id: b.id, notes, size_info, cord_color, enamel_color, updated_at: now });
                    }
                }
            }

            // Apply deficit: single bulk insert
            if (batchesToInsert.length > 0) {
                await safeMutate('production_batches', 'INSERT', batchesToInsert);
                await safeMutate(
                    'batch_stage_history',
                    'INSERT',
                    batchesToInsert.map((batch) => buildInitialBatchHistoryEntry(batch)),
                    { noSelect: true }
                );
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
                    if (u.cord_color !== undefined) payload.cord_color = u.cord_color;
                    if (u.enamel_color !== undefined) payload.enamel_color = u.enamel_color;
                    return safeMutate('production_batches', 'UPDATE', payload, { match: { id: u.id } });
                }));
            }
            // Sync notes/size_info when qty matches so order re-edits (notes, size) are reflected
            if (batchMetadataUpdates.length > 0) {
                await Promise.all(batchMetadataUpdates.map(u =>
                    safeMutate('production_batches', 'UPDATE', { notes: u.notes, size_info: u.size_info, cord_color: u.cord_color, enamel_color: u.enamel_color, updated_at: u.updated_at }, { match: { id: u.id } })
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
    sendPartialOrderToProduction: async (
        orderId: string,
        itemsToSend: { sku: string, variant: string | null, qty: number, size_info?: string, cord_color?: string | null, enamel_color?: string | null, notes?: string, line_id?: string | null }[],
        allProducts: Product[],
        allMaterials: Material[],
        stockFulfilledItems?: { sku: string, variant_suffix: string | null, qty: number, size_info?: string | null, cord_color?: string | null, enamel_color?: string | null, line_id?: string | null }[]
    ): Promise<void> => {
        if (itemsToSend.length === 0) return;

        const ZIRCON_CODES = ['LE', 'PR', 'AK', 'MP', 'KO', 'MV', 'RZ'];
        const NON_ZIRCON_STONE_CODES = ['TKO', 'TPR', 'TMP'];
        const batches: any[] = [];

        // Build stock-fulfilled lookup
        const stockMap = new Map<string, number>();
        if (stockFulfilledItems) {
            for (const sf of stockFulfilledItems) {
                const key = buildItemIdentityKey({
                    sku: sf.sku,
                    variant_suffix: sf.variant_suffix,
                    size_info: sf.size_info,
                    cord_color: sf.cord_color as any,
                    enamel_color: sf.enamel_color as any,
                    line_id: sf.line_id ?? null
                });
                stockMap.set(key, (stockMap.get(key) || 0) + sf.qty);
            }
        }

        for (const item of itemsToSend) {
            if (item.qty <= 0) continue;

            const stockKey = buildItemIdentityKey({
                sku: item.sku,
                variant_suffix: item.variant,
                size_info: item.size_info,
                cord_color: item.cord_color as any,
                enamel_color: item.enamel_color as any,
                line_id: item.line_id ?? null
            });
            const fromStock = stockMap.get(stockKey) || 0;
            const toProduce = item.qty - fromStock;
            const now = new Date().toISOString();

            if (isSpecialCreationSku(item.sku)) {
                if (item.qty > 0) {
                    batches.push({
                        id: crypto.randomUUID(),
                        order_id: orderId,
                        sku: item.sku,
                        variant_suffix: item.variant || null,
                        quantity: item.qty,
                        current_stage: ProductionStage.Waxing,
                        size_info: item.size_info || null,
                        cord_color: item.cord_color || null,
                        enamel_color: item.enamel_color || null,
                        notes: item.notes || null,
                        line_id: item.line_id ?? null,
                        priority: 'Normal',
                        type: 'Νέα',
                        requires_setting: false,
                        requires_assembly: false,
                        created_at: now,
                        updated_at: now
                    });
                }
                continue;
            }

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
            const hasZircons = hasZirconsFromSuffix || hasZirconsFromRecipe || requiresSettingStage(item.sku);

            const normalStage = product.production_type === ProductionType.Imported ? ProductionStage.AwaitingDelivery : ProductionStage.Waxing;
            const requires_assembly = requiresAssemblyStage(item.sku);

            // Create Ready batch for stock-fulfilled quantity
            if (fromStock > 0) {
                batches.push({
                    id: crypto.randomUUID(),
                    order_id: orderId,
                    sku: item.sku,
                    variant_suffix: item.variant || null,
                    quantity: fromStock,
                    current_stage: ProductionStage.Ready,
                    size_info: item.size_info || null,
                    cord_color: item.cord_color || null,
                    enamel_color: item.enamel_color || null,
                    notes: item.notes || null,
                    priority: 'Normal',
                    type: 'Από Stock' as BatchType,
                    requires_setting: hasZircons,
                    requires_assembly,
                    created_at: now,
                    updated_at: now
                });
            }

            // Create normal production batch for remaining quantity
            if (toProduce > 0) {
                batches.push({
                    id: crypto.randomUUID(),
                    order_id: orderId,
                    sku: item.sku,
                    variant_suffix: item.variant || null,
                    quantity: toProduce,
                    current_stage: normalStage,
                    size_info: item.size_info || null,
                    cord_color: item.cord_color || null,
                    enamel_color: item.enamel_color || null,
                    notes: item.notes || null,
                    priority: 'Normal',
                    type: 'Νέα',
                    requires_setting: hasZircons,
                    requires_assembly,
                    created_at: now,
                    updated_at: now
                });
            }
        }

        if (batches.length > 0) {
            await safeMutate('production_batches', 'UPSERT', batches);
            await safeMutate(
                'batch_stage_history',
                'INSERT',
                batches.map((batch) => buildInitialBatchHistoryEntry(batch)),
                { noSelect: true }
            );
        }

        // Always ensure order is marked In Production if we send something
        await safeMutate('orders', 'UPDATE', { status: OrderStatus.InProduction }, { match: { id: orderId } });
    },

    // NEW: REVERT FROM PRODUCTION
    revertOrderFromProduction: async (orderId: string): Promise<void> => {
        const shipmentSnapshot = await getOrderShipmentsSnapshot(orderId);
        if (shipmentSnapshot.shipments.length > 0) {
            throw new Error('Δεν μπορεί να γίνει πλήρης επαναφορά παραγωγής σε παραγγελία με καταχωρημένες αποστολές.');
        }

        const orderBatches = (await fetchFullTable('production_batches') as ProductionBatch[]).filter((batch) => batch.order_id === orderId);
        for (const batch of orderBatches) {
            await restoreStockForBatch(batch);
        }

        // 1. Delete all batches
        await safeMutate('production_batches', 'DELETE', null, { match: { order_id: orderId } });
        // 2. Set order status back to Pending
        await safeMutate('orders', 'UPDATE', { status: OrderStatus.Pending }, { match: { id: orderId }, noSelect: true });
    },

    revertProductionBatch: async (batchId: string): Promise<void> => {
        const batch = await getBatchSnapshot(batchId);
        if (!batch) throw new Error('Η παρτίδα δεν βρέθηκε.');

        await restoreStockForBatch(batch);
        await safeMutate('production_batches', 'DELETE', null, { match: { id: batchId } });
        await syncOrderStatusAfterBatchChange(batch.order_id);
    },

    splitBatch: async (originalBatchId: string, originalNewQty: number, newBatchData: any, userName?: string): Promise<void> => {
        const sanitizedNew = sanitizeBatchData(newBatchData);
        const now = new Date().toISOString();
        await safeMutate('production_batches', 'UPDATE', { quantity: originalNewQty, updated_at: now }, { match: { id: originalBatchId } });
        await safeMutate('production_batches', 'INSERT', sanitizedNew);
        await insertBatchStageHistory({
            id: crypto.randomUUID(),
            batch_id: sanitizedNew.id,
            from_stage: null,
            to_stage: sanitizedNew.current_stage,
            moved_by: userName || 'System',
            moved_at: now,
            notes: `Διαχωρισμός από παρτίδα ${originalBatchId} (ποσότητα: ${sanitizedNew.quantity})`
        });
    },

    mergeBatches: async (targetBatchId: string, sourceBatchIds: string[], totalQty: number): Promise<void> => {
        // Update target
        await safeMutate('production_batches', 'UPDATE', { quantity: totalQty, updated_at: new Date().toISOString() }, { match: { id: targetBatchId } });
        // Delete sources
        for (const id of sourceBatchIds) {
            await safeMutate('production_batches', 'DELETE', null, { match: { id } });
        }
    },

    // Merge multiple production-history "parts" into one by reusing a single created_at timestamp.
    // This makes groupBatchesByShipment treat them all as the same shipment group.
    mergeBatchParts: async (batchIds: string[], targetCreatedAt: string): Promise<void> => {
        const now = new Date().toISOString();
        for (const id of batchIds) {
            await safeMutate(
                'production_batches',
                'UPDATE',
                { created_at: targetCreatedAt, updated_at: now },
                { match: { id } }
            );
        }
    },

    syncOfflineData: async (): Promise<SyncOfflineResult> => {
        if (isLocalMode) {
            const remainingCount = await offlineDb.getQueueCount();
            return {
                syncedCount: 0,
                failedCount: 0,
                remainingCount,
                wasQueueEmpty: remainingCount === 0
            };
        }

        const queue = await offlineDb.getQueue();
        if (queue.length === 0) {
            return {
                syncedCount: 0,
                failedCount: 0,
                remainingCount: 0,
                wasQueueEmpty: true
            };
        }
        if (!navigator.onLine) {
            return {
                syncedCount: 0,
                failedCount: 0,
                remainingCount: queue.length,
                wasQueueEmpty: false
            };
        }

        let syncedCount = 0;
        let failedCount = 0;
        for (const item of queue) {
            try {
                let query;
                const rawData = item.data;
                const cleanData = item.table === 'products' && rawData
                    ? sanitizeProductData(rawData)
                    : item.table === 'production_batches' && rawData
                        ? sanitizeBatchData(rawData)
                        : item.table === 'order_delivery_plans' && rawData
                            ? (Array.isArray(rawData) ? rawData.map(sanitizeDeliveryPlanData) : sanitizeDeliveryPlanData(rawData))
                            : item.table === 'order_delivery_reminders' && rawData
                                ? (Array.isArray(rawData) ? rawData.map(sanitizeDeliveryReminderData) : sanitizeDeliveryReminderData(rawData))
                                : rawData;
                const matchTarget = item.match || { id: rawData?.id || rawData?.sku };

                if (['UPDATE', 'UPSERT', 'DELETE'].includes(item.method) && cleanData && cleanData.id && cleanData.updated_at) {
                    try {
                        const { data: serverData, error: fetchErr } = await supabase.from(item.table).select('updated_at').match(item.match || { id: cleanData.id }).single();
                        if (!fetchErr && serverData && serverData.updated_at) {
                            const localTime = new Date(cleanData.updated_at).getTime();
                            const serverTime = new Date(serverData.updated_at).getTime();

                            if (serverTime > localTime + 1000) {
                                await offlineDb.dequeue(item.id);
                                window.dispatchEvent(new CustomEvent('ilios-sync-error', {
                                    detail: {
                                        message: `Διαφωνία δεδομένων στον πίνακα ${item.table}. Η αλλαγή σας απορρίφθηκε επειδή τα δεδομένα τροποποιήθηκαν από άλλον χρήστη.`
                                    }
                                }));
                                failedCount++;
                                continue;
                            }
                        }
                    } catch (e) {
                        console.warn("Ο έλεγχος σύγκρουσης παραλείφθηκε:", e);
                    }
                }

                if (item.method === 'INSERT') query = supabase.from(item.table).insert(cleanData);
                else if (item.method === 'UPDATE') query = supabase.from(item.table).update(cleanData).match(matchTarget);
                else if (item.method === 'DELETE') query = supabase.from(item.table).delete().match(matchTarget);
                else if (item.method === 'UPSERT') query = supabase.from(item.table).upsert(cleanData, { onConflict: item.onConflict, ignoreDuplicates: item.ignoreDuplicates });

                const { error } = await query!;
                if (!error) {
                    await offlineDb.dequeue(item.id);
                    syncedCount++;
                } else {
                    failedCount++;
                    const errCode = error.code || '';
                    if (errCode === '42501' || errCode.startsWith('42') || errCode.startsWith('PGRST') || errCode === '23505') {
                        await offlineDb.dequeue(item.id);
                        window.dispatchEvent(new CustomEvent('ilios-sync-error', { detail: { message: `Αποτυχία συγχρονισμού για ${item.table} (${errCode}).` } }));
                    }
                }
            } catch (err) {
                failedCount++;
                console.error("Σφάλμα συγχρονισμού:", err);
                window.dispatchEvent(new CustomEvent('ilios-sync-error', {
                    detail: { message: `Αποτυχία συγχρονισμού για ${item.table}. Η αλλαγή παραμένει στην ουρά.` }
                }));
            }
        }
        return {
            syncedCount,
            failedCount,
            remainingCount: await offlineDb.getQueueCount(),
            wasQueueEmpty: false
        };
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
    },

    // ─── TRANSFER REMAINING ITEMS ────────────────────────────────────────────────────
    /**
     * Transfers all remaining (unshipped) items of Order A to Order B.
     *
     * Execution sequence (strictly ordered, with rollback on early steps):
     *   1. Re-point all batchesToRepoint from order_id=A → order_id=B  (rollback if any fail)
     *   2. Update Order B (add transferred items, new total, append note) → triggers reconcileOrderBatches
     *      (which sees supply=demand → no-op)                            (rollback step 1 if fails)
     *   3. Close Order A (status→Delivered, total→shipped-only, append note)
     *   4. Cancel all active delivery plans on Order A
     *   5. Audit log (fire-and-forget)
     *
     * Steps 3–5 are best-effort: if they fail the transfer has still succeeded
     * (batches + Order B updated) and the caller receives a partial-failure signal.
     */
    transferRemainingItemsToOrder: async (params: {
        orderA: Order;
        orderB: Order;
        batchesToRepoint: ProductionBatch[];
        newOrderBItems: OrderItem[];
        newOrderBTotal: number;
        recalculatedOrderATotal: number;
        /**
         * Order A's items[] trimmed to ONLY the shipped items.
         * MUST be written to the DB so analytics (Dashboard, businessAnalytics) that
         * iterate order.items[] on Delivered orders do not double-count the transferred
         * items alongside Order B.
         */
        shippedOnlyOrderAItems: OrderItem[];
        activeDeliveryPlanIdsA: string[];
        userName: string;
    }): Promise<{
        success: boolean;
        rolledBack: boolean;
        partialFailureStep?: 'close_order_a' | 'cancel_plans';
        error?: string;
    }> => {
        const now = new Date().toISOString();
        const dateLabel = new Date().toLocaleDateString('el-GR');
        const transferredCount = params.batchesToRepoint.reduce((s, b) => s + b.quantity, 0);
        const noteA = `\n\n[ΜΕΤΑΦΟΡΑ ${dateLabel}] Υπόλοιπο ${transferredCount} τεμ. μεταφέρθηκε → παρ. #${params.orderB.id.slice(-6)} | ${params.userName}`;
        const noteB = `\n\n[ΜΕΤΑΦΟΡΑ ${dateLabel}] Ελήφθησαν ${transferredCount} τεμ. από παρ. #${params.orderA.id.slice(-6)} | ${params.userName}`;

        // ── STEP 1: Re-point batches ──────────────────────────────────────────────────
        const repointedIds: string[] = [];
        try {
            for (const batch of params.batchesToRepoint) {
                await safeMutate(
                    'production_batches',
                    'UPDATE',
                    { order_id: params.orderB.id, updated_at: now },
                    { match: { id: batch.id }, noSelect: true },
                );
                repointedIds.push(batch.id);
            }
        } catch (err) {
            // Rollback: re-point already-moved batches back to Order A.
            for (const batchId of repointedIds) {
                try {
                    await safeMutate(
                        'production_batches',
                        'UPDATE',
                        { order_id: params.orderA.id, updated_at: now },
                        { match: { id: batchId }, noSelect: true },
                    );
                } catch {
                    // Best-effort rollback — log but continue.
                    console.error(`[transferRemainingItemsToOrder] Rollback failed for batch ${batchId}`);
                }
            }
            return { success: false, rolledBack: true, error: String(err) };
        }

        // ── STEP 2: Update Order B ────────────────────────────────────────────────────
        try {
            const updatedOrderB: Order = {
                ...params.orderB,
                items: params.newOrderBItems,
                total_price: params.newOrderBTotal,
                notes: ((params.orderB.notes ?? '') + noteB).trimStart(),
            };
            // updateOrder triggers reconcileOrderBatches internally.
            // Because we re-pointed the batches first, reconcile sees supply=demand → no new batches created.
            await api.updateOrder(updatedOrderB);
        } catch (err) {
            // Rollback: re-point all batches back to Order A.
            for (const batchId of repointedIds) {
                try {
                    await safeMutate(
                        'production_batches',
                        'UPDATE',
                        { order_id: params.orderA.id, updated_at: now },
                        { match: { id: batchId }, noSelect: true },
                    );
                } catch {
                    console.error(`[transferRemainingItemsToOrder] Rollback failed for batch ${batchId}`);
                }
            }
            return { success: false, rolledBack: true, error: String(err) };
        }

        // ── STEP 3: Close Order A (best-effort) ────────────────────────────────────────
        // Also replaces Order A's items[] with the shipped-only subset.
        // This is ESSENTIAL: analytics code (Dashboard, businessAnalytics) iterates
        // order.items[] on Delivered orders. Without this replacement, the transferred
        // items would be counted in both Order A (Delivered) and Order B, causing
        // double-counting of revenue, silver weight, and items-sold statistics.
        try {
            await safeMutate(
                'orders',
                'UPDATE',
                {
                    status: OrderStatus.Delivered,
                    items: params.shippedOnlyOrderAItems,
                    total_price: params.recalculatedOrderATotal,
                    notes: ((params.orderA.notes ?? '') + noteA).trimStart(),
                },
                { match: { id: params.orderA.id }, noSelect: true },
            );
        } catch (err) {
            console.error('[transferRemainingItemsToOrder] Failed to close Order A:', err);
            // Transfer succeeded — Order B updated, batches re-pointed — but A not closed.
            return { success: true, rolledBack: false, partialFailureStep: 'close_order_a' };
        }

        // ── STEP 4: Cancel active delivery plans on Order A (best-effort) ────────────────
        let planCancelFailed = false;
        for (const planId of params.activeDeliveryPlanIdsA) {
            try {
                await api.cancelOrderDeliveryPlan(planId);
            } catch (err) {
                console.error(`[transferRemainingItemsToOrder] Failed to cancel plan ${planId}:`, err);
                planCancelFailed = true;
            }
        }
        if (planCancelFailed) {
            return { success: true, rolledBack: false, partialFailureStep: 'cancel_plans' };
        }

        // ── STEP 5: Audit log (fire-and-forget) ──────────────────────────────────────────
        void api.logAction(params.userName, 'ΜΕΤΑΦΟΡΑ ΥΠΟΛΟΙΠΟΥ ΠΑΡΑΓΓΕΛΙΑΣ', {
            from_order_id: params.orderA.id,
            to_order_id: params.orderB.id,
            transferred_item_count: params.newOrderBItems.length - params.orderB.items.length + params.batchesToRepoint.length,
            batch_count: params.batchesToRepoint.length,
            transferred_qty: transferredCount,
        });

        return { success: true, rolledBack: false };
    },
};
