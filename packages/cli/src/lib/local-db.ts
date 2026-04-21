import { Database } from 'bun:sqlite';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { LOCAL_DB_PATH } from './constants';

let cached: Database | null = null;

export function getLocalDb(): Database {
  if (cached) return cached;

  const dir = dirname(LOCAL_DB_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const db = new Database(LOCAL_DB_PATH);
  db.run(`
    CREATE TABLE IF NOT EXISTS installed_skills (
      skill_id TEXT NOT NULL,
      name TEXT NOT NULL,
      version INTEGER NOT NULL,
      scope TEXT NOT NULL,
      project_path TEXT,
      install_path TEXT NOT NULL,
      installation_id TEXT,
      installed_at INTEGER NOT NULL,
      PRIMARY KEY (skill_id, scope, project_path)
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS pending_pings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      skill_id TEXT NOT NULL,
      version INTEGER,
      project_path TEXT,
      pinged_at INTEGER NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0
    )
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_pending_created ON pending_pings(pinged_at)`);

  cached = db;
  return db;
}

export type InstalledRow = {
  skill_id: string;
  name: string;
  version: number;
  scope: 'global' | 'project';
  project_path: string | null;
  install_path: string;
  installation_id: string | null;
  installed_at: number;
};
