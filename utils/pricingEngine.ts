
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
): { total: number; breakdown: any } => {
  if (visitedSkus.has(product.sku)) return { total: 0, breakdown: { error: 'Circular Dependency' } };
  const newVisited = new Set(visitedSkus);
  newVisited.add(product.sku);
  if (depth > 10) return { total: 0, breakdown: {} };
  const silverPrice = silverPriceOverride !== undefined ? silverPriceOverride : settings.silver_price_gram;

  if (product.production_type === ProductionType.Imported) {
      const silverCost = product.weight_g * silverPrice;
      // For Imported: technician_cost is usually the 'Making Charge' per gram
      const technicianCost = product.weight_g * (product.labor.technician_cost || 0); 
      // For Imported: plating_cost_x is the 'Plating Surcharge' per gram
      const platingCost = product.weight_g * (product.labor.plating_cost_x || 0);
      const stoneCost = product.labor.stone_setting_cost || 0;
      const totalCost = silverCost + technicianCost + platingCost + stoneCost;
      return {
          total: roundPrice(totalCost),
          breakdown: { silver: silverCost, labor: technicianCost + platingCost, materials: stoneCost, details: { technician_cost: technicianCost, plating_cost_x: platingCost, stone_setting_cost: stoneCost } }
      };
  }

  const totalWeight = product.weight_g + (product.secondary_weight_g || 0);
  const silverBaseCost = totalWeight * silverPrice;
  let materialsCost = 0;
  product.recipe.forEach(item => {
    if (item.type === 'raw') {
      const mat = allMaterials.find(m => m.id === item.id);
      if (mat) materialsCost += (mat.cost_per_unit * item.quantity);
    } else if (item.type === 'component') {
      const subProduct = allProducts.find(p => p.sku === item.sku);
      if (subProduct) {
        const subCost = calculateProductCost(subProduct, settings, allMaterials, allProducts, depth + 1, newVisited, silverPriceOverride);
        materialsCost += (subCost.total * item.quantity);
      }
    }
  });

  const labor: Partial<LaborCost> = product.labor || {};
  let technicianCost = labor.technician_cost_manual_override ? (labor.technician_cost || 0) : (product.is_component ? product.weight_g * 0.50 : calculateTechnicianCost(totalWeight));
  let castingCost = labor.casting_cost_manual_override ? (labor.casting_cost || 0) : (product.is_component ? 0 : totalWeight * 0.15);
  const laborTotal = castingCost + (labor.setter_cost || 0) + technicianCost + (labor.subcontract_cost || 0);
  const totalCost = silverBaseCost + materialsCost + laborTotal;
  return { total: roundPrice(totalCost), breakdown: { silver: silverBaseCost, materials: materialsCost, labor: laborTotal, details: { ...(product.labor || {}), casting_cost: castingCost, setter_cost: labor.setter_cost || 0, technician_cost: technicianCost, subcontract_cost: labor.subcontract_cost || 0 } } };
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
        // 1. Direct SKU Match
        if (p.sku.toUpperCase() === cleanScanned) return { product: p, variant: undefined };
        
        // 2. Transliterated SKU Match
        if (transliterateForBarcode(p.sku).toUpperCase() === cleanScanned) return { product: p, variant: undefined };
        
        // 3. Variant Check
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
    return {
        finish: { code: detectedFinishCode, name: FINISH_CODES[detectedFinishCode] || FINISH_CODES[''] },
        stone: { code: detectedStoneCode, name: (relevantStones as any)[detectedStoneCode] || '' }
    };
};

