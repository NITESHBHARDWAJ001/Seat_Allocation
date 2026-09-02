import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { studentsRouter } from './routes/students.js';
import { roomsRouter } from './routes/rooms.js';
import { examsRouter } from './routes/exams.js';
import { allocationsRouter } from './routes/allocations.js';

const app = express();

// CORS_ORIGIN: comma-separated list of allowed origins (e.g. your deployed
// frontend's URL). Unset in local dev = allow any origin, for convenience.
const allowedOrigins = process.env.CORS_ORIGIN?.split(',').map((o) => o.trim()).filter(Boolean);
app.use(cors(allowedOrigins?.length ? { origin: allowedOrigins } : {}));
app.use(express.json({ limit: '10mb' }));

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api/students', studentsRouter);
app.use('/api/rooms', roomsRouter);
app.use('/api/exams', examsRouter);
app.use('/api/allocations', allocationsRouter);

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: err instanceof Error ? err.message : 'Internal server error' });
});

const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;
app.listen(PORT, () => {
  console.log(`Exam Room Allocator API listening on http://localhost:${PORT}`);
});
