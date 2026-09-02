import { Router } from 'express';
import { generateId, type Student } from '../vendor/core/index.js';
import { studentRepository } from '../repositories.js';

export const studentsRouter = Router();

studentsRouter.get('/', async (req, res) => {
  const { branch, year, section, search, activeOnly } = req.query;
  const students = await studentRepository.query({
    branch: typeof branch === 'string' ? branch : undefined,
    year: typeof year === 'string' ? Number(year) : undefined,
    section: typeof section === 'string' ? section : undefined,
    search: typeof search === 'string' ? search : undefined,
    activeOnly: activeOnly === 'true',
  });
  res.json(students);
});

studentsRouter.get('/:id', async (req, res) => {
  const student = await studentRepository.getById(req.params.id);
  if (!student) return res.status(404).json({ error: 'Student not found' });
  res.json(student);
});

function validateStudentBody(body: unknown): body is Omit<Student, 'id' | 'active'> & { active?: boolean } {
  if (!body || typeof body !== 'object') return false;
  const b = body as Record<string, unknown>;
  return typeof b.rollNumber === 'string' && typeof b.name === 'string' && typeof b.branch === 'string' && typeof b.year === 'number' && typeof b.section === 'string';
}

studentsRouter.post('/', async (req, res) => {
  if (!validateStudentBody(req.body)) {
    return res.status(400).json({ error: 'Expected { rollNumber, name, branch, year, section }' });
  }
  const student = await studentRepository.create({ id: generateId('student'), active: true, ...req.body });
  res.status(201).json(student);
});

studentsRouter.put('/:id', async (req, res) => {
  try {
    const updated = await studentRepository.update(req.params.id, req.body ?? {});
    res.json(updated);
  } catch (err) {
    res.status(404).json({ error: err instanceof Error ? err.message : 'Update failed' });
  }
});

studentsRouter.delete('/:id', async (req, res) => {
  await studentRepository.remove(req.params.id);
  res.status(204).end();
});
