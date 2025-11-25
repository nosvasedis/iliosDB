import { Product, GlobalSettings, Material } from '../types';

export const calculateProductCost = (
  product: Product,
  settings: GlobalSettings,
  allMaterials: Material[],
  allProducts: Product[],
  depth: number = 0
): { total: number; breakdown: any } => {
  
  // Safety check for circular dependencies
  if (depth > 5) {
    console.warn(`Max recursion depth reached for product ${product.sku}`);
    return { total: 0, breakdown: {} };
  }

  // 1. Silver Cost
  // Formula: (SilverWeight * (LivePrice + Loss%))
  const lossMultiplier = 1 + (settings.loss_percentage / 100);
  const silverBaseCost = product.weight_g * (settings.silver_price_gram * lossMultiplier);

  // 2. Materials & Components Cost (Recursive)
  let materialsCost = 0;
  
  // We iterate through the 'recipe'
  product.recipe.forEach(item => {
    if (item.type === 'raw') {
      // It's a raw material (stone, cord, etc.)
      const mat = allMaterials.find(m => m.id === item.id);
      if (mat) {
        materialsCost += (mat.cost_per_unit * item.quantity);
      }
    } else if (item.type === 'component') {
      // It's a manufactured sub-component (e.g., STX-505)
      const subProduct = allProducts.find(p => p.sku === item.sku);
      if (subProduct) {
        // RECURSION: Calculate cost of the sub-product
        const subCost = calculateProductCost(subProduct, settings, allMaterials, allProducts, depth + 1);
        materialsCost += (subCost.total * item.quantity);
      }
    }
  });

  // 3. Labor Costs
  const labor = product.labor;
  const laborTotal = 
    (labor.casting_cost || 0) + 
    (labor.setter_cost || 0) + 
    (labor.technician_cost || 0) + 
    (labor.plating_cost || 0);

  const totalCost = silverBaseCost + materialsCost + laborTotal;

  return {
    total: parseFloat(totalCost.toFixed(2)),
    breakdown: {
      silver: parseFloat(silverBaseCost.toFixed(2)),
      materials: parseFloat(materialsCost.toFixed(2)),
      labor: parseFloat(laborTotal.toFixed(2)),
      details: labor
    }
  };
};

export const parseSku = (sku: string) => {
  const prefix = sku.substring(0, 2).toUpperCase();
  const triPrefix = sku.substring(0, 3).toUpperCase();

  // STX Logic (Components)
  if (triPrefix === 'STX') {
    return { gender: 'Unisex', category: 'Εξάρτημα (STX)' };
  }
  
  // Men's Prefixes
  // XR (Bracelets), CR (Cross), ST (Cross - also women's), RN (Ring), PN (Pendant)
  if (['XR', 'CR', 'RN', 'PN'].includes(prefix)) {
    const map: Record<string, string> = {
        'XR': 'Βραχιόλι', 
        'CR': 'Σταυρός', 
        'RN': 'Δαχτυλίδι', 
        'PN': 'Μενταγιόν'
    };
    return { gender: 'Men', category: map[prefix] || 'Άλλο' };
  }
  
  // Women's Prefixes
  // DA (Ring), SK (Earrings), MN (Pendant), BR (Bracelet), ST (Cross - also men's)
  if (['DA', 'SK', 'MN', 'BR'].includes(prefix)) {
     const map: Record<string, string> = {
        'DA': 'Δαχτυλίδι', 
        'SK': 'Σκουλαρίκια', 
        'MN': 'Μενταγιόν', 
        'BR': 'Βραχιόλι'
    };
    return { gender: 'Women', category: map[prefix] || 'Άλλο' };
  }

  // Ambiguous (ST) - User specified ST is Crosses for both. Classifying as Unisex Cross.
  if (prefix === 'ST') {
      return { gender: 'Unisex', category: 'Σταυρός' };
  }

  return { gender: 'Unisex', category: 'Γενικό' };
};