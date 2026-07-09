import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { stableStringify } from './backupV4';
import { BackupEnvelope } from './backupConfig';
import {
    CanonicalMigration,
    MIGRATION_SCHEMAS,
    buildMigrationCsvFiles,
    buildPrismaCsvFiles,
    validateCanonicalMigration,
} from './migrationExport';

const ENCRYPTED_MAGIC = strToU8('ILIOSBKP4');
const SALT_BYTES = 16;
const IV_BYTES = 12;
const PBKDF2_ITERATIONS = 600_000;

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    return copy.buffer;
}

const README_EL = `ILIOS ERP — Πακέτο Μεταφοράς Δεδομένων

Τα αρχεία CSV είναι UTF-8 με BOM και σταθερή σειρά στηλών.
Το data.json είναι η πλήρης κανονικοποιημένη αναπαράσταση.
Ελέγξτε το validation-report.json πριν από οποιαδήποτε εισαγωγή.
`;

const README_EN = `ILIOS ERP — Data Transfer Package

CSV files use UTF-8 with BOM and a stable column order.
data.json is the complete canonical representation.
Review validation-report.json before importing into another system.
`;

const PRISMA_GUIDE = `PRISMA Win — Οδηγός Εισαγωγής ASCII

1. Ανοίξτε DBAdmin → Αρχεία → Εισαγωγή από αρχείο ASCII.
2. Επιλέξτε το αντίστοιχο αρχείο από αυτόν τον φάκελο.
3. Ορίστε διαχωριστικό το ελληνικό ερωτηματικό/semicolon (;), κωδικοποίηση UTF-8 και πρώτη γραμμή ως επικεφαλίδες.
4. Αντιστοιχίστε τα πεδία σύμφωνα με το schema.json.
5. Εκτελέστε πρώτα τον έλεγχο εγγραφών του PRISMA και διορθώστε όλες τις απορρίψεις.

Τα πεδία και οι κωδικοί που δεν αναγνωρίζονται αυτόματα απαιτούν αντιστοίχιση από τον διαχειριστή PRISMA.
Δεν γίνεται απευθείας εγγραφή στη βάση SQL Server.
`;

const ENTITY_LABELS_EL: Record<string, string> = {
    customers: 'Πελάτες',
    suppliers: 'Προμηθευτές',
    products: 'Προϊόντα',
    product_variants: 'Παραλλαγές προϊόντων',
    warehouses: 'Αποθήκες',
    product_stock: 'Απόθεμα ανά αποθήκη',
    materials: 'Υλικά',
    bom_lines: 'Γραμμές συνταγών / BOM',
    molds: 'Καλούπια',
    product_molds: 'Σύνδεση προϊόντων–καλουπιών',
    collections: 'Συλλογές',
    product_collections: 'Σύνδεση προϊόντων–συλλογών',
    orders: 'Παραγγελίες',
    order_lines: 'Γραμμές παραγγελιών',
    order_shipments: 'Αποστολές',
    order_shipment_items: 'Είδη αποστολών',
    production_batches: 'Παρτίδες παραγωγής',
    legal_documents: 'Νομικά παραστατικά',
    legal_document_lines: 'Γραμμές νομικών παραστατικών',
    legal_payments: 'Πληρωμές',
};

function buildDictionary(locale: 'el' | 'en') {
    return Object.fromEntries(Object.entries(MIGRATION_SCHEMAS).map(([entity, columns]) => [
        entity,
        {
            label: locale === 'el' ? (ENTITY_LABELS_EL[entity] ?? entity) : entity.replace(/_/g, ' '),
            columns: Object.fromEntries(columns.map((column) => [column, {
                label: column.replace(/_/g, ' '),
                nullable: true,
            }])),
        },
    ]));
}

