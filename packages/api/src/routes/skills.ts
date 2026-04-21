import { and, desc, eq, isNull, sql as drizzleSql } from 'drizzle-orm';
import { Hono } from 'hono';
import { getDb } from '../db/client';
import { skillVersions, skills } from '../db/schema';
import { putSkillBundle, skillBundleKey } from '../lib/r2';
import { sha256HexBuffer } from '../lib/tokens';
import { requireAuth, type AuthedContext } from '../middleware/auth';

const NAME_RE = /^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$/;
const MAX_SIZE = 10 * 1024 * 1024;

const r = new Hono<AuthedContext>();

r.get('/', requireAuth, async (c) => {
  const device = c.get('device');
  const db = getDb(c.env);

  const rows = await db.query.skills.findMany({
    where: eq(skills.userId, device.userId),
    orderBy: [desc(skills.createdAt)],
  });

  const withLatest = await Promise.all(
    rows.map(async (s) => {
      const latest = await db.query.skillVersions.findFirst({
        where: and(eq(skillVersions.skillId, s.id), isNull(skillVersions.yankedAt)),
        orderBy: [desc(skillVersions.version)],
      });
      return {
        id: s.id,
        name: s.name,
        created_at: s.createdAt,
        latest_version: latest?.version ?? null,
        latest_hash: latest?.hash ?? null,
      };
    }),
  );

  return c.json({ skills: withLatest });
});

r.post('/:name/versions', requireAuth, async (c) => {
  const device = c.get('device');
  const name = c.req.param('name').toLowerCase();
  if (!NAME_RE.test(name)) return c.json({ error: 'invalid_name' }, 400);

  const contentLength = Number(c.req.header('content-length') ?? '0');
  if (contentLength > MAX_SIZE) return c.json({ error: 'too_large' }, 413);

  const arrayBuf = await c.req.arrayBuffer();
  if (arrayBuf.byteLength > MAX_SIZE) return c.json({ error: 'too_large' }, 413);
  if (arrayBuf.byteLength === 0) return c.json({ error: 'empty' }, 400);

  const hash = await sha256HexBuffer(arrayBuf);
  const db = getDb(c.env);

  let skill = await db.query.skills.findFirst({
    where: and(eq(skills.userId, device.userId), eq(skills.name, name)),
  });
  if (!skill) {
    const [created] = await db.insert(skills).values({ userId: device.userId, name }).returning();
    skill = created;
  }
  if (!skill) return c.json({ error: 'internal' }, 500);
  const skillId = skill.id;

  // Atomic version assignment: INSERT with subquery MAX + UNIQUE retry.
  let inserted: { id: string; version: number } | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const rows = (await db
        .insert(skillVersions)
        .values({
          skillId,
          version: drizzleSql<number>`COALESCE((SELECT MAX(version) FROM skill_versions WHERE skill_id = ${skillId}::uuid), 0) + 1`,
          hash,
          sizeBytes: arrayBuf.byteLength,
          r2Key: '',
          pushedByDevice: device.id,
        })
        .returning({ id: skillVersions.id, version: skillVersions.version })) as Array<{
        id: string;
        version: number;
      }>;
      inserted = rows[0] ?? null;
      break;
    } catch (e) {
      const msg = String((e as Error)?.message ?? e);
      if (attempt < 2 && /unique/i.test(msg)) continue;
      throw e;
    }
  }
  if (!inserted) return c.json({ error: 'version_assign_failed' }, 500);

  try {
    const r2Key = await putSkillBundle(c.env, skillId, inserted.version, arrayBuf, hash);
    await db
      .update(skillVersions)
      .set({ r2Key })
      .where(eq(skillVersions.id, inserted.id));
  } catch (e) {
    console.error('r2_upload_failed', e);
    return c.json({ error: 'upload_failed' }, 502);
  }

  return c.json({ skill_id: skillId, version: inserted.version, hash });
});

r.get('/:name/versions', requireAuth, async (c) => {
  const device = c.get('device');
  const name = c.req.param('name').toLowerCase();
  const db = getDb(c.env);

  const skill = await db.query.skills.findFirst({
    where: and(eq(skills.userId, device.userId), eq(skills.name, name)),
  });
  if (!skill) return c.json({ error: 'not_found' }, 404);

  const rows = await db.query.skillVersions.findMany({
    where: eq(skillVersions.skillId, skill.id),
    orderBy: [desc(skillVersions.version)],
  });

  return c.json({
    skill_id: skill.id,
    name: skill.name,
    versions: rows.map((row) => ({
      version: row.version,
      hash: row.hash,
      size_bytes: row.sizeBytes,
      pushed_at: row.pushedAt,
      yanked_at: row.yankedAt,
      yank_reason: row.yankReason,
    })),
  });
});

