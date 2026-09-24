import type { DutyWindow } from '../vendor/core/index.js';
import { settingsRepository } from './repositories.js';

const KEY = 'dutyWindows';

export function newDutyWindow(id: string): DutyWindow {
  const today = new Date().toISOString().slice(0, 10);
  return {
    id,
    name: 'Sessional 1',
    startDate: today,
    endDate: today,
    studentsPerInvigilator: 30,
    avoidOwnBranchInvigilation: true,
    perTeacher: {},
  };
}

export async function getDutyWindows(): Promise<DutyWindow[]> {
  return (await settingsRepository.get<DutyWindow[]>(KEY)) ?? [];
}

export async function saveDutyWindow(window: DutyWindow): Promise<DutyWindow[]> {
  const windows = await getDutyWindows();
  const next = windows.some((w) => w.id === window.id) ? windows.map((w) => (w.id === window.id ? window : w)) : [...windows, window];
  await settingsRepository.set(KEY, next);
  return next;
}

export async function deleteDutyWindow(id: string): Promise<DutyWindow[]> {
  const next = (await getDutyWindows()).filter((w) => w.id !== id);
  await settingsRepository.set(KEY, next);
  return next;
}
