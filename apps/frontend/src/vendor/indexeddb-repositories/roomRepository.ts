import { generateId, type BlockReason, type Room, type RoomRepository } from '../core/index.js';
import { getDb } from './db.js';

export class IndexedDbRoomRepository implements RoomRepository {
  async getAll(): Promise<Room[]> {
    const db = await getDb();
    return db.getAll('rooms');
  }

  async getById(id: string): Promise<Room | undefined> {
    const db = await getDb();
    return db.get('rooms', id);
  }

  async create(room: Room): Promise<Room> {
    const db = await getDb();
    const withId = room.id ? room : { ...room, id: generateId('room') };
    await db.put('rooms', withId);
    return withId;
  }

  async update(id: string, patch: Partial<Room>): Promise<Room> {
    const db = await getDb();
    const existing = await db.get('rooms', id);
    if (!existing) throw new Error(`Room ${id} not found`);
    const updated = { ...existing, ...patch, id };
    await db.put('rooms', updated);
    return updated;
  }

  async remove(id: string): Promise<void> {
    const db = await getDb();
    await db.delete('rooms', id);
  }

  async setSeatBlocked(roomId: string, seatId: string, blocked: boolean, reason?: string): Promise<Room> {
    const db = await getDb();
    const room = await db.get('rooms', roomId);
    if (!room) throw new Error(`Room ${roomId} not found`);
    const seats = room.seats.map((s) =>
      s.id === seatId ? { ...s, blocked, blockedReason: blocked ? (reason as BlockReason) : undefined } : s
    );
    const updated = { ...room, seats };
    await db.put('rooms', updated);
    return updated;
  }
}
