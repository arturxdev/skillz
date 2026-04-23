import { eq, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { getDb } from '../db/client';
import { skills, usagePings } from '../db/schema';
import { requireAuth, type AuthedContext } from '../middleware/auth';

const r = new Hono<AuthedContext>();

r.get('/', requireAuth, async (c) => {
  const device = c.get('device');
  const db = getDb(c.env);

  const where = eq(skills.userId, device.userId);

  const totalRows = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(usagePings)
    .innerJoin(skills, eq(skills.id, usagePings.skillId))
    .where(where);
  const total = totalRows[0]?.c ?? 0;

  const bySkillRows = await db
    .select({
      name: skills.name,
      count: sql<number>`count(*)::int`,
    })
    .from(usagePings)
    .innerJoin(skills, eq(skills.id, usagePings.skillId))
    .where(where)
    .groupBy(skills.name)
    .orderBy(sql`count(*) desc`);

  return c.json({ total, by_skill: bySkillRows });
});

export default r;
