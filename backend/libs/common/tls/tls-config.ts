import { readFileSync } from 'node:fs';
import type { AgentOptions } from 'node:https';
import { isIP } from 'node:net';
import type { ConnectionOptions } from 'node:tls';

/**
 * Internal TLS helper (NFR-005: TLS 1.2 or later; plan arch-microservices §5.1).
 * Server-auth TLS only (no mTLS). Pure apart from the injectable file reader.
 * Error messages carry variable names and codes only, never paths or file contents.
 */
export const TLS_MIN_VERSION = 'TLSv1.2' as const;
export const TLS_ENV = {
  ca: 'TLS_CA_FILE',
  cert: 'TLS_CERT_FILE',
  key: 'TLS_KEY_FILE',
  required: 'TLS_REQUIRED',
} as const;
const FILE_VARS = [TLS_ENV.ca, TLS_ENV.cert, TLS_ENV.key] as const;

export type TlsErrorCode = 'tls.partialConfig' | 'tls.fileUnreadable' | 'tls.fileInvalid' | 'tls.requiredInProduction' | 'tls.invalidRequiredFlag';

export class TlsConfigError extends Error {
  constructor(
    readonly code: TlsErrorCode,
    message: string,
  ) {
    super(`${code}: ${message}`);
    this.name = 'TlsConfigError';
  }
}

export type FileReader = (path: string) => Buffer;
export type Env = Readonly<Record<string, string | undefined>>;

export interface TlsMaterial {
  readonly ca: Buffer;
  readonly cert?: Buffer;
  readonly key?: Buffer;
}

export interface HttpsServerOptions {
  readonly ca: Buffer;
  readonly cert: Buffer;
  readonly key: Buffer;
  readonly minVersion: typeof TLS_MIN_VERSION;
}

export type ServerTls = { mode: 'https'; options: HttpsServerOptions } | { mode: 'plain' };

const defaultReader: FileReader = (p) => readFileSync(p);

function load(env: Env, name: string, read: FileReader): Buffer {
  const path = (env[name] ?? '').trim();
  let data: Buffer;
  try {
    data = read(path);
  } catch (e) {
    const errno = (e as { code?: unknown } | null)?.code;
    const detail = typeof errno === 'string' && /^[A-Z0-9_]+$/.test(errno) ? ` (${errno})` : '';
    throw new TlsConfigError('tls.fileUnreadable', `${name} points to a file that cannot be read${detail}.`);
  }
  if (data.length === 0) throw new TlsConfigError('tls.fileInvalid', `${name} points to an empty file.`);
  return data;
}

/** Returns null when no TLS_* variable is set; throws on partial or unreadable configuration. */
export function loadTlsMaterial(env: Env, read: FileReader = defaultReader): HttpsServerOptions | null {
  const names = FILE_VARS;
  const missing = names.filter((n) => !(env[n] ?? '').trim());
  if (missing.length === names.length) return null;
  if (missing.length > 0) {
    throw new TlsConfigError('tls.partialConfig', `Missing ${missing.join(', ')}; set all of ${names.join(', ')}.`);
  }
  return {
    ca: load(env, TLS_ENV.ca, read),
    cert: load(env, TLS_ENV.cert, read),
    key: load(env, TLS_ENV.key, read),
    minVersion: TLS_MIN_VERSION,
  };
}

/** Options for Nest `httpsOptions` / `https.createServer`. */
export function httpsServerOptions(m: TlsMaterial): HttpsServerOptions {
  if (!m.cert || !m.key) throw new TlsConfigError('tls.partialConfig', 'Server TLS needs cert and key.');
  return { ca: m.ca, cert: m.cert, key: m.key, minVersion: TLS_MIN_VERSION };
}

/** `https.Agent` options: verifies the server against the CA; hostname is checked by default. */
export function clientAgentOptions(m: Pick<TlsMaterial, 'ca'>): AgentOptions {
  return { ca: m.ca, minVersion: TLS_MIN_VERSION, rejectUnauthorized: true };
}

/** `tls.connect` options (non-HTTP clients). */
export function clientTlsConnectOptions(m: Pick<TlsMaterial, 'ca'>, host: string, port: number): ConnectionOptions {
  return { host, port, ...(isIP(host) === 0 ? { servername: host } : {}), ca: m.ca, minVersion: TLS_MIN_VERSION, rejectUnauthorized: true };
}

/**
 * Boot rule: with NODE_ENV=production a missing TLS config refuses to start;
 * elsewhere it falls back to plain HTTP with a warning.
 */
export function resolveServerTls(
  env: Env,
  read: FileReader = defaultReader,
  warn: (msg: string) => void = () => undefined,
): ServerTls {
  const flag = (env[TLS_ENV.required] ?? '').trim().toLowerCase();
  if (flag !== '' && flag !== 'true' && flag !== 'false') {
    throw new TlsConfigError('tls.invalidRequiredFlag', `${TLS_ENV.required} must be "true" or "false".`);
  }
  const m = loadTlsMaterial(env, read);
  if (m) return { mode: 'https', options: httpsServerOptions(m) };
  const production = (env['NODE_ENV'] ?? '').trim().toLowerCase() === 'production';
  if (production || flag === 'true') {
    throw new TlsConfigError(
      'tls.requiredInProduction',
      `Set ${FILE_VARS.join(', ')}; plaintext is not allowed in production or when ${TLS_ENV.required}=true.`,
    );
  }
  warn('TLS not configured; serving plain HTTP (non-production only).');
  return { mode: 'plain' };
}
