#!/usr/bin/env bun
// Pushes secrets from the root .env to Cloudflare Workers via `wrangler
// secret put`. Run once after setting up, or any time you rotate a secret.
//
// Requires: `wrangler login` already done on this machine.

import { API_DIR, readRootEnv, WORKER_SECRETS } from './parse-env';

const entries = await readRootEnv();

let failed = 0;
let applied = 0;

for (const key of WORKER_SECRETS) {
  const val = entries.get(key);
  if (!val) {
    console.warn(`⚠  skipping ${key} — empty in .env`);
    continue;
  }

  console.log(`→ wrangler secret put ${key}`);
  const proc = Bun.spawn(['bunx', 'wrangler', 'secret', 'put', key], {
    cwd: API_DIR,
    stdin: 'pipe',
    stdout: 'inherit',
    stderr: 'inherit',
  });
  proc.stdin.write(val);
  await proc.stdin.end();
  const code = await proc.exited;

  if (code === 0) {
    applied++;
  } else {
    failed++;
    console.error(`✗ ${key} failed (exit ${code})`);
  }
}

console.log(`\n${applied}/${WORKER_SECRETS.length} secrets applied to Cloudflare Workers`);
if (failed > 0) process.exit(1);
