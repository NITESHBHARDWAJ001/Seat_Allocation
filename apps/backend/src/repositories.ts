import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import {
  MemoryAllocationRepository,
  MemoryDutyRosterRepository,
  MemoryExamRepository,
  MemoryRoomRepository,
  MemorySettingsRepository,
  MemoryStudentRepository,
  MemoryTeacherRepository,
} from './vendor/memory-repositories/index.js';
import { createGoogleSheetsRepositories } from './vendor/googlesheets-repositories/index.js';
import type {
  AllocationRepository,
  DutyRosterRepository,
  ExamRepository,
  RoomRepository,
  SettingsRepository,
  StudentRepository,
  TeacherRepository,
} from './vendor/core/index.js';

/**
 * DATA_BACKEND selects which repository implementation the API runs on -
 * this is the "swap the database" story from the architecture made real.
 * All three options implement the exact same interfaces from packages/core,
 * so routes and the allocation engine never know or care which one is live.
 *   - "json"   (default) JSON files on local disk - see DATA_DIR in .env.example
 *   - "sheets" a Google Sheet, via a service account - see GOOGLE_SHEETS_ID
 *              / GOOGLE_SERVICE_ACCOUNT_* in .env.example
 */
const backend = (process.env.DATA_BACKEND ?? 'json').toLowerCase();

let studentRepository: StudentRepository;
let roomRepository: RoomRepository;
let examRepository: ExamRepository;
let allocationRepository: AllocationRepository;
let settingsRepository: SettingsRepository;
let teacherRepository: TeacherRepository;
let dutyRosterRepository: DutyRosterRepository;

if (backend === 'sheets') {
  const repos = createGoogleSheetsRepositories();
  studentRepository = repos.studentRepository;
  roomRepository = repos.roomRepository;
  examRepository = repos.examRepository;
  allocationRepository = repos.allocationRepository;
  settingsRepository = repos.settingsRepository;
  teacherRepository = repos.teacherRepository;
  dutyRosterRepository = repos.dutyRosterRepository;
  console.log('[data backend] Google Sheets');
} else {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  // DATA_DIR lets you point storage at a mounted persistent volume when
  // hosting (most platforms' default filesystem is ephemeral - see .env.example).
  const dataDir = process.env.DATA_DIR ? resolve(process.env.DATA_DIR) : join(__dirname, '..', 'data');
  studentRepository = new MemoryStudentRepository(join(dataDir, 'students.json'));
  roomRepository = new MemoryRoomRepository(join(dataDir, 'rooms.json'));
  examRepository = new MemoryExamRepository(join(dataDir, 'exams.json'));
  allocationRepository = new MemoryAllocationRepository(join(dataDir, 'allocations.json'));
  settingsRepository = new MemorySettingsRepository(join(dataDir, 'settings.json'));
  teacherRepository = new MemoryTeacherRepository(join(dataDir, 'teachers.json'));
  dutyRosterRepository = new MemoryDutyRosterRepository(join(dataDir, 'dutyRosters.json'));
  console.log(`[data backend] JSON files (${dataDir})`);
}

export { studentRepository, roomRepository, examRepository, allocationRepository, settingsRepository, teacherRepository, dutyRosterRepository };
