
import { Product, GlobalSettings, Material, PlatingType, Gender, ProductVariant, ProductionType, RecipeItem } from '../types';
import { STONE_CODES_MEN, STONE_CODES_WOMEN, FINISH_CODES } from '../constants';

/**
 * Formats a number to a string with a comma decimal separator.
 */
export const formatDecimal = (num: number | null | undefined, precision: number = 2): string => {
    if (num === null || num === undefined || isNaN(num)) {
        return (0).toFixed(precision).replace('.', ',');
    }
    return num.toFixed(precision).replace('.', ',');
};

/**
 * Formats a number as currency with a comma decimal separator and a euro sign.
 */
export const formatCurrency = (num: number | null | undefined): string => {
    return `${formatDecimal(num, 2)}€`;
};

/**
 * Rounds a price up to the nearest 10 cents (e.g., 11.47 -> 11.50).
 */
export const roundPrice = (price: number): number => {
  if (price === 0) return 0;
  return parseFloat((Math.ceil(price * 10) / 10).toFixed(2));
};

export const calculateTechnicianCost = (weight_g: number): number => {
  let cost = 0;
  // New Logic based on specific weight ranges
  if (weight_g <= 2.2) {
    cost = weight_g * 1.30;
  } else if (weight_g <= 4.2) { // 2.3 to 4.2
    cost = weight_g * 0.90;
  } else if (weight_g <= 8.2) { // 4.3 to 8.2
    cost = weight_g * 0.70;
  } else { // 8.3 and up
    cost = weight_g * 0.50;
  }
  return parseFloat(cost.toFixed(2));
};

/**
 * Calculates a suggested plating cost based on weight.
 * This is a heuristic used for suggesting a value when creating new products.
 */
export const calculatePlatingCost = (weight_g: number, plating_type: PlatingType): number => {
    // Replicating logic from other parts of the app (e.g., ProductDetails.tsx) for consistency.
    if (plating_type === PlatingType.GoldPlated || plating_type === PlatingType.Platinum) {
        return parseFloat((weight_g * 0.60).toFixed(2));
    }
    // Two-tone often depends on a secondary weight, which isn't available in the context
    // where this function is called. Returning 0 as a safe default.
    return 0;
};

// --- NEW SMART ANALYSIS INTERFACES ---
export interface SupplierAnalysis {
    intrinsicValue: number; // Metal + Materials (Raw Cost)
    theoreticalMakeCost: number; // If we made it in-house (Raw + Internal Labor)
    supplierPremium: number; // Supplier Price - Intrinsic Value
    premiumPercent: number; // Premium / Supplier Price
    verdict: 'Excellent' | 'Fair' | 'Expensive' | 'Overpriced';
    breakdown: {
        silverCost: number;
        materialCost: number;
        estLabor: number;
    }
}

/**
 * INTELLIGENT SUPPLIER AUDIT
 * Analyzes whether an imported product is priced fairly compared to manufacturing it in-house.
 */
