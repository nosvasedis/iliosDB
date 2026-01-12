
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
 * Rounds a price to the nearest 10 cents (e.g., 21.54 -> 21.50, 21.56 -> 21.60).
 */
export const roundPrice = (price: number): number => {
  if (price === 0) return 0;
  return parseFloat((Math.round(price * 10) / 10).toFixed(2));
};

/**
 * Codifies a price for Retail Label.
 * Format: 1 + PriceInteger + 9
 * Example: 36.90 -> 3690 -> 136909
 */
export const codifyPrice = (price: number): string => {
    if (!price || price <= 0) return '';
    // Convert to integer cents (e.g. 36.90 -> 3690)
    const cents = Math.round(price * 100);
    return `1${cents}9`;
};

/**
 * Calculates the Ilios Standard Suggested Wholesale Price.
 * Formula: (Non-Metal Costs * 2) + Metal Cost + (2€ * Total Weight)
 */
export const calculateSuggestedWholesalePrice = (
    totalWeight: number,
    silverCost: number,
    laborCost: number,
    materialCost: number
): number => {
    const nonMetalCost = laborCost + materialCost;
    const weightSurcharge = totalWeight * 2;
    const suggestedPrice = (nonMetalCost * 2) + silverCost + weightSurcharge;
    return roundPrice(suggestedPrice);
};

export const calculateTechnicianCost = (weight_g: number): number => {
  let cost = 0;
  if (weight_g <= 0) return 0;
  if (weight_g <= 2.2) {
    cost = weight_g * 1.30;
  } else if (weight_g <= 4.2) {
    cost = weight_g * 0.90;
  } else if (weight_g <= 8.2) {
    cost = weight_g * 0.70;
  } else {
    cost = weight_g * 0.50;
  }
  return cost;
};

export const calculatePlatingCost = (weight_g: number, plating_type: PlatingType): number => {
    if (plating_type === PlatingType.GoldPlated || plating_type === PlatingType.Platinum) {
        return weight_g * 0.60;
    }
    return 0;
};

export interface SupplierAnalysis {
    intrinsicValue: number;
    theoreticalMakeCost: number;
    supplierPremium: number;
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
    const silverCost = weight * settings.silver_price_gram;
    let materialCost = 0;
    recipe.forEach(item => {
        if (item.type === 'raw') {
            const mat = allMaterials.find(m => m.id === item.id);
            if (mat) materialCost += (mat.cost_per_unit * item.quantity);
        } else if (item.type === 'component') {
            const sub = allProducts.find(p => p.sku === item.sku);
            if (sub) {
                // Use stored cost for supplier analysis as we don't have the full tree easily here
                materialCost += (sub.supplier_cost || sub.draft_price || 0) * item.quantity;
            }
        }
    });

    const intrinsicValue = silverCost + materialCost;
    const estCasting = weight * 0.15;
    const estTechnician = calculateTechnicianCost(weight);
    const estPlating = (reportedLabor.plating_cost_x > 0 || reportedLabor.plating_cost_d > 0) 
        ? calculatePlatingCost(weight, PlatingType.GoldPlated) 
        : 0; 

    const estimatedInternalLabor = estCasting + estTechnician + estPlating;
    const theoreticalMakeCost = intrinsicValue + estimatedInternalLabor;

    const reportedLaborTotal = (reportedLabor.technician_cost || 0) + (reportedLabor.stone_setting_cost || 0);
    const reportedPlatingTotal = (reportedLabor.plating_cost_x || 0) + (reportedLabor.plating_cost_d || 0);
    const reportedTotalExtras = reportedLaborTotal + reportedPlatingTotal;

    let laborEfficiency: SupplierAnalysis['laborEfficiency'] = 'Similar';
    const laborDiff = reportedLaborTotal - (estCasting + estTechnician);
    if (reportedLaborTotal > 0) {
        if (laborDiff < -0.5) laborEfficiency = 'Cheaper';
        else if (laborDiff > 1.0) laborEfficiency = 'More Expensive';
    }

