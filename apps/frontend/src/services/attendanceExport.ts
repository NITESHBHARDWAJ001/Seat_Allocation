import type { AllocationResult, ExamAttendance, Exam, InstitutionProfile, Student } from '../vendor/core/index.js';
import { normalizeRoll } from '../vendor/core/index.js';
import { resolveSubjectForGroup, type SecrecyMemo } from '../vendor/allocation-engine/index.js';
import writeExcelFile from 'write-excel-file/browser';
import { printHtml } from './exportService.js';

const esc = (v: unknown): string =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const ordinal = (n: number): string => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;

export function sessionLabel(startTime: string): string {
  const hour = Number(startTime.split(':')[0]);
  return hour < 12 ? 'Morning' : 'Evening';
}

/** "B. Tech 2nd Semester" style exam name; falls back to the branch when no semester is known. */
export function memoExamName(memo: SecrecyMemo): string {
  return memo.semester ? `B. Tech ${ordinal(memo.semester)} Semester` : `B. Tech Year ${memo.year}`;
}

// ------------------------------------------------------------------------------------------------ attendance sheet

export interface RoomSheet {
  roomName: string;
  rows: Array<{ seat: string; student: Student; subject: string; mark?: string }>;
}

/** Students of one room in seat order (row, then column), with their subject for this sitting. */
export function buildRoomSheets(exam: Exam, allocation: AllocationResult, students: Student[], attendance?: ExamAttendance): RoomSheet[] {
  const byId = new Map(students.map((s) => [s.id, s]));
  return allocation.roomSnapshot
    .map((room) => {
      const seatById = new Map(room.seats.map((s) => [s.id, s]));
      const rows = allocation.assignments
        .filter((a) => a.roomId === room.id)
        .map((a) => ({ a, seat: seatById.get(a.seatId), student: byId.get(a.studentId) }))
        .filter((x): x is { a: typeof x.a; seat: NonNullable<typeof x.seat>; student: Student } => !!x.seat && !!x.student)
        .sort((x, y) => x.seat.row - y.seat.row || x.seat.col - y.seat.col)
        .map(({ seat, student }) => {
          const subject = resolveSubjectForGroup(student.branch, student.year, exam.subjectAssignments);
          const entry = attendance?.entries[normalizeRoll(student.rollNumber)];
          return {
            seat: `R${seat.row}-C${seat.col}`,
            student,
            subject: subject ? `${subject.subjectName}${subject.subjectCode ? ` (${subject.subjectCode})` : ''}` : '',
            mark: entry ? (entry.mark === 'umc' ? 'UMC' : entry.mark === 'absent' ? 'ABSENT' : 'STRAY') : undefined,
          };
        });
      return { roomName: room.name, rows };
    })
    .filter((s) => s.rows.length > 0);
}

const SHEET_STYLE = `
  body { font-family: Arial, Helvetica, sans-serif; color: #111; margin: 0; }
  .page { padding: 22px 28px; page-break-after: always; }
  .page:last-child { page-break-after: auto; }
  h1 { font-size: 17px; margin: 0; text-align: center; }
  h2 { font-size: 13px; margin: 2px 0 10px; text-align: center; font-weight: normal; color: #444; }
  .meta { font-size: 12px; margin: 8px 0 10px; display: flex; flex-wrap: wrap; gap: 4px 22px; }
  table { border-collapse: collapse; width: 100%; }
  td, th { border: 1px solid #777; padding: 4px 6px; font-size: 11px; }
  th { background: #efefef; }
  .absent td { background: #fdecec; }
  .foot { margin-top: 26px; display: flex; justify-content: space-between; font-size: 12px; }
  @media print { .page { padding: 10mm 12mm; } }
`;

