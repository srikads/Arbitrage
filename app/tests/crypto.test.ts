import { describe, expect, it } from 'vitest';
import vector from '../../shared/testvectors/envelope.json';
import { b64ToBytes } from '../src/lib/b64';
import { KeyRing, decrypt, encrypt, isEnvelope } from '../src/lib/crypto';
import type { Envelope } from '../src/lib/types';

describe('envelope crypto (CONTRACT §2)', () => {
  it('decrypts the shared test vector', async () => {
    const pt = await decrypt(vector.passphrase, vector.envelope as Envelope);
    expect(pt).toBe(vector.plaintext);
    expect(JSON.parse(pt)).toEqual({ hello: 'world', n: 42 });
  });

  it('rejects a wrong passphrase', async () => {
    await expect(decrypt('wrong horse', vector.envelope as Envelope)).rejects.toThrow(/decrypt/i);
  });

  it('round-trips with a fresh salt and iv per write', async () => {
    const a = await encrypt('pass phrase one', '{"x":1}');
    const b = await encrypt('pass phrase one', '{"x":1}');
    expect(isEnvelope(a)).toBe(true);
    expect(a).toMatchObject({ v: 1, alg: 'AES-256-GCM', kdf: 'PBKDF2-SHA256', iter: 600000 });
    expect(b64ToBytes(a.salt)).toHaveLength(16);
    expect(b64ToBytes(a.iv)).toHaveLength(12);
    expect(b64ToBytes(a.ct)).toHaveLength(7 + 16); // plaintext + GCM tag
    expect(a.salt).not.toBe(b.salt);
    expect(a.iv).not.toBe(b.iv);
    expect(a.salt).toMatch(/^[A-Za-z0-9+/]+={0,2}$/); // standard base64 with padding
    expect(await decrypt('pass phrase one', a)).toBe('{"x":1}');
  });

  it('KeyRing reuses the local salt but changes the iv', async () => {
    const ring = new KeyRing('local pass phrase');
    const salt = vector.envelope.salt;
    const e1 = await ring.encryptLocal(salt, 'hello');
    const e2 = await ring.encryptLocal(salt, 'hello');
    expect(e1.salt).toBe(salt);
    expect(e1.iv).not.toBe(e2.iv);
    expect(await ring.decrypt(e2)).toBe('hello');
    expect(await decrypt('local pass phrase', e1)).toBe('hello');
  });
});
