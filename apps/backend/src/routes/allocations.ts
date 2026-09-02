import { Router } from 'express';
import { generateAllocation, revalidate } from '../vendor/allocation-engine/index.js';
import { allocationRepository, examRepository, roomRepository, studentRepository } from '../repositories.js';

export const allocationsRouter = Router();

allocationsRouter.post('/generate', async (req, res) => {
  const examId = req.body?.examId;
  if (typeof examId !== 'string') return res.status(400).json({ error: 'Expected { examId }' });

  const exam = await examRepository.getById(examId);
  if (!exam) return res.status(404).json({ error: 'Exam not found' });

  const [allStudents, allRooms] = await Promise.all([studentRepository.getAll(), roomRepository.getAll()]);
  const students = allStudents.filter((s) => exam.studentIds.includes(s.id));
  const rooms = allRooms.filter((r) => exam.roomIds.includes(r.id));

  const existing = await allocationRepository.getByExamId(examId);
  const result = generateAllocation({
    examId,
    students,
    rooms,
    ruleConfig: exam.ruleConfig,
    seed: req.body?.seed,
    version: existing.length + 1,
    parentAllocationId: exam.activeAllocationId,
  });

  await allocationRepository.create(result);
  await examRepository.update(examId, { allocationIds: [...exam.allocationIds, result.id], activeAllocationId: result.id });

  res.status(201).json(result);
});

allocationsRouter.post('/validate', async (req, res) => {
  const allocationId = req.body?.allocationId;
  if (typeof allocationId !== 'string') return res.status(400).json({ error: 'Expected { allocationId }' });
  const allocation = await allocationRepository.getById(allocationId);
  if (!allocation) return res.status(404).json({ error: 'Allocation not found' });
  res.json(revalidate(allocation).validationReport);
});

allocationsRouter.post('/recalculate', async (req, res) => {
  const allocationId = req.body?.allocationId;
  if (typeof allocationId !== 'string') return res.status(400).json({ error: 'Expected { allocationId }' });
  const allocation = await allocationRepository.getById(allocationId);
  if (!allocation) return res.status(404).json({ error: 'Allocation not found' });
  const updated = revalidate(allocation);
  await allocationRepository.update(allocationId, updated);
  res.json(updated);
});

allocationsRouter.get('/:id', async (req, res) => {
  const allocation = await allocationRepository.getById(req.params.id);
  if (!allocation) return res.status(404).json({ error: 'Allocation not found' });
  res.json(allocation);
});

allocationsRouter.get('/:id/report', async (req, res) => {
  const allocation = await allocationRepository.getById(req.params.id);
  if (!allocation) return res.status(404).json({ error: 'Allocation not found' });

  const studentsById = new Map(allocation.studentSnapshot.map((s) => [s.id, s] as const));
  const roomsById = new Map(allocation.roomSnapshot.map((r) => [r.id, r] as const));
  const seatsById = new Map(allocation.roomSnapshot.flatMap((r) => r.seats.map((s) => [s.id, s] as const)));

  const rows = allocation.assignments
    .map((a) => {
      const student = studentsById.get(a.studentId);
      const room = roomsById.get(a.roomId);
      const seat = seatsById.get(a.seatId);
      if (!student || !room || !seat) return null;
      return {
        rollNumber: student.rollNumber,
        name: student.name,
        branch: student.branch,
        year: student.year,
        section: student.section,
        room: room.name,
        row: seat.row,
        seat: seat.col,
      };
    })
    .filter((r) => r !== null)
    .sort((a, b) => a!.rollNumber.localeCompare(b!.rollNumber));

  res.json({ examId: allocation.examId, status: allocation.status, score: allocation.score, rows });
});
