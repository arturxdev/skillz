import { cancel, confirm, intro, isCancel, log, outro, select } from '@clack/prompts';
import { apiFetch } from '../lib/api-client';
import { requireConfig } from '../lib/config';
import { requireTTY } from '../lib/tty';

type Device = {
  id: string;
  hostname: string;
  os: string;
  arch: string;
  current: boolean;
};

export async function authRevokeCommand(opts: {
  device?: string;
  force?: boolean;
}): Promise<void> {
  const cfg = requireConfig();
  const res = await apiFetch<{ devices: Device[] }>('/auth/devices', { token: cfg.token });

  if (res.devices.length === 0) {
    console.log('No devices to revoke.');
    return;
  }

  let targetId = opts.device;

  if (!targetId) {
    requireTTY(
      'skillz auth revoke',
      'skillz auth revoke <device_id | hostname> [--force]',
    );
    intro('skillz auth revoke');
    const picked = await select({
      message: 'Which device?',
      options: res.devices.map((d) => ({
        value: d.id,
        label: `${d.hostname} (${d.os}/${d.arch})${d.current ? '  ← current' : ''}`,
        hint: d.id.slice(0, 8),
      })),
    });
    if (isCancel(picked)) {
      cancel('Cancelled');
      process.exit(0);
    }
    targetId = picked as string;
  }

  // Allow matching by id-prefix or exact hostname.
  const target =
    res.devices.find((d) => d.id === targetId) ??
    res.devices.find((d) => d.id.startsWith(targetId!)) ??
    res.devices.find((d) => d.hostname === targetId);

  if (!target) {
    console.error(`Device not found: ${targetId}`);
    process.exit(1);
  }

  if (!opts.force) {
    const ok = await confirm({
      message: target.current
        ? `This is your CURRENT device. Revoking will log out this machine. Continue?`
        : `Revoke ${target.hostname}?`,
    });
    if (isCancel(ok) || !ok) {
      cancel('Cancelled');
      process.exit(0);
    }
  }

  try {
    await apiFetch('/auth/revoke', {
      method: 'POST',
      body: { device_id: target.id },
      token: cfg.token,
    });
    outro(`Revoked ${target.hostname}`);
  } catch (e) {
    log.error((e as Error).message);
    process.exit(1);
  }
}
