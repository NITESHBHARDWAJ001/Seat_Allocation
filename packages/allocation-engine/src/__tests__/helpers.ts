import { buildIrregularRoom, buildRegularRoom, defaultRuleConfig, type Room, type RuleConfig, type Student } from '@exam-allocator/core';

export function makeStudent(overrides: Partial<Student> & { id: string; rollNumber: string; branch: string }): Student {
  return {
    name: overrides.name ?? overrides.id,
    year: overrides.year ?? 1,
    section: overrides.section ?? 'A',
    active: overrides.active ?? true,
    ...overrides,
  };
}

export function makeStudents(count: number, branch: string, prefix: string, opts: Partial<Student> = {}): Student[] {
  const students: Student[] = [];
  for (let i = 1; i <= count; i++) {
    const roll = `${prefix}${String(i).padStart(3, '0')}`;
    students.push(
      makeStudent({
        id: `${prefix}-${i}`,
        rollNumber: roll,
        branch,
        ...opts,
      })
    );
  }
  return students;
}

export function makeRegularRoom(id: string, rows: number, seatsPerRow: number, priority = 1): Room {
  return buildRegularRoom({ id, name: id, rows, seatsPerRow, priority });
}

export function makeIrregularRoom(id: string, rowSeatCounts: number[]): Room {
  return buildIrregularRoom({ id, name: id, rowSeatCounts });
}

export function baseRuleConfig(): RuleConfig {
  return defaultRuleConfig();
}
