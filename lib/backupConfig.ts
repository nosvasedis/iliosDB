
// ─── Backup System Configuration ─────────────────────────────────────────────
// Single source of truth for all backup/export/restore operations.

export const BACKUP_VERSION = 4;
export const BACKUP_FORMAT_MARKER = 'ilios_erp_backup';

// ─── Categories ──────────────────────────────────────────────────────────────

export type BackupCategoryId =
    | 'settings'
    | 'catalog'
    | 'contacts'
    | 'orders'
    | 'production'
    | 'legal'
    | 'commerce'
    | 'pricing'
    | 'history';

export interface BackupCategory {
    id: BackupCategoryId;
    label: string;
}

export const BACKUP_CATEGORIES: BackupCategory[] = [
    { id: 'settings', label: 'Ρυθμίσεις' },
    { id: 'catalog', label: 'Κατάλογος & Απόθεμα' },
    { id: 'contacts', label: 'Πελάτες & Προμηθευτές' },
    { id: 'orders', label: 'Παραγγελίες & Αποστολές' },
    { id: 'production', label: 'Παραγωγή' },
    { id: 'legal', label: 'Νομικά & Proforma' },
    { id: 'commerce', label: 'Εμπόριο' },
    { id: 'pricing', label: 'Τιμολόγηση' },
    { id: 'history', label: 'Ιστορικό' },
];

// ─── Table Registry ──────────────────────────────────────────────────────────
// Ordered by FK dependency (parents first). Restore inserts in this order,
// delete wipes in REVERSE order.

export interface TableRegistryEntry {
    table: string;
    displayName: string;
    label: string;
    category: BackupCategoryId;
    primaryKey: string;
    primaryKeyType: 'uuid' | 'integer' | 'string';
    conflictTarget?: string;
    includeInCsv: boolean;
    dependsOn?: string[];
}

