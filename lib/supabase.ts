
import { createClient } from '@supabase/supabase-js';
import { GlobalSettings, Material, Product, Mold, ProductVariant, RecipeItem, Gender, PlatingType, Collection, Order, ProductionBatch, OrderStatus, ProductionStage, Customer, Warehouse, Supplier, BatchType, MaterialType } from '../types';
import { INITIAL_SETTINGS, MOCK_PRODUCTS, MOCK_MATERIALS } from '../constants';

// --- CONFIGURATION FOR R2 IMAGE STORAGE ---
export const R2_PUBLIC_URL = 'https://pub-07bab0635aee4da18c155fcc9dc3bb36.r2.dev'; 
export const CLOUDFLARE_WORKER_URL = 'https://ilios-image-handler.iliosdb.workers.dev';

// --- SECURE INITIALIZATION STRATEGY ---
const envUrl = (import.meta as any).env?.VITE_SUPABASE_URL;
const envKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY;
const envWorkerKey = (import.meta as any).env?.VITE_WORKER_AUTH_KEY;
const envGeminiKey = (import.meta as any).env?.VITE_GEMINI_API_KEY;

const SUPABASE_URL = envUrl || localStorage.getItem('VITE_SUPABASE_URL') || '';
const SUPABASE_KEY = envKey || localStorage.getItem('VITE_SUPABASE_ANON_KEY') || '';
export const AUTH_KEY_SECRET = envWorkerKey || localStorage.getItem('VITE_WORKER_AUTH_KEY') || '';
export const GEMINI_API_KEY = envGeminiKey || localStorage.getItem('VITE_GEMINI_API_KEY') || '';

export const isConfigured = !!SUPABASE_URL && !!SUPABASE_KEY;

export const supabase = createClient(
    SUPABASE_URL || 'https://placeholder.supabase.co', 
    SUPABASE_KEY || 'placeholder'
);

/**
 * HELPER: fetchFullTable
 * PostgREST (Supabase) imposes a hard limit of 1000 rows per request.
 * This utility loops through pages to ensure 100% of data is retrieved.
 */
async function fetchFullTable(tableName: string, select: string = '*', filter?: (query: any) => any): Promise<any[]> {
    let allData: any[] = [];
    let from = 0;
    let to = 999;
    let hasMore = true;

    while (hasMore) {
        let query = supabase.from(tableName).select(select).range(from, to);
        if (filter) query = filter(query);
        
        const { data, error } = await query;
        if (error) throw error;
        
        if (data && data.length > 0) {
            allData = [...allData, ...data];
            if (data.length < 1000) {
                hasMore = false;
            } else {
                from += 1000;
                to += 1000;
            }
        } else {
            hasMore = false;
        }
    }
    return allData;
}

export const saveConfiguration = (url: string, key: string, workerKey: string, geminiKey: string) => {
    localStorage.setItem('VITE_SUPABASE_URL', url);
    localStorage.setItem('VITE_SUPABASE_ANON_KEY', key);
    localStorage.setItem('VITE_WORKER_AUTH_KEY', workerKey);
    localStorage.setItem('VITE_GEMINI_API_KEY', geminiKey);
    window.location.reload();
};

export const clearConfiguration = () => {
    localStorage.removeItem('VITE_SUPABASE_URL');
    localStorage.removeItem('VITE_SUPABASE_ANON_KEY');
    localStorage.removeItem('VITE_WORKER_AUTH_KEY');
    localStorage.removeItem('VITE_GEMINI_API_KEY');
    window.location.reload();
};

// UUID Generator Fallback
const generateUUID = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
};


// System Warehouse IDs (Must match SQL Insert)
export const SYSTEM_IDS = {
    CENTRAL: '00000000-0000-0000-0000-000000000001',
    SHOWROOM: '00000000-0000-0000-0000-000000000002'
};

/**
 * Uploads a product image to Cloudflare R2 via a secure worker.
 */
