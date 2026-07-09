
import {
    BackupEnvelope,
    BackupExportOptions,
    BackupMeta,
    BackupRestoreOptions,
    BACKUP_FORMAT_MARKER,
    BACKUP_VERSION,
    ProgressCallback,
    resolveExportTables,
    resolveRestoreTables,
    orderTablesForRestore,
    readConfigForExport,
    readLocalExtras,
    writeLocalExtras,
    getRegistryEntry,
    BACKUP_TABLE_REGISTRY,
    RestoreMode,
} from './backupConfig';

export interface ImageExportResult {
    images: Record<string, string>;
    failedImages: string[];
}

export interface ImageRestoreResult {
    failures: string[];
}

function blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            if (typeof reader.result === 'string') resolve(reader.result);
            else reject(new Error('Failed to convert blob'));
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

export function collectProductImageUrls(
    products: any[],
    publicImageBaseUrl: string
): Map<string, string> {
    const uniqueUrls = new Map<string, string>();
    for (const p of products) {
        const url = p.image_url;
        if (!url || typeof url !== 'string') continue;
        if (url.startsWith('data:')) continue;
        if (url.includes('picsum.photos')) continue;
        try {
            const parts = url.split('/');
            const filename = decodeURIComponent(parts[parts.length - 1]);
            if (filename && filename.trim() !== '') {
                uniqueUrls.set(filename, `${publicImageBaseUrl}/${encodeURIComponent(filename)}`);
            }
        } catch { /* skip malformed URLs */ }
    }
    return uniqueUrls;
}

export async function exportProductImages(
    products: any[],
    publicImageBaseUrl: string,
    onProgress?: ProgressCallback
): Promise<ImageExportResult> {
    const images: Record<string, string> = {};
    const failedImages: string[] = [];
    const uniqueUrls = collectProductImageUrls(products, publicImageBaseUrl);
    const imageEntries = Array.from(uniqueUrls.entries());
    const totalImages = imageEntries.length;
    const CONCURRENCY = 10;

    for (let i = 0; i < totalImages; i += CONCURRENCY) {
        const batch = imageEntries.slice(i, i + CONCURRENCY);
        const results = await Promise.allSettled(
            batch.map(async ([filename, url]) => {
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 8000);
                try {
                    const resp = await fetch(url, { signal: controller.signal });
                    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
                    const blob = await resp.blob();
                    return { filename, dataUrl: await blobToDataUrl(blob) };
                } finally {
                    clearTimeout(timeout);
                }
            })
        );
        results.forEach((r, idx) => {
            if (r.status === 'fulfilled') {
                images[r.value.filename] = r.value.dataUrl;
            } else {
                failedImages.push(batch[idx]?.[0] || 'unknown');
            }
        });
        onProgress?.({
            phase: 'images',
            current: Math.min(i + CONCURRENCY, totalImages),
            total: totalImages,
            message: `Λήψη εικόνων (${Math.min(i + CONCURRENCY, totalImages)}/${totalImages})...`,
        });
    }

    return { images, failedImages };
}

export async function restoreProductImagesToCloud(
    images: Record<string, string>,
    uploadFn: (filename: string, blob: Blob) => Promise<void>,
    onProgress?: ProgressCallback
): Promise<ImageRestoreResult> {
    const failures: string[] = [];
    const imageEntries = Object.entries(images);
    const totalImages = imageEntries.length;

    for (let i = 0; i < totalImages; i++) {
        const [filename, dataUrl] = imageEntries[i];
        onProgress?.({
            phase: 'images',
            current: i + 1,
            total: totalImages,
            message: `Ανέβασμα εικόνων (${i + 1}/${totalImages})...`,
        });
        try {
            const resp = await fetch(dataUrl);
            const blob = await resp.blob();
            await uploadFn(filename, blob);
        } catch {
            failures.push(filename);
        }
    }

    return { failures };
}

export async function patchLocalProductImages(
    imageMap: Record<string, string>,
    getProducts: () => Promise<any[]>,
    saveProducts: (products: any[]) => Promise<void>
): Promise<boolean> {
    if (!Object.keys(imageMap).length) return false;
    const products = await getProducts();
    let updated = false;
    for (const p of products) {
        if (p.image_url && typeof p.image_url === 'string' && !p.image_url.startsWith('data:')) {
            try {
                const parts = p.image_url.split('/');
                const filename = decodeURIComponent(parts[parts.length - 1]);
                if (imageMap[filename]) {
                    p.image_url = imageMap[filename];
                    updated = true;
                }
            } catch { /* skip */ }
        }
    }
    if (updated) await saveProducts(products);
    return updated;
}

export interface BuildEnvelopeParams {
    tableData: Record<string, any[]>;
    failedTables: string[];
    options: BackupExportOptions;
    images: Record<string, string>;
    failedImages: string[];
    config: Record<string, string>;
    extras: Record<string, unknown>;
    syncQueue: any[];
    isLocalMode: boolean;
}