export const BACKUP_TABLE_REGISTRY: TableRegistryEntry[] = [
    { table: 'global_settings',          displayName: 'Global_Settings',          label: 'Γενικές Ρυθμίσεις',           category: 'settings',   primaryKey: 'id',          primaryKeyType: 'integer', includeInCsv: true  },
    { table: 'warehouses',               displayName: 'Warehouses',               label: 'Αποθήκες',                    category: 'settings',   primaryKey: 'id',          primaryKeyType: 'uuid',    includeInCsv: true  },
    { table: 'profiles',                 displayName: 'Profiles',                 label: 'Προφίλ Χρηστών',              category: 'settings',   primaryKey: 'id',          primaryKeyType: 'uuid',    includeInCsv: true  },
    { table: 'tag_color_overrides',      displayName: 'Tag_Color_Overrides',      label: 'Χρώματα Ετικετών',            category: 'settings',   primaryKey: 'tag_name',    primaryKeyType: 'string',  includeInCsv: true  },
    { table: 'suppliers',                displayName: 'Suppliers',                label: 'Προμηθευτές',                  category: 'contacts',   primaryKey: 'id',          primaryKeyType: 'uuid',    includeInCsv: true  },
    { table: 'customers',                displayName: 'Customers',                label: 'Πελάτες',                     category: 'contacts',   primaryKey: 'id',          primaryKeyType: 'uuid',    includeInCsv: true  },
    { table: 'molds',                    displayName: 'Molds',                    label: 'Καλούπια',                    category: 'catalog',    primaryKey: 'code',        primaryKeyType: 'string',  includeInCsv: true  },
    { table: 'materials',                displayName: 'Materials',                label: 'Υλικά',                       category: 'catalog',    primaryKey: 'id',          primaryKeyType: 'uuid',    includeInCsv: true,  dependsOn: ['suppliers'] },
    { table: 'collections',              displayName: 'Collections',              label: 'Συλλογές',                    category: 'catalog',    primaryKey: 'id',          primaryKeyType: 'integer', includeInCsv: true  },
    { table: 'products',                 displayName: 'Products',                 label: 'Προϊόντα',                    category: 'catalog',    primaryKey: 'sku',         primaryKeyType: 'string',  includeInCsv: true,  dependsOn: ['suppliers'] },
    { table: 'product_variants',         displayName: 'Product_Variants',         label: 'Παραλλαγές Προϊόντων',        category: 'catalog',    primaryKey: 'product_sku', primaryKeyType: 'string',  conflictTarget: 'product_sku,suffix', includeInCsv: true,  dependsOn: ['products'] },
    { table: 'recipes',                  displayName: 'Recipes',                  label: 'Συνταγές (BOM)',              category: 'catalog',    primaryKey: 'id',          primaryKeyType: 'uuid',    includeInCsv: true,  dependsOn: ['products', 'materials'] },
    { table: 'product_molds',            displayName: 'Product_Molds',            label: 'Καλούπια Προϊόντων',          category: 'catalog',    primaryKey: 'product_sku', primaryKeyType: 'string',  conflictTarget: 'product_sku,mold_code', includeInCsv: true,  dependsOn: ['products', 'molds'] },
    { table: 'product_collections',      displayName: 'Product_Collections',      label: 'Συλλογές Προϊόντων',          category: 'catalog',    primaryKey: 'product_sku', primaryKeyType: 'string',  conflictTarget: 'product_sku,collection_id', includeInCsv: true,  dependsOn: ['products', 'collections'] },
    { table: 'product_stock',            displayName: 'Product_Stock',            label: 'Απόθεμα ανά Αποθήκη',        category: 'catalog',    primaryKey: 'product_sku', primaryKeyType: 'string',  includeInCsv: true,  dependsOn: ['products', 'warehouses'] },
    { table: 'inventory_balances',       displayName: 'Inventory_Balances',       label: 'Υπόλοιπα Αποθήκης',          category: 'catalog',    primaryKey: 'product_sku', primaryKeyType: 'string',  conflictTarget: 'product_sku,variant_suffix,size_info,warehouse_id', includeInCsv: true, dependsOn: ['products', 'warehouses'] },
    { table: 'inventory_reorder_policies', displayName: 'Inventory_Reorder_Policies', label: 'Πολιτικές Αναπαραγγελίας', category: 'catalog', primaryKey: 'product_sku', primaryKeyType: 'string', conflictTarget: 'product_sku,variant_suffix,size_info,warehouse_id', includeInCsv: true, dependsOn: ['products', 'warehouses', 'suppliers'] },
    { table: 'stock_movements',          displayName: 'Stock_Movements',          label: 'Κινήσεις Αποθέματος',          category: 'catalog',    primaryKey: 'id',          primaryKeyType: 'uuid',    includeInCsv: true,  dependsOn: ['products', 'warehouses'] },
    { table: 'orders',                   displayName: 'Orders',                   label: 'Παραγγελίες',                 category: 'orders',     primaryKey: 'id',          primaryKeyType: 'uuid',    includeInCsv: true,  dependsOn: ['customers'] },
    { table: 'inventory_reservations',   displayName: 'Inventory_Reservations',   label: 'Δεσμεύσεις Αποθέματος',      category: 'orders',     primaryKey: 'id',          primaryKeyType: 'uuid',    includeInCsv: true, dependsOn: ['orders', 'products', 'warehouses'] },
    { table: 'order_delivery_plans',     displayName: 'Order_Delivery_Plans',     label: 'Σχέδια Παράδοσης',            category: 'orders',     primaryKey: 'id',          primaryKeyType: 'uuid',    includeInCsv: true,  dependsOn: ['orders'] },
    { table: 'order_delivery_reminders', displayName: 'Order_Delivery_Reminders', label: 'Υπενθυμίσεις Παράδοσης',      category: 'orders',     primaryKey: 'id',          primaryKeyType: 'uuid',    includeInCsv: true,  dependsOn: ['orders'] },
    { table: 'order_shipments',          displayName: 'Order_Shipments',          label: 'Αποστολές',                   category: 'orders',     primaryKey: 'id',          primaryKeyType: 'uuid',    includeInCsv: true,  dependsOn: ['orders'] },
    { table: 'order_shipment_items',     displayName: 'Order_Shipment_Items',     label: 'Είδη Αποστολής',              category: 'orders',     primaryKey: 'id',          primaryKeyType: 'uuid',    includeInCsv: true,  dependsOn: ['order_shipments'] },
    { table: 'inventory_shipment_allocations', displayName: 'Inventory_Shipment_Allocations', label: 'Κατανομές Εξαγωγών Αποθέματος', category: 'orders', primaryKey: 'id', primaryKeyType: 'uuid', includeInCsv: true, dependsOn: ['order_shipments', 'inventory_reservations'] },
    { table: 'legal_settings',           displayName: 'Legal_Settings',           label: 'Νομικές Ρυθμίσεις',           category: 'legal',      primaryKey: 'id',          primaryKeyType: 'uuid',    includeInCsv: false },
    { table: 'legal_numbering_sequences',displayName: 'Legal_Numbering',          label: 'Αρίθμηση Εγγράφων',            category: 'legal',      primaryKey: 'id',          primaryKeyType: 'uuid',    includeInCsv: true  },
    { table: 'legal_sync_runs',          displayName: 'Legal_Sync_Runs',          label: 'Εκτελέσεις Συγχρονισμού',     category: 'history',    primaryKey: 'id',          primaryKeyType: 'uuid',    includeInCsv: false },
    { table: 'legal_carriers',           displayName: 'Legal_Carriers',           label: 'Μεταφορείς',                  category: 'legal',      primaryKey: 'id',          primaryKeyType: 'uuid',    includeInCsv: true  },
    { table: 'legal_documents',          displayName: 'Legal_Documents',          label: 'Νομικά Έγγραφα',               category: 'legal',      primaryKey: 'id',          primaryKeyType: 'uuid',    includeInCsv: true,  dependsOn: ['customers', 'legal_carriers'] },
    { table: 'legal_document_lines',     displayName: 'Legal_Document_Lines',     label: 'Γραμμές Εγγράφων',            category: 'legal',      primaryKey: 'id',          primaryKeyType: 'uuid',    includeInCsv: true,  dependsOn: ['legal_documents'] },
    { table: 'legal_payments',           displayName: 'Legal_Payments',           label: 'Πληρωμές',                    category: 'legal',      primaryKey: 'id',          primaryKeyType: 'uuid',    includeInCsv: true,  dependsOn: ['legal_documents'] },
    { table: 'legal_transmissions',      displayName: 'Legal_Transmissions',      label: 'Μεταδόσεις ΑΑΔΕ',             category: 'history',    primaryKey: 'id',          primaryKeyType: 'uuid',    includeInCsv: false, dependsOn: ['legal_documents'] },
    { table: 'legal_delivery_events',    displayName: 'Legal_Delivery_Events',    label: 'Γεγονότα Παράδοσης',          category: 'history',    primaryKey: 'id',          primaryKeyType: 'uuid',    includeInCsv: false, dependsOn: ['legal_documents'] },
    { table: 'legal_audit_log',          displayName: 'Legal_Audit_Log',          label: 'Νομικό Ιστορικό',             category: 'history',    primaryKey: 'id',          primaryKeyType: 'uuid',    includeInCsv: false, dependsOn: ['legal_documents'] },
    { table: 'proforma_documents',       displayName: 'Proforma_Documents',       label: 'Προτιμολόγια',                category: 'legal',      primaryKey: 'id',          primaryKeyType: 'uuid',    includeInCsv: true,  dependsOn: ['customers'] },
    { table: 'proforma_document_lines',  displayName: 'Proforma_Lines',           label: 'Γραμμές Προτιμολογίων',       category: 'legal',      primaryKey: 'id',          primaryKeyType: 'uuid',    includeInCsv: true,  dependsOn: ['proforma_documents'] },
    { table: 'production_batches',       displayName: 'Production_Batches',       label: 'Παρτίδες Παραγωγής',          category: 'production', primaryKey: 'id',          primaryKeyType: 'uuid',    includeInCsv: true,  dependsOn: ['orders', 'products'] },
    { table: 'batch_stage_history',      displayName: 'Batch_Stage_History',      label: 'Ιστορικό Σταδίων',            category: 'history',    primaryKey: 'id',          primaryKeyType: 'uuid',    includeInCsv: false, dependsOn: ['production_batches'] },
    { table: 'offers',                   displayName: 'Offers',                   label: 'Προσφορές',                   category: 'commerce',   primaryKey: 'id',          primaryKeyType: 'uuid',    includeInCsv: true,  dependsOn: ['customers'] },
    { table: 'supplier_orders',          displayName: 'Supplier_Orders',          label: 'Παραγγελίες Προμηθευτών',     category: 'commerce',   primaryKey: 'id',          primaryKeyType: 'uuid',    includeInCsv: true,  dependsOn: ['suppliers'] },
    { table: 'price_snapshots',          displayName: 'Price_Snapshots',          label: 'Αντίγραφα Τιμών',             category: 'pricing',    primaryKey: 'id',          primaryKeyType: 'uuid',    includeInCsv: true  },
    { table: 'price_snapshot_items',     displayName: 'Price_Snapshot_Items',     label: 'Γραμμές Αντιγράφων Τιμών',    category: 'pricing',    primaryKey: 'id',          primaryKeyType: 'uuid',    includeInCsv: true,  dependsOn: ['price_snapshots'] },
    { table: 'audit_logs',               displayName: 'Audit_Logs',               label: 'Καταγραφή Ενεργειών',         category: 'history',    primaryKey: 'id',          primaryKeyType: 'uuid',    includeInCsv: false },
    { table: 'inventory_events',         displayName: 'Inventory_Events',         label: 'Ιστορικό Κινήσεων Αποθέματος', category: 'history', primaryKey: 'id', primaryKeyType: 'uuid', includeInCsv: true, dependsOn: ['products', 'warehouses'] },
    { table: 'inventory_command_results', displayName: 'Inventory_Command_Results', label: 'Ασφαλείς Επαναλήψεις Κινήσεων Αποθέματος', category: 'history', primaryKey: 'idempotency_key', primaryKeyType: 'string', includeInCsv: false },
    { table: 'inventory_cutover_balance_snapshot', displayName: 'Inventory_Cutover_Snapshot', label: 'Στιγμιότυπο Υπολοίπων Μετάβασης', category: 'history', primaryKey: 'snapshot_id', primaryKeyType: 'uuid', conflictTarget: 'snapshot_id,product_sku,variant_suffix,size_info,warehouse_id', includeInCsv: true },
    { table: 'inventory_reconciliation_issues', displayName: 'Inventory_Reconciliation', label: 'Έλεγχοι Συμφωνίας Αποθέματος', category: 'history', primaryKey: 'id', primaryKeyType: 'uuid', includeInCsv: true, dependsOn: ['products', 'warehouses'] },
];

