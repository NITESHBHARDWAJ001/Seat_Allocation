import type { AllocationResult, Room, Student, SubjectAssignment } from '../vendor/core/index.js';
import { resolveSubjectForGroup, type LaneGroupLabel, type LaneSubjectLabel, type RoomLaneSubjects } from '../vendor/allocation-engine/index.js';
import writeExcelFile from 'write-excel-file/browser';

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
  /** Optional post-allocation row/column/seat subject labels; omitted = sheet unchanged. */
  laneSubjects?: RoomLaneSubjects;
}): string {
  const { collegeName, examName, examDate, room, students, assignments, invigilatorNames = [], subjectAssignments = [], laneSubjects } = params;
  const laneDirection = laneSubjects?.direction ?? 'none';
  const laneByIndex = new Map<number, LaneSubjectLabel>((laneSubjects?.lanes ?? []).map((l) => [l.index, l]));
  const groupText = (g: LaneGroupLabel): string => (g.subjectName ? `${g.subjectName}${g.subjectCode ? ` (${g.subjectCode})` : ''}` : `${g.branch}-Y${g.year}: no subject`);
  const laneText = (lane: LaneSubjectLabel | undefined): string =>
    !lane ? '' : lane.mixed ? 'Mixed: ' + lane.groups.map((g) => `${g.branch}-Y${g.year} ${groupText(g)}`).join(' / ') : groupText(lane.groups[0]!);
  const seatText = (label: LaneGroupLabel | undefined): string => (label ? groupText(label) : '');
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
          const sub = student && laneDirection === 'seat' ? `<div class="sub">${escapeHtml(seatText(laneSubjects!.seats[seat.id]))}</div>` : '';
          return `<td class="seat${student ? ' filled' : ''}">${student ? escapeHtml(student.rollNumber) : ''}${sub}</td>`;
        })
        .join('');
      const lanePrefix = laneDirection === 'row' ? `<th class="lane">${escapeHtml(laneText(laneByIndex.get(rowIndex)))}</th>` : '';
      return `<tr>${lanePrefix}<th>R${rowIndex}</th>${cells}</tr>`;
    })
    .join('');

  const maxCol = Math.max(1, ...room.seats.map((s) => s.col));
  const columnLaneRow =
    laneDirection === 'column'
      ? `<tr><th></th>${Array.from({ length: maxCol }, (_, i) => `<th class="lane">${escapeHtml(laneText(laneByIndex.get(i + 1)))}</th>`).join('')}</tr>`
      : '';

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

  // Legend at the bottom of the sheet: "Row 1 - Subject Name (Code)" / "Column 1 - ..." for
  // row/column separation, or one line per branch+year for per-seat separation - so the
  // subject for each lane is spelled out once, clearly, in addition to the inline in-grid label.
  const legendLabel = laneDirection === 'row' ? 'Row' : laneDirection === 'column' ? 'Column' : '';
  const legendRows =
    laneDirection === 'seat'
      ? [...new Map(Object.values(laneSubjects!.seats).map((g) => [g.groupKey, g])).values()]
          .sort((a, b) => a.branch.localeCompare(b.branch) || a.year - b.year)
          .map((g) => `<tr><td>${escapeHtml(g.branch)}-Y${g.year}</td><td>${escapeHtml(groupText(g))}</td></tr>`)
          .join('')
      : (laneSubjects?.lanes ?? [])
          .map(
            (lane) =>
              `<tr><td>${legendLabel} ${lane.index}</td><td>${lane.mixed ? escapeHtml('Mixed: ' + lane.groups.map((g) => `${g.branch}-Y${g.year} ${groupText(g)}`).join(' / ')) : escapeHtml(groupText(lane.groups[0]!))}</td></tr>`
          )
          .join('');
  const legendHtml =
    laneDirection === 'none'
      ? ''
      : `<table class="legend">
           <tr><th>${laneDirection === 'seat' ? 'Group' : legendLabel}</th><th>Subject</th></tr>
           ${legendRows}
         </table>`;

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
  th.lane { background: #fff8e1; font-weight: normal; font-size: 11px; max-width: 140px; }
  .sub { font-size: 9px; font-weight: normal; color: #555; }
  table.legend { margin-top: 20px; }
  table.legend th, table.legend td { min-width: 0; text-align: left; padding: 4px 10px; }
  table.legend th { font-size: 11px; }
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
  <table>${columnLaneRow}${rowsHtml}</table>
  ${legendHtml}
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

/**
 * The same room seating plan as buildPrintableRoomSheet, as a downloadable
 * .xlsx workbook instead of an HTML print page - a "Seating" sheet laid out
 * exactly like the seat grid (with the same row/column subject labels) plus
 * a "Legend" sheet spelling out each row/column's subject. Reads the
 * finished allocation only; does not affect seating in any way.
 */
export async function exportRoomSheetXlsx(params: {
  collegeName: string;
  examName: string;
  examDate: string;
  room: Room;
  students: Student[];
  assignments: AllocationResult['assignments'];
  invigilatorNames?: string[];
  subjectAssignments?: SubjectAssignment[];
  laneSubjects?: RoomLaneSubjects;
}): Promise<void> {
  const { collegeName, examName, examDate, room, students, assignments, invigilatorNames = [], subjectAssignments = [], laneSubjects } = params;
  const laneDirection = laneSubjects?.direction ?? 'none';
  const laneByIndex = new Map<number, LaneSubjectLabel>((laneSubjects?.lanes ?? []).map((l) => [l.index, l]));
  const groupText = (g: LaneGroupLabel): string => (g.subjectName ? `${g.subjectName}${g.subjectCode ? ` (${g.subjectCode})` : ''}` : `${g.branch}-Y${g.year}: no subject`);
  const laneText = (lane: LaneSubjectLabel | undefined): string =>
    !lane ? '' : lane.mixed ? 'Mixed: ' + lane.groups.map((g) => `${g.branch}-Y${g.year} ${groupText(g)}`).join(' / ') : groupText(lane.groups[0]!);
  const seatText = (label: LaneGroupLabel | undefined): string => (label ? groupText(label) : '');

  const studentsById = new Map(students.map((s) => [s.id, s]));
  const seatToStudent = new Map(assignments.filter((a) => a.roomId === room.id).map((a) => [a.seatId, studentsById.get(a.studentId)] as const));
  const rowsByIndex = new Map<number, typeof room.seats>();
  for (const seat of room.seats) {
    const list = rowsByIndex.get(seat.row) ?? [];
    list.push(seat);
    rowsByIndex.set(seat.row, list);
  }
  const sortedRows = [...rowsByIndex.entries()].sort((a, b) => a[0] - b[0]);
  const maxCol = Math.max(1, ...room.seats.map((s) => s.col));

  const headerStyle = { fontWeight: 'bold' as const, backgroundColor: '#E0E7FF' };
  const laneStyle = { backgroundColor: '#FFF8E1', fontSize: 9 };
  const seatStyle = { backgroundColor: '#EEF4FF' };

  const sheetData: any[][] = [];
  sheetData.push([{ value: collegeName, fontWeight: 'bold', fontSize: 14 }]);
  sheetData.push([{ value: `Examination Seating Plan — ${examName}` }]);
  sheetData.push([{ value: `Room: ${room.name}   Date: ${examDate}   Total students: ${[...seatToStudent.values()].filter(Boolean).length}` }]);
  if (subjectAssignments.length > 0) {
    const branchYearsInRoom = new Set([...seatToStudent.values()].filter((s): s is Student => !!s).map((s) => `${s.branch}|${s.year}`));
    const subjectsInRoom = subjectAssignments.filter((a) => branchYearsInRoom.has(`${a.branch}|${a.year}`));
    if (subjectsInRoom.length > 0) sheetData.push([{ value: `Subjects: ${subjectsInRoom.map((s) => `${s.branch}-Y${s.year}: ${s.subjectName}`).join(' | ')}` }]);
  }
  sheetData.push([]);

  if (laneDirection === 'column') {
    sheetData.push([null, ...Array.from({ length: maxCol }, (_, i) => ({ value: laneText(laneByIndex.get(i + 1)), ...laneStyle }))]);
  }
  sheetData.push([{ value: '', ...headerStyle }, ...Array.from({ length: maxCol }, (_, i) => ({ value: `C${i + 1}`, ...headerStyle }))]);

  for (const [rowIndex, seats] of sortedRows) {
    const byCol = new Map(seats.map((s) => [s.col, s]));
    const row: any[] = [];
    if (laneDirection === 'row') row.push({ value: laneText(laneByIndex.get(rowIndex)), ...laneStyle });
    row.push({ value: `R${rowIndex}`, ...headerStyle });
    for (let c = 1; c <= maxCol; c++) {
      const seat = byCol.get(c);
      if (!seat) {
        row.push(null);
        continue;
      }
      if (seat.blocked) {
        row.push({ value: '×', backgroundColor: '#EEEEEE', color: '#999999' });
        continue;
      }
      const student = seatToStudent.get(seat.id);
      if (!student) {
        row.push(null);
        continue;
      }
      const sub = laneDirection === 'seat' ? ` (${seatText(laneSubjects!.seats[seat.id])})` : '';
      row.push({ value: `${student.rollNumber}${sub}`, ...seatStyle });
    }
    sheetData.push(row);
  }

  sheetData.push([]);
  sheetData.push([{ value: `Invigilator: ${invigilatorNames.length > 0 ? invigilatorNames.join(', ') : '______________________'}` }]);
  sheetData.push([{ value: 'Signature: ______________________' }]);

  const sheets: any[] = [{ sheet: room.name, data: sheetData }];

  if (laneDirection !== 'none') {
    const legendLabel = laneDirection === 'row' ? 'Row' : laneDirection === 'column' ? 'Column' : 'Group';
    const legendRows: any[][] =
      laneDirection === 'seat'
        ? [...new Map(Object.values(laneSubjects!.seats).map((g) => [g.groupKey, g])).values()]
            .sort((a, b) => a.branch.localeCompare(b.branch) || a.year - b.year)
            .map((g) => [`${g.branch}-Y${g.year}`, groupText(g)])
        : (laneSubjects?.lanes ?? []).map((lane) => [
            `${legendLabel} ${lane.index}`,
            lane.mixed ? 'Mixed: ' + lane.groups.map((g) => `${g.branch}-Y${g.year} ${groupText(g)}`).join(' / ') : groupText(lane.groups[0]!),
          ]);
    sheets.push({ sheet: 'Legend', data: [[{ value: legendLabel, ...headerStyle }, { value: 'Subject', ...headerStyle }], ...legendRows] });
  }

  const safeName = `${examName}_${room.name}`.replace(/[^a-z0-9]+/gi, '_');
  await writeExcelFile(sheets as any).toFile(`${safeName}_seating.xlsx`);
}
