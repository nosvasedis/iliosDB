
import { Product, GlobalSettings, Material, PlatingType, Gender } from '../types';
import { STONE_CODES_MEN, STONE_CODES_WOMEN, FINISH_CODES } from '../constants';

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
 * Calculates Plating/Epimetallosi Cost based on real-world logic.
 * Formula: Base Fee (0.50€) + (Weight * 0.75€)
 * Returns 0 if PlatingType is None.
 */
export const calculatePlatingCost = (weight_g: number, type: PlatingType): number => {
    if (type === PlatingType.None) return 0;
    
    const baseFee = 0.50;
    const costPerGram = 0.75;
    
    const total = baseFee + (weight_g * costPerGram);
    return parseFloat(total.toFixed(2));
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
  
  // NEW LOGIC: Check for manual override. If false, calculate dynamically.
  const technicianCost = product.labor.technician_cost_manual_override
    ? (labor.technician_cost || 0)
    : calculateTechnicianCost(product.weight_g);

  // Casting cost defaults to 0.20 if 0 or undefined, unless explicitly 0'd by user input in a context where 0 is valid. 
  // For calculation safety, we use the value on the object, but we assume the input sets it to 0.20 default.
  const castingCost = labor.casting_cost;

  const laborTotal = 
    (castingCost || 0) + 
    (labor.setter_cost || 0) + 
    technicianCost +
    (labor.plating_cost || 0);

  const totalCost = silverBaseCost + materialsCost + laborTotal;

  return {
    total: parseFloat(totalCost.toFixed(2)),
    breakdown: {
      silver: parseFloat(silverBaseCost.toFixed(2)),
      materials: parseFloat(materialsCost.toFixed(2)),
      labor: parseFloat(laborTotal.toFixed(2)),
      details: {
        ...labor,
        technician_cost: technicianCost // Return the correct breakdown detail
      }
    }
  };
};

/**
 * Estimates the cost of a variant based on the master product and the suffix.
 * Useful for smart-adding variants (e.g. adding plating cost for 'X').
 */
