
/**
 * Simple IndexedDB wrapper for mirroring Supabase data locally.
 * This ensures "Zero-Lag" loading and "Offline-Read" capability.
 * Includes a "Sync Queue" for offline writes.
 */

import { isInspectionModeActive } from './inspectionMode';
export interface InspectionLocalSnapshot { tables: [IDBValidKey, any][]; queue: any[] }
export interface InspectionVaultMetadata { id: string; localKeys?: string[]; localHashes?: string[] }
const VAULT_META = '__inspection_vault';
const isInspectionKey = (key: IDBValidKey) => typeof key === 'string' && key.startsWith('inspection:v1:');
function assertWritable(key?: IDBValidKey) {
    if (isInspectionModeActive() && (!key || !isInspectionKey(key))) throw new Error('Τα τοπικά δεδομένα της κανονικής εφαρμογής είναι κλειδωμένα.');
}
const DB_NAME = 'IliosERP_Offline_Mirror';
const DB_VERSION = 3;
const STORE_NAME = 'table_cache';
const SYNC_STORE = 'sync_queue';

const openDB = (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event: any) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
            if (!db.objectStoreNames.contains(SYNC_STORE)) {
                db.createObjectStore(SYNC_STORE, { keyPath: 'id', autoIncrement: true });
            }
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
};

