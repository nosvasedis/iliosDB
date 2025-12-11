import { createClient } from '@supabase/supabase-js';
import { 
  GlobalSettings, Material, Mold, Product, Order, Customer, Supplier, 
  ProductionBatch, Warehouse, Collection, OrderStatus, ProductionStage, 
  OrderItem
} from '../types';

// Constants
export const R2_PUBLIC_URL = localStorage.getItem('R2_PUBLIC_URL') || 'https://pub-07bab0635aee4da18c155fcc9dc3bb36.r2.dev';
export const CLOUDFLARE_WORKER_URL = localStorage.getItem('CLOUDFLARE_WORKER_URL') || 'https://ilios-worker.aris-854.workers.dev';
export const AUTH_KEY_SECRET = localStorage.getItem('AUTH_KEY_SECRET') || '2112Aris101!';
export const GEMINI_API_KEY = localStorage.getItem('VITE_GEMINI_API_KEY') || 'provided-by-environment';

export const SYSTEM_IDS = {
    CENTRAL: 'CENTRAL',
    SHOWROOM: 'SHOWROOM'
};

// Configuration
const SUPABASE_URL = localStorage.getItem('SUPABASE_URL') || '';
const SUPABASE_KEY = localStorage.getItem('SUPABASE_KEY') || '';

export const isConfigured = !!(SUPABASE_URL && SUPABASE_KEY);

