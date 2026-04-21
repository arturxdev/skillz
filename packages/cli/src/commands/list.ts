import Table from 'cli-table3';
import { getLocalDb, type InstalledRow } from '../lib/local-db';

export async function listCommand(opts: {
  scope: 'global' | 'project' | 'all';
}): Promise<void> {
  const db = getLocalDb();
  const rows = db
    .query(`SELECT * FROM installed_skills ORDER BY installed_at DESC`)
    .all() as InstalledRow[];

  const cwd = process.cwd();
  const filtered =
    opts.scope === 'all'
      ? rows
      : opts.scope === 'project'
        ? rows.filter((r) => r.scope === 'project' && r.project_path === cwd)
        : rows.filter((r) => r.scope === 'global');

  if (filtered.length === 0) {
    console.log(
      opts.scope === 'project'
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

function truncate(s: string, max: number): string {
  return s.length > max ? '…' + s.slice(-(max - 1)) : s;
}