export const ALL_BACKUP_TABLE_NAMES = BACKUP_TABLE_REGISTRY.map((e) => e.table);

export const HISTORY_TABLES = new Set([
    'audit_logs',
    'legal_sync_runs',
    'legal_transmissions',
    'legal_delivery_events',
    'legal_audit_log',
    'batch_stage_history',
    'inventory_events',
    'inventory_command_results',
    'inventory_cutover_balance_snapshot',
    'inventory_reconciliation_issues',
]);

// ─── Config & local extras ───────────────────────────────────────────────────

export const CONFIG_KEYS = [
    'VITE_SUPABASE_URL',
    'VITE_SUPABASE_ANON_KEY',
    'VITE_GEMINI_API_KEY',
    'ILIOS_LOCAL_MODE',
] as const;

export const SECRET_CONFIG_KEYS = new Set([
    'VITE_SUPABASE_ANON_KEY',
    'VITE_GEMINI_API_KEY',
]);

export const LOCAL_EXTRA_KEYS = [
    'orders-tag-color-overrides',
    'ilios:image-optimization-skipped:v1',
    'ilios:image-optimization-history:v1',
] as const;

// ─── Export / restore options ──────────────────────────────────────────────────

export interface BackupExportOptions {
    tables: string[];
    includeImages: boolean;
    includeConfig: boolean;
    includeConfigSecrets: boolean;
    includeSyncQueue: boolean;
    includeLocalExtras: boolean;
}

