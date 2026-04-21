#!/usr/bin/env bun
import { Command } from 'commander';
import { VERSION } from './lib/constants';

// Fast path: `skillz track <skill>` must not load @clack/prompts, banner,
// update-checker, or anything non-essential. We branch before building the full
// program to keep cold start as low as possible.
//
// Position of the subcommand in argv:
//   compiled binary:  argv[1]            (argv[0] = exe)
//   `bun run src/`:   argv[2]            (argv[1] = <something>.ts)
{
  const subPos = process.argv[1]?.endsWith('.ts') ? 2 : 1;
  if (process.argv[subPos] === 'track') {
    const { trackCommand } = await import('./commands/track');
    await trackCommand(process.argv.slice(subPos + 1));
    process.exit(0);
  }
}

const program = new Command();

program
  .name('skillz')
  .description('Private registry + CLI for LLM skills')
  .version(VERSION);

// Auth
program
  .command('link [email]')
  .description('Link this machine to your skillz account')
  .action(async (email: string | undefined) => {
    const { linkCommand } = await import('./commands/link');
    await linkCommand({ email });
  });

program
  .command('whoami')
  .description('Show this device')
  .action(async () => {
    const { whoamiCommand } = await import('./commands/whoami');
    await whoamiCommand();
  });

program
  .command('logout')
  .description('Unlink this machine')
  .action(async () => {
    const { logoutCommand } = await import('./commands/logout');
    await logoutCommand();
  });

const auth = program.command('auth').description('Device management');

auth
  .command('devices')
  .description('List linked devices')
  .action(async () => {
    const { authDevicesCommand } = await import('./commands/auth-devices');
    await authDevicesCommand();
  });

auth
  .command('revoke [device]')
  .description('Revoke a device')
  .option('--force', 'skip confirmation')
  .action(async (device: string | undefined, opts: { force?: boolean }) => {
    const { authRevokeCommand } = await import('./commands/auth-revoke');
    await authRevokeCommand({ device, force: opts.force });
  });

// Publish
program
  .command('push [path]')
  .description('Publish a skill as a new version')
  .action(async (path: string | undefined) => {
    const { pushCommand } = await import('./commands/push');
    await pushCommand({ path: path ?? process.cwd() });
  });

program
  .command('versions <skill>')
  .description('List versions of a skill')
  .action(async (skill: string) => {
    const { versionsCommand } = await import('./commands/versions');
    await versionsCommand({ skill });
  });

program
  .command('yank [target]')
  .description('Retract a version (format: skill@version)')
  .action(async (target: string | undefined) => {
    const { yankCommand } = await import('./commands/yank');
    await yankCommand({ target });
  });

program
  .command('diff <skill> <v1> <v2>')
  .description('Show textual diff between two versions')
  .action(async (skill: string, v1: string, v2: string) => {
    const { diffCommand } = await import('./commands/diff');
    await diffCommand({ skill, v1: Number(v1), v2: Number(v2) });
  });

// Install
program
  .command('install [target]')
  .description('Install a skill (format: skill[@version])')
  .option('--scope <scope>', "'global' or 'project'")
  .option('--force', 'reinstall if already present')
  .action(
    async (
      target: string | undefined,
      opts: { scope?: 'global' | 'project'; force?: boolean },
    ) => {
      const { installCommand } = await import('./commands/install');
      await installCommand({ target, scope: opts.scope, force: opts.force });
    },
  );

program
  .command('update [skill]')
  .description('Update skills to latest')
  .action(async (skill: string | undefined) => {
    const { updateCommand } = await import('./commands/update');
    await updateCommand({ skill });
  });

program
  .command('list')
  .alias('ls')
  .description('List skills (installed locally, remote registry, or outdated)')
  .option('--scope <scope>', "'global', 'project', or 'all'", 'all')
  .option('--remote', 'list skills in the cloud registry')
  .option('--outdated', 'show installed skills with newer versions available')
  .action(
    async (opts: {
      scope: 'global' | 'project' | 'all';
      remote?: boolean;
      outdated?: boolean;
    }) => {
      const { listCommand } = await import('./commands/list');
      await listCommand(opts);
    },
  );

program
  .command('info <skill>')
  .description('Show skill details')
  .action(async (skill: string) => {
    const { infoCommand } = await import('./commands/info');
    await infoCommand({ skill });
  });

program
  .command('remove [skill]')
  .alias('rm')
  .description('Uninstall a skill')
  .option('--purge-stats', 'also remove local stats')
  .action(async (skill: string | undefined, opts: { purgeStats?: boolean }) => {
    const { removeCommand } = await import('./commands/remove');
    await removeCommand({ skill, purgeStats: opts.purgeStats });
  });

// Telemetry
program
  .command('track <skill>')
  .description('Record activation (called by LLM from installed SKILL.md)')
  .action(async (skill: string) => {
    const { trackCommand } = await import('./commands/track');
    await trackCommand([skill]);
  });

program
  .command('sync')
  .description('Flush offline telemetry queue')
  .action(async () => {
    const { syncCommand } = await import('./commands/sync');
    await syncCommand();
  });

program
  .command('stats [skill]')
  .description('Show activations')
  .option('--last <period>', '7d | 30d | all', '30d')
  .option('--by <dim>', 'skill | project | device | version')
  .action(
    async (
      skill: string | undefined,
      opts: { last: string; by?: 'project' | 'device' | 'version' | 'skill' },
    ) => {
      const { statsCommand } = await import('./commands/stats');
      await statsCommand({ skill, last: opts.last, by: opts.by });
    },
  );

// Meta
program
  .command('version')
  .description('Show installed + latest available')
  .action(async () => {
    const { versionCommand } = await import('./commands/version');
    await versionCommand();
  });

program
  .command('self-update')
  .description('Download and install the latest skillz release')
  .action(async () => {
    const { selfUpdateCommand } = await import('./commands/self-update');
    await selfUpdateCommand();
  });

// Passive background update check — fired once at startup for commands that
// aren't the hot path. The result is displayed as a Clack `note` in preAction,
// before the command's output. Respects the 24h cache in update-checker.
const SKIP_UPDATE_CHECK = new Set([
  'track',
  'self-update',
  'version',
  '--version',
  '-V',
  'help',
  '--help',
  '-h',
]);

const updatePromise = (async () => {
  const subPos = process.argv[1]?.endsWith('.ts') ? 2 : 1;
  const cmd = process.argv[subPos];
  if (!cmd || SKIP_UPDATE_CHECK.has(cmd)) return null;
  try {
    const { checkForUpdate } = await import('./lib/update-checker');
    return await checkForUpdate();
  } catch {
    return null;
  }
})();

program.hook('preAction', async () => {
  const info = await updatePromise;
  if (!info?.hasUpdate) return;
  try {
    const { note } = await import('@clack/prompts');
    note(
      `skillz ${info.latest} is available (you have ${info.current}).\nRun \`skillz self-update\` to upgrade.`,
      'update available',
    );
  } catch {
    // swallow — the check is best-effort
  }
});

await program.parseAsync(process.argv);
