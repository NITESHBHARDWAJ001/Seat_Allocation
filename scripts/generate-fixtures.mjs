#!/usr/bin/env node
/**
 * Bulk test-data generator for the Exam Room Allocator.
 *
 * Produces four files you can feed straight into the app's UI:
 *   - students.csv   -> paste into Students > Bulk Import
 *   - rooms.csv       -> paste into Rooms > Bulk Import
 *   - teachers.csv    -> paste into Teachers > Bulk Import
 *   - datesheet.csv   -> paste into Exams > Import Datesheet
 *
 * Deliberately assigns a DIFFERENT roll-number format to each branch
 * (CSE24001 / ECE-24-001 / 24MECH001 / CIVIL-2024-001 / ...) so the
 * generated set exercises the app's natural roll-number sort and mixed
 * -format handling, not just a single tidy pattern.
 *
 * Usage:
 *   node scripts/generate-fixtures.mjs
 *   node scripts/generate-fixtures.mjs --students 1000 --rooms 20 --seats-per-row 12
 *   node scripts/generate-fixtures.mjs --branches CSE,ECE,IT --years 3 --out fixtures
 *   node scripts/generate-fixtures.mjs --teachers 25
 *   node scripts/generate-fixtures.mjs --datesheet-rows 100
 *
 * Flags (all optional):
 *   --students <n>              total students to generate       (default 300)
 *   --branches <a,b,c>          branch codes                      (default CSE,ECE,MECH,CIVIL,IT)
 *   --years <n>                 number of years, 1..n              (default 4)
 *   --sections <a,b>            section labels                     (default A,B)
 *   --rooms <n>                 number of rooms                    (default 6)
 *   --rows <n>                  rows per room                       (default 6)
 *   --seats-per-row <n>         seats per row                       (default 10)
 *   --teachers <n>              total teachers to generate          (default 20)
 *   --datesheet-rows <n>        total datesheet rows to generate    (default 100)
 *   --datesheet-sessions-per-day <n>  exam sessions per day, 1-3     (default 2)
 *   --datesheet-start <date>    first exam date, YYYY-MM-DD          (default 2026-11-01)
 *   --seed <n>                  PRNG seed, for reproducible names   (default 42)
 *   --out <dir>                 output directory                    (default "fixtures")
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

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST_NAMES = [
  'Asha', 'Bilal', 'Chetan', 'Divya', 'Esha', 'Farhan', 'Gita', 'Hari', 'Isha', 'Jatin',
  'Kavya', 'Lalit', 'Meera', 'Nikhil', 'Om', 'Priya', 'Qasim', 'Riya', 'Sahil', 'Tara',
  'Uday', 'Vidya', 'Waseem', 'Xena', 'Yash', 'Zara',
];
const LAST_NAMES = [
  'Rao', 'Khan', 'Iyer', 'Menon', 'Kapoor', 'Ali', 'Nair', 'Prasad', 'Verma', 'Shah',
  'Reddy', 'Kumar', 'Joshi', 'Gupta', 'Singh', 'Patel', 'Das', 'Bose', 'Pillai', 'Sharma',
];

// One distinct roll-number style per branch (cycled if there are more branches than styles),
// so the generated dataset always mixes formats — this is intentional, not a bug to "fix".
const ROLL_FORMATS = [
  (branch, i) => `${branch}24${String(i).padStart(3, '0')}`, // CSE24001
  (branch, i) => `${branch}-24-${String(i).padStart(3, '0')}`, // ECE-24-001
  (branch, i) => `24${branch}${String(i).padStart(3, '0')}`, // 24MECH001
  (branch, i) => `${branch}-2024-${String(i).padStart(3, '0')}`, // IT-2024-001
  (branch, i) => `${branch}/24/${String(i).padStart(3, '0')}`, // CIVIL/24/001
];

function csvEscape(value) {
  const s = String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

// Per-branch subject pools so the datesheet reads like a real exam schedule
// instead of "Subject 1, Subject 2, ...". Falls back to a generic pool for
// any branch code not in this list.
const SUBJECT_POOLS = {
  CSE: ['Data Structures', 'Operating Systems', 'Database Systems', 'Computer Networks', 'Software Engineering', 'Compiler Design', 'Artificial Intelligence', 'Machine Learning'],
  ECE: ['Signals and Systems', 'Digital Electronics', 'Microprocessors', 'Control Systems', 'VLSI Design', 'Communication Systems', 'Electromagnetic Theory', 'Embedded Systems'],
  MECH: ['Thermodynamics', 'Fluid Mechanics', 'Machine Design', 'Manufacturing Processes', 'Heat Transfer', 'Strength of Materials', 'Dynamics of Machinery', 'Automobile Engineering'],
  CIVIL: ['Structural Analysis', 'Geotechnical Engineering', 'Surveying', 'Concrete Technology', 'Transportation Engineering', 'Environmental Engineering', 'Hydraulics', 'Building Materials'],
  IT: ['Web Technologies', 'Data Mining', 'Cloud Computing', 'Cyber Security', 'Software Testing', 'Mobile App Development', 'Information Retrieval', 'Big Data Analytics'],
};
const GENERIC_SUBJECTS = ['Core Subject I', 'Core Subject II', 'Core Subject III', 'Core Subject IV', 'Elective I', 'Elective II', 'Elective III', 'Elective IV'];
const TIME_SLOTS = [
  ['09:00', '12:00'],
  ['14:00', '17:00'],
  ['18:00', '21:00'],
];

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

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const totalStudents = Number(args.students ?? 300);
  const branches = String(args.branches ?? 'CSE,ECE,MECH,CIVIL,IT')
    .split(',')
    .map((b) => b.trim())
    .filter(Boolean);
  const yearCount = Number(args.years ?? 4);
  const sections = String(args.sections ?? 'A,B')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const roomCount = Number(args.rooms ?? 6);
  const rows = Number(args.rows ?? 6);
  const seatsPerRow = Number(args['seats-per-row'] ?? 10);
  const teacherCount = Number(args.teachers ?? 20);
  const datesheetRowTarget = Number(args['datesheet-rows'] ?? 100);
  const sessionsPerDay = Math.min(3, Math.max(1, Number(args['datesheet-sessions-per-day'] ?? 2)));
  const datesheetStart = String(args['datesheet-start'] ?? '2026-11-01');
  const seed = Number(args.seed ?? 42);
  const outDir = String(args.out ?? 'fixtures');

  const rng = mulberry32(seed);
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];

  // Distribute students across branches as evenly as possible.
  const perBranch = Math.floor(totalStudents / branches.length);
  const remainder = totalStudents % branches.length;

  const studentLines = [];
  let globalIndex = 0;

  branches.forEach((branch, branchIdx) => {
    const count = perBranch + (branchIdx < remainder ? 1 : 0);
    const rollFormat = ROLL_FORMATS[branchIdx % ROLL_FORMATS.length];
    for (let i = 1; i <= count; i++) {
      globalIndex++;
      const year = ((i - 1) % yearCount) + 1;
      const section = sections[(i - 1) % sections.length];
      const name = `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
      const roll = rollFormat(branch, i);
      studentLines.push([roll, name, branch, year, section].map(csvEscape).join(', '));
    }
  });

  const roomLines = [];
  for (let i = 1; i <= roomCount; i++) {
    roomLines.push([`B${i}`, rows, seatsPerRow, 1].map(csvEscape).join(', '));
  }

  // Teachers are cycled across the same branches as the students (not a 1:1
  // mapping) so "avoid own-branch invigilation" has something real to bite on.
  const usedNames = new Set();
  const teacherLines = [];
  for (let i = 1; i <= teacherCount; i++) {
    const branch = branches[(i - 1) % branches.length];
    let first = pick(FIRST_NAMES);
    let last = pick(LAST_NAMES);
    let name = `${first} ${last}`;
    while (usedNames.has(name)) {
      first = pick(FIRST_NAMES);
      last = pick(LAST_NAMES);
      name = `${first} ${last}`;
    }
    usedNames.add(name);
    const email = `${first.toLowerCase()}.${last.toLowerCase()}@college.edu`;
    teacherLines.push([name, branch, email].map(csvEscape).join(', '));
  }

  // Datesheet: one row per (branch, year) per exam session, cycling each
  // branch's own subject pool so the same branch+year never repeats a
  // subject across sessions. Sessions fill up in full (every branch+year
  // pair sits together) until the requested row count is reached, so the
  // last session may be partial.
  const branchYearPairs = [];
  for (const branch of branches) {
    for (let year = 1; year <= yearCount; year++) {
      branchYearPairs.push({ branch, year });
    }
  }
  const subjectIndexByBranch = new Map(branches.map((b) => [b, 0]));
  const datesheetLines = [];
  let dayOffset = 0;
  let sessionInDay = 0;
  while (datesheetLines.length < datesheetRowTarget) {
    const [startTime, endTime] = TIME_SLOTS[sessionInDay % TIME_SLOTS.length];
    const date = formatDate(datesheetStart, dayOffset);
    for (const { branch, year } of branchYearPairs) {
      if (datesheetLines.length >= datesheetRowTarget) break;
      const pool = subjectPoolFor(branch);
      const idx = subjectIndexByBranch.get(branch) ?? 0;
      const subjectName = pool[idx % pool.length];
      const subjectCode = `${branchCode(branch)}${year}${String(idx + 1).padStart(2, '0')}`;
      datesheetLines.push([date, startTime, endTime, branch, year, subjectName, subjectCode].map(csvEscape).join(', '));
      subjectIndexByBranch.set(branch, idx + 1);
    }
    sessionInDay++;
    if (sessionInDay >= sessionsPerDay) {
      sessionInDay = 0;
      dayOffset++;
    }
  }

  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'students.csv'), studentLines.join('\n') + '\n', 'utf-8');
  await writeFile(join(outDir, 'rooms.csv'), roomLines.join('\n') + '\n', 'utf-8');
  await writeFile(join(outDir, 'teachers.csv'), teacherLines.join('\n') + '\n', 'utf-8');
  await writeFile(join(outDir, 'datesheet.csv'), datesheetLines.join('\n') + '\n', 'utf-8');

  const totalSeats = roomCount * rows * seatsPerRow;
  const daysSpanned = dayOffset + 1;
  console.log(`Generated ${globalIndex} students across ${branches.length} branches -> ${join(outDir, 'students.csv')}`);
  console.log(`Generated ${roomCount} rooms (${totalSeats} seats total) -> ${join(outDir, 'rooms.csv')}`);
  console.log(`Generated ${teacherCount} teachers across ${branches.length} branches -> ${join(outDir, 'teachers.csv')}`);
  console.log(`Generated ${datesheetLines.length} datesheet rows across ${daysSpanned} day(s), ${sessionsPerDay} session(s)/day -> ${join(outDir, 'datesheet.csv')}`);
  console.log('');
  console.log('Next steps:');
  console.log('  1. npm run dev:web');
  console.log('  2. Students page -> Bulk Import -> paste students.csv -> Import');
  console.log('  3. Rooms page -> Bulk Import -> paste rooms.csv -> Import');
  console.log('  4. Teachers page -> Bulk Import -> paste teachers.csv -> Import');
  console.log('  5. Exams page -> Import Datesheet -> paste datesheet.csv -> Import');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
