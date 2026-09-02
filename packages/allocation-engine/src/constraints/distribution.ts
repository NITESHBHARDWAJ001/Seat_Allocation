import { roomAvailableSeats, type Room, type RuleConfig } from '@exam-allocator/core';

export interface SeatReservations {
  /** seatId -> branch it is strictly reserved for (spec H8: explicit strict room/branch counts). */
  reservedBranchBySeat: Map<string, string>;
  /** roomId -> allowed branches when a room has a STRICT branch requirement (spec H9), else absent = any branch allowed. */
  roomAllowList: Map<string, Set<string>>;
  /** roomId -> branches with a PREFERRED affinity (soft scoring bonus only). */
  roomPreferredBranches: Map<string, Set<string>>;
}

function byRowCol(a: { row: number; col: number }, b: { row: number; col: number }): number {
  return a.row - b.row || a.col - b.col;
}

/**
 * Pre-computes strict seat reservations and room allow-lists from explicit
 * distribution rules and room.branchRequirements, so the solver can enforce
 * H8/H9 without special-casing them inline everywhere.
 */
export function buildSeatReservations(rooms: Room[], ruleConfig: RuleConfig): SeatReservations {
  const reservedBranchBySeat = new Map<string, string>();
  const roomAllowList = new Map<string, Set<string>>();
  const roomPreferredBranches = new Map<string, Set<string>>();

  for (const room of rooms) {
    const strictReq = (room.branchRequirements ?? []).filter((r) => r.mode === 'strict');
    if (strictReq.length) {
      roomAllowList.set(room.id, new Set(strictReq.map((r) => r.branch)));
    }
    const preferredReq = (room.branchRequirements ?? []).filter((r) => r.mode === 'preferred');
    if (preferredReq.length) {
      roomPreferredBranches.set(room.id, new Set(preferredReq.map((r) => r.branch)));
    }
  }

  const roomsById = new Map(rooms.map((r) => [r.id, r]));
  const entriesByRoom = new Map<string, typeof ruleConfig.distribution>();
  for (const entry of ruleConfig.distribution) {
    if (entry.mode === 'strict' && entry.count !== undefined) {
      const list = entriesByRoom.get(entry.roomId) ?? [];
      list.push(entry);
      entriesByRoom.set(entry.roomId, list);
    } else if (entry.mode === 'preferred') {
      const set = roomPreferredBranches.get(entry.roomId) ?? new Set<string>();
      set.add(entry.branch);
      roomPreferredBranches.set(entry.roomId, set);
    }
  }

  for (const [roomId, entries] of entriesByRoom) {
    const room = roomsById.get(roomId);
    if (!room) continue;
    const seats = roomAvailableSeats(room).sort(byRowCol);
    let idx = 0;
    for (const entry of entries) {
      const count = entry.count ?? 0;
      for (let i = 0; i < count && idx < seats.length; i++, idx++) {
        reservedBranchBySeat.set(seats[idx]!.id, entry.branch);
      }
    }
  }

  return { reservedBranchBySeat, roomAllowList, roomPreferredBranches };
}
