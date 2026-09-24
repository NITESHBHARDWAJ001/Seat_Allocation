import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { compareRollNumbers, buildRegularRoom, type Room, type Student } from '@exam-allocator/core';
import { generateAllocation } from '../engine.js';
import { baseRuleConfig } from './helpers.js';

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', 'fixtures', 'year-mixing-branch-120-students');

function parseStudents(csv: string): Student[] {
  return csv
    .trim()
    .split('\n')
    .map((line, i) => {
      const [rollNumber, name, branch, year, section] = line.split(',').map((s) => s.trim());
      return { id: `s${i}`, rollNumber: rollNumber!, name: name!, branch: branch!, year: Number(year), section: section!, active: true };
    });
}

function parseRooms(csv: string): Room[] {
  return csv
    .trim()
    .split('\n')
    .map((line) => {
      const [name, rows, seatsPerRow, priority] = line.split(',').map((s) => s.trim());
      return buildRegularRoom({ id: name!, name: name!, rows: Number(rows), seatsPerRow: Number(seatsPerRow), priority: Number(priority) });
    });
}

/**
 * Full-scale reproduction of the reported bug: 60 Year-3 + 60 Year-4 CSE
 * students, vertical-only strict year separation, strict roll continuity,
 * across 3 rooms (2 of which are needed, 1 stays empty). Verifies actual
 * physical (room, row, col) coordinates - never assignment array order or
 * the student dropdown order.
 */
describe('120-student CSE Year 3 + Year 4 fixture (vertical-only strict separation)', () => {
  const students = parseStudents(readFileSync(join(fixtureDir, 'students.csv'), 'utf-8'));
  const rooms = parseRooms(readFileSync(join(fixtureDir, 'rooms.csv'), 'utf-8'));

  const ruleConfig = {
    ...baseRuleConfig(),
    adjacencyRules: [{ enabled: true, attribute: 'year' as const, horizontal: false, vertical: true, diagonal: false, mode: 'strict' as const, priority: 'high' as const }],
    rollContinuity: { mode: 'strict' as const, priority: 'critical' as const },
    yearMixing: 'mixed' as const,
  };

  const result = generateAllocation({ examId: 'fixture-120', students, rooms, ruleConfig, seed: 1 });
  const seatsById = new Map(result.roomSnapshot.flatMap((r) => r.seats.map((s) => [s.id, s] as const)));
  const studentsById = new Map(students.map((s) => [s.id, s]));
  const seatOf = new Map(result.assignments.map((a) => [a.studentId, seatsById.get(a.seatId)!] as const));
  const roomNameOf = new Map(result.roomSnapshot.map((r) => [r.id, r.name] as const));

  it('seats everyone (120/120), using only as many rooms as needed', () => {
    expect(result.unallocatedStudentIds).toHaveLength(0);
    expect(result.assignments).toHaveLength(120);
    const usedRooms = new Set(result.assignments.map((a) => roomNameOf.get(a.roomId)));
    expect(usedRooms).toEqual(new Set(['B1', 'B2'])); // B3 stays empty - 120 students fit in 2 of 3 rooms
  });

  it('never places two same-year students directly vertically adjacent (hard constraint actually holds)', () => {
    expect(result.validationReport.hardConstraints.find((c) => c.id === 'H_adjacency_strict')?.passed).toBe(true);
    for (const a of result.assignments) {
      const seatA = seatOf.get(a.studentId)!;
      const below = [...result.assignments].find((b) => {
        if (b.studentId === a.studentId || b.roomId !== a.roomId) return false;
        const seatB = seatOf.get(b.studentId)!;
        return seatB.row === seatA.row + 1 && seatB.col === seatA.col;
      });
      if (!below) continue;
      expect(studentsById.get(below.studentId)!.year).not.toBe(studentsById.get(a.studentId)!.year);
    }
  });

  it('every same-year same-room roll sequence reads left-to-right, top-to-bottom with no gaps (the actual printable order)', () => {
    for (const year of [3, 4]) {
      const group = students.filter((s) => s.year === year).sort((a, b) => compareRollNumbers(a.rollNumber, b.rollNumber));
      // Split into contiguous same-room runs and verify each run is a
      // perfectly consecutive left-to-right, top-to-bottom seat sequence -
      // i.e. no "jump by 2/3" pattern like the reported bug.
      let runStart = 0;
      for (let i = 1; i <= group.length; i++) {
        const sameRoomAsRunStart = i < group.length && seatOf.get(group[i]!.id)!.roomId === seatOf.get(group[runStart]!.id)!.roomId;
        if (sameRoomAsRunStart) continue;
        const run = group.slice(runStart, i);
        for (let j = 1; j < run.length; j++) {
          const prevSeat = seatOf.get(run[j - 1]!.id)!;
          const seat = seatOf.get(run[j]!.id)!;
          const isNextInRow = seat.row === prevSeat.row && seat.col === prevSeat.col + 1;
          const isWrapToNextLane = seat.row === prevSeat.row + 2 && seat.col === 1; // next odd/even-row lane starts at col 1
          expect(isNextInRow || isWrapToNextLane).toBe(true);
        }
        runStart = i;
      }
    }
  });

  it('treats the unavoidable room boundaries as valid: each room keeps one unbroken roll range', () => {
    // Each year has 60 students but only 30 lane-seats per room, so a
    // room boundary is unavoidable; that is fine as long as no room is re-entered.
    expect(result.status).toBe('success');
    expect(result.validationReport.hardConstraints.find((c) => c.id === 'H_roll_continuity_strict')?.passed).toBe(true);
    expect(result.validationReport.conflicts.filter((c) => c.type === 'roll_continuity_split')).toHaveLength(0);
  });
});
