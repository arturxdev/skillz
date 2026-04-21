import { intro, log, outro, spinner } from '@clack/prompts';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ApiError } from '../lib/api-client';
import { requireConfig } from '../lib/config';
import { API_BASE_URL, MAX_TARBALL_BYTES } from '../lib/constants';
import { computeSha256, packDir } from '../lib/tarball';

type PushResponse = { skill_id: string; version: number; hash: string };

export async function pushCommand(opts: { path: string }): Promise<void> {
  const cfg = requireConfig();
  const dir = resolve(opts.path);
  const skillFile = join(dir, 'SKILL.md');

  if (!existsSync(skillFile)) {
    console.error(`Not a skill directory: no SKILL.md at ${dir}`);
    process.exit(1);
  }

  const name = parseName(readFileSync(skillFile, 'utf-8'));
  if (!name) {
    console.error('SKILL.md is missing `name` in frontmatter');
    process.exit(1);
  }

  intro('skillz push');
  const s = spinner();
  s.start(`Packaging ${name}`);

  let tarball: Buffer;
  try {
    tarball = await packDir(dir);
  } catch (e) {
    s.stop('Packaging failed');
    log.error((e as Error).message);
    process.exit(1);
  }

  if (tarball.byteLength > MAX_TARBALL_BYTES) {
    s.stop(`Tarball too large: ${(tarball.byteLength / 1024 / 1024).toFixed(2)} MB (max 10 MB)`);
    process.exit(1);
  }

  const hash = computeSha256(tarball);
  s.message(`Uploading ${(tarball.byteLength / 1024).toFixed(1)} KB — ${hash.slice(0, 12)}`);

  const base = cfg.api_base_url || API_BASE_URL;
  try {
    const res = await fetch(`${base}/skills/${name}/versions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        'Content-Type': 'application/gzip',
        'X-Skillz-Hash': hash,
      },
      body: tarball,
    });
    const payload = (await res.json().catch(() => ({}))) as Partial<PushResponse> & {
      error?: string;
    };
    if (!res.ok) {
      throw new ApiError(res.status, payload.error ?? 'http_error', payload.error ?? 'http_error');
    }
    s.stop(`Published ${name}@v${payload.version}`);
    outro(`${name}@v${payload.version} (${(payload.hash ?? hash).slice(0, 12)})`);
  } catch (e) {
    s.stop('Upload failed');
    log.error((e as Error).message);
    process.exit(1);
  }
}

function parseName(content: string): string | null {
  if (!content.startsWith('---\n') && !content.startsWith('---\r\n')) return null;
  const offset = content.startsWith('---\r\n') ? 5 : 4;
  const end = content.indexOf('\n---', offset);
  if (end === -1) return null;
  const yaml = content.slice(offset, end);
  const match = yaml.match(/^name\s*:\s*(.+)$/m);
  if (!match) return null;
  return (match[1] ?? '').trim().replace(/^["']|["']$/g, '').toLowerCase();
}
