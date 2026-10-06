import 'dotenv/config';
import express from 'express';
import cors from 'cors';

const app = express();

// CORS_ORIGIN: comma-separated list of allowed origins (e.g. your deployed
// frontend's URL). Unset in local dev = allow any origin, for convenience.
const allowedOrigins = process.env.CORS_ORIGIN?.split(',').map((o) => o.trim()).filter(Boolean);
app.use(cors(allowedOrigins?.length ? { origin: allowedOrigins } : {}));
app.use(express.json({ limit: '10mb' }));

app.get('/api/health', (_req, res) => res.json({ ok: true, mode: process.env.DATA_BACKEND ?? 'json' }));

if ((process.env.DATA_BACKEND ?? 'json').toLowerCase() === 'postgres') {
  // Multi-organization mode: logins, roles, organizations and chunked sync, all on Postgres.
  const { mountMultiTenant } = await import('./multitenant/index.js');
  await mountMultiTenant(app);
} else {
  // Single-tenant mode (json files or one Google Sheet): the original per-entity API, unchanged.
  const [{ studentsRouter }, { roomsRouter }, { examsRouter }, { allocationsRouter }, { teachersRouter }, { dutyRouter }, { syncRouter }] = await Promise.all([
    import('./routes/students.js'),
    import('./routes/rooms.js'),
    import('./routes/exams.js'),
    import('./routes/allocations.js'),
    import('./routes/teachers.js'),
    import('./routes/duty.js'),
    import('./routes/sync.js'),
  ]);
  app.use('/api/students', studentsRouter);
  app.use('/api/rooms', roomsRouter);
  app.use('/api/exams', examsRouter);
  app.use('/api/allocations', allocationsRouter);
  app.use('/api/teachers', teachersRouter);
  app.use('/api/duty', dutyRouter);
  app.use('/api/sync', syncRouter);
}

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: err instanceof Error ? err.message : 'Internal server error' });
});

const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;
app.listen(PORT, () => {
  console.log(`Exam Room Allocator API listening on http://localhost:${PORT}`);
});
