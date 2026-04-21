import { cancel, intro, isCancel, multiselect, outro } from '@clack/prompts';
import { apiFetch } from '../lib/api-client';
import { requireConfig } from '../lib/config';
import { getLocalDb, type InstalledRow } from '../lib/local-db';
import { requireTTY } from '../lib/tty';
import { installCommand } from './install';

type SkillListing = { name: string; latest_version: number | null };

export async function updateCommand(opts: { skill?: string }): Promise<void> {
  const cfg = requireConfig();
  const db = getLocalDb();
  const cwd = process.cwd();

  const installed = db
    .query(
      `SELECT * FROM installed_skills
       WHERE scope = 'global' OR (scope = 'project' AND project_path = ?)`,
    )
    .all(cwd) as InstalledRow[];

  if (installed.length === 0) {
    console.log('No skills installed.');
    return;
  }

  const { skills } = await apiFetch<{ skills: SkillListing[] }>('/skills', {
    token: cfg.token,
  });
  const latestByName = new Map(skills.map((s) => [s.name, s.latest_version]));

  const upgradable = installed.filter((i) => {
    const latest = latestByName.get(i.name);
    return latest != null && latest > i.version;
  });

  if (upgradable.length === 0) {
    console.log('Everything is up to date.');
    return;
  }

  let picked: string[];

  if (opts.skill) {
    const match = upgradable.find((u) => u.name === opts.skill);
    if (!match) {
      console.log(`${opts.skill}: nothing to update`);
      return;
    }
    picked = [match.name];
  } else {
    requireTTY('skillz update', 'skillz update <name>');
    intro('skillz update');
    const choice = await multiselect({
      message: 'Which skills?',
      options: upgradable.map((u) => ({
        value: u.name,
        label: `${u.name}: v${u.version} → v${latestByName.get(u.name)}`,
      })),
      initialValues: upgradable.map((u) => u.name),
      required: true,
    });
    if (isCancel(choice)) {
      cancel('Cancelled');
      return;
    }
    picked = choice as string[];
  }

  for (const name of picked) {
    const existing = upgradable.find((u) => u.name === name);
    if (!existing) continue;
    await installCommand({ target: name, scope: existing.scope, force: true });
  }

  outro(`Updated ${picked.length}`);
}
