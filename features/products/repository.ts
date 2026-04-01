import { api, supabase, uploadProductImage, deleteProduct as deleteProductApi } from '../../lib/supabase';
import { Mold, ProductMold, ProductVariant, ProductionType, RecipeItem } from '../../types';

export const productsRepository = {
  getProducts: () => api.getProducts(),
  saveProduct: (product: Record<string, unknown>) => api.saveProduct(product),
  saveProductVariant: (input: {
    product_sku: string;
    suffix: string;
    description?: string;
    stock_qty?: number;
    active_price?: number | null;
    selling_price?: number | null;
  }) => api.saveProductVariant(input),
  deleteProductVariants: (sku: string) => api.deleteProductVariants(sku),
  deleteProductRecipes: (sku: string) => api.deleteProductRecipes(sku),
  deleteProductMolds: (sku: string) => api.deleteProductMolds(sku),
  insertRecipe: (input: {
    parent_sku: string;
    type: 'raw' | 'component';
    material_id?: string | null;
    component_sku?: string | null;
    quantity: number;
  }) => api.insertRecipe(input),
  insertProductMold: (input: { product_sku: string; mold_code: string; quantity: number }) =>
    api.insertProductMold(input),
  renameProduct: (oldSku: string, newSku: string) => api.renameProduct(oldSku, newSku),
  deleteProduct: (sku: string, imageUrl?: string | null) => deleteProductApi(sku, imageUrl),
};

export interface ProductStockSnapshot {
  stock_qty: number;
  sample_qty: number;
  image_url: string | null;
}

export async function getExistingProductSnapshot(sku: string): Promise<ProductStockSnapshot | null> {
  try {
    const { data } = await supabase
      .from('products')
      .select('stock_qty, sample_qty, image_url')
      .eq('sku', sku)
      .single();

    if (!data) return null;

    return {
      stock_qty: data.stock_qty || 0,
      sample_qty: data.sample_qty || 0,
      image_url: data.image_url || null,
    };
  } catch {
    return null;
  }
}

export async function uploadProductImageForSku(file: Blob, sku: string): Promise<string | null> {
  return uploadProductImage(file, sku);
}

export async function createMoldEntry(mold: Mold): Promise<void> {
  const { error } = await supabase.from('molds').insert(mold);
  if (error) throw error;
}

export interface SaveProductGraphInput {
  finalMasterSku: string;
  productData: Record<string, unknown>;
  finalVariants: ProductVariant[];
  productionType: ProductionType;
  recipe: RecipeItem[];
  selectedMolds: ProductMold[];
  isSTX: boolean;
}

export async function saveProductGraph(input: SaveProductGraphInput): Promise<{ anyPartQueued: boolean }> {
  const { queued: prodQueued } = await productsRepository.saveProduct(input.productData);
  let anyPartQueued = prodQueued;

  if (input.finalVariants.length > 0) {
    for (const variant of input.finalVariants) {
      const { queued } = await productsRepository.saveProductVariant({
        product_sku: input.finalMasterSku,
        suffix: variant.suffix,
        description: variant.description,
        stock_qty: 0,
        active_price: variant.active_price,
        selling_price: input.isSTX ? 0 : variant.selling_price,
      });
      if (queued) anyPartQueued = true;
    }
  }

  await productsRepository.deleteProductRecipes(input.finalMasterSku);
  if (input.productionType === ProductionType.InHouse && input.recipe.length > 0) {
    for (const recipeItem of input.recipe) {
      const { queued } = await productsRepository.insertRecipe({
        parent_sku: input.finalMasterSku,
        type: recipeItem.type,
        material_id: recipeItem.type === 'raw' ? recipeItem.id : null,
        component_sku: recipeItem.type === 'component' ? recipeItem.sku : null,
        quantity: recipeItem.quantity,
      });
      if (queued) anyPartQueued = true;
    }
  }

  await productsRepository.deleteProductMolds(input.finalMasterSku);
  if (input.productionType === ProductionType.InHouse && input.selectedMolds.length > 0) {
    for (const mold of input.selectedMolds) {
      const { queued } = await productsRepository.insertProductMold({
        product_sku: input.finalMasterSku,
        mold_code: mold.code,
        quantity: mold.quantity,
      });
      if (queued) anyPartQueued = true;
    }
  }

  return { anyPartQueued };
}
