import { intro, log, outro, spinner } from '@clack/prompts';
import { createHash } from 'node:crypto';
import { chmodSync, renameSync, writeFileSync } from 'node:fs';
import { BIN_PATH, VERSION } from '../lib/constants';
import { clearUpdateCache, semverGt } from '../lib/update-checker';

const REPO = 'arturxdev/skillz';

type Release = {
  tag_name: string;
  assets: Array<{ name: string; browser_download_url: string }>;
};

export async function selfUpdateCommand(): Promise<void> {
  intro('skillz self-update');
  const s = spinner();
  s.start('Checking latest release');

  try {
    const release = await fetchJson<Release>(
      `https://api.github.com/repos/${REPO}/releases/latest`,
    );
    const latest = release.tag_name.replace(/^v/, '');

    if (!semverGt(latest, VERSION)) {
      s.stop(`Already up to date (v${VERSION})`);
      outro('Nothing to do.');
      return;
    }

    s.message('Detecting platform');
    const os = process.platform === 'darwin' ? 'darwin' : 'linux';
    const rawArch = process.arch;
    const arch =
      rawArch === 'arm64' ? 'arm64' : rawArch === 'x64' ? 'x64' : null;
    if (!arch) throw new Error(`Unsupported architecture: ${rawArch}`);

    const assetName = `skillz-${os}-${arch}`;
    const binAsset = release.assets.find((a) => a.name === assetName);
    const sumsAsset = release.assets.find((a) => a.name === 'SHA256SUMS.txt');
    if (!binAsset) throw new Error(`No release asset named ${assetName}`);
    if (!sumsAsset) throw new Error('SHA256SUMS.txt missing from release');

    s.message(`Downloading v${latest} (${assetName})`);
    const binBuf = await fetchBinary(binAsset.browser_download_url);

    s.message('Verifying checksum');
    const sumsText = await fetchText(sumsAsset.browser_download_url);
    const expected = parseChecksum(sumsText, assetName);
    if (!expected) throw new Error(`No checksum found for ${assetName}`);

    const actual = createHash('sha256').update(binBuf).digest('hex');
    if (actual !== expected) {
      throw new Error(
        `Checksum mismatch (expected ${expected.slice(0, 12)}, got ${actual.slice(0, 12)})`,
      );
    }

    s.message('Installing');
    const targetPath = process.execPath && process.execPath !== 'bun' ? process.execPath : BIN_PATH;
    const tempPath = `${targetPath}.tmp.${process.pid}`;

    writeFileSync(tempPath, binBuf);
    chmodSync(tempPath, 0o755);
    renameSync(tempPath, targetPath);

    clearUpdateCache();

    s.stop(`Updated to v${latest}`);
    outro(`Installed at ${targetPath}`);
  } catch (e) {
    s.stop('Update failed');
    log.error((e as Error).message);
    process.exit(1);
  }
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'skillz-cli',
      Accept: 'application/vnd.github+json',
    },
  });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return (await res.json()) as T;
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { 'User-Agent': 'skillz-cli' } });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.text();
}

async function fetchBinary(url: string): Promise<Buffer> {
  const res = await fetch(url, { headers: { 'User-Agent': 'skillz-cli' } });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

function parseChecksum(text: string, filename: string): string | null {
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^([a-f0-9]{64})\s+\*?(.+)$/i);
    if (!match) continue;
    if (match[2] === filename) return match[1] ?? null;
  }
  return null;
}
