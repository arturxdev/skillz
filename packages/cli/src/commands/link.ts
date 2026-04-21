import { cancel, intro, isCancel, log, outro, spinner, text } from '@clack/prompts';
import { hostname } from 'node:os';
import { ApiError, apiFetch } from '../lib/api-client';
import { loadConfig, saveConfig } from '../lib/config';
import { API_BASE_URL } from '../lib/constants';
import { requireTTY } from '../lib/tty';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CODE_RE = /^SKLZ(-[A-Z2-9]{4}){3}$/;

type VerifyResponse = {
  token: string;
  device_id: string;
  user_id: string;
  email: string;
};

export async function linkCommand(opts: { email?: string }): Promise<void> {
  if (loadConfig()) {
    console.error('This machine is already linked. Run `skillz logout` first.');
    process.exit(1);
  }

  let email = opts.email?.trim().toLowerCase();
  if (email && !EMAIL_RE.test(email)) {
    console.error(`Invalid email: ${email}`);
    process.exit(1);
  }

  requireTTY('skillz link', 'skillz link <email> (you will still need to paste the emailed code)');
  intro('skillz link');

  if (!email) {
    const v = await text({
      message: 'Email:',
      placeholder: 'you@example.com',
      validate: (val) => (EMAIL_RE.test(val.trim()) ? undefined : 'Invalid email'),
    });
    if (isCancel(v)) {
      cancel('Cancelled');
      process.exit(0);
    }
    email = v.trim().toLowerCase();
  }

  const s1 = spinner();
  s1.start(`Sending code to ${email}`);
  try {
    await apiFetch('/auth/request-code', { method: 'POST', body: { email } });
    s1.stop(`Code sent to ${email}`);
  } catch (e) {
    s1.stop('Failed to send code');
    if (e instanceof ApiError && e.status === 429) {
      log.error('Too many requests. Wait ~15 minutes and try again.');
    } else {
      log.error(`${(e as Error).message}`);
    }
    process.exit(1);
  }

  const code = await text({
    message: 'Paste the code (SKLZ-XXXX-XXXX-XXXX):',
    validate: (v) => (CODE_RE.test(v.trim().toUpperCase()) ? undefined : 'Invalid format'),
  });
  if (isCancel(code)) {
    cancel('Cancelled');
    process.exit(0);
  }

  const s2 = spinner();
  s2.start('Verifying');
  try {
    const res = await apiFetch<VerifyResponse>('/auth/verify-code', {
      method: 'POST',
      body: {
        email,
        code: code.trim().toUpperCase(),
        hostname: hostname(),
        os: process.platform,
        arch: process.arch,
      },
    });
    saveConfig({
      token: res.token,
      device_id: res.device_id,
      user_id: res.user_id,
      email: res.email,
      api_base_url: API_BASE_URL,
    });
    s2.stop('Linked');
    outro(`Welcome, ${res.email}`);
  } catch (e) {
    s2.stop('Verification failed');
    if (e instanceof ApiError && e.status === 401) {
      log.error('Invalid or expired code.');
    } else if (e instanceof ApiError && e.status === 429) {
      log.error('Too many attempts. Request a fresh code.');
    } else {
      log.error(`${(e as Error).message}`);
    }
    process.exit(1);
  }
}
