/**
 * Writes the Excel import files into fixtures/:
 *   import-templates.xlsx   - the all-in-one template (Students / Teachers / Datesheet / Instructions)
 *   sample-import-data.xlsx - the same three sheets filled with realistic dummy data
 * Run: npx tsx scripts/generate-excel-templates.mts
 */
import { mkdir } from 'node:fs/promises';
import writeExcelFile from 'write-excel-file/node';
import { buildTemplateSheets, COLUMNS, SHEET_NAMES, type ImportKind } from '../apps/frontend/src/services/excelImport.ts';

await mkdir('fixtures', { recursive: true });
await writeExcelFile(buildTemplateSheets() as any).toFile('fixtures/import-templates.xlsx');

const branches = ['CSE', 'ECE', 'MECH'];
const first = ['Asha', 'Bilal', 'Chetan', 'Divya', 'Esha', 'Farhan', 'Gita', 'Hari'];
const last = ['Rao', 'Khan', 'Iyer', 'Menon', 'Kapoor', 'Ali', 'Nair', 'Shah'];
const students: (string | number)[][] = [];
for (const [bi, b] of branches.entries()) {
  for (let i = 1; i <= 8; i++) {
    students.push([`${b}24${String(i).padStart(3, '0')}`, `${first[i - 1]} ${last[(i + bi) % 8]}`, b, ((i - 1) % 4) + 1, i % 2 ? 'A' : 'B', ((i - 1) % 4) * 2 + 1, '2024']);
  }
}
const teachers = branches.flatMap((b, bi) => [1, 2].map((n) => [`${first[(bi * 2 + n) % 8]} ${last[(bi + n * 3) % 8]}`, b, `${b.toLowerCase()}.teacher${n}@college.edu`, `98765${bi}${n}0000`]));
const subjects: Record<string, string[]> = { CSE: ['Data Structures', 'Operating Systems'], ECE: ['Signals and Systems', 'Digital Electronics'], MECH: ['Thermodynamics', 'Fluid Mechanics'] };
const datesheet: (string | number)[][] = [];
for (const [bi, b] of branches.entries()) {
  for (const year of [1, 2]) {
    datesheet.push([year === 1 ? '2026-11-02' : '2026-11-03', '09:00', '10:30', b, year, subjects[b]![year - 1]!, `${b.slice(0, 2)}${year}0${bi + 1}`]);
  }
}

const data: Record<ImportKind, (string | number)[][]> = { students, teachers, datesheet };
const sheets = (['students', 'teachers', 'datesheet'] as ImportKind[]).map((k) => ({
  sheet: SHEET_NAMES[k],
  data: [COLUMNS[k].map((c) => ({ value: c.header + (c.required ? ' *' : ''), fontWeight: 'bold' })), ...data[k]],
}));
await writeExcelFile(sheets as any).toFile('fixtures/sample-import-data.xlsx');
console.log('wrote fixtures/import-templates.xlsx and fixtures/sample-import-data.xlsx');
