
// ─── Backup System Configuration ─────────────────────────────────────────────
// Single source of truth for all backup/export/restore operations.

export const BACKUP_VERSION = 2;
export const BACKUP_FORMAT_MARKER = 'ilios_erp_backup';

// ─── Table Registry ──────────────────────────────────────────────────────────
// Ordered by FK dependency (parents first). Restore inserts in this order,
// delete wipes in REVERSE order.

export interface TableRegistryEntry {
    table: string;
    displayName: string;
    primaryKey: string;       // column used for "delete-all" filter
    primaryKeyType: 'uuid' | 'integer' | 'string'; // determines delete strategy
    includeInCsv: boolean;
}

export const BACKUP_TABLE_REGISTRY: TableRegistryEntry[] = [
    // Independent / root tables
    { table: 'global_settings',          displayName: 'Global_Settings',          primaryKey: 'id',          primaryKeyType: 'integer', includeInCsv: true  },
    { table: 'warehouses',               displayName: 'Warehouses',               primaryKey: 'id',          primaryKeyType: 'uuid',    includeInCsv: true  },
    { table: 'suppliers',                displayName: 'Suppliers',                primaryKey: 'id',          primaryKeyType: 'uuid',    includeInCsv: true  },
    { table: 'customers',                displayName: 'Customers',               primaryKey: 'id',          primaryKeyType: 'uuid',    includeInCsv: true  },
    { table: 'molds',                    displayName: 'Molds',                   primaryKey: 'code',        primaryKeyType: 'string',  includeInCsv: true  },
    { table: 'materials',                displayName: 'Materials',               primaryKey: 'id',          primaryKeyType: 'uuid',    includeInCsv: true  },
    { table: 'collections',              displayName: 'Collections',             primaryKey: 'id',          primaryKeyType: 'integer', includeInCsv: true  },

    // Products and dependent tables
    { table: 'products',                 displayName: 'Products',                primaryKey: 'sku',         primaryKeyType: 'string',  includeInCsv: true  },
    { table: 'product_variants',         displayName: 'Product_Variants',        primaryKey: 'product_sku', primaryKeyType: 'string',  includeInCsv: true  },
    { table: 'recipes',                  displayName: 'Recipes',                 primaryKey: 'id',          primaryKeyType: 'uuid',    includeInCsv: true  },
    { table: 'product_molds',            displayName: 'Product_Molds',           primaryKey: 'product_sku', primaryKeyType: 'string',  includeInCsv: true  },
    { table: 'product_collections',      displayName: 'Product_Collections',     primaryKey: 'product_sku', primaryKeyType: 'string',  includeInCsv: true  },
    { table: 'product_stock',            displayName: 'Product_Stock',           primaryKey: 'product_sku', primaryKeyType: 'string',  includeInCsv: true  },
    { table: 'stock_movements',          displayName: 'Stock_Movements',         primaryKey: 'id',          primaryKeyType: 'uuid',    includeInCsv: true  },

    // Orders and dependent tables
    { table: 'orders',                   displayName: 'Orders',                  primaryKey: 'id',          primaryKeyType: 'uuid',    includeInCsv: true  },
    { table: 'order_delivery_plans',     displayName: 'Order_Delivery_Plans',    primaryKey: 'id',          primaryKeyType: 'uuid',    includeInCsv: true  },
    { table: 'order_delivery_reminders', displayName: 'Order_Delivery_Reminders',primaryKey: 'id',          primaryKeyType: 'uuid',    includeInCsv: true  },
    { table: 'order_shipments',          displayName: 'Order_Shipments',         primaryKey: 'id',          primaryKeyType: 'uuid',    includeInCsv: true  },
    { table: 'order_shipment_items',     displayName: 'Order_Shipment_Items',    primaryKey: 'id',          primaryKeyType: 'uuid',    includeInCsv: true  },
    { table: 'production_batches',       displayName: 'Production_Batches',      primaryKey: 'id',          primaryKeyType: 'uuid',    includeInCsv: true  },
    { table: 'batch_stage_history',      displayName: 'Batch_Stage_History',     primaryKey: 'id',          primaryKeyType: 'uuid',    includeInCsv: false },

    // Other entities
    { table: 'offers',                   displayName: 'Offers',                  primaryKey: 'id',          primaryKeyType: 'uuid',    includeInCsv: true  },
    { table: 'supplier_orders',          displayName: 'Supplier_Orders',         primaryKey: 'id',          primaryKeyType: 'uuid',    includeInCsv: true  },
    { table: 'price_snapshots',          displayName: 'Price_Snapshots',         primaryKey: 'id',          primaryKeyType: 'uuid',    includeInCsv: true  },
    { table: 'price_snapshot_items',     displayName: 'Price_Snapshot_Items',    primaryKey: 'id',          primaryKeyType: 'uuid',    includeInCsv: true  },
    { table: 'audit_logs',              displayName: 'Audit_Logs',              primaryKey: 'id',          primaryKeyType: 'uuid',    includeInCsv: false },
];

