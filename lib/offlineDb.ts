
/**
 * Simple IndexedDB wrapper for mirroring Supabase data locally.
 * This ensures "Zero-Lag" loading and "Offline-Read" capability.
 */

const DB_NAME = 'IliosERP_Offline_Mirror';
const DB_VERSION = 1;
const STORE_NAME = 'table_cache';

const openDB = (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event: any) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
};

export const offlineDb = {
    /**
     * Saves a snapshot of a Supabase table to local storage.
     */
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

    /**
     * Retrieves the last known good snapshot of a table.
     */
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

    /**
     * Clears all local data (useful for hard resets).
     */
    clearAll: async () => {
        const db = await openDB();
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).clear();
    }
};