export function createMigrationBundle(
    migration: CanonicalMigration,
    options: { includePrisma?: boolean } = {},
): Uint8Array {
    const csvFiles = buildMigrationCsvFiles(migration);
    const report = validateCanonicalMigration(migration);
    const manifest = {
        format: migration.format,
        version: migration.version,
        created_at: migration.created_at,
        locale: 'el-GR',
        encoding: 'UTF-8-BOM',
        entities: Object.fromEntries(
            Object.entries(migration.entities).map(([entity, rows]) => [entity, { rows: rows.length }]),
        ),
    };
    const files: Record<string, Uint8Array> = {
        'manifest.json': strToU8(stableStringify(manifest, 2)),
        'data.json': strToU8(stableStringify(migration, 2)),
        'schema.json': strToU8(stableStringify(MIGRATION_SCHEMAS, 2)),
        'data-dictionary-el.json': strToU8(stableStringify(buildDictionary('el'), 2)),
        'data-dictionary-en.json': strToU8(stableStringify(buildDictionary('en'), 2)),
        'README_EL.txt': strToU8(README_EL),
        'README_EN.txt': strToU8(README_EN),
        'validation-report.json': strToU8(stableStringify(report, 2)),
    };
    Object.entries(csvFiles).forEach(([name, content]) => {
        files[`csv/${name}`] = strToU8(content);
    });
    if (options.includePrisma) {
        Object.entries(buildPrismaCsvFiles(migration)).forEach(([name, content]) => {
            files[`prisma/${name}`] = strToU8(content);
        });
        files['prisma/PRISMA_IMPORT_GUIDE_EL.txt'] = strToU8(PRISMA_GUIDE);
    }
    return zipSync(files, { level: 6 });
}

interface RecoveryImageIndexEntry {
    path: string;
    mime: string;
}

function decodeDataUrl(dataUrl: string): { mime: string; bytes: Uint8Array } {
    const match = dataUrl.match(/^data:([^;,]+);base64,(.*)$/s);
    if (!match) throw new Error('Unsupported image payload in backup.');
    const binary = atob(match[2]);
    return {
        mime: match[1],
        bytes: Uint8Array.from(binary, (character) => character.charCodeAt(0)),
    };
}

function bytesToBase64(bytes: Uint8Array): string {
    let binary = '';
    for (let index = 0; index < bytes.length; index += 32_768) {
        binary += String.fromCharCode(...bytes.subarray(index, index + 32_768));
    }
    return btoa(binary);
}

async function sha256Bytes(bytes: Uint8Array): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', toArrayBuffer(bytes));
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function extensionForMime(mime: string): string {
    if (mime === 'image/png') return 'png';
    if (mime === 'image/webp') return 'webp';
    if (mime === 'image/gif') return 'gif';
    return 'jpg';
}

export async function createRecoveryBundle(backup: BackupEnvelope): Promise<Uint8Array> {
    const { _images, ...dataWithoutImages } = backup;
    const files: Record<string, Uint8Array> = {
        'manifest.json': strToU8(stableStringify(backup._manifest ?? backup._meta, 2)),
        'data.json': strToU8(stableStringify(dataWithoutImages, 2)),
    };
    const imageIndex: Record<string, RecoveryImageIndexEntry> = {};
    const storedPaths = new Set<string>();
    for (const [filename, dataUrl] of Object.entries(_images ?? {})) {
        const { mime, bytes } = decodeDataUrl(dataUrl);
        const hash = await sha256Bytes(bytes);
        const path = `images/${hash}.${extensionForMime(mime)}`;
        imageIndex[filename] = { path, mime };
        if (!storedPaths.has(path)) {
            files[path] = bytes;
            storedPaths.add(path);
        }
    }
    files['image-index.json'] = strToU8(stableStringify(imageIndex, 2));
    return zipSync(files, { level: 6 });
}

