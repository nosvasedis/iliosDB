export interface CanonicalMigration {
    format: 'ilios_erp_migration';
    version: 1;
    created_at: string;
    entities: Record<string, Record<string, unknown>[]>;
}

export interface MigrationValidationIssue {
    severity: 'error' | 'warning';
    code: 'duplicate_key' | 'required_value' | 'broken_reference' | 'invalid_value';
    entity: string;
    row: number;
    message: string;
}

export interface MigrationValidationReport {
    valid: boolean;
    issue_count: number;
    issues: MigrationValidationIssue[];
}

type Schema = Record<string, readonly string[]>;

export const MIGRATION_SCHEMAS: Schema = {
    customers: ['id', 'full_name', 'phone', 'email', 'address', 'vat_number', 'vat_rate', 'notes', 'created_at'],
    suppliers: ['id', 'name', 'contact_person', 'phone', 'email', 'address', 'notes'],
    products: ['sku', 'prefix', 'category', 'description', 'gender', 'weight_g', 'secondary_weight_g', 'production_type', 'supplier_id', 'supplier_sku', 'supplier_cost', 'active_price', 'selling_price', 'stock_qty', 'sample_qty', 'is_component', 'created_at'],
    product_variants: ['product_sku', 'suffix', 'description', 'stock_qty', 'active_price', 'selling_price'],
    warehouses: ['id', 'name', 'type', 'category', 'address', 'is_system', 'updated_at', 'updated_by'],
    product_stock: ['product_sku', 'warehouse_id', 'variant_suffix', 'size_info', 'quantity'],
    inventory_balances: ['product_sku', 'variant_suffix', 'size_info', 'warehouse_id', 'on_hand', 'reserved', 'version', 'updated_at'],
    inventory_reorder_policies: ['product_sku', 'variant_suffix', 'size_info', 'warehouse_id', 'reorder_point', 'preferred_supplier_id', 'updated_at'],
    inventory_reservations: ['id', 'order_id', 'order_line_id', 'product_sku', 'variant_suffix', 'size_info', 'warehouse_id', 'initial_quantity', 'quantity', 'state', 'created_at', 'updated_at', 'released_at', 'consumed_at'],
    inventory_events: ['id', 'sequence_no', 'operation_type', 'product_sku', 'variant_suffix', 'size_info', 'warehouse_id', 'on_hand_delta', 'reserved_delta', 'on_hand_after', 'reserved_after', 'reference_type', 'reference_id', 'reference_line_id', 'transfer_group_id', 'reversal_of', 'actor_user_id', 'actor_name', 'reason', 'idempotency_key', 'created_at'],
    inventory_command_results: ['idempotency_key', 'operation_type', 'result', 'actor_user_id', 'created_at'],
    inventory_cutover_balance_snapshot: ['snapshot_id', 'captured_at', 'product_sku', 'variant_suffix', 'size_info', 'warehouse_id', 'on_hand', 'reserved'],
    inventory_shipment_allocations: ['id', 'shipment_id', 'shipment_item_id', 'reservation_id', 'product_sku', 'variant_suffix', 'size_info', 'warehouse_id', 'quantity', 'issue_event_id', 'created_at'],
    inventory_reconciliation_issues: ['id', 'issue_type', 'severity', 'product_sku', 'variant_suffix', 'size_info', 'warehouse_id', 'expected_quantity', 'actual_quantity', 'details', 'resolved_at', 'resolved_by', 'resolution_note', 'created_at'],
    materials: ['id', 'name', 'description', 'type', 'cost_per_unit', 'unit', 'supplier_id', 'stock_qty', 'stones_per_strand'],
    bom_lines: ['product_sku', 'line_number', 'item_type', 'material_id', 'component_sku', 'quantity'],
    molds: ['code', 'location', 'description', 'weight_g'],
    product_molds: ['product_sku', 'mold_code', 'quantity'],
    collections: ['id', 'name', 'description'],
    product_collections: ['product_sku', 'collection_id'],
    orders: ['id', 'customer_id', 'customer_name', 'seller_id', 'seller_name', 'created_at', 'status', 'total_price', 'vat_rate', 'discount_percent', 'notes', 'is_archived'],
    order_lines: ['order_id', 'line_number', 'line_id', 'sku', 'variant_suffix', 'size_info', 'quantity', 'price_at_order', 'price_override', 'cord_color', 'enamel_color', 'notes'],
    order_shipments: ['id', 'order_id', 'shipment_number', 'shipped_at', 'shipped_by', 'delivery_plan_id', 'notes', 'created_at'],
    order_shipment_items: ['id', 'shipment_id', 'sku', 'variant_suffix', 'size_info', 'quantity', 'price_at_order', 'line_id'],
    production_batches: ['id', 'order_id', 'sku', 'variant_suffix', 'quantity', 'current_stage', 'priority', 'type', 'created_at', 'updated_at', 'notes'],
    legal_documents: ['id', 'kind', 'status', 'series', 'number', 'issue_date', 'customer_id', 'order_id', 'net_total', 'vat_total', 'gross_total', 'mark', 'uid'],
    legal_document_lines: ['id', 'document_id', 'line_number', 'sku', 'description', 'quantity', 'unit_price', 'net_value', 'vat_rate', 'vat_value', 'gross_value'],
    legal_payments: ['id', 'document_id', 'method', 'amount', 'paid_at', 'notes'],
};