    let platingEfficiency: SupplierAnalysis['platingEfficiency'] = 'Similar';
    const platingDiff = reportedPlatingTotal - estPlating;
    if (reportedTotalExtras > 0 && weight > 0) {
        const residualForMetal = supplierCost - materialCost - reportedTotalExtras;
        const effectiveSilverPrice = residualForMetal / weight; 
        
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
            hasHiddenMarkup: effectiveSilverPrice > (settings.silver_price_gram * 1.15),
            laborEfficiency,
            platingEfficiency: reportedPlatingTotal > 0 ? (platingDiff < -0.2 ? 'Cheaper' : (platingDiff > 0.5 ? 'More Expensive' : 'Similar')) : 'Similar',
            breakdown: { silverCost, materialCost, estLabor: estimatedInternalLabor, supplierReportedTotalLabor: reportedTotalExtras }
        };
    }
    return {
        intrinsicValue: roundPrice(intrinsicValue),
        theoreticalMakeCost: roundPrice(theoreticalMakeCost),
        supplierPremium: 0,
        premiumPercent: 0,
        verdict: 'Fair',
        effectiveSilverPrice: 0,
        hasHiddenMarkup: false,
        laborEfficiency,
        platingEfficiency: 'Similar',
        breakdown: { silverCost, materialCost, estLabor: estimatedInternalLabor, supplierReportedTotalLabor: 0 }
    };
};

export const calculateProductCost = (
  product: Product,
  settings: GlobalSettings,
  allMaterials: Material[],
  allProducts: Product[],
  depth: number = 0,
  visitedSkus: Set<string> = new Set(),
  silverPriceOverride?: number
): { total: number; rawTotal: number; breakdown: any } => {
  if (visitedSkus.has(product.sku)) return { total: 0, rawTotal: 0, breakdown: { error: 'Circular Dependency' } };
  const newVisited = new Set(visitedSkus);
  newVisited.add(product.sku);
  if (depth > 10) return { total: 0, rawTotal: 0, breakdown: {} };
  const silverPrice = silverPriceOverride !== undefined ? silverPriceOverride : settings.silver_price_gram;

  if (product.production_type === ProductionType.Imported) {
      const silverCost = product.weight_g * silverPrice;
      const technicianCost = product.weight_g * (product.labor.technician_cost || 0); 
      
      let platingCost = 0;
      if (product.plating_type !== PlatingType.None) {
          platingCost = product.weight_g * (product.labor.plating_cost_x || 0);
      }

      const stoneCost = product.labor.stone_setting_cost || 0;
      const totalCost = silverCost + technicianCost + platingCost + stoneCost;
      return {
          total: roundPrice(totalCost),
          rawTotal: totalCost,
          breakdown: { silver: silverCost, labor: technicianCost + platingCost, materials: stoneCost, details: { technician_cost: technicianCost, plating_cost_x: platingCost, stone_setting_cost: stoneCost } }
      };
  }

  const totalWeight = product.weight_g + (product.secondary_weight_g || 0);
  const silverBaseCost = totalWeight * silverPrice;
  
  let materialsCost = 0;
  product.recipe.forEach(item => {
    if (item.type === 'raw') {
      const mat = allMaterials.find(m => m.id === item.id);
      if (mat) {
          // Accumulate with 4-decimal precision to avoid float drift (e.g. 2.70 -> 2.62)
          const lineCost = mat.cost_per_unit * item.quantity;
          materialsCost = parseFloat((materialsCost + lineCost).toFixed(4));
      }
    } else if (item.type === 'component') {
      const subProduct = allProducts.find(p => p.sku === item.sku);
      if (subProduct) {
        const subCost = calculateProductCost(subProduct, settings, allMaterials, allProducts, depth + 1, newVisited, silverPriceOverride);
        // Use rawTotal for accumulation to prevent premature rounding errors
        const lineCost = subCost.rawTotal * item.quantity;
        materialsCost = parseFloat((materialsCost + lineCost).toFixed(4));
      }
    }
  });

  const labor: Partial<LaborCost> = product.labor || {};
  let technicianCost = labor.technician_cost_manual_override ? (labor.technician_cost || 0) : (product.is_component ? product.weight_g * 0.50 : calculateTechnicianCost(totalWeight));
  let castingCost = labor.casting_cost_manual_override ? (labor.casting_cost || 0) : (product.is_component ? 0 : totalWeight * 0.15);
  const laborTotal = castingCost + (labor.setter_cost || 0) + technicianCost + (labor.subcontract_cost || 0);
  const totalCost = silverBaseCost + materialsCost + laborTotal;
  
  return { 
      total: roundPrice(totalCost), 
      rawTotal: totalCost, 
      breakdown: { 
          silver: silverBaseCost, 
          materials: parseFloat(materialsCost.toFixed(2)), // Final visual rounding
          labor: laborTotal, 
          details: { ...(product.labor || {}), casting_cost: castingCost, setter_cost: labor.setter_cost || 0, technician_cost: technicianCost, subcontract_cost: labor.subcontract_cost || 0 } 
      } 
  };
};

