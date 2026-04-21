import { Hono } from 'hono';
import authRoutes from './routes/auth';
import installationsRoutes from './routes/installations';
import skillsRoutes from './routes/skills';
import statsRoutes from './routes/stats';
import trackRoutes from './routes/track';

const app = new Hono<{ Bindings: Env }>();

app.get('/', (c) =>
  c.json({ name: 'skillz-api', version: c.env.APP_VERSION }),
);

app.get('/version', (c) => c.json({ version: c.env.APP_VERSION }));
app.on('HEAD', '/version', (c) => c.body(null, 200));

app.route('/auth', authRoutes);
app.route('/skills', skillsRoutes);
app.route('/installations', installationsRoutes);
app.route('/track', trackRoutes);
app.route('/stats', statsRoutes);

app.notFound((c) => c.json({ error: 'not_found' }, 404));

app.onError((err, c) => {
  console.error('unhandled', err);
  return c.json({ error: 'internal_error' }, 500);
});

export default app;
