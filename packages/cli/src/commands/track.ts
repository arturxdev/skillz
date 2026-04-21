// HOT PATH — called by the LLM after using a skill.
//
// Non-negotiable invariants:
// - Never write to stdout.
// - Exit 0 on every branch (success, no-config, missing skill, network fail).
// - Do NOT import @clack/prompts, update-checker, banner, or anything heavy.
// - fetch timeout 2s; on failure enqueue to pending_pings for `skillz sync`.

import { Database } from 'bun:sqlite';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  API_BASE_URL,
  CONFIG_PATH,
  LOCAL_DB_PATH,
  TRACK_FETCH_TIMEOUT_MS,
} from '../lib/constants';

type Config = {
  token: string;
  device_id: string;
  user_id: string;
  email: string;
  api_base_url: string;
};

type LookupResult = {
  skillId: string;
  version: number;
  scope: 'project' | 'global';
  projectPath: string | null;
};

export async function trackCommand(args: string[]): Promise<void> {
  try {
    const skillName = args[0]?.toLowerCase();
    if (!skillName) return;

    const cfg = loadConfigQuick();
    if (!cfg) return;

    const db = openLocalDbFast();
    const lookup = findInstalledSkill(db, skillName);
    if (!lookup) return;

    const ok = await trySend(cfg, lookup);
    if (!ok) enqueue(db, lookup);
  } catch {
    // Swallow — never break the LLM's flow.
  }
}

function loadConfigQuick(): Config | null {
  if (!existsSync(CONFIG_PATH)) return null;
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, 'utf-8')) as Config;
  } catch {
    return null;
  }
}

function openLocalDbFast(): Database {
  const dir = dirname(LOCAL_DB_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const db = new Database(LOCAL_DB_PATH);
  // Idempotent; cheap if tables exist.
  db.run(`CREATE TABLE IF NOT EXISTS installed_skills (
    skill_id TEXT NOT NULL, name TEXT NOT NULL, version INTEGER NOT NULL,
    scope TEXT NOT NULL, project_path TEXT, install_path TEXT NOT NULL,
    installation_id TEXT, installed_at INTEGER NOT NULL,
    PRIMARY KEY (skill_id, scope, project_path)
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS pending_pings (
    id INTEGER PRIMARY KEY AUTOINCREMENT, skill_id TEXT NOT NULL, version INTEGER,
    project_path TEXT, pinged_at INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0
  )`);
  return db;
}

function findInstalledSkill(db: Database, name: string): LookupResult | null {
  const cwd = process.cwd();

  const project = db
    .query(
      `SELECT skill_id, version FROM installed_skills
       WHERE name = ? AND scope = 'project' AND project_path = ? LIMIT 1`,
    )
    .get(name, cwd) as { skill_id: string; version: number } | null;
  if (project) {
    return {
      skillId: project.skill_id,
      version: project.version,
      scope: 'project',
      projectPath: cwd,
    };
  }

  const global = db
    .query(
      `SELECT skill_id, version FROM installed_skills
       WHERE name = ? AND scope = 'global' LIMIT 1`,
    )
    .get(name) as { skill_id: string; version: number } | null;
  if (global) {
    return {
      skillId: global.skill_id,
      version: global.version,
      scope: 'global',
      projectPath: null,
    };
  }

  return null;
}

async function trySend(cfg: Config, lookup: LookupResult): Promise<boolean> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TRACK_FETCH_TIMEOUT_MS);
  try {
    const base = cfg.api_base_url || API_BASE_URL;
    const res = await fetch(`${base}/track`, {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        skill_id: lookup.skillId,
        version: lookup.version,
        project_path: lookup.projectPath,
      }),
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

function enqueue(db: Database, lookup: LookupResult): void {
  db.run(
    `INSERT INTO pending_pings (skill_id, version, project_path, pinged_at) VALUES (?, ?, ?, ?)`,
    [lookup.skillId, lookup.version, lookup.projectPath, Date.now()],
  );
}
