import { Product, GlobalSettings, Material, PlatingType, Gender, ProductVariant, ProductionType, RecipeItem, LaborCost } from '../types';
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
 * Rounds a price to the nearest 10 cents.
 * Standard rounding: 0-4 rounds down, 5-9 rounds up.
 * e.g., 21.51 -> 21.50, 21.55 -> 21.60
 */
export const roundPrice = (price: number): number => {
  if (price === 0) return 0;
  // Use Math.round for standard rounding logic
  return parseFloat((Math.round(price * 10) / 10).toFixed(2));
};

export const calculateTechnicianCost = (weight_g: number): number => {
  let cost = 0;
  if (weight_g <= 0) return 0;
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
  return cost;
};

/**
 * Calculates a suggested plating cost based on weight.
 */
export const calculatePlatingCost = (weight_g: number, plating_type: PlatingType): number => {
    if (plating_type === PlatingType.GoldPlated || plating_type === PlatingType.Platinum) {
        return weight_g * 0.60;
    }
    return 0;
};

// --- NEW SMART ANALYSIS INTERFACES ---
export interface SupplierAnalysis {
    intrinsicValue: number; // Raw Metal + Materials
    theoreticalMakeCost: number; // Our Internal Cost to Make
    supplierPremium: number; // Total Gap
    premiumPercent: number;
    verdict: 'Excellent' | 'Fair' | 'Expensive' | 'Overpriced';
    effectiveSilverPrice: number;
    hasHiddenMarkup: boolean;
    laborEfficiency: 'Cheaper' | 'Similar' | 'More Expensive';
    platingEfficiency: 'Cheaper' | 'Similar' | 'More Expensive';
    breakdown: {
        silverCost: number;
        materialCost: number;
        estLabor: number;
        supplierReportedTotalLabor: number;
    }
}

