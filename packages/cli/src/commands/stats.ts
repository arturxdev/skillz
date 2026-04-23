import { apiFetch } from '../lib/api-client';
import { requireConfig } from '../lib/config';

type StatsResp = {
  total: number;
  by_skill: Array<{ name: string; count: number }>;
};

export async function statsCommand(): Promise<void> {
  const cfg = requireConfig();

  const res = await apiFetch<StatsResp>('/stats', { token: cfg.token });

  console.log('Skills');
  console.log('──────');
  console.log(`  Total activations:  ${res.total}`);

  if (res.total === 0) {
    console.log('\n  (no activations yet)');
    return;
  }

  console.log('');
  for (const row of res.by_skill) {
    console.log(`  ${row.name.padEnd(25)} ${row.count}`);
  }
}
