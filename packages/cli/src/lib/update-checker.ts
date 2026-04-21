import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { UPDATE_CHECK_PATH, UPDATE_CHECK_TTL_MS, VERSION } from './constants';

const REPO = 'arturxdev/skillz';
const CHECK_TIMEOUT_MS = 3000;

type CheckState = {
  last_check: number;
  latest: string;
};

export type UpdateInfo = {
  current: string;
  latest: string;
  hasUpdate: boolean;
};

export async function checkForUpdate(force = false): Promise<UpdateInfo | null> {
  try {
    if (!force) {
      const cached = readCache();
      if (cached && Date.now() - cached.last_check < UPDATE_CHECK_TTL_MS) {
        return {
          current: VERSION,
          latest: cached.latest,
          hasUpdate: semverGt(cached.latest, VERSION),
        };
      }
    }

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), CHECK_TIMEOUT_MS);
    try {
      const res = await fetch(
        `https://api.github.com/repos/${REPO}/releases/latest`,
        {
          signal: ctrl.signal,
          headers: {
            'User-Agent': 'skillz-cli',
            Accept: 'application/vnd.github+json',
          },
        },
      );
      if (!res.ok) return null;
      const data = (await res.json()) as { tag_name: string };
      const latest = data.tag_name.replace(/^v/, '');

      writeCache({ last_check: Date.now(), latest });

      return {
        current: VERSION,
        latest,
        hasUpdate: semverGt(latest, VERSION),
      };
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return null;
  }
}

export function semverGt(a: string, b: string): boolean {
  const pa = a.split('.').map((n) => Number(n));
  const pb = b.split('.').map((n) => Number(n));
  for (let i = 0; i < 3; i++) {
    const av = pa[i] ?? 0;
    const bv = pb[i] ?? 0;
    if (av !== bv) return av > bv;
  }
  return false;
}

function readCache(): CheckState | null {
  if (!existsSync(UPDATE_CHECK_PATH)) return null;
  try {
    return JSON.parse(readFileSync(UPDATE_CHECK_PATH, 'utf-8')) as CheckState;
  } catch {
    return null;
  }
}

function writeCache(state: CheckState): void {
  try {
    mkdirSync(dirname(UPDATE_CHECK_PATH), { recursive: true });
    writeFileSync(UPDATE_CHECK_PATH, JSON.stringify(state));
  } catch {
    // Non-fatal — we'll just re-check next time.
  }
}

export function clearUpdateCache(): void {
  try {
    writeCache({ last_check: 0, latest: VERSION });
  } catch {
    // ignore
  }
}