export function buildAttendanceSheetHtml(params: {
  institution: InstitutionProfile;
  exam: Exam;
  sheets: RoomSheet[];
  invigilatorsByRoom?: Record<string, string[]>;
  showMarks: boolean;
}): string {
  const { institution, exam, sheets, invigilatorsByRoom = {}, showMarks } = params;
  const pages = sheets
    .map((sheet) => {
      const absent = sheet.rows.filter((r) => r.mark === 'ABSENT').length;
      const body = sheet.rows
        .map((r, i) => {
          const status = showMarks && r.mark ? r.mark : '';
          return `<tr class="${showMarks && r.mark === 'ABSENT' ? 'absent' : ''}"><td>${i + 1}</td><td>${esc(r.seat)}</td><td>${esc(r.student.rollNumber)}</td><td style="text-align:left">${esc(r.student.name)}</td><td>${esc(r.student.branch)}</td><td style="text-align:left">${esc(r.subject)}</td><td>${esc(status)}</td><td style="width:22%"></td></tr>`;
        })
        .join('');
      return `<div class="page">
        <h1>${esc(institution.university)}</h1>
        <h2>${esc(institution.college)} — Attendance Sheet</h2>
        <div class="meta">
          <span><strong>Sitting:</strong> ${esc(exam.name)}</span>
          <span><strong>Date:</strong> ${esc(exam.date)}</span>
          <span><strong>Time:</strong> ${esc(exam.startTime)}–${esc(exam.endTime)}</span>
          <span><strong>Room:</strong> ${esc(sheet.roomName)}</span>
          <span><strong>Candidates:</strong> ${sheet.rows.length}${showMarks ? ` &nbsp; <strong>Absent:</strong> ${absent} &nbsp; <strong>Present:</strong> ${sheet.rows.length - absent}` : ''}</span>
        </div>
        <table><thead><tr><th>#</th><th>Seat</th><th>Roll No.</th><th>Name</th><th>Branch</th><th>Subject</th><th>${showMarks ? 'Status' : 'Answer book no.'}</th><th>Signature</th></tr></thead><tbody>${body}</tbody></table>
        <div class="foot"><span>Invigilator(s): ${esc((invigilatorsByRoom[sheet.roomName] ?? []).join(', ')) || '______________________'}</span><span>Signature: ______________________</span></div>
      </div>`;
    })
    .join('');
  return `<!doctype html><html><head><meta charset="utf-8"/><title>Attendance — ${esc(exam.name)}</title><style>${SHEET_STYLE}</style></head><body>${pages}</body></html>`;
}

export function printAttendanceSheets(params: Parameters<typeof buildAttendanceSheetHtml>[0]): void {
  printHtml(buildAttendanceSheetHtml(params));
}

export async function exportAttendanceXlsx(params: { institution: InstitutionProfile; exam: Exam; sheets: RoomSheet[]; showMarks: boolean }): Promise<void> {
  const { institution, exam, sheets, showMarks } = params;
  const head = { fontWeight: 'bold' as const, backgroundColor: '#E0E7FF' };
  const data = sheets.map((sheet) => ({
    sheet: sheet.roomName.slice(0, 31),
    data: [
      [{ value: institution.university, fontWeight: 'bold' as const, fontSize: 14 }],
      [{ value: `Attendance Sheet — ${exam.name}  |  Room ${sheet.roomName}  |  ${exam.date} ${exam.startTime}-${exam.endTime}` }],
      [],
      ['#', 'Seat', 'Roll No.', 'Name', 'Branch', 'Subject', showMarks ? 'Status' : 'Answer book no.', 'Signature'].map((v) => ({ value: v, ...head })),
      ...sheet.rows.map((r, i) => [i + 1, r.seat, r.student.rollNumber, r.student.name, r.student.branch, r.subject, showMarks ? r.mark ?? '' : '', '']),
    ],
    columns: [{ width: 5 }, { width: 10 }, { width: 16 }, { width: 28 }, { width: 10 }, { width: 34 }, { width: 16 }, { width: 22 }],
  }));
  await writeExcelFile(data as any).toFile(`attendance-${exam.date}-${exam.startTime.replace(':', '')}.xlsx`);
}

// ------------------------------------------------------------------------------------------------ memo

/** 2026-05-12 -> 12-05-2026, the way the university form writes dates. */
export function formatMemoDate(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : iso;
}

const MEMO_STYLE = `
  @page { size: A4; margin: 10mm; }
  body { font-family: "Times New Roman", Times, serif; color: #111; margin: 0; }
  .page { position: relative; padding: 14px 30px 10px; page-break-after: always; }
  .page:last-child { page-break-after: auto; }
  .formno { position: absolute; top: 4px; right: 34px; font-size: 12px; }
  .branch { position: absolute; top: 4px; left: 34px; font-size: 10px; color: #444; }
  .head { display: flex; align-items: center; justify-content: center; gap: 16px; margin-top: 20px; }
  .head img { width: 62px; height: 62px; object-fit: contain; }
  .head .logo-blank { width: 62px; height: 62px; }
  .head .txt { text-align: center; }
  .head .u { font-size: 16px; font-weight: bold; letter-spacing: .4px; }
  .head .t { font-size: 10px; }
  .head .m { font-size: 12.5px; font-weight: bold; margin-top: 3px; letter-spacing: .3px; }
  table.fields { width: 100%; border-collapse: collapse; margin: 14px 0 2px; font-size: 13px; }
  table.fields td { border: 0; padding: 1px 6px 1px 0; vertical-align: bottom; white-space: nowrap; }
  table.fields td.v { border-bottom: 1px solid #333; white-space: normal; width: 34%; padding-left: 8px; }
  table.fields td.l2 { padding-left: 26px; }
  .a-line { font-size: 12.5px; margin: 8px 0 8px; }
  table.rows { width: 100%; border-collapse: collapse; font-size: 12.5px; table-layout: fixed; }
  table.rows td, table.rows th { border: 1px solid #222; padding: 4px 8px; vertical-align: middle; }
  table.rows th.subh { border: 0; text-align: center; font-size: 12px; font-weight: bold; line-height: 1.25; width: 92px; padding-bottom: 3px; }
  table.rows td.room { width: 96px; font-weight: bold; white-space: nowrap; }
  table.rows td.sub { width: 92px; text-align: center; }
  table.rows td.tot { text-align: center; font-weight: bold; text-align: right; }
  table.rows td.totn { text-align: center; font-weight: bold; font-size: 16px; }
  .line { font-size: 13px; margin: 5px 0; line-height: 1.6; }
  .fill { border-bottom: 1px solid #333; padding: 0 6px; display: inline-block; min-width: 60px; }
  .fill.wide { min-width: 78%; }
  .certify { font-size: 13.5px; margin: 8px 0 0; line-height: 1.45; text-align: justify; }
  .bottom { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 34px; font-size: 13.5px; }
  .bottom .sig { text-align: left; line-height: 1.5; }
  .dots { border-top: 1px dotted #333; width: 300px; margin-bottom: 2px; }
  .note { margin-top: 26px; font-size: 10.5px; line-height: 1.35; }
  .note ol { margin: 2px 0 0 18px; padding: 0; }
  .copytag { font-size: 10px; color: #555; text-align: right; margin-top: 4px; }
`;

