// Standard base64 (with padding) and base64url (no padding) helpers that work
// in browsers, service workers and Node without Buffer.

const ALPH = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const LOOKUP: Record<string, number> = {};
for (let i = 0; i < ALPH.length; i++) LOOKUP[ALPH[i]] = i;

export function bytesToB64(bytes: Uint8Array): string {
  let out = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out += ALPH[(n >> 18) & 63] + ALPH[(n >> 12) & 63] + ALPH[(n >> 6) & 63] + ALPH[n & 63];
  }
  const rest = bytes.length - i;
  if (rest === 1) {
    const n = bytes[i] << 16;
    out += ALPH[(n >> 18) & 63] + ALPH[(n >> 12) & 63] + '==';
  } else if (rest === 2) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8);
    out += ALPH[(n >> 18) & 63] + ALPH[(n >> 12) & 63] + ALPH[(n >> 6) & 63] + '=';
  }
  return out;
}

export function b64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/[\s=]/g, '').replace(/-/g, '+').replace(/_/g, '/');
  if (/[^A-Za-z0-9+/]/.test(clean)) throw new Error('Invalid base64');
  const len = Math.floor((clean.length * 3) / 4);
  const out = new Uint8Array(len);
  let buf = 0;
  let bits = 0;
  let j = 0;
  for (let i = 0; i < clean.length; i++) {
    buf = (buf << 6) | LOOKUP[clean[i]];
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[j++] = (buf >> bits) & 0xff;
    }
  }
  return out.subarray(0, j);
}

export function bytesToB64url(bytes: Uint8Array): string {
  return bytesToB64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export const b64urlToBytes = b64ToBytes;

export function utf8ToB64(text: string): string {
  return bytesToB64(new TextEncoder().encode(text));
}

export function b64ToUtf8(b64: string): string {
  return new TextDecoder().decode(b64ToBytes(b64));
}
