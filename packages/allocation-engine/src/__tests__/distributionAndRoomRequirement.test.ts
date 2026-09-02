import { describe, expect, it } from 'vitest';
import { generateAllocation } from '../engine.js';
import { baseRuleConfig, makeRegularRoom, makeStudents } from './helpers.js';

describe('explicit room/branch requirements (H8/H9)', () => {
  it('honors a strict per-room branch seat count (H8)', () => {
    const room = makeRegularRoom('R1', 1, 10); // 10 seats
    const students = [...makeStudents(6, 'CSE', 'CSE'), ...makeStudents(4, 'ECE', 'ECE')];
    const ruleConfig = baseRuleConfig();
    ruleConfig.adjacencyRules = [];
    ruleConfig.distribution = [{ roomId: 'R1', branch: 'CSE', count: 6, mode: 'strict' }];

    const result = generateAllocation({ examId: 'e1', students, rooms: [room], ruleConfig });

    expect(result.status).toBe('success');
    const cseInRoom = result.assignments.filter((a) => {
      const s = students.find((st) => st.id === a.studentId);
      return s?.branch === 'CSE';
    });
    expect(cseInRoom).toHaveLength(6);
    const h8 = result.validationReport.hardConstraints.find((c) => c.id === 'H8_strict_branch_distribution');
    expect(h8?.passed).toBe(true);
  });

  it('honors a strict room branch allow-list (H9), never placing a disallowed branch there', () => {
    const roomA = makeRegularRoom('A', 1, 5);
    roomA.branchRequirements = [{ branch: 'CSE', mode: 'strict' }];
    const roomB = makeRegularRoom('B', 1, 10);
    const students = [...makeStudents(5, 'CSE', 'CSE'), ...makeStudents(5, 'ECE', 'ECE')];
    const ruleConfig = baseRuleConfig();
    ruleConfig.adjacencyRules = [];

    const result = generateAllocation({ examId: 'e1', students, rooms: [roomA, roomB], ruleConfig });

    expect(result.status).toBe('success');
    const roomAAssignments = result.assignments.filter((a) => a.roomId === 'A');
    for (const a of roomAAssignments) {
      const student = students.find((s) => s.id === a.studentId)!;
      expect(student.branch).toBe('CSE');
    }
    const h9 = result.validationReport.hardConstraints.find((c) => c.id === 'H9_strict_room_branch_requirement');
    expect(h9?.passed).toBe(true);
  });
});
