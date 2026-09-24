import {
  IndexedDbAllocationRepository,
  IndexedDbAttendanceRepository,
  IndexedDbDutyRosterRepository,
  IndexedDbExamRepository,
  IndexedDbRoomRepository,
  IndexedDbSettingsRepository,
  IndexedDbStudentRepository,
  IndexedDbTeacherRepository,
} from '../vendor/indexeddb-repositories/index.js';

/**
 * Single set of repository instances for the whole app. Swapping persistence
 * later (e.g. to a real backend) means changing only this file — no UI or
 * engine code depends on IndexedDB directly.
 */
export const studentRepository = new IndexedDbStudentRepository();
export const roomRepository = new IndexedDbRoomRepository();
export const examRepository = new IndexedDbExamRepository();
export const allocationRepository = new IndexedDbAllocationRepository();
export const settingsRepository = new IndexedDbSettingsRepository();
export const teacherRepository = new IndexedDbTeacherRepository();
export const dutyRosterRepository = new IndexedDbDutyRosterRepository();
export const attendanceRepository = new IndexedDbAttendanceRepository();
