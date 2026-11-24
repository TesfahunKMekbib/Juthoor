import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/** Stored form of an encrypted value (ADR-0011). `v` allows key rotation later. */
export interface EncryptedEnvelope {
  v: number;
  iv: string; // base64, 12 bytes
  tag: string; // base64, 16 bytes
  ct: string; // base64
}

const ENVELOPE_VERSION = 1;
const IV_BYTES = 12;
const TAG_BYTES = 16;

/**
 * AES-256-GCM field encryption for user-linked location data (NFR-004, ADR-0006).
 * The key comes from env `LOCATION_ENCRYPTION_KEY` (32 bytes, base64); config wiring lives elsewhere.
 */
export class FieldCipher {
  private readonly key: Buffer;

  constructor(keyBase64: string) {
    const key = Buffer.from(keyBase64 ?? '', 'base64');
    if (key.length !== 32) throw new Error('Encryption key must be 32 bytes, base64 encoded.');
    this.key = key;
  }

  encrypt(plaintext: string): EncryptedEnvelope {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return {
      v: ENVELOPE_VERSION,
      iv: iv.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
      ct: ct.toString('base64'),
    };
  }

  /** Throws when the envelope was modified or the key is wrong. */
  decrypt(envelope: EncryptedEnvelope): string {
    if (!envelope || envelope.v !== ENVELOPE_VERSION) throw new Error('Unsupported encryption envelope.');
    const iv = Buffer.from(envelope.iv, 'base64');
    const tag = Buffer.from(envelope.tag, 'base64');
    if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) throw new Error('Malformed encryption envelope.');
    try {
      const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(Buffer.from(envelope.ct, 'base64')), decipher.final()]).toString('utf8');
    } catch {
      throw new Error('Decryption failed.');
    }
  }

  encryptJson(value: unknown): EncryptedEnvelope {
    return this.encrypt(JSON.stringify(value));
  }

  decryptJson<T>(envelope: EncryptedEnvelope): T {
    return JSON.parse(this.decrypt(envelope)) as T;
  }
}
