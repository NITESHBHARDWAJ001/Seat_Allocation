import type { AllocationResult, Room, Student, SubjectAssignment } from '../vendor/core/index.js';
import { resolveSubjectForGroup } from '../vendor/allocation-engine/index.js';

/**
 * Export is deliberately decoupled from the UI (spec §53): every function
 * here takes plain data and returns a string / triggers a browser download.
 * A future Excel/PDF/Sheets exporter can sit alongside these without
 * touching any page component.
 */

function csvEscape(value: string | number): string {
  const s = String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(headers: string[], rows: (string | number)[][]): string {
  const lines = [headers.map(csvEscape).join(',')];
  for (const row of rows) lines.push(row.map(csvEscape).join(','));
  return lines.join('\n');
}

export function downloadTextFile(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function allocationReportRows(result: AllocationResult, students: Student[], rooms: Room[], subjectAssignments: SubjectAssignment[] = []) {
  const studentsById = new Map(students.map((s) => [s.id, s]));
  const roomsById = new Map(rooms.map((r) => [r.id, r]));
  const seatsById = new Map(rooms.flatMap((r) => r.seats.map((s) => [s.id, s] as const)));

  return result.assignments
    .map((a) => {
      const student = studentsById.get(a.studentId);
      const room = roomsById.get(a.roomId);
      const seat = seatsById.get(a.seatId);
      if (!student || !room || !seat) return null;
      const subject = resolveSubjectForGroup(student.branch, student.year, subjectAssignments);
      return {
        rollNumber: student.rollNumber,
        name: student.name,
        branch: student.branch,
        year: student.year,
        section: student.section,
        room: room.name,
        row: seat.row,
        seat: seat.col,
        seatLabel: seat.label ?? `R${seat.row}-S${seat.col}`,
        subject: subject?.subjectName ?? '',
      };
    })
    .filter((r): r is NonNullable<typeof r> => !!r)
    .sort((a, b) => a.rollNumber.localeCompare(b.rollNumber));
}

export function exportAllocationCsv(
  result: AllocationResult,
  students: Student[],
  rooms: Room[],
  examName: string,
  subjectAssignments: SubjectAssignment[] = []
): void {
  const rows = allocationReportRows(result, students, rooms, subjectAssignments);
  const hasSubjects = subjectAssignments.length > 0;
  const headers = ['Roll Number', 'Name', 'Branch', 'Year', 'Section', 'Room', 'Row', 'Seat', 'Seat Label'];
  if (hasSubjects) headers.push('Subject');
  const csv = toCsv(
    headers,
    rows.map((r) => {
      const row: (string | number)[] = [r.rollNumber, r.name, r.branch, r.year, r.section, r.room, r.row, r.seat, r.seatLabel];
      if (hasSubjects) row.push(r.subject);
      return row;
    })
  );
  downloadTextFile(`${examName.replace(/\s+/g, '_')}_allocation.csv`, csv, 'text/csv;charset=utf-8');
}

export function exportAllocationJson(result: AllocationResult, examName: string): void {
  downloadTextFile(`${examName.replace(/\s+/g, '_')}_allocation.json`, JSON.stringify(result, null, 2), 'application/json');
}

export function exportStudentsCsv(students: Student[]): void {
  const csv = toCsv(
    ['Roll Number', 'Name', 'Branch', 'Year', 'Section', 'Semester', 'Batch', 'Active'],
    students.map((s) => [s.rollNumber, s.name, s.branch, s.year, s.section, s.semester ?? '', s.batch ?? '', s.active ? 'yes' : 'no'])
  );
  downloadTextFile('students.csv', csv, 'text/csv;charset=utf-8');
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export function buildPrintableRoomSheet(params: {
  collegeName: string;
  examName: string;
  examDate: string;
  room: Room;
  students: Student[];
  assignments: AllocationResult['assignments'];
  invigilatorNames?: string[];
  subjectAssignments?: SubjectAssignment[];
}): string {
  const { collegeName, examName, examDate, room, students, assignments, invigilatorNames = [], subjectAssignments = [] } = params;
  const studentsById = new Map(students.map((s) => [s.id, s]));
  const seatToStudent = new Map(
    assignments.filter((a) => a.roomId === room.id).map((a) => [a.seatId, studentsById.get(a.studentId)] as const)
  );

  const rowsByIndex = new Map<number, typeof room.seats>();
  for (const seat of room.seats) {
    const list = rowsByIndex.get(seat.row) ?? [];
    list.push(seat);
    rowsByIndex.set(seat.row, list);
  }

  const rowsHtml = [...rowsByIndex.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([rowIndex, seats]) => {
      const cells = seats
        .sort((a, b) => a.col - b.col)
        .map((seat) => {
          if (seat.blocked) return `<td class="seat blocked">&times;</td>`;
          const student = seatToStudent.get(seat.id);
          return `<td class="seat${student ? ' filled' : ''}">${student ? escapeHtml(student.rollNumber) : ''}</td>`;
        })
        .join('');
      return `<tr><th>R${rowIndex}</th>${cells}</tr>`;
    })
    .join('');

  const total = [...seatToStudent.values()].filter(Boolean).length;

  const branchYearsInRoom = new Set(
    [...seatToStudent.values()].filter((s): s is Student => !!s).map((s) => `${s.branch}|${s.year}`)
  );
  const subjectsInRoom = subjectAssignments.filter((a) => branchYearsInRoom.has(`${a.branch}|${a.year}`));
  const subjectsLine =
    subjectsInRoom.length > 0
      ? subjectsInRoom.map((s) => `${escapeHtml(s.branch)}-Y${s.year}: ${escapeHtml(s.subjectName)}`).join(' &nbsp;|&nbsp; ')
      : '';

  const invigilatorLine = invigilatorNames.length > 0 ? escapeHtml(invigilatorNames.join(', ')) : '______________________';

  return `<!doctype html>
<html><head><meta charset="utf-8" /><title>${escapeHtml(room.name)} — Seating Plan</title>
<style>
  body { font-family: Arial, Helvetica, sans-serif; padding: 24px; color: #111; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  h2 { font-size: 14px; margin: 0 0 16px; font-weight: normal; color: #444; }
  table { border-collapse: collapse; margin-top: 16px; }
  td, th { border: 1px solid #999; padding: 6px 10px; text-align: center; font-size: 12px; min-width: 60px; }
  th { background: #f0f0f0; }
  .seat.filled { background: #eef4ff; font-weight: 600; }
  .seat.blocked { background: #eee; color: #999; }
  .meta { margin-top: 20px; font-size: 12px; }
  .footer { margin-top: 40px; display: flex; justify-content: space-between; font-size: 12px; }
</style>
</head><body>
  <h1>${escapeHtml(collegeName)}</h1>
  <h2>Examination Seating Plan — ${escapeHtml(examName)}</h2>
  <div class="meta">
    <strong>Room:</strong> ${escapeHtml(room.name)} &nbsp;|&nbsp;
    <strong>Date:</strong> ${escapeHtml(examDate)} &nbsp;|&nbsp;
    <strong>Total students:</strong> ${total}
    ${subjectsLine ? `<br/><strong>Subjects:</strong> ${subjectsLine}` : ''}
  </div>
  <table>${rowsHtml}</table>
  <div class="footer">
    <span>Invigilator: ${invigilatorLine}</span>
    <span>Signature: ______________________</span>
  </div>
</body></html>`;
}

export function printHtml(html: string): void {
  const win = window.open('', '_blank');
  if (!win) return;
  win.document.write(html);
  win.document.close();
  win.focus();
  win.print();
}
