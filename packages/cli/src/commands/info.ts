import { apiFetch } from '../lib/api-client';
import { requireConfig } from '../lib/config';

type LatestResp = {
  skill_id: string;
  name: string;
  version: number;
  hash: string;
  size_bytes: number;
  download_url: string;
};

export async function infoCommand(opts: { skill: string }): Promise<void> {
  const cfg = requireConfig();
  try {
    const latest = await apiFetch<LatestResp>(`/skills/${opts.skill}/versions/latest`, {
      token: cfg.token,
    });
    console.log(`name          ${latest.name}`);
    console.log(`skill_id      ${latest.skill_id}`);
    console.log(`latest        v${latest.version}`);
    console.log(`hash          ${latest.hash}`);
    console.log(`size          ${(latest.size_bytes / 1024).toFixed(1)} KB`);
  } catch (e) {
    console.error((e as Error).message);
    process.exit(1);
  }
}
