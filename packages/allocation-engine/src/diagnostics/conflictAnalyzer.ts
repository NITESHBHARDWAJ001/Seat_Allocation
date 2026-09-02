import type { Conflict, ConflictSeverity, ConflictType } from '@exam-allocator/core';

let counter = 0;
function nextConflictId(): string {
  counter += 1;
  return `conflict-${counter}`;
}

export function makeConflict(params: {
  type: ConflictType;
  severity: ConflictSeverity;
  seatIds: string[];
  studentIds: string[];
  roomId?: string;
  description: string;
  suggestedResolution?: string;
}): Conflict {
  return { id: nextConflictId(), ...params };
}

export function suggestAdjacencyResolution(otherRoomHint?: string): string {
  return otherRoomHint
    ? `Move one of the students to a different seat, e.g. in ${otherRoomHint}.`
    : 'Move one of the students to a seat that is not horizontally/vertically/diagonally adjacent, or relax this adjacency rule to PREFERRED.';
}