export const estimateVariantCost = (
    masterProduct: Product, 
    variantSuffix: string,
    settings: GlobalSettings,
    allMaterials: Material[],
    allProducts: Product[],
    silverPriceOverride?: number
): { total: number; breakdown: any } => {
    const silverPrice = silverPriceOverride !== undefined ? silverPriceOverride : settings.silver_price_gram;
    const { finish, stone } = getVariantComponents(variantSuffix, masterProduct.gender);

    // --- FIX FOR IMPORTED PRODUCTS ---
    if (masterProduct.production_type === ProductionType.Imported) {
        const silverCost = masterProduct.weight_g * silverPrice;
        // Technician cost is essentially the base making charge per gram
        const technicianCost = masterProduct.weight_g * (masterProduct.labor.technician_cost || 0);
        // Stone setting cost is fixed per piece
        const stoneCost = masterProduct.labor.stone_setting_cost || 0;
        
        let platingCost = 0;
        // Only apply plating surcharge if the variant is actually plated (X, H, D). 
        // Lustre ('' or 'P') should strictly ignore plating costs.
        if (['X', 'H', 'D'].includes(finish.code)) {
            platingCost = masterProduct.weight_g * (masterProduct.labor.plating_cost_x || 0);
        }

        const totalCost = silverCost + technicianCost + stoneCost + platingCost;
        return {
            total: roundPrice(totalCost),
            breakdown: { 
                silver: silverCost, 
                labor: technicianCost + platingCost, 
                materials: stoneCost, 
                details: { 
                    technician_cost: technicianCost, 
                    plating_cost_x: platingCost, 
                    stone_setting_cost: stoneCost 
                } 
            }
        };
    }

    // --- IN HOUSE CALCULATION (UNCHANGED) ---
    const totalWeight = masterProduct.weight_g + (masterProduct.secondary_weight_g || 0);
    const silverCost = totalWeight * silverPrice;
    let materialsCost = 0;
    
    masterProduct.recipe.forEach(item => {
        if (item.type === 'raw') {
            const mat = allMaterials.find(m => m.id === item.id);
            if (mat) {
                let unitCost = mat.cost_per_unit;
                if (stone.code && mat.variant_prices && mat.variant_prices[stone.code] !== undefined) unitCost = mat.variant_prices[stone.code];
                materialsCost += (unitCost * item.quantity);
            }
        } else if (item.type === 'component') {
            const subProduct = allProducts.find(p => p.sku === item.sku);
            if (subProduct) {
                const subCost = calculateProductCost(subProduct, settings, allMaterials, allProducts, 0, new Set(), silverPriceOverride);
                materialsCost += (subCost.total * item.quantity);
            }
        }
    });

    const labor: Partial<LaborCost> = masterProduct.labor || {};
    let technicianCost = labor.technician_cost_manual_override ? (labor.technician_cost || 0) : (finish.code === 'D' ? (masterProduct.weight_g * (totalWeight <= 2.2 ? 1.3 : (totalWeight <= 4.2 ? 0.9 : (totalWeight <= 8.2 ? 0.7 : 0.5)))) + calculateTechnicianCost(masterProduct.secondary_weight_g || 0) : calculateTechnicianCost(totalWeight));
    const castingCost = totalWeight * 0.15;
    let platingCost = finish.code === 'D' ? (labor.plating_cost_d || 0) : (['X', 'H'].includes(finish.code) ? (labor.plating_cost_x || 0) : 0);
    const laborTotal = castingCost + (labor.setter_cost || 0) + technicianCost + (labor.subcontract_cost || 0) + platingCost;
    return { total: roundPrice(silverCost + materialsCost + laborTotal), breakdown: { silver: silverCost, materials: materialsCost, labor: laborTotal, details: { casting_cost: castingCost, setter_cost: labor.setter_cost || 0, technician_cost: technicianCost, subcontract_cost: labor.subcontract_cost || 0, plating_cost: platingCost, total_weight: totalWeight } } };
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

export const analyzeSku = (rawSku: string, forcedGender?: Gender) => {
    const cleanSku = rawSku.trim().toUpperCase();
    let gender = forcedGender || (parseSku(cleanSku).gender as Gender);
    let relevantStones = gender === Gender.Men ? STONE_CODES_MEN : (gender === Gender.Women ? STONE_CODES_WOMEN : { ...STONE_CODES_MEN, ...STONE_CODES_WOMEN });
    const stoneKeys = Object.keys(relevantStones).sort((a, b) => b.length - a.length);
    const finishKeys = Object.keys(FINISH_CODES).filter(k => k !== '').sort((a, b) => b.length - a.length);
    let detectedStoneCode = '', detectedFinishCode = '', remainder = cleanSku;
    for (const sCode of stoneKeys) if (remainder.endsWith(sCode)) { detectedStoneCode = sCode; remainder = remainder.slice(0, -sCode.length); break; }
    for (const fCode of finishKeys) if (remainder.endsWith(fCode)) { detectedFinishCode = fCode; remainder = remainder.slice(0, -fCode.length); break; }
    if ((detectedStoneCode !== '' || detectedFinishCode !== '') && remainder.length >= 2) {
        const platingMap: any = { 'P': PlatingType.None, 'X': PlatingType.GoldPlated, 'D': PlatingType.TwoTone, 'H': PlatingType.Platinum, '': PlatingType.None };
        return { isVariant: true, masterSku: remainder, suffix: detectedFinishCode + detectedStoneCode, detectedPlating: platingMap[detectedFinishCode] || PlatingType.None, variantDescription: analyzeSuffix(detectedFinishCode + detectedStoneCode, gender) || '' };
    }
    return { isVariant: false, masterSku: cleanSku, suffix: '', detectedPlating: PlatingType.None, variantDescription: '' };
};

export const analyzeSuffix = (suffix: string, gender?: Gender): string | null => {
    const { finish, stone } = getVariantComponents(suffix, gender);
    if (!finish.code && !stone.code && suffix) return null;
    return (finish.code !== '' || !stone.code) ? (stone.name ? `${finish.name} - ${stone.name}` : finish.name) : (stone.name || null);
};