export const analyzeSupplierValue = (
    weight: number,
    supplierCost: number,
    recipe: RecipeItem[],
    settings: GlobalSettings,
    allMaterials: Material[],
    allProducts: Product[] // For sub-components
): SupplierAnalysis => {
    // 1. Calculate Intrinsic Metal Value (No Loss added for raw value check, but usually supplier charges loss)
    // We add standard 10% loss to be fair to supplier's expected cost basis
    const lossMult = 1 + (settings.loss_percentage / 100);
    const silverCost = weight * settings.silver_price_gram * lossMult;

    // 2. Calculate Material Value (Stones/Chains)
    let materialCost = 0;
    recipe.forEach(item => {
        if (item.type === 'raw') {
            const mat = allMaterials.find(m => m.id === item.id);
            if (mat) materialCost += (mat.cost_per_unit * item.quantity);
        } else if (item.type === 'component') {
            const sub = allProducts.find(p => p.sku === item.sku);
            if (sub) {
                // If sub is bought, add its cost. If made, add its draft price
                materialCost += (sub.supplier_cost || sub.draft_price || 0) * item.quantity;
            }
        }
    });

    const intrinsicValue = silverCost + materialCost;

    // 3. Calculate Theoretical In-House Labor
    // We estimate what WE would pay to make it.
    const estCasting = weight * 0.15; // Standard rule
    const estTechnician = calculateTechnicianCost(weight);
    const estSetting = 0; // Hard to guess without knowing stone count, but assuming simple for now or included in markup
    const estPlating = weight * 0.60; // Avg plating cost

    const estimatedInternalLabor = estCasting + estTechnician + estSetting + estPlating;
    const theoreticalMakeCost = intrinsicValue + estimatedInternalLabor;

    // 4. Analysis
    const supplierPremium = supplierCost - intrinsicValue; // What we pay purely for their service/profit
    const premiumPercent = supplierCost > 0 ? (supplierPremium / supplierCost) * 100 : 0;
    
    // Verdict Logic
    let verdict: SupplierAnalysis['verdict'] = 'Fair';
    
    if (supplierCost <= theoreticalMakeCost * 0.9) {
        verdict = 'Excellent'; // Cheaper than making it ourselves
    } else if (supplierCost <= theoreticalMakeCost * 1.3) {
        verdict = 'Fair'; // Normal markup
    } else if (supplierCost <= theoreticalMakeCost * 1.8) {
        verdict = 'Expensive';
    } else {
        verdict = 'Overpriced';
    }

    return {
        intrinsicValue: roundPrice(intrinsicValue),
        theoreticalMakeCost: roundPrice(theoreticalMakeCost),
        supplierPremium: roundPrice(supplierPremium),
        premiumPercent: parseFloat(premiumPercent.toFixed(1)),
        verdict,
        breakdown: {
            silverCost,
            materialCost,
            estLabor: estimatedInternalLabor
        }
    };
};

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

  // --- IMPORTED PRODUCT LOGIC ---
  if (product.production_type === ProductionType.Imported) {
      // SMART LOGIC:
      // supplier_cost = Purchase Price (Metric 1 - This is our Cost)
      // product.labor fields = Supplier's Internal Breakdown (Metric 2 - Informational)
      // We run the Smart Analysis here to attach it to the breakdown for UI usage
      
      const purchasePrice = product.supplier_cost || 0;
      
      const analysis = analyzeSupplierValue(
          product.weight_g,
          purchasePrice,
          product.recipe,
          settings,
          allMaterials,
          allProducts
      );

      return {
          total: roundPrice(purchasePrice),
          breakdown: {
              supplier_cost: purchasePrice,
              silver: 0,
              materials: 0,
              labor: 0, // We do not count supplier's labor as our internal cost
              supplier_metrics: {
                  // These are informational only (User input)
                  reported_labor: product.labor.technician_cost || 0,
                  reported_setting: product.labor.stone_setting_cost || 0,
                  reported_plating: product.labor.plating_cost_x || 0
              },
              smart_analysis: analysis // The computed "Intelligence"
          }
      };
  }

  // --- IN-HOUSE PRODUCTION LOGIC ---

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
        // Base cost for the master product uses the material's default cost
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

  // 4. Labor Costs (Base Metal - No Plating)
  const labor = product.labor;
  
  // NEW LOGIC: Check for manual override. If false, calculate dynamically.
  const technicianCost = product.labor.technician_cost_manual_override
    ? (labor.technician_cost || 0)
    : calculateTechnicianCost(product.weight_g);

  // NEW DYNAMIC CASTING COST: (Total Weight * 0.15)
  const totalWeight = product.weight_g + (product.secondary_weight_g || 0);
  const castingCost = parseFloat((totalWeight * 0.15).toFixed(2));

  // Plating is now handled per-variant, not in the base cost.
  const laborTotal = 
    castingCost + 
    (labor.setter_cost || 0) + 
    technicianCost;

  const totalCost = silverBaseCost + materialsCost + laborTotal;

  return {
    total: roundPrice(totalCost),
    breakdown: {
      silver: parseFloat(silverBaseCost.toFixed(2)),
      materials: parseFloat(materialsCost.toFixed(2)),
      labor: parseFloat(laborTotal.toFixed(2)),
      details: {
        ...labor,
        casting_cost: castingCost,
        technician_cost: technicianCost // Return the correct breakdown detail
      }
    }
  };
};

