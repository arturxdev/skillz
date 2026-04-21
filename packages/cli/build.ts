#!/usr/bin/env bun
import { $ } from 'bun';
import { readFile } from 'node:fs/promises';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const TARGETS = [
  'bun-darwin-arm64',
  'bun-darwin-x64',
  'bun-linux-arm64',
  'bun-linux-x64',
] as const;

// Load SKILLZ_API_URL from the monorepo root .env so the compiled binary has
// the production URL baked in. Precedence: real env var > .env file > fallback.
async function resolveApiUrl(): Promise<string> {
  if (process.env.SKILLZ_API_URL) return process.env.SKILLZ_API_URL;

  const envPath = resolve(import.meta.dir, '../../.env');
  try {
    const content = await readFile(envPath, 'utf-8');
    for (const raw of content.split('\n')) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      if (key !== 'SKILLZ_API_URL') continue;
      const val = line
        .slice(eq + 1)
        .trim()
        .replace(/^["']|["']$/g, '');
      if (val) return val;
    }
  } catch {
    // .env missing — fall through
  }
  return 'https://skillz-api.arturo8gll.workers.dev';
}

const apiUrl = await resolveApiUrl();
const defineArg = `process.env.SKILLZ_API_URL=${JSON.stringify(apiUrl)}`;
console.log(`→ API_BASE_URL = ${apiUrl}`);

const all = process.argv.includes('--all');
await mkdir('dist', { recursive: true });

async function build(target: string | null): Promise<void> {
  const suffix = target ? target.replace('bun-', '') : 'local';
  const out = `dist/skillz-${suffix}`;
  console.log(`→ building ${out}`);
  if (target) {
    await $`bun build --compile --target=${target} --define ${defineArg} ./src/index.ts --outfile=${out}`.quiet();
  } else {
    await $`bun build --compile --define ${defineArg} ./src/index.ts --outfile=${out}`.quiet();
  }
}

if (all) {
  for (const t of TARGETS) await build(t);
} else {
  await build(null);
}

console.log('✓ build complete');
