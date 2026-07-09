import {
    BACKUP_FORMAT_MARKER,
    BACKUP_VERSION,
    BackupAuthUser,
    BackupEnvelope,
    BackupExportOptions,
    BackupManifestV4,
    BackupVerificationReport,
} from './backupConfig';

interface FailedTable {
    table: string;
    message: string;
}

export interface BuildBackupV4Input {
    tables: Record<string, any[]>;
    requestedTables: string[];
    failedTables: FailedTable[];
    options: BackupExportOptions;
    images: Record<string, string>;
    failedImages: string[];
    config: Record<string, string>;
    extras: Record<string, unknown>;
    syncQueue: any[];
    authUsers: BackupAuthUser[];
    isLocalMode: boolean;
    source: {
        appVersion: string;
        schemaVersion: string;
    };
}

function normalizeJson(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(normalizeJson);
    if (value && typeof value === 'object') {
        return Object.keys(value as Record<string, unknown>)
            .sort()
            .reduce<Record<string, unknown>>((result, key) => {
                const normalized = normalizeJson((value as Record<string, unknown>)[key]);
                if (normalized !== undefined) result[key] = normalized;
                return result;
            }, {});
    }
    return value;
}

export function stableStringify(value: unknown, spacing?: number): string {
    return JSON.stringify(normalizeJson(value), null, spacing);
}

export async function sha256Json(value: unknown): Promise<string> {
    const bytes = new TextEncoder().encode(stableStringify(value));
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function sha256Rows(rows: unknown[]): Promise<string> {
    const canonicalRows = rows.map((row) => stableStringify(row)).sort((left, right) => left.localeCompare(right));
    const bytes = new TextEncoder().encode(`[${canonicalRows.join(',')}]`);
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function buildBackupV4(input: BuildBackupV4Input): Promise<BackupEnvelope> {
    const createdAt = new Date().toISOString();
    const failedByTable = new Map(input.failedTables.map((failure) => [failure.table, failure.message]));
    const manifestTables: BackupManifestV4['tables'] = {};

    for (const table of input.requestedTables) {
        const error = failedByTable.get(table);
        const rows = input.tables[table];
        if (error || !Array.isArray(rows)) {
            manifestTables[table] = {
                status: 'failed',
                row_count: 0,
                sha256: null,
                error: error ?? 'Table data was not returned',
            };
            continue;
        }
        manifestTables[table] = {
            status: rows.length === 0 ? 'empty' : 'exported',
            row_count: rows.length,
            sha256: await sha256Rows(rows),
        };
    }

    const complete = Object.values(manifestTables).every((entry) => entry.status !== 'failed')
        && input.failedImages.length === 0;
    const tableCounts = Object.fromEntries(
        Object.entries(manifestTables).map(([table, entry]) => [table, entry.row_count]),
    );
    const manifest: BackupManifestV4 = {
        format: BACKUP_FORMAT_MARKER,
        version: 4,
        created_at: createdAt,
        complete,
        source: {
            app_version: input.source.appVersion,
            schema_version: input.source.schemaVersion,
            is_local_mode: input.isLocalMode,
        },
        tables: manifestTables,
        images: {
            count: Object.keys(input.images).length,
            failed: [...input.failedImages],
        },
        recovery_checklist: [
            'Re-enter infrastructure credentials after recovery.',
            'Users recreated outside a platform restore must reset their passwords.',
            'Verify Worker, R2, Auth, Realtime, and AADE configuration.',
        ],
    };

    const envelope: BackupEnvelope = {
        _meta: {
            version: BACKUP_VERSION,
            format: BACKUP_FORMAT_MARKER,
            created_at: createdAt,
            table_counts: tableCounts,
            image_count: Object.keys(input.images).length,
            failed_images: [...input.failedImages],
            failed_tables: input.failedTables.map((failure) => failure.table),
            total_tables: input.requestedTables.length,
            is_local_mode: input.isLocalMode,
            export_options: input.options,
        },
        _manifest: manifest,
        tables: input.tables,
    };
    if (Object.keys(input.images).length) envelope._images = input.images;
    if (Object.keys(input.config).length) envelope._config = input.config;
    if (Object.keys(input.extras).length) envelope._extras = input.extras;
    if (input.syncQueue.length) envelope._sync_queue = input.syncQueue;
    if (input.authUsers.length) envelope._auth_users = input.authUsers;
    return envelope;
}

export async function migrateBackupToV4(backup: BackupEnvelope | Record<string, any[]>): Promise<BackupEnvelope> {
    if ((backup as BackupEnvelope)._meta?.version === 4 && (backup as BackupEnvelope)._manifest) {
        return backup as BackupEnvelope;
    }
    const envelope = (backup as BackupEnvelope)._meta ? backup as BackupEnvelope : null;
    const tables = envelope?.tables ?? backup as Record<string, any[]>;
    const requestedTables = Object.keys(tables).filter((key) => Array.isArray(tables[key]));
    const failedTables = (envelope?._meta.failed_tables ?? []).map((table) => ({
        table,
        message: 'The source backup reported an export failure',
    }));
    return buildBackupV4({
        tables,
        requestedTables,
        failedTables,
        options: envelope?._meta.export_options ?? {
            tables: requestedTables,
            includeImages: !!envelope?._images,
            includeConfig: !!envelope?._config,
            includeConfigSecrets: false,
            includeSyncQueue: !!envelope?._sync_queue,
            includeLocalExtras: !!envelope?._extras,
        },
        images: envelope?._images ?? {},
        failedImages: envelope?._meta.failed_images ?? [],
        config: envelope?._config ?? {},
        extras: envelope?._extras ?? {},
        syncQueue: envelope?._sync_queue ?? [],
        authUsers: envelope?._auth_users ?? [],
        isLocalMode: envelope?._meta.is_local_mode ?? true,
        source: { appVersion: 'legacy', schemaVersion: `backup-v${envelope?._meta.version ?? 1}` },
    });
}

export async function verifyBackupV4(backup: BackupEnvelope): Promise<BackupVerificationReport> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const verifiedTables: string[] = [];
    const manifest = backup._manifest;
    if (!manifest || manifest.version !== 4 || manifest.format !== BACKUP_FORMAT_MARKER) {
        return {
            valid: false,
            complete: false,
            errors: ['Missing or unsupported v4 manifest'],
            warnings,
            verifiedTables,
        };
    }
    for (const [table, entry] of Object.entries(manifest.tables)) {
        if (entry.status === 'failed') {
            errors.push(`${table}: ${entry.error ?? 'export failed'}`);
            continue;
        }
        const rows = backup.tables[table];
        if (!Array.isArray(rows)) {
            errors.push(`${table}: table payload is missing`);
            continue;
        }
        if (rows.length !== entry.row_count) {
            errors.push(`${table}: row count does not match the manifest`);
            continue;
        }
        const digest = await sha256Rows(rows);
        if (digest !== entry.sha256) {
            errors.push(`${table}: checksum does not match the manifest`);
            continue;
        }
        verifiedTables.push(table);
    }
    if (manifest.images.failed.length) {
        warnings.push(`${manifest.images.failed.length} images failed during export`);
    }
    return {
        valid: errors.length === 0,
        complete: manifest.complete && errors.length === 0,
        errors,
        warnings,
        verifiedTables,
    };
}