export function buildBackupEnvelope(params: BuildEnvelopeParams): BackupEnvelope {
    const { tableData, failedTables, options, images, failedImages, config, extras, syncQueue, isLocalMode } = params;
    const tableCounts: Record<string, number> = {};
    for (const [key, arr] of Object.entries(tableData)) {
        tableCounts[key] = arr.length;
    }

    const meta: BackupMeta = {
        version: BACKUP_VERSION,
        format: BACKUP_FORMAT_MARKER,
        created_at: new Date().toISOString(),
        table_counts: tableCounts,
        image_count: Object.keys(images).length,
        failed_images: failedImages,
        failed_tables: failedTables,
        total_tables: Object.keys(tableData).length,
        is_local_mode: isLocalMode,
        export_options: options,
    };

    const envelope: BackupEnvelope = { _meta: meta, tables: tableData };

    if (options.includeConfig && Object.keys(config).length > 0) envelope._config = config;
    if (options.includeImages && Object.keys(images).length > 0) envelope._images = images;
    if (options.includeSyncQueue && syncQueue.length > 0) envelope._sync_queue = syncQueue;
    if (options.includeLocalExtras && Object.keys(extras).length > 0) envelope._extras = extras;

    return envelope;
}

export function prepareExportPlan(options: BackupExportOptions) {
    const tables = resolveExportTables(options);
    const includeImages = options.includeImages && tables.includes('products');
    return { tables, includeImages };
}

export function prepareRestorePlan(
    backup: BackupEnvelope | Record<string, any[]>,
    options: BackupRestoreOptions
) {
    const tables = resolveRestoreTables(backup, options);
    const orderedEntries = orderTablesForRestore(tables);
    const isEnvelope = !!(backup as BackupEnvelope)._meta;
    const envelope = isEnvelope ? (backup as BackupEnvelope) : null;
    const tablesObj = isEnvelope ? envelope!.tables : (backup as Record<string, any[]>);
    const includeImages = options.includeImages && tables.includes('products') && !!envelope?._images;
    return { tables, orderedEntries, envelope, tablesObj, includeImages };
}

export async function deleteTableRows(
    deleteFn: (table: string, primaryKey: string, primaryKeyType: string) => Promise<void>,
    table: string
): Promise<void> {
    const entry = getRegistryEntry(table);
    if (!entry) return;
    await deleteFn(entry.table, entry.primaryKey, entry.primaryKeyType);
}

export interface RestoreImpact {
    mode: RestoreMode;
    requestedTables: string[];
    applyTables: string[];
    destructiveTables: string[];
}

export function buildRestoreImpact(
    availableTables: string[],
    requestedTables: string[],
    mode: RestoreMode,
): RestoreImpact {
    const available = new Set(availableTables);
    const requested = requestedTables.filter((table) => available.has(table));
    if (mode === 'exact') {
        const all = BACKUP_TABLE_REGISTRY
            .map((entry) => entry.table)
            .filter((table) => available.has(table));
        return { mode, requestedTables: requested, applyTables: all, destructiveTables: all };
    }

    const target = new Set(requested);
    if (mode === 'replace-selected') {
        let changed = true;
        while (changed) {
            changed = false;
            for (const entry of BACKUP_TABLE_REGISTRY) {
                if (!available.has(entry.table) || target.has(entry.table)) continue;
                if ((entry.dependsOn ?? []).some((dependency) => target.has(dependency))) {
                    target.add(entry.table);
                    changed = true;
                }
            }
        }
    }
    const applyTables = resolveRestoreTables(
        Object.fromEntries(availableTables.map((table) => [table, []])),
        { tables: [...target] },
    );
    return {
        mode,
        requestedTables: requested,
        applyTables,
        destructiveTables: mode === 'replace-selected'
            ? BACKUP_TABLE_REGISTRY.map((entry) => entry.table).filter((table) => target.has(table))
            : [],
    };
}

export function assertMutationSucceeded(
    result: { error?: { message?: string; code?: string } | null } | null | undefined,
    table: string,
    operation: string,
): void {
    if (!result) throw new Error(`${table}: ${operation} returned no result`);
    if (result.error) {
        const code = result.error.code ? ` (${result.error.code})` : '';
        throw new Error(`${table}: ${operation} failed${code}: ${result.error.message ?? 'unknown error'}`);
    }
}

export function mergeRowsByConflict<T extends Record<string, any>>(
    existing: T[],
    incoming: T[],
    conflictTarget: string,
): T[] {
    const keys = conflictTarget.split(',').map((key) => key.trim()).filter(Boolean);
    const identity = (row: T) => keys.map((key) => JSON.stringify(row?.[key] ?? null)).join('|');
    const merged = new Map(existing.map((row) => [identity(row), row]));
    incoming.forEach((row) => merged.set(identity(row), row));
    return [...merged.values()];
}

export { readConfigForExport, readLocalExtras, writeLocalExtras, resolveRestoreTables, orderTablesForRestore };
