import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { DEFAULT_INSTITUTION, type AllocationResult, type InstitutionProfile } from '../vendor/core/index.js';
import { useAppData } from '../services/AppDataContext.js';
import { allocationRepository } from '../services/repositories.js';
import { getInstitution } from '../services/attendanceService.js';
import { buildRoomSheets, exportAttendanceXlsx, printAttendanceSheets } from '../services/attendanceExport.js';
import PageHeader from '../components/PageHeader.js';

/** Printable attendance sheets, one per room in seat order. Blank before the exam, with statuses after marking. */
export default function AttendanceSheetsPage() {
  const { examId } = useParams();
  const { exams, students, teachers, dutyRosters, attendances } = useAppData();
  const exam = exams.find((e) => e.id === examId);
  const attendance = attendances.find((a) => a.examId === examId);
  const [allocation, setAllocation] = useState<AllocationResult | undefined>();
  const [institution, setInstitution] = useState<InstitutionProfile>(DEFAULT_INSTITUTION);
  const [showMarks, setShowMarks] = useState(false);

  useEffect(() => {
    getInstitution().then(setInstitution);
  }, []);
  useEffect(() => {
    if (exam?.activeAllocationId) allocationRepository.getById(exam.activeAllocationId).then(setAllocation);
  }, [exam?.activeAllocationId]);

  const sheets = useMemo(() => (exam && allocation ? buildRoomSheets(exam, allocation, students.filter((s) => exam.studentIds.includes(s.id)), showMarks ? attendance : undefined) : []), [exam, allocation, students, attendance, showMarks]);

  const invigilatorsByRoom = useMemo(() => {
    const roster = dutyRosters.find((r) => r.id === exam?.activeDutyRosterId);
    const roomName = new Map((allocation?.roomSnapshot ?? []).map((r) => [r.id, r.name] as const));
    const teacherName = new Map(teachers.map((t) => [t.id, t.name] as const));
    const out: Record<string, string[]> = {};
    for (const a of roster?.assignments ?? []) {
      const room = roomName.get(a.roomId);
      if (room) (out[room] ??= []).push(teacherName.get(a.teacherId) ?? a.teacherId);
    }
    return out;
  }, [dutyRosters, teachers, exam, allocation]);

  if (!exam) return <div className="p-6 text-sm text-slate-500">Exam not found.</div>;
  const params = { institution, exam, sheets, invigilatorsByRoom, showMarks };

  return (
    <div>
      <PageHeader
        title="Attendance sheets"
        subtitle={`${exam.name} · one sheet per room, in seat order`}
        actions={
          <>
            <Link to={`/attendance/${exam.id}`} className="btn-ghost">
              Back to marking
            </Link>
            <button className="btn-secondary" disabled={!sheets.length} onClick={() => exportAttendanceXlsx({ institution, exam, sheets, showMarks })}>
              Excel
            </button>
            <button className="btn-primary" disabled={!sheets.length} onClick={() => printAttendanceSheets(params)}>
              Print all
            </button>
          </>
        }
      />
      <div className="p-6 space-y-4">
        {!exam.activeAllocationId && <div className="card p-4 text-sm text-amber-800 bg-amber-50 border-amber-200">Generate the seating allocation first; sheets are built from it.</div>}
        {(!institution.college || !institution.centreNo) && (
          <div className="card p-3 text-xs text-slate-600">
            College name and centre number print in the header. Set them in <Link to="/settings" className="underline">Settings → Institution</Link>.
          </div>
        )}
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={showMarks} onChange={(e) => setShowMarks(e.target.checked)} />
          Include marked status (absent / unfair means) — leave off to print blank sheets before the exam
        </label>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {sheets.map((sheet) => (
            <div key={sheet.roomName} className="card p-4 flex items-center justify-between">
              <div>
                <div className="font-medium">{sheet.roomName}</div>
                <div className="text-xs text-slate-500">
                  {sheet.rows.length} candidates
                  {invigilatorsByRoom[sheet.roomName]?.length ? ` · ${invigilatorsByRoom[sheet.roomName]!.join(', ')}` : ''}
                </div>
              </div>
              <button className="btn-secondary" onClick={() => printAttendanceSheets({ ...params, sheets: [sheet] })}>
                Print
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