export const saveConfiguration = (url: string, key: string, workerKey?: string, geminiKey?: string) => {
    localStorage.setItem('SUPABASE_URL', url);
    localStorage.setItem('SUPABASE_KEY', key);
    if (workerKey) localStorage.setItem('AUTH_KEY_SECRET', workerKey);
    if (geminiKey) localStorage.setItem('VITE_GEMINI_API_KEY', geminiKey);
    window.location.reload();
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Helper Functions
export const uploadProductImage = async (file: Blob, sku: string): Promise<string> => {
    const filename = `${sku}-${Date.now()}.jpg`;
    
    // Upload via Worker (Proxy)
    const response = await fetch(`${CLOUDFLARE_WORKER_URL}/${filename}`, {
        method: 'POST',
        headers: {
            'Authorization': AUTH_KEY_SECRET,
            'Content-Type': 'image/jpeg'
        },
        body: file
    });

    if (!response.ok) {
        throw new Error('Image upload failed');
    }

    return `${R2_PUBLIC_URL}/${filename}`;
};

export const deleteProduct = async (sku: string, imageUrl?: string | null): Promise<{ success: boolean, error?: string }> => {
    try {
        // Delete image if exists
        if (imageUrl && imageUrl.startsWith(R2_PUBLIC_URL)) {
            const filename = imageUrl.split('/').pop();
            if (filename) {
                await fetch(`${CLOUDFLARE_WORKER_URL}/${filename}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': AUTH_KEY_SECRET }
                });
            }
        }

        const { error } = await supabase.from('products').delete().eq('sku', sku);
        if (error) throw error;
        return { success: true };
    } catch (err: any) {
        return { success: false, error: err.message };
    }
};

export const recordStockMovement = async (sku: string, quantity: number, reason: string, variantSuffix?: string) => {
    await supabase.from('stock_movements').insert({
        sku,
        variant_suffix: variantSuffix || null,
        quantity,
        reason,
        created_at: new Date().toISOString()
    });
};

// API Object
export const api = {
    getSettings: async (): Promise<GlobalSettings> => {
        const { data, error } = await supabase.from('global_settings').select('*').single();
        if (error) throw error;
        return data;
    },
    
    getMaterials: async (): Promise<Material[]> => {
        const { data, error } = await supabase.from('materials').select('*');
        if (error) throw error;
        return data || [];
    },

    getMolds: async (): Promise<Mold[]> => {
        const { data, error } = await supabase.from('molds').select('*');
        if (error) throw error;
        return data || [];
    },

    getProducts: async (): Promise<Product[]> => {
        const { data: productsData, error: prodError } = await supabase
            .from('products')
            .select(`
                *,
                variants:product_variants(*),
                molds:product_molds(*),
                recipe:recipes(*),
                supplier_details:suppliers(*)
            `);
        
        if (prodError) throw prodError;
        
        return productsData.map((p: any) => ({
            ...p,
            labor: {
                casting_cost: p.labor_casting,
                setter_cost: p.labor_setter,
                technician_cost: p.labor_technician,
                plating_cost_x: p.labor_plating_x,
                plating_cost_d: p.labor_plating_d,
                subcontract_cost: p.labor_subcontract,
                stone_setting_cost: p.labor_stone_setting,
                casting_cost_manual_override: p.labor_casting_manual_override,
                technician_cost_manual_override: p.labor_technician_manual_override,
                plating_cost_x_manual_override: p.labor_plating_x_manual_override,
                plating_cost_d_manual_override: p.labor_plating_d_manual_override
            },
            recipe: p.recipe ? p.recipe.map((r: any) => ({
               type: r.type,
               id: r.material_id,
               sku: r.component_sku,
               quantity: r.quantity 
            })) : [],
            molds: p.molds ? p.molds.map((m: any) => ({
                code: m.mold_code,
                quantity: m.quantity
            })) : []
        }));
    },

    getCollections: async (): Promise<Collection[]> => {
        const { data, error } = await supabase.from('collections').select('*');
        if (error) throw error;
        return data || [];
    },

    getOrders: async (): Promise<Order[]> => {
        const { data, error } = await supabase.from('orders').select('*').order('created_at', { ascending: false });
        if (error) throw error;
        return data || [];
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
        const { error } = await supabase.from('orders').update({
            customer_id: order.customer_id,
            customer_name: order.customer_name,
            customer_phone: order.customer_phone,
            items: order.items,
            total_price: order.total_price,
            notes: order.notes
        }).eq('id', order.id);
        if (error) throw error;
    },
    
    updateOrderStatus: async (orderId: string, status: OrderStatus): Promise<void> => {
        const { error } = await supabase.from('orders').update({ status }).eq('id', orderId);
        if (error) throw error;
    },

    deleteOrder: async (orderId: string): Promise<void> => {
        const { error } = await supabase.from('orders').delete().eq('id', orderId);
        if (error) throw error;
    },

    getCustomers: async (): Promise<Customer[]> => {
        const { data, error } = await supabase.from('customers').select('*');
        if (error) throw error;
        return data || [];
    },

    saveCustomer: async (customer: Partial<Customer>): Promise<Customer> => {
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

    getSuppliers: async (): Promise<Supplier[]> => {
        const { data, error } = await supabase.from('suppliers').select('*');
        if (error) throw error;
        return data || [];
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

    getProductionBatches: async (): Promise<ProductionBatch[]> => {
        const { data, error } = await supabase.from('production_batches').select('*');
        if (error) throw error;
        return data || [];
    },

    updateBatchStage: async (id: string, stage: ProductionStage): Promise<void> => {
        const { error } = await supabase.from('production_batches').update({ 
            current_stage: stage,
            updated_at: new Date().toISOString()
        }).eq('id', id);
        if (error) throw error;
    },

    splitBatch: async (originalBatchId: string, originalNewQty: number, newBatchData: Partial<ProductionBatch>): Promise<void> => {
        const { error: updateError } = await supabase.from('production_batches').update({ quantity: originalNewQty }).eq('id', originalBatchId);
        if (updateError) throw updateError;
        
        const { error: insertError } = await supabase.from('production_batches').insert(newBatchData);
        if (insertError) throw insertError;
    },

    getWarehouses: async (): Promise<Warehouse[]> => {
        const { data, error } = await supabase.from('warehouses').select('*');
        if (error) throw error;
        return data || [];
    },

    saveWarehouse: async (warehouse: Partial<Warehouse>): Promise<void> => {
        const { error } = await supabase.from('warehouses').insert(warehouse);
        if (error) throw error;
    },

    updateWarehouse: async (id: string, updates: Partial<Warehouse>): Promise<void> => {
        const { error } = await supabase.from('warehouses').update(updates).eq('id', id);
        if (error) throw error;
    },

    deleteWarehouse: async (id: string): Promise<void> => {
        const { error } = await supabase.from('warehouses').delete().eq('id', id);
        if (error) throw error;
    },

    setProductCollections: async (sku: string, collectionIds: number[]): Promise<void> => {
        await supabase.from('product_collections').delete().eq('product_sku', sku);
        if (collectionIds.length > 0) {
            const inserts = collectionIds.map(cid => ({ product_sku: sku, collection_id: cid }));
            const { error } = await supabase.from('product_collections').insert(inserts);
            if (error) throw error;
        }
    }
};
