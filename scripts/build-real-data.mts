/**
 * Converts the college's real files into the app's import format:
 *   fixtures/real-data/students.xlsx   (3rd + 7th sem lists, Students template headers)
 *   fixtures/real-data/datesheet.xlsx  (Sem III -> Year 2, Sem VII -> Year 4 rows of SESSIONAL DATE SHEET 28.9.xlsx)
 * Run: npx tsx scripts/build-real-data.mts
 */
import readXlsx from 'read-excel-file/node';
import writeExcelFile from 'write-excel-file/node';

const bold = (v: string) => ({ value: v, fontWeight: 'bold' as const, backgroundColor: '#E0E7FF' });
const BRANCH: Record<string, string> = { CE: 'CSE', CSE: 'CSE', AIML: 'AI&ML', 'AI&ML': 'AI&ML', CIVIL: 'CIVIL', EE: 'ELEC.', 'ELEC.': 'ELEC.', ECE: 'ECE', ME: 'ME' };

async function firstSheet(file: string) {
  const sheets: any = await readXlsx(file);
  return sheets[0].data as any[][];
}

// ---- students
const students: any[][] = [];
for (const f of ['B.TECH. - 3RD SEMESTER STUDENT LIST.xlsx', 'B.TECH. - 7TH SEMESTER STUDENT LIST-Table 4.xlsx']) {
  const rows = (await firstSheet(f)).map((r) => (r[0] == null && r[1] != null ? r.slice(1) : r));
  for (const r of rows.slice(1)) {
    if (r[0] == null) continue;
    students.push([String(r[0]), r[1], r[2], r[3], r[4] ?? 'A', r[5], String(r[6] ?? '')]);
  }
}
await writeExcelFile([{ sheet: 'Students', data: [['Roll Number *', 'Name *', 'Branch *', 'Year *', 'Section *', 'Semester', 'Batch'].map(bold), ...students], columns: [{ width: 16 }, { width: 28 }, { width: 10 }, { width: 6 }, { width: 8 }, { width: 10 }, { width: 8 }] }]).toFile('fixtures/real-data/students.xlsx');
console.log('students', students.length);

// ---- datesheet (linear "Sheet1" of the workbook)
const sheets: any = await readXlsx('SESSIONAL DATE SHEET 28.9.xlsx');
const lin: any[][] = sheets.find((s: any) => s.sheet === 'Sheet1').data;
const SEM_YEAR: Record<string, number> = { III: 2, VII: 4 };
let date = '', start = '', end = '', sem = '';
const out: any[][] = [];
const skipped: string[] = [];
const iso = (d: any) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10));
const hhmm = (h: string, m: string) => { let H = Number(h); if (H < 8) H += 12; return `${String(H).padStart(2, '0')}:${m}`; };
for (const r of lin) {
  const c0 = r[0] == null ? '' : String(r[0]);
  const ses = c0.match(/Session-.*\((\d+):(\d+)-(\d+):(\d+)\)/);
  if (ses) { start = hhmm(ses[1], ses[2]); end = hhmm(ses[3], ses[4]); continue; }
  if (c0 === 'Date') continue;
  if (r[0] != null && (r[0] instanceof Date || /^\d{4}-\d\d-\d\d/.test(c0))) date = iso(r[0]);
  if (r[1] != null && r[1] !== 'DATE SHEET') sem = String(r[1]).trim().split(/\s+/)[0];
  if (r[2] == null || r[4] == null) continue;
  const year = SEM_YEAR[sem];
  if (!year) continue;
  const branches = String(r[4]).replace(/\(.*?\)/g, '').split(/\+|,|&|\band\b/i).map((s) => s.trim().toUpperCase()).filter(Boolean);
  for (const b of branches) {
    const mapped = BRANCH[b];
    if (!mapped) { skipped.push(`${date} ${sem} ${r[2]} -> unknown branch "${b}"`); continue; }
    out.push([date, start, end, mapped, year, String(r[2]).trim(), String(r[3] ?? '').trim()]);
  }
}
await writeExcelFile([{ sheet: 'Datesheet', data: [['Date *', 'Start Time *', 'End Time *', 'Branch *', 'Year *', 'Subject Name *', 'Subject Code'].map(bold), ...out], columns: [{ width: 12 }, { width: 12 }, { width: 12 }, { width: 10 }, { width: 6 }, { width: 44 }, { width: 18 }] }]).toFile('fixtures/real-data/datesheet.xlsx');
console.log('datesheet rows', out.length, 'skipped', skipped);
const sessions = new Map<string, number>();
for (const r of out) sessions.set(`${r[0]} ${r[1]}-${r[2]}`, (sessions.get(`${r[0]} ${r[1]}-${r[2]}`) ?? 0) + 1);
console.log([...sessions].map(([k, v]) => `${k}: ${v} papers`).join('\n'));
