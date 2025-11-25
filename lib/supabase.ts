
import { createClient } from '@supabase/supabase-js';

// Credentials provided by user
const SUPABASE_URL = 'https://mtwkkzwveuskdcjkaiag.supabase.co';
const SUPABASE_KEY = 'sb_publishable_wCP1B81ATC-jjMx99mq14A_3J18p_dO';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

/**
 * Uploads a product image to Supabase Storage.
 * Naming Convention: {SKU}.jpg (Always Uppercase SKU)
 */
export const uploadProductImage = async (file: Blob, sku: string): Promise<string | null> => {
    const fileName = `${sku.toUpperCase()}.jpg`;
    
    // 1. Upload (Upsert = Overwrite if exists)
    const { data, error } = await supabase.storage
        .from('product-images')
        .upload(fileName, file, {
            cacheControl: '3600',
            upsert: true,
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

    // Add a timestamp to bust browser cache if we just overwrote it
    return `${publicData.publicUrl}?t=${Date.now()}`;
};
