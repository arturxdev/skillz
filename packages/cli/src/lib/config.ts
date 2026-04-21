import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname } from 'node:path';
import { CONFIG_PATH } from './constants';

export type Config = {
  token: string;
  device_id: string;
  user_id: string;
  email: string;
  api_base_url: string;
};

export function loadConfig(): Config | null {
  if (!existsSync(CONFIG_PATH)) return null;
  try {
    const raw = readFileSync(CONFIG_PATH, 'utf-8');
    return JSON.parse(raw) as Config;
  } catch {
    return null;
  }
}

export function saveConfig(cfg: Config): void {
  mkdirSync(dirname(CONFIG_PATH), { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
  chmodSync(CONFIG_PATH, 0o600);
}

export function deleteConfig(): void {
  if (existsSync(CONFIG_PATH)) unlinkSync(CONFIG_PATH);
}

export function requireConfig(): Config {
  const cfg = loadConfig();
  if (!cfg) {
    console.error('Not linked. Run: skillz link <email>');
    process.exit(1);
  }
  return cfg;
}
