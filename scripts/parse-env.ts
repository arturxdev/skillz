import { resolve } from 'node:path';

// Variables that live on Cloudflare Workers — everything the API needs at
// runtime (secrets) or wants during local wrangler dev (.dev.vars).
export const WORKER_SECRETS = [
  'DATABASE_URL',
  'RESEND_API_KEY',
  'TOKEN_SIGNING_SECRET',
] as const;

export const ROOT_ENV_PATH = resolve(import.meta.dir, '../.env');
export const DEV_VARS_PATH = resolve(import.meta.dir, '../packages/api/.dev.vars');
export const API_DIR = resolve(import.meta.dir, '../packages/api');

export async function readRootEnv(): Promise<Map<string, string>> {
  const file = Bun.file(ROOT_ENV_PATH);
  if (!(await file.exists())) {
    console.error(`✗ ${ROOT_ENV_PATH} not found. Copy .env.example to .env first.`);
    process.exit(1);
  }
  const text = await file.text();
  const out = new Map<string, string>();
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    const val = line
      .slice(eq + 1)
      .trim()
      .replace(/^["']|["']$/g, '');
    out.set(key, val);
  }
  return out;
}
