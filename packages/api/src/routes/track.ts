import { and, eq, gt, inArray } from 'drizzle-orm';
import { Hono } from 'hono';
import { getDb } from '../db/client';
import { skills, usagePings } from '../db/schema';
import { requireAuth, type AuthedContext } from '../middleware/auth';

const DEDUPE_WINDOW_MS = 5 * 60 * 1000;
const MAX_BATCH = 500;

const r = new Hono<AuthedContext>();

r.post('/', requireAuth, async (c) => {
  const device = c.get('device');
  const body = (await c.req.json().catch(() => ({}))) as {
    skill_id?: unknown;
    version?: unknown;
    project_path?: unknown;
  };

  if (typeof body.skill_id !== 'string') {
    return c.json({ error: 'skill_id_required' }, 400);
  }
  const version = typeof body.version === 'number' ? body.version : null;
  const projectPath = typeof body.project_path === 'string' ? body.project_path : null;

  const db = getDb(c.env);

  const skill = await db.query.skills.findFirst({ where: eq(skills.id, body.skill_id) });
  if (!skill || skill.userId !== device.userId) {
    return c.json({ error: 'not_found' }, 404);
  }

  const since = new Date(Date.now() - DEDUPE_WINDOW_MS);
  const existing = await db.query.usagePings.findFirst({
    where: and(
      eq(usagePings.skillId, body.skill_id),
      eq(usagePings.deviceId, device.id),
      gt(usagePings.pingedAt, since),
    ),
  });
  if (existing) {
    return c.json({ ok: true, deduped: true });
  }

  await db.insert(usagePings).values({
    skillId: body.skill_id,
    version,
    deviceId: device.id,
    projectPath,
  });

  return c.json({ ok: true });
});

r.post('/batch', requireAuth, async (c) => {
  const device = c.get('device');
  const body = (await c.req.json().catch(() => ({}))) as { pings?: unknown };

  if (!Array.isArray(body.pings)) {
    return c.json({ error: 'invalid_pings' }, 400);
  }
  if (body.pings.length === 0) {
    return c.json({ ok: true, accepted: 0, rejected: 0 });
  }
  if (body.pings.length > MAX_BATCH) {
    return c.json({ error: 'too_many' }, 400);
  }

  const valid: Array<{
    skillId: string;
    version: number | null;
    deviceId: string;
    projectPath: string | null;
    pingedAt: Date;
  }> = [];
  const requested = body.pings.length;
  const skillIds = new Set<string>();

  for (const raw of body.pings as unknown[]) {
    if (!raw || typeof raw !== 'object') continue;
    const p = raw as Record<string, unknown>;
    if (typeof p.skill_id !== 'string') continue;

    const pingedAt =
      typeof p.pinged_at === 'string' ? new Date(p.pinged_at) : new Date();
    if (Number.isNaN(pingedAt.getTime())) continue;

    skillIds.add(p.skill_id);
    valid.push({
      skillId: p.skill_id,
      version: typeof p.version === 'number' ? p.version : null,
      deviceId: device.id,
      projectPath: typeof p.project_path === 'string' ? p.project_path : null,
      pingedAt,
    });
  }

  if (valid.length === 0) {
    return c.json({ ok: true, accepted: 0, rejected: requested });
  }

  const db = getDb(c.env);
  const owned = await db.query.skills.findMany({
    where: inArray(skills.id, Array.from(skillIds)),
  });
  const ownedSet = new Set(owned.filter((s) => s.userId === device.userId).map((s) => s.id));

  const ownedPings = valid.filter((p) => ownedSet.has(p.skillId));
  if (ownedPings.length > 0) {
    await db.insert(usagePings).values(ownedPings);
  }

  return c.json({
    ok: true,
    accepted: ownedPings.length,
    rejected: requested - ownedPings.length,
  });
});

export default r;