export function readRecoveryBundle(bytes: Uint8Array): BackupEnvelope {
    const files = unzipSync(bytes);
    if (!files['data.json']) throw new Error('Recovery package does not contain data.json.');
    const backup = JSON.parse(strFromU8(files['data.json'])) as BackupEnvelope;
    const imageIndex = files['image-index.json']
        ? JSON.parse(strFromU8(files['image-index.json'])) as Record<string, RecoveryImageIndexEntry>
        : {};
    const images: Record<string, string> = {};
    for (const [filename, entry] of Object.entries(imageIndex)) {
        const imageBytes = files[entry.path];
        if (!imageBytes) throw new Error(`Recovery package image is missing: ${entry.path}`);
        images[filename] = `data:${entry.mime};base64,${bytesToBase64(imageBytes)}`;
    }
    if (Object.keys(images).length) backup._images = images;
    return backup;
}

async function derivePasswordKey(password: string, salt: Uint8Array, usage: KeyUsage[]): Promise<CryptoKey> {
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(password),
        'PBKDF2',
        false,
        ['deriveKey'],
    );
    return crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt: toArrayBuffer(salt), iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false,
        usage,
    );
}

export async function encryptBackupPackage(bytes: Uint8Array, password: string): Promise<Uint8Array> {
    if (password.length < 8) throw new Error('Backup password must contain at least 8 characters.');
    const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
    const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
    const key = await derivePasswordKey(password, salt, ['encrypt']);
    const encrypted = new Uint8Array(await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: toArrayBuffer(iv) },
        key,
        toArrayBuffer(bytes),
    ));
    const result = new Uint8Array(ENCRYPTED_MAGIC.length + 1 + SALT_BYTES + IV_BYTES + encrypted.length);
    result.set(ENCRYPTED_MAGIC, 0);
    result[ENCRYPTED_MAGIC.length] = 1;
    result.set(salt, ENCRYPTED_MAGIC.length + 1);
    result.set(iv, ENCRYPTED_MAGIC.length + 1 + SALT_BYTES);
    result.set(encrypted, ENCRYPTED_MAGIC.length + 1 + SALT_BYTES + IV_BYTES);
    return result;
}

export async function decryptBackupPackage(bytes: Uint8Array, password: string): Promise<Uint8Array> {
    const header = bytes.slice(0, ENCRYPTED_MAGIC.length);
    if (!header.every((byte, index) => byte === ENCRYPTED_MAGIC[index])) {
        throw new Error('Not an encrypted Ilios backup package.');
    }
    const version = bytes[ENCRYPTED_MAGIC.length];
    if (version !== 1) throw new Error(`Unsupported encrypted backup version: ${version}`);
    const saltStart = ENCRYPTED_MAGIC.length + 1;
    const ivStart = saltStart + SALT_BYTES;
    const dataStart = ivStart + IV_BYTES;
    const salt = bytes.slice(saltStart, ivStart);
    const iv = bytes.slice(ivStart, dataStart);
    const encrypted = bytes.slice(dataStart);
    const key = await derivePasswordKey(password, salt, ['decrypt']);
    const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: toArrayBuffer(iv) },
        key,
        toArrayBuffer(encrypted),
    );
    return new Uint8Array(decrypted);
}

export function isEncryptedBackupPackage(bytes: Uint8Array): boolean {
    return bytes.length >= ENCRYPTED_MAGIC.length
        && ENCRYPTED_MAGIC.every((byte, index) => bytes[index] === byte);
}

export async function readBackupBytes(bytes: Uint8Array, password?: string): Promise<BackupEnvelope | Record<string, any[]>> {
    if (isEncryptedBackupPackage(bytes)) {
        if (!password) throw new Error('PASSWORD_REQUIRED');
        return readBackupBytes(await decryptBackupPackage(bytes, password));
    }
    const firstTextByte = bytes.find((byte) => ![9, 10, 13, 32].includes(byte));
    if (firstTextByte === 0x7b) {
        return JSON.parse(new TextDecoder().decode(bytes));
    }
    return readRecoveryBundle(bytes);
}