function pick(row: Record<string, any>, columns: readonly string[]): Record<string, unknown> {
    return Object.fromEntries(columns.map((column) => [column, row[column] ?? null]));
}

function tableRows(input: Record<string, any>, table: string): Record<string, any>[] {
    return Array.isArray(input[table]) ? input[table] : [];
}

export function buildCanonicalMigration(input: Record<string, any>): CanonicalMigration {
    const entities: Record<string, Record<string, unknown>[]> = {};
    for (const [entity, columns] of Object.entries(MIGRATION_SCHEMAS)) {
        entities[entity] = tableRows(input, entity).map((row) => pick(row, columns));
    }

    const products = tableRows(input, 'products');
    if (!entities.product_variants.length) {
        entities.product_variants = products.flatMap((product) =>
            (Array.isArray(product.variants) ? product.variants : []).map((variant: Record<string, any>) =>
                pick({ product_sku: product.sku, ...variant }, MIGRATION_SCHEMAS.product_variants),
            ),
        );
    }
    if (!entities.bom_lines.length) {
        entities.bom_lines = products.flatMap((product) =>
            (Array.isArray(product.recipe) ? product.recipe : []).map((item: Record<string, any>, index: number) =>
                pick({
                    product_sku: product.sku,
                    line_number: index + 1,
                    item_type: item.type,
                    material_id: item.type === 'raw' ? item.id : null,
                    component_sku: item.type === 'component' ? item.sku : null,
                    quantity: item.quantity,
                }, MIGRATION_SCHEMAS.bom_lines),
            ),
        );
    }
    if (!entities.product_molds.length) {
        entities.product_molds = products.flatMap((product) =>
            (Array.isArray(product.molds) ? product.molds : []).map((mold: Record<string, any>) =>
                pick({ product_sku: product.sku, mold_code: mold.code, quantity: mold.quantity }, MIGRATION_SCHEMAS.product_molds),
            ),
        );
    }
    if (!entities.product_collections.length) {
        entities.product_collections = products.flatMap((product) =>
            (Array.isArray(product.collections) ? product.collections : []).map((collectionId: number) =>
                pick({ product_sku: product.sku, collection_id: collectionId }, MIGRATION_SCHEMAS.product_collections),
            ),
        );
    }
    if (!entities.order_lines.length) {
        entities.order_lines = tableRows(input, 'orders').flatMap((order) =>
            (Array.isArray(order.items) ? order.items : []).map((item: Record<string, any>, index: number) =>
                pick({ order_id: order.id, line_number: index + 1, ...item }, MIGRATION_SCHEMAS.order_lines),
            ),
        );
    }
    return {
        format: 'ilios_erp_migration',
        version: 1,
        created_at: new Date().toISOString(),
        entities,
    };
}

function formatCell(value: unknown, decimalComma = false): string {
    if (value === null || value === undefined) return '';
    if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
    if (typeof value === 'number') {
        const text = Number.isFinite(value) ? String(value) : '';
        return decimalComma ? text.replace('.', ',') : text;
    }
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
}

