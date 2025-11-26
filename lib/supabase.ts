import { createClient } from '@supabase/supabase-js';
import { GlobalSettings, Material, Product, Mold, ProductVariant, RecipeItem, Gender, PlatingType, Collection } from '../types';
import { INITIAL_SETTINGS, MOCK_PRODUCTS, MOCK_MATERIALS } from '../constants';

// --- CONFIGURATION FOR R2 IMAGE STORAGE ---
const R2_PUBLIC_URL = 'https://pub-07bab0635aee4da18c155fcc9dc3bb36.r2.dev'; 
const CLOUDFLARE_WORKER_URL = 'https://ilios-image-handler.iliosdb.workers.dev';
const AUTH_KEY_SECRET = '2112Aris101!';
// --- END CONFIGURATION ---

// Credentials provided by user
const SUPABASE_URL = 'https://mtwkkzwveuskdcjkaiag.supabase.co';
const SUPABASE_KEY = 'sb_publishable_wCP1B81ATC-jjMx99mq14A_3J18p_dO';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

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
        const { data, error } = await supabase.from('global_settings').select('*').single();
        if (error || !data) return { 
            ...INITIAL_SETTINGS, 
            barcode_width_mm: 50, 
            barcode_height_mm: 30 
        };
        return {
            silver_price_gram: Number(data.silver_price_gram),
            loss_percentage: Number(data.loss_percentage),
            barcode_width_mm: Number(data.barcode_width_mm) || 50,
            barcode_height_mm: Number(data.barcode_height_mm) || 30
        };
    },

    getMaterials: async (): Promise<Material[]> => {
        const { data, error } = await supabase.from('materials').select('*');
        if (error || !data) return MOCK_MATERIALS;
        return data.map((m: any) => ({
             id: m.id,
             name: m.name,
             type: m.type,
             cost_per_unit: Number(m.cost_per_unit),
             unit: m.unit
        }));
    },

    getMolds: async (): Promise<Mold[]> => {
        const { data } = await supabase.from('molds').select('*');
        if (!data) return [];
        return data.map((m: any) => ({
            code: m.code,
            location: m.location,
            description: m.description
        }));
    },

    getCollections: async (): Promise<Collection[]> => {
        const { data, error } = await supabase.from('collections').select('*').order('name');
        if (error) {
            console.error("Error fetching collections", error);
            throw error;
        }
        return data || [];
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
        const { data: prodData, error } = await supabase.from('products').select('*');
        if (error || !prodData) return MOCK_PRODUCTS;

        const { data: varData } = await supabase.from('product_variants').select('*');
        const { data: recData } = await supabase.from('recipes').select('*');
        const { data: prodMoldsData } = await supabase.from('product_molds').select('*');
        const { data: prodCollData } = await supabase.from('product_collections').select('*');

        const assembledProducts: Product[] = prodData.map((p: any) => {
            const pVariants: ProductVariant[] = varData
              ?.filter((v: any) => v.product_sku === p.sku)
              .map((v: any) => ({
                suffix: v.suffix,
                description: v.description,
                stock_qty: v.stock_qty
              })) || [];

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
              stock_qty: p.stock_qty,
              sample_qty: p.sample_qty,
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
    }
};