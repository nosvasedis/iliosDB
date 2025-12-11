import { createClient } from '@supabase/supabase-js';
import { 
  GlobalSettings, 
  Material, 
  Mold, 
  Product, 
  Collection, 
  Warehouse, 
  Order, 
  OrderStatus, 
  ProductionBatch, 
  Customer, 
  Supplier,
  ProductionStage
} from '../types';

export const SYSTEM_IDS = {
  CENTRAL: 'CENTRAL',
  SHOWROOM: 'SHOWROOM'
};

const SUPABASE_URL_KEY = 'VITE_SUPABASE_URL';
const SUPABASE_ANON_KEY = 'VITE_SUPABASE_ANON_KEY';
const WORKER_AUTH_KEY = 'VITE_WORKER_AUTH_KEY';
const GEMINI_KEY_STORAGE = 'VITE_GEMINI_API_KEY';

export const CLOUDFLARE_WORKER_URL = 'https://ilios-worker.aris-g-p.workers.dev';
export const R2_PUBLIC_URL = 'https://pub-07bab0635aee4da18c155fcc9dc3bb36.r2.dev';

const supabaseUrl = localStorage.getItem(SUPABASE_URL_KEY) || '';
const supabaseAnonKey = localStorage.getItem(SUPABASE_ANON_KEY) || '';

export const AUTH_KEY_SECRET = localStorage.getItem(WORKER_AUTH_KEY) || '';
export const GEMINI_API_KEY = localStorage.getItem(GEMINI_KEY_STORAGE) || '';

export const isConfigured = !!supabaseUrl && !!supabaseAnonKey;

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co', 
  supabaseAnonKey || 'placeholder'
);

export const saveConfiguration = (url: string, key: string, workerKey: string, geminiKey: string) => {
  localStorage.setItem(SUPABASE_URL_KEY, url);
  localStorage.setItem(SUPABASE_ANON_KEY, key);
  localStorage.setItem(WORKER_AUTH_KEY, workerKey);
  if (geminiKey) localStorage.setItem(GEMINI_KEY_STORAGE, geminiKey);
  window.location.reload();
};

