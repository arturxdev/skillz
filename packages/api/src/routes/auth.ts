import { and, desc, eq, gt, gte, isNull } from 'drizzle-orm';
import { Hono } from 'hono';
import { getDb } from '../db/client';
import { authCodes, devices, users } from '../db/schema';
import { generateAuthCode } from '../lib/code-generator';
import { sendAuthCodeEmail } from '../lib/resend';
import { generateToken, sha256Hex } from '../lib/tokens';
import { requireAuth, type AuthedContext } from '../middleware/auth';

const CODE_TTL_MS = 10 * 60 * 1000;
const RATE_WINDOW_MS = 15 * 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 3;
const MAX_VERIFY_ATTEMPTS = 5;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CODE_RE = /^SKLZ(-[A-Z2-9]{4}){3}$/;

const auth = new Hono<AuthedContext>();

auth.post('/request-code', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { email?: unknown };
  if (typeof body.email !== 'string') return c.json({ error: 'email_required' }, 400);

  const email = body.email.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return c.json({ error: 'invalid_email' }, 400);

  const db = getDb(c.env);
  const since = new Date(Date.now() - RATE_WINDOW_MS);
  const recent = await db.query.authCodes.findMany({
    where: and(eq(authCodes.email, email), gte(authCodes.createdAt, since)),
  });
  if (recent.length >= MAX_REQUESTS_PER_WINDOW) {
    return c.json({ error: 'rate_limited' }, 429);
  }

  const code = generateAuthCode();
  const expiresAt = new Date(Date.now() + CODE_TTL_MS);
  await db.insert(authCodes).values({ email, code, expiresAt });

  try {
    await sendAuthCodeEmail(c.env, email, code);
  } catch (e) {
    console.error('email_failed', e);
    return c.json({ error: 'email_failed' }, 502);
  }

  return c.json({ ok: true });
});

auth.post('/verify-code', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    email?: unknown;
    code?: unknown;
    hostname?: unknown;
    os?: unknown;
    arch?: unknown;
  };

  if (typeof body.email !== 'string' || typeof body.code !== 'string') {
    return c.json({ error: 'email_and_code_required' }, 400);
  }

  const email = body.email.trim().toLowerCase();
  const code = body.code.trim().toUpperCase();
  const hostname = typeof body.hostname === 'string' ? body.hostname.slice(0, 255) : 'unknown';
  const os = typeof body.os === 'string' ? body.os.slice(0, 32) : 'unknown';
  const arch = typeof body.arch === 'string' ? body.arch.slice(0, 32) : 'unknown';

  if (!EMAIL_RE.test(email) || !CODE_RE.test(code)) {
    return c.json({ error: 'invalid_input' }, 400);
  }

  const db = getDb(c.env);
  const now = new Date();

  const recent = await db.query.authCodes.findFirst({
    where: and(
      eq(authCodes.email, email),
      gte(authCodes.createdAt, new Date(Date.now() - RATE_WINDOW_MS)),
    ),
    orderBy: [desc(authCodes.createdAt)],
  });
  if (recent && (recent.attempts ?? 0) >= MAX_VERIFY_ATTEMPTS) {
    return c.json({ error: 'rate_limited' }, 429);
  }

  const match = await db.query.authCodes.findFirst({
    where: and(
      eq(authCodes.code, code),
      eq(authCodes.email, email),
      isNull(authCodes.usedAt),
      gt(authCodes.expiresAt, now),
    ),
  });

  if (!match) {
    if (recent) {
      await db
        .update(authCodes)
        .set({ attempts: (recent.attempts ?? 0) + 1 })
        .where(eq(authCodes.id, recent.id));
    }
    return c.json({ error: 'invalid_code' }, 401);
  }

  await db.update(authCodes).set({ usedAt: now }).where(eq(authCodes.id, match.id));

  let user = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (!user) {
    const [created] = await db.insert(users).values({ email }).returning();
    user = created;
  }
  if (!user) return c.json({ error: 'internal' }, 500);

  const token = generateToken();
  const tokenHash = await sha256Hex(token);
  const [device] = await db
    .insert(devices)
    .values({ userId: user.id, tokenHash, hostname, os, arch, lastSeenAt: now })
    .returning();
  if (!device) return c.json({ error: 'internal' }, 500);

  return c.json({
    token,
    device_id: device.id,
    user_id: user.id,
    email: user.email,
  });
});

auth.get('/me', requireAuth, async (c) => {
  const current = c.get('device');
  const db = getDb(c.env);

  const [user, device] = await Promise.all([
    db.query.users.findFirst({ where: eq(users.id, current.userId) }),
    db.query.devices.findFirst({ where: eq(devices.id, current.id) }),
  ]);

  if (!user || !device) return c.json({ error: 'not_found' }, 404);

  return c.json({
    email: user.email,
    device: {
      id: device.id,
      hostname: device.hostname,
      os: device.os,
      arch: device.arch,
      created_at: device.createdAt,
      last_seen_at: device.lastSeenAt,
    },
  });
});

auth.get('/devices', requireAuth, async (c) => {
  const current = c.get('device');
  const db = getDb(c.env);

  const rows = await db.query.devices.findMany({
    where: and(eq(devices.userId, current.userId), isNull(devices.revokedAt)),
    orderBy: [desc(devices.createdAt)],
  });

  return c.json({
    devices: rows.map((d) => ({
      id: d.id,
      hostname: d.hostname,
      os: d.os,
      arch: d.arch,
      created_at: d.createdAt,
      last_seen_at: d.lastSeenAt,
      current: d.id === current.id,
    })),
  });
});

auth.post('/revoke', requireAuth, async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { device_id?: unknown };
  if (typeof body.device_id !== 'string') {
    return c.json({ error: 'device_id_required' }, 400);
  }

  const current = c.get('device');
  const db = getDb(c.env);

  const target = await db.query.devices.findFirst({ where: eq(devices.id, body.device_id) });
  if (!target || target.userId !== current.userId) {
    return c.json({ error: 'not_found' }, 404);
  }

  if (target.revokedAt) return c.json({ ok: true });

  await db
    .update(devices)
    .set({ revokedAt: new Date() })
    .where(eq(devices.id, target.id));

  return c.json({ ok: true });
});

export default auth;
