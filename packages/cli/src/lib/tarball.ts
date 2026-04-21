import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import * as tar from 'tar';

const DEFAULT_IGNORES = ['.git', 'node_modules', '.DS_Store', '.skillz', 'dist', 'build'];

export async function packDir(dir: string): Promise<Buffer> {
  const ignores = loadIgnores(dir);
  const filter = makeFilter(ignores);

  const stream = tar.create({ gzip: true, cwd: dir, filter }, ['.']);
  const chunks: Buffer[] = [];
  for await (const chunk of stream as unknown as AsyncIterable<Buffer>) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export async function extractTarball(buffer: Buffer, dest: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const input = Readable.from(buffer);
    const out = tar.extract({ cwd: dest });
    input.pipe(out).on('finish', resolve).on('error', reject);
  });
}

export function computeSha256(buffer: Buffer | Uint8Array): string {
  return createHash('sha256').update(buffer).digest('hex');
}

function loadIgnores(dir: string): string[] {
  const patterns = new Set<string>(DEFAULT_IGNORES);
  for (const file of ['.skillzignore', '.gitignore']) {
    const p = join(dir, file);
    if (!existsSync(p)) continue;
    const content = readFileSync(p, 'utf-8');
    for (const raw of content.split('\n')) {
      const t = raw.trim();
      if (!t || t.startsWith('#')) continue;
      patterns.add(t.replace(/^\//, '').replace(/\/$/, ''));
    }
  }
  return [...patterns];
}

function makeFilter(ignores: string[]): (path: string) => boolean {
  const exactBasenames = new Set<string>();
  const extensions: string[] = [];
  for (const p of ignores) {
    if (p.startsWith('*.')) extensions.push(p.slice(1));
    else if (!p.includes('/') && !p.includes('*')) exactBasenames.add(p);
  }
  return (path: string) => {
    const rel = path.replace(/^\.\//, '').replace(/\/$/, '');
    if (!rel) return true;
    const parts = rel.split('/');
    for (const p of parts) {
      if (exactBasenames.has(p)) return false;
    }
    const basename = parts[parts.length - 1] ?? '';
    for (const ext of extensions) {
      if (basename.endsWith(ext)) return false;
    }
    return true;
  };
}
