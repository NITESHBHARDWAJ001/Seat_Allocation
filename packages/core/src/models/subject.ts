/**
 * Different branch/year groups often sit different papers in the same exam
 * session (e.g. CSE-Y2 writes Data Structures while ECE-Y2 writes Signals,
 * same room, same slot) — need to record and display that per group.
 * Granularity is branch+year only (not section) — a paper is the same for
 * every section of a given branch+year.
 */
export interface SubjectAssignment {
  id: string;
  branch: string;
  year: number;
  subjectName: string;
  subjectCode?: string;
}
