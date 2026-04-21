import { Hono } from 'hono';

type Variables = {
  device?: { id: string; userId: string };
};

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

app.get('/', (c) =>
  c.json({ name: 'skillz-api', version: c.env.APP_VERSION }),
);

app.get('/version', (c) => c.json({ version: c.env.APP_VERSION }));
app.on('HEAD', '/version', (c) => c.body(null, 200));

// TODO(sprint-1): mount /auth routes
// TODO(sprint-2): mount /skills, /installations routes
// TODO(sprint-3): mount /track, /stats routes

app.notFound((c) => c.json({ error: 'not_found' }, 404));

app.onError((err, c) => {
  console.error('unhandled', err);
  return c.json({ error: 'internal_error' }, 500);
});

export default app;
