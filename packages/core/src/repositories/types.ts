import type { Student } from '../models/student.js';
import type { Room } from '../models/room.js';
import type { Exam } from '../models/exam.js';
import type { AllocationResult } from '../models/allocation.js';
import type { Teacher } from '../models/teacher.js';
import type { DutyRoster } from '../models/duty.js';

export interface StudentQuery {
  branch?: string;
  year?: number;
  section?: string;
  search?: string;
  activeOnly?: boolean;
}

export interface StudentRepository {
  getAll(): Promise<Student[]>;
  getById(id: string): Promise<Student | undefined>;
  query(q: StudentQuery): Promise<Student[]>;
  create(student: Student): Promise<Student>;
  createMany(students: Student[]): Promise<Student[]>;
  update(id: string, patch: Partial<Student>): Promise<Student>;
  remove(id: string): Promise<void>;
  findDuplicateRollNumbers(): Promise<string[]>;
}

export interface RoomRepository {
  getAll(): Promise<Room[]>;
  getById(id: string): Promise<Room | undefined>;
  create(room: Room): Promise<Room>;
  update(id: string, patch: Partial<Room>): Promise<Room>;
  remove(id: string): Promise<void>;
  setSeatBlocked(roomId: string, seatId: string, blocked: boolean, reason?: string): Promise<Room>;
}

export interface ExamRepository {
  getAll(): Promise<Exam[]>;
  getById(id: string): Promise<Exam | undefined>;
  create(exam: Exam): Promise<Exam>;
  update(id: string, patch: Partial<Exam>): Promise<Exam>;
  remove(id: string): Promise<void>;
}

export interface AllocationRepository {
  getAll(): Promise<AllocationResult[]>;
  getById(id: string): Promise<AllocationResult | undefined>;
  getByExamId(examId: string): Promise<AllocationResult[]>;
  create(allocation: AllocationResult): Promise<AllocationResult>;
  update(id: string, patch: Partial<AllocationResult>): Promise<AllocationResult>;
  remove(id: string): Promise<void>;
}

export interface SettingsRepository {
  get<T = unknown>(key: string): Promise<T | undefined>;
  set<T = unknown>(key: string, value: T): Promise<void>;
  remove(key: string): Promise<void>;
}

export interface TeacherRepository {
  getAll(): Promise<Teacher[]>;
  getById(id: string): Promise<Teacher | undefined>;
  create(teacher: Teacher): Promise<Teacher>;
  createMany(teachers: Teacher[]): Promise<Teacher[]>;
  update(id: string, patch: Partial<Teacher>): Promise<Teacher>;
  remove(id: string): Promise<void>;
}

export interface DutyRosterRepository {
  getAll(): Promise<DutyRoster[]>;
  getById(id: string): Promise<DutyRoster | undefined>;
  getByExamId(examId: string): Promise<DutyRoster[]>;
  create(roster: DutyRoster): Promise<DutyRoster>;
  update(id: string, patch: Partial<DutyRoster>): Promise<DutyRoster>;
  remove(id: string): Promise<void>;
}