/**
 * PARSES a suffix string (e.g. "PKR" or "PAX") and returns its isolated components.
 * This is crucial for separating Metal Finish from Stone Description.
 * Gender-aware: 'PAX' in Women means 'Agate', 'PAX' in Men means 'Patina' + 'Agate' (AX)
 */
export const getVariantComponents = (suffix: string, gender?: Gender) => {
    // 1. Select Dictionary based on Gender
    let relevantStones = {};
    if (gender === Gender.Men) relevantStones = STONE_CODES_MEN;
    else if (gender === Gender.Women) relevantStones = STONE_CODES_WOMEN;
    else relevantStones = { ...STONE_CODES_MEN, ...STONE_CODES_WOMEN };

    const stoneKeys = Object.keys(relevantStones).sort((a, b) => b.length - a.length);
    const finishKeys = Object.keys(FINISH_CODES).filter(k => k !== '').sort((a, b) => b.length - a.length);

    let detectedStoneCode = '';
    let detectedFinishCode = '';
    let remainder = suffix.toUpperCase();

    // Check for Stone Suffix first (usually at the end)
    for (const sCode of stoneKeys) {
        if (remainder.endsWith(sCode)) {
            detectedStoneCode = sCode;
            remainder = remainder.slice(0, -sCode.length);
            break; 
        }
    }

    // Check for Finish Suffix on the remainder
    for (const fCode of finishKeys) {
        if (remainder.endsWith(fCode)) {
            detectedFinishCode = fCode;
            remainder = remainder.slice(0, -fCode.length);
            break;
        }
    }
    
    const finishDesc = FINISH_CODES[detectedFinishCode] || FINISH_CODES[''] /* Lustre */;
    const stoneDesc = (relevantStones as any)[detectedStoneCode] || '';

    return {
        finish: {
            code: detectedFinishCode,
            name: finishDesc
        },
        stone: {
            code: detectedStoneCode,
            name: stoneDesc
        }
    };
};

/**
 * Estimates the cost of a variant based on the master product and the suffix.
 * NEW LOGIC: Adds specific plating costs based on the variant type (X, D).
 * ENHANCED LOGIC: Checks for Material Variant Override Prices (e.g. Lapis cost vs Generic Stone cost)
 */
export const estimateVariantCost = (
    masterProduct: Product, 
    variantSuffix: string,
    settings: GlobalSettings,
    allMaterials: Material[],
    allProducts: Product[],
): number => {
    // --- IMPORTED LOGIC ---
    if (masterProduct.production_type === ProductionType.Imported) {
        // For Imported products, the Variant Cost is essentially the Purchase Price.
        // We do NOT add the "Supplier Analysis" fields (labor/setting) as they are distinct entities.
        
        // NOTE: In the future, if we do LOCAL plating on an imported item, we could add logic here.
        // For now, based on strict requirements: Purchase Price is the Cost.
        return roundPrice(masterProduct.supplier_cost || 0);
    }

    // --- IN HOUSE LOGIC ---

    // 1. Silver Base Cost
    const lossMultiplier = 1 + (settings.loss_percentage / 100);
    const silverCost = masterProduct.weight_g * (settings.silver_price_gram * lossMultiplier);

    // 2. Materials Cost (With Overrides)
    let materialsCost = 0;
    
    // Deconstruct Suffix to find stone code (e.g. 'LA' from 'XLA')
    const { stone } = getVariantComponents(variantSuffix, masterProduct.gender);
    const targetStoneCode = stone.code; 

    masterProduct.recipe.forEach(item => {
        if (item.type === 'raw') {
            const mat = allMaterials.find(m => m.id === item.id);
            if (mat) {
                let unitCost = mat.cost_per_unit;
                // Check for overrides if we have a detected stone code
                if (targetStoneCode && mat.variant_prices && mat.variant_prices[targetStoneCode] !== undefined) {
                    unitCost = mat.variant_prices[targetStoneCode];
                }
                materialsCost += (unitCost * item.quantity);
            }
        } else if (item.type === 'component') {
            // Recurse for components
            const subProduct = allProducts.find(p => p.sku === item.sku);
            if (subProduct) {
                const subCost = calculateProductCost(subProduct, settings, allMaterials, allProducts);
                materialsCost += (subCost.total * item.quantity);
            }
        }
    });

    // 3. Labor Costs
    const labor = masterProduct.labor;
    const technicianCost = masterProduct.labor.technician_cost_manual_override
        ? (labor.technician_cost || 0)
        : calculateTechnicianCost(masterProduct.weight_g);
    
    // Casting
    const totalWeight = masterProduct.weight_g + (masterProduct.secondary_weight_g || 0);
    const castingCost = parseFloat((totalWeight * 0.15).toFixed(2));

    let laborTotal = castingCost + (labor.setter_cost || 0) + technicianCost;

    // 4. Plating Adjustments
    const { finish } = getVariantComponents(variantSuffix, masterProduct.gender);
    if (['X', 'H'].includes(finish.code)) { 
        laborTotal += masterProduct.labor.plating_cost_x || 0;
    } else if (finish.code === 'D') {
        laborTotal += masterProduct.labor.plating_cost_d || 0;
    }

    const totalCost = silverCost + materialsCost + laborTotal;
    return roundPrice(totalCost);
};

