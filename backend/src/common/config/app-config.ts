import { FieldCipher } from '../crypto/field-cipher.js';

type Env = Record<string, string | undefined>;

/**
 * Typed, validated process settings (plan section 4). Secrets are never echoed in errors.
 * AI_* and VERIFY_* are validated by parseAiConfig / parseVerificationConfig (called from main.ts).
 */
export interface AppConfig {
  nodeEnv: string;
  port: number;
  mongodbUri: string;
  locationEncryptionKey: Buffer;
  uploadMaxFileMb: number;
  uploadMaxFiles: number;
}

export class ConfigError extends Error {
  constructor(readonly problems: string[]) {
    super(`Invalid configuration: ${problems.join('; ')}`);
    this.name = 'ConfigError';
  }
}

/** Decodes a 32-byte AES-256 key given as 64 hex chars or base64; null when it is not one (NFR-004). */
export function parseEncryptionKey(raw: string): Buffer | null {
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, 'hex');
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(raw)) return null;
  const key = Buffer.from(raw, 'base64');
  return key.length === 32 ? key : null;
}

/**
 * The one place that turns LOCATION_ENCRYPTION_KEY (hex or base64) into the cipher, which wants base64
 * (NFR-004). Throws a ConfigError that never contains the key.
 */
export function createLocationCipher(rawKey: string | undefined): FieldCipher {
  const key = rawKey ? parseEncryptionKey(rawKey) : null;
  if (!key) throw new ConfigError(['LOCATION_ENCRYPTION_KEY must be 32 bytes as 64 hex characters or base64']);
  return new FieldCipher(key.toString('base64'));
}

const intIn = (env: Env, name: string, def: number, min: number, max: number, problems?: string[]): number => {
  const raw = env[name];
  if (raw === undefined || raw === '') return def;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) {
    problems?.push(`${name} must be an integer between ${min} and ${max}`);
    return def;
  }
  return n;
};

/** Multer limits from UPLOAD_MAX_FILE_MB / UPLOAD_MAX_FILES (FR-021); invalid values fall back to defaults. */
export function uploadLimits(env: Env): {
  fileSize: number;
  files: number;
  fieldSize: number;
  fields: number;
  parts: number;
} {
  const files = intIn(env, 'UPLOAD_MAX_FILES', 6, 1, 20);
  return {
    fileSize: intIn(env, 'UPLOAD_MAX_FILE_MB', 8, 1, 50) * 1024 * 1024,
    files,
    // Text parts are capped too: only the small "data" JSON is expected (S1, FR-021).
    fieldSize: 64 * 1024,
    fields: 4,
    parts: files + 4,
  };
}

/** Reads and validates process settings at boot; throws one ConfigError listing every bad variable name. */
export function loadAppConfig(env: Env): AppConfig {
  const problems: string[] = [];

  const rawKey = env.LOCATION_ENCRYPTION_KEY;
  let locationEncryptionKey: Buffer = Buffer.alloc(0);
  if (!rawKey) problems.push('LOCATION_ENCRYPTION_KEY is required');
  else {
    const key = parseEncryptionKey(rawKey);
    if (key) locationEncryptionKey = key;
    else problems.push('LOCATION_ENCRYPTION_KEY must be 32 bytes as 64 hex characters or base64');
  }

  const devFlag = env.JUTHOOR_DEV_PARTICIPANT;
  if (devFlag !== undefined && devFlag !== 'true' && devFlag !== 'false')
    problems.push('JUTHOOR_DEV_PARTICIPANT must be "true" or "false"');

  const config: AppConfig = {
    nodeEnv: env.NODE_ENV ?? '',
    port: intIn(env, 'PORT', 3000, 1, 65535, problems),
    mongodbUri: env.MONGODB_URI || 'mongodb://localhost:27017/juthoor',
    locationEncryptionKey,
    uploadMaxFileMb: intIn(env, 'UPLOAD_MAX_FILE_MB', 8, 1, 50, problems),
    uploadMaxFiles: intIn(env, 'UPLOAD_MAX_FILES', 6, 1, 20, problems),
  };
  if (problems.length) throw new ConfigError(problems);
  return config;
}
