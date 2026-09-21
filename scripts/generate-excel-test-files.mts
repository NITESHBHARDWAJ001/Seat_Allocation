/**
 * Writes two Excel files for testing the Excel imports end to end:
 *   fixtures/test-import-valid.xlsx   - should import cleanly on all three pages
 *   fixtures/test-import-errors.xlsx  - every sheet deliberately broken; should import NOTHING and list the problems
 * Run: npx tsx scripts/generate-excel-test-files.mts
 */
import writeExcelFile from 'write-excel-file/node';

const bold = (v: string) => ({ value: v, fontWeight: 'bold' as const, backgroundColor: '#E0E7FF' });
const header = (cols: string[]) => cols.map(bold);
const note = (rows: string[]) => ({ sheet: 'Expected Results', data: rows.map((r) => [r === '' ? null : r]), columns: [{ width: 120 }] });

const branches = ['CSE', 'ECE', 'MECH'];
const first = ['Asha', 'Bilal', 'Chetan', 'Divya', 'Esha', 'Farhan', 'Gita', 'Hari', 'Isha', 'Jatin'];
const last = ['Rao', 'Khan', 'Iyer', 'Menon', 'Kapoor', 'Ali', 'Nair', 'Shah', 'Verma', 'Reddy'];

// ---------------------------------------------------------------- VALID FILE
const students: (string | number)[][] = [];
for (const [bi, b] of branches.entries()) {
  for (let year = 1; year <= 4; year++) {
    for (let n = 1; n <= 5; n++) {
      const yy = 25 - year; // year 1 -> 24, year 4 -> 21
      const roll = `${yy}${b}${String((year - 1) * 5 + n).padStart(3, '0')}`;
      students.push([roll, `${first[(n + bi) % 10]} ${last[(year + n) % 10]}`, b, year, n % 2 ? 'A' : 'B', year * 2 - 1, `20${yy}`]);
    }
  }
}

// Teachers: columns deliberately reordered and using alias headers (Dept / Faculty Name / Mobile / Email ID).
const teachers: (string | null)[][] = [];
for (let i = 0; i < 10; i++) {
  const b = branches[i % 3]!;
  const lastName = last[(i * 3) % 10]!;
  teachers.push([
    b,
    `${i % 2 ? 'Dr.' : 'Prof.'} ${first[i]} ${lastName}`,
    `98${String(70000000 + i * 1111).padStart(8, '0')}`,
    i % 4 === 3 ? null : `${first[i]!.toLowerCase()}.${lastName.toLowerCase()}@college.edu`,
  ]);
}

// Datesheet: alias headers (Exam Date / From / To / Dept / Yr / Subject / Code). Day 1 uses real Excel date cells + 24h
// text times, Day 2 uses DD-MM-YYYY text dates + "9:00 AM" style times. Shift 1 = years 3&4, shift 2 = years 1&2.
const subjects: Record<string, string[]> = {
  CSE: ['Data Structures', 'Operating Systems', 'Database Systems', 'Computer Networks'],
  ECE: ['Signals and Systems', 'Digital Electronics', 'Microprocessors', 'Control Systems'],
  MECH: ['Thermodynamics', 'Fluid Mechanics', 'Machine Design', 'Heat Transfer'],
};
const shifts = [
  { years: [3, 4], from: ['09:00', '9:00 AM'], to: ['10:30', '10:30 AM'] },
  { years: [1, 2], from: ['11:30', '11:30 AM'], to: ['13:00', '1:00 PM'] },
];
const datesheet: any[][] = [];
for (const day of [1, 2]) {
  for (const shift of shifts) {
    for (const [bi, b] of branches.entries()) {
      for (const year of shift.years) {
        const date = day === 1 ? { value: new Date(Date.UTC(2026, 10, 2)), type: Date, format: 'dd-mm-yyyy' } : '03-11-2026';
        datesheet.push([date, shift.from[day - 1], shift.to[day - 1], b, year, subjects[b]![(year - 1 + (day - 1) * 2) % 4], `${b.slice(0, 2)}${year}0${bi + day}`]);
      }
    }
  }
}