const COPY_NAMES = ['1st', '2nd', '3rd'];

export function buildMemoHtml(params: { institution: InstitutionProfile; memos: SecrecyMemo[]; copies?: number }): string {
  const { institution, memos, copies = 3 } = params;
  const pages: string[] = [];
  for (const memo of memos) {
    for (let copy = 1; copy <= copies; copy++) {
      const roomRows = memo.rooms.length
        ? memo.rooms.map((r) => `<tr><td class="room">R.No – ${esc(r.roomName)}</td><td>${esc(r.ranges)}</td><td class="sub">${r.count}</td></tr>`).join('')
        : '<tr><td class="room"></td><td style="color:#777">No answer books</td><td class="sub">0</td></tr>';
      const list = (entries: SecrecyMemo['absent'], withReason = false) =>
        entries.map((e) => esc(e.rollNumber) + (withReason && e.reason ? ` (${esc(e.reason)})` : '')).join(', ');
      const d = formatMemoDate(memo.date);
      const session = sessionLabel(memo.startTime);
      pages.push(`<div class="page">
        <div class="branch">Branch: ${esc(memo.branch)}</div>
        <div class="formno">Ec-2(8)</div>
        <div class="head">
          ${institution.logo ? `<img src="${esc(institution.logo)}" alt=""/>` : '<div class="logo-blank"></div>'}
          <div class="txt">
            <div class="u">${esc(institution.university.toUpperCase())}</div>
            <div class="t">${esc(institution.universityTagline ?? '')}</div>
            <div class="m">FORWARDING MEMO FOR SECRECY ANSWER-BOOK</div>
          </div>
          <div class="logo-blank"></div>
        </div>
        <table class="fields">
          <tr><td>Name of Exam.</td><td class="v">${esc(memoExamName(memo))}</td><td class="l2">Paper Code:</td><td class="v">${esc(memo.subjectCode)}</td></tr>
          <tr><td>Subject:</td><td class="v">${esc(memo.subjectName)}</td><td class="l2">Paper/ Option:</td><td class="v">${esc(memo.subjectCode)}</td></tr>
          <tr><td>Date:</td><td class="v">${esc(d)}</td><td class="l2">Session:</td><td class="v">${esc(session)}</td></tr>
        </table>
        <div class="a-line">(A)&nbsp; Fill the Roll Nos. of the candidates whose answer-book are sent herewith :-</div>
        <table class="rows">
          <colgroup><col style="width:104px"/><col/><col style="width:92px"/></colgroup>
          <thead><tr><th colspan="2" style="border:0"></th><th class="subh">Sub- Total<br/>(each Row)</th></tr></thead>
          <tbody>
            ${roomRows}
            <tr><td colspan="2" class="tot">Total Answer - Book =</td><td class="totn">${memo.answerBooks}</td></tr>
          </tbody>
        </table>
        <div class="line">(B)&nbsp; Total Nos. of the Candidates (filled in column (A)) <span class="fill" style="min-width:280px"><strong>${memo.candidates}</strong></span></div>
        <div class="line">(C)&nbsp; Roll Nos. of the Absentee <span class="fill" style="min-width:60%">${list(memo.absent)}</span></div>
        <div class="line"><span class="fill wide">&nbsp;</span></div>
        <div class="line">(D)&nbsp; Roll Nos. of Unfair Means Cases <span class="fill" style="min-width:62%">${list(memo.umc, true)}</span></div>
        <div class="line">(E)&nbsp; Roll Nos. of the Stray Cases <span class="fill" style="min-width:66%">${list(memo.stray)}</span></div>
        <div class="line">(F)&nbsp; <strong>Grand Total (A to E)</strong> <span class="fill" style="min-width:330px"><strong>${memo.presentTotal} (P) + ${String(memo.absentTotal).padStart(2, '0')} (A) = ${memo.grandTotal}</strong></span></div>
        <div class="certify">Certified that the Roll Nos. (in words &amp; figures) on the answer- books have been found correct according to the list of candidates received from the controller of Examination and there is no mistake nor any answer- book is missing.</div>
        <div class="bottom">
          <div>Date : ${esc(d)} (${esc(session.charAt(0))})</div>
          <div class="sig"><div class="dots"></div>Signature of Centre Supdt.<br/>Centre No. – <strong>${esc(institution.centreNo) || '______'}</strong><br/>College – <strong>${esc(institution.college) || '______'}</strong>${institution.superintendent ? `<br/>${esc(institution.superintendent)}` : ''}</div>
        </div>
        <div class="note"><strong>Note:</strong>
          <ol>
            <li>Roll Nos. (a) to (e) should tally with Answer–books/ Attendance Chart.</li>
            <li>In case any mistake is found by the Secrecy Branch for wrong entry, Centre superintendent will be responsible.</li>
            <li>There should be no over- writing. All cutting must be initialed by the Centre superintendent.</li>
            <li>Three copies of this memo should be prepared. Ist Copy is to be sent to the assistance Registrar (Secrecy) alongwith the packets of Answer- books. 2<sup>nd</sup> Copy is to be sent in the Superintendent's last packets and 3<sup>rd</sup> Copy is to be retained by the Centre Superintendent for future references.</li>
          </ol>
        </div>
        <div class="copytag">${COPY_NAMES[copy - 1] ?? `${copy}th`} copy</div>
      </div>`);
    }
  }
  return `<!doctype html><html><head><meta charset="utf-8"/><title>Forwarding memo</title><style>${MEMO_STYLE}</style></head><body>${pages.join('')}</body></html>`;
}

