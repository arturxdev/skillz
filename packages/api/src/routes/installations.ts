import { and, eq, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { getDb } from '../db/client';
import { installations, skills } from '../db/schema';
import { requireAuth, type AuthedContext } from '../middleware/auth';

const r = new Hono<AuthedContext>();

r.post('/', requireAuth, async (c) => {
  const device = c.get('device');
  const body = (await c.req.json().catch(() => ({}))) as {
    skill_id?: unknown;
    version?: unknown;
    scope?: unknown;
    project_path?: unknown;
  };

  if (
    typeof body.skill_id !== 'string' ||
    typeof body.version !== 'number' ||
    (body.scope !== 'global' && body.scope !== 'project')
  ) {
    return c.json({ error: 'invalid_input' }, 400);
  }

  const projectPath =
    body.scope === 'project' && typeof body.project_path === 'string'
      ? body.project_path
      : null;

  const db = getDb(c.env);
  const skill = await db.query.skills.findFirst({
    where: eq(skills.id, body.skill_id),
  });
  if (!skill || skill.userId !== device.userId) {
    return c.json({ error: 'not_found' }, 404);
  }

  // Remove any previous installation for this (skill, device, scope, project_path).
  await db.delete(installations).where(
    and(
      eq(installations.skillId, skill.id),
      eq(installations.deviceId, device.id),
      eq(installations.scope, body.scope),
      projectPath
        ? eq(installations.projectPath, projectPath)
        : sql`${installations.projectPath} IS NULL`,
    ),
  );

  const [inserted] = await db
    .insert(installations)
    .values({
      skillId: skill.id,
      version: body.version,
      deviceId: device.id,
      scope: body.scope,
      projectPath,
    })
    .returning({ id: installations.id });

  if (!inserted) return c.json({ error: 'internal' }, 500);

  return c.json({ ok: true, installation_id: inserted.id });
});

r.delete('/:id', requireAuth, async (c) => {
  const device = c.get('device');
  const id = c.req.param('id');
  const db = getDb(c.env);

  const row = await db.query.installations.findFirst({
    where: eq(installations.id, id),
  });
  if (!row || row.deviceId !== device.id) {
    return c.json({ error: 'not_found' }, 404);
  }

  await db.delete(installations).where(eq(installations.id, id));
  return c.json({ ok: true });
});

export default r;