export interface BackupRestoreOptions {
    tables: string[];
    mode?: RestoreMode;
    includeImages: boolean;
    restoreConfig: boolean;
    includeSyncQueue: boolean;
    includeLocalExtras: boolean;
    onProgress?: ProgressCallback;
}

export interface BackupPreset {
    id: string;
    label: string;
    description: string;
    options: BackupExportOptions;
}

export function getDefaultExportOptions(): BackupExportOptions {
    return {
        tables: [...ALL_BACKUP_TABLE_NAMES],
        includeImages: true,
        includeConfig: true,
        includeConfigSecrets: false,
        includeSyncQueue: true,
        includeLocalExtras: true,
    };
}

export function getDefaultRestoreOptions(tables?: string[]): BackupRestoreOptions {
    return {
        tables: tables ?? [...ALL_BACKUP_TABLE_NAMES],
        mode: 'exact',
        includeImages: true,
        restoreConfig: false,
        includeSyncQueue: false,
        includeLocalExtras: true,
    };
}

export const BACKUP_PRESETS: BackupPreset[] = [
    {
        id: 'full',
        label: 'Πλήρες Σύστημα',
        description: 'Όλοι οι πίνακες, εικόνες, ρυθμίσεις και τοπικά extras',
        options: getDefaultExportOptions(),
    },
    {
        id: 'catalog',
        label: 'Κατάλογος & Απόθεμα',
        description: 'Προϊόντα, υλικά, απόθεμα και εικόνες',
        options: {
            tables: BACKUP_TABLE_REGISTRY.filter((e) => e.category === 'catalog' || e.category === 'settings' && ['warehouses', 'global_settings'].includes(e.table)).map((e) => e.table),
            includeImages: true,
            includeConfig: false,
            includeConfigSecrets: false,
            includeSyncQueue: false,
            includeLocalExtras: false,
        },
    },
    {
        id: 'orders_customers',
        label: 'Παραγγελίες & Πελάτες',
        description: 'Παραγγελίες, αποστολές και πελάτες',
        options: {
            tables: BACKUP_TABLE_REGISTRY.filter((e) => e.category === 'orders' || e.category === 'contacts').map((e) => e.table),
            includeImages: false,
            includeConfig: false,
            includeConfigSecrets: false,
            includeSyncQueue: false,
            includeLocalExtras: false,
        },
    },
    {
        id: 'legal',
        label: 'Νομικά Έγγραφα',
        description: 'Νομικά έγγραφα, proforma και σχετικά δεδομένα',
        options: {
            tables: BACKUP_TABLE_REGISTRY.filter((e) => e.category === 'legal' || e.category === 'history' && e.table.startsWith('legal_')).map((e) => e.table),
            includeImages: false,
            includeConfig: false,
            includeConfigSecrets: false,
            includeSyncQueue: false,
            includeLocalExtras: false,
        },
    },
    {
        id: 'migration',
        label: 'Μεταφορά σε Νέο Περιβάλλον',
        description: 'Πλήρη δεδομένα + ρυθμίσεις σύνδεσης (χωρίς API keys) + εικόνες + ουρά',
        options: {
            tables: [...ALL_BACKUP_TABLE_NAMES],
            includeImages: true,
            includeConfig: true,
            includeConfigSecrets: false,
            includeSyncQueue: true,
            includeLocalExtras: true,
        },
    },
    {
        id: 'minimal',
        label: 'Ελάχιστο (χωρίς ιστορικό)',
        description: 'Όλα εκτός από audit logs και νομικό ιστορικό',
        options: {
            tables: ALL_BACKUP_TABLE_NAMES.filter((t) => !HISTORY_TABLES.has(t)),
            includeImages: true,
            includeConfig: true,
            includeConfigSecrets: false,
            includeSyncQueue: true,
            includeLocalExtras: true,
        },
    },
];