/**
 * Transliterates Greek characters to Latin for Barcode compatibility (Code 128).
 */
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

/**
 * BRIDGING FUNCTION: Matches a scanned Latin barcode back to a Greek SKU in the database.
 */
export const findProductByScannedCode = (scanned: string, products: Product[]) => {
    const cleanScanned = scanned.trim().toUpperCase();
    
    for (const p of products) {
        if (p.sku.toUpperCase() === cleanScanned) return { product: p, variant: undefined };
        if (transliterateForBarcode(p.sku).toUpperCase() === cleanScanned) return { product: p, variant: undefined };
        if (p.variants) {
            for (const v of p.variants) {
                const fullGreek = (p.sku + v.suffix).toUpperCase();
                const fullLatin = transliterateForBarcode(fullGreek);
                if (fullGreek === cleanScanned || fullLatin === cleanScanned) {
                    return { product: p, variant: v };
                }
            }
        }
    }
    return null;
};

/**
 * INTELLIGENT DECOMPOSITION
 * Analyzes a variant suffix to extract the Finish Code (e.g., P, X, D) and the Stone/Detail code (e.g., CO, AI).
 */
export const getVariantComponents = (suffix: string, gender?: Gender) => {
    let relevantStones: Record<string, string> = {};
    if (gender === Gender.Men) relevantStones = STONE_CODES_MEN;
    else if (gender === Gender.Women) relevantStones = STONE_CODES_WOMEN;
    else relevantStones = { ...STONE_CODES_MEN, ...STONE_CODES_WOMEN };

    const cleanSuffix = suffix.toUpperCase();
    let workingString = cleanSuffix;
    
    let detectedStoneCode = '';
    let detectedFinishCode = '';
    let detectedBridge = '';

    // STRATEGY 1: LOOKAHEAD FOR FINISH CODE FIRST
    // If the suffix starts with a known finish (P, X, D, H) and the remainder is a valid stone or empty, 
    // we prioritize this decomposition. This solves conflicts like "PCO" (Patina + Copper vs Lustre + Green Copper).
    const possibleFinishes = ['P', 'X', 'D', 'H'];
    const firstChar = workingString.charAt(0);
    const restOfSuffix = workingString.substring(1);
    
    if (possibleFinishes.includes(firstChar)) {
        let potentialStone = restOfSuffix;
        let potentialBridge = '';
        if (restOfSuffix.endsWith('S')) {
            potentialStone = restOfSuffix.slice(0, -1);
            potentialBridge = 'S';
        }

        // If the rest is empty or a known stone code, we've found our finish.
        if (potentialStone === '' || (relevantStones as any)[potentialStone]) {
            detectedFinishCode = firstChar;
            detectedStoneCode = potentialStone;
            detectedBridge = potentialBridge;
            
            return {
                finish: { 
                    code: detectedFinishCode, 
                    name: FINISH_CODES[detectedFinishCode] || FINISH_CODES[''] 
                },
                bridge: detectedBridge,
                stone: { 
                    code: detectedStoneCode, 
                    name: (relevantStones as any)[detectedStoneCode] || detectedStoneCode || '' 
                }
            };
        }
    }

    // STRATEGY 2: Find Stone Code from the END (Standard stripping)
    const stoneKeys = Object.keys(relevantStones).sort((a, b) => b.length - a.length);
    for (const sCode of stoneKeys) {
        if (workingString.endsWith(sCode)) {
            detectedStoneCode = sCode;
            workingString = workingString.slice(0, -sCode.length);
            break;
        }
    }

    // Handle 'S' Bridge Indicator
    if (workingString.endsWith('S')) {
        detectedBridge = 'S';
        workingString = workingString.slice(0, -1);
    }

    // What remains is the finish code
    const finishKeys = Object.keys(FINISH_CODES).filter(k => k !== '').sort((a, b) => b.length - a.length);
    for (const fCode of finishKeys) {
        if (workingString === fCode) {
            detectedFinishCode = fCode;
            break;
        }
    }

    // STRATEGY 3 (FALLBACK): If no exact finish match found, check if it starts with a finish code
    if (!detectedFinishCode && workingString.length > 0) {
        for (const fCode of finishKeys) {
            if (workingString.startsWith(fCode)) {
                detectedFinishCode = fCode;
                if (!detectedStoneCode) {
                     const potentialStone = workingString.substring(fCode.length);
                     if (potentialStone) {
                         detectedStoneCode = potentialStone;
                     }
                }
                break;
            }
        }
    }
    
    return {
        finish: { 
            code: detectedFinishCode, 
            name: FINISH_CODES[detectedFinishCode] || FINISH_CODES[''] 
        },
        bridge: detectedBridge,
        stone: { 
            code: detectedStoneCode, 
            name: (relevantStones as any)[detectedStoneCode] || detectedStoneCode || '' 
        }
    };
};

