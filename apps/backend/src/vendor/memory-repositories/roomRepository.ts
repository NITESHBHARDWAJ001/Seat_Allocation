import { generateId, type Room, type RoomRepository } from '../core/index.js';
import { JsonFileStore } from './jsonFileStore.js';

export class MemoryRoomRepository implements RoomRepository {
  private store: JsonFileStore<Room>;

  constructor(filePath: string) {
    this.store = new JsonFileStore<Room>(filePath);
  }

  async getAll(): Promise<Room[]> {
    return this.store.all();
  }

  async getById(id: string): Promise<Room | undefined> {
    return this.store.get(id);
  }

  async create(room: Room): Promise<Room> {
    const withId = room.id ? room : { ...room, id: generateId('room') };
    return this.store.set(withId);
  }

  async update(id: string, patch: Partial<Room>): Promise<Room> {
    const existing = await this.store.get(id);
    if (!existing) throw new Error(`Room ${id} not found`);
    const updated = { ...existing, ...patch, id };
    return this.store.set(updated);
  }

  async remove(id: string): Promise<void> {
    return this.store.delete(id);
  }

  async setSeatBlocked(roomId: string, seatId: string, blocked: boolean, reason?: string): Promise<Room> {
    const room = await this.store.get(roomId);
    if (!room) throw new Error(`Room ${roomId} not found`);
    const seats = room.seats.map((s) =>
      s.id === seatId ? { ...s, blocked, blockedReason: blocked ? (reason as Room['seats'][number]['blockedReason']) : undefined } : s
    );
    const updated = { ...room, seats };
    return this.store.set(updated);
  }
}