function encodeCsv(
    rows: Record<string, unknown>[],
    columns: readonly string[],
    delimiter: ',' | ';',
    decimalComma = false,
): string {
    const escape = (value: unknown) => {
        const text = formatCell(value, decimalComma);
        if (text.includes(delimiter) || /["\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
        return text;
    };
    return `\uFEFF${[
        columns.join(delimiter),
        ...rows.map((row) => columns.map((column) => escape(row[column])).join(delimiter)),
    ].join('\r\n')}`;
}

export function buildMigrationCsvFiles(migration: CanonicalMigration): Record<string, string> {
    return Object.fromEntries(
        Object.entries(MIGRATION_SCHEMAS).map(([entity, columns]) => [
            `${entity}.csv`,
            encodeCsv(migration.entities[entity] ?? [], columns, ','),
        ]),
    );
}

export function buildPrismaCsvFiles(migration: CanonicalMigration): Record<string, string> {
    const customers = migration.entities.customers ?? [];
    const suppliers = migration.entities.suppliers ?? [];
    const products = migration.entities.products ?? [];
    const stock = migration.entities.product_stock ?? [];
    const customerColumns = ['id', 'full_name', 'phone', 'email', 'address', 'vat_number', 'vat_rate', 'notes'] as const;
    const supplierColumns = ['id', 'name', 'contact_person', 'phone', 'email', 'address', 'notes'] as const;
    const itemColumns = ['sku', 'description', 'category', 'supplier_sku', 'weight_g', 'production_type'] as const;
    const stockColumns = ['product_sku', 'warehouse_id', 'variant_suffix', 'quantity'] as const;
    const priceRows = products.map((product) => ({ sku: product.sku, selling_price: product.selling_price }));
    return {
        'prisma_customers.csv': encodeCsv(customers, customerColumns, ';', true),
        'prisma_suppliers.csv': encodeCsv(suppliers, supplierColumns, ';', true),
        'prisma_items.csv': encodeCsv(products, itemColumns, ';', true),
        'prisma_stock.csv': encodeCsv(stock, stockColumns, ';', true),
        'prisma_prices.csv': encodeCsv(priceRows, ['sku', 'selling_price'], ';', true),
    };
}

export function validateCanonicalMigration(migration: CanonicalMigration): MigrationValidationReport {
    const issues: MigrationValidationIssue[] = [];
    const required: Record<string, string[]> = {
        customers: ['id', 'full_name'],
        suppliers: ['id', 'name'],
        products: ['sku'],
        product_variants: ['product_sku', 'suffix'],
        warehouses: ['id', 'name'],
        product_stock: ['product_sku', 'warehouse_id', 'quantity'],
        materials: ['id', 'name'],
        orders: ['id'],
        order_lines: ['order_id', 'sku', 'quantity'],
        order_shipments: ['id', 'order_id'],
        production_batches: ['id', 'sku'],
        legal_documents: ['id'],
        legal_document_lines: ['id', 'document_id'],
    };
    const uniqueKeys: Record<string, string[]> = {
        customers: ['id'],
        suppliers: ['id'],
        products: ['sku'],
        product_variants: ['product_sku', 'suffix'],
        warehouses: ['id'],
        materials: ['id'],
        orders: ['id'],
        order_shipments: ['id'],
        production_batches: ['id'],
        legal_documents: ['id'],
        legal_document_lines: ['id'],
    };

    for (const [entity, columns] of Object.entries(required)) {
        (migration.entities[entity] ?? []).forEach((row, index) => {
            columns.forEach((column) => {
                if (row[column] === null || row[column] === undefined || row[column] === '') {
                    issues.push({
                        severity: 'error',
                        code: 'required_value',
                        entity,
                        row: index + 1,
                        message: `Missing required value: ${column}`,
                    });
                }
            });
        });
    }
    for (const [entity, columns] of Object.entries(uniqueKeys)) {
        const seen = new Set<string>();
        (migration.entities[entity] ?? []).forEach((row, index) => {
            const key = columns.map((column) => JSON.stringify(row[column] ?? null)).join('|');
            if (seen.has(key)) {
                issues.push({
                    severity: 'error',
                    code: 'duplicate_key',
                    entity,
                    row: index + 1,
                    message: `Duplicate key: ${columns.join(', ')}`,
                });
            }
            seen.add(key);
        });
    }

    const references: Array<[string, string, string, string]> = [
        ['orders', 'customer_id', 'customers', 'id'],
        ['order_lines', 'order_id', 'orders', 'id'],
        ['order_lines', 'sku', 'products', 'sku'],
        ['product_variants', 'product_sku', 'products', 'sku'],
        ['product_stock', 'product_sku', 'products', 'sku'],
        ['product_stock', 'warehouse_id', 'warehouses', 'id'],
        ['bom_lines', 'product_sku', 'products', 'sku'],
        ['order_shipments', 'order_id', 'orders', 'id'],
        ['production_batches', 'order_id', 'orders', 'id'],
        ['production_batches', 'sku', 'products', 'sku'],
        ['legal_document_lines', 'document_id', 'legal_documents', 'id'],
    ];
    for (const [entity, column, targetEntity, targetColumn] of references) {
        const targets = new Set((migration.entities[targetEntity] ?? []).map((row) => row[targetColumn]));
        (migration.entities[entity] ?? []).forEach((row, index) => {
            const value = row[column];
            if (value !== null && value !== undefined && value !== '' && !targets.has(value)) {
                issues.push({
                    severity: 'warning',
                    code: 'broken_reference',
                    entity,
                    row: index + 1,
                    message: `${column} does not reference ${targetEntity}.${targetColumn}: ${value}`,
                });
            }
        });
    }
    return {
        valid: !issues.some((issue) => issue.severity === 'error'),
        issue_count: issues.length,
        issues,
    };
}