/**
 * ESTIMATE VARIANT COST
 */
export const estimateVariantCost = (
    masterProduct: Product, 
    variantSuffix: string,
    settings: GlobalSettings,
    allMaterials: Material[],
    allProducts: Product[],
    silverPriceOverride?: number
): { total: number; rawTotal: number; breakdown: any } => {
    const silverPrice = silverPriceOverride !== undefined ? silverPriceOverride : settings.silver_price_gram;
    const { finish, stone } = getVariantComponents(variantSuffix, masterProduct.gender);
    const labor: Partial<LaborCost> = masterProduct.labor || {};

    if (masterProduct.production_type === ProductionType.Imported) {
        const silverCost = masterProduct.weight_g * silverPrice;
        const technicianCost = masterProduct.weight_g * (labor.technician_cost || 0);
        const stoneCost = labor.stone_setting_cost || 0;
        
        let platingCost = 0;
        if (['X', 'H'].includes(finish.code) || masterProduct.plating_type === PlatingType.GoldPlated || masterProduct.plating_type === PlatingType.Platinum) {
            platingCost = masterProduct.weight_g * (labor.plating_cost_x || 0);
        } else if (finish.code === 'D' || masterProduct.plating_type === PlatingType.TwoTone) {
            platingCost = masterProduct.weight_g * (labor.plating_cost_d || 0);
        }

        const totalCost = silverCost + technicianCost + stoneCost + platingCost;
        return {
            total: roundPrice(totalCost),
            rawTotal: totalCost,
            breakdown: { 
                silver: silverCost, 
                labor: technicianCost + platingCost, 
                materials: stoneCost, 
                details: { 
                    technician_cost: technicianCost, 
                    plating_cost: platingCost, 
                    stone_setting_cost: stoneCost 
                } 
            }
        };
    }

    const totalWeight = masterProduct.weight_g + (masterProduct.secondary_weight_g || 0);
    const silverCost = totalWeight * silverPrice;
    let materialsCost = 0;
    let stoneDifferential = 0;
    
    masterProduct.recipe.forEach(item => {
        if (item.type === 'raw') {
            const mat = allMaterials.find(m => m.id === item.id);
            if (mat) {
                let unitCost = Number(mat.cost_per_unit);
                if (stone.code && mat.variant_prices && mat.variant_prices[stone.code] !== undefined) {
                    const variantPrice = Number(mat.variant_prices[stone.code]);
                    if (!isNaN(variantPrice)) {
                        unitCost = variantPrice;
                        stoneDifferential += (unitCost - mat.cost_per_unit) * item.quantity;
                    }
                }
                const lineCost = unitCost * item.quantity;
                materialsCost = parseFloat((materialsCost + lineCost).toFixed(4));
            }
        } else if (item.type === 'component') {
            const subProduct = allProducts.find(p => p.sku === item.sku);
            if (subProduct) {
                const subCost = calculateProductCost(subProduct, settings, allMaterials, allProducts, 0, new Set(), silverPriceOverride);
                // Use rawTotal for accumulation
                const lineCost = subCost.rawTotal * item.quantity;
                materialsCost = parseFloat((materialsCost + lineCost).toFixed(4));
            }
        }
    });

    let technicianCost = labor.technician_cost_manual_override ? (labor.technician_cost || 0) : (finish.code === 'D' ? (masterProduct.weight_g * (totalWeight <= 2.2 ? 1.3 : (totalWeight <= 4.2 ? 0.9 : (totalWeight <= 8.2 ? 0.7 : 0.5)))) + calculateTechnicianCost(masterProduct.secondary_weight_g || 0) : calculateTechnicianCost(totalWeight));
    const castingCost = totalWeight * 0.15;
    
    let platingLabor = 0;
    const isTwoTone = finish.code === 'D' || masterProduct.plating_type === PlatingType.TwoTone;
    const isPlatedX = ['X', 'H'].includes(finish.code) || masterProduct.plating_type === PlatingType.GoldPlated || masterProduct.plating_type === PlatingType.Platinum;

    if (isTwoTone) {
        platingLabor = labor.plating_cost_d || 0;
    } else if (isPlatedX) {
        platingLabor = labor.plating_cost_x || 0;
    }

    const laborTotal = castingCost + (labor.setter_cost || 0) + technicianCost + (labor.subcontract_cost || 0) + platingLabor;
    const totalCost = silverCost + materialsCost + laborTotal;

    return { 
        total: roundPrice(totalCost), 
        rawTotal: totalCost,
        breakdown: { 
            silver: silverCost, 
            materials: parseFloat(materialsCost.toFixed(2)), 
            labor: laborTotal, 
            details: { 
                casting_cost: castingCost, 
                setter_cost: labor.setter_cost || 0, 
                technician_cost: technicianCost, 
                subcontract_cost: labor.subcontract_cost || 0, 
                plating_cost: platingLabor, 
                stone_diff: stoneDifferential,
                total_weight: totalWeight 
            } 
        } 
    };
};