export const offlineDb = {
    getInspectionVault: async (): Promise<InspectionVaultMetadata | null> => offlineDb.getValue(VAULT_META),
    readInspectionLocalSnapshot: async (): Promise<InspectionLocalSnapshot> => {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction([STORE_NAME, SYNC_STORE], 'readonly');
            const tables = tx.objectStore(STORE_NAME);
            const keys = tables.getAllKeys(); const values = tables.getAll(); const queue = tx.objectStore(SYNC_STORE).getAll();
            tx.oncomplete = () => resolve({ tables: keys.result.map((key, i) => [key, values.result[i]] as [IDBValidKey, any]).filter(([key]) => key !== VAULT_META && !isInspectionKey(key)), queue: queue.result });
            tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
        });
    },
    replaceInspectionLocalSnapshot: async (expected: InspectionLocalSnapshot, replacement: InspectionLocalSnapshot, vault: InspectionVaultMetadata | null): Promise<void> => {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction([STORE_NAME, SYNC_STORE], 'readwrite');
            const tables = tx.objectStore(STORE_NAME); const queueStore = tx.objectStore(SYNC_STORE);
            const keys = tables.getAllKeys(); const values = tables.getAll(); const queue = queueStore.getAll();
            let completed = 0; let conflict = false;
            const compareAndWrite = () => {
                if (++completed !== 3) return;
                const current = { tables: keys.result.map((key, i) => [key, values.result[i]]).filter(([key]) => key !== VAULT_META && !isInspectionKey(key)), queue: queue.result };
                if (JSON.stringify(current) !== JSON.stringify(expected)) { conflict = true; tx.abort(); return; }
                const replacementKeys = new Set(replacement.tables.map(([key]) => key));
                expected.tables.forEach(([key]) => { if (!replacementKeys.has(key)) tables.delete(key); });
                replacement.tables.forEach(([key, value]) => tables.put(value, key));
                replacement.queue.forEach(value => queueStore.put(value));
                if (vault) tables.put(vault, VAULT_META); else tables.delete(VAULT_META);
            };
            keys.onsuccess = compareAndWrite; values.onsuccess = compareAndWrite; queue.onsuccess = compareAndWrite;
            tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(conflict ? new Error('Τα τοπικά δεδομένα άλλαξαν κατά τη μετάβαση. Ανανεώστε για ασφαλή επανάληψη· καμία εργασία δεν διαγράφηκε.') : tx.error);
        });
    },
    saveValue: async <T>(key: string, value: T): Promise<void> => {
        assertWritable(key);
        const db = await openDB();
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(value, key);
        return new Promise<void>((resolve, reject) => {
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(tx.error);
        });
    },

    getValue: async <T>(key: string): Promise<T | null> => {
        try {
            const db = await openDB();
            const tx = db.transaction(STORE_NAME, 'readonly');
            const request = tx.objectStore(STORE_NAME).get(key);
            return await new Promise<T | null>((resolve, reject) => {
                request.onsuccess = () => resolve((request.result as T | undefined) ?? null);
                request.onerror = () => reject(request.error);
            });
        } catch (error) {
            console.warn(`Local Mirror Read Failed [${key}]:`, error);
            return null;
        }
    },

    saveTable: async (tableName: string, data: any[]) => {
        assertWritable(tableName);
        try {
            const db = await openDB();
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            store.put(data, tableName);
            return new Promise((resolve, reject) => {
                tx.oncomplete = () => resolve(true);
                tx.onerror = () => reject(tx.error);
            });
        } catch (e) {
            console.warn(`Local Mirror Save Failed [${tableName}]:`, e);
        }
    },

    saveTablesAtomic: async (tables: Record<string, any[]>) => {
        assertWritable();
        const db = await openDB();
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        Object.entries(tables).forEach(([tableName, data]) => store.put(data, tableName));
        return new Promise<void>((resolve, reject) => {
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(tx.error);
        });
    },

    getTable: async (tableName: string): Promise<any[] | null> => {
        if (isInspectionModeActive()) throw new Error('Τα παλιά τοπικά αντίγραφα είναι κλειδωμένα. Χρησιμοποιήστε τα στοιχεία της λειτουργίας ελέγχου.');
        try {
            const db = await openDB();
            const tx = db.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const request = store.get(tableName);

            return new Promise((resolve, reject) => {
                request.onsuccess = () => resolve(request.result || null);
                request.onerror = () => reject(request.error);
            });
        } catch (e) {
            console.warn(`Local Mirror Read Failed [${tableName}]:`, e);
            return null;
        }
    },

    enqueue: async (operation: { type: string, table: string, method: 'INSERT' | 'UPDATE' | 'DELETE' | 'UPSERT', data: any, match?: Record<string, any>, onConflict?: string, ignoreDuplicates?: boolean, noSelect?: boolean }): Promise<number> => {
        assertWritable();
        const db = await openDB();
        const tx = db.transaction(SYNC_STORE, 'readwrite');
        const store = tx.objectStore(SYNC_STORE);
        const request = store.add({
            ...operation,
            timestamp: new Date().toISOString()
        });

        return new Promise((resolve, reject) => {
            request.onsuccess = (event: any) => resolve(event.target.result);
            request.onerror = () => reject(request.error);
        });
    },

    getQueue: async (): Promise<any[]> => {
        if (isInspectionModeActive()) throw new Error('Οι εκκρεμείς εργασίες είναι κλειδωμένες μέχρι την έξοδο με PIN.');
        const db = await openDB();
        const tx = db.transaction(SYNC_STORE, 'readonly');
        const store = tx.objectStore(SYNC_STORE);
        const request = store.getAll();
        return new Promise((resolve) => {
            request.onsuccess = () => resolve(request.result);
        });
    },

    getQueueCount: async (): Promise<number> => {
        const db = await openDB();
        const tx = db.transaction(SYNC_STORE, 'readonly');
        const store = tx.objectStore(SYNC_STORE);
        const request = store.count();
        return new Promise((resolve) => {
            request.onsuccess = () => resolve(request.result);
        });
    },

    dequeue: async (id: number) => {
        assertWritable();
        const db = await openDB();
        const tx = db.transaction(SYNC_STORE, 'readwrite');
        tx.objectStore(SYNC_STORE).delete(id);
        return new Promise<void>((resolve, reject) => {
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    },

    clearAll: async () => {
        assertWritable();
        const db = await openDB();
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).clear();
        const tx2 = db.transaction(SYNC_STORE, 'readwrite');
        tx2.objectStore(SYNC_STORE).clear();
    },

    clearSyncQueue: async () => {
        assertWritable();
        const db = await openDB();
        const tx = db.transaction(SYNC_STORE, 'readwrite');
        tx.objectStore(SYNC_STORE).clear();
        return new Promise<void>((resolve, reject) => {
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    },

    purgeTablesExcept: async (allowedTables: Set<string>) => {
        assertWritable();
        const db = await openDB();
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const keys = await new Promise<IDBValidKey[]>((resolve, reject) => {
            const request = store.getAllKeys();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
        for (const key of keys) {
            if (typeof key === 'string' && !allowedTables.has(key)) {
                store.delete(key);
            }
        }
        return new Promise<void>((resolve, reject) => {
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    },
};
