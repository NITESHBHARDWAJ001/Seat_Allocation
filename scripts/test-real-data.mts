import readXlsx from 'read-excel-file/node';
import { readFileSync } from 'node:fs';
import { buildRegularRoom, defaultRuleConfig, compareRollNumbers, type Student, type RuleConfig } from '../packages/core/src/index.js';
import { generateAllocation, selectMinimalRooms } from '../packages/allocation-engine/src/index.js';

const mode = process.argv[2] ?? 'A';
const sheet = async (f: string) => ((await readXlsx(f)) as any)[0].data.slice(1) as any[][];
const students: Student[] = (await sheet('fixtures/real-data/students.xlsx')).map((r) => ({ id: 's' + r[0], rollNumber: String(r[0]), name: r[1], branch: r[2], year: r[3], section: r[4], active: true }) as Student);
const rooms = readFileSync('fixtures/real-data/rooms.txt', 'utf8').split(/\r?\n/).filter(Boolean).map((l) => {
  const [name, rows, cols, pr] = l.split(',').map((s) => s.trim());
  return buildRegularRoom({ id: name!, name: name!, rows: +rows!, seatsPerRow: +cols!, priority: +pr! });
});
console.log('students', students.length, 'rooms', rooms.length, 'seats', rooms.reduce((a, r) => a + r.seats.length, 0));
const ds = await sheet('fixtures/real-data/datesheet.xlsx');
const sessions = new Map<string, any[][]>();
for (const r of ds) (sessions.get(`${r[0]} ${r[1]}-${r[2]}`) ?? sessions.set(`${r[0]} ${r[1]}-${r[2]}`, []).get(`${r[0]} ${r[1]}-${r[2]}`)!).push(r);

const rc: RuleConfig = defaultRuleConfig();
rc.allocationMode = 'minimum-rooms'; rc.rollContinuity = { mode: 'strict', priority: 'critical' };
if (mode === 'B') rc.adjacencyRules.push({ enabled: true, attribute: 'year', horizontal: true, vertical: true, diagonal: false, mode: 'strict', priority: 'high' });
if (mode === 'C') { rc.adjacencyRules = [{ enabled: true, attribute: 'branch', horizontal: true, vertical: false, diagonal: false, mode: 'strict', priority: 'high' }]; }

for (const [key, papers] of sessions) {
  const groups = new Set(papers.map((p) => `${p[3]}|${p[4]}`));
  const sit = students.filter((s) => groups.has(`${s.branch}|${s.year}`));
  const sel = rooms;
  const t0 = Date.now();
  const res = generateAllocation({ examId: key, students: sit, rooms: sel, ruleConfig: rc, seed: 7 });
  const vr = res.validationReport;
  const failed = vr.hardConstraints.filter((h) => !h.passed).map((h) => JSON.stringify(h).slice(0, 230));
  const used = new Set(res.assignments.map((a) => res.roomSnapshot.find((r) => r.seats.some((s) => s.id === a.seatId))!.name));
  if (process.env.DETAIL) { const room = new Map(res.assignments.map((a) => [a.studentId, a.roomId])); const by = new Map<string, Student[]>(); for (const s of sit) (by.get(s.branch + s.year) ?? by.set(s.branch + s.year, []).get(s.branch + s.year)!).push(s); const parts: string[] = []; for (const [k, l] of by) { l.sort((a, b) => compareRollNumbers(a.rollNumber, b.rollNumber)); const seq = l.map((s) => room.get(s.id) ?? "-"); let ch = 0; for (let i = 1; i < seq.length; i++) if (seq[i] !== seq[i - 1]) ch++; const d = new Set(seq).size; parts.push(`${k}:${l.length}st/${d}rm/${ch}chg${ch > d - 1 ? "!!" : ""}`); } console.log("   ", parts.join("  ")); }
  console.log(`${key} | students ${sit.length} placed ${res.assignments.length} unplaced ${res.unallocatedStudentIds.length} | rooms ${[...used].join(',')} | hard ${vr.allHardConstraintsPassed ? 'PASS' : 'FAIL ' + failed.join(';')} | ${res.status} | ${Date.now() - t0}ms`);
}
