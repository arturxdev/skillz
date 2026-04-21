import { Hono } from 'hono';
import authRoutes from './routes/auth';

const app = new Hono<{ Bindings: Env }>();

app.get('/', (c) =>
  c.json({ name: 'skillz-api', version: c.env.APP_VERSION }),
);

app.get('/version', (c) => c.json({ version: c.env.APP_VERSION }));
app.on('HEAD', '/version', (c) => c.body(null, 200));

app.route('/auth', authRoutes);

// TODO(sprint-2): mount /skills, /installations routes
// TODO(sprint-3): mount /track, /stats routes

app.notFound((c) => c.json({ error: 'not_found' }, 404));

app.onError((err, c) => {
  console.error('unhandled', err);
  return c.json({ error: 'internal_error' }, 500);
});

export default app;
