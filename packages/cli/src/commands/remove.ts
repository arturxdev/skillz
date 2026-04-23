import { cancel, confirm, intro, isCancel, log, outro, select } from '@clack/prompts';
import { existsSync, rmSync } from 'node:fs';
import { apiFetch } from '../lib/api-client';
import { requireConfig } from '../lib/config';
import { getLocalDb, type InstalledRow } from '../lib/local-db';
import { removeSkillSymlinkIfOurs } from '../lib/symlink';
import { removeTelemetry } from '../lib/telemetry-injector';
import { requireTTY } from '../lib/tty';

export async function removeCommand(opts: {
  skill?: string;
  purgeStats?: boolean;
}): Promise<void> {
  const cfg = requireConfig();
  const db = getLocalDb();
  const cwd = process.cwd();

  const rows = db
    .query(
      `SELECT * FROM installed_skills
       WHERE scope = 'global' OR (scope = 'project' AND project_path = ?)
       ORDER BY name`,
    )
    .all(cwd) as InstalledRow[];

  if (rows.length === 0) {
    console.log('Nothing to remove.');
    return;
  }

  let target: InstalledRow | undefined;
  if (opts.skill) {
    target = rows.find((r) => r.name === opts.skill);
    if (!target) {
      console.error(`Not installed here: ${opts.skill}`);
      process.exit(1);
    }
  } else {
    requireTTY('skillz remove', 'skillz remove <name>');
    intro('skillz remove');
    const picked = await select({
      message: 'Which skill?',
      options: rows.map((r) => ({
        value: `${r.skill_id}|${r.scope}|${r.project_path ?? ''}`,
        label: `${r.name}@v${r.version}`,
        hint: r.scope === 'project' ? 'project' : 'global',
      })),
    });
    if (isCancel(picked)) {
      cancel('Cancelled');
      return;
    }
    const [skillId, scope, projectPath] = String(picked).split('|');
    target = rows.find(
      (r) =>
        r.skill_id === skillId &&
        r.scope === scope &&
        (r.project_path ?? '') === projectPath,
    );
  }

  if (!target) return;

  const ok = await confirm({ message: `Remove ${target.name}@v${target.version}?` });
  if (isCancel(ok) || !ok) {
    cancel('Cancelled');
    return;
  }

  try {
    removeTelemetry(target.install_path);

    const claudeLinkPath = target.install_path.replace(
      /\/\.agents\/skills\//,
      '/.claude/skills/',
    );
    if (claudeLinkPath !== target.install_path) {
      removeSkillSymlinkIfOurs(target.install_path, claudeLinkPath);
    }

    if (existsSync(target.install_path)) {
      rmSync(target.install_path, { recursive: true, force: true });
    }
  } catch (e) {
    log.warn(`Filesystem cleanup: ${(e as Error).message}`);
  }

  if (target.installation_id) {
    try {
      await apiFetch(`/installations/${target.installation_id}`, {
        method: 'DELETE',
        token: cfg.token,
      });
    } catch (e) {
      log.warn(`Server cleanup: ${(e as Error).message}`);
    }
  }

  db.run(
    `DELETE FROM installed_skills
     WHERE skill_id = ? AND scope = ?
       AND ((project_path IS NULL AND ? IS NULL) OR project_path = ?)`,
    [target.skill_id, target.scope, target.project_path, target.project_path],
  );

  outro(`Removed ${target.name}`);
}