/**
 * PREVALENT VARIANT LOGIC
 * Determines which variant is the "Hero" or "Master" representation.
 * Priority: P > X > First Available
 */
export const getPrevalentVariant = (variants: ProductVariant[] | undefined): ProductVariant | null => {
    if (!variants || variants.length === 0) return null;

    // 1. Look for 'P' (Plain/Patina)
    const pVariant = variants.find(v => v.suffix.includes('P') && !v.suffix.includes('X') && !v.suffix.includes('D'));
    if (pVariant) return pVariant;

    // 2. Look for 'X' (Gold Plated) - Common Fallback
    const xVariant = variants.find(v => v.suffix.includes('X'));
    if (xVariant) return xVariant;

    // 3. Fallback to the first one
    return variants[0];
};

export const parseSku = (sku: string) => {
  const prefix = sku.substring(0, 2).toUpperCase();
  const triPrefix = sku.substring(0, 3).toUpperCase();
  const numPartStr = sku.replace(/[A-Z-]/g, '');
  const numPart = parseInt(numPartStr, 10);

  // STX Logic (Components)
  if (triPrefix === 'STX') {
    return { gender: Gender.Unisex, category: 'Εξάρτημα (STX)' };
  }
  
  // Advanced XR Logic
  if (prefix === 'XR' && !isNaN(numPart)) {
    if (numPart >= 1 && numPart <= 100) {
      return { gender: Gender.Men, category: 'Βραχιόλι Δερμάτινο' };
    }
    if (numPart >= 101 && numPart <= 199) {
      return { gender: Gender.Men, category: 'Βραχιόλι Μασίφ' };
    }
    if (numPart >= 200 && numPart <= 700) {
      return { gender: Gender.Unisex, category: 'Βραχιόλι με Πέτρες' };
    }
    if (numPart >= 1100 && numPart <= 1149) {
      return { gender: Gender.Unisex, category: 'Βραχιόλι Μακραμέ Θρησκευτικό' };
    }
    if (numPart >= 1150 && numPart <= 1199) {
        return { gender: Gender.Unisex, category: 'Βραχιόλι Μακραμέ Πολύχρωμο' };
    }
    if (numPart >= 1201 && numPart <= 1290) {
        return { gender: Gender.Unisex, category: 'Βραχιόλι Δερμάτινο Θρησκευτικό' };
    }
    // Fallback for other XR numbers if they don't fit the ranges
    return { gender: Gender.Men, category: 'Βραχιόλι' };
  }
  
  // Men's Prefixes
  // CR (Cross), RN (Ring), PN (Pendant)
  if (['CR', 'RN', 'PN'].includes(prefix)) {
    const map: Record<string, string> = {
        'CR': 'Σταυρός', 
        'RN': 'Δαχτυλίδι', 
        'PN': 'Μενταγιόν'
    };
    return { gender: Gender.Men, category: map[prefix] || 'Άλλο' };
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
    return { gender: Gender.Women, category: map[prefix] || 'Άλλο' };
  }

  // Ambiguous (ST) - User specified ST is Crosses for both. Classifying as Unisex Cross.
  if (prefix === 'ST') {
      return { gender: Gender.Unisex, category: 'Σταυρός' };
  }

  return { gender: Gender.Unisex, category: 'Γενικό' };
};

