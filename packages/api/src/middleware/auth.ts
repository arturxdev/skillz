import { and, eq, isNull } from 'drizzle-orm';
import type { MiddlewareHandler } from 'hono';
import { getDb } from '../db/client';
import { devices } from '../db/schema';
import { sha256Hex } from '../lib/tokens';

export type AuthDevice = {
  id: string;
  userId: string;
  hostname: string;
};

export type AuthedContext = {
  Bindings: Env;
  Variables: { device: AuthDevice };
};

export const requireAuth: MiddlewareHandler<AuthedContext> = async (c, next) => {
  const header = c.req.header('Authorization');
  if (!header?.startsWith('Bearer ')) {
    return c.json({ error: 'unauthorized' }, 401);
  }

  const token = header.slice(7).trim();
  if (!token) return c.json({ error: 'unauthorized' }, 401);

  const tokenHash = await sha256Hex(token);
  const db = getDb(c.env);

  const device = await db.query.devices.findFirst({
    where: and(eq(devices.tokenHash, tokenHash), isNull(devices.revokedAt)),
  });

  if (!device) return c.json({ error: 'unauthorized' }, 401);

  c.set('device', { id: device.id, userId: device.userId, hostname: device.hostname });

  // Best-effort last-seen update; don't block the response.
  c.executionCtx.waitUntil(
    db.update(devices).set({ lastSeenAt: new Date() }).where(eq(devices.id, device.id)),
  );

  await next();
};
