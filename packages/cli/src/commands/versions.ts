import Table from 'cli-table3';
import { apiFetch } from '../lib/api-client';
import { requireConfig } from '../lib/config';

type Version = {
  version: number;
  hash: string;
  size_bytes: number;
  pushed_at: string;
  yanked_at: string | null;
  yank_reason: string | null;
};

export async function versionsCommand(opts: { skill: string }): Promise<void> {
  const cfg = requireConfig();
  const res = await apiFetch<{ name: string; versions: Version[] }>(
    `/skills/${opts.skill}/versions`,
    { token: cfg.token },
  );

  if (res.versions.length === 0) {
    console.log(`${opts.skill}: no versions`);
    return;
  }

  const table = new Table({
    head: ['version', 'size', 'hash', 'pushed', 'status'],
    style: { head: ['bold'] },
  });
  for (const v of res.versions) {
    table.push([
      `v${v.version}`,
      `${(v.size_bytes / 1024).toFixed(1)} KB`,
      v.hash.slice(0, 12),
      new Date(v.pushed_at).toISOString().slice(0, 16).replace('T', ' '),
      v.yanked_at ? `yanked${v.yank_reason ? ': ' + v.yank_reason : ''}` : '',
    ]);
  }
  console.log(table.toString());
}