// Map of finish codes to Plating Types
const PLATING_MAP: Record<string, PlatingType> = {
  'P': PlatingType.None,
  'X': PlatingType.GoldPlated,
  'D': PlatingType.TwoTone,
  'H': PlatingType.Platinum,
  '': PlatingType.None
};

/**
 * Intelligent SKU Analyzer
 * Detects if the user typed a specific variant code (e.g. RN001P or XR2020BSU) and extracts the Master SKU.
 * Now supports both Finish codes AND Stone codes.
 */
export const analyzeSku = (rawSku: string, forcedGender?: Gender) => {
    const cleanSku = rawSku.trim().toUpperCase();
    
    // 1. Detect Gender from Prefix to guide suffix analysis (if not forced)
    let gender = forcedGender;
    if (!gender) {
        const meta = parseSku(cleanSku);
        gender = meta.gender as Gender;
    }

    // Use our robust component parser logic on the potential suffix area
    // This is tricky because we don't know where the SKU ends and Suffix begins.
    // Heuristic: Try to match from the end of the string.
    
    let relevantStones = {};
    if (gender === Gender.Men) relevantStones = STONE_CODES_MEN;
    else if (gender === Gender.Women) relevantStones = STONE_CODES_WOMEN;
    else relevantStones = { ...STONE_CODES_MEN, ...STONE_CODES_WOMEN };

    const stoneKeys = Object.keys(relevantStones).sort((a, b) => b.length - a.length);
    const finishKeys = Object.keys(FINISH_CODES).filter(k => k !== '').sort((a, b) => b.length - a.length);

    let detectedStoneCode = '';
    let detectedFinishCode = '';
    let remainder = cleanSku;

    // Check for Stone Suffix first
    for (const sCode of stoneKeys) {
        if (remainder.endsWith(sCode)) {
            detectedStoneCode = sCode;
            remainder = remainder.slice(0, -sCode.length);
            break; 
        }
    }

    // Check for Finish Suffix
    for (const fCode of finishKeys) {
        if (remainder.endsWith(fCode)) {
            detectedFinishCode = fCode;
            remainder = remainder.slice(0, -fCode.length);
            break;
        }
    }

    // Valid variant if we found either a stone or a finish code, and there is still a Master SKU left
    // Master SKU must be at least 2 chars (e.g. DA...)
    const isVariant = (detectedStoneCode !== '' || detectedFinishCode !== '') && remainder.length >= 2;

    if (isVariant) {
        const components = getVariantComponents(detectedFinishCode + detectedStoneCode, gender);
        const fullDesc = analyzeSuffix(detectedFinishCode + detectedStoneCode, gender);

        return {
            isVariant: true,
            masterSku: remainder,
            suffix: detectedFinishCode + detectedStoneCode,
            detectedPlating: PLATING_MAP[detectedFinishCode] || PlatingType.None,
            variantDescription: fullDesc || ''
        };
    }

    // Fallback: No recognized variant suffix
    return {
        isVariant: false,
        masterSku: cleanSku,
        suffix: '',
        detectedPlating: PlatingType.None,
        variantDescription: ''
    };
};

/**
 * Returns the full description string for a suffix.
 */
export const analyzeSuffix = (suffix: string, gender?: Gender): string | null => {
    const { finish, stone } = getVariantComponents(suffix, gender);
    
    // If nothing detected and suffix is not empty, it might be an unknown code
    if (!finish.code && !stone.code && suffix) return null;

    let fullDesc = '';
    
    // Only show finish if it's not default Lustre, OR if there's no stone (e.g. 'P' suffix needs 'Πατίνα')
    const showFinish = finish.code !== '' || !stone.code;
    
    if (showFinish && stone.name) fullDesc = `${finish.name} - ${stone.name}`;
    else if (showFinish) fullDesc = finish.name;
    else if (stone.name) fullDesc = stone.name;

    return fullDesc || null;
};
