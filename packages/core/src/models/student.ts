export interface Student {
  id: string;
  rollNumber: string;
  name: string;
  branch: string;
  year: number;
  section: string;
  semester?: number;
  batch?: string;
  gender?: string;
  customAttributes?: Record<string, string>;
  active: boolean;
}

export type StudentGroupingAttribute = 'branch' | 'year' | 'section' | 'batch';

export function studentGroupKey(student: Student, attribute: StudentGroupingAttribute): string {
  switch (attribute) {
    case 'branch':
      return student.branch;
    case 'year':
      return String(student.year);
    case 'section':
      return student.section;
    case 'batch':
      return student.batch ?? '';
  }
}

/**
 * Natural sort comparator for roll numbers that mixes letters and digits in any
 * arrangement (CSE24001, CSE-24-001, 24CSE001, AIML-2024-031, ...). Splits the
 * string into alternating alpha/numeric runs and compares numerically within
 * numeric runs so "CSE9" sorts before "CSE10".
 */
export function compareRollNumbers(a: string, b: string): number {
  const tokenize = (s: string) => s.match(/\d+|\D+/g) ?? [s];
  const ta = tokenize(a);
  const tb = tokenize(b);
  const len = Math.max(ta.length, tb.length);
  for (let i = 0; i < len; i++) {
    const pa = ta[i] ?? '';
    const pb = tb[i] ?? '';
    const na = /^\d+$/.test(pa) ? Number(pa) : null;
    const nb = /^\d+$/.test(pb) ? Number(pb) : null;
    if (na !== null && nb !== null) {
      if (na !== nb) return na - nb;
    } else {
      const cmp = pa.localeCompare(pb);
      if (cmp !== 0) return cmp;
    }
  }
  return 0;
}