r.get('/:name/versions/latest', requireAuth, async (c) => {
  const device = c.get('device');
  const name = c.req.param('name').toLowerCase();
  const db = getDb(c.env);

  const skill = await db.query.skills.findFirst({
    where: and(eq(skills.userId, device.userId), eq(skills.name, name)),
  });
  if (!skill) return c.json({ error: 'not_found' }, 404);

  const latest = await db.query.skillVersions.findFirst({
    where: and(eq(skillVersions.skillId, skill.id), isNull(skillVersions.yankedAt)),
    orderBy: [desc(skillVersions.version)],
  });
  if (!latest) return c.json({ error: 'no_versions' }, 404);

  return c.json({
    skill_id: skill.id,
    name: skill.name,
    version: latest.version,
    hash: latest.hash,
    size_bytes: latest.sizeBytes,
    download_url: `/skills/${name}/versions/${latest.version}/download`,
  });
});

r.get('/:name/versions/:v', requireAuth, async (c) => {
  const device = c.get('device');
  const name = c.req.param('name').toLowerCase();
  const v = Number(c.req.param('v'));
  if (!Number.isInteger(v) || v < 1) return c.json({ error: 'invalid_version' }, 400);

  const db = getDb(c.env);
  const skill = await db.query.skills.findFirst({
    where: and(eq(skills.userId, device.userId), eq(skills.name, name)),
  });
  if (!skill) return c.json({ error: 'not_found' }, 404);

  const row = await db.query.skillVersions.findFirst({
    where: and(eq(skillVersions.skillId, skill.id), eq(skillVersions.version, v)),
  });
  if (!row) return c.json({ error: 'not_found' }, 404);

  return c.json({
    skill_id: skill.id,
    name: skill.name,
    version: row.version,
    hash: row.hash,
    size_bytes: row.sizeBytes,
    yanked_at: row.yankedAt,
    yank_reason: row.yankReason,
    download_url: `/skills/${name}/versions/${v}/download`,
  });
});

r.get('/:name/versions/:v/download', requireAuth, async (c) => {
  const device = c.get('device');
  const name = c.req.param('name').toLowerCase();
  const v = Number(c.req.param('v'));
  if (!Number.isInteger(v) || v < 1) return c.json({ error: 'invalid_version' }, 400);

  const db = getDb(c.env);
  const skill = await db.query.skills.findFirst({
    where: and(eq(skills.userId, device.userId), eq(skills.name, name)),
  });
  if (!skill) return c.json({ error: 'not_found' }, 404);

  const row = await db.query.skillVersions.findFirst({
    where: and(eq(skillVersions.skillId, skill.id), eq(skillVersions.version, v)),
  });
  if (!row) return c.json({ error: 'not_found' }, 404);

  const key = row.r2Key || skillBundleKey(skill.id, row.version);
  const obj = await c.env.R2_BUCKET.get(key);
  if (!obj) return c.json({ error: 'blob_missing' }, 500);

  return new Response(obj.body, {
    headers: {
      'Content-Type': 'application/gzip',
      'Content-Length': String(obj.size),
      'X-Skillz-Hash': row.hash,
    },
  });
});

r.post('/:name/versions/:v/yank', requireAuth, async (c) => {
  const device = c.get('device');
  const name = c.req.param('name').toLowerCase();
  const v = Number(c.req.param('v'));
  if (!Number.isInteger(v) || v < 1) return c.json({ error: 'invalid_version' }, 400);

  const body = (await c.req.json().catch(() => ({}))) as { reason?: unknown };
  const reason = typeof body.reason === 'string' ? body.reason.slice(0, 500) : null;

  const db = getDb(c.env);
  const skill = await db.query.skills.findFirst({
    where: and(eq(skills.userId, device.userId), eq(skills.name, name)),
  });
  if (!skill) return c.json({ error: 'not_found' }, 404);

  const row = await db.query.skillVersions.findFirst({
    where: and(eq(skillVersions.skillId, skill.id), eq(skillVersions.version, v)),
  });
  if (!row) return c.json({ error: 'not_found' }, 404);
  if (row.yankedAt) return c.json({ ok: true, already_yanked: true });

  await db
    .update(skillVersions)
    .set({ yankedAt: new Date(), yankReason: reason })
    .where(eq(skillVersions.id, row.id));

  return c.json({ ok: true });
});

export default r;
