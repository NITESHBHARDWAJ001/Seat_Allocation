import { describe, expect, it } from 'vitest';
import type { AttendanceEntry, Exam, ExamAttendance } from '@exam-allocator/core';
import { generateAllocation } from '../engine.js';
import { compressRollRanges, formatRollRanges, nextRoll } from '../attendance/rollRanges.js';
import { buildSecrecyMemos } from '../attendance/memo.js';
import { baseRuleConfig, makeRegularRoom, makeStudent } from './helpers.js';

const rolls = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => String(from + i));

describe('roll ranges', () => {
  it('nextRoll keeps width, prefix and letter suffixes', () => {
    expect(nextRoll('2025301719')).toBe('2025301720');
    expect(nextRoll('CSE009')).toBe('CSE010');
    expect(nextRoll('8725199A')).toBe('8725199B');
    expect(nextRoll('8725199Z')).toBeNull();
  });

  it('joins consecutive rolls into one range', () => {
    expect(formatRollRanges(rolls(2025301701, 2025301720))).toBe('2025301701 – 2025301720');
  });

  it('breaks the range where a roll is missing, then continues from the next one (memo photo, LH9 row)', () => {
    const present = [...rolls(2025293206, 2025293224), '2025293226'];
    expect(formatRollRanges(present)).toBe('2025293206 – 2025293224, 2025293226');
  });

  it('an absentee splits a range in two', () => {
    const all = rolls(2025298803, 2025298824).filter((r) => r !== '2025298813');
    expect(formatRollRanges(all)).toBe('2025298803 – 2025298812, 2025298814 – 2025298824');
  });

  it('is order-independent, ignores duplicates and writes single rolls alone', () => {
    expect(formatRollRanges(['5', '3', '4', '3', '9'])).toBe('3 – 5, 9');
    expect(compressRollRanges(['5', '3', '4']).map((r) => r.count)).toEqual([3]);
  });

  it('handles alphanumeric suffix runs', () => {
    expect(formatRollRanges(['8725199C', '8725199A', '8725199B', '8725199E'])).toBe('8725199A – 8725199C, 8725199E');
  });
});

function setup() {
  const students = [
    ...Array.from({ length: 40 }, (_, i) => makeStudent({ id: `c${i}`, rollNumber: String(2025301701 + i), branch: 'CSE', year: 1, semester: 2 })),
    ...Array.from({ length: 25 }, (_, i) => makeStudent({ id: `e${i}`, rollNumber: String(2025293201 + i), branch: 'ECE', year: 1, semester: 2 })),
  ];
  const rooms = [makeRegularRoom('R1', 5, 6, 1), makeRegularRoom('R2', 5, 6, 2), makeRegularRoom('R3', 5, 6, 3)];
  const ruleConfig = { ...baseRuleConfig(), rollContinuity: { mode: 'strict' as const, priority: 'critical' as const } };
  const allocation = generateAllocation({ examId: 'x', students, rooms, ruleConfig, seed: 1 });
  const exam: Exam = {
    id: 'x',
    name: 'Sitting',
    date: '2026-05-12',
    startTime: '15:00',
    endTime: '16:15',
    studentIds: students.map((s) => s.id),
    roomIds: rooms.map((r) => r.id),
    ruleConfig,
    subjectAssignments: [
      { id: 'a', branch: 'CSE', year: 1, subjectName: 'Universal Human Values-II', subjectCode: 'B24-HSM-101A' },
      { id: 'b', branch: 'ECE', year: 1, subjectName: 'Biology', subjectCode: 'B24-BSC-106' },
    ],
    allocationIds: [allocation.id],
    activeAllocationId: allocation.id,
    dutyRosterIds: [],
    createdAt: '',
    updatedAt: '',
  };
  return { students, allocation, exam };
}

const entry = (rollNumber: string, mark: AttendanceEntry['mark'], extra: Partial<AttendanceEntry> = {}): AttendanceEntry => ({
  rollNumber,
  mark,
  markedAt: '2026-05-12T10:00:00Z',
  ...extra,
});

describe('secrecy memo', () => {
  it('makes one memo per branch + paper + semester with the right totals', () => {
    const { students, allocation, exam } = setup();
    const attendance: ExamAttendance = {
      id: 'att',
      examId: 'x',
      createdAt: '',
      updatedAt: '',
      entries: {
        '2025301705': entry('2025301705', 'absent'),
        '2025301710': entry('2025301710', 'umc', { reason: 'Mobile phone' }),
        '2025999999': entry('2025999999', 'stray', { branch: 'CSE', name: 'Walk-in' }),
        '2025293203': entry('2025293203', 'absent'),
      },
    };
    const memos = buildSecrecyMemos({ exam, students, allocation, attendance });
    expect(memos.map((m) => `${m.branch}/${m.subjectCode}/${m.semester}`)).toEqual(['CSE/B24-HSM-101A/2', 'ECE/B24-BSC-106/2']);

    const cse = memos[0]!;
    expect(cse.onRoll).toBe(40);
    expect(cse.answerBooks).toBe(38); // 40 - 1 absent - 1 umc
    expect(cse.candidates).toBe(38);
    expect(cse.absent.map((a) => a.rollNumber)).toEqual(['2025301705']);
    expect(cse.umc.map((a) => a.rollNumber)).toEqual(['2025301710']);
    expect(cse.stray.map((a) => a.rollNumber)).toEqual(['2025999999']);
    expect(cse.presentTotal).toBe(40); // 38 + 1 umc + 1 stray
    expect(cse.absentTotal).toBe(1);
    expect(cse.grandTotal).toBe(41);
    expect(cse.rooms.reduce((s, r) => s + r.count, 0)).toBe(38);
    // absentee and umc rolls never appear in a room row
    const joined = cse.rooms.map((r) => r.ranges).join(',');
    expect(joined).not.toContain('2025301705');
    expect(cse.unseated).toEqual([]);

    const ece = memos[1]!;
    expect(ece.answerBooks).toBe(24);
    expect(ece.absentTotal).toBe(1);
    expect(ece.grandTotal).toBe(25);
  });

  it('without any marks everyone is present and room ranges are contiguous runs', () => {
    const { students, allocation, exam } = setup();
    const memos = buildSecrecyMemos({ exam, students, allocation });
    const cse = memos.find((m) => m.branch === 'CSE')!;
    expect(cse.answerBooks).toBe(40);
    expect(cse.absentTotal).toBe(0);
    expect(cse.grandTotal).toBe(40);
    expect(cse.rooms.length).toBeGreaterThanOrEqual(1);
    // strict continuity keeps each room one unbroken roll range per branch
    for (const row of cse.rooms) expect(row.ranges.split(',').length).toBeLessThanOrEqual(3);
  });

  it('keeps separate memos when two branches share a paper code', () => {
    const { students, allocation, exam } = setup();
    exam.subjectAssignments = exam.subjectAssignments.map((a) => ({ ...a, subjectCode: 'SAME' }));
    const memos = buildSecrecyMemos({ exam, students, allocation });
    expect(memos).toHaveLength(2);
    expect(new Set(memos.map((m) => m.key)).size).toBe(2);
  });

  it('reports students that have no seat instead of dropping them silently', () => {
    const { students, exam } = setup();
    const memos = buildSecrecyMemos({ exam, students });
    expect(memos[0]!.unseated).toHaveLength(40);
    expect(memos[0]!.answerBooks).toBe(0);
  });
});
