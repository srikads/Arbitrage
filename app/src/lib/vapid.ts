// VAPID key generation per CONTRACT §4: P-256, public = base64url uncompressed
// point (65 bytes), private = base64url raw 32-byte scalar (JWK `d`).
import { b64urlToBytes, bytesToB64url } from './b64';

export type VapidKeys = { publicKey: string; privateKey: string };

export async function generateVapidKeys(): Promise<VapidKeys> {
  const pair = (await globalThis.crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
  const raw = new Uint8Array(await globalThis.crypto.subtle.exportKey('raw', pair.publicKey));
  const jwk = await globalThis.crypto.subtle.exportKey('jwk', pair.privateKey);
  if (!jwk.d) throw new Error('Private key export failed');
  const d = b64urlToBytes(jwk.d);
  if (raw.length !== 65 || raw[0] !== 0x04) throw new Error('Unexpected public key format');
  if (d.length !== 32) throw new Error('Unexpected private key length');
  return { publicKey: bytesToB64url(raw), privateKey: bytesToB64url(d) };
}

/** applicationServerKey for PushManager.subscribe. */
export function vapidPublicKeyBytes(publicKey: string): Uint8Array<ArrayBuffer> {
  const bytes = b64urlToBytes(publicKey);
  const out = new Uint8Array(new ArrayBuffer(bytes.length));
  out.set(bytes);
  return out;
}
