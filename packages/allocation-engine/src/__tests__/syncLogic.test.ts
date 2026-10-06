import { describe, expect, it } from 'vitest';
import type { AttendanceEntry } from '@exam-allocator/core';
import { attendanceMarkId, batchChanges, diffAttendance, markSignature, mergePulledMarks, parseAttendanceMarkId, retryDelayMs, roleCanWrite } from '../sync/syncLogic.js';

const entry = (roll: string, mark: AttendanceEntry['mark'], markedAt: string, extra: Partial<AttendanceEntry> = {}): AttendanceEntry => ({ rollNumber: roll, mark, markedAt, ...extra });

describe('batchChanges', () => {
  it('keeps small changes together up to the item limit and preserves order', () => {
    const changes = Array.from({ length: 450 }, (_, i) => ({ entity: 'students', id: `s${i}`, data: { n: i } }));
    const batches = batchChanges(changes);
    expect(batches.map((b) => b.length)).toEqual([200, 200, 50]);
    expect(batches.flat().map((c) => c.id)).toEqual(changes.map((c) => c.id));
  });

  it('puts a heavy record (a big allocation) in a batch of its own', () => {
    const big = { entity: 'allocations', id: 'a1', data: { blob: 'x'.repeat(1_200_000) } };
    const small = (i: number) => ({ entity: 'exams', id: `e${i}`, data: { i } });
    const batches = batchChanges([small(1), small(2), big, small(3)]);
    expect(batches.map((b) => b.map((c) => c.id))).toEqual([['e1', 'e2'], ['a1'], ['e3']]);
  });

  it('splits by size, not only by count', () => {
    const chunk = (i: number) => ({ entity: 'allocations', id: `a${i}`, data: { blob: 'x'.repeat(400_000) } });
    const batches = batchChanges([chunk(1), chunk(2), chunk(3)]);
    expect(batches.map((b) => b.length)).toEqual([2, 1]);
  });

  it('returns no batches for no changes and handles deletes', () => {
    expect(batchChanges([])).toEqual([]);
    expect(batchChanges([{ entity: 'students', id: 's1', data: null }])).toHaveLength(1);
  });
});

describe('attendance sync rows', () => {
  it('round-trips a mark id', () => {
    expect(parseAttendanceMarkId(attendanceMarkId('exam_abc', '2025301701'))).toEqual({ examId: 'exam_abc', roll: '2025301701' });
    expect(parseAttendanceMarkId('nocolon')).toBeNull();
  });

  it('pushes only new or changed marks, and deletions of removed ones', () => {
    const a = entry('R1', 'absent', '2026-01-01T10:00:00Z');
    const b = entry('R2', 'umc', '2026-01-01T10:01:00Z', { reason: 'Mobile phone' });
    const first = diffAttendance('e1', { R1: a, R2: b }, {});
    expect(first.changes.map((c) => c.id)).toEqual(['e1:R1', 'e1:R2']);

    const again = diffAttendance('e1', { R1: a, R2: b }, first.nextSynced);
    expect(again.changes).toEqual([]);

    const b2 = { ...b, mark: 'absent' as const, markedAt: '2026-01-01T10:05:00Z' };
    const next = diffAttendance('e1', { R2: b2 }, first.nextSynced); // R1 removed (back to present), R2 changed
    expect(next.changes.map((c) => [c.id, c.data === null ? 'delete' : 'put'])).toEqual([
      ['e1:R2', 'put'],
      ['e1:R1', 'delete'],
    ]);
  });

  it('two people marking different rolls both survive a merge', () => {
    const mine = entry('R1', 'absent', '2026-01-01T10:00:00Z');
    const theirs = entry('R9', 'absent', '2026-01-01T10:00:30Z');
    const synced = { R1: markSignature(mine) };
    const merged = mergePulledMarks({ R1: mine }, synced, [{ roll: 'R9', entry: theirs }]);
    expect(Object.keys(merged.entries).sort()).toEqual(['R1', 'R9']);
    expect(merged.changed).toBe(1);
    // and the pulled mark is not pushed back
    expect(diffAttendance('e1', merged.entries, merged.synced).changes).toEqual([]);
  });

  it('keeps a newer, still-unsynced local mark over an older pulled one', () => {
    const local = entry('R1', 'umc', '2026-01-01T11:00:00Z', { reason: 'Copying' });
    const older = entry('R1', 'absent', '2026-01-01T10:00:00Z');
    const merged = mergePulledMarks({ R1: local }, {}, [{ roll: 'R1', entry: older }]);
    expect(merged.entries.R1!.mark).toBe('umc');
  });

  it('a pulled newer mark replaces an older synced local one', () => {
    const local = entry('R1', 'absent', '2026-01-01T10:00:00Z');
    const newer = entry('R1', 'umc', '2026-01-01T12:00:00Z', { reason: 'Copying' });
    const merged = mergePulledMarks({ R1: local }, { R1: markSignature(local) }, [{ roll: 'R1', entry: newer }]);
    expect(merged.entries.R1!.mark).toBe('umc');
  });

  it('a pulled deletion removes a synced mark but never an unsynced local one', () => {
    const synced = entry('R1', 'absent', '2026-01-01T10:00:00Z');
    expect(mergePulledMarks({ R1: synced }, { R1: markSignature(synced) }, [{ roll: 'R1', entry: null }]).entries).toEqual({});
    const fresh = entry('R2', 'absent', '2026-01-01T10:00:00Z');
    expect(mergePulledMarks({ R2: fresh }, {}, [{ roll: 'R2', entry: null }]).entries.R2).toBeDefined();
  });
});

describe('sync scheduling and roles', () => {
  it('backs off 1, 2, 5 then 10 minutes', () => {
    expect([1, 2, 3, 4, 9].map(retryDelayMs)).toEqual([60_000, 120_000, 300_000, 600_000, 600_000]);
  });

  it('mirrors the server role rules', () => {
    expect(roleCanWrite('org_admin', 'students')).toBe(true);
    expect(roleCanWrite('exam_cell', 'exams')).toBe(true);
    expect(roleCanWrite('attendance_marker', 'attendanceMark')).toBe(true);
    expect(roleCanWrite('attendance_marker', 'students')).toBe(false);
    expect(roleCanWrite('viewer', 'attendance')).toBe(false);
  });
});
