import { ConfigError, createLocationCipher, loadAppConfig, parseEncryptionKey, uploadLimits } from './app-config.js';

const KEY_HEX = 'ab'.repeat(32);
const base = { LOCATION_ENCRYPTION_KEY: KEY_HEX };
const problems = (env: Record<string, string | undefined>): string[] => {
  try {
    loadAppConfig(env);
  } catch (e) {
    return (e as ConfigError).problems;
  }
  return [];
};

describe('loadAppConfig (plan section 4)', () => {
  it('applies the documented defaults', () => {
    const c = loadAppConfig(base);
    expect(c).toMatchObject({ port: 3000, uploadMaxFileMb: 8, uploadMaxFiles: 6 });
    expect(c.locationEncryptionKey).toHaveLength(32);
    expect(c.mongodbUri).toContain('mongodb://');
  });
  it('reads explicit values', () => {
    const c = loadAppConfig({
      ...base,
      NODE_ENV: 'development',
      PORT: '4000',
      MONGODB_URI: 'mongodb://db/x',
      UPLOAD_MAX_FILE_MB: '2',
      JUTHOOR_DEV_PARTICIPANT: 'true',
    });
    expect(c).toMatchObject({ port: 4000, mongodbUri: 'mongodb://db/x', uploadMaxFileMb: 2, nodeEnv: 'development' });
  });
  it('requires the encryption key and rejects malformed keys without echoing them (NFR-004)', () => {
    expect(problems({})).toEqual(['LOCATION_ENCRYPTION_KEY is required']);
    const bad = problems({ LOCATION_ENCRYPTION_KEY: 'sekret-short' });
    expect(bad[0]).toMatch(/LOCATION_ENCRYPTION_KEY must be 32 bytes/);
    expect(JSON.stringify(bad)).not.toContain('sekret');
  });
  it('accepts a base64 32-byte key and rejects other lengths', () => {
    expect(parseEncryptionKey(Buffer.alloc(32, 1).toString('base64'))).toHaveLength(32);
    expect(parseEncryptionKey(Buffer.alloc(16, 1).toString('base64'))).toBeNull();
    expect(parseEncryptionKey('not base64!!')).toBeNull();
  });
  it('rejects out-of-range and non-numeric numbers', () => {
    const p = problems({ ...base, UPLOAD_MAX_FILES: '0', UPLOAD_MAX_FILE_MB: 'abc', PORT: '70000' });
    expect(p).toHaveLength(3);
  });
  it('treats empty values as unset', () => {
    expect(loadAppConfig({ ...base, PORT: '', MONGODB_URI: '' }).port).toBe(3000);
  });
  it('rejects a bad dev flag', () => {
    expect(problems({ ...base, JUTHOOR_DEV_PARTICIPANT: 'yes' })).toHaveLength(1);
  });
});

describe('createLocationCipher', () => {
  it('builds the same cipher from hex and base64 forms of one key', () => {
    const hex = createLocationCipher(KEY_HEX);
    const b64 = createLocationCipher(Buffer.from(KEY_HEX, 'hex').toString('base64'));
    expect(b64.decrypt(hex.encrypt('x'))).toBe('x');
  });
  it('throws a ConfigError without the key when invalid or missing', () => {
    expect(() => createLocationCipher('sekret')).toThrow(ConfigError);
    expect(() => createLocationCipher('sekret')).not.toThrow(/sekret/);
    expect(() => createLocationCipher(undefined)).toThrow(ConfigError);
  });
});

describe('uploadLimits', () => {
  it('converts MB to bytes and falls back on invalid values', () => {
    expect(uploadLimits({ UPLOAD_MAX_FILE_MB: '2', UPLOAD_MAX_FILES: '3' })).toEqual({
      fileSize: 2 * 1024 * 1024,
      files: 3,
      fieldSize: 64 * 1024,
      fields: 4,
      parts: 7,
    });
    expect(uploadLimits({ UPLOAD_MAX_FILE_MB: 'x' })).toMatchObject({ fileSize: 8 * 1024 * 1024, files: 6, parts: 10 });
  });
});
