




import { createClient } from '@supabase/supabase-js';
import { GlobalSettings, Material, Product, Mold, ProductVariant, RecipeItem, Gender, PlatingType, Collection, Order, ProductionBatch, OrderStatus, ProductionStage, Customer, Warehouse } from '../types';
import { INITIAL_SETTINGS, MOCK_PRODUCTS, MOCK_MATERIALS } from '../constants';

// --- CONFIGURATION FOR R2 IMAGE STORAGE ---
export const R2_PUBLIC_URL = 'https://pub-07bab0635aee4da18c155fcc9dc3bb36.r2.dev'; 
export const CLOUDFLARE_WORKER_URL = 'https://ilios-image-handler.iliosdb.workers.dev';

// --- SECURE INITIALIZATION STRATEGY ---
// VITE IMPORTANT: We must access import.meta.env.VARIABLE_NAME explicitly 
// for the build tool to replace it with the Vercel Env Var.
// Do not use dynamic property access (e.g. env[key]) for build variables.

const envUrl = (import.meta as any).env?.VITE_SUPABASE_URL;
const envKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY;
const envWorkerKey = (import.meta as any).env?.VITE_WORKER_AUTH_KEY;

// Logic: 1. Try Build Env (Vercel) -> 2. Try Local Storage (Preview/Fallback) -> 3. Empty
const SUPABASE_URL = envUrl || localStorage.getItem('VITE_SUPABASE_URL') || '';
const SUPABASE_KEY = envKey || localStorage.getItem('VITE_SUPABASE_ANON_KEY') || '';
export const AUTH_KEY_SECRET = envWorkerKey || localStorage.getItem('VITE_WORKER_AUTH_KEY') || '';

export const isConfigured = !!SUPABASE_URL && !!SUPABASE_KEY;

// Initialize with real keys or valid-looking placeholders to prevent crash on startup
// If isConfigured is false, the UI will block access anyway via SetupScreen.
export const supabase = createClient(
    SUPABASE_URL || 'https://placeholder.supabase.co', 
    SUPABASE_KEY || 'placeholder'
);

export const saveConfiguration = (url: string, key: string, workerKey: string) => {
    localStorage.setItem('VITE_SUPABASE_URL', url);
    localStorage.setItem('VITE_SUPABASE_ANON_KEY', key);
    localStorage.setItem('VITE_WORKER_AUTH_KEY', workerKey);
    window.location.reload();
};

export const clearConfiguration = () => {
    localStorage.removeItem('VITE_SUPABASE_URL');
    localStorage.removeItem('VITE_SUPABASE_ANON_KEY');
    localStorage.removeItem('VITE_WORKER_AUTH_KEY');
    window.location.reload();
};


// System Warehouse IDs (Must match SQL Insert)
export const SYSTEM_IDS = {
    CENTRAL: '00000000-0000-0000-0000-000000000001',
    SHOWROOM: '00000000-0000-0000-0000-000000000002'
};

/**
 * [NEW] Uploads a product image to Cloudflare R2 via a secure worker.
 * Naming Convention: {SKU}_{TIMESTAMP}_{RANDOM}.jpg
 */
