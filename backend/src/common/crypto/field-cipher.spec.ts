import { randomBytes } from 'node:crypto';
import { FieldCipher } from './field-cipher.js';

const newKey = () => randomBytes(32).toString('base64');

describe('FieldCipher (NFR-004)', () => {
  it('round-trips text and JSON', () => {
    const c = new FieldCipher(newKey());
    expect(c.decrypt(c.encrypt('Abu Dhabi'))).toBe('Abu Dhabi');
    const value = { emirate: 'Dubai', area: 'مرسى' };
    expect(c.decryptJson(c.encryptJson(value))).toEqual(value);
  });

  it('does not store plaintext and sets version 1', () => {
    const e = new FieldCipher(newKey()).encrypt('Sharjah');
    expect(e.v).toBe(1);
    expect(JSON.stringify(e)).not.toContain('Sharjah');
  });

  it('uses a unique 12-byte IV each time', () => {
    const c = new FieldCipher(newKey());
    const ivs = new Set(Array.from({ length: 50 }, () => c.encrypt('x').iv));
    expect(ivs.size).toBe(50);
    expect(Buffer.from([...ivs][0], 'base64')).toHaveLength(12);
  });

  it('throws when ciphertext, tag or iv is tampered', () => {
    const c = new FieldCipher(newKey());
    const e = c.encrypt('Ajman');
    const flip = (b64: string) => {
      const b = Buffer.from(b64, 'base64');
      b[0] ^= 1;
      return b.toString('base64');
    };
    expect(() => c.decrypt({ ...e, ct: flip(e.ct) })).toThrow();
    expect(() => c.decrypt({ ...e, tag: flip(e.tag) })).toThrow();
    expect(() => c.decrypt({ ...e, iv: flip(e.iv) })).toThrow();
  });

  it('throws with the wrong key', () => {
    const e = new FieldCipher(newKey()).encrypt('Fujairah');
    expect(() => new FieldCipher(newKey()).decrypt(e)).toThrow();
  });

  it('rejects unknown versions and malformed envelopes', () => {
    const c = new FieldCipher(newKey());
    const e = c.encrypt('x');
    expect(() => c.decrypt({ ...e, v: 2 })).toThrow();
    expect(() => c.decrypt({ ...e, iv: 'AAAA' })).toThrow();
    expect(() => c.decrypt(undefined as never)).toThrow();
  });

  it('rejects a key that is missing or not 32 bytes', () => {
    expect(() => new FieldCipher('')).toThrow();
    expect(() => new FieldCipher(randomBytes(16).toString('base64'))).toThrow();
    expect(() => new FieldCipher(undefined as never)).toThrow();
  });
});
