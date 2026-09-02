import { describe, expect, it } from 'vitest';
import { generateAllocation } from '../engine.js';
import { baseRuleConfig, makeRegularRoom, makeStudents } from './helpers.js';

describe('capacity and blocked seats', () => {
  it('never uses a blocked seat and seats everyone when capacity exactly matches', () => {
    const room = makeRegularRoom('R1', 2, 2); // 4 seats
    const blocked = room.seats.find((s) => s.row === 2 && s.col === 2)!;
    blocked.blocked = true;
    blocked.available = false;

    const students = makeStudents(3, 'CSE', 'CSE');
    const ruleConfig = baseRuleConfig();
    ruleConfig.adjacencyRules = []; // isolate capacity/blocking from adjacency

    const result = generateAllocation({ examId: 'e1', students, rooms: [room], ruleConfig });

    expect(result.status).toBe('success');
    expect(result.assignments).toHaveLength(3);
    expect(result.assignments.some((a) => a.seatId === blocked.id)).toBe(false);
    expect(result.validationReport.allHardConstraintsPassed).toBe(true);
  });

  it('short-circuits with a diagnostic instead of running the solver when students exceed available seats', () => {
    const room = makeRegularRoom('R1', 2, 2); // 4 seats
    const students = makeStudents(5, 'CSE', 'CSE');
    const ruleConfig = baseRuleConfig();
    ruleConfig.adjacencyRules = [];

    const result = generateAllocation({ examId: 'e1', students, rooms: [room], ruleConfig });

    expect(result.status).toBe('failed');
    expect(result.assignments).toHaveLength(0);
    expect(result.feasibility.feasible).toBe(false);
    expect(result.feasibility.issues.some((i) => i.code === 'insufficient_seats')).toBe(true);
  });

  it('excludes blocked seats from the feasibility seat count', () => {
    const room = makeRegularRoom('R1', 2, 2);
    room.seats[0]!.blocked = true;
    room.seats[0]!.available = false;
    const students = makeStudents(3, 'CSE', 'CSE');
    const ruleConfig = baseRuleConfig();
    ruleConfig.adjacencyRules = [];

    const result = generateAllocation({ examId: 'e1', students, rooms: [room], ruleConfig });
    expect(result.feasibility.totalAvailableSeats).toBe(3);
  });
});