// ─── Dependency resolution ─────────────────────────────────────────────────────

const REGISTRY_BY_TABLE = new Map(BACKUP_TABLE_REGISTRY.map((e) => [e.table, e]));

export function resolveTableDependencies(selected: string[]): string[] {
    const resolved = new Set<string>();
    const visit = (table: string) => {
        if (resolved.has(table)) return;
        const entry = REGISTRY_BY_TABLE.get(table);
        if (!entry) return;
        for (const dep of entry.dependsOn ?? []) visit(dep);
        resolved.add(table);
    };
    for (const table of selected) visit(table);
    return BACKUP_TABLE_REGISTRY.filter((e) => resolved.has(e.table)).map((e) => e.table);
}

export function resolveExportTables(options: BackupExportOptions): string[] {
    return resolveTableDependencies(options.tables);
}

export function getTablesByCategory(categoryId: BackupCategoryId): TableRegistryEntry[] {
    return BACKUP_TABLE_REGISTRY.filter((e) => e.category === categoryId);
}

export function getRegistryEntry(table: string): TableRegistryEntry | undefined {
    return REGISTRY_BY_TABLE.get(table);
}

export function orderTablesForRestore(tables: string[]): TableRegistryEntry[] {
    const set = new Set(tables);
    return BACKUP_TABLE_REGISTRY.filter((e) => set.has(e.table));
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface BackupMeta {
    version: number;
    format: string;
    created_at: string;
    table_counts: Record<string, number>;
    image_count: number;
    failed_images: string[];
    failed_tables?: string[];
    total_tables: number;
    is_local_mode: boolean;
    export_options?: BackupExportOptions;
}

export interface BackupEnvelope {
    _meta: BackupMeta;
    _manifest?: BackupManifestV4;
    _config?: Record<string, string>;
    _extras?: Record<string, unknown>;
    _images?: Record<string, string>;
    _sync_queue?: any[];
    _auth_users?: BackupAuthUser[];
    tables: Record<string, any[]>;
}

export interface RecoveryBackupOptions extends BackupExportOptions {
    passwordProtected: boolean;
}

export interface MigrationExportOptions {
    target: 'universal' | 'prisma-win';
    tables: string[];
    locale: string;
}

export type RestoreMode = 'exact' | 'merge' | 'replace-selected';

export type BackupTableStatus = 'exported' | 'empty' | 'failed';

export interface BackupTableManifestEntry {
    status: BackupTableStatus;
    row_count: number;
    sha256: string | null;
    error?: string;
}

export interface BackupManifestV4 {
    format: typeof BACKUP_FORMAT_MARKER;
    version: 4;
    created_at: string;
    complete: boolean;
    source: {
        app_version: string;
        schema_version: string;
        is_local_mode: boolean;
    };
    tables: Record<string, BackupTableManifestEntry>;
    images: {
        count: number;
        failed: string[];
    };
    recovery_checklist: string[];
}

export interface BackupAuthUser {
    id: string;
    email?: string | null;
    phone?: string | null;
    app_metadata?: Record<string, unknown>;
    user_metadata?: Record<string, unknown>;
    created_at?: string;
}

export interface BackupVerificationReport {
    valid: boolean;
    complete: boolean;
    errors: string[];
    warnings: string[];
    verifiedTables: string[];
}

export interface BackupCoverage {
    database: boolean;
    authUsers: boolean;
    images: boolean;
    configuration: boolean;
}

export interface AutomaticBackupRecord {
    key: string;
    size: number;
    uploaded: string;
    createdAt?: string;
    complete?: string;
    tableCount?: string;
    authUserCount?: string;
    imageCount?: string;
    reason?: string;
}

export type BackupProgressPhase = 'tables' | 'images' | 'config' | 'sync_queue' | 'extras' | 'validation' | 'cleanup';

export interface BackupProgress {
    phase: BackupProgressPhase;
    current: number;
    total: number;
    tableName?: string;
    message: string;
}

export type ProgressCallback = (progress: BackupProgress) => void;

/** @deprecated Use BackupRestoreOptions */
export interface RestoreOptions {
    restoreConfig?: boolean;
    onProgress?: ProgressCallback;
    tables?: string[];
    includeImages?: boolean;
    includeSyncQueue?: boolean;
    includeLocalExtras?: boolean;
}

export interface RestoreResult {
    errors: Array<{ table: string; message: string }>;
    restoredTables: string[];
    skippedTables: string[];
    imageFailures: string[];
    auth?: {
        recreated: Array<{ oldId: string; newId: string; email: string }>;
        passwordResetRequired: string[];
    };
}

export interface ValidationResult {
    valid: boolean;
    isEnvelope: boolean;
    version: number | null;
    summary: string;
    tableCounts: Record<string, number>;
    availableTables: string[];
    imageCount: number;
    hasConfig: boolean;
    hasSyncQueue: boolean;
    hasExtras: boolean;
    createdAt: string | null;
    exportOptions: BackupExportOptions | null;
    errors: string[];
    warnings: string[];
    /** @deprecated Use isEnvelope */
    isV2: boolean;
}

function collectTableCountsFromBackup(obj: Record<string, any>): Record<string, number> {
    const counts: Record<string, number> = {};
    const tables = obj.tables ?? obj;
    if (typeof tables !== 'object' || tables === null) return counts;

    for (const entry of BACKUP_TABLE_REGISTRY) {
        const arr = tables[entry.table];
        if (Array.isArray(arr)) counts[entry.table] = arr.length;
    }
    // Also count unknown tables present in backup
    for (const [key, val] of Object.entries(tables)) {
        if (!counts[key] && Array.isArray(val) && !key.startsWith('_')) {
            counts[key] = val.length;
        }
    }
    return counts;
}

// ─── Validation ──────────────────────────────────────────────────────────────

export function validateBackup(data: unknown): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const result: ValidationResult = {
        valid: false,
        isEnvelope: false,
        isV2: false,
        version: null,
        summary: '',
        tableCounts: {},
        availableTables: [],
        imageCount: 0,
        hasConfig: false,
        hasSyncQueue: false,
        hasExtras: false,
        createdAt: null,
        exportOptions: null,
        errors,
        warnings,
    };

    if (!data || typeof data !== 'object') {
        errors.push('Το αρχείο δεν περιέχει έγκυρα δεδομένα JSON.');
        return result;
    }

    const obj = data as Record<string, any>;

    if (obj._meta) {
        result.isEnvelope = true;
        result.isV2 = true;
        const meta = obj._meta as Partial<BackupMeta>;

        if (meta.format !== BACKUP_FORMAT_MARKER) {
            errors.push(`Μη αναγνωρισμένη μορφή backup: "${meta.format}".`);
        }
        result.version = typeof meta.version === 'number' ? meta.version : null;
        if (result.version !== null && result.version > BACKUP_VERSION) {
            errors.push(`Η έκδοση backup (v${result.version}) είναι νεότερη από αυτήν που υποστηρίζεται (v${BACKUP_VERSION}).`);
        }
        if (result.version === 4 && (!obj._manifest || typeof obj._manifest !== 'object')) {
            errors.push('Το backup v4 δεν περιέχει έγκυρο manifest ακεραιότητας.');
        }

        result.createdAt = meta.created_at || null;
        result.imageCount = typeof meta.image_count === 'number' ? meta.image_count : Object.keys(obj._images || {}).length;
        result.hasConfig = !!obj._config && Object.keys(obj._config).length > 0;
        result.hasSyncQueue = Array.isArray(obj._sync_queue) && obj._sync_queue.length > 0;
        result.hasExtras = !!obj._extras && Object.keys(obj._extras).length > 0;
        result.exportOptions = meta.export_options ?? null;

        if (!obj.tables || typeof obj.tables !== 'object') {
            errors.push('Το backup δεν περιέχει δεδομένα πινάκων (tables).');
        } else {
            result.tableCounts = collectTableCountsFromBackup(obj);
        }

        if (meta.failed_tables?.length) {
            warnings.push(`${meta.failed_tables.length} πίνακες απέτυχαν κατά την εξαγωγή.`);
        }
        if (meta.failed_images?.length) {
            warnings.push(`${meta.failed_images.length} εικόνες απέτυχαν κατά την εξαγωγή.`);
        }
    } else {
        result.tableCounts = collectTableCountsFromBackup(obj);
    }

    result.availableTables = Object.keys(result.tableCounts);
    const foundTables = result.availableTables.length;

    if (foundTables === 0) {
        errors.push('Δεν βρέθηκε κανένας αναγνωρίσιμος πίνακας στο backup.');
    }

    if (!('profiles' in result.tableCounts)) {
        warnings.push('Δεν περιλαμβάνονται προφίλ χρηστών (profiles). Οι λογαριασμοί Supabase Auth δεν μπορούν να εξαχθούν από τον browser.');
    }

    const missingFromFull = ALL_BACKUP_TABLE_NAMES.filter((t) => !(t in result.tableCounts));
    if (missingFromFull.length > 0 && missingFromFull.length < ALL_BACKUP_TABLE_NAMES.length) {
        warnings.push(`Μερικό backup: λείπουν ${missingFromFull.length} πίνακες από πλήρες σύστημα.`);
    }

    const totalRows = Object.values(result.tableCounts).reduce((a, b) => a + b, 0);
    const parts: string[] = [];
    parts.push(`${foundTables} πίνακες, ${totalRows} εγγραφές`);
    if (result.imageCount > 0) parts.push(`${result.imageCount} εικόνες`);
    if (result.hasConfig) parts.push('ρυθμίσεις σύνδεσης');
    if (result.hasSyncQueue) parts.push('εκκρεμείς αλλαγές');
    if (result.hasExtras) parts.push('τοπικά extras');
    result.summary = parts.join(' • ');

    result.valid = errors.length === 0;
    return result;
}

