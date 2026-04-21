import { homedir } from 'node:os';
import { join } from 'node:path';

export const VERSION = '0.1.3';

// Resolved in this order:
//   1. compile-time constant baked via `bun build --define` (see build.ts)
//   2. runtime env var SKILLZ_API_URL (for `bun run` dev from repo root,
//      loaded automatically from ./.env by Bun)
//   3. hardcoded production default
export const API_BASE_URL =
  process.env.SKILLZ_API_URL ?? 'https://skillz-api.arturo8gll.workers.dev';

export const CONFIG_DIR = join(homedir(), '.config', 'skillz');
export const CONFIG_PATH = join(CONFIG_DIR, 'config.json');
export const LOCAL_DB_PATH = join(CONFIG_DIR, 'local.db');
export const UPDATE_CHECK_PATH = join(CONFIG_DIR, 'update-check.json');

export const BIN_DIR = join(homedir(), '.skillz', 'bin');
export const BIN_PATH = join(BIN_DIR, 'skillz');

export const GLOBAL_SKILLS_DIR = join(homedir(), '.claude', 'skills');
export const PROJECT_SKILLS_DIR = '.claude/skills';

export const TELEMETRY_START = '<!-- skillz-telemetry-start -->';
export const TELEMETRY_END = '<!-- skillz-telemetry-end -->';

export const MAX_TARBALL_BYTES = 10 * 1024 * 1024; // 10 MB
export const TRACK_FETCH_TIMEOUT_MS = 2000;
export const UPDATE_CHECK_TTL_MS = 24 * 60 * 60 * 1000;
