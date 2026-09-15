import { Router } from 'express';
import { defaultRuleConfig, generateId } from '../vendor/core/index.js';
import { examRepository } from '../repositories.js';

export const examsRouter = Router();

examsRouter.get('/', async (_req, res) => {
  res.json(await examRepository.getAll());
});

examsRouter.get('/:id', async (req, res) => {
  const exam = await examRepository.getById(req.params.id);
  if (!exam) return res.status(404).json({ error: 'Exam not found' });
  res.json(exam);
});

examsRouter.post('/', async (req, res) => {
  const body = req.body ?? {};
  if (typeof body.name !== 'string' || typeof body.date !== 'string') {
    return res.status(400).json({ error: 'Expected { name, date, startTime, endTime }' });
  }
  const now = new Date().toISOString();
  const exam = await examRepository.create({
    id: generateId('exam'),
    name: body.name,
    date: body.date,
    startTime: body.startTime ?? '09:00',
    endTime: body.endTime ?? '12:00',
    studentIds: Array.isArray(body.studentIds) ? body.studentIds : [],
    roomIds: Array.isArray(body.roomIds) ? body.roomIds : [],
    ruleConfig: body.ruleConfig ?? defaultRuleConfig(),
    subjectAssignments: Array.isArray(body.subjectAssignments) ? body.subjectAssignments : [],
    allocationIds: [],
    dutyRosterIds: [],
    createdAt: now,
    updatedAt: now,
  });
  res.status(201).json(exam);
});

examsRouter.put('/:id', async (req, res) => {
  try {
    res.json(await examRepository.update(req.params.id, req.body ?? {}));
  } catch (err) {
    res.status(404).json({ error: err instanceof Error ? err.message : 'Update failed' });
  }
});

examsRouter.delete('/:id', async (req, res) => {
  await examRepository.remove(req.params.id);
  res.status(204).end();
});
