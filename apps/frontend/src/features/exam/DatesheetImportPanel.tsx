import { useState } from 'react';
import type { Exam, Student, SubjectAssignment } from '../../vendor/core/index.js';
import { defaultRuleConfig, generateId } from '../../vendor/core/index.js';
import { detectSubjectConflicts, findStudentSittingConflicts, selectMinimalRooms } from '../../vendor/allocation-engine/index.js';
import { examRepository, roomRepository } from '../../services/repositories.js';
import ExcelImportControls from '../../components/ExcelImportControls.js';

interface DatesheetRow {
  date: string;
  startTime: string;
  endTime: string;
  branch: string;
  year: number;
  subjectName: string;
  subjectCode?: string;
}

function parseDatesheet(text: string): { rows: DatesheetRow[]; errors: string[] } {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const rows: DatesheetRow[] = [];
  const errors: string[] = [];
  lines.forEach((line, idx) => {
    const parts = line.split(',').map((p) => p.trim());
    const [date, startTime, endTime, branch, yearStr, subjectName, subjectCode] = parts;
    if (!date || !startTime || !endTime || !branch || !yearStr || !subjectName) {
      errors.push(`Line ${idx + 1}: expected "date, startTime, endTime, branch, year, subjectName[, subjectCode]"`);
      return;
    }
    const year = Number(yearStr);
    if (Number.isNaN(year)) {
      errors.push(`Line ${idx + 1}: year "${yearStr}" is not a number.`);
      return;
    }
    rows.push({ date, startTime, endTime, branch, year, subjectName, subjectCode: subjectCode || undefined });
  });
  return { rows, errors };
}

