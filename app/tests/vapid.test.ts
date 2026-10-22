import { describe, expect, it } from 'vitest';
import { b64urlToBytes, bytesToB64url } from '../src/lib/b64';
import { generateVapidKeys } from '../src/lib/vapid';

describe('VAPID key export (CONTRACT §4 PushTarget)', () => {
  it('exports a 65-byte uncompressed public point and a 32-byte private scalar, base64url', async () => {
    const k = await generateVapidKeys();
    expect(k.publicKey).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(k.privateKey).toMatch(/^[A-Za-z0-9_-]+$/);
    const pub = b64urlToBytes(k.publicKey);
    const priv = b64urlToBytes(k.privateKey);
    expect(pub).toHaveLength(65);
    expect(pub[0]).toBe(0x04);
    expect(priv).toHaveLength(32);
    expect(k.publicKey).toHaveLength(87);
    expect(k.privateKey).toHaveLength(43);
  });

  it('the private scalar belongs to the public point (sign/verify)', async () => {
    const k = await generateVapidKeys();
    const pub = b64urlToBytes(k.publicKey);
    const jwk: JsonWebKey = {
      kty: 'EC',
      crv: 'P-256',
      x: bytesToB64url(pub.slice(1, 33)),
      y: bytesToB64url(pub.slice(33, 65)),
      d: k.privateKey,
      ext: true,
    };
    const priv = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
    const pubKey = await crypto.subtle.importKey('raw', new Uint8Array(pub), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    const data = new TextEncoder().encode('vapid');
    const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, priv, data);
    expect(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pubKey, sig, data)).toBe(true);
  });
});
