export * from './sheetsClient.js';
export * from './sheetTable.js';
export * from './studentRepository.js';
export * from './roomRepository.js';
export * from './examRepository.js';
export * from './allocationRepository.js';
export * from './settingsRepository.js';
export * from './teacherRepository.js';
export * from './dutyRosterRepository.js';

import { getSheetsClient, sheetsConfigFromEnv, type SheetsConfig } from './sheetsClient.js';
import { GoogleSheetsStudentRepository } from './studentRepository.js';
import { GoogleSheetsRoomRepository } from './roomRepository.js';
import { GoogleSheetsExamRepository } from './examRepository.js';
import { GoogleSheetsAllocationRepository } from './allocationRepository.js';
import { GoogleSheetsSettingsRepository } from './settingsRepository.js';
import { GoogleSheetsTeacherRepository } from './teacherRepository.js';
import { GoogleSheetsDutyRosterRepository } from './dutyRosterRepository.js';

/** Builds the full set of Sheets-backed repositories from GOOGLE_SHEETS_ID / GOOGLE_SERVICE_ACCOUNT_* env vars. */
export function createGoogleSheetsRepositories(config: SheetsConfig = sheetsConfigFromEnv()) {
  const sheets = getSheetsClient(config);
  const { spreadsheetId } = config;
  return {
    studentRepository: new GoogleSheetsStudentRepository(sheets, spreadsheetId),
    roomRepository: new GoogleSheetsRoomRepository(sheets, spreadsheetId),
    examRepository: new GoogleSheetsExamRepository(sheets, spreadsheetId),
    allocationRepository: new GoogleSheetsAllocationRepository(sheets, spreadsheetId),
    settingsRepository: new GoogleSheetsSettingsRepository(sheets, spreadsheetId),
    teacherRepository: new GoogleSheetsTeacherRepository(sheets, spreadsheetId),
    dutyRosterRepository: new GoogleSheetsDutyRosterRepository(sheets, spreadsheetId),
  };
}