export const getPrevalentVariant = (variants: ProductVariant[] | undefined): ProductVariant | null => {
    if (!variants || variants.length === 0) return null;
    return variants.find(v => v.suffix.includes('P') && !v.suffix.includes('X') && !v.suffix.includes('D')) || variants.find(v => v.suffix.includes('X')) || variants[0];
};

export const parseSku = (sku: string) => {
  const prefix = sku.substring(0, 2).toUpperCase();
  const triPrefix = sku.substring(0, 3).toUpperCase();
  const numPart = parseInt(sku.replace(/[A-Z-]/g, ''), 10);
  if (triPrefix === 'STX') return { gender: Gender.Unisex, category: 'Εξάρτημα (STX)' };
  if (prefix === 'XR' && !isNaN(numPart)) {
    if (numPart <= 100) return { gender: Gender.Men, category: 'Βραχιόλι Δερμάτινο' };
    if (numPart <= 199) return { gender: Gender.Men, category: 'Βραχιόλι Μασίφ' };
    if (numPart <= 700) return { gender: Gender.Unisex, category: 'Βραχιόλι με Πέτρες' };
    if (numPart >= 1100 && numPart <= 1149) return { gender: Gender.Unisex, category: 'Βραχιόλι Μακραμέ Θρησκευτικό' };
    if (numPart <= 1199) return { gender: Gender.Unisex, category: 'Βραχιόλι Μακραμέ Πολύχρωμο' };
    if (numPart <= 1290) return { gender: Gender.Unisex, category: 'Βραχιόλι Δερμάτινο Θρησκευτικό' };
    return { gender: Gender.Men, category: 'Βραχιόλι' };
  }
  const maps: any = { 'CR': 'Σταυρός', 'RN': 'Δαχτυλίδι', 'PN': 'Μενταγιόν', 'DA': 'Δαχτυλίδι', 'SK': 'Σκουλαρίκια', 'MN': 'Μενταγιόν', 'BR': 'Βραχιόλι' };
  if (maps[prefix]) return { gender: ['DA','SK','MN','BR'].includes(prefix) ? Gender.Women : Gender.Men, category: maps[prefix] };
  return { gender: Gender.Unisex, category: prefix === 'ST' ? 'Σταυρός' : 'Γενικό' };
};

