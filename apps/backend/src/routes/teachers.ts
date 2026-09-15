import { Router } from 'express';
import { generateId, type Teacher } from '../vendor/core/index.js';
import { teacherRepository } from '../repositories.js';

export const teachersRouter = Router();

teachersRouter.get('/', async (_req, res) => {
  res.json(await teacherRepository.getAll());
});

teachersRouter.get('/:id', async (req, res) => {
  const teacher = await teacherRepository.getById(req.params.id);
  if (!teacher) return res.status(404).json({ error: 'Teacher not found' });
  res.json(teacher);
});

function validateTeacherBody(body: unknown): body is Omit<Teacher, 'id' | 'active'> & { active?: boolean } {
  if (!body || typeof body !== 'object') return false;
  const b = body as Record<string, unknown>;
  return typeof b.name === 'string' && typeof b.branch === 'string';
}

teachersRouter.post('/', async (req, res) => {
  if (!validateTeacherBody(req.body)) {
    return res.status(400).json({ error: 'Expected { name, branch }' });
  }
  const teacher = await teacherRepository.create({ id: generateId('teacher'), active: true, ...req.body });
  res.status(201).json(teacher);
});

teachersRouter.put('/:id', async (req, res) => {
  try {
    res.json(await teacherRepository.update(req.params.id, req.body ?? {}));
  } catch (err) {
    res.status(404).json({ error: err instanceof Error ? err.message : 'Update failed' });
  }
});

teachersRouter.delete('/:id', async (req, res) => {
  await teacherRepository.remove(req.params.id);
  res.status(204).end();
});
