import { roomAvailableSeats, type Room } from '@exam-allocator/core';

/**
 * Greedily picks the fewest priority-ordered rooms whose seat capacity
 * covers `studentCount` - used by allocationMode 'minimum-rooms' and by the
 * datesheet importer so a session that only needs one room doesn't get
 * every enabled room attached (which would otherwise force a duty-roster
 * invigilator target of at least 1 per room, even for rooms nobody sits in).
 * Always returns at least one room when `rooms` is non-empty; the caller
 * (generateAllocation) falls back to the full room list if seating actually
 * comes up short, since correctness always wins over minimizing room count.
 */
export function selectMinimalRooms(rooms: Room[], studentCount: number): Room[] {
  const sorted = [...rooms].sort((a, b) => a.priority - b.priority);
  const selected: Room[] = [];
  let capacity = 0;
  for (const room of sorted) {
    if (capacity >= studentCount && selected.length > 0) break;
    selected.push(room);
    capacity += roomAvailableSeats(room).length;
  }
  return selected;
}
