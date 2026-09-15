import { Router } from 'express';
import { allocateDuties, findConflictingTeacherIds, findWorkloadExcludedTeacherIds } from '../vendor/allocation-engine/index.js';
import { allocationRepository, dutyRosterRepository, examRepository, roomRepository, teacherRepository } from '../repositories.js';

export const dutyRouter = Router();

dutyRouter.post('/generate', async (req, res) => {
  const examId = req.body?.examId;
  if (typeof examId !== 'string') return res.status(400).json({ error: 'Expected { examId }' });

  const exam = await examRepository.getById(examId);
  if (!exam) return res.status(404).json({ error: 'Exam not found' });

  const [allTeachers, allRooms, allExams, allRosters, examAllocations] = await Promise.all([
    teacherRepository.getAll(),
    roomRepository.getAll(),
    examRepository.getAll(),
    dutyRosterRepository.getAll(),
    allocationRepository.getByExamId(examId),
  ]);
  const rooms = allRooms.filter((r) => exam.roomIds.includes(r.id));
  const seatAllocation = examAllocations.find((a) => a.id === exam.activeAllocationId);

  const maxDutiesPerDay = req.body?.maxDutiesPerDay ? Number(req.body.maxDutiesPerDay) : undefined;
  const maxDutiesTotal = req.body?.maxDutiesTotal ? Number(req.body.maxDutiesTotal) : undefined;

  const excludeTeacherIds = new Set([
    ...findConflictingTeacherIds(exam, allExams, allRosters),
    ...findWorkloadExcludedTeacherIds(exam, allExams, allRosters, maxDutiesPerDay, maxDutiesTotal),
  ]);
  const existing = await dutyRosterRepository.getByExamId(examId);

  const roster = allocateDuties({
    examId,
    teachers: allTeachers,
    rooms,
    seatsPerInvigilator: Number(req.body?.seatsPerInvigilator) || 30,
    avoidOwnBranchInvigilation: req.body?.avoidOwnBranchInvigilation !== false,
    maxDutiesPerDay,
    maxDutiesTotal,
    seatAllocation,
    excludeTeacherIds,
    seed: req.body?.seed,
    version: existing.length + 1,
  });

  await dutyRosterRepository.create(roster);
  await examRepository.update(examId, { dutyRosterIds: [...exam.dutyRosterIds, roster.id], activeDutyRosterId: roster.id });

  res.status(201).json(roster);
});

dutyRouter.get('/:id', async (req, res) => {
  const roster = await dutyRosterRepository.getById(req.params.id);
  if (!roster) return res.status(404).json({ error: 'Duty roster not found' });
  res.json(roster);
});
