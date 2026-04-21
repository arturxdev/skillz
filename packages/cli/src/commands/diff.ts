import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { apiFetch } from '../lib/api-client';
import { requireConfig } from '../lib/config';
import { API_BASE_URL } from '../lib/constants';
import { computeSha256, extractTarball } from '../lib/tarball';

type VersionMeta = {
  skill_id: string;
  name: string;
  version: number;
  hash: string;
  download_url: string;
};

export async function diffCommand(opts: {
  skill: string;
  v1: number;
  v2: number;
}): Promise<void> {
  const { skill, v1, v2 } = opts;

  if (!Number.isInteger(v1) || !Number.isInteger(v2) || v1 < 1 || v2 < 1) {
    console.error('Versions must be positive integers');
    process.exit(1);
  }
  if (v1 === v2) {
    console.log(`${skill}@v${v1} is the same as itself.`);
    return;
  }

  const cfg = requireConfig();

  try {
    const [a, b] = await Promise.all([
      fetchSkillMd(cfg.token, cfg.api_base_url, skill, v1),
      fetchSkillMd(cfg.token, cfg.api_base_url, skill, v2),
    ]);

    if (a === null) {
      console.error(`SKILL.md not found in ${skill}@v${v1}`);
      process.exit(1);
    }
    if (b === null) {
      console.error(`SKILL.md not found in ${skill}@v${v2}`);
      process.exit(1);
    }

    if (a === b) {
      console.log(`${skill}@v${v1} and v${v2} have identical SKILL.md`);
      return;
    }

    const diffText = await runDiff(
      a,
      b,
      `${skill}@v${v1}/SKILL.md`,
      `${skill}@v${v2}/SKILL.md`,
    );
    console.log(process.stdout.isTTY ? colorize(diffText) : diffText);
  } catch (e) {
    console.error((e as Error).message);
    process.exit(1);
  }
}

async function fetchSkillMd(
  token: string,
  baseUrl: string,
  name: string,
  version: number,
): Promise<string | null> {
  const meta = await apiFetch<VersionMeta>(`/skills/${name}/versions/${version}`, {
    token,
  });

  const base = baseUrl || API_BASE_URL;
  const res = await fetch(`${base}${meta.download_url}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`Download failed for v${version}: HTTP ${res.status}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());

  const got = computeSha256(buf);
  if (got !== meta.hash) {
    throw new Error(`Hash mismatch on v${version}`);
  }

  const tmp = join(
    tmpdir(),
    `skillz-diff-${name}-${version}-${process.pid}-${Date.now()}`,
  );
  mkdirSync(tmp, { recursive: true });
  try {
    await extractTarball(buf, tmp);
    const skillPath = join(tmp, 'SKILL.md');
    if (!existsSync(skillPath)) return null;
    return readFileSync(skillPath, 'utf-8');
  } finally {
    try {
      rmSync(tmp, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
}

async function runDiff(
  a: string,
  b: string,
  aLabel: string,
  bLabel: string,
): Promise<string> {
  const ts = Date.now();
  const pa = join(tmpdir(), `skillz-diff-a-${ts}-${process.pid}.md`);
  const pb = join(tmpdir(), `skillz-diff-b-${ts}-${process.pid}.md`);
  writeFileSync(pa, a);
  writeFileSync(pb, b);

  try {
    const proc = Bun.spawn(
      ['diff', '-u', '--label', aLabel, '--label', bLabel, pa, pb],
      { stdout: 'pipe', stderr: 'pipe' },
    );
    const out = await new Response(proc.stdout).text();
    const err = await new Response(proc.stderr).text();
    const code = await proc.exited;
    if (code > 1) {
      throw new Error(`diff exited ${code}${err ? ': ' + err.trim() : ''}`);
    }
    return out;
  } finally {
    try {
      unlinkSync(pa);
    } catch {
      // ignore
    }
    try {
      unlinkSync(pb);
    } catch {
      // ignore
    }
  }
}

function colorize(text: string): string {
  const RESET = '\x1b[0m';
  const RED = '\x1b[31m';
  const GREEN = '\x1b[32m';
  const CYAN = '\x1b[36m';
  const DIM = '\x1b[2m';

  return text
    .split('\n')
    .map((line) => {
      if (line.startsWith('+++') || line.startsWith('---')) return `${DIM}${line}${RESET}`;
      if (line.startsWith('@@')) return `${CYAN}${line}${RESET}`;
      if (line.startsWith('+')) return `${GREEN}${line}${RESET}`;
      if (line.startsWith('-')) return `${RED}${line}${RESET}`;
      return line;
    })
    .join('\n');
}