export function printMemos(params: Parameters<typeof buildMemoHtml>[0]): void {
  printHtml(buildMemoHtml(params));
}

export async function exportMemosXlsx(params: { institution: InstitutionProfile; memos: SecrecyMemo[]; filename?: string }): Promise<void> {
  const { institution, memos, filename = 'forwarding-memos.xlsx' } = params;
  const head = { fontWeight: 'bold' as const, backgroundColor: '#E0E7FF' };
  const used = new Set<string>();
  const sheets = memos.map((memo) => {
    let name = `${memo.branch}-${memo.subjectCode || memo.subjectName}`.replace(/[\\/?*[\]:]/g, '').slice(0, 28);
    while (used.has(name)) name = `${name.slice(0, 26)}_${used.size}`;
    used.add(name);
    return {
      sheet: name,
      data: [
        [{ value: institution.university, fontWeight: 'bold' as const, fontSize: 14 }],
        [{ value: 'FORWARDING MEMO FOR SECRECY ANSWER-BOOK', fontWeight: 'bold' as const }],
        [`Name of Exam: ${memoExamName(memo)}`, '', `Paper Code: ${memo.subjectCode}`],
        [`Subject: ${memo.subjectName}`, '', `Paper/ Option: ${memo.subjectCode}`],
        [`Date: ${formatMemoDate(memo.date)}`, '', `Session: ${sessionLabel(memo.startTime)}`],
        [`Branch: ${memo.branch}`],
        [],
        ['Room', 'Roll numbers', 'Sub-total'].map((v) => ({ value: v, ...head })),
        ...memo.rooms.map((r) => [`R.No – ${r.roomName}`, r.ranges, r.count]),
        ['', 'Total Answer-Book =', memo.answerBooks],
        [],
        ['(B) Total candidates', memo.candidates],
        ['(C) Absentees', memo.absent.map((e) => e.rollNumber).join(', ')],
        ['(D) Unfair means cases', memo.umc.map((e) => `${e.rollNumber}${e.reason ? ` (${e.reason})` : ''}`).join(', ')],
        ['(E) Stray cases', memo.stray.map((e) => e.rollNumber).join(', ')],
        ['(F) Grand total (A to E)', `${memo.presentTotal} (P) + ${memo.absentTotal} (A) = ${memo.grandTotal}`],
        [],
        [`Centre No. ${institution.centreNo}   College: ${institution.college}`],
      ],
      columns: [{ width: 28 }, { width: 90 }, { width: 12 }],
    };
  });
  await writeExcelFile(sheets as any).toFile(filename);
}
