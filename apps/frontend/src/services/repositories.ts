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
import { trackRepo } from './syncTracking.js';

/**
 * Single set of repository instances for the whole app. Swapping persistence
 * later (e.g. to a real backend) means changing only this file — no UI or
 * engine code depends on IndexedDB directly.
 *
 * `rawRepositories` are the plain IndexedDB repositories (used by the sync engine so applying data pulled from the
 * server is not itself recorded as a local change). The exported repositories below are what pages use: identical
 * methods, but writes are role-checked and recorded for the background sync when the app is signed in to a server.
 */
export const rawRepositories = {
  students: new IndexedDbStudentRepository(),
  rooms: new IndexedDbRoomRepository(),
  exams: new IndexedDbExamRepository(),
  allocations: new IndexedDbAllocationRepository(),
  settings: new IndexedDbSettingsRepository(),
  teachers: new IndexedDbTeacherRepository(),
  dutyRosters: new IndexedDbDutyRosterRepository(),
  attendance: new IndexedDbAttendanceRepository(),
};

export const studentRepository = trackRepo('students', rawRepositories.students);
export const roomRepository = trackRepo('rooms', rawRepositories.rooms);
export const examRepository = trackRepo('exams', rawRepositories.exams);
export const allocationRepository = trackRepo('allocations', rawRepositories.allocations);
export const settingsRepository = trackRepo('settings', rawRepositories.settings, 'settings');
export const teacherRepository = trackRepo('teachers', rawRepositories.teachers);
export const dutyRosterRepository = trackRepo('dutyRosters', rawRepositories.dutyRosters);
export const attendanceRepository = trackRepo('attendance', rawRepositories.attendance, 'attendance');
