import { apiFetch } from '../lib/api-client';
import { requireConfig } from '../lib/config';

type MeResponse = {
  email: string;
  device: {
    id: string;
    hostname: string;
    os: string;
    arch: string;
    created_at: string;
    last_seen_at: string | null;
  };
};

export async function whoamiCommand(): Promise<void> {
  const cfg = requireConfig();
  try {
    const res = await apiFetch<MeResponse>('/auth/me', { token: cfg.token });
    console.log(`email       ${res.email}`);
    console.log(`hostname    ${res.device.hostname}`);
    console.log(`os/arch     ${res.device.os}/${res.device.arch}`);
    console.log(`device id   ${res.device.id}`);
    console.log(`linked      ${fmtDate(res.device.created_at)}`);
    console.log(`last seen   ${res.device.last_seen_at ? fmtDate(res.device.last_seen_at) : '—'}`);
  } catch (e) {
    console.error((e as Error).message);
    process.exit(1);
  }
}

function fmtDate(iso: string): string {
  return new Date(iso).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
}
