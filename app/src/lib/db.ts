// IndexedDB storage. Every value stored here is an encryption envelope
// (CONTRACT §2 format) — nothing is kept in plaintext on the device.
import { openDB, type IDBPDatabase } from 'idb';
import type { Envelope } from './types';

const DB_NAME = 'arbitrage';
const STORE = 'vault';

export type VaultKey = 'local' | 'feed';

let dbp: Promise<IDBPDatabase> | null = null;
function db(): Promise<IDBPDatabase> {
  if (!dbp) {
    dbp = openDB(DB_NAME, 1, {
      upgrade(d) {
        if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE);
      },
    });
  }
  return dbp;
}

export async function getEnvelope(key: VaultKey): Promise<Envelope | undefined> {
  return (await db()).get(STORE, key) as Promise<Envelope | undefined>;
}

export async function putEnvelope(key: VaultKey, env: Envelope): Promise<void> {
  await (await db()).put(STORE, env, key);
}

export async function deleteEnvelope(key: VaultKey): Promise<void> {
  await (await db()).delete(STORE, key);
}

export async function hasVault(): Promise<boolean> {
  try {
    return (await getEnvelope('local')) !== undefined;
  } catch {
    return false;
  }
}

export async function wipeDatabase(): Promise<void> {
  if (dbp) {
    (await dbp).close();
    dbp = null;
  }
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = req.onerror = req.onblocked = () => resolve();
  });
}
