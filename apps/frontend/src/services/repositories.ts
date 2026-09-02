import {
  IndexedDbAllocationRepository,
  IndexedDbExamRepository,
  IndexedDbRoomRepository,
  IndexedDbSettingsRepository,
  IndexedDbStudentRepository,
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
