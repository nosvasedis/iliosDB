/**
 * Simple IndexedDB wrapper for mirroring Supabase data locally.
 * This ensures "Zero-Lag" loading and "Offline-Read" capability.
 * Includes a "Sync Queue" for offline writes.
 */

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
    saveTable: async (tableName: string, data: any[]) => {
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

    getTable: async (tableName: string): Promise<any[] | null> => {
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

    enqueue: async (operation: { type: string, table: string, method: 'INSERT' | 'UPDATE' | 'DELETE' | 'UPSERT', data: any, match?: Record<string, any>, onConflict?: string }) => {
        const db = await openDB();
        const tx = db.transaction(SYNC_STORE, 'readwrite');
        tx.objectStore(SYNC_STORE).add({ 
            ...operation, 
            timestamp: new Date().toISOString() 
        });
    },

    getQueue: async (): Promise<any[]> => {
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
        const db = await openDB();
        const tx = db.transaction(SYNC_STORE, 'readwrite');
        tx.objectStore(SYNC_STORE).delete(id);
    },

    clearAll: async () => {
        const db = await openDB();
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).clear();
        const tx2 = db.transaction(SYNC_STORE, 'readwrite');
        tx2.objectStore(SYNC_STORE).clear();
    }
};