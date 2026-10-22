// Envelope encryption per CONTRACT §2:
// AES-256-GCM, key = PBKDF2-HMAC-SHA256(passphrase, salt, iter, 32 bytes), no AAD.
import { b64ToBytes, bytesToB64 } from './b64';
import type { Envelope } from './types';

export const KDF_ITERATIONS = 600_000;

const subtle = (): SubtleCrypto => globalThis.crypto.subtle;

/** Copy into a fresh ArrayBuffer-backed view (keeps WebCrypto typings happy). */
function buf(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(new ArrayBuffer(bytes.length));
  out.set(bytes);
  return out;
}

export function randomBytes(n: number): Uint8Array<ArrayBuffer> {
  return globalThis.crypto.getRandomValues(new Uint8Array(new ArrayBuffer(n)));
}

export async function deriveKey(passphrase: string, salt: Uint8Array, iter = KDF_ITERATIONS): Promise<CryptoKey> {
  const base = await subtle().importKey('raw', buf(new TextEncoder().encode(passphrase)), 'PBKDF2', false, ['deriveKey']);
  return subtle().deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: buf(salt), iterations: iter }, base, { name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ]);
}

export function isEnvelope(x: unknown): x is Envelope {
  if (!x || typeof x !== 'object') return false;
  const e = x as Record<string, unknown>;
  return (
    e.v === 1 &&
    e.alg === 'AES-256-GCM' &&
    e.kdf === 'PBKDF2-SHA256' &&
    typeof e.iter === 'number' &&
    typeof e.salt === 'string' &&
    typeof e.iv === 'string' &&
    typeof e.ct === 'string'
  );
}

/** Encrypt with an already-derived key (the salt is recorded for later derivation). */
export async function encryptWithKey(key: CryptoKey, salt: Uint8Array, plaintext: string, iter = KDF_ITERATIONS): Promise<Envelope> {
  const iv = randomBytes(12);
  const ct = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv }, key, buf(new TextEncoder().encode(plaintext))));
  return { v: 1, alg: 'AES-256-GCM', kdf: 'PBKDF2-SHA256', iter, salt: bytesToB64(salt), iv: bytesToB64(iv), ct: bytesToB64(ct) };
}

export async function decryptWithKey(key: CryptoKey, env: Envelope): Promise<string> {
  const pt = await subtle().decrypt({ name: 'AES-GCM', iv: buf(b64ToBytes(env.iv)) }, key, buf(b64ToBytes(env.ct)));
  return new TextDecoder().decode(pt);
}

/** Fresh random salt + IV, as required for every file written to the repo. */
export async function encrypt(passphrase: string, plaintext: string, iter = KDF_ITERATIONS): Promise<Envelope> {
  const salt = randomBytes(16);
  const key = await deriveKey(passphrase, salt, iter);
  return encryptWithKey(key, salt, plaintext, iter);
}

export class DecryptError extends Error {
  constructor(message = 'Could not decrypt: wrong passphrase or corrupted data') {
    super(message);
    this.name = 'DecryptError';
  }
}

/**
 * Small cache of derived keys keyed by salt+iter, so repeated decrypts of the
 * same envelope (e.g. unchanged feed) don't redo 600k PBKDF2 rounds. Lives in
 * memory only and is cleared on lock.
 */
export class KeyRing {
  private cache = new Map<string, Promise<CryptoKey>>();
  constructor(private passphrase: string) {}

  key(saltB64: string, iter: number): Promise<CryptoKey> {
    const id = `${iter}:${saltB64}`;
    let p = this.cache.get(id);
    if (!p) {
      p = deriveKey(this.passphrase, b64ToBytes(saltB64), iter);
      this.cache.set(id, p);
      if (this.cache.size > 8) this.cache.delete(this.cache.keys().next().value as string);
    }
    return p;
  }

  async decrypt(env: Envelope): Promise<string> {
    if (!isEnvelope(env)) throw new DecryptError('Not an encryption envelope');
    try {
      return await decryptWithKey(await this.key(env.salt, env.iter), env);
    } catch {
      throw new DecryptError();
    }
  }

  async decryptJson<T>(env: Envelope): Promise<T> {
    return JSON.parse(await this.decrypt(env)) as T;
  }

  /** Repo writes: fresh salt + IV every time. */
  encryptFresh(plaintext: string): Promise<Envelope> {
    return encrypt(this.passphrase, plaintext);
  }

  /** Local writes: reuse a fixed local salt (key derived once per unlock), fresh IV. */
  async encryptLocal(saltB64: string, plaintext: string): Promise<Envelope> {
    const key = await this.key(saltB64, KDF_ITERATIONS);
    return encryptWithKey(key, b64ToBytes(saltB64), plaintext);
  }

  matches(passphrase: string): boolean {
    return passphrase === this.passphrase;
  }

  clear(): void {
    this.cache.clear();
    this.passphrase = '';
  }
}

export async function decrypt(passphrase: string, env: Envelope): Promise<string> {
  return new KeyRing(passphrase).decrypt(env);
}