await writeExcelFile([
  { sheet: 'Students', data: [header(['Roll Number *', 'Name *', 'Branch *', 'Year *', 'Section *', 'Semester', 'Batch']), ...students] },
  { sheet: 'Teachers', data: [header(['Dept', 'Faculty Name', 'Mobile', 'Email ID']), ...teachers] },
  { sheet: 'Datesheet', data: [header(['Exam Date', 'From', 'To', 'Dept', 'Yr', 'Subject', 'Code']), ...datesheet] },
  note([
    'test-import-valid.xlsx - EXPECTED: every import succeeds.',
    '',
    'Students page -> Import Excel: "Imported 60 student(s) from Excel." (3 branches x 4 years x 5 students).',
    'Teachers page -> Import Excel: "Imported 10 teacher(s) from Excel." (columns are reordered and use alias headers Dept / Faculty Name / Mobile / Email ID; some teachers have no email).',
    'Exams > Import Datesheet -> Import Excel: "Created 4 exam(s) from 24 datesheet row(s)." Each exam has 30 students (3 branches x 2 years x 5).',
    '   2026-11-02 09:00-10:30 (Year 3+4), 2026-11-02 11:30-13:00 (Year 1+2), 2026-11-03 09:00-10:30 (Year 3+4), 2026-11-03 11:30-13:00 (Year 1+2).',
    '   Day 1 uses real Excel date cells; Day 2 uses DD-MM-YYYY text and "9:00 AM" style times - all must be read correctly.',
    '   Import Students FIRST so the datesheet exams find their students, and add a room or two (Rooms page) to see rooms auto-assigned.',
    '',
    'Import order for the whole flow: Students, Teachers, (Rooms), Datesheet. No warnings about missing students or conflicts are expected.',
  ]),
] as any).toFile('fixtures/test-import-valid.xlsx');

// --------------------------------------------------------------- ERRORS FILE
const badStudents: any[][] = [
  ['CSE24001', 'Asha Rao', 'CSE', 2, 'A', 3, '2024'],
  ['CSE24002', 'Bilal Khan', 'CSE', 2, 'B', 3, '2024'],
  [null, 'No Roll Number', 'CSE', 2, 'A', 3, '2024'], // Excel row 4: Roll Number missing
  ['ECE24001', 'Divya Menon', null, 3, 'A', 5, '2023'], // row 5: Branch missing
  ['ECE24002', 'Esha Kapoor', 'ECE', 'third', 'A', 5, '2023'], // row 6: Year not a number
  ['MECH24001', 'Farhan Ali', 'MECH', 1, null, 1, '2025'], // row 7: Section missing
  ['MECH24002', 'Gita Nair', 'MECH', 1, 'B', 1, '2025'],
];
const badTeachers: any[][] = [
  ['Prof. Asha Rao', 'CSE', 'asha@college.edu'],
  ['Dr. Bilal Khan', 'ECE', 'bilal@college.edu'],
]; // header names below are wrong on purpose
const badDatesheet: any[][] = [
  ['2026-11-02', '09:00', '10:30', 'CSE', 2, 'Data Structures', 'CS201'],
  ['31-02-2026', '09:00', '10:30', 'ECE', 2, 'Signals and Systems', 'EC201'], // row 3: impossible date
  ['2026-11-03', '25:99', '10:30', 'CSE', 3, 'Database Systems', 'CS301'], // row 4: impossible time
  ['2026-11-03', '09:00', '10:30', 'ECE', 3, null, 'EC301'], // row 5: Subject missing
  ['2026-11-04', '09:00', '10:30', 'CSE', 'abc', 'Networks', 'CS401'], // row 6: Year not a number
  ['2026-11-04', '09:00', null, 'MECH', 1, 'Thermodynamics', 'ME101'], // row 7: End Time missing
];

await writeExcelFile([
  { sheet: 'Students', data: [header(['Roll Number *', 'Name *', 'Branch *', 'Year *', 'Section *', 'Semester', 'Batch']), ...badStudents] },
  { sheet: 'Teachers', data: [header(['Person', 'Group', 'Contact Mail']), ...badTeachers] },
  { sheet: 'Datesheet', data: [header(['Date *', 'Start Time *', 'End Time *', 'Branch *', 'Year *', 'Subject Name *', 'Subject Code']), ...badDatesheet] },
  note([
    'test-import-errors.xlsx - EXPECTED: every import shows "Nothing was imported" with a list of problems and adds NOTHING.',
    '',
    'Students page: 4 errors -',
    '   Row 4: "Roll Number" is required.  Row 5: "Branch" is required.  Row 6: "Year" value "third" is not a valid number.  Row 7: "Section" is required.',
    'Teachers page: 1 error - the header names are wrong (Person / Group / Contact Mail), so it reports the missing required columns Name and Branch and shows the expected headers.',
    'Exams > Import Datesheet: 5 errors -',
    '   Row 3: "Date" value "31-02-2026" is not a valid date.  Row 4: "Start Time" value "25:99" is not a valid time.  Row 5: "Subject Name" is required.',
    '   Row 6: "Year" value "abc" is not a valid number.  Row 7: "End Time" is required.',
    '',
    'After each failed import, check the Students / Teachers / Exams lists are unchanged (all-or-nothing). Then fix the rows in Excel and re-import to see it succeed.',
  ]),
] as any).toFile('fixtures/test-import-errors.xlsx');

console.log('wrote fixtures/test-import-valid.xlsx and fixtures/test-import-errors.xlsx');
