import { describe, expect, it } from 'vitest';
import { generateAllocation } from '../engine.js';
import { computeRoomLaneSubjects, detectSeparationDirection } from '../subjects/laneSubjects.js';
import { baseRuleConfig, makeRegularRoom, makeStudent } from './helpers.js';
import type { AdjacencyRule, SubjectAssignment } from '@exam-allocator/core';

const rule = (horizontal: boolean, vertical: boolean, attribute: AdjacencyRule['attribute'] = 'year'): AdjacencyRule => ({
  enabled: true, attribute, horizontal, vertical, diagonal: false, mode: 'strict', priority: 'high',
});

const subjects: SubjectAssignment[] = [
  { id: 's3', branch: 'CSE', year: 3, subjectName: 'Data Structures', subjectCode: 'CS301' },
  { id: 's4', branch: 'CSE', year: 4, subjectName: 'Compilers' },
];

function students() {
  return [
    ...Array.from({ length: 6 }, (_, i) => makeStudent({ id: `y3-${i + 1}`, rollNumber: `24CSE00${i + 1}`, branch: 'CSE', year: 3 })),
    ...Array.from({ length: 6 }, (_, i) => makeStudent({ id: `y4-${i + 1}`, rollNumber: `23CSE00${i + 1}`, branch: 'CSE', year: 4 })),
  ];
}

function run(horizontal: boolean, vertical: boolean, room = makeRegularRoom('A', 4, 4)) {
  const adjacencyRules = [rule(horizontal, vertical)];
  const s = students();
  const result = generateAllocation({
    examId: 'e', students: s, rooms: [room],
    ruleConfig: { ...baseRuleConfig(), adjacencyRules, rollContinuity: { mode: 'strict', priority: 'critical' } },
  });
  return { result, s, adjacencyRules };
}

describe('detectSeparationDirection', () => {
  it('maps V-only/H-only/H+V/none', () => {
    expect(detectSeparationDirection([rule(false, true)])).toBe('row');
    expect(detectSeparationDirection([rule(true, false)])).toBe('column');
    expect(detectSeparationDirection([rule(true, true)])).toBe('seat');
    expect(detectSeparationDirection([])).toBe('none');
    expect(detectSeparationDirection([{ ...rule(false, true), mode: 'preferred' }])).toBe('none');
  });
});

describe('computeRoomLaneSubjects (post-allocation only)', () => {
  it('V-only: labels each row with that row\'s single branch+year subject', () => {
    const { result, s, adjacencyRules } = run(false, true);
    const out = computeRoomLaneSubjects({ room: result.roomSnapshot[0]!, assignments: result.assignments, students: s, subjectAssignments: subjects, adjacencyRules });
    expect(out.direction).toBe('row');
    expect(out.lanes.length).toBeGreaterThan(0);
    for (const lane of out.lanes) {
      expect(lane.mixed).toBe(false);
      expect(lane.groups).toHaveLength(1);
    }
    const names = out.lanes.map((l) => l.groups[0]!.subjectName);
    expect(names).toContain('Data Structures');
    expect(names).toContain('Compilers');
  });

  it('H-only: labels columns', () => {
    const { result, s, adjacencyRules } = run(true, false);
    const out = computeRoomLaneSubjects({ room: result.roomSnapshot[0]!, assignments: result.assignments, students: s, subjectAssignments: subjects, adjacencyRules });
    expect(out.direction).toBe('column');
    for (const lane of out.lanes) expect(lane.mixed).toBe(false);
  });

  it('H+V: labels every seat from its own occupant', () => {
    const { result, s, adjacencyRules } = run(true, true);
    const room = result.roomSnapshot[0]!;
    const out = computeRoomLaneSubjects({ room, assignments: result.assignments, students: s, subjectAssignments: subjects, adjacencyRules });
    expect(out.direction).toBe('seat');
    expect(Object.keys(out.seats)).toHaveLength(12);
    for (const a of result.assignments) {
      const st = s.find((x) => x.id === a.studentId)!;
      expect(out.seats[a.seatId]!.year).toBe(st.year);
    }
  });

  it('does not blindly copy the first student: a lane with mixed groups reports both', () => {
    const room = makeRegularRoom('A', 1, 2);
    const s = [makeStudent({ id: 'a', rollNumber: 'R1', branch: 'CSE', year: 3 }), makeStudent({ id: 'b', rollNumber: 'R2', branch: 'CSE', year: 4 })];
    const seats = room.seats;
    const out = computeRoomLaneSubjects({
      room,
      assignments: [
        { studentId: 'a', seatId: seats[0]!.id, roomId: room.id },
        { studentId: 'b', seatId: seats[1]!.id, roomId: room.id },
      ],
      students: s, subjectAssignments: subjects, adjacencyRules: [rule(false, true)],
    });
    expect(out.lanes).toHaveLength(1);
    expect(out.lanes[0]!.mixed).toBe(true);
    expect(out.lanes[0]!.groups.map((g) => g.subjectName)).toEqual(['Data Structures', 'Compilers']);
  });

  it('leaves subjectName undefined when a group has no assigned subject, and never changes the allocation', () => {
    const { result, s, adjacencyRules } = run(false, true);
    const before = JSON.stringify(result.assignments);
    const out = computeRoomLaneSubjects({ room: result.roomSnapshot[0]!, assignments: result.assignments, students: s, subjectAssignments: [], adjacencyRules });
    expect(out.lanes.every((l) => l.groups[0]!.subjectName === undefined)).toBe(true);
    expect(JSON.stringify(result.assignments)).toBe(before);
  });
});
