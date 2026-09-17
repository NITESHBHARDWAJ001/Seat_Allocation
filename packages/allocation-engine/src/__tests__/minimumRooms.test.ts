import { describe, expect, it } from 'vitest';
import { generateAllocation } from '../engine.js';
import { selectMinimalRooms } from '../rooms/roomSelection.js';
import { makeRegularRoom, makeStudents, baseRuleConfig } from './helpers.js';

describe('selectMinimalRooms', () => {
  it('picks the fewest priority-ordered rooms that cover the student count', () => {
    const rooms = [
      makeRegularRoom('r1', 4, 10, 1), // 40 seats
      makeRegularRoom('r2', 4, 10, 2), // 40 seats
      makeRegularRoom('r3', 4, 10, 3), // 40 seats
    ];
    const selected = selectMinimalRooms(rooms, 25);
    expect(selected.map((r) => r.id)).toEqual(['r1']);
  });

  it('adds rooms in priority order until capacity is covered', () => {
    const rooms = [
      makeRegularRoom('r1', 4, 10, 1), // 40 seats
      makeRegularRoom('r2', 4, 10, 2), // 40 seats
      makeRegularRoom('r3', 4, 10, 3), // 40 seats
    ];
    const selected = selectMinimalRooms(rooms, 70);
    expect(selected.map((r) => r.id)).toEqual(['r1', 'r2']);
  });
});

describe('allocationMode: minimum-rooms', () => {
  it('uses fewer rooms than the full candidate set when one room has ample capacity', () => {
    const rooms = [
      makeRegularRoom('r1', 4, 10, 1), // 40 seats, priority 1
      makeRegularRoom('r2', 4, 10, 2), // 40 seats
      makeRegularRoom('r3', 4, 10, 3), // 40 seats
    ];
    const students = makeStudents(10, 'CSE', 'CSE', { year: 1 })
      .concat(makeStudents(10, 'ECE', 'ECE', { year: 1 }));
    const ruleConfig = { ...baseRuleConfig(), adjacencyRules: [], allocationMode: 'minimum-rooms' as const };

    const result = generateAllocation({ examId: 'exam-1', students, rooms, ruleConfig, seed: 1 });

    expect(result.status).toBe('success');
    expect(result.unallocatedStudentIds).toHaveLength(0);
    expect(result.roomSnapshot.map((r) => r.id)).toEqual(['r1']);
  });

  it('falls back to the full room set if the minimal set cannot seat everyone', () => {
    const rooms = [
      makeRegularRoom('r1', 2, 5, 1), // 10 seats
      makeRegularRoom('r2', 4, 10, 2), // 40 seats
    ];
    const students = makeStudents(15, 'CSE', 'CSE', { year: 1 })
      .concat(makeStudents(15, 'ECE', 'ECE', { year: 1 }));
    const ruleConfig = { ...baseRuleConfig(), adjacencyRules: [], allocationMode: 'minimum-rooms' as const };

    const result = generateAllocation({ examId: 'exam-1', students, rooms, ruleConfig, seed: 1 });

    expect(result.status).toBe('success');
    expect(result.unallocatedStudentIds).toHaveLength(0);
    expect(result.roomSnapshot.map((r) => r.id).sort()).toEqual(['r1', 'r2']);
  });
});
