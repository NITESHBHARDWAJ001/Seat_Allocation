import { Router } from 'express';
import { buildRegularRoom, generateId } from '../vendor/core/index.js';
import { roomRepository } from '../repositories.js';

export const roomsRouter = Router();

roomsRouter.get('/', async (_req, res) => {
  res.json(await roomRepository.getAll());
});

roomsRouter.get('/:id', async (req, res) => {
  const room = await roomRepository.getById(req.params.id);
  if (!room) return res.status(404).json({ error: 'Room not found' });
  res.json(room);
});

roomsRouter.post('/', async (req, res) => {
  const body = req.body ?? {};
  if (typeof body.name !== 'string') return res.status(400).json({ error: 'Expected { name, rows, seatsPerRow }' });
  const room = buildRegularRoom({
    id: generateId('room'),
    name: body.name,
    building: body.building,
    rows: Number(body.rows) || 1,
    seatsPerRow: Number(body.seatsPerRow) || 1,
    priority: Number(body.priority) || 1,
  });
  res.status(201).json(await roomRepository.create(room));
});

roomsRouter.put('/:id', async (req, res) => {
  try {
    res.json(await roomRepository.update(req.params.id, req.body ?? {}));
  } catch (err) {
    res.status(404).json({ error: err instanceof Error ? err.message : 'Update failed' });
  }
});

roomsRouter.delete('/:id', async (req, res) => {
  await roomRepository.remove(req.params.id);
  res.status(204).end();
});

roomsRouter.post('/:id/seats/:seatId/block', async (req, res) => {
  try {
    const room = await roomRepository.setSeatBlocked(req.params.id, req.params.seatId, true, req.body?.reason);
    res.json(room);
  } catch (err) {
    res.status(404).json({ error: err instanceof Error ? err.message : 'Failed' });
  }
});

roomsRouter.post('/:id/seats/:seatId/unblock', async (req, res) => {
  try {
    const room = await roomRepository.setSeatBlocked(req.params.id, req.params.seatId, false);
    res.json(room);
  } catch (err) {
    res.status(404).json({ error: err instanceof Error ? err.message : 'Failed' });
  }
});