export const uploadProductImage = async (file: Blob, sku: string): Promise<string | null> => {
    // Sanitize SKU to prevent URL malformation. 
    // Allow alphanumerics, Greek characters, dashes.
    const safeSku = sku
        .replace(/[^a-zA-Z0-9-\u0370-\u03FF]/g, '-') // Replace non-alphanumeric/non-greek with dash
        .replace(/-+/g, '-') // Remove duplicate dashes
        .replace(/^-|-$/g, ''); // Trim dashes

    const uniqueId = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const fileName = `${safeSku.toUpperCase()}_${uniqueId}.jpg`;
    
    // We encode the filename for the URL
    const uploadUrl = `${CLOUDFLARE_WORKER_URL}/${encodeURIComponent(fileName)}`;

    try {
        const response = await fetch(uploadUrl, {
            method: 'POST',
            mode: 'cors', // Explicitly allow CORS
            credentials: 'omit', // Important: Do not send cookies/auth headers that conflict with wildcard CORS
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

        // Return the Public R2 URL
        return `${R2_PUBLIC_URL}/${encodeURIComponent(fileName)}`;

    } catch (error) {
        console.error("Cloudflare R2 Upload Error:", error);
        // Throwing error allows the UI to catch it and alert the user
        throw error;
    }
};

/**
 * [UPDATED] Robust Product Deletion
 */
export const deleteProduct = async (sku: string, imageUrl?: string): Promise<{ success: boolean; error?: string }> => {
    try {
        // 1. SAFETY CHECK: Is this product used as a component in another product's recipe?
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

        // 2. STORAGE CLEANUP: Delete image from R2 via worker
        if (imageUrl && imageUrl.startsWith(R2_PUBLIC_URL)) {
            try {
                const urlParts = imageUrl.split('/');
                const encodedFileName = urlParts[urlParts.length - 1];
                
                if (encodedFileName) {
                    const deleteUrl = `${CLOUDFLARE_WORKER_URL}/${encodedFileName}`;
                    await fetch(deleteUrl, {
                        method: 'DELETE',
                        mode: 'cors',
                        credentials: 'omit',
                        headers: {
                            'Authorization': AUTH_KEY_SECRET,
                        }
                    });
                }
            } catch (storageErr) {
                console.warn("Could not delete image file from R2, proceeding with DB delete.", storageErr);
            }
        }

        // 3. DATABASE CLEANUP
        await supabase.from('product_variants').delete().eq('product_sku', sku);
        await supabase.from('recipes').delete().eq('parent_sku', sku);
        await supabase.from('product_molds').delete().eq('product_sku', sku);
        await supabase.from('product_collections').delete().eq('product_sku', sku);
        await supabase.from('stock_movements').delete().eq('product_sku', sku);
        await supabase.from('product_stock').delete().eq('product_sku', sku); // New table

        // 4. DELETE PRODUCT
        const { error: deleteError } = await supabase.from('products').delete().eq('sku', sku);
        if (deleteError) throw deleteError;

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

/**
 * API Fetchers for React Query
 */
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
            const { data, error } = await supabase.from('materials').select('*');
            if (error) throw error;
            if (!data) return MOCK_MATERIALS;
            return data.map((m: any) => ({
                 id: m.id,
                 name: m.name,
                 type: m.type,
                 cost_per_unit: Number(m.cost_per_unit),
                 unit: m.unit
            }));
        } catch (e) {
            console.warn("API Error, using mock materials:", e);
            return MOCK_MATERIALS;
        }
    },

    getMolds: async (): Promise<Mold[]> => {
        try {
            const { data, error } = await supabase.from('molds').select('*');
            if (error) throw error;
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

    getCollections: async (): Promise<Collection[]> => {
        try {
            const { data, error } = await supabase.from('collections').select('*').order('name');
            if (error) throw error;
            return data || [];
        } catch (e) {
            console.warn("API Error, returning empty collections:", e);
            return [];
        }
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
            const { data: prodData, error } = await supabase.from('products').select('*');
            if (error) throw error;
            if (!prodData) return MOCK_PRODUCTS;

            const { data: varData } = await supabase.from('product_variants').select('*');
            const { data: recData } = await supabase.from('recipes').select('*');
            const { data: prodMoldsData } = await supabase.from('product_molds').select('*');
            const { data: prodCollData } = await supabase.from('product_collections').select('*');
            
            // Fetch Custom Warehouse Stocks
            const { data: stockData } = await supabase.from('product_stock').select('*');

            const assembledProducts: Product[] = prodData.map((p: any) => {
                
                // Map custom stock for Master (where variant_suffix is null/empty)
                const customStock: Record<string, number> = {};
                stockData?.filter((s: any) => s.product_sku === p.sku && !s.variant_suffix).forEach((s: any) => {
                    customStock[s.warehouse_id] = s.quantity;
                });
                // Add System Stocks to the map for uniform access (Master)
                customStock[SYSTEM_IDS.CENTRAL] = p.stock_qty;
                customStock[SYSTEM_IDS.SHOWROOM] = p.sample_qty;

                const pVariants: ProductVariant[] = varData
                  ?.filter((v: any) => v.product_sku === p.sku)
                  .map((v: any) => {
                    // Map custom stock for this variant
                    const vCustomStock: Record<string, number> = {};
                    stockData?.filter((s: any) => s.product_sku === p.sku && s.variant_suffix === v.suffix).forEach((s: any) => {
                        vCustomStock[s.warehouse_id] = s.quantity;
                    });
                    
                    // Add System Stocks for Variant (Assuming stock_qty in variants table is Central)
                    vCustomStock[SYSTEM_IDS.CENTRAL] = v.stock_qty;
                    // Note: Sample quantity for variants is not strictly defined in schema but can be extended. 
                    // For now, variants only track Central in 'stock_qty' column of 'product_variants' table.

                    return {
                        suffix: v.suffix,
                        description: v.description,
                        stock_qty: v.stock_qty,
                        location_stock: vCustomStock
                    };
                  }) || [];

                const pRecipeRaw = recData?.filter((r: any) => r.parent_sku === p.sku) || [];
                const pRecipe: RecipeItem[] = pRecipeRaw.map((r: any) => {
                   if (r.type === 'raw') {
                     return { type: 'raw', id: r.material_id, quantity: Number(r.quantity) };
                   } else {
                     return { type: 'component', sku: r.component_sku, quantity: Number(r.quantity) };
                   }
                });
                
                const pMolds = prodMoldsData
                    ?.filter((pm: any) => pm.product_sku === p.sku)
                    .map((pm: any) => pm.mold_code) || [];

                const pCollections = prodCollData
                    ?.filter((pc: any) => pc.product_sku === p.sku)
                    .map((pc: any) => pc.collection_id) || [];

                return {
                  sku: p.sku,
                  prefix: p.prefix,
                  category: p.category,
                  gender: p.gender as Gender,
                  image_url: p.image_url || 'https://picsum.photos/300/300',
                  weight_g: Number(p.weight_g),
                  plating_type: p.plating_type as PlatingType,
                  active_price: Number(p.active_price),
                  draft_price: Number(p.draft_price),
                  selling_price: Number(p.selling_price || 0),
                  stock_qty: p.stock_qty, // Master Central
                  sample_qty: p.sample_qty, // Master Showroom
                  location_stock: customStock, // Master Custom Stocks
                  molds: pMolds,
                  is_component: p.is_component,
                  variants: pVariants,
                  recipe: pRecipe,
                  collections: pCollections,
                  labor: {
                    casting_cost: Number(p.labor_casting),
                    setter_cost: Number(p.labor_setter),
                    technician_cost: Number(p.labor_technician),
                    plating_cost: Number(p.labor_plating)
                  }
                };
            });
            return assembledProducts;
        } catch (e) {
            console.warn("API Error, using mock products:", e);
            return MOCK_PRODUCTS;
        }
    },
    
    // --- WAREHOUSE MANAGEMENT API ---
    getWarehouses: async (): Promise<Warehouse[]> => {
        try {
            const { data, error } = await supabase.from('warehouses').select('*').order('created_at');
            if (error) {
                // If table doesn't exist, return defaults
                console.warn("Warehouses table might not exist yet:", error);
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
        // Also delete stocks associated? Handled by DB cascade
        const { error } = await supabase.from('warehouses').delete().eq('id', id);
        if (error) throw error;
    },

    /**
     * UNIFIED TRANSFER LOGIC
     * Handles movement between:
     * 1. System -> System (stock_qty <-> sample_qty)
     * 2. System -> Custom (stock_qty -> product_stock table)
     * 3. Custom -> System (product_stock -> stock_qty)
     * 4. Custom -> Custom (product_stock -> product_stock)
     */
    transferStock: async (productSku: string, fromId: string, toId: string, qty: number): Promise<void> => {
        // Fetch current product to get system stocks
        const { data: prod, error: pErr } = await supabase.from('products').select('*').eq('sku', productSku).single();
        if (pErr) throw pErr;

        // Fetch custom stocks
        const { data: stockFrom } = await supabase.from('product_stock').select('quantity').match({ product_sku: productSku, warehouse_id: fromId }).single();
        const { data: stockTo } = await supabase.from('product_stock').select('quantity').match({ product_sku: productSku, warehouse_id: toId }).single();
        
        let newFromQty = 0;
        let newToQty = 0;

        // --- DECREMENT SOURCE ---
        if (fromId === SYSTEM_IDS.CENTRAL) {
            newFromQty = prod.stock_qty - qty;
            if (newFromQty < 0) throw new Error("Ανεπαρκές απόθεμα στην Κεντρική Αποθήκη");
            await supabase.from('products').update({ stock_qty: newFromQty }).eq('sku', productSku);
        } else if (fromId === SYSTEM_IDS.SHOWROOM) {
            newFromQty = prod.sample_qty - qty;
            if (newFromQty < 0) throw new Error("Ανεπαρκές απόθεμα στο Δειγματολόγιο");
            await supabase.from('products').update({ sample_qty: newFromQty }).eq('sku', productSku);
        } else {
            // Custom Source
            const current = stockFrom ? stockFrom.quantity : 0;
            newFromQty = current - qty;
            if (newFromQty < 0) throw new Error("Ανεπαρκές απόθεμα στον επιλεγμένο χώρο");
            await supabase.from('product_stock').upsert({ product_sku: productSku, warehouse_id: fromId, quantity: newFromQty });
        }

        // --- INCREMENT TARGET ---
        // Refetch product in case we just updated it above (if source was system)
        
        if (toId === SYSTEM_IDS.CENTRAL) {
            const { data: freshProd } = await supabase.from('products').select('*').eq('sku', productSku).single();
            await supabase.from('products').update({ stock_qty: freshProd.stock_qty + qty }).eq('sku', productSku);

        } else if (toId === SYSTEM_IDS.SHOWROOM) {
            const { data: freshProd } = await supabase.from('products').select('*').eq('sku', productSku).single();
            await supabase.from('products').update({ sample_qty: freshProd.sample_qty + qty }).eq('sku', productSku);
        } else {
            // Custom Target
            const current = stockTo ? stockTo.quantity : 0;
            newToQty = current + qty;
            await supabase.from('product_stock').upsert({ product_sku: productSku, warehouse_id: toId, quantity: newToQty });
        }

        await recordStockMovement(productSku, qty, `Transfer: ${fromId} -> ${toId}`);
    },

    // --- CUSTOMERS API ---
    getCustomers: async (): Promise<Customer[]> => {
        try {
            const { data, error } = await supabase.from('customers').select('*').order('full_name');
            if (error) throw error;
            return data as Customer[];
        } catch (e) {
            console.warn("API Error, returning empty customers:", e);
            return [];
        }
    },

    saveCustomer: async (customer: Partial<Customer>): Promise<Customer | null> => {
        const { data, error } = await supabase
            .from('customers')
            .insert(customer)
            .select()
            .single();
        
        if (error) {
            console.error("Error saving customer:", error);
            throw error;
        }
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

    // --- ORDERS API ---
    getOrders: async (): Promise<Order[]> => {
        try {
            const { data, error } = await supabase
                .from('orders')
                .select('*')
                .order('created_at', { ascending: false });
            
            if (error) throw error;
            return data as Order[];
        } catch (e) {
            console.warn("API Error, returning empty orders:", e);
            return [];
        }
    },

    saveOrder: async (order: Order): Promise<void> => {
        const { error } = await supabase.from('orders').insert({
            id: order.id,
            customer_id: order.customer_id, // Link
            customer_name: order.customer_name,
            customer_phone: order.customer_phone,
            status: order.status,
            total_price: order.total_price,
            items: order.items, // Stores as JSONB
            created_at: order.created_at
        });

        if (error) {
            console.error("Error saving order:", error);
            throw error;
        }
    },
    
    updateOrderStatus: async (orderId: string, status: OrderStatus): Promise<void> => {
        const { error } = await supabase
            .from('orders')
            .update({ status })
            .eq('id', orderId);
            
        if (error) {
            console.error("Error updating order status:", error);
            throw error;
        }
    },

    // --- PRODUCTION API ---
    getProductionBatches: async (): Promise<ProductionBatch[]> => {
        try {
            const { data, error } = await supabase
                .from('production_batches')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;
            return data as ProductionBatch[];
        } catch (e) {
            console.warn("API Error, returning empty batches:", e);
            return [];
        }
    },

    createProductionBatch: async (batch: ProductionBatch): Promise<void> => {
        const { error } = await supabase.from('production_batches').insert({
            id: batch.id,
            order_id: batch.order_id,
            sku: batch.sku,
            variant_suffix: batch.variant_suffix,
            quantity: batch.quantity,
            current_stage: batch.current_stage,
            priority: batch.priority,
            created_at: batch.created_at,
            updated_at: batch.updated_at
        });

        if (error) {
            console.error("Error creating batch:", error);
            throw error;
        }
    },

    updateBatchStage: async (batchId: string, stage: ProductionStage): Promise<void> => {
        // 1. Update the specific batch
        const { data: updatedBatch, error } = await supabase
            .from('production_batches')
            .update({ current_stage: stage, updated_at: new Date().toISOString() })
            .eq('id', batchId)
            .select()
            .single();

        if (error) {
            console.error("Error updating batch stage:", error);
            throw error;
        }

        // 2. Sync Logic: If batch is linked to an order, check if the whole order is Ready
        if (updatedBatch && updatedBatch.order_id && stage === ProductionStage.Ready) {
            // Fetch all batches for this order
            const { data: orderBatches } = await supabase
                .from('production_batches')
                .select('current_stage')
                .eq('order_id', updatedBatch.order_id);

            if (orderBatches) {
                const allReady = orderBatches.every((b: any) => b.current_stage === ProductionStage.Ready);
                if (allReady) {
                    await api.updateOrderStatus(updatedBatch.order_id, OrderStatus.Ready);
                } else {
                    // Ensure it is marked as In Production if not all ready (sanity check)
                    await api.updateOrderStatus(updatedBatch.order_id, OrderStatus.InProduction);
                }
            }
        }
    },
    
    deleteProductionBatch: async (batchId: string): Promise<void> => {
        const { error } = await supabase.from('production_batches').delete().eq('id', batchId);
        if (error) {
             console.error("Error deleting batch:", error);
             throw error;
        }
    }
};