/**
 * ANALYZE SKU
 * Refined to distinguish between plain metal finish (MN050X) and bridge variants (MN050XS).
 * Bridge variants (S) are now treated as NEW MASTER SKUs to allow distinct weights/molds.
 */
export const analyzeSku = (rawSku: string, forcedGender?: Gender) => {
    const cleanSku = rawSku.trim().toUpperCase();
    let gender = forcedGender || (parseSku(cleanSku).gender as Gender);
    
    // MAP PLATING
    const platingMap: any = { 
        'P': PlatingType.None, 
        'X': PlatingType.GoldPlated, 
        'D': PlatingType.TwoTone, 
        'H': PlatingType.Platinum, 
        '': PlatingType.None 
    };

    // SEARCH FOR BRIDGE PATTERN [ROOT][FINISH]S (e.g., MN050XS)
    const bridgeMatch = cleanSku.match(/^([A-Z-]+\d+)([XPHD])(S)$/);
    if (bridgeMatch) {
        const finishCode = bridgeMatch[2];
        const bridgeChar = bridgeMatch[3];
        return {
            isVariant: false, // Force new product
            masterSku: cleanSku, // The input is the master
            suffix: '',
            detectedPlating: platingMap[finishCode] || PlatingType.None,
            detectedBridge: bridgeChar,
            variantDescription: ''
        };
    }

    // SEARCH FOR PLAIN FINISH PATTERN [ROOT][FINISH] (e.g., MN050X)
    const plainFinishMatch = cleanSku.match(/^([A-Z-]+\d+)([XPHD])$/);
    if (plainFinishMatch) {
        const root = plainFinishMatch[1];
        const finishCode = plainFinishMatch[2];
        return {
            isVariant: true,
            masterSku: root,
            suffix: finishCode,
            detectedPlating: platingMap[finishCode] || PlatingType.None,
            detectedBridge: '',
            variantDescription: analyzeSuffix(finishCode, gender, platingMap[finishCode]) || ''
        };
    }

    // Default exhaustive analysis for complex or stone-bearing suffixes (e.g., MN050XSPR)
    let bestMatch = { isVariant: false, masterSku: cleanSku, suffix: '', detectedPlating: PlatingType.None, detectedBridge: '', variantDescription: '' };
    
    for (let i = cleanSku.length - 1; i >= 3; i--) {
        const potentialMaster = cleanSku.substring(0, i);
        const potentialSuffix = cleanSku.substring(i);
        const components = getVariantComponents(potentialSuffix, gender);
        
        if (components.finish.code || components.stone.code) {
             const desc = analyzeSuffix(potentialSuffix, gender, platingMap[components.finish.code]);
             bestMatch = {
                 isVariant: true,
                 masterSku: potentialMaster,
                 suffix: potentialSuffix,
                 detectedPlating: platingMap[components.finish.code] || PlatingType.None,
                 detectedBridge: components.bridge,
                 variantDescription: desc || ''
             };
             // If potential master ends in a number, this is likely the intended root
             if (/\d$/.test(potentialMaster)) break; 
        }
    }
    
    return bestMatch;
};

