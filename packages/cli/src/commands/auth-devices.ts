import Table from 'cli-table3';
import { apiFetch } from '../lib/api-client';
import { requireConfig } from '../lib/config';

type Device = {
  id: string;
  hostname: string;
  os: string;
  arch: string;
  created_at: string;
  last_seen_at: string | null;
  current: boolean;
};

export async function authDevicesCommand(): Promise<void> {
  const cfg = requireConfig();

  const res = await apiFetch<{ devices: Device[] }>('/auth/devices', { token: cfg.token });

  if (res.devices.length === 0) {
    console.log('No linked devices.');
    return;
  }

  const table = new Table({
    head: ['hostname', 'os/arch', 'linked', 'last seen', 'id', ''],
    style: { head: ['bold'] },
  });

  for (const d of res.devices) {
    table.push([
      d.hostname,
      `${d.os}/${d.arch}`,
      fmtDate(d.created_at),
      d.last_seen_at ? fmtDate(d.last_seen_at) : '—',
      d.id.slice(0, 8),
      d.current ? '(current)' : '',
    ]);
  }

  console.log(table.toString());
}

function fmtDate(iso: string): string {
  return new Date(iso).toISOString().slice(0, 16).replace('T', ' ');
}
