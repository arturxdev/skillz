import Table from 'cli-table3';
import { apiFetch } from '../lib/api-client';
import { requireConfig } from '../lib/config';
import { getLocalDb, type InstalledRow } from '../lib/local-db';

type RemoteSkill = {
  id: string;
  name: string;
  latest_version: number | null;
  latest_hash: string | null;
  created_at: string;
};

export async function listCommand(opts: {
  scope: 'global' | 'project' | 'all';
  remote?: boolean;
  outdated?: boolean;
}): Promise<void> {
  if (opts.remote) {
    await listRemote();
    return;
  }

  if (opts.outdated) {
    await listOutdated(opts.scope);
    return;
  }

  listLocal(opts.scope);
}

function listLocal(scope: 'global' | 'project' | 'all'): void {
  const db = getLocalDb();
  const rows = db
    .query(`SELECT * FROM installed_skills ORDER BY installed_at DESC`)
    .all() as InstalledRow[];

  const cwd = process.cwd();
  const filtered =
    scope === 'all'
      ? rows
      : scope === 'project'
        ? rows.filter((r) => r.scope === 'project' && r.project_path === cwd)
        : rows.filter((r) => r.scope === 'global');

  if (filtered.length === 0) {
    console.log(
      scope === 'project'
        ? `No skills installed in this project (${cwd}).`
        : 'No skills installed.',
    );
    return;
  }

  const table = new Table({
    head: ['name', 'version', 'scope', 'installed'],
    style: { head: ['bold'] },
  });
  for (const r of filtered) {
    table.push([
      r.name,
      `v${r.version}`,
      r.scope === 'project' ? `project (${truncate(r.project_path ?? '', 40)})` : 'global',
      new Date(r.installed_at).toISOString().slice(0, 16).replace('T', ' '),
    ]);
  }
  console.log(table.toString());
}

async function listRemote(): Promise<void> {
  const cfg = requireConfig();
  const { skills } = await apiFetch<{ skills: RemoteSkill[] }>('/skills', {
    token: cfg.token,
  });

  if (skills.length === 0) {
    console.log('No skills in the registry.');
    return;
  }

  const db = getLocalDb();
  const cwd = process.cwd();
  const installed = db
    .query(`SELECT * FROM installed_skills`)
    .all() as InstalledRow[];

  const installedMap = new Map<string, InstalledRow[]>();
  for (const row of installed) {
    const arr = installedMap.get(row.name) ?? [];
    arr.push(row);
    installedMap.set(row.name, arr);
  }

  const table = new Table({
    head: ['name', 'latest', 'hash', 'installed here'],
    style: { head: ['bold'] },
  });
  for (const s of skills) {
    const matches = installedMap.get(s.name) ?? [];
    const projectMatch = matches.find((m) => m.scope === 'project' && m.project_path === cwd);
    const globalMatch = matches.find((m) => m.scope === 'global');

    const statusParts: string[] = [];
    if (projectMatch) {
      const outdated = s.latest_version !== null && projectMatch.version < s.latest_version;
      statusParts.push(`project v${projectMatch.version}${outdated ? ' (old)' : ''}`);
    }
    if (globalMatch) {
      const outdated = s.latest_version !== null && globalMatch.version < s.latest_version;
      statusParts.push(`global v${globalMatch.version}${outdated ? ' (old)' : ''}`);
    }

    table.push([
      s.name,
      s.latest_version !== null ? `v${s.latest_version}` : '(no versions)',
      s.latest_hash ? s.latest_hash.slice(0, 8) : '—',
      statusParts.length ? statusParts.join(', ') : '—',
    ]);
  }
  console.log(table.toString());
}

async function listOutdated(scope: 'global' | 'project' | 'all'): Promise<void> {
  const cfg = requireConfig();
  const { skills } = await apiFetch<{ skills: RemoteSkill[] }>('/skills', {
    token: cfg.token,
  });
  const latestByName = new Map(skills.map((s) => [s.name, s.latest_version]));

  const db = getLocalDb();
  const cwd = process.cwd();
  const installed = db
    .query(`SELECT * FROM installed_skills ORDER BY name`)
    .all() as InstalledRow[];

  const filtered =
    scope === 'all'
      ? installed
      : scope === 'project'
        ? installed.filter((r) => r.scope === 'project' && r.project_path === cwd)
        : installed.filter((r) => r.scope === 'global');

  const outdated = filtered.filter((r) => {
    const latest = latestByName.get(r.name);
    return latest != null && latest > r.version;
  });

  if (outdated.length === 0) {
    console.log('Everything is up to date.');
    return;
  }

  const table = new Table({
    head: ['name', 'current', 'latest', 'scope'],
    style: { head: ['bold'] },
  });
  for (const r of outdated) {
    table.push([
      r.name,
      `v${r.version}`,
      `v${latestByName.get(r.name)}`,
      r.scope === 'project' ? `project (${truncate(r.project_path ?? '', 40)})` : 'global',
    ]);
  }
  console.log(table.toString());
  console.log('\nRun `skillz update` to upgrade.');
}

function truncate(s: string, max: number): string {
  return s.length > max ? '…' + s.slice(-(max - 1)) : s;
}