export default function DatesheetImportPanel({
  students,
  onImported,
}: {
  students: Student[];
  onImported: () => Promise<void>;
}) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);

  async function handleImport() {
    setError(null);
    setSummary(null);
    const { rows, errors } = parseDatesheet(text);
    if (errors.length) {
      setError(errors.join('\n'));
      return;
    }
    if (rows.length === 0) {
      setError('No valid rows found.');
      return;
    }
    setSummary(await importRows(rows));
    setText('');
    await onImported();
  }

  async function handleExcelImport(records: { rowNumber: number; values: Record<string, string> }[]): Promise<string> {
    const rows: DatesheetRow[] = records.map(({ values: v }) => ({
      date: v.date!,
      startTime: v.startTime!,
      endTime: v.endTime!,
      branch: v.branch!,
      year: Number(v.year),
      subjectName: v.subjectName!,
      subjectCode: v.subjectCode || undefined,
    }));
    const message = await importRows(rows);
    await onImported();
    return message;
  }

  /** Shared by the pasted-text and Excel imports: groups rows into exam sittings and creates the exams. Returns the summary message. */
  async function importRows(rows: DatesheetRow[]): Promise<string> {
    // Same date+start+end time => one exam session (multiple subjects, one sitting).
    const groups = new Map<string, DatesheetRow[]>();
    for (const row of rows) {
      const key = `${row.date}|${row.startTime}|${row.endTime}`;
      const list = groups.get(key) ?? [];
      list.push(row);
      groups.set(key, list);
    }

    const allRooms = await roomRepository.getAll();
    const enabledRooms = allRooms.filter((r) => r.enabled);

    // Sitting conflicts are checked against both exams that already exist AND
    // the other sessions in this same datesheet paste (two groups can have
    // different, still-overlapping times, e.g. 09:00-12:00 and 10:00-13:00).
    const existingExams = await examRepository.getAll();
    const examsSoFar: Exam[] = [...existingExams];

    const noStudentGroups: string[] = [];
    const conflictWarnings: string[] = [];
    const sittingConflictWarnings: string[] = [];
    let created = 0;

    for (const [, groupRows] of groups) {
      const first = groupRows[0]!;
      const subjectAssignments: SubjectAssignment[] = groupRows.map((r) => ({
        id: generateId('subject'),
        branch: r.branch,
        year: r.year,
        subjectName: r.subjectName,
        subjectCode: r.subjectCode,
      }));

      const conflicts = detectSubjectConflicts(subjectAssignments);
      for (const c of conflicts) {
        conflictWarnings.push(`${first.date} ${first.startTime}-${first.endTime}: ${c.branch} Year ${c.year} has conflicting subjects (${c.subjectNames.join(', ')}).`);
      }

      const branchYearPairs = new Set(groupRows.map((r) => `${r.branch}|${r.year}`));
      const studentIds = students.filter((s) => s.active && branchYearPairs.has(`${s.branch}|${s.year}`)).map((s) => s.id);

      if (studentIds.length === 0) {
        noStudentGroups.push(`${first.date} ${first.startTime}-${first.endTime} (${[...branchYearPairs].join(', ')})`);
      }

      // Only attach as many rooms as this session actually needs (fewest
      // priority-ordered rooms covering the roster), not every enabled room -
      // an exam with unused rooms attached still gets charged at least one
      // invigilator per room when duty rosters are generated later.
      const roomIds = studentIds.length > 0 ? selectMinimalRooms(enabledRooms, studentIds.length).map((r) => r.id) : [];

      const now = new Date().toISOString();
      const exam: Exam = {
        id: generateId('exam'),
        name: `${first.date} ${first.startTime}-${first.endTime}`,
        date: first.date,
        startTime: first.startTime,
        endTime: first.endTime,
        studentIds,
        roomIds,
        ruleConfig: { ...defaultRuleConfig(), allocationMode: 'minimum-rooms', rollContinuity: { mode: 'strict', priority: 'critical' } },
        subjectAssignments,
        allocationIds: [],
        dutyRosterIds: [],
        createdAt: now,
        updatedAt: now,
      };

      const sittingConflicts = findStudentSittingConflicts(exam, examsSoFar);
      if (sittingConflicts.length > 0) {
        const conflictingExamNames = [...new Set(sittingConflicts.map((c) => c.conflictingExamName))];
        sittingConflictWarnings.push(
          `${exam.name}: ${sittingConflicts.length} student(s) already scheduled for an overlapping exam (${conflictingExamNames.join(', ')}).`
        );
      }

      await examRepository.create(exam);
      examsSoFar.push(exam);
      created++;
    }

    const parts = [`Created ${created} exam(s) from ${rows.length} datesheet row(s).`];
    if (noStudentGroups.length) parts.push(`No matching active students found for: ${noStudentGroups.join('; ')}.`);
    if (conflictWarnings.length) parts.push(`Subject conflicts: ${conflictWarnings.join(' ')}`);
    if (sittingConflictWarnings.length) parts.push(`Sitting conflicts: ${sittingConflictWarnings.join(' ')}`);
    return parts.join(' ');
  }

  return (
    <div className="card p-4 space-y-2">
      <div className="text-sm font-medium text-slate-700">Import Datesheet</div>
      <p className="text-xs text-slate-500">
        One row per branch+year paper: <code>date, startTime, endTime, branch, year, subjectName[, subjectCode]</code>.
        Rows sharing the same date+start+end time become one exam session (multiple subjects, same sitting). The
        fewest priority-ordered rooms needed for each sitting are auto-assigned — adjust per exam afterward if needed.
      </p>
      <ExcelImportControls kind="datesheet" onImport={handleExcelImport} />
      <div className="text-xs text-slate-400">Or paste rows:</div>
      <textarea
        className="input font-mono h-32"
        placeholder={'2026-11-01, 09:00, 12:00, CSE, 2, Data Structures, CS201\n2026-11-01, 09:00, 12:00, ECE, 2, Signals and Systems, EC201\n2026-11-01, 14:00, 17:00, CSE, 3, Database Systems, CS301'}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      {error && <pre className="text-xs text-red-600 whitespace-pre-wrap">{error}</pre>}
      {summary && <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-3 py-2">{summary}</div>}
      <button className="btn-primary" onClick={handleImport}>
        Import Datesheet
      </button>
    </div>
  );
}