export function resolveRestoreTables(
    backup: BackupEnvelope | Record<string, any[]>,
    options?: Partial<BackupRestoreOptions>
): string[] {
    const isEnvelope = !!(backup as BackupEnvelope)._meta;
    const envelope = isEnvelope ? (backup as BackupEnvelope) : null;
    const tablesObj = isEnvelope ? envelope!.tables : (backup as Record<string, any[]>);

    let selected: string[];
    if (options?.tables?.length) {
        selected = options.tables;
    } else if (envelope?._meta?.export_options?.tables?.length) {
        selected = envelope._meta.export_options.tables;
    } else {
        selected = Object.keys(tablesObj).filter((k) => Array.isArray(tablesObj[k]));
    }

    return resolveTableDependencies(selected).filter((t) => Array.isArray(tablesObj[t]));
}

export function readConfigForExport(options: BackupExportOptions): Record<string, string> {
    if (!options.includeConfig) return {};
    const config: Record<string, string> = {};
    for (const key of CONFIG_KEYS) {
        if (!options.includeConfigSecrets && SECRET_CONFIG_KEYS.has(key)) continue;
        const val = localStorage.getItem(key);
        if (val !== null) config[key] = val;
    }
    return config;
}

export function readLocalExtras(): Record<string, unknown> {
    const extras: Record<string, unknown> = {};
    for (const key of LOCAL_EXTRA_KEYS) {
        const raw = localStorage.getItem(key);
        if (raw === null) continue;
        try {
            extras[key] = JSON.parse(raw);
        } catch {
            extras[key] = raw;
        }
    }
    return extras;
}

export function writeLocalExtras(extras: Record<string, unknown>): void {
    for (const key of LOCAL_EXTRA_KEYS) {
        if (!(key in extras)) continue;
        const val = extras[key];
        localStorage.setItem(key, typeof val === 'string' ? val : JSON.stringify(val));
    }
}
