#!/usr/bin/env bun
import { Command } from 'commander';
import { VERSION } from './lib/constants';

// Fast path: `skillz track <skill>` must not load @clack/prompts, banner,
// update-checker, or anything non-essential. We branch before building the full
// program to keep cold start as low as possible.
//
// argv layout:
//   compiled binary:  [exe, 'track', ...rest]       → argv[1]
//   `bun run src/`:   [bun, src, 'track', ...rest]  → argv[2]
{
  const trackIdx = process.argv.indexOf('track');
  if (trackIdx === 1 || trackIdx === 2) {
    const { trackCommand } = await import('./commands/track');
    await trackCommand(process.argv.slice(trackIdx + 1));
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
  .description('List installed skills')
  .option('--scope <scope>', "'global', 'project', or 'all'", 'all')
  .action(async (opts: { scope: 'global' | 'project' | 'all' }) => {
    const { listCommand } = await import('./commands/list');
    await listCommand({ scope: opts.scope });
  });

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
  .option('--by <dim>', 'project | device | version')
  .action(
    async (
      skill: string | undefined,
      opts: { last: string; by?: 'project' | 'device' | 'version' },
    ) => {
      const { statsCommand } = await import('./commands/stats');
      await statsCommand({ skill, last: opts.last, by: opts.by });
    },
  );

// Meta
program
  .command('self-update')
  .description('Download and install the latest skillz release')
  .action(async () => {
    const { selfUpdateCommand } = await import('./commands/self-update');
    await selfUpdateCommand();
  });

await program.parseAsync(process.argv);