export const uploadProductImage = async (file: Blob, sku: string): Promise<string | null> => {
    const safeSku = sku
        .replace(/[^a-zA-Z0-9-\u0370-\u03FF]/g, '-') 
        .replace(/-+/g, '-') 
        .replace(/^-|-$/g, ''); 

    const uniqueId = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const fileName = `${safeSku.toUpperCase()}_${uniqueId}.jpg`;
    
    const uploadUrl = `${CLOUDFLARE_WORKER_URL}/${encodeURIComponent(fileName)}`;

    try {
        const response = await fetch(uploadUrl, {
            method: 'POST',
            mode: 'cors',
            credentials: 'omit',
            headers: {
                'Content-Type': 'image/jpeg',
                'Authorization': AUTH_KEY_SECRET,
            },
            body: file,
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Worker responded with ${response.status}: ${errorText}`);
        }

        return `${R2_PUBLIC_URL}/${encodeURIComponent(fileName)}`;

    } catch (error) {
        console.error("Cloudflare R2 Upload Error:", error);
        throw error;
    }
};

export const deleteProduct = async (sku: string, imageUrl?: string | null): Promise<{ success: boolean; error?: string }> => {
    try {
        const { data: usedInRecipes, error: checkError } = await supabase
            .from('recipes')
            .select('parent_sku')
            .eq('component_sku', sku);
        if (checkError) throw checkError;
        if (usedInRecipes && usedInRecipes.length > 0) {
            const parentSkus = usedInRecipes.map(r => r.parent_sku).join(', ');
            return { 
                success: false, 
                error: `Δεν είναι δυνατή η διαγραφή. Το προϊόν χρησιμοποιείται ως συστατικό στις συνταγές των: ${parentSkus}. Αφαιρέστε το πρώτα από εκείνες τις συνταγές.` 
            };
        }

        if (imageUrl && imageUrl.startsWith(R2_PUBLIC_URL)) {
            try {
                const urlParts = imageUrl.split('/');
                const encodedFileName = urlParts[urlParts.length - 1];
                if (encodedFileName) {
                    const deleteUrl = `${CLOUDFLARE_WORKER_URL}/${encodedFileName}`;
                    await fetch(deleteUrl, { method: 'DELETE', mode: 'cors', credentials: 'omit', headers: { 'Authorization': AUTH_KEY_SECRET } });
                }
            } catch (storageErr) {
                console.warn("Could not delete image file from R2, proceeding with DB delete.", storageErr);
            }
        }

        // Delete related records first due to foreign key constraints
        await supabase.from('product_variants').delete().eq('product_sku', sku);
        await supabase.from('recipes').delete().eq('parent_sku', sku);
        await supabase.from('product_molds').delete().eq('product_sku', sku);
        await supabase.from('product_collections').delete().eq('product_sku', sku);
        await supabase.from('stock_movements').delete().eq('product_sku', sku);
        await supabase.from('product_stock').delete().eq('product_sku', sku);

        const { error: deleteError } = await supabase.from('products').delete().eq('sku', sku);
        if (deleteError) throw new Error(`Failed to delete main product: ${deleteError.message}`);

        return { success: true };

    } catch (error: any) {
        console.error("Delete Product Error:", error);
        return { success: false, error: error.message || 'Άγνωστο σφάλμα κατά τη διαγραφή.' };
    }
};


export const recordStockMovement = async (sku: string, change: number, reason: string, variantSuffix?: string) => {
    try {
        await supabase.from('stock_movements').insert({
            product_sku: sku,
            variant_suffix: variantSuffix || null,
            change_amount: change,
            reason: reason,
            created_at: new Date().toISOString()
        });
    } catch (e) {
        console.error("Failed to record stock movement:", e);
    }
};

export const api = {
    getSettings: async (): Promise<GlobalSettings> => {
        try {
            const { data, error } = await supabase.from('global_settings').select('*').single();
            if (error) throw error;
            if (!data) return { ...INITIAL_SETTINGS, barcode_width_mm: 50, barcode_height_mm: 30 };
            return {
                silver_price_gram: Number(data.silver_price_gram),
                loss_percentage: Number(data.loss_percentage),
                barcode_width_mm: Number(data.barcode_width_mm) || 50,
                barcode_height_mm: Number(data.barcode_height_mm) || 30
            };
        } catch (e) {
            console.warn("API Error, using mock settings:", e);
            return { ...INITIAL_SETTINGS, barcode_width_mm: 50, barcode_height_mm: 30 };
        }
    },

    getMaterials: async (): Promise<Material[]> => {
        try {
            const data = await fetchFullTable('materials');
            if (!data || data.length === 0) return MOCK_MATERIALS;
            return data.map((m: any) => ({
                 id: m.id,
                 name: m.name,
                 type: m.type,
                 cost_per_unit: Number(m.cost_per_unit),
                 unit: m.unit,
                 variant_prices: m.variant_prices || {}
            }));
        } catch (e) {
            console.warn("API Error, using mock materials:", e);
            return MOCK_MATERIALS;
        }
    },

    getMolds: async (): Promise<Mold[]> => {
        try {
            const data = await fetchFullTable('molds');
            return data.map((m: any) => ({
                code: m.code,
                location: m.location,
                description: m.description
            })) || [];
        } catch (e) {
            console.warn("API Error, returning empty molds:", e);
            return [];
        }
    },

    getSuppliers: async (): Promise<Supplier[]> => {
        try {
            const data = await fetchFullTable('suppliers', '*', (q) => q.order('name'));
            return data || [];
        } catch (e) { return []; }
    },

    saveSupplier: async (supplier: Partial<Supplier>): Promise<void> => {
        if (supplier.id) {
            const { error } = await supabase.from('suppliers').update(supplier).eq('id', supplier.id);
            if (error) throw error;
        } else {
            const { error } = await supabase.from('suppliers').insert(supplier);
            if (error) throw error;
        }
    },

    deleteSupplier: async (id: string): Promise<void> => {
        const { error } = await supabase.from('suppliers').delete().eq('id', id);
        if (error) throw error;
    },

    getCollections: async (): Promise<Collection[]> => {
        try {
            const data = await fetchFullTable('collections', '*', (q) => q.order('name'));
            return data || [];
        } catch (e) { return []; }
    },

    setProductCollections: async(sku: string, collectionIds: number[]): Promise<void> => {
        const { error: deleteError } = await supabase.from('product_collections').delete().eq('product_sku', sku);
        if (deleteError) throw deleteError;
        if (collectionIds.length > 0) {
            const newLinks = collectionIds.map(id => ({ product_sku: sku, collection_id: id }));
            const { error: insertError } = await supabase.from('product_collections').insert(newLinks);
            if (insertError) throw insertError;
        }
    },

    getProducts: async (): Promise<Product[]> => {
        try {
            // 1. Fetch all main products using paginated helper
            const prodData = await fetchFullTable('products', '*, suppliers(*)'); 
            if (!prodData || prodData.length === 0) return MOCK_PRODUCTS;

            const skus = prodData.map(p => p.sku);

            // 2. Fetch related data using paginated helper with SKU filters
            // We fetch the FULL set of records for these SKUs, bypassing 1000-row limit
            const [
                varData,
                recData,
                prodMoldsData,
                prodCollData,
                stockData
            ] = await Promise.all([
                fetchFullTable('product_variants', '*', (q) => q.in('product_sku', skus)),
                fetchFullTable('recipes', '*', (q) => q.in('parent_sku', skus)),
                fetchFullTable('product_molds', '*', (q) => q.in('product_sku', skus)),
                fetchFullTable('product_collections', '*', (q) => q.in('product_sku', skus)),
                fetchFullTable('product_stock', '*', (q) => q.in('product_sku', skus))
            ]);

            const assembledProducts: Product[] = prodData.map((p: any) => {
                const customStock: Record<string, number> = {};
                stockData?.filter((s: any) => s.product_sku === p.sku && !s.variant_suffix).forEach((s: any) => {
                    customStock[s.warehouse_id] = s.quantity;
                });
                customStock[SYSTEM_IDS.CENTRAL] = p.stock_qty;
                customStock[SYSTEM_IDS.SHOWROOM] = p.sample_qty;

                const pVariants: ProductVariant[] = varData?.filter((v: any) => v.product_sku === p.sku).map((v: any) => {
                    const vCustomStock: Record<string, number> = {};
                    stockData?.filter((s: any) => s.product_sku === p.sku && s.variant_suffix === v.suffix).forEach((s: any) => {
                        vCustomStock[s.warehouse_id] = s.quantity;
                    });
                    vCustomStock[SYSTEM_IDS.CENTRAL] = v.stock_qty;
                    return {
                        suffix: v.suffix,
                        description: v.description,
                        stock_qty: v.stock_qty,
                        stock_by_size: v.stock_by_size || {},
                        location_stock: vCustomStock,
                        active_price: v.active_price ? Number(v.active_price) : null,
                        selling_price: v.selling_price ? Number(v.selling_price) : null
                    };
                }) || [];

                const pRecipe: RecipeItem[] = (recData?.filter((r: any) => r.parent_sku === p.sku) || []).map((r: any) => ({
                     type: r.type,
                     id: r.material_id, // Only for raw
                     sku: r.component_sku, // Only for component
                     quantity: Number(r.quantity)
                }));
                
                const pMolds = prodMoldsData?.filter((pm: any) => pm.product_sku === p.sku).map((pm: any) => ({
                        code: pm.mold_code,
                        quantity: pm.quantity || 1 
                })) || [];

                const pCollections = prodCollData?.filter((pc: any) => pc.product_sku === p.sku).map((pc: any) => pc.collection_id) || [];

                return {
                  sku: p.sku,
                  prefix: p.prefix,
                  category: p.category,
                  description: p.description, 
                  gender: p.gender as Gender,
                  image_url: p.image_url,
                  weight_g: Number(p.weight_g),
                  secondary_weight_g: p.secondary_weight_g ? Number(p.secondary_weight_g) : undefined,
                  plating_type: p.plating_type as PlatingType,
                  production_type: p.production_type || 'InHouse',
                  supplier_id: p.supplier_id,
                  supplier_cost: Number(p.supplier_cost || 0),
                  supplier_details: p.suppliers,
                  active_price: Number(p.active_price),
                  draft_price: Number(p.draft_price),
                  selling_price: Number(p.selling_price || 0),
                  stock_qty: p.stock_qty, 
                  sample_qty: p.sample_qty, 
                  stock_by_size: p.stock_by_size || {},
                  sample_stock_by_size: p.sample_stock_by_size || {},
                  location_stock: customStock, 
                  molds: pMolds,
                  is_component: p.is_component,
                  variants: pVariants,
                  recipe: pRecipe,
                  collections: pCollections,
                  labor: {
                    casting_cost: Number(p.labor_casting),
                    setter_cost: Number(p.labor_setter),
                    technician_cost: Number(p.labor_technician),
                    plating_cost_x: Number(p.labor_plating_x || 0),
                    plating_cost_d: Number(p.labor_plating_d || 0),
                    subcontract_cost: Number(p.labor_subcontract || 0),
                    technician_cost_manual_override: p.labor_technician_manual_override,
                    plating_cost_x_manual_override: p.labor_plating_x_manual_override,
                    plating_cost_d_manual_override: p.labor_plating_d_manual_override,
                    stone_setting_cost: Number(p.labor_stone_setting || 0),
                  }
                };
            });
            return assembledProducts;
        } catch (e) {
            console.warn("API Error, using mock products:", e);
            return MOCK_PRODUCTS;
        }
    },
    
    getWarehouses: async (): Promise<Warehouse[]> => {
        try {
            const data = await fetchFullTable('warehouses', '*', (q) => q.order('created_at'));
            if (!data || data.length === 0) {
                 return [
                    { id: SYSTEM_IDS.CENTRAL, name: 'Κεντρική Αποθήκη', type: 'Central', is_system: true },
                    { id: SYSTEM_IDS.SHOWROOM, name: 'Δειγματολόγιο', type: 'Showroom', is_system: true }
                ];
            }
            return data as Warehouse[];
        } catch (e) {
             return [
                { id: SYSTEM_IDS.CENTRAL, name: 'Κεντρική Αποθήκη', type: 'Central', is_system: true },
                { id: SYSTEM_IDS.SHOWROOM, name: 'Δειγματολόγιο', type: 'Showroom', is_system: true }
            ];
        }
    },

    saveWarehouse: async (wh: Partial<Warehouse>): Promise<Warehouse> => {
        const { data, error } = await supabase.from('warehouses').insert(wh).select().single();
        if (error) throw error;
        return data;
    },

    updateWarehouse: async (id: string, updates: Partial<Warehouse>): Promise<void> => {
        const { error } = await supabase.from('warehouses').update(updates).eq('id', id);
        if (error) throw error;
    },

    deleteWarehouse: async (id: string): Promise<void> => {
        const { error } = await supabase.from('warehouses').delete().eq('id', id);
        if (error) throw error;
    },

    transferStock: async (productSku: string, fromId: string, toId: string, qty: number): Promise<void> => {
        // Logic handled in UI directly using recordStockMovement and upsert
    },

    getCustomers: async (): Promise<Customer[]> => {
        try {
            const data = await fetchFullTable('customers', '*', (q) => q.order('full_name'));
            return data as Customer[];
        } catch (e) { return []; }
    },

    saveCustomer: async (customer: Partial<Customer>): Promise<Customer | null> => {
        const { data, error } = await supabase.from('customers').insert(customer).select().single();
        if (error) throw error;
        return data;
    },

    updateCustomer: async (id: string, updates: Partial<Customer>): Promise<void> => {
        const { error } = await supabase.from('customers').update(updates).eq('id', id);
        if (error) throw error;
    },

    deleteCustomer: async (id: string): Promise<void> => {
        const { error } = await supabase.from('customers').delete().eq('id', id);
        if (error) throw error;
    },

    getOrders: async (): Promise<Order[]> => {
        try {
            const data = await fetchFullTable('orders', '*', (q) => q.order('created_at', { ascending: false }));
            return data as Order[];
        } catch (e) { return []; }
    },

    saveOrder: async (order: Order): Promise<void> => {
        const { error } = await supabase.from('orders').insert({
            id: order.id,
            customer_id: order.customer_id, 
            customer_name: order.customer_name,
            customer_phone: order.customer_phone,
            status: order.status,
            total_price: order.total_price,
            items: order.items, 
            created_at: order.created_at,
            notes: order.notes
        });
        if (error) throw error;
    },

    updateOrder: async (order: Order): Promise<void> => {
        const isOrderInProductionFlow = order.status === OrderStatus.InProduction || order.status === OrderStatus.Ready;

        if (isOrderInProductionFlow) {
            const { count, error: fetchError } = await supabase
                .from('production_batches')
                .select('id', { count: 'exact', head: true })
                .eq('order_id', order.id)
                .neq('current_stage', ProductionStage.Waxing)
                .neq('current_stage', ProductionStage.AwaitingDelivery);

            if (fetchError) throw new Error("Could not verify production status.");
            if ((count || 0) > 0) {
                throw new Error("Δεν μπορείτε να αλλάξετε μια παραγγελία που έχει ήδη προχωρήσει στην παραγωγή.");
            }
        }
        
        const { error: updateError } = await supabase.from('orders').update({
            customer_id: order.customer_id,
            customer_name: order.customer_name,
            customer_phone: order.customer_phone,
            items: order.items,
            total_price: order.total_price,
            notes: order.notes
        }).eq('id', order.id);
        
        if (updateError) throw updateError;
    },
    
    sendOrderToProduction: async (orderId: string, allProducts: Product[], allMaterials: Material[]): Promise<void> => {
        try {
            const { data: order, error: orderError } = await supabase.from('orders').select('*').eq('id', orderId).single();
            if (orderError) throw new Error(`Could not fetch order: ${orderError.message}`);
            if (!order) throw new Error("Order not found");

            const { error: deleteError } = await supabase.from('production_batches')
                .delete()
                .eq('order_id', orderId)
                .or(`current_stage.eq.${ProductionStage.Waxing},current_stage.eq.${ProductionStage.AwaitingDelivery}`);
            
            if (deleteError) throw new Error(`Failed to clear old batches: ${deleteError.message}`);

            const batchesToInsert = [];
            
            for (const item of order.items) {
                const product = allProducts.find(p => p.sku === item.sku);
                if (!product) continue;

                let requiresSetting = false;
                let initialStage = ProductionStage.Waxing;

                if (product.production_type === 'Imported') {
                    requiresSetting = (product.labor.stone_setting_cost || 0) > 0;
                    initialStage = ProductionStage.AwaitingDelivery;
                } else {
                    requiresSetting = product.recipe.some(r => {
                        if (r.type !== 'raw') return false;
                        const mat = allMaterials.find(m => m.id === r.id);
                        return mat?.type === 'Stone';
                    });
                    initialStage = ProductionStage.Waxing;
                }

                batchesToInsert.push({
                    id: generateUUID(),
                    order_id: orderId,
                    sku: item.sku,
                    variant_suffix: item.variant_suffix || '',
                    quantity: item.quantity,
                    current_stage: initialStage,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                    priority: 'Normal',
                    type: 'Νέα',
                    notes: item.notes || '',
                    requires_setting: requiresSetting,
                    size_info: item.size_info || null
                });
            }

            if (batchesToInsert.length > 0) {
                const { error: insertError } = await supabase.from('production_batches').insert(batchesToInsert);
                if (insertError) throw new Error(`Batch insertion failed: ${insertError.message}`);
            }

            const { error: updateError } = await supabase.from('orders').update({ status: OrderStatus.InProduction }).eq('id', orderId);
            if (updateError) throw new Error(`Failed to update order status: ${updateError.message}`);

        } catch (error: any) {
            console.error("sendOrderToProduction Error:", error);
            throw error;
        }
    },
    
    updateOrderStatus: async (orderId: string, status: OrderStatus): Promise<void> => {
        const { error } = await supabase.from('orders').update({ status }).eq('id', orderId);
        if (error) throw error;
        if (status === OrderStatus.Delivered) {
            await supabase.from('production_batches').delete().eq('order_id', orderId);
        }
    },

    deleteOrder: async (orderId: string): Promise<void> => {
        await supabase.from('production_batches').delete().eq('order_id', orderId);
        const { error } = await supabase.from('orders').delete().eq('id', orderId);
        if (error) throw error;
    },

    getProductionBatches: async (): Promise<ProductionBatch[]> => {
        try {
            const data = await fetchFullTable('production_batches', '*', (q) => q.order('created_at', { ascending: false }));
            return data as ProductionBatch[];
        } catch (e) { return []; }
    },

    createProductionBatch: async (batch: Partial<ProductionBatch>): Promise<void> => {
        const { id, product_details, product_image, diffHours, isDelayed, ...insertData } = batch;
        const { error } = await supabase.from('production_batches').insert({
            ...insertData,
            id: generateUUID(),
            type: batch.type || 'Νέα'
        });
        if (error) throw error;
    },

    updateBatchStage: async (batchId: string, stage: ProductionStage): Promise<void> => {
        const { data: updatedBatch, error } = await supabase.from('production_batches').update({ current_stage: stage, updated_at: new Date().toISOString() }).eq('id', batchId).select().single();
        if (error) throw error;

        if (updatedBatch && updatedBatch.order_id) {
            const { data: orderBatches } = await supabase.from('production_batches').select('current_stage').eq('order_id', updatedBatch.order_id);
            if (orderBatches) {
                const allReady = orderBatches.every((b: any) => b.current_stage === ProductionStage.Ready);
                if (allReady) {
                    await api.updateOrderStatus(updatedBatch.order_id, OrderStatus.Ready);
                } else {
                    await api.updateOrderStatus(updatedBatch.order_id, OrderStatus.InProduction);
                }
            }
        }
    },
    
    splitBatch: async (originalBatchId: string, originalBatchNewQty: number, newBatchData: any): Promise<void> => {
        const { error: updateError } = await supabase.from('production_batches').update({ quantity: originalBatchNewQty, updated_at: new Date().toISOString() }).eq('id', originalBatchId);
        if (updateError) throw updateError;
        
        const finalNewBatch = { ...newBatchData, id: generateUUID() };
        const { error: insertError } = await supabase.from('production_batches').insert(finalNewBatch);
        if (insertError) throw insertError;
    },

    deleteProductionBatch: async (batchId: string): Promise<void> => {
        const { error } = await supabase.from('production_batches').delete().eq('id', batchId);
        if (error) throw error;
    }
};
