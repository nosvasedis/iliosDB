import { offlineDb, type InspectionLocalSnapshot } from './offlineDb';
import { api } from './supabase';
const LOCAL_BACKUP = '__inspection_local_storage_backup';
const essentialLocalKeys = new Set(['_ilm','ILIOS_LOCAL_MODE','VITE_SUPABASE_URL','VITE_SUPABASE_ANON_KEY','ilios-react-query-cache']);
function businessLocalStorage(): [string, string][] {
  const values: [string, string][] = [];
  for (let index=0;index<localStorage.length;index++) {
    const key=localStorage.key(index);
    if (!key || essentialLocalKeys.has(key) || key.startsWith('sb-') || key === 'supabase.auth.token') continue;
    const value=localStorage.getItem(key); if (value !== null) values.push([key,value]);
  }
  return values;
}
const valueHash = async (value: string) => encode(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))));
async function finishLocalStorageSeal(vault: { localKeys?: string[]; localHashes?: string[] }): Promise<void> {
  for (let index=0;index<(vault.localKeys?.length || 0);index++) {
    const key=vault.localKeys![index]; const value=localStorage.getItem(key);
    if (value === null) continue;
    if (await valueHash(value) !== vault.localHashes?.[index] || localStorage.getItem(key) !== value) {
      const error = new Error('Ένα τοπικό πρόχειρο άλλαξε κατά τη μετάβαση και διατηρήθηκε. Απαιτείται έξοδος με PIN και επανάληψη για πλήρη κρυπτογράφηση.');
      error.name = 'InspectionSealError';
      throw error;
    }
    // The full original value is already durably encrypted in the same vault.
    localStorage.removeItem(key);
  }
}

export const isSealedValue = (value: any): boolean => value?.__inspection_encrypted === 1;
const encode = (bytes: Uint8Array) => btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(''));
const decode = (value: string) => Uint8Array.from(atob(value), (c) => c.charCodeAt(0));

export async function transformVault(snapshot: InspectionLocalSnapshot, keyText: string, vaultId: string, restore = false): Promise<InspectionLocalSnapshot> {
  const key = await crypto.subtle.importKey('raw', decode(keyText), 'AES-GCM', false, [restore ? 'decrypt' : 'encrypt']);
  const convert = async (value: any, context: string): Promise<any> => {
    const additionalData = new TextEncoder().encode(`${vaultId}:${context}`);
    if (restore) {
      if (!isSealedValue(value) || value.vaultId !== vaultId) throw new Error('Το τοπικό αντίγραφο δεν αντιστοιχεί στο κλειδί αποδέσμευσης.');
      const bytes = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: decode(value.iv), additionalData }, key, decode(value.data));
      return JSON.parse(new TextDecoder().decode(bytes));
    }
    if (isSealedValue(value)) throw new Error('Υπάρχει ήδη κρυπτογραφημένο τοπικό αντίγραφο.');
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const bytes = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData }, key, new TextEncoder().encode(JSON.stringify(value)));
    return { __inspection_encrypted: 1, vaultId, iv: encode(iv), data: encode(new Uint8Array(bytes)) };
  };
  return {
    tables: await Promise.all(snapshot.tables.map(async ([name, value]) => [name, await convert(value, `table:${name}`)] as [IDBValidKey, any])),
    queue: await Promise.all(snapshot.queue.map(async (value) => restore ? convert(value, `queue:${value.id}`) : ({ ...await convert(value, `queue:${value.id}`), id: value.id }))),
  };
}

let sealing: Promise<void> | null = null;
export async function sealInspectionLocalData(): Promise<void> {
  if (sealing) return sealing;
  sealing = (async () => {
    const existing = await offlineDb.getInspectionVault();
    if (existing) { await api.enterInspectionSession(); await finishLocalStorageSeal(existing); return; }
    const snapshot = await offlineDb.readInspectionLocalSnapshot();
    const localValues = businessLocalStorage();
    const id = crypto.randomUUID();
    const key = encode(crypto.getRandomValues(new Uint8Array(32)));
    const encrypted = await transformVault({ ...snapshot, tables: [...snapshot.tables, [LOCAL_BACKUP, localValues]] }, key, id);
    const vault = { id, localKeys: localValues.map(([name]) => name), localHashes: await Promise.all(localValues.map(([,value]) => valueHash(value))) };
    // Persist the recovery key on the server before replacing any local record.
    // It is never written to browser storage and can only be released with the PIN.
    await api.enterInspectionSession({ id, key });
    localStorage.setItem('_ilm', '1');
    await offlineDb.replaceInspectionLocalSnapshot(snapshot, encrypted, vault);
    await finishLocalStorageSeal(vault);
  })();
  try { await sealing; } finally { sealing = null; }
}

export async function restoreInspectionLocalData(key: string | undefined, id: string): Promise<void> {
  if (!key) throw new Error('Δεν ανακτήθηκε το κλειδί του τοπικού αντιγράφου. Η λειτουργία παραμένει κλειδωμένη.');
  const snapshot = await offlineDb.readInspectionLocalSnapshot();
  const restored = await transformVault(snapshot, key, id, true);
  const locals = restored.tables.find(([name]) => name === LOCAL_BACKUP)?.[1] as [string, string][] | undefined;
  for (const [name,value] of locals || []) {
    // Preserve a newer draft written by another tab during a failed transition.
    if (localStorage.getItem(name) === null) localStorage.setItem(name,value);
  }
  restored.tables = restored.tables.filter(([name]) => name !== LOCAL_BACKUP);
  await offlineDb.replaceInspectionLocalSnapshot(snapshot, restored, null);
}
