import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Exam, Room, Student } from '../vendor/core/index.js';
import { examRepository, roomRepository, studentRepository } from './repositories.js';

interface AppDataState {
  students: Student[];
  rooms: Room[];
  exams: Exam[];
  loading: boolean;
  error: string | null;
  refreshStudents: () => Promise<void>;
  refreshRooms: () => Promise<void>;
  refreshExams: () => Promise<void>;
  refreshAll: () => Promise<void>;
}

const AppDataContext = createContext<AppDataState | null>(null);

export function AppDataProvider({ children }: { children: React.ReactNode }) {
  const [students, setStudents] = useState<Student[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
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

  const refreshAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    await Promise.all([refreshStudents(), refreshRooms(), refreshExams()]);
    setLoading(false);
  }, [refreshStudents, refreshRooms, refreshExams]);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  const value = useMemo(
    () => ({ students, rooms, exams, loading, error, refreshStudents, refreshRooms, refreshExams, refreshAll }),
    [students, rooms, exams, loading, error, refreshStudents, refreshRooms, refreshExams, refreshAll]
  );

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export function useAppData(): AppDataState {
  const ctx = useContext(AppDataContext);
  if (!ctx) throw new Error('useAppData must be used within AppDataProvider');
  return ctx;
}
