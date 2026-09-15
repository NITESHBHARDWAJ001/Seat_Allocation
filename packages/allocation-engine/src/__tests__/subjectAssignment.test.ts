import { describe, expect, it } from 'vitest';
import type { SubjectAssignment } from '@exam-allocator/core';
import { detectSubjectConflicts, resolveSubjectForGroup } from '../subjects/subjectAssignment.js';

function subj(overrides: Partial<SubjectAssignment> & { branch: string; year: number; subjectName: string }): SubjectAssignment {
  return { id: `${overrides.branch}-${overrides.year}-${overrides.subjectName}`, ...overrides };
}

describe('resolveSubjectForGroup', () => {
  it('resolves the subject assigned to a branch+year', () => {
    const assignments = [subj({ branch: 'CSE', year: 2, subjectName: 'Data Structures' })];
    expect(resolveSubjectForGroup('CSE', 2, assignments)?.subjectName).toBe('Data Structures');
  });

  it('returns undefined when no rule matches', () => {
    const assignments = [subj({ branch: 'CSE', year: 2, subjectName: 'Data Structures' })];
    expect(resolveSubjectForGroup('ECE', 3, assignments)).toBeUndefined();
  });
});

describe('detectSubjectConflicts', () => {
  it('flags two different subjects assigned to the exact same branch+year', () => {
    const assignments = [
      subj({ branch: 'CSE', year: 2, subjectName: 'Data Structures' }),
      subj({ branch: 'CSE', year: 2, subjectName: 'Operating Systems' }),
    ];
    const conflicts = detectSubjectConflicts(assignments);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]!.subjectNames.sort()).toEqual(['Data Structures', 'Operating Systems']);
  });

  it('does not flag unrelated groups', () => {
    const assignments = [
      subj({ branch: 'CSE', year: 2, subjectName: 'Data Structures' }),
      subj({ branch: 'ECE', year: 2, subjectName: 'Signals' }),
    ];
    expect(detectSubjectConflicts(assignments)).toHaveLength(0);
  });
});
