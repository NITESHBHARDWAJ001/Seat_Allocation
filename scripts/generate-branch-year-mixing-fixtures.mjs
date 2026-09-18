#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const outDir = process.argv[2] ?? 'fixtures/year-mixing-branch-120-students';
const branch = 'CSE';
const years = [
  { year: 3, prefix: '24', count: 60 },
  { year: 4, prefix: '23', count: 60 },
];
const firstNames = ['Asha', 'Bilal', 'Chetan', 'Divya', 'Esha', 'Farhan', 'Gita', 'Hari', 'Isha', 'Jatin'];
const lastNames = ['Rao', 'Khan', 'Iyer', 'Menon', 'Kapoor', 'Ali', 'Nair', 'Prasad', 'Verma', 'Shah'];
const students = [];
let index = 0;

for (const group of years) {
  for (let rollIndex = 1; rollIndex <= group.count; rollIndex++) {
    index++;
    const name = `${firstNames[(index - 1) % firstNames.length]} ${lastNames[(index - 1) % lastNames.length]}`;
    students.push(`${group.prefix}${branch}${String(rollIndex).padStart(3, '0')}, ${name}, ${branch}, ${group.year}, A`);
  }
}

const rooms = Array.from({ length: 3 }, (_, roomIndex) => `B${roomIndex + 1}, 6, 10, ${roomIndex + 1}`);
const teachers = Array.from({ length: 8 }, (_, teacherIndex) => {
  const name = `${firstNames[teacherIndex % firstNames.length]} ${lastNames[(teacherIndex + 2) % lastNames.length]}`;
  return `${name}, ${branch}, ${name.toLowerCase().replace(' ', '.')}@college.edu`;
});
const datesheet = [
  '2026-12-01, 09:00, 12:00, CSE, 3, Data Structures, CSE301',
  '2026-12-01, 14:00, 17:00, CSE, 4, Operating Systems, CSE401',
];

await mkdir(outDir, { recursive: true });
await writeFile(join(outDir, 'students.csv'), `${students.join('\n')}\n`, 'utf8');
await writeFile(join(outDir, 'rooms.csv'), `${rooms.join('\n')}\n`, 'utf8');
await writeFile(join(outDir, 'teachers.csv'), `${teachers.join('\n')}\n`, 'utf8');
await writeFile(join(outDir, 'datesheet.csv'), `${datesheet.join('\n')}\n`, 'utf8');
console.log(`Generated ${students.length} ${branch} students in ${outDir}`);
console.log('Year 3: 60 students with 24 prefix; Year 4: 60 students with 23 prefix');
