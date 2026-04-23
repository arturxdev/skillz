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

  if (res.by_skill.length === 0) {
    console.log('  (no executions yet)');
    return;
  }

  for (const row of res.by_skill) {
    console.log(`  ${row.name.padEnd(25)} ${row.count}`);
  }
  console.log(`  ${'─'.repeat(27)}`);
  console.log(`  ${'Total'.padEnd(25)} ${res.total}`);
}
