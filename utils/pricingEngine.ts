import { Product, GlobalSettings, Material, PlatingType } from '../types';

export const calculateProductCost = (
  product: Product,
  settings: GlobalSettings,
  allMaterials: Material[],
  allProducts: Product[],
  depth: number = 0,
  visitedSkus: Set<string> = new Set()
): { total: number; breakdown: any } => {
  
  // 1. Cycle Detection
  if (visitedSkus.has(product.sku)) {
    console.error(`Circular dependency detected for product ${product.sku}`);
    return { total: 0, breakdown: { error: 'Circular Dependency' } };
  }
  
  // Create a new set for the next recursive step
  const newVisited = new Set(visitedSkus);
  newVisited.add(product.sku);

  // Safety check for recursion depth
  if (depth > 10) {
    console.warn(`Max recursion depth reached for product ${product.sku}`);
    return { total: 0, breakdown: {} };
  }

  // 2. Silver Cost
  // Formula: (SilverWeight * (LivePrice + Loss%))
  const lossMultiplier = 1 + (settings.loss_percentage / 100);
  const silverBaseCost = product.weight_g * (settings.silver_price_gram * lossMultiplier);

  // 3. Materials & Components Cost (Recursive)
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
        const subCost = calculateProductCost(subProduct, settings, allMaterials, allProducts, depth + 1, newVisited);
        materialsCost += (subCost.total * item.quantity);
      }
    }
  });

  // 4. Labor Costs
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
  // XR (Bracelets), CR (Cross), RN (Ring), PN (Pendant)
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
  // DA (Ring), SK (Earrings), MN (Pendant), BR (Bracelet)
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

/**
 * Intelligent SKU Analyzer
 * Detects if the user typed a specific variant code (e.g. RN001P) and extracts the Master SKU (RN001).
 */
export const analyzeSku = (rawSku: string) => {
    const cleanSku = rawSku.trim().toUpperCase();
    
    // Definitions of Suffixes
    const SUFFIX_RULES: Record<string, { plating: PlatingType, description: string }> = {
        'P': { plating: PlatingType.None, description: 'Πατίνα' },
        'X': { plating: PlatingType.GoldPlated, description: 'Επίχρυσο' },
        'D': { plating: PlatingType.TwoTone, description: 'Δίχρωμο' },
        'R': { plating: PlatingType.RoseGold, description: 'Ροζ Χρυσό' },
        'L': { plating: PlatingType.Platinum, description: 'Πλατινωμένο' } // L for Platinum/Lefko
    };

    // Check if SKU ends with any known suffix
    // We check purely for single char suffixes at the end for now based on the prompt requirements
    const lastChar = cleanSku.slice(-1);
    
    // Ensure SKU is long enough (e.g. at least 3 chars + suffix) to avoid false positives on short codes
    if (cleanSku.length > 4 && SUFFIX_RULES[lastChar]) {
        const masterSku = cleanSku.slice(0, -1);
        const rule = SUFFIX_RULES[lastChar];
        
        return {
            isVariant: true,
            masterSku: masterSku,
            suffix: lastChar,
            detectedPlating: rule.plating,
            variantDescription: rule.description
        };
    }

    return {
        isVariant: false,
        masterSku: cleanSku,
        suffix: '',
        detectedPlating: PlatingType.None,
        variantDescription: ''
    };
};