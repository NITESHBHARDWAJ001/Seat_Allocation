import type { sheets_v4 } from 'googleapis';
import { generateId, type BlockReason, type Room, type RoomRepository } from '../core/index.js';
import { SheetTable, type FieldSpec } from './sheetTable.js';

const FIELDS: FieldSpec[] = [
  { key: 'id', type: 'string' },
  { key: 'name', type: 'string' },
  { key: 'building', type: 'string', optional: true },
  { key: 'floor', type: 'string', optional: true },
  { key: 'priority', type: 'number' },
  { key: 'enabled', type: 'boolean' },
  { key: 'rows', type: 'json' },
  { key: 'seats', type: 'json' },
  { key: 'branchRequirements', type: 'json', optional: true },
];

export class GoogleSheetsRoomRepository implements RoomRepository {
  private table: SheetTable<Room>;

  constructor(sheets: sheets_v4.Sheets, spreadsheetId: string, tabName = 'Rooms') {
    this.table = new SheetTable(sheets, spreadsheetId, tabName, FIELDS);
  }

  async getAll(): Promise<Room[]> {
    return this.table.getAll();
  }

  async getById(id: string): Promise<Room | undefined> {
    return this.table.getById(id);
  }

  async create(room: Room): Promise<Room> {
    const withId = room.id ? room : { ...room, id: generateId('room') };
    return this.table.create(withId);
  }

  async update(id: string, patch: Partial<Room>): Promise<Room> {
    return this.table.update(id, patch);
  }

  async remove(id: string): Promise<void> {
    return this.table.remove(id);
  }

  async setSeatBlocked(roomId: string, seatId: string, blocked: boolean, reason?: string): Promise<Room> {
    const room = await this.getById(roomId);
    if (!room) throw new Error(`Room ${roomId} not found`);
    const seats = room.seats.map((s) =>
      s.id === seatId ? { ...s, blocked, blockedReason: blocked ? (reason as BlockReason) : undefined } : s
    );
    return this.table.update(roomId, { seats } as Partial<Room>);
  }
}
