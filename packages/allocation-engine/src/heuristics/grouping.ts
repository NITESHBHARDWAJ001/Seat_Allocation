import { compareRollNumbers, studentGroupKey, type Student, type StudentGroupingAttribute } from '@exam-allocator/core';

export interface StudentGroup {
  key: string;
  attribute: StudentGroupingAttribute;
  students: Student[];
}

/** Groups students by the given attribute, each group roll-sorted (natural sort). */
export function groupStudents(students: Student[], attribute: StudentGroupingAttribute): StudentGroup[] {
  const map = new Map<string, Student[]>();
  for (const s of students) {
    const key = studentGroupKey(s, attribute);
    const list = map.get(key);
    if (list) list.push(s);
    else map.set(key, [s]);
  }
  const groups: StudentGroup[] = [];
  for (const [key, list] of map) {
    groups.push({
      key,
      attribute,
      students: list.slice().sort((a, b) => compareRollNumbers(a.rollNumber, b.rollNumber)),
    });
  }
  return groups;
}

/**
 * Most-constrained-first ordering: larger groups (harder to place without
 * collisions) go first, so the solver commits its scarcest resources before
 * easier, smaller groups fill in the gaps.
 */
export function orderGroupsByConstraint(groups: StudentGroup[]): StudentGroup[] {
  return groups.slice().sort((a, b) => b.students.length - a.students.length);
}

export function sortStudentsForPlacement(students: Student[]): Student[] {
  const byBranchYearSection = groupStudents(students, 'branch');
  const ordered = orderGroupsByConstraint(byBranchYearSection);
  return ordered.flatMap((g) => g.students);
}