/**
 * ANALYZE SUFFIX
 */
export const analyzeSuffix = (suffix: string, gender?: Gender, plating?: PlatingType): string | null => {
    const { finish, stone } = getVariantComponents(suffix, gender);
    
    let finishName = '';
    if (finish.code) {
        finishName = finish.name;
    } else if (plating && plating !== PlatingType.None) {
        const platingMap: Record<string, string> = {
            [PlatingType.GoldPlated]: FINISH_CODES['X'],
            [PlatingType.Platinum]: FINISH_CODES['H'],
            [PlatingType.TwoTone]: FINISH_CODES['D']
        };
        finishName = platingMap[plating] || '';
    } else {
        finishName = FINISH_CODES['']; // Λουστρέ
    }

    if (stone.code) {
        return finishName ? `${finishName} - ${stone.name}` : stone.name;
    }
    
    if (finish.code || suffix) {
        return finishName || null;
    }

    return null;
};

/**
 * Expands a SKU range token into an array of individual SKUs.
 * Handles patterns like "DA050-DA063", "DA050X-DA063X", or "DA050S-DA063S".
 * 
 * @param token - The string token potentially containing a range (e.g., "DA050-DA060").
 * @returns An array of SKUs. If the token is not a valid range, returns [token].
 */
export const expandSkuRange = (token: string): string[] => {
    const rangeRegex = /^([A-Z-]+)(\d+)([A-Z]*)-([A-Z-]+)(\d+)([A-Z]*)$/i;
    const match = token.match(rangeRegex);

    if (!match) return [token];

    const [, prefix1, num1Str, suffix1, prefix2, num2Str, suffix2] = match;

    // Prefixes and suffixes must match for a valid range (e.g. DA...X to DA...X)
    if (prefix1.toUpperCase() !== prefix2.toUpperCase() || suffix1.toUpperCase() !== suffix2.toUpperCase()) {
        return [token];
    }

    const start = parseInt(num1Str, 10);
    const end = parseInt(num2Str, 10);

    if (isNaN(start) || isNaN(end) || start > end) return [token]; // Invalid math
    if (end - start > 500) return [token]; // Safety limit

    const expanded: string[] = [];
    const paddingLength = num1Str.length;
    // Heuristic: If start number starts with '0' and has >1 digit, preserve padding length.
    const shouldPad = num1Str.startsWith('0') && num1Str.length > 1;

    for (let i = start; i <= end; i++) {
        let numPart = i.toString();
        if (shouldPad) {
            numPart = numPart.padStart(paddingLength, '0');
        } else if (numPart.length < paddingLength && num1Str.length === num2Str.length) {
             // If original input was consistently padded (e.g. 050-060), maintain it even if not starting with 0 explicitly at 'start' (edge case)
             // But simpler logic: Pad if length differs from target length and original seemed padded
             numPart = numPart.padStart(paddingLength, '0');
        }
        expanded.push(`${prefix1.toUpperCase()}${numPart}${suffix1.toUpperCase()}`);
    }

    return expanded;
};
