// Encrypted local vault: holds the in-memory KeyRing (passphrase + derived
// keys) and reads/writes the encrypted records in IndexedDB.
import { KeyRing, KDF_ITERATIONS, randomBytes } from '../lib/crypto';
import { bytesToB64 } from '../lib/b64';
import { emptyLocal, normaliseLocal, type LocalData } from '../lib/config';
import { getEnvelope, putEnvelope } from '../lib/db';
import type { Feed } from '../lib/types';

type Session = { ring: KeyRing; localSalt: string };
let session: Session | null = null;

export function isUnlocked(): boolean {
  return session !== null;
}

export function ring(): KeyRing {
  if (!session) throw new Error('Locked');
  return session.ring;
}

export function lockSession(): void {
  session?.ring.clear();
  session = null;
}

/** First run: create a vault with a fresh local salt. */
export async function createVault(passphrase: string): Promise<LocalData> {
  const local = emptyLocal();
  session = { ring: new KeyRing(passphrase), localSalt: bytesToB64(randomBytes(16)) };
  await saveLocal(local);
  return local;
}

/** Unlock: derive the key for the stored salt and decrypt. Throws DecryptError on wrong passphrase. */
export async function unlockVault(passphrase: string): Promise<{ local: LocalData; feed: Feed | null }> {
  const env = await getEnvelope('local');
  if (!env) throw new Error('No local data found on this device.');
  const r = new KeyRing(passphrase);
  const local = normaliseLocal(await r.decryptJson<Partial<LocalData>>(env));
  session = { ring: r, localSalt: env.salt };
  let feed: Feed | null = null;
  try {
    const fenv = await getEnvelope('feed');
    if (fenv) feed = await r.decryptJson<Feed>(fenv);
  } catch {
    feed = null;
  }
  return { local, feed };
}

export async function saveLocal(local: LocalData): Promise<void> {
  if (!session) return;
  await putEnvelope('local', await session.ring.encryptLocal(session.localSalt, JSON.stringify(local)));
}

export async function saveFeedCache(feed: Feed): Promise<void> {
  if (!session) return;
  await putEnvelope('feed', await session.ring.encryptLocal(session.localSalt, JSON.stringify(feed)));
}

/** Re-key everything with a new passphrase and a new local salt. */
export async function rekeyVault(newPassphrase: string, local: LocalData, feed: Feed | null): Promise<void> {
  lockSession();
  session = { ring: new KeyRing(newPassphrase), localSalt: bytesToB64(randomBytes(16)) };
  await saveLocal(local);
  if (feed) await saveFeedCache(feed);
}

export const LOCAL_ITERATIONS = KDF_ITERATIONS;
