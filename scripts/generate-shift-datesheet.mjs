#!/usr/bin/env node
/**
 * Generates a "combined shift" demo datesheet for testing the Sitting Plan
 * Manager's ability to seat two different years together in one exam
 * session (as opposed to generate-fixtures.mjs's datesheet, which spreads
 * every year across the same session uniformly).
 *
 * Each day has two shifts:
 *   Shift 1 (default 09:00-10:30): the "senior" year group (default 3,4)
 *   Shift 2 (default 11:30-13:00): the "junior" year group (default 1,2)
 * Both shifts are 1.5 hours by default. Every branch gets one subject row
 * per year per shift, so a shift's exam ends up with both years' students
 * combined into a single sitting.
 *
 * Usage:
 *   node scripts/generate-shift-datesheet.mjs
 *   node scripts/generate-shift-datesheet.mjs --days 3 --start 2026-11-01
 *   node scripts/generate-shift-datesheet.mjs --shift1-years 3,4 --shift2-years 1,2 \
 *     --shift1-times 09:00-10:30 --shift2-times 11:30-13:00
 *
 * Flags (all optional):
 *   --days <n>            number of exam days                (default 3)
 *   --start <date>        first exam date, YYYY-MM-DD          (default 2026-11-01)
 *   --branches <a,b,c>    branch codes                         (default CSE,ECE,MECH,CIVIL,IT)
 *   --shift1-years <a,b>  years combined into shift 1           (default 3,4)
 *   --shift2-years <a,b>  years combined into shift 2           (default 1,2)
 *   --shift1-times <s-e>  shift 1 start-end, HH:MM-HH:MM        (default 09:00-10:30)
 *   --shift2-times <s-e>  shift 2 start-end, HH:MM-HH:MM        (default 11:30-13:00)
 *   --out <dir>           output directory                     (default "fixtures")
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) {
        args[key] = true;
      } else {
        args[key] = next;
        i++;
      }
    }
  }
  return args;
}

function csvEscape(value) {
  const s = String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

const SUBJECT_POOLS = {
  CSE: ['Data Structures', 'Operating Systems', 'Database Systems', 'Computer Networks', 'Software Engineering', 'Compiler Design', 'Artificial Intelligence', 'Machine Learning'],
  ECE: ['Signals and Systems', 'Digital Electronics', 'Microprocessors', 'Control Systems', 'VLSI Design', 'Communication Systems', 'Electromagnetic Theory', 'Embedded Systems'],
  MECH: ['Thermodynamics', 'Fluid Mechanics', 'Machine Design', 'Manufacturing Processes', 'Heat Transfer', 'Strength of Materials', 'Dynamics of Machinery', 'Automobile Engineering'],
  CIVIL: ['Structural Analysis', 'Geotechnical Engineering', 'Surveying', 'Concrete Technology', 'Transportation Engineering', 'Environmental Engineering', 'Hydraulics', 'Building Materials'],
  IT: ['Web Technologies', 'Data Mining', 'Cloud Computing', 'Cyber Security', 'Software Testing', 'Mobile App Development', 'Information Retrieval', 'Big Data Analytics'],
};
const GENERIC_SUBJECTS = ['Core Subject I', 'Core Subject II', 'Core Subject III', 'Core Subject IV', 'Elective I', 'Elective II', 'Elective III', 'Elective IV'];

function subjectPoolFor(branch) {
  return SUBJECT_POOLS[branch.toUpperCase()] ?? GENERIC_SUBJECTS;
}

function branchCode(branch) {
  return branch.slice(0, 2).toUpperCase();
}

function formatDate(base, offsetDays) {
  const d = new Date(base);
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

function parseYears(spec) {
  return spec.split(',').map((y) => Number(y.trim())).filter((y) => Number.isFinite(y));
}

function parseTimes(spec) {
  const [start, end] = spec.split('-').map((t) => t.trim());
  if (!start || !end) throw new Error(`Invalid time range "${spec}", expected "HH:MM-HH:MM"`);
  return [start, end];
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const days = Number(args.days ?? 3);
  const start = String(args.start ?? '2026-11-01');
  const branches = String(args.branches ?? 'CSE,ECE,MECH,CIVIL,IT')
    .split(',')
    .map((b) => b.trim())
    .filter(Boolean);
  const shift1Years = parseYears(String(args['shift1-years'] ?? '3,4'));
  const shift2Years = parseYears(String(args['shift2-years'] ?? '1,2'));
  const [shift1Start, shift1End] = parseTimes(String(args['shift1-times'] ?? '09:00-10:30'));
  const [shift2Start, shift2End] = parseTimes(String(args['shift2-times'] ?? '11:30-13:00'));
  const outDir = String(args.out ?? 'fixtures');

  const shifts = [
    { start: shift1Start, end: shift1End, years: shift1Years, label: `Shift 1 (Year ${shift1Years.join(' & ')})` },
    { start: shift2Start, end: shift2End, years: shift2Years, label: `Shift 2 (Year ${shift2Years.join(' & ')})` },
  ];

  const subjectIndexByBranch = new Map(branches.map((b) => [b, 0]));
  const lines = [];

  for (let day = 0; day < days; day++) {
    const date = formatDate(start, day);
    for (const shift of shifts) {
      for (const branch of branches) {
        const pool = subjectPoolFor(branch);
        for (const year of shift.years) {
          const idx = subjectIndexByBranch.get(branch) ?? 0;
          const subjectName = pool[idx % pool.length];
          const subjectCode = `${branchCode(branch)}${year}${String(idx + 1).padStart(2, '0')}`;
          lines.push([date, shift.start, shift.end, branch, year, subjectName, subjectCode].map(csvEscape).join(', '));
          subjectIndexByBranch.set(branch, idx + 1);
        }
      }
    }
  }

  await mkdir(outDir, { recursive: true });
  const outFile = join(outDir, 'shift-datesheet.csv');
  await writeFile(outFile, lines.join('\n') + '\n', 'utf-8');

  const durationMinutes = (hhmm) => {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
  };
  const shift1Minutes = durationMinutes(shift1End) - durationMinutes(shift1Start);
  const shift2Minutes = durationMinutes(shift2End) - durationMinutes(shift2Start);

  console.log(`Generated ${lines.length} datesheet rows across ${days} day(s) -> ${outFile}`);
  console.log(`  Shift 1: ${shift1Start}-${shift1End} (${shift1Minutes} min) -> Year ${shift1Years.join(' & ')} combined`);
  console.log(`  Shift 2: ${shift2Start}-${shift2End} (${shift2Minutes} min) -> Year ${shift2Years.join(' & ')} combined`);
  console.log('');
  console.log('Next steps:');
  console.log('  1. Make sure Students covering these years/branches are already imported (fixtures/students.csv works).');
  console.log('  2. Rooms page -> Bulk Import -> paste fixtures/rooms.csv (or your own).');
  console.log('  3. Exams page -> Import Datesheet -> paste fixtures/shift-datesheet.csv -> Import.');
  console.log('  4. Open each created exam -> Generate Allocation -> confirm both years appear seated together.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
