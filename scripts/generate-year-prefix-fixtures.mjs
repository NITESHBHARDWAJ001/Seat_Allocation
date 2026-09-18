#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const outDir = process.argv[2] ?? 'fixtures/year-prefix-150-students';
const branches = ['CSE', 'ECE', 'MECH'];
const yearPrefixes = { 1: '26', 2: '25', 3: '24', 4: '23' };
const firstNames = ['Asha', 'Bilal', 'Chetan', 'Divya', 'Esha', 'Farhan', 'Gita', 'Hari', 'Isha', 'Jatin'];
const lastNames = ['Rao', 'Khan', 'Iyer', 'Menon', 'Kapoor', 'Ali', 'Nair', 'Prasad', 'Verma', 'Shah'];
const students = [];
let globalIndex = 0;

for (const branch of branches) {
  for (let year = 1; year <= 4; year++) {
    const count = year <= 2 ? 13 : 12;
    for (let index = 1; index <= count; index++) {
      globalIndex++;
      const name = `${firstNames[(globalIndex - 1) % firstNames.length]} ${lastNames[(globalIndex - 1) % lastNames.length]}`;
      const rollNumber = `${yearPrefixes[year]}${branch}${String(index).padStart(3, '0')}`;
      students.push([rollNumber, name, branch, year, 'A'].join(', '));
    }
  }
}

const rooms = Array.from({ length: 5 }, (_, index) => `B${index + 1}, 6, 10, ${index + 1}`);
const teachers = Array.from({ length: 12 }, (_, index) => {
  const branch = branches[index % branches.length];
  const name = `${firstNames[index % firstNames.length]} ${lastNames[(index + 3) % lastNames.length]}`;
  const email = `${name.toLowerCase().replace(' ', '.')}@college.edu`;
  return `${name}, ${branch}, ${email}`;
});
const datesheet = [];
for (let index = 0; index < 12; index++) {
  const branch = branches[index % branches.length];
  const year = (index % 4) + 1;
  const day = String(1 + Math.floor(index / 2)).padStart(2, '0');
  const start = index % 2 === 0 ? '09:00' : '14:00';
  const end = index % 2 === 0 ? '12:00' : '17:00';
  datesheet.push(`2026-12-${day}, ${start}, ${end}, ${branch}, ${year}, ${branch} Subject ${year}, ${branch}${year}01`);
}

await mkdir(outDir, { recursive: true });
await writeFile(join(outDir, 'students.csv'), `${students.join('\n')}\n`, 'utf8');
await writeFile(join(outDir, 'rooms.csv'), `${rooms.join('\n')}\n`, 'utf8');
await writeFile(join(outDir, 'teachers.csv'), `${teachers.join('\n')}\n`, 'utf8');
await writeFile(join(outDir, 'datesheet.csv'), `${datesheet.join('\n')}\n`, 'utf8');
console.log(`Generated ${students.length} students in ${outDir}`);
console.log('Year prefixes: Year 1 = 26, Year 2 = 25, Year 3 = 24, Year 4 = 23');
