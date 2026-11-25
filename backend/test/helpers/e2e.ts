// Shared e2e helpers (Slice 2). Throwaway MongoDB database only: the name is random and dropped by the caller.
import 'reflect-metadata';
import { randomBytes } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import sharp from 'sharp';

/** HTTP response bodies are untyped JSON; assertions check their shape explicitly. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- e2e assertions on parsed JSON bodies
export type Json = any;

const SERVER_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/x';
export const DB_NAME = `juthoor_e2e_${randomBytes(6).toString('hex')}`;
export const MONGODB_URI = SERVER_URI.replace(/\/[^/?]*(\?|$)/, `/${DB_NAME}$1`);
export const KEY = randomBytes(32).toString('hex');
export const uniq = () => `key-${randomBytes(6).toString('hex')}`;

/**
 * The verification and AI modules read process.env (not the object given to forRoot), so tests set the
 * variables they need with this helper and restore them in afterAll.
 */
export function setEnv(vars: Record<string, string | undefined>): () => void {
  const saved: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(vars)) {
    saved[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  return () => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  };
}

export async function boot(env: Record<string, string | undefined>, abortOnError = true): Promise<INestApplication> {
  const { AppModule } = await import('../../src/app.module.js');
  const { ApiExceptionFilter } = await import('../../libs/common/errors/http-exception.filter.js');
  const a = await NestFactory.create(await AppModule.forRoot(env), { logger: false, abortOnError });
  a.setGlobalPrefix('api');
  a.useGlobalFilters(new ApiExceptionFilter());
  await a.listen(0, '127.0.0.1');
  return a;
}

export const urlOf = (a: INestApplication) =>
  `http://127.0.0.1:${(a.getHttpServer().address() as { port: number }).port}/`;

export async function makeJpeg(): Promise<Buffer> {
  return sharp({ create: { width: 64, height: 48, channels: 3, background: { r: 30, g: 140, b: 60 } } })
    .jpeg()
    .toBuffer();
}

export async function postActivity(
  base: string,
  data: unknown,
  photos: Buffer[],
  key: string | undefined,
): Promise<{ status: number; body: Json }> {
  const form = new FormData();
  form.append('data', JSON.stringify(data));
  photos.forEach((p, i) => form.append('photos', new Blob([new Uint8Array(p)], { type: 'image/jpeg' }), `p${i}.jpg`));
  const headers: Record<string, string> = {};
  if (key !== undefined) headers['Idempotency-Key'] = key;
  const res = await fetch(`${base}api/activities`, { method: 'POST', body: form, headers });
  return { status: res.status, body: await res.json() };
}

export async function getJson(base: string, path: string): Promise<{ status: number; body: Json }> {
  const res = await fetch(`${base}api${path}`);
  return { status: res.status, body: await res.json() };
}

/** Polls `read` until `done` accepts the value; fails with the last value after `timeoutMs` (no fixed sleeps). */
export async function waitFor<T>(
  read: () => Promise<T>,
  done: (v: T) => boolean,
  timeoutMs = 10_000,
  stepMs = 25,
): Promise<T> {
  const end = Date.now() + timeoutMs;
  let last = await read();
  while (!done(last)) {
    if (Date.now() > end) throw new Error(`waitFor timed out; last value: ${JSON.stringify(last)}`);
    await new Promise((r) => setTimeout(r, stepMs));
    last = await read();
  }
  return last;
}

/**
 * Nest does not close the MongoDB connection of an app whose boot failed (abortOnError=false). Call after an
 * expected boot failure when no other app is running in this process, so Jest can exit.
 */
export async function closeLeakedConnections(): Promise<void> {
  const { default: mongoose } = await import('mongoose');
  await Promise.allSettled(mongoose.connections.map((c) => c.close(true)));
}
