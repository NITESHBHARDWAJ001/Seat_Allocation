import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { DutyRoster, Exam, ExamAttendance, Room, Student, Teacher } from '../vendor/core/index.js';
import { attendanceRepository, dutyRosterRepository, examRepository, roomRepository, studentRepository, teacherRepository } from './repositories.js';

interface AppDataState {
  students: Student[];
  rooms: Room[];
  exams: Exam[];
  teachers: Teacher[];
  dutyRosters: DutyRoster[];
  attendances: ExamAttendance[];
  loading: boolean;
  error: string | null;
  refreshStudents: () => Promise<void>;
  refreshRooms: () => Promise<void>;
  refreshExams: () => Promise<void>;
  refreshTeachers: () => Promise<void>;
  refreshDutyRosters: () => Promise<void>;
  refreshAttendances: () => Promise<void>;
  refreshAll: () => Promise<void>;
}

const AppDataContext = createContext<AppDataState | null>(null);

export function AppDataProvider({ children }: { children: React.ReactNode }) {
  const [students, setStudents] = useState<Student[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [dutyRosters, setDutyRosters] = useState<DutyRoster[]>([]);
  const [attendances, setAttendances] = useState<ExamAttendance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshStudents = useCallback(async () => {
    try {
      setStudents(await studentRepository.getAll());
    } catch (e) {
      setError(`Could not load students from local storage: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, []);

  const refreshRooms = useCallback(async () => {
    try {
      setRooms(await roomRepository.getAll());
    } catch (e) {
      setError(`Could not load rooms from local storage: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, []);

  const refreshExams = useCallback(async () => {
    try {
      setExams(await examRepository.getAll());
    } catch (e) {
      setError(`Could not load exams from local storage: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, []);

  const refreshTeachers = useCallback(async () => {
    try {
      setTeachers(await teacherRepository.getAll());
    } catch (e) {
      setError(`Could not load teachers from local storage: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, []);

  const refreshDutyRosters = useCallback(async () => {
    try {
      setDutyRosters(await dutyRosterRepository.getAll());
    } catch (e) {
      setError(`Could not load duty rosters from local storage: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, []);

  const refreshAttendances = useCallback(async () => {
    try {
      setAttendances(await attendanceRepository.getAll());
    } catch (e) {
      setError(`Could not load attendance from local storage: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, []);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    await Promise.all([refreshStudents(), refreshRooms(), refreshExams(), refreshTeachers(), refreshDutyRosters(), refreshAttendances()]);
    setLoading(false);
  }, [refreshStudents, refreshRooms, refreshExams, refreshTeachers, refreshDutyRosters, refreshAttendances]);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  const value = useMemo(
    () => ({
      students,
      rooms,
      exams,
      teachers,
      dutyRosters,
      attendances,
      loading,
      error,
      refreshStudents,
      refreshRooms,
      refreshExams,
      refreshTeachers,
      refreshDutyRosters,
      refreshAttendances,
      refreshAll,
    }),
    [
      students,
      rooms,
      exams,
      teachers,
      dutyRosters,
      attendances,
      loading,
      error,
      refreshStudents,
      refreshRooms,
      refreshExams,
      refreshTeachers,
      refreshDutyRosters,
      refreshAttendances,
      refreshAll,
    ]
  );

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export function useAppData(): AppDataState {
  const ctx = useContext(AppDataContext);
  if (!ctx) throw new Error('useAppData must be used within AppDataProvider');
  return ctx;
}
