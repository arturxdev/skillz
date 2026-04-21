import { cancel, intro, isCancel, log, multiselect, outro, select, spinner } from '@clack/prompts';
import { existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ApiError, apiFetch } from '../lib/api-client';
import { requireConfig } from '../lib/config';
import { API_BASE_URL, GLOBAL_SKILLS_DIR, PROJECT_SKILLS_DIR } from '../lib/constants';
import { getLocalDb } from '../lib/local-db';
import { computeSha256, extractTarball } from '../lib/tarball';
import { injectTelemetry } from '../lib/telemetry-injector';
import { requireTTY } from '../lib/tty';

type SkillListing = {
  id: string;
  name: string;
  latest_version: number | null;
  latest_hash: string | null;
};

type VersionMeta = {
  skill_id: string;
  name: string;
  version: number;
  hash: string;
  size_bytes: number;
  download_url: string;
};

type InstallationsResp = { ok: boolean; installation_id: string };

export async function installCommand(opts: {
  target?: string;
  scope?: 'global' | 'project';
  force?: boolean;
}): Promise<void> {
  const cfg = requireConfig();

  let requests: { name: string; version?: number }[] = [];

  if (opts.target) {
    const [n, v] = opts.target.split('@');
    if (!n) {
      console.error('Invalid target');
      process.exit(1);
    }
    const version = v ? Number(v.replace(/^v/i, '')) : undefined;
    if (v !== undefined && (!Number.isInteger(version) || (version ?? 0) < 1)) {
      console.error(`Invalid version: ${v}`);
      process.exit(1);
    }
    requests = [{ name: n.toLowerCase(), version }];
  } else {
    requireTTY(
      'skillz install',
      'skillz install <name>[@v] --scope=<global|project>',
    );
    intro('skillz install');

    const { skills } = await apiFetch<{ skills: SkillListing[] }>('/skills', { token: cfg.token });
    const installable = skills.filter((s) => s.latest_version !== null);

    if (installable.length === 0) {
      outro('No installable skills. Push one first with `skillz push`.');
      return;
    }

    const picked = await multiselect({
      message: 'Which skills?',
      options: installable.map((s) => ({
        value: s.name,
        label: `${s.name}@v${s.latest_version}`,
        hint: s.latest_hash ? s.latest_hash.slice(0, 8) : undefined,
      })),
      required: true,
    });
    if (isCancel(picked)) {
      cancel('Cancelled');
      return;
    }
    requests = (picked as string[]).map((name) => ({ name }));
  }

  let scope = opts.scope;
  if (!scope) {
    if (!process.stdout.isTTY) {
      console.error('--scope=<global|project> is required in non-interactive mode');
      process.exit(1);
    }
    const s = await select({
      message: 'Scope:',
      options: [
        { value: 'project', label: 'Project (.claude/skills/)', hint: 'recommended' },
        { value: 'global', label: 'Global (~/.claude/skills/)' },
      ],
    });
    if (isCancel(s)) {
      cancel('Cancelled');
      return;
    }
    scope = s as 'global' | 'project';
  }

  const cwd = process.cwd();
  const baseDir = scope === 'global' ? GLOBAL_SKILLS_DIR : resolve(cwd, PROJECT_SKILLS_DIR);
  mkdirSync(baseDir, { recursive: true });

  let succeeded = 0;
  for (const { name, version } of requests) {
    const s = spinner();
    s.start(`Installing ${name}`);
    try {
      const metaPath = version
        ? `/skills/${name}/versions/${version}`
        : `/skills/${name}/versions/latest`;
      const meta = await apiFetch<VersionMeta>(metaPath, { token: cfg.token });

      const base = cfg.api_base_url || API_BASE_URL;
      const dlRes = await fetch(`${base}${meta.download_url}`, {
        headers: { Authorization: `Bearer ${cfg.token}` },
      });
      if (!dlRes.ok) {
        throw new ApiError(dlRes.status, 'download_failed', `download failed: ${dlRes.status}`);
      }
      const buf = Buffer.from(await dlRes.arrayBuffer());

      const got = computeSha256(buf);
      if (got !== meta.hash) {
        throw new Error(`hash mismatch (expected ${meta.hash.slice(0, 12)}, got ${got.slice(0, 12)})`);
      }

      const installDir = join(baseDir, meta.name);
      if (existsSync(installDir) && !opts.force) {
        s.stop(`${name} already installed at ${installDir} — pass --force to reinstall`);
        continue;
      }
      mkdirSync(installDir, { recursive: true });
      await extractTarball(buf, installDir);
      injectTelemetry(installDir, meta.name);

      const inst = await apiFetch<InstallationsResp>('/installations', {
        method: 'POST',
        body: {
          skill_id: meta.skill_id,
          version: meta.version,
          scope,
          project_path: scope === 'project' ? cwd : null,
        },
        token: cfg.token,
      });

      const db = getLocalDb();
      db.run(
        `INSERT OR REPLACE INTO installed_skills
         (skill_id, name, version, scope, project_path, install_path, installation_id, installed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          meta.skill_id,
          meta.name,
          meta.version,
          scope,
          scope === 'project' ? cwd : null,
          installDir,
          inst.installation_id,
          Date.now(),
        ],
      );

      s.stop(`✓ ${meta.name}@v${meta.version}`);
      succeeded++;
    } catch (e) {
      s.stop(`✗ ${name}: ${(e as Error).message}`);
    }
  }

  outro(`${succeeded}/${requests.length} installed in scope=${scope}`);
}
