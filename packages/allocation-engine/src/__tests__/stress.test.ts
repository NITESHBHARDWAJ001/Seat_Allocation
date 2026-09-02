import { describe, expect, it } from 'vitest';
import type { Room, Student } from '@exam-allocator/core';
import { buildRegularRoom } from '@exam-allocator/core';
import { generateAllocation } from '../engine.js';
import { baseRuleConfig } from './helpers.js';

function buildStressStudents(): Student[] {
  const branches = ['CSE', 'ECE', 'MECH', 'CIVIL'];
  const years = [1, 2, 3, 4];
  const sections = ['A', 'B'];
  const students: Student[] = [];
  let n = 0;
  outer: for (const branch of branches) {
    for (const year of years) {
      for (const section of sections) {
        for (let i = 1; i <= 32; i++) {
          n++;
          if (n > 1000) break outer;
          students.push({
            id: `stu-${n}`,
            rollNumber: `${branch}${year}${section}${String(i).padStart(3, '0')}`,
            name: `Student ${n}`,
            branch,
            year,
            section,
            active: true,
          });
        }
      }
    }
  }
  return students;
}

function buildStressRooms(): Room[] {
  const rooms: Room[] = [];
  for (let i = 1; i <= 20; i++) {
    rooms.push(buildRegularRoom({ id: `room-${i}`, name: `Room ${i}`, rows: 6, seatsPerRow: 10, priority: i }));
  }
  return rooms; // 20 * 60 = 1200 seats for 1000 students
}

describe('stress: ~1000 students / 20 rooms', () => {
  it('completes within a practical time budget and never breaks a hard constraint', () => {
    const students = buildStressStudents();
    const rooms = buildStressRooms();
    const ruleConfig = baseRuleConfig(); // default strict branch adjacency + preferred roll continuity

    expect(students.length).toBe(1000);

    const start = Date.now();
    const result = generateAllocation({ examId: 'stress-1', students, rooms, ruleConfig, seed: 42 });
    const elapsedMs = Date.now() - start;

    expect(elapsedMs).toBeLessThan(20000);
    expect(result.validationReport.allHardConstraintsPassed).toBe(true);
    expect(result.assignments.length + result.unallocatedStudentIds.length).toBe(1000);
    // With 1200 seats across 20 rooms and only a horizontal+vertical branch
    // restriction, the overwhelming majority should be seatable.
    expect(result.assignments.length).toBeGreaterThan(900);
  });

  it('is reproducible: same seed + inputs yields the same assignment set', () => {
    const students = buildStressStudents();
    const rooms = buildStressRooms();
    const ruleConfig = baseRuleConfig();

    const a = generateAllocation({ examId: 'stress-2', students, rooms, ruleConfig, seed: 7 });
    const b = generateAllocation({ examId: 'stress-2', students, rooms, ruleConfig, seed: 7 });

    const normalize = (r: typeof a) =>
      r.assignments
        .map((x) => `${x.studentId}:${x.seatId}`)
        .sort()
        .join('|');

    expect(normalize(a)).toBe(normalize(b));
  });
});
