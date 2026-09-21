import readXlsxFile from 'read-excel-file/universal';
import writeExcelFile from 'write-excel-file/browser';

/**
 * Excel (.xlsx) import for Students, Teachers and Datesheet.
 *
 * One all-in-one template workbook has three sheets ("Students", "Teachers",
 * "Datesheet") whose header rows are the single source of truth for the
 * column names. Each import reads the sheet matching its own name (falling
 * back to the first sheet), so the same file - or a single-sheet file with
 * the same headers - works on any of the three pages.
 */

export type ImportKind = 'students' | 'teachers' | 'datesheet';

type ColumnType = 'text' | 'number' | 'date' | 'time';

export interface ColumnSpec {
  key: string;
  header: string;
  /** Extra accepted header spellings (matched ignoring case, spaces and punctuation). */
  aliases: string[];
  required: boolean;
  type: ColumnType;
  example: (string | number)[]; // one example value per sample row
}

export const SHEET_NAMES: Record<ImportKind, string> = {
  students: 'Students',
  teachers: 'Teachers',
  datesheet: 'Datesheet',
};

export const COLUMNS: Record<ImportKind, ColumnSpec[]> = {
  students: [
    { key: 'rollNumber', header: 'Roll Number', aliases: ['roll', 'rollno', 'rollnum', 'roll no'], required: true, type: 'text', example: ['CSE24001', 'CSE24002', 'ECE24001'] },
    { key: 'name', header: 'Name', aliases: ['studentname', 'fullname'], required: true, type: 'text', example: ['Asha Rao', 'Bilal Khan', 'Divya Menon'] },
    { key: 'branch', header: 'Branch', aliases: ['department', 'dept', 'stream'], required: true, type: 'text', example: ['CSE', 'CSE', 'ECE'] },
    { key: 'year', header: 'Year', aliases: ['yr', 'studyyear'], required: true, type: 'number', example: [2, 2, 3] },
    { key: 'section', header: 'Section', aliases: ['sec', 'div', 'division'], required: true, type: 'text', example: ['A', 'B', 'A'] },
    { key: 'semester', header: 'Semester', aliases: ['sem'], required: false, type: 'number', example: [3, 3, 5] },
    { key: 'batch', header: 'Batch', aliases: ['group'], required: false, type: 'text', example: ['2024', '2024', '2023'] },
  ],
  teachers: [
    { key: 'name', header: 'Name', aliases: ['teachername', 'facultyname', 'faculty'], required: true, type: 'text', example: ['Dr. Meera Iyer', 'Prof. Rahul Sharma', 'Ms. Kavya Nair'] },
    { key: 'branch', header: 'Branch', aliases: ['department', 'dept'], required: true, type: 'text', example: ['CSE', 'ECE', 'MECH'] },
    { key: 'email', header: 'Email', aliases: ['emailid', 'mail'], required: false, type: 'text', example: ['meera.iyer@college.edu', 'rahul.sharma@college.edu', ''] },
    { key: 'phone', header: 'Phone', aliases: ['mobile', 'contact', 'phoneno', 'mobileno'], required: false, type: 'text', example: ['9876543210', '', ''] },
  ],
  datesheet: [
    { key: 'date', header: 'Date', aliases: ['examdate'], required: true, type: 'date', example: ['2026-11-02', '2026-11-02', '2026-11-03'] },
    { key: 'startTime', header: 'Start Time', aliases: ['start', 'from', 'starttime', 'begintime'], required: true, type: 'time', example: ['09:00', '09:00', '14:00'] },
    { key: 'endTime', header: 'End Time', aliases: ['end', 'to', 'endtime', 'finishtime'], required: true, type: 'time', example: ['10:30', '10:30', '15:30'] },
    { key: 'branch', header: 'Branch', aliases: ['department', 'dept'], required: true, type: 'text', example: ['CSE', 'ECE', 'CSE'] },
    { key: 'year', header: 'Year', aliases: ['yr', 'studyyear'], required: true, type: 'number', example: [2, 2, 3] },
    { key: 'subjectName', header: 'Subject Name', aliases: ['subject', 'paper', 'papername', 'course'], required: true, type: 'text', example: ['Data Structures', 'Signals and Systems', 'Database Systems'] },
    { key: 'subjectCode', header: 'Subject Code', aliases: ['code', 'papercode', 'coursecode'], required: false, type: 'text', example: ['CS201', 'EC201', 'CS301'] },
  ],
};

export type SheetCell = string | number | boolean | Date | null | undefined;
export interface RawSheet {
  sheet: string;
  data: SheetCell[][];
}

export interface ParsedTable {
  /** One record per non-empty data row, keyed by ColumnSpec.key, values already normalized to strings. */
  records: Array<{ rowNumber: number; values: Record<string, string> }>;
  errors: string[];
  sheetName: string;
}

