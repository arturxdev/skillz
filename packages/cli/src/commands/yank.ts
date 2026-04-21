import { cancel, confirm, intro, isCancel, outro, select, text } from '@clack/prompts';
import { apiFetch } from '../lib/api-client';
import { requireConfig } from '../lib/config';
import { requireTTY } from '../lib/tty';

type SkillListing = { name: string; latest_version: number | null };
type Version = { version: number; yanked_at: string | null };

export async function yankCommand(opts: { target?: string }): Promise<void> {
  const cfg = requireConfig();

  let skillName: string | undefined;
  let version: number | undefined;

  if (opts.target) {
    const [n, v] = opts.target.split('@');
    skillName = n?.toLowerCase();
    if (v) {
      version = Number(v.replace(/^v/i, ''));
      if (!Number.isInteger(version) || version < 1) {
        console.error(`Invalid version: ${v}`);
        process.exit(1);
      }
    }
  }

  if (!skillName) {
    requireTTY('skillz yank', 'skillz yank <name>@<version>');
    intro('skillz yank');
    const { skills } = await apiFetch<{ skills: SkillListing[] }>('/skills', {
      token: cfg.token,
    });
    if (skills.length === 0) {
      outro('No skills.');
      return;
    }
    const picked = await select({
      message: 'Skill:',
      options: skills.map((s) => ({ value: s.name, label: s.name })),
    });
    if (isCancel(picked)) {
      cancel('Cancelled');
      return;
    }
    skillName = picked as string;
  }

  if (!version) {
    if (!process.stdout.isTTY) {
      console.error('Pass <name>@<version> in non-TTY mode');
      process.exit(1);
    }
    const { versions } = await apiFetch<{ versions: Version[] }>(
      `/skills/${skillName}/versions`,
      { token: cfg.token },
    );
    const active = versions.filter((v) => !v.yanked_at);
    if (active.length === 0) {
      console.log('No active versions to yank.');
      return;
    }
    const picked = await select({
      message: 'Version to yank:',
      options: active.map((v) => ({ value: v.version, label: `v${v.version}` })),
    });
    if (isCancel(picked)) {
      cancel('Cancelled');
      return;
    }
    version = picked as number;
  }

  let reason: string | undefined;
  if (process.stdout.isTTY) {
    const r = await text({
      message: 'Reason (optional):',
      placeholder: 'broken on v3, supersedes etc.',
    });
    if (isCancel(r)) {
      cancel('Cancelled');
      return;
    }
    reason = r.trim() || undefined;
  }

  const ok = await confirm({ message: `Yank ${skillName}@v${version}?` });
  if (isCancel(ok) || !ok) {
    cancel('Cancelled');
    return;
  }

  await apiFetch(`/skills/${skillName}/versions/${version}/yank`, {
    method: 'POST',
    body: { reason },
    token: cfg.token,
  });
  outro(`Yanked ${skillName}@v${version}`);
}
