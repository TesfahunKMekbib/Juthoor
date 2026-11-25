import { jest } from '@jest/globals';
import {
  type FileReader,
  TlsConfigError,
  clientAgentOptions,
  clientTlsConnectOptions,
  httpsServerOptions,
  loadTlsMaterial,
  resolveServerTls,
} from './tls-config.js';

const FILES: Record<string, string> = {
  '/c/ca.pem': 'CA-PEM',
  '/c/cert.pem': 'CERT-PEM',
  '/c/key.pem': 'KEY-SECRET',
};
const reader: FileReader = (p) => {
  const v = FILES[p];
  if (v === undefined) throw new Error('ENOENT with KEY-SECRET inside');
  return Buffer.from(v);
};
const full = { TLS_CA_FILE: '/c/ca.pem', TLS_CERT_FILE: '/c/cert.pem', TLS_KEY_FILE: '/c/key.pem' };

function caught(fn: () => unknown): TlsConfigError {
  try {
    fn();
  } catch (e) {
    return e as TlsConfigError;
  }
  throw new Error('expected a throw');
}

describe('TLS config (NFR-005)', () => {
  it('valid config yields TLSv1.2 options with CA, cert and key', () => {
    const m = loadTlsMaterial(full, reader);
    expect(m).not.toBeNull();
    const o = httpsServerOptions(m!);
    expect(o.minVersion).toBe('TLSv1.2');
    expect(o.ca.toString()).toBe('CA-PEM');
    expect(o.cert.toString()).toBe('CERT-PEM');
    expect(o.key.toString()).toBe('KEY-SECRET');
  });

  it('no TLS vars at all returns null', () => {
    expect(loadTlsMaterial({}, reader)).toBeNull();
    expect(loadTlsMaterial({ TLS_CA_FILE: ' ' }, reader)).toBeNull();
  });

  it('partial vars raise tls.partialConfig naming only variable names', () => {
    const e = caught(() => loadTlsMaterial({ TLS_CA_FILE: '/c/ca.pem', TLS_CERT_FILE: '/c/cert.pem' }, reader));
    expect(e).toBeInstanceOf(TlsConfigError);
    expect(e.code).toBe('tls.partialConfig');
    expect(e.message).toContain('TLS_KEY_FILE');
    expect(e.message).not.toContain('/c/');
  });

  it('server options without cert or key are rejected', () => {
    expect(caught(() => httpsServerOptions({ ca: Buffer.from('x') })).code).toBe('tls.partialConfig');
  });

  it('production without TLS refuses to start', () => {
    expect(caught(() => resolveServerTls({ NODE_ENV: 'production' }, reader)).code).toBe('tls.requiredInProduction');
  });

  it('production with TLS returns https options', () => {
    const r = resolveServerTls({ NODE_ENV: 'production', ...full }, reader);
    expect(r.mode).toBe('https');
    expect(r.mode === 'https' && r.options.minVersion).toBe('TLSv1.2');
  });

  it('development without TLS is allowed (plain) and logs a warning', () => {
    const warn = jest.fn();
    expect(resolveServerTls({ NODE_ENV: 'development' }, reader, warn)).toEqual({ mode: 'plain' });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(resolveServerTls({}, reader).mode).toBe('plain');
  });

  it('unreadable file raises tls.fileUnreadable without paths or contents', () => {
    const e = caught(() => loadTlsMaterial({ ...full, TLS_KEY_FILE: '/c/missing.pem' }, reader));
    expect(e.code).toBe('tls.fileUnreadable');
    expect(e.message).toContain('TLS_KEY_FILE');
    expect(e.message).not.toContain('/c/missing.pem');
    expect(e.message).not.toContain('KEY-SECRET');
  });

  it('empty file raises tls.fileInvalid', () => {
    expect(caught(() => loadTlsMaterial(full, () => Buffer.alloc(0))).code).toBe('tls.fileInvalid');
  });

  it('default reader reports a missing file as tls.fileUnreadable', () => {
    const e = caught(() => loadTlsMaterial({ TLS_CA_FILE: 'nope-a', TLS_CERT_FILE: 'nope-b', TLS_KEY_FILE: 'nope-c' }));
    expect(e.code).toBe('tls.fileUnreadable');
    expect(e.message).not.toContain('nope-a');
  });

  it('client options verify the CA (rejectUnauthorized true, TLSv1.2, no client cert)', () => {
    const m = loadTlsMaterial(full, reader)!;
    const a = clientAgentOptions(m);
    expect(a.rejectUnauthorized).toBe(true);
    expect(a.minVersion).toBe('TLSv1.2');
    expect(a.ca?.toString()).toBe('CA-PEM');
    expect(a.cert).toBeUndefined();
    expect(a.key).toBeUndefined();
    expect(clientTlsConnectOptions(m, 'activity-service', 3001)).toMatchObject({
      host: 'activity-service',
      port: 3001,
      servername: 'activity-service',
      rejectUnauthorized: true,
      minVersion: 'TLSv1.2',
    });
  });

  it('NODE_ENV is normalised: Production and " production " refuse without TLS', () => {
    for (const v of ['Production', ' production ', 'PRODUCTION']) {
      expect(caught(() => resolveServerTls({ NODE_ENV: v }, reader)).code).toBe('tls.requiredInProduction');
    }
  });

  it('unset NODE_ENV without TLS stays plain', () => {
    expect(resolveServerTls({}, reader).mode).toBe('plain');
  });

  it('TLS_REQUIRED=true without TLS refuses, even in development', () => {
    const e = caught(() => resolveServerTls({ NODE_ENV: 'development', TLS_REQUIRED: 'true' }, reader));
    expect(e.code).toBe('tls.requiredInProduction');
    expect(caught(() => resolveServerTls({ TLS_REQUIRED: ' TRUE ' }, reader)).code).toBe('tls.requiredInProduction');
  });

  it('TLS_REQUIRED=true with partial config refuses', () => {
    expect(caught(() => resolveServerTls({ TLS_REQUIRED: 'true', TLS_CA_FILE: '/c/ca.pem' }, reader)).code).toBe(
      'tls.partialConfig',
    );
  });

  it('TLS_REQUIRED=true with full config serves https; false allows plain', () => {
    expect(resolveServerTls({ TLS_REQUIRED: 'true', ...full }, reader).mode).toBe('https');
    expect(resolveServerTls({ TLS_REQUIRED: 'false' }, reader).mode).toBe('plain');
    expect(resolveServerTls({ TLS_REQUIRED: '' }, reader).mode).toBe('plain');
  });

  it('invalid TLS_REQUIRED value raises tls.invalidRequiredFlag', () => {
    const e = caught(() => resolveServerTls({ TLS_REQUIRED: 'yes' }, reader));
    expect(e.code).toBe('tls.invalidRequiredFlag');
    expect(e.message).toContain('TLS_REQUIRED');
  });

  it('connect options set servername only for DNS hosts, not IPs', () => {
    const m = { ca: Buffer.from('x') };
    expect(clientTlsConnectOptions(m, '10.0.0.5', 3001).servername).toBeUndefined();
    expect(clientTlsConnectOptions(m, '::1', 3001).servername).toBeUndefined();
    expect(clientTlsConnectOptions(m, 'activity-service', 3001).servername).toBe('activity-service');
  });

  it('unreadable file message keeps the errno code but not the path', () => {
    const enoent: FileReader = () => {
      throw Object.assign(new Error('ENOENT: /secret/path/key.pem'), { code: 'ENOENT' });
    };
    const e = caught(() => loadTlsMaterial(full, enoent));
    expect(e.code).toBe('tls.fileUnreadable');
    expect(e.message).toContain('ENOENT');
    expect(e.message).not.toContain('/secret/path');
  });
});
