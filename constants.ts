import { GlobalSettings, Material, MaterialType, PlatingType, Product, Gender } from './types';

// Initial Mock Settings
export const INITIAL_SETTINGS: GlobalSettings = {
  silver_price_gram: 0.82,
  loss_percentage: 10.0
};

// Stone Codes Dictionaries
export const STONE_CODES_WOMEN: Record<string, string> = {
  'CO': 'Κόπερ',
  'PCO': 'Πράσινο Κόπερ',
  'MCO': 'Μωβ Κόπερ',
  'PAX': 'Πράσινος Αχάτης',
  'MAX': 'Μπλε Αχάτης',
  'KAX': 'Κόκκινος Αχάτης',
  'AI': 'Αιματίτης',
  'AP': 'Απατίτης',
  'AM': 'Αμαζονίτης',
  'LR': 'Λαμπραδορίτης',
  'LA': 'Λάπις',
  'FI': 'Φίλντισι',
  'TPR': 'Τριπλέτα Πράσινη',
  'TKO': 'Τριπλέτα Κόκκινη',
  'TMP': 'Τριπλέτα Μπλε',
  'BST': 'Blue Sky Topaz'
};

export const STONE_CODES_MEN: Record<string, string> = {
  'KR': 'Κορνεόλη',
  'LA': 'Λάπις',
  'LE': 'Χαολίτης',
  'AX': 'Αχάτης',
  'TG': 'Μάτι Τίγρης',
  'QN': 'Όνυχας',
  'TY': 'Τυρκουάζ'
};

export const FINISH_CODES: Record<string, string> = {
  '': 'Λουστρέ (Γυαλιστερό)',
  'P': 'Πατίνα',
  'X': 'Επίχρυσο',
  'D': 'Δίχρωμο' // Two-tone
};

// Initial Mock Materials (Translated)
export const MOCK_MATERIALS: Material[] = [
  { id: '1', name: 'Ζιργκόν Λευκό 1.5mm', type: MaterialType.Stone, cost_per_unit: 0.05, unit: 'Τεμ' },
  { id: '2', name: 'Ζιργκόν Μαύρο 2mm', type: MaterialType.Stone, cost_per_unit: 0.08, unit: 'Τεμ' },
  { id: '3', name: 'Κορδόνι Δερμάτινο Μαύρο', type: MaterialType.Cord, cost_per_unit: 0.50, unit: 'Τεμ' },
  { id: '4', name: 'Κούμπωμα Παπαγαλάκι 9mm', type: MaterialType.Component, cost_per_unit: 1.20, unit: 'Τεμ' }, // Generic bought component
  { id: '5', name: 'Αλυσίδα Βενετσιάνα 45cm', type: MaterialType.Chain, cost_per_unit: 4.50, unit: 'Τεμ' },
];

// Initial Mock Products
export const MOCK_PRODUCTS: Product[] = [
  {
    sku: 'STX-505',
    prefix: 'STX',
    category: 'Εξάρτημα (Μοτίφ)',
    gender: Gender.Unisex,
    image_url: 'https://picsum.photos/300/300?random=10',
    weight_g: 2.5,
    plating_type: PlatingType.None,
    active_price: 5.50,
    draft_price: 5.50,
    selling_price: 0, 
    stock_qty: 100,
    sample_qty: 5,
    molds: ['A-12'],
    is_component: true,
    recipe: [
        { type: 'raw', id: '1', quantity: 1 } // Uses 1 Zircon
    ],
    labor: {
      casting_cost: 1.5,
      setter_cost: 0.5,
      technician_cost: 1.0,
      plating_cost: 0
    }
  },
  {
    sku: 'DA1005',
    prefix: 'DA',
    category: 'Δαχτυλίδι',
    gender: Gender.Women,
    image_url: 'https://picsum.photos/300/300?random=1',
    weight_g: 3.5,
    plating_type: PlatingType.GoldPlated,
    active_price: 18.50,
    draft_price: 18.50,
    selling_price: 45.00,
    stock_qty: 10,
    sample_qty: 1,
    molds: ['B-05'],
    is_component: false,
    variants: [
        { suffix: 'P', description: 'Πατίνα (Σκέτο)', stock_qty: 2 },
        { suffix: 'X', description: 'Επίχρυσο', stock_qty: 3 }
    ],
    recipe: [
      { type: 'raw', id: '1', quantity: 10 }
    ],
    labor: {
      casting_cost: 2.0,
      setter_cost: 3.5,
      technician_cost: 2.0,
      plating_cost: 1.5
    }
  },
  {
    sku: 'XR2020',
    prefix: 'XR',
    category: 'Βραχιόλι',
    gender: Gender.Men,
    image_url: 'https://picsum.photos/300/300?random=2',
    weight_g: 12.0,
    plating_type: PlatingType.None,
    active_price: 45.00,
    draft_price: 48.20,
    selling_price: 120.00,
    stock_qty: 5,
    sample_qty: 1,
    molds: ['C-01', 'C-02'],
    is_component: false,
    variants: [
        { suffix: 'PKR', description: 'Πατίνα - Κορνεόλη', stock_qty: 2 }, 
        { suffix: 'TG', description: 'Λουστρέ - Μάτι Τίγρης', stock_qty: 3 } 
    ],
    recipe: [
        { type: 'raw', id: '3', quantity: 1 }, 
        { type: 'component', sku: 'STX-505', quantity: 2 } 
    ],
    labor: {
      casting_cost: 5.0,
      setter_cost: 0,
      technician_cost: 4.0,
      plating_cost: 0
    }
  }
];

export const SKU_RULES = {
  MEN: {
    XR: 'Βραχιόλι',
    CR: 'Σταυρός',
    RN: 'Δαχτυλίδι',
    PN: 'Μενταγιόν'
  },
  WOMEN: {
    DA: 'Δαχτυλίδι',
    SK: 'Σκουλαρίκια',
    MN: 'Μενταγιόν',
    BR: 'Βραχιόλι'
  }
};