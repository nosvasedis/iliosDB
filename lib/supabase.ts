
import { createClient } from '@supabase/supabase-js';
import { GlobalSettings, Material, Product, Mold, ProductVariant, RecipeItem, Gender, PlatingType } from '../types';
import { INITIAL_SETTINGS, MOCK_PRODUCTS, MOCK_MATERIALS } from '../constants';

// Credentials provided by user
const SUPABASE_URL = 'https://mtwkkzwveuskdcjkaiag.supabase.co';
const SUPABASE_KEY = 'sb_publishable_wCP1B81ATC-jjMx99mq14A_3J18p_dO';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

/**
 * Uploads a product image to Supabase Storage with a UNIQUE filename.
 * Naming Convention: {SKU}_{TIMESTAMP}_{RANDOM}.jpg
 */
export const uploadProductImage = async (file: Blob, sku: string): Promise<string | null> => {
    // Generate unique ID to prevent caching issues
    const uniqueId = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const fileName = `${sku.toUpperCase()}_${uniqueId}.jpg`;
    
    // 1. Upload
    const { data, error } = await supabase.storage
        .from('product-images')
        .upload(fileName, file, {
            cacheControl: '31536000', // Cache forever, we use unique names now
            contentType: 'image/jpeg'
        });

    if (error) {
        console.error("Supabase Upload Error:", error);
        return null;
    }

    // 2. Get Public URL
    const { data: publicData } = supabase.storage
        .from('product-images')
        .getPublicUrl(fileName);

    return publicData.publicUrl;
};

/**
 * Records a stock movement (Audit Log)
 */
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
        if (error || !data) return INITIAL_SETTINGS;
        return {
            silver_price_gram: Number(data.silver_price_gram),
            loss_percentage: Number(data.loss_percentage)
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

    getProducts: async (): Promise<Product[]> => {
        const { data: prodData, error } = await supabase.from('products').select('*');
        
        if (error || !prodData) return MOCK_PRODUCTS;

        // Fetch relations in parallel for performance (simplified for this example)
        const { data: varData } = await supabase.from('product_variants').select('*');
        const { data: recData } = await supabase.from('recipes').select('*');
        const { data: prodMoldsData } = await supabase.from('product_molds').select('*');

        const assembledProducts: Product[] = prodData.map((p: any) => {
            // Find Variants
            const pVariants: ProductVariant[] = varData
              ?.filter((v: any) => v.product_sku === p.sku)
              .map((v: any) => ({
                suffix: v.suffix,
                description: v.description,
                stock_qty: v.stock_qty
              })) || [];

            // Find Recipe
            const pRecipeRaw = recData?.filter((r: any) => r.parent_sku === p.sku) || [];
            const pRecipe: RecipeItem[] = pRecipeRaw.map((r: any) => {
               if (r.type === 'raw') {
                 return { type: 'raw', id: r.material_id, quantity: Number(r.quantity) };
               } else {
                 return { type: 'component', sku: r.component_sku, quantity: Number(r.quantity) };
               }
            });
            
            // Find Molds
            const pMolds = prodMoldsData
                ?.filter((pm: any) => pm.product_sku === p.sku)
                .map((pm: any) => pm.mold_code) || [];

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
