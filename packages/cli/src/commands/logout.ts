import { cancel, confirm, intro, isCancel, log, outro } from '@clack/prompts';
import { ApiError, apiFetch } from '../lib/api-client';
import { deleteConfig, loadConfig } from '../lib/config';
import { requireTTY } from '../lib/tty';

export async function logoutCommand(): Promise<void> {
  const cfg = loadConfig();
  if (!cfg) {
    console.error('Not linked.');
    process.exit(0);
  }

  requireTTY('skillz logout', 'not implemented in non-TTY mode');
  intro('skillz logout');

  const ok = await confirm({
    message: `Unlink this machine from ${cfg.email}?`,
  });
  if (isCancel(ok) || !ok) {
    cancel('Cancelled');
    return;
  }

  try {
    await apiFetch('/auth/revoke', {
      method: 'POST',
      body: { device_id: cfg.device_id },
      token: cfg.token,
    });
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) {
      // Token is already invalid on the server — local cleanup is still meaningful.
    } else {
      log.warn(`Server revoke failed (removing local config anyway): ${(e as Error).message}`);
    }
  }

  deleteConfig();
  outro('Unlinked');
}