export const estimateVariantCost = (
    masterProduct: Product, 
    variantSuffix: string,
    settings: GlobalSettings,
    allMaterials: Material[],
    allProducts: Product[]
): number => {
    // 1. Calculate Base Cost first
    const baseCost = calculateProductCost(masterProduct, settings, allMaterials, allProducts).total;
    
    // 2. Analyze Suffix for Plating changes
    // If suffix contains X (Gold), D (TwoTone), H (Platinum) AND Master is None/Patina (P)
    // We should add Plating Labor.
    
    const needsPlating = variantSuffix.includes('X') || variantSuffix.includes('D') || variantSuffix.includes('H');
    const masterHasPlating = masterProduct.labor.plating_cost > 0;
    
    let estimatedCost = baseCost;

    if (needsPlating && !masterHasPlating) {
        // Use standard formula assuming Gold Plated as generic type for calculation
        const estimatedPlatingLabor = calculatePlatingCost(masterProduct.weight_g, PlatingType.GoldPlated);
        estimatedCost += estimatedPlatingLabor;
    }

    return parseFloat(estimatedCost.toFixed(2));
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
  
  // NEW: Advanced XR Logic
  if (prefix === 'XR' && !isNaN(numPart)) {
    if (numPart >= 1 && numPart <= 99) {
      return { gender: Gender.Men, category: 'Βραχιόλι Δερμάτινο' };
    }
    if (numPart >= 100 && numPart <= 199) {
      return { gender: Gender.Men, category: 'Βραχιόλι Μασίφ' };
    }
    if (numPart >= 200 && numPart <= 700) {
      return { gender: Gender.Unisex, category: 'Βραχιόλι Μακραμέ με Πέτρες' };
    }
    if (numPart >= 1101 && numPart < 1150) {
      return { gender: Gender.Unisex, category: 'Βραχιόλι Θρησκευτικό Μακραμέ' };
    }
    if (numPart >= 1150 && numPart < 1200) {
      return { gender: Gender.Unisex, category: 'Βραχιόλι Μακραμέ' };
    }
    if (numPart >= 1200 && numPart <= 1299) {
        return { gender: Gender.Unisex, category: 'Βραχιόλι Δερμάτινο' };
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
export const analyzeSku = (rawSku: string) => {
    const cleanSku = rawSku.trim().toUpperCase();
    
    // 1. Prepare Dictionaries
    // Merge men and women stones to check against all possibilities
    const allStones = { ...STONE_CODES_MEN, ...STONE_CODES_WOMEN };
    // Sort keys by length descending to match longest suffix first (e.g. matching 'PBSU' correctly)
    const stoneKeys = Object.keys(allStones).sort((a, b) => b.length - a.length);
    const finishKeys = Object.keys(FINISH_CODES).filter(k => k !== '').sort((a, b) => b.length - a.length);

    let detectedStoneCode = '';
    let detectedFinishCode = '';
    let remainder = cleanSku;

    // 2. Check for Stone Suffix first (usually at the very end)
    for (const sCode of stoneKeys) {
        if (remainder.endsWith(sCode)) {
            detectedStoneCode = sCode;
            remainder = remainder.slice(0, -sCode.length);
            break; 
        }
    }

    // 3. Check for Finish Suffix (on the remainder)
    // Example: XR2020PBSU -> Remainder became XR2020P -> Now detects P
    for (const fCode of finishKeys) {
        if (remainder.endsWith(fCode)) {
            detectedFinishCode = fCode;
            remainder = remainder.slice(0, -fCode.length);
            break;
        }
    }

    // 4. Construct Result
    // Valid variant if we found either a stone or a finish code, and there is still a Master SKU left
    const isVariant = (detectedStoneCode !== '' || detectedFinishCode !== '') && remainder.length >= 2;

    if (isVariant) {
        const finishDesc = detectedFinishCode ? FINISH_CODES[detectedFinishCode] : '';
        const stoneDesc = detectedStoneCode ? allStones[detectedStoneCode] : '';
        
        // Format description: "Finish - Stone" or just "Finish" or just "Stone"
        let fullDesc = '';
        if (finishDesc && stoneDesc) fullDesc = `${finishDesc} - ${stoneDesc}`;
        else if (finishDesc) fullDesc = finishDesc;
        else if (stoneDesc) fullDesc = stoneDesc;

        return {
            isVariant: true,
            masterSku: remainder,
            suffix: detectedFinishCode + detectedStoneCode,
            detectedPlating: PLATING_MAP[detectedFinishCode] || PlatingType.None,
            variantDescription: fullDesc
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
 * NEW: Intelligent Suffix-only Analyzer
 * Parses a suffix string (e.g. "PKR") and returns its description.
 */
export const analyzeSuffix = (suffix: string): string | null => {
    const allStones = { ...STONE_CODES_MEN, ...STONE_CODES_WOMEN };
    const stoneKeys = Object.keys(allStones).sort((a, b) => b.length - a.length);
    const finishKeys = Object.keys(FINISH_CODES).filter(k => k !== '').sort((a, b) => b.length - a.length);

    let detectedStoneCode = '';
    let detectedFinishCode = '';
    let remainder = suffix.toUpperCase();

    // Check for Stone Suffix first
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
    
    // If the entire suffix was consumed, we have a valid analysis
    if (remainder === '' && (detectedStoneCode || detectedFinishCode)) {
        const finishDesc = FINISH_CODES[detectedFinishCode] || '';
        const stoneDesc = allStones[detectedStoneCode] || '';
        
        let fullDesc = '';
        if (finishDesc && stoneDesc) fullDesc = `${finishDesc} - ${stoneDesc}`;
        else if (finishDesc) fullDesc = finishDesc;
        else if (stoneDesc) fullDesc = stoneDesc;

        return fullDesc;
    }
    
    return null;
};
