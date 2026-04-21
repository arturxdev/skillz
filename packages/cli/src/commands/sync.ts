import { log, spinner } from '@clack/prompts';
import { ApiError, apiFetch } from '../lib/api-client';
import { requireConfig } from '../lib/config';
import { getLocalDb } from '../lib/local-db';

const BATCH_SIZE = 100;

type PendingRow = {
  id: number;
  skill_id: string;
  version: number | null;
  project_path: string | null;
  pinged_at: number;
};

export async function syncCommand(): Promise<void> {
  const cfg = requireConfig();
  const db = getLocalDb();

  const s = spinner();
  s.start('Syncing pending activations');

  let flushed = 0;
  while (true) {
    const rows = db
      .query(
        `SELECT id, skill_id, version, project_path, pinged_at
         FROM pending_pings ORDER BY pinged_at LIMIT ?`,
      )
      .all(BATCH_SIZE) as PendingRow[];

    if (rows.length === 0) break;

    s.message(`Flushing batch of ${rows.length}`);
    try {
      await apiFetch('/track/batch', {
        method: 'POST',
        token: cfg.token,
        body: {
          pings: rows.map((r) => ({
            skill_id: r.skill_id,
            version: r.version,
            project_path: r.project_path,
            pinged_at: new Date(r.pinged_at).toISOString(),
          })),
        },
      });
    } catch (e) {
      s.stop(`Flushed ${flushed} before failure`);
      if (e instanceof ApiError && e.status === 401) {
        log.error('Token expired or revoked. Run `skillz link <email>` to re-authenticate.');
      } else {
        log.error((e as Error).message);
      }
      process.exit(1);
    }

    const ids = rows.map((r) => r.id);
    const placeholders = ids.map(() => '?').join(',');
    db.run(`DELETE FROM pending_pings WHERE id IN (${placeholders})`, ids);
    flushed += rows.length;
  }

  s.stop(flushed === 0 ? 'Nothing pending' : `Flushed ${flushed}`);
}