export const analyzeSupplierValue = (
    weight: number,
    supplierCost: number,
    recipe: RecipeItem[],
    settings: GlobalSettings,
    allMaterials: Material[],
    allProducts: Product[],
    reportedLabor: LaborCost
): SupplierAnalysis => {
    // 1. Calculate Intrinsic Metal Value
    const silverCost = weight * settings.silver_price_gram;

    // 2. Calculate Material Value
    let materialCost = 0;
    recipe.forEach(item => {
        if (item.type === 'raw') {
            const mat = allMaterials.find(m => m.id === item.id);
            if (mat) materialCost += (mat.cost_per_unit * item.quantity);
        } else if (item.type === 'component') {
            const sub = allProducts.find(p => p.sku === item.sku);
            if (sub) {
                materialCost += (sub.supplier_cost || sub.draft_price || 0) * item.quantity;
            }
        }
    });

    const intrinsicValue = silverCost + materialCost;

    // 3. Calculate Theoretical In-House Labor
    const estCasting = weight * 0.15;
    const estTechnician = calculateTechnicianCost(weight);
    const estPlating = (reportedLabor.plating_cost_x > 0 || reportedLabor.plating_cost_d > 0) 
        ? calculatePlatingCost(weight, PlatingType.GoldPlated) 
        : 0;

    const estimatedInternalLabor = estCasting + estTechnician + estPlating;
    const theoreticalMakeCost = intrinsicValue + estimatedInternalLabor;

    // 4. Supplier Reported Analysis
    const reportedLaborTotal = (reportedLabor.technician_cost || 0) + 
                               (reportedLabor.stone_setting_cost || 0);
    const reportedPlatingTotal = (reportedLabor.plating_cost_x || 0) + 
                                 (reportedLabor.plating_cost_d || 0);
    const reportedTotalExtras = reportedLaborTotal + reportedPlatingTotal;

    // 5. Forensics
    let laborEfficiency: SupplierAnalysis['laborEfficiency'] = 'Similar';
    const laborDiff = reportedLaborTotal - (estCasting + estTechnician);
    if (reportedLaborTotal > 0) {
        if (laborDiff < -0.5) laborEfficiency = 'Cheaper';
        else if (laborDiff > 1.0) laborEfficiency = 'More Expensive';
    }

    let platingEfficiency: SupplierAnalysis['platingEfficiency'] = 'Similar';
    const platingDiff = reportedPlatingTotal - estPlating;
    if (reportedPlatingTotal > 0) {
        if (platingDiff < -0.2) platingEfficiency = 'Cheaper';
        else if (platingDiff > 0.5) platingEfficiency = 'More Expensive';
    }

    let effectiveSilverPrice = 0;
    let hasHiddenMarkup = false;

    if (reportedTotalExtras > 0 && weight > 0) {
        const residualForMetal = supplierCost - materialCost - reportedTotalExtras;
        effectiveSilverPrice = residualForMetal / weight;
        if (effectiveSilverPrice > (settings.silver_price_gram * 1.15)) {
            hasHiddenMarkup = true;
        }
    }

    const supplierPremium = supplierCost - intrinsicValue;
    const premiumPercent = supplierCost > 0 ? (supplierPremium / supplierCost) * 100 : 0;
    
    let verdict: SupplierAnalysis['verdict'] = 'Fair';
    if (supplierCost <= theoreticalMakeCost * 0.95) verdict = 'Excellent'; 
    else if (supplierCost <= theoreticalMakeCost * 1.3) verdict = 'Fair'; 
    else if (supplierCost <= theoreticalMakeCost * 1.8) verdict = 'Expensive';
    else verdict = 'Overpriced';

    return {
        intrinsicValue: roundPrice(intrinsicValue),
        theoreticalMakeCost: roundPrice(theoreticalMakeCost),
        supplierPremium: roundPrice(supplierPremium),
        premiumPercent: parseFloat(premiumPercent.toFixed(1)),
        verdict,
        effectiveSilverPrice: parseFloat(effectiveSilverPrice.toFixed(3)),
        hasHiddenMarkup,
        laborEfficiency,
        platingEfficiency,
        breakdown: {
            silverCost,
            materialCost,
            estLabor: estimatedInternalLabor,
            supplierReportedTotalLabor: reportedTotalExtras
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
  
  if (visitedSkus.has(product.sku)) {
    return { total: 0, breakdown: { error: 'Circular Dependency' } };
  }
  
  const newVisited = new Set(visitedSkus);
  newVisited.add(product.sku);

  if (depth > 10) return { total: 0, breakdown: {} };

  // --- IMPORTED PRODUCT LOGIC ---
  if (product.production_type === ProductionType.Imported) {
      const silverCost = product.weight_g * settings.silver_price_gram;
      const technicianCost = product.weight_g * (product.labor.technician_cost || 0); 
      const platingCost = product.weight_g * (product.labor.plating_cost_x || 0);
      const stoneCost = product.labor.stone_setting_cost || 0;
      
      const totalCost = silverCost + technicianCost + platingCost + stoneCost;

      return {
          total: roundPrice(totalCost),
          breakdown: {
              silver: silverCost,
              labor: technicianCost + platingCost,
              materials: stoneCost,
              details: {
                  technician_cost: technicianCost,
                  plating_cost_x: platingCost,
                  stone_setting_cost: stoneCost,
              }
          }
      };
  }

  // --- IN-HOUSE PRODUCTION LOGIC ---
  const baseWeight = product.weight_g;
  const secondaryWeight = product.secondary_weight_g || 0;
  const totalWeight = baseWeight + secondaryWeight;

  // Explicitly calculate silver cost components separately as requested
  const silverBaseCost = baseWeight * settings.silver_price_gram;
  const silverSecondaryCost = secondaryWeight * settings.silver_price_gram;
  const totalSilverCost = silverBaseCost + silverSecondaryCost;

  let materialsCost = 0;
  
  product.recipe.forEach(item => {
    if (item.type === 'raw') {
      const mat = allMaterials.find(m => m.id === item.id);
      if (mat) materialsCost += (mat.cost_per_unit * item.quantity);
    } else if (item.type === 'component') {
      const subProduct = allProducts.find(p => p.sku === item.sku);
      if (subProduct) {
        const subCost = calculateProductCost(subProduct, settings, allMaterials, allProducts, depth + 1, newVisited);
        materialsCost += (subCost.total * item.quantity);
      }
    }
  });

  const labor: Partial<LaborCost> = product.labor || {};
  
  let technicianCost;
  if (labor.technician_cost_manual_override) {
      technicianCost = labor.technician_cost || 0;
  } else if (product.is_component) {
      technicianCost = product.weight_g * 0.50;
  } else {
      technicianCost = calculateTechnicianCost(totalWeight);
  }
  
  let castingCost;
  if (labor.casting_cost_manual_override) {
      castingCost = labor.casting_cost || 0;
  } else if (product.is_component) {
      castingCost = 0;
  } else {
      // Explicitly calculate casting cost components separately
      const castBase = baseWeight * 0.15;
      const castSecondary = secondaryWeight * 0.15;
      castingCost = castBase + castSecondary;
  }

  const laborTotal = castingCost + (labor.setter_cost || 0) + technicianCost + (labor.subcontract_cost || 0);
  const totalCost = totalSilverCost + materialsCost + laborTotal;

  return {
    total: roundPrice(totalCost),
    breakdown: {
      silver: totalSilverCost, // Return unrounded precise value
      materials: materialsCost,
      labor: laborTotal,
      details: {
        ...(product.labor || {}),
        casting_cost: castingCost,
        setter_cost: labor.setter_cost || 0,
        technician_cost: technicianCost,
        subcontract_cost: labor.subcontract_cost || 0
      }
    }
  };
};

export const transliterateForBarcode = (input: string): string => {
    const greekToLatinMap: Record<string, string> = {
        'Α': 'A', 'Β': 'V', 'Γ': 'G', 'Δ': 'D', 'Ε': 'E', 'Ζ': 'Z', 'Η': 'I', 'Θ': 'TH',
        'Ι': 'I', 'Κ': 'K', 'Λ': 'L', 'Μ': 'M', 'Ν': 'N', 'Ξ': 'X', 'Ο': 'O', 'Π': 'P',
        'Ρ': 'R', 'Σ': 'S', 'Τ': 'T', 'Υ': 'Y', 'Φ': 'F', 'Χ': 'CH', 'Ψ': 'PS', 'Ω': 'O',
        'α': 'a', 'β': 'v', 'γ': 'g', 'δ': 'd', 'ε': 'e', 'ζ': 'z', 'η': 'i', 'θ': 'th',
        'ι': 'i', 'κ': 'k', 'λ': 'l', 'μ': 'm', 'ν': 'n', 'ξ': 'x', 'ο': 'o', 'π': 'p',
        'ρ': 'r', 'σ': 's', 'τ': 't', 'υ': 'y', 'φ': 'f', 'χ': 'ch', 'ψ': 'ps', 'ω': 'o',
        'ς': 's'
    };
    return input.split('').map(char => greekToLatinMap[char] || char).join('');
};

export const getVariantComponents = (suffix: string, gender?: Gender) => {
    let relevantStones = {};
    if (gender === Gender.Men) relevantStones = STONE_CODES_MEN;
    else if (gender === Gender.Women) relevantStones = STONE_CODES_WOMEN;
    else relevantStones = { ...STONE_CODES_MEN, ...STONE_CODES_WOMEN };

    const stoneKeys = Object.keys(relevantStones).sort((a, b) => b.length - a.length);
    const finishKeys = Object.keys(FINISH_CODES).filter(k => k !== '').sort((a, b) => b.length - a.length);

    let detectedStoneCode = '';
    let detectedFinishCode = '';
    let remainder = suffix.toUpperCase();

    for (const sCode of stoneKeys) {
        if (remainder.endsWith(sCode)) {
            detectedStoneCode = sCode;
            remainder = remainder.slice(0, -sCode.length);
            break; 
        }
    }

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
        finish: { code: detectedFinishCode, name: finishDesc },
        stone: { code: detectedStoneCode, name: stoneDesc }
    };
};

export const estimateVariantCost = (
    masterProduct: Product, 
    variantSuffix: string,
    settings: GlobalSettings,
    allMaterials: Material[],
    allProducts: Product[],
): { total: number; breakdown: any } => {
    if (masterProduct.production_type === ProductionType.Imported) {
        const { total, breakdown } = calculateProductCost(masterProduct, settings, allMaterials, allProducts);
        return { total, breakdown };
    }

    const baseWeight = masterProduct.weight_g;
    const secondaryWeight = masterProduct.secondary_weight_g || 0;
    const totalWeight = baseWeight + secondaryWeight;

    // Explicit Calculation Logic for Silver
    const silverBaseCost = baseWeight * settings.silver_price_gram;
    const silverSecondaryCost = secondaryWeight * settings.silver_price_gram;
    const totalSilverCost = silverBaseCost + silverSecondaryCost;

    let materialsCost = 0;
    const { stone } = getVariantComponents(variantSuffix, masterProduct.gender);
    const targetStoneCode = stone.code; 

    masterProduct.recipe.forEach(item => {
        if (item.type === 'raw') {
            const mat = allMaterials.find(m => m.id === item.id);
            if (mat) {
                let unitCost = mat.cost_per_unit;
                if (targetStoneCode && mat.variant_prices && mat.variant_prices[targetStoneCode] !== undefined) {
                    unitCost = mat.variant_prices[targetStoneCode];
                }
                materialsCost += (unitCost * item.quantity);
            }
        } else if (item.type === 'component') {
            const subProduct = allProducts.find(p => p.sku === item.sku);
            if (subProduct) {
                const subCost = calculateProductCost(subProduct, settings, allMaterials, allProducts);
                materialsCost += (subCost.total * item.quantity);
            }
        }
    });

    const labor: Partial<LaborCost> = masterProduct.labor || {};
    const { finish } = getVariantComponents(variantSuffix, masterProduct.gender);

    let technicianCost;
    const technicianCalculation: any = { type: 'simple', base: 0, secondary: 0, totalWeight: 0 };

    if (labor.technician_cost_manual_override) {
        technicianCost = labor.technician_cost || 0;
        technicianCalculation.type = 'override';
    } else {
        if (finish.code === 'D') {
            technicianCalculation.type = 'split';
            technicianCalculation.base = calculateTechnicianCost(masterProduct.weight_g);
            technicianCalculation.secondary = calculateTechnicianCost(masterProduct.secondary_weight_g || 0);
            technicianCost = technicianCalculation.base + technicianCalculation.secondary;
        } else {
            technicianCalculation.type = 'total';
            technicianCalculation.totalWeight = totalWeight;
            technicianCost = calculateTechnicianCost(totalWeight);
        }
    }

    // Explicit Calculation Logic for Casting
    const castBase = baseWeight * 0.15;
    const castSecondary = secondaryWeight * 0.15;
    const castingCost = castBase + castSecondary;
    
    let platingCost = 0;
    if (finish.code === 'D') {
        platingCost = labor.plating_cost_d || 0;
    } else if (['X', 'H'].includes(finish.code)) {
        platingCost = labor.plating_cost_x || 0;
    }

    const laborTotal = castingCost + (labor.setter_cost || 0) + technicianCost + (labor.subcontract_cost || 0) + platingCost;
    const totalCost = totalSilverCost + materialsCost + laborTotal;
    
    return {
        total: roundPrice(totalCost), // Final rounding happens here
        breakdown: {
            silver: totalSilverCost, // Precise value
            materials: materialsCost,
            labor: laborTotal,
            details: {
                casting_cost: castingCost,
                setter_cost: labor.setter_cost || 0,
                technician_cost: technicianCost,
                subcontract_cost: labor.subcontract_cost || 0,
                plating_cost: platingCost,
                technician_calculation: technicianCalculation,
                total_weight: totalWeight
            }
        }
    };
};

export const getPrevalentVariant = (variants: ProductVariant[] | undefined): ProductVariant | null => {
    if (!variants || variants.length === 0) return null;
    const pVariant = variants.find(v => v.suffix.includes('P') && !v.suffix.includes('X') && !v.suffix.includes('D'));
    if (pVariant) return pVariant;
    const xVariant = variants.find(v => v.suffix.includes('X'));
    if (xVariant) return xVariant;
    return variants[0];
};

export const parseSku = (sku: string) => {
  const prefix = sku.substring(0, 2).toUpperCase();
  const triPrefix = sku.substring(0, 3).toUpperCase();
  const numPartStr = sku.replace(/[A-Z-]/g, '');
  const numPart = parseInt(numPartStr, 10);

  if (triPrefix === 'STX') return { gender: Gender.Unisex, category: 'Εξάρτημα (STX)' };
  
  if (prefix === 'XR' && !isNaN(numPart)) {
    if (numPart >= 1 && numPart <= 100) return { gender: Gender.Men, category: 'Βραχιόλι Δερμάτινο' };
    if (numPart >= 101 && numPart <= 199) return { gender: Gender.Men, category: 'Βραχιόλι Μασίφ' };
    if (numPart >= 200 && numPart <= 700) return { gender: Gender.Unisex, category: 'Βραχιόλι με Πέτρες' };
    if (numPart >= 1100 && numPart <= 1149) return { gender: Gender.Unisex, category: 'Βραχιόλι Μακραμέ Θρησκευτικό' };
    if (numPart >= 1150 && numPart <= 1199) return { gender: Gender.Unisex, category: 'Βραχιόλι Μακραμέ Πολύχρωμο' };
    if (numPart >= 1201 && numPart <= 1290) return { gender: Gender.Unisex, category: 'Βραχιόλι Δερμάτινο Θρησκευτικό' };
    return { gender: Gender.Men, category: 'Βραχιόλι' };
  }
  
  if (['CR', 'RN', 'PN'].includes(prefix)) {
    const map: Record<string, string> = { 'CR': 'Σταυρός', 'RN': 'Δαχτυλίδι', 'PN': 'Μενταγιόν' };
    return { gender: Gender.Men, category: map[prefix] || 'Άλλο' };
  }
  
  if (['DA', 'SK', 'MN', 'BR'].includes(prefix)) {
     const map: Record<string, string> = { 'DA': 'Δαχτυλίδι', 'SK': 'Σκουλαρίκια', 'MN': 'Μενταγιόν', 'BR': 'Βραχιόλι' };
    return { gender: Gender.Women, category: map[prefix] || 'Άλλο' };
  }

  if (prefix === 'ST') return { gender: Gender.Unisex, category: 'Σταυρός' };

  return { gender: Gender.Unisex, category: 'Γενικό' };
};

const PLATING_MAP: Record<string, PlatingType> = {
  'P': PlatingType.None,
  'X': PlatingType.GoldPlated,
  'D': PlatingType.TwoTone,
  'H': PlatingType.Platinum,
  '': PlatingType.None
};

export const analyzeSku = (rawSku: string, forcedGender?: Gender) => {
    const cleanSku = rawSku.trim().toUpperCase();
    let gender = forcedGender;
    if (!gender) {
        const meta = parseSku(cleanSku);
        gender = meta.gender as Gender;
    }

    let relevantStones = {};
    if (gender === Gender.Men) relevantStones = STONE_CODES_MEN;
    else if (gender === Gender.Women) relevantStones = STONE_CODES_WOMEN;
    else relevantStones = { ...STONE_CODES_MEN, ...STONE_CODES_WOMEN };

    const stoneKeys = Object.keys(relevantStones).sort((a, b) => b.length - a.length);
    const finishKeys = Object.keys(FINISH_CODES).filter(k => k !== '').sort((a, b) => b.length - a.length);

    let detectedStoneCode = '';
    let detectedFinishCode = '';
    let remainder = cleanSku;

    for (const sCode of stoneKeys) {
        if (remainder.endsWith(sCode)) {
            detectedStoneCode = sCode;
            remainder = remainder.slice(0, -sCode.length);
            break; 
        }
    }

    for (const fCode of finishKeys) {
        if (remainder.endsWith(fCode)) {
            detectedFinishCode = fCode;
            remainder = remainder.slice(0, -fCode.length);
            break;
        }
    }

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

    return {
        isVariant: false,
        masterSku: cleanSku,
        suffix: '',
        detectedPlating: PlatingType.None,
        variantDescription: ''
    };
};

export const analyzeSuffix = (suffix: string, gender?: Gender): string | null => {
    const { finish, stone } = getVariantComponents(suffix, gender);
    if (!finish.code && !stone.code && suffix) return null;

    let fullDesc = '';
    const showFinish = finish.code !== '' || !stone.code;
    
    if (showFinish && stone.name) fullDesc = `${finish.name} - ${stone.name}`;
    else if (showFinish) fullDesc = finish.name;
    else if (stone.name) fullDesc = stone.name;

    return fullDesc || null;
};