// ─── Config Keys ─────────────────────────────────────────────────────────────

export const CONFIG_KEYS = [
    'VITE_SUPABASE_URL',
    'VITE_SUPABASE_ANON_KEY',
    'VITE_WORKER_AUTH_KEY',
    'VITE_GEMINI_API_KEY',
    'ILIOS_LOCAL_MODE',
] as const;

// ─── Types ───────────────────────────────────────────────────────────────────

export interface BackupMeta {
    version: number;
    format: string;
    created_at: string;
    table_counts: Record<string, number>;
    image_count: number;
    failed_images: string[];
    total_tables: number;
    is_local_mode: boolean;
}

export interface BackupEnvelope {
    _meta: BackupMeta;
    _config: Record<string, string>;
    _images: Record<string, string>;
    _sync_queue: any[];
    tables: Record<string, any[]>;
}

export type BackupProgressPhase = 'tables' | 'images' | 'config' | 'sync_queue' | 'validation' | 'cleanup';

export interface BackupProgress {
    phase: BackupProgressPhase;
    current: number;
    total: number;
    tableName?: string;
    message: string;
}

export type ProgressCallback = (progress: BackupProgress) => void;

export interface RestoreOptions {
    restoreConfig?: boolean;
    onProgress?: ProgressCallback;
}

export interface RestoreResult {
    errors: Array<{ table: string; message: string }>;
}

export interface ValidationResult {
    valid: boolean;
    isV2: boolean;
    summary: string;
    tableCounts: Record<string, number>;
    imageCount: number;
    hasConfig: boolean;
    hasSyncQueue: boolean;
    createdAt: string | null;
    errors: string[];
}

// ─── Validation ──────────────────────────────────────────────────────────────

export function validateBackup(data: unknown): ValidationResult {
    const errors: string[] = [];
    const result: ValidationResult = {
        valid: false,
        isV2: false,
        summary: '',
        tableCounts: {},
        imageCount: 0,
        hasConfig: false,
        hasSyncQueue: false,
        createdAt: null,
        errors,
    };

    if (!data || typeof data !== 'object') {
        errors.push('Το αρχείο δεν περιέχει έγκυρα δεδομένα JSON.');
        return result;
    }

    const obj = data as Record<string, any>;

    // Detect format
    if (obj._meta) {
        // V2 format
        result.isV2 = true;
        const meta = obj._meta as Partial<BackupMeta>;

        if (meta.format !== BACKUP_FORMAT_MARKER) {
            errors.push(`Μη αναγνωρισμένη μορφή backup: "${meta.format}".`);
        }
        if (typeof meta.version === 'number' && meta.version > BACKUP_VERSION) {
            errors.push(`Η έκδοση backup (v${meta.version}) είναι νεότερη από αυτήν που υποστηρίζεται (v${BACKUP_VERSION}).`);
        }

        result.createdAt = meta.created_at || null;
        result.imageCount = typeof meta.image_count === 'number' ? meta.image_count : Object.keys(obj._images || {}).length;
        result.hasConfig = !!obj._config && Object.keys(obj._config).length > 0;
        result.hasSyncQueue = Array.isArray(obj._sync_queue) && obj._sync_queue.length > 0;

        const tables = obj.tables;
        if (!tables || typeof tables !== 'object') {
            errors.push('Το backup δεν περιέχει δεδομένα πινάκων (tables).');
        } else {
            for (const entry of BACKUP_TABLE_REGISTRY) {
                const arr = tables[entry.table];
                if (Array.isArray(arr)) {
                    result.tableCounts[entry.table] = arr.length;
                }
            }
        }
    } else {
        // Legacy V1 -- top-level keys are table names
        result.isV2 = false;
        for (const entry of BACKUP_TABLE_REGISTRY) {
            const arr = obj[entry.table];
            if (Array.isArray(arr)) {
                result.tableCounts[entry.table] = arr.length;
            }
        }
    }

    // Must have at least some tables
    const foundTables = Object.keys(result.tableCounts).length;
    if (foundTables === 0) {
        errors.push('Δεν βρέθηκε κανένας αναγνωρίσιμος πίνακας στο backup.');
    }

    // Build summary
    const totalRows = Object.values(result.tableCounts).reduce((a, b) => a + b, 0);
    const parts: string[] = [];
    parts.push(`${foundTables} πίνακες, ${totalRows} εγγραφές`);
    if (result.imageCount > 0) parts.push(`${result.imageCount} εικόνες`);
    if (result.hasConfig) parts.push('ρυθμίσεις σύνδεσης');
    if (result.hasSyncQueue) parts.push('εκκρεμείς αλλαγές');
    result.summary = parts.join(' • ');

    result.valid = errors.length === 0;
    return result;
}
