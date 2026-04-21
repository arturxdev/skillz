import { basename } from 'node:path';
import { apiFetch } from '../lib/api-client';
import { requireConfig } from '../lib/config';

type StatsResp = {
  skill: string | null;
  since: string;
  total: number;
  by_skill: Array<{ name: string; count: number }>;
  by_version: Array<{ version: number | null; count: number }>;
  by_device: Array<{ hostname: string; count: number }>;
  by_project: Array<{ project_path: string | null; count: number }>;
};

export async function statsCommand(opts: {
  skill?: string;
  last: string;
  by?: 'project' | 'device' | 'version' | 'skill';
}): Promise<void> {
  const cfg = requireConfig();

  const params = new URLSearchParams();
  if (opts.skill) params.set('skill', opts.skill);
  if (opts.last) params.set('since', opts.last);
  if (opts.by) params.set('by', opts.by);

  const res = await apiFetch<StatsResp>(`/stats?${params.toString()}`, {
    token: cfg.token,
  });

  const title = res.skill ?? 'all skills';
  console.log(title);
  console.log('─'.repeat(Math.max(title.length, 20)));
  console.log(`  Total activations (${res.since}):  ${res.total}`);

  if (res.total === 0) {
    console.log('\n  (no activations yet)');
    return;
  }

  const showAll = !opts.by;

  if ((showAll || opts.by === 'skill') && res.by_skill.length > 0) {
    console.log('');
    console.log('  By skill:');
    for (const row of res.by_skill) {
      console.log(`    ${row.name.padEnd(25)} ${row.count}`);
    }
  }

  if ((showAll || opts.by === 'version') && res.by_version.length > 0) {
    console.log('');
    console.log('  By version:');
    for (const row of res.by_version) {
      const label = row.version === null ? '(unknown)' : `v${row.version}`;
      console.log(`    ${label.padEnd(10)} ${row.count}`);
    }
  }

  if ((showAll || opts.by === 'device') && res.by_device.length > 0) {
    console.log('');
    console.log('  By device:');
    for (const row of res.by_device) {
      console.log(`    ${row.hostname.padEnd(20)} ${row.count}`);
    }
  }

  if ((showAll || opts.by === 'project') && res.by_project.length > 0) {
    console.log('');
    console.log('  By project:');
    for (const row of res.by_project) {
      const label = row.project_path ? basename(row.project_path) : '(global)';
      console.log(`    ${label.padEnd(20)} ${row.count}`);
    }
  }
}
