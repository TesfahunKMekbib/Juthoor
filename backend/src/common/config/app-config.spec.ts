import { ConfigError, loadAppConfig, parseEncryptionKey } from './app-config.js';

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
    expect(c).toMatchObject({
      port: 3000,
      uploadMaxFileMb: 8,
      uploadMaxFiles: 6,
      aiProvider: 'mock',
      aiMockMode: 'fixed',
      aiAcceptThreshold: 0.7,
      aiRejectThreshold: 0.3,
      aiTimeoutMs: 20000,
      verifyMaxAttempts: 5,
      verifyBackoffBaseMs: 30000,
      verifyPollMs: 2000,
    });
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
      AI_MOCK_MODE: 'unavailable',
      AI_MOCK_SCORE: '0.5',
      JUTHOOR_DEV_PARTICIPANT: 'true',
    });
    expect(c).toMatchObject({
      port: 4000,
      mongodbUri: 'mongodb://db/x',
      uploadMaxFileMb: 2,
      aiMockMode: 'unavailable',
    });
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
    const p = problems({
      ...base,
      UPLOAD_MAX_FILES: '0',
      UPLOAD_MAX_FILE_MB: 'abc',
      PORT: '70000',
      AI_MOCK_SCORE: '1.5',
      VERIFY_POLL_MS: '1.5',
    });
    expect(p).toHaveLength(5);
  });
  it('treats empty values as unset', () => {
    expect(loadAppConfig({ ...base, PORT: '', AI_MOCK_SCORE: '', MONGODB_URI: '' }).port).toBe(3000);
  });
  it('rejects unknown provider, mock mode and bad dev flag', () => {
    const p = problems({ ...base, AI_PROVIDER: 'openai', AI_MOCK_MODE: 'weird', JUTHOOR_DEV_PARTICIPANT: 'yes' });
    expect(p).toHaveLength(3);
  });
  it('requires accept threshold > reject threshold', () => {
    expect(problems({ ...base, AI_ACCEPT_THRESHOLD: '0.3', AI_REJECT_THRESHOLD: '0.3' })).toEqual([
      'AI_ACCEPT_THRESHOLD must be greater than AI_REJECT_THRESHOLD',
    ]);
  });
});
