type Env = Record<string, string | undefined>;

export const AI_MOCK_MODES = ['fixed', 'scripted', 'unavailable'] as const;

/** Typed, validated settings (plan §4). Secrets are never echoed in errors. */
export interface AppConfig {
  nodeEnv: string;
  port: number;
  mongodbUri: string;
  locationEncryptionKey: Buffer;
  uploadMaxFileMb: number;
  uploadMaxFiles: number;
  aiProvider: 'mock';
  aiMockMode: (typeof AI_MOCK_MODES)[number];
  aiMockScore: number;
  aiAcceptThreshold: number;
  aiRejectThreshold: number;
  aiTimeoutMs: number;
  verifyMaxAttempts: number;
  verifyBackoffBaseMs: number;
  verifyPollMs: number;
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

/** Reads and validates process settings at boot; throws one ConfigError listing every bad variable name. */
export function loadAppConfig(env: Env): AppConfig {
  const problems: string[] = [];
  const int = (name: string, def: number, min: number, max: number): number => {
    const raw = env[name];
    if (raw === undefined || raw === '') return def;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < min || n > max) {
      problems.push(`${name} must be an integer between ${min} and ${max}`);
      return def;
    }
    return n;
  };
  const unit = (name: string, def: number): number => {
    const raw = env[name];
    if (raw === undefined || raw === '') return def;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0 || n > 1) {
      problems.push(`${name} must be a number between 0 and 1`);
      return def;
    }
    return n;
  };

  const rawKey = env.LOCATION_ENCRYPTION_KEY;
  let locationEncryptionKey: Buffer = Buffer.alloc(0);
  if (!rawKey) problems.push('LOCATION_ENCRYPTION_KEY is required');
  else {
    const key = parseEncryptionKey(rawKey);
    if (key) locationEncryptionKey = key;
    else problems.push('LOCATION_ENCRYPTION_KEY must be 32 bytes as 64 hex characters or base64');
  }

  const aiProvider = env.AI_PROVIDER ?? 'mock';
  if (aiProvider !== 'mock') problems.push('AI_PROVIDER must be "mock" (live provider undecided, Q-C3)');
  const mode = env.AI_MOCK_MODE ?? 'fixed';
  if (!(AI_MOCK_MODES as readonly string[]).includes(mode))
    problems.push(`AI_MOCK_MODE must be one of ${AI_MOCK_MODES.join(', ')}`);

  const aiAcceptThreshold = unit('AI_ACCEPT_THRESHOLD', 0.7);
  const aiRejectThreshold = unit('AI_REJECT_THRESHOLD', 0.3);
  if (aiAcceptThreshold <= aiRejectThreshold)
    problems.push('AI_ACCEPT_THRESHOLD must be greater than AI_REJECT_THRESHOLD');

  const devFlag = env.JUTHOOR_DEV_PARTICIPANT;
  if (devFlag !== undefined && devFlag !== 'true' && devFlag !== 'false')
    problems.push('JUTHOOR_DEV_PARTICIPANT must be "true" or "false"');

  const config: AppConfig = {
    nodeEnv: env.NODE_ENV ?? '',
    port: int('PORT', 3000, 1, 65535),
    mongodbUri: env.MONGODB_URI || 'mongodb://localhost:27017/juthoor',
    locationEncryptionKey,
    uploadMaxFileMb: int('UPLOAD_MAX_FILE_MB', 8, 1, 50),
    uploadMaxFiles: int('UPLOAD_MAX_FILES', 6, 1, 20),
    aiProvider: 'mock',
    aiMockMode: mode as AppConfig['aiMockMode'],
    aiMockScore: unit('AI_MOCK_SCORE', 0.9),
    aiAcceptThreshold,
    aiRejectThreshold,
    aiTimeoutMs: int('AI_TIMEOUT_MS', 20000, 1, 120000),
    verifyMaxAttempts: int('VERIFY_MAX_ATTEMPTS', 5, 1, 100),
    verifyBackoffBaseMs: int('VERIFY_BACKOFF_BASE_MS', 30000, 1, 3_600_000),
    verifyPollMs: int('VERIFY_POLL_MS', 2000, 100, 3_600_000),
  };
  if (problems.length) throw new ConfigError(problems);
  return config;
}
