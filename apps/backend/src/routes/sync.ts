import { Router } from 'express';
import {
  studentRepository,
  roomRepository,
  examRepository,
  allocationRepository,
  teacherRepository,
  dutyRosterRepository,
  attendanceRepository,
} from '../repositories.js';

/**
 * Generic mirror endpoints used by the frontend's manual "Sync Now" feature.
 * Unlike the per-entity REST routes, these work with caller-supplied ids
 * (upsert) so a browser's local IndexedDB records can round-trip through
 * the spreadsheet unchanged - the normal POST routes always mint a fresh id,
 * which would break re-importing the same record on another device.
 */

interface EntityRepo {
  getAll(): Promise<{ id: string }[]>;
  getById(id: string): Promise<{ id: string } | undefined>;
  create(item: any): Promise<any>;
  update(id: string, patch: any): Promise<any>;
}

const repositories: Record<string, EntityRepo> = {
  students: studentRepository as unknown as EntityRepo,
  rooms: roomRepository as unknown as EntityRepo,
  exams: examRepository as unknown as EntityRepo,
  allocations: allocationRepository as unknown as EntityRepo,
  teachers: teacherRepository as unknown as EntityRepo,
  dutyRosters: dutyRosterRepository as unknown as EntityRepo,
  attendance: attendanceRepository as unknown as EntityRepo,
};

export const syncRouter = Router();

syncRouter.get('/:entity', async (req, res) => {
  const repo = repositories[req.params.entity];
  if (!repo) return res.status(404).json({ error: `Unknown entity "${req.params.entity}"` });
  res.json(await repo.getAll());
});

syncRouter.post('/:entity/bulk', async (req, res) => {
  const repo = repositories[req.params.entity];
  if (!repo) return res.status(404).json({ error: `Unknown entity "${req.params.entity}"` });
  const items = req.body?.items;
  if (!Array.isArray(items)) return res.status(400).json({ error: 'Expected { items: T[] }' });

  let created = 0;
  let updated = 0;
  const errors: string[] = [];

  for (const item of items) {
    if (!item || typeof item.id !== 'string') {
      errors.push('Item missing string id');
      continue;
    }
    try {
      const existing = await repo.getById(item.id);
      if (existing) {
        await repo.update(item.id, item);
        updated++;
      } else {
        await repo.create(item);
        created++;
      }
    } catch (err) {
      errors.push(`${item.id}: ${err instanceof Error ? err.message : 'unknown error'}`);
    }
  }

  res.json({ created, updated, errors });
});
