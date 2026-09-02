#!/usr/bin/env node
/**
 * Bulk test-data generator for the Exam Room Allocator.
 *
 * Produces two files you can feed straight into the app's UI:
 *   - students.csv  -> paste into Students > Bulk Import
 *   - rooms.csv      -> paste into Rooms > Bulk Import
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
 *
 * Flags (all optional):
 *   --students <n>        total students to generate       (default 300)
 *   --branches <a,b,c>    branch codes                      (default CSE,ECE,MECH,CIVIL,IT)
 *   --years <n>           number of years, 1..n              (default 4)
 *   --sections <a,b>      section labels                     (default A,B)
 *   --rooms <n>           number of rooms                    (default 6)
 *   --rows <n>            rows per room                       (default 6)
 *   --seats-per-row <n>   seats per row                       (default 10)
 *   --seed <n>            PRNG seed, for reproducible names   (default 42)
 *   --out <dir>           output directory                    (default "fixtures")
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

  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'students.csv'), studentLines.join('\n') + '\n', 'utf-8');
  await writeFile(join(outDir, 'rooms.csv'), roomLines.join('\n') + '\n', 'utf-8');

  const totalSeats = roomCount * rows * seatsPerRow;
  console.log(`Generated ${globalIndex} students across ${branches.length} branches -> ${join(outDir, 'students.csv')}`);
  console.log(`Generated ${roomCount} rooms (${totalSeats} seats total) -> ${join(outDir, 'rooms.csv')}`);
  console.log('');
  console.log('Next steps:');
  console.log('  1. npm run dev:web');
  console.log('  2. Students page -> Bulk Import -> paste students.csv -> Import');
  console.log('  3. Rooms page -> Bulk Import -> paste rooms.csv -> Import');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