export const uploadProductImage = async (file: Blob, sku: string): Promise<string | null> => {
    if (!AUTH_KEY_SECRET) throw new Error("Worker Key not configured");

    const filename = `${sku}-${Date.now()}.jpg`;
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

export const deleteProduct = async (sku: string, imageUrl: string | null): Promise<{ success: boolean, error?: string }> => {
    try {
        if (imageUrl && imageUrl.includes(R2_PUBLIC_URL)) {
             const parts = imageUrl.split('/');
             const filename = parts[parts.length - 1];
             await fetch(`${CLOUDFLARE_WORKER_URL}/${filename}`, {
                method: 'DELETE',
                headers: { 'Authorization': AUTH_KEY_SECRET }
             });
        }

        await supabase.from('product_variants').delete().eq('product_sku', sku);
        await supabase.from('recipes').delete().eq('parent_sku', sku);
        await supabase.from('product_molds').delete().eq('product_sku', sku);
        await supabase.from('product_collections').delete().eq('product_sku', sku);
        await supabase.from('product_stock').delete().eq('product_sku', sku);
        
        const { error } = await supabase.from('products').delete().eq('sku', sku);
        if (error) throw error;
        
        return { success: true };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
};

export const recordStockMovement = async (sku: string, quantity: number, type: string, variantSuffix?: string) => {
    const { error } = await supabase.from('stock_movements').insert({
        product_sku: sku,
        variant_suffix: variantSuffix || null,
        quantity: quantity,
        movement_type: type,
        created_at: new Date().toISOString()
    });
    if (error) console.error("Failed to record movement", error);
};

export const api = {
    getSettings: async (): Promise<GlobalSettings> => {
        const { data, error } = await supabase.from('global_settings').select('*').single();
        if (error) throw error;
        return data;
    },
    
    getMaterials: async (): Promise<Material[]> => {
        const { data, error } = await supabase.from('materials').select('*').order('name');
        if (error) throw error;
        return data;
    },

    getMolds: async (): Promise<Mold[]> => {
        const { data, error } = await supabase.from('molds').select('*').order('code');
        if (error) throw error;
        return data;
    },

    getProducts: async (): Promise<Product[]> => {
        const { data: products, error } = await supabase
            .from('products')
            .select(`
                *,
                variants:product_variants(*),
                molds:product_molds(mold_code, quantity),
                recipe:recipes(*),
                supplier_details:suppliers(*)
            `);
            
        if (error) throw error;
        
        return products.map((p: any) => ({
            ...p,
            molds: p.molds ? p.molds.map((m: any) => ({ code: m.mold_code, quantity: m.quantity })) : [],
            recipe: p.recipe ? p.recipe.map((r: any) => ({
                type: r.type,
                quantity: r.quantity,
                id: r.material_id,
                sku: r.component_sku
            })) : [],
            collections: p.collections || []
        }));
    },
    
    getCollections: async (): Promise<Collection[]> => {
        const { data, error } = await supabase.from('collections').select('*').order('name');
        if (error) throw error;
        return data;
    },
    
    setProductCollections: async (sku: string, collectionIds: number[]) => {
        await supabase.from('product_collections').delete().eq('product_sku', sku);
        if (collectionIds.length > 0) {
            await supabase.from('product_collections').insert(
                collectionIds.map(id => ({ product_sku: sku, collection_id: id }))
            );
        }
    },

    getWarehouses: async (): Promise<Warehouse[]> => {
        const { data, error } = await supabase.from('warehouses').select('*');
        if (error) throw error;
        return data;
    },
    
    saveWarehouse: async (w: Partial<Warehouse>) => {
        const { error } = await supabase.from('warehouses').insert(w);
        if (error) throw error;
    },
    
    updateWarehouse: async (id: string, w: Warehouse) => {
        const { error } = await supabase.from('warehouses').update(w).eq('id', id);
        if (error) throw error;
    },
    
    deleteWarehouse: async (id: string) => {
        const { error } = await supabase.from('warehouses').delete().eq('id', id);
        if (error) throw error;
    },

    getOrders: async (): Promise<Order[]> => {
        const { data, error } = await supabase.from('orders').select('*').order('created_at', { ascending: false });
        if (error) throw error;
        return data;
    },
    
    saveOrder: async (order: Order) => {
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

    updateOrder: async (order: Order) => {
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
    
    updateOrderStatus: async (orderId: string, status: OrderStatus) => {
        const { error } = await supabase.from('orders').update({ status }).eq('id', orderId);
        if (error) throw error;
    },
    
    deleteOrder: async (id: string) => {
        const { error } = await supabase.from('orders').delete().eq('id', id);
        if (error) throw error;
    },

    getCustomers: async (): Promise<Customer[]> => {
        const { data, error } = await supabase.from('customers').select('*').order('full_name');
        if (error) throw error;
        return data;
    },
    
    saveCustomer: async (c: Partial<Customer>): Promise<Customer | null> => {
        const { data, error } = await supabase.from('customers').insert(c).select().single();
        if (error) throw error;
        return data;
    },
    
    updateCustomer: async (id: string, c: Partial<Customer>) => {
        const { error } = await supabase.from('customers').update(c).eq('id', id);
        if (error) throw error;
    },
    
    deleteCustomer: async (id: string) => {
        const { error } = await supabase.from('customers').delete().eq('id', id);
        if (error) throw error;
    },

    getSuppliers: async (): Promise<Supplier[]> => {
        const { data, error } = await supabase.from('suppliers').select('*').order('name');
        if (error) throw error;
        return data;
    },
    
    saveSupplier: async (s: Partial<Supplier>) => {
        if (s.id) {
             const { error } = await supabase.from('suppliers').update(s).eq('id', s.id);
             if (error) throw error;
        } else {
             const { error } = await supabase.from('suppliers').insert(s);
             if (error) throw error;
        }
    },
    
    deleteSupplier: async (id: string) => {
        const { error } = await supabase.from('suppliers').delete().eq('id', id);
        if (error) throw error;
    },

    getProductionBatches: async (): Promise<ProductionBatch[]> => {
        const { data, error } = await supabase.from('production_batches').select('*').order('created_at', { ascending: false });
        if (error) throw error;
        return data;
    },
    
    updateBatchStage: async (id: string, stage: ProductionStage) => {
        const { error } = await supabase.from('production_batches').update({ current_stage: stage, updated_at: new Date().toISOString() }).eq('id', id);
        if (error) throw error;
    },
    
    splitBatch: async (originalId: string, newQtyForOriginal: number, newBatchData: any) => {
        const { error: e1 } = await supabase.from('production_batches').update({ quantity: newQtyForOriginal }).eq('id', originalId);
        if (e1) throw e1;
        const { error: e2 } = await supabase.from('production_batches').insert(newBatchData);
        if (e2) throw e2;
    }
};
