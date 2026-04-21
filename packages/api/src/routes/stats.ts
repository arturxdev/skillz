import { and, eq, gte, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { getDb } from '../db/client';
import { devices, skills, usagePings } from '../db/schema';
import { requireAuth, type AuthedContext } from '../middleware/auth';

const r = new Hono<AuthedContext>();

r.get('/', requireAuth, async (c) => {
  const device = c.get('device');
  const db = getDb(c.env);

  const skillQuery = c.req.query('skill');
  const sinceParam = c.req.query('since') ?? '30d';
  const sinceDate = parseSince(sinceParam);

  // Resolve skill filter
  let skillIdFilter: string | null = null;
  let resolvedName: string | null = null;
  if (skillQuery) {
    const s = await db.query.skills.findFirst({
      where: and(eq(skills.userId, device.userId), eq(skills.name, skillQuery.toLowerCase())),
    });
    if (!s) return c.json({ error: 'not_found' }, 404);
    skillIdFilter = s.id;
    resolvedName = s.name;
  }

  const baseWhere = and(
    eq(skills.userId, device.userId),
    gte(usagePings.pingedAt, sinceDate),
    skillIdFilter ? eq(usagePings.skillId, skillIdFilter) : undefined,
  );

  const totalRows = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(usagePings)
    .innerJoin(skills, eq(skills.id, usagePings.skillId))
    .where(baseWhere);
  const total = totalRows[0]?.c ?? 0;

  const bySkillRows = skillIdFilter
    ? []
    : await db
        .select({
          name: skills.name,
          count: sql<number>`count(*)::int`,
        })
        .from(usagePings)
        .innerJoin(skills, eq(skills.id, usagePings.skillId))
        .where(baseWhere)
        .groupBy(skills.name)
        .orderBy(sql`count(*) desc`);

  const byVersionRows = await db
    .select({
      version: usagePings.version,
      count: sql<number>`count(*)::int`,
    })
    .from(usagePings)
    .innerJoin(skills, eq(skills.id, usagePings.skillId))
    .where(baseWhere)
    .groupBy(usagePings.version)
    .orderBy(sql`count(*) desc`);

  const byDeviceRows = await db
    .select({
      hostname: devices.hostname,
      count: sql<number>`count(*)::int`,
    })
    .from(usagePings)
    .innerJoin(skills, eq(skills.id, usagePings.skillId))
    .innerJoin(devices, eq(devices.id, usagePings.deviceId))
    .where(baseWhere)
    .groupBy(devices.hostname)
    .orderBy(sql`count(*) desc`);

  const byProjectRows = await db
    .select({
      project_path: usagePings.projectPath,
      count: sql<number>`count(*)::int`,
    })
    .from(usagePings)
    .innerJoin(skills, eq(skills.id, usagePings.skillId))
    .where(baseWhere)
    .groupBy(usagePings.projectPath)
    .orderBy(sql`count(*) desc`);

  return c.json({
    skill: resolvedName,
    since: sinceParam,
    total,
    by_skill: bySkillRows,
    by_version: byVersionRows,
    by_device: byDeviceRows,
    by_project: byProjectRows,
  });
});

function parseSince(s: string): Date {
  if (s === 'all') return new Date(0);
  const m = s.match(/^(\d+)([dh])$/);
  if (!m) return new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const n = Number(m[1]);
  const unit = m[2] === 'h' ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
  return new Date(Date.now() - n * unit);
}

export default r;
