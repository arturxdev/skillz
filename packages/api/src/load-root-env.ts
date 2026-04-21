// Side-effect import: loads the repo-root .env into process.env so that
// `bun --filter @skillz/api db:migrate` and drizzle-kit work regardless of
// cwd. Values already present in the environment (e.g. GitHub Actions secrets)
// win over the file.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// cwd when invoked via `bun --filter @skillz/api ...` or `drizzle-kit` is
// always packages/api/, so root is two levels up. Works in both ESM and the
// CJS bundle drizzle-kit compiles from drizzle.config.ts.
const envPath = resolve(process.cwd(), '../../.env');

try {
  const content = readFileSync(envPath, 'utf-8');
  for (const raw of content.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    const val = line
      .slice(eq + 1)
      .trim()
      .replace(/^["']|["']$/g, '');
    if (process.env[key] === undefined) {
      process.env[key] = val;
    }
  }
} catch {
  // No root .env (e.g. in CI): rely on the environment alone.
}