const norm = (s: unknown): string => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

const pad = (n: number): string => String(n).padStart(2, '0');

/** Builds YYYY-MM-DD only if it is a real calendar date (rejects 2026-13-40, 31-02-2026, ...). */
function isoIfRealDate(y: number, m: number, d: number): string | null {
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

function isEmptyCell(cell: SheetCell): boolean {
  return cell === null || cell === undefined || (typeof cell === 'string' && cell.trim() === '');
}

function normalizeDate(cell: SheetCell): string | null {
  if (cell instanceof Date) {
    if (Number.isNaN(cell.getTime())) return null;
    return `${cell.getUTCFullYear()}-${pad(cell.getUTCMonth() + 1)}-${pad(cell.getUTCDate())}`;
  }
  if (typeof cell === 'number') {
    // Raw Excel serial date (days since 1899-12-30).
    if (cell < 1 || cell > 2958465) return null;
    const d = new Date(Math.round((cell - 25569) * 86400 * 1000));
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }
  const s = String(cell ?? '').trim();
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(s);
  if (m) return isoIfRealDate(Number(m[1]), Number(m[2]), Number(m[3]));
  // Day-first (DD-MM-YYYY / DD/MM/YYYY), matching the Indian convention.
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(s);
  if (m) return isoIfRealDate(Number(m[3]), Number(m[2]), Number(m[1]));
  return null;
}

function normalizeTime(cell: SheetCell): string | null {
  if (cell instanceof Date) {
    if (Number.isNaN(cell.getTime())) return null;
    return `${pad(cell.getUTCHours())}:${pad(cell.getUTCMinutes())}`;
  }
  if (typeof cell === 'number') {
    // Excel stores times as a fraction of a day (0.375 = 09:00).
    const fraction = cell - Math.floor(cell);
    const totalMinutes = Math.round(fraction * 24 * 60) % (24 * 60);
    return `${pad(Math.floor(totalMinutes / 60))}:${pad(totalMinutes % 60)}`;
  }
  const s = String(cell ?? '').trim();
  const m = /^(\d{1,2})(?:[:.](\d{2}))?(?::\d{2})?\s*([AaPp][Mm])?$/.exec(s);
  if (!m) return null;
  let hours = Number(m[1]);
  const minutes = Number(m[2] ?? '0');
  const meridiem = m[3]?.toLowerCase();
  if (meridiem === 'pm' && hours < 12) hours += 12;
  if (meridiem === 'am' && hours === 12) hours = 0;
  if (hours > 23 || minutes > 59) return null;
  return `${pad(hours)}:${pad(minutes)}`;
}

function normalizeNumber(cell: SheetCell): string | null {
  if (typeof cell === 'number') return Number.isFinite(cell) ? String(cell) : null;
  const m = /(\d+)/.exec(String(cell ?? ''));
  return m ? m[1]! : null;
}

function normalizeText(cell: SheetCell): string {
  if (cell instanceof Date) return cell.toISOString().slice(0, 10);
  return String(cell ?? '').trim();
}

/**
 * Pure parse of already-read sheets: locates the header row, maps columns by
 * header name (order-independent, case/space/punctuation-insensitive, with
 * aliases), normalizes dates/times/numbers, and reports row-level problems
 * using real Excel row numbers.
 */
export function parseTable(sheets: RawSheet[], kind: ImportKind): ParsedTable {
  const specs = COLUMNS[kind];
  const wanted = SHEET_NAMES[kind];
  const sheet = sheets.find((s) => norm(s.sheet) === norm(wanted)) ?? sheets[0];
  if (!sheet) return { records: [], errors: ['The workbook has no sheets.'], sheetName: '' };

  const requiredSpecs = specs.filter((s) => s.required);
  const matchColumns = (row: SheetCell[]): Map<string, number> => {
    const found = new Map<string, number>();
    row.forEach((cell, idx) => {
      const h = norm(cell);
      if (!h) return;
      const spec = specs.find((s) => !found.has(s.key) && (norm(s.header) === h || s.aliases.some((a) => norm(a) === h)));
      if (spec) found.set(spec.key, idx);
    });
    return found;
  };

  let headerRowIndex = -1;
  let columns = new Map<string, number>();
  for (let i = 0; i < Math.min(sheet.data.length, 20); i++) {
    const found = matchColumns(sheet.data[i] ?? []);
    if (requiredSpecs.every((s) => found.has(s.key))) {
      headerRowIndex = i;
      columns = found;
      break;
    }
  }

  if (headerRowIndex === -1) {
    const bestGuess = matchColumns(sheet.data[0] ?? []);
    const missing = requiredSpecs.filter((s) => !bestGuess.has(s.key)).map((s) => s.header);
    return {
      records: [],
      sheetName: sheet.sheet,
      errors: [
        `Could not find the required column headers in sheet "${sheet.sheet}". Missing: ${missing.join(', ')}. ` +
          `Expected headers: ${specs.map((s) => s.header + (s.required ? '*' : '')).join(', ')} (download the template to see the exact format).`,
      ],
    };
  }

  const records: ParsedTable['records'] = [];
  const errors: string[] = [];

  for (let i = headerRowIndex + 1; i < sheet.data.length; i++) {
    const row = sheet.data[i] ?? [];
    if (row.every(isEmptyCell)) continue;
    const rowNumber = i + 1;
    const values: Record<string, string> = {};
    let rowOk = true;

    for (const spec of specs) {
      const col = columns.get(spec.key);
      const cell = col === undefined ? undefined : row[col];
      if (isEmptyCell(cell)) {
        if (spec.required) {
          errors.push(`Row ${rowNumber}: "${spec.header}" is required.`);
          rowOk = false;
        }
        values[spec.key] = '';
        continue;
      }
      let normalized: string | null;
      switch (spec.type) {
        case 'date':
          normalized = normalizeDate(cell);
          break;
        case 'time':
          normalized = normalizeTime(cell);
          break;
        case 'number':
          normalized = normalizeNumber(cell);
          break;
        default:
          normalized = normalizeText(cell);
      }
      if (normalized === null) {
        errors.push(`Row ${rowNumber}: "${spec.header}" value "${String(cell)}" is not a valid ${spec.type}.`);
        rowOk = false;
        values[spec.key] = '';
      } else {
        values[spec.key] = normalized;
      }
    }
    if (rowOk) records.push({ rowNumber, values });
  }

  if (records.length === 0 && errors.length === 0) errors.push(`Sheet "${sheet.sheet}" has a header row but no data rows.`);
  return { records, errors, sheetName: sheet.sheet };
}

export async function readTable(file: File, kind: ImportKind): Promise<ParsedTable> {
  if (!/\.xlsx$/i.test(file.name)) {
    return { records: [], errors: ['Please choose an .xlsx Excel file (older .xls files must be re-saved as .xlsx).'], sheetName: '' };
  }
  try {
    const sheets = (await readXlsxFile(file)) as RawSheet[];
    return parseTable(sheets, kind);
  } catch (e) {
    return { records: [], errors: [`Could not read the Excel file: ${e instanceof Error ? e.message : String(e)}`], sheetName: '' };
  }
}

/** Builds the all-in-one template workbook: one sheet per import kind, headers + sample rows, plus an instructions sheet. */
export function buildTemplateSheets(): Array<{ data: any[][]; sheet: string; columns?: Array<{ width: number }> }> {
  const kinds: ImportKind[] = ['students', 'teachers', 'datesheet'];
  const sheets = kinds.map((kind) => {
    const specs = COLUMNS[kind];
    const header = specs.map((s) => ({ value: s.header + (s.required ? ' *' : ''), fontWeight: 'bold' as const, backgroundColor: '#E0E7FF' }));
    const rows = [0, 1, 2].map((r) => specs.map((s) => {
      const v = s.example[r];
      return v === '' || v === undefined ? null : v;
    }));
    return { data: [header, ...rows], sheet: SHEET_NAMES[kind], columns: specs.map((s) => ({ width: Math.max(14, s.header.length + 6) })) };
  });
  const notes: string[][] = [
    ['Exam Room Allocator - Excel import templates'],
    [''],
    ['Each sheet (Students, Teachers, Datesheet) is imported from its own page: Students page, Teachers page, Exams > Import Datesheet.'],
    ['Keep the header row exactly as shown (order of columns does not matter). Columns marked * are required.'],
    ['Delete the 3 example rows before importing your own data.'],
    [''],
    ['Formats:'],
    ['Date: YYYY-MM-DD (e.g. 2026-11-02) or DD-MM-YYYY, or a real Excel date cell.'],
    ['Start Time / End Time: 24-hour HH:MM (e.g. 09:00, 14:30) or 9:00 AM style, or a real Excel time cell.'],
    ['Year / Semester: a number (e.g. 3).'],
    ['Datesheet: one row per branch + year paper. Rows sharing the same Date + Start + End become one exam sitting.'],
  ];
  return [...sheets, { data: notes.map((r) => r.map((c) => (c === '' ? null : c))), sheet: 'Instructions', columns: [{ width: 110 }] }];
}

export async function downloadTemplate(): Promise<void> {
  await writeExcelFile(buildTemplateSheets() as any).toFile('Exam-Allocator-Import-Templates.xlsx');
}
