import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { AllocationResult, RuleConfig } from '../vendor/core/index.js';
import { checkFeasibility } from '../vendor/allocation-engine/index.js';
import {
  addStudentToAllocation,
  applyManualOverride,
  disableRoomInAllocation,
  previewManualOverride,
  removeStudentFromAllocation,
  type ManualOverridePreview,
} from '../vendor/allocation-engine/index.js';
import { useAppData } from '../services/AppDataContext.js';
import { allocationRepository, examRepository } from '../services/repositories.js';
import { runAllocationInWorker } from '../services/allocationWorkerClient.js';
import PageHeader from '../components/PageHeader.js';
import StatTile from '../components/StatTile.js';
import RuleConfigEditor from '../components/RuleConfigEditor.js';
import ValidationPanel from '../features/allocation/ValidationPanel.js';
import ConflictList from '../features/allocation/ConflictList.js';
import SeatingMap from '../features/allocation/SeatingMap.js';
import ReportsPanel from '../features/allocation/ReportsPanel.js';

export default function ExamDetailPage() {
  const { examId } = useParams();
  const { students, rooms, exams, refreshExams } = useAppData();
  const exam = exams.find((e) => e.id === examId);

  const [allocations, setAllocations] = useState<AllocationResult[]>([]);
  const [generating, setGenerating] = useState(false);
  const [ruleConfig, setRuleConfig] = useState<RuleConfig | null>(null);
  const [showRules, setShowRules] = useState(false);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [moveStudentId, setMoveStudentId] = useState<string | null>(null);
  const [pendingOverride, setPendingOverride] = useState<{ studentId: string; seatId: string; preview: ManualOverridePreview } | null>(null);
  const [addStudentId, setAddStudentId] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (exam) setRuleConfig((prev) => prev ?? exam.ruleConfig);
  }, [exam]);

  async function loadAllocations() {
    if (!examId) return;
    setAllocations(await allocationRepository.getByExamId(examId));
  }

  useEffect(() => {
    loadAllocations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examId]);

  const currentAllocation = useMemo(() => {
    if (!exam) return undefined;
    return allocations.find((a) => a.id === exam.activeAllocationId) ?? allocations[0];
  }, [allocations, exam]);

  useEffect(() => {
    if (currentAllocation && !activeRoomId) {
      const firstRoomWithSeats = currentAllocation.roomSnapshot.find((r) =>
        currentAllocation.assignments.some((a) => a.roomId === r.id)
      );
      setActiveRoomId(firstRoomWithSeats?.id ?? currentAllocation.roomSnapshot[0]?.id ?? null);
    }
  }, [currentAllocation, activeRoomId]);

  if (!exam) {
    return (
      <div className="p-6 text-sm text-slate-500">
        Exam not found. <Link to="/exams" className="text-brand-700 hover:underline">Back to exams</Link>
      </div>
    );
  }

  const examStudents = students.filter((s) => exam.studentIds.includes(s.id));
  const examRooms = rooms.filter((r) => exam.roomIds.includes(r.id));
  const feasibility = ruleConfig ? checkFeasibility(examStudents.filter((s) => s.active), examRooms.filter((r) => r.enabled), ruleConfig) : null;

  async function saveRules() {
    if (!ruleConfig) return;
    await examRepository.update(exam!.id, { ruleConfig });
    await refreshExams();
    setShowRules(false);
  }

  async function handleGenerate() {
    if (!ruleConfig) return;
    setError(null);
    setGenerating(true);
    try {
      const result = await runAllocationInWorker({
        examId: exam!.id,
        students: examStudents,
        rooms: examRooms,
        ruleConfig,
        version: allocations.length + 1,
        parentAllocationId: exam!.activeAllocationId,
      });
      await allocationRepository.create(result);
      await examRepository.update(exam!.id, {
        ruleConfig,
        allocationIds: [...exam!.allocationIds, result.id],
        activeAllocationId: result.id,
      });
      await refreshExams();
      await loadAllocations();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGenerating(false);
    }
  }

  async function saveAllocation(updated: AllocationResult) {
    await allocationRepository.update(updated.id, updated);
    await loadAllocations();
  }

  function handleSeatClick(seatId: string) {
    if (!moveStudentId || !currentAllocation) return;
    const preview = previewManualOverride(currentAllocation, moveStudentId, seatId);
    setPendingOverride({ studentId: moveStudentId, seatId, preview });
  }

  async function confirmOverride(force: boolean) {
    if (!pendingOverride || !currentAllocation) return;
    const updated = applyManualOverride(currentAllocation, pendingOverride.studentId, pendingOverride.seatId, force);
    await saveAllocation(updated);
    setPendingOverride(null);
    setMoveStudentId(null);
  }

  async function handleRemoveStudent(studentId: string) {
    if (currentAllocation) {
      const updated = removeStudentFromAllocation(currentAllocation, studentId);
      await saveAllocation(updated);
    }
    await examRepository.update(exam!.id, { studentIds: exam!.studentIds.filter((id) => id !== studentId) });
    await refreshExams();
  }

  async function handleAddStudent() {
    const student = students.find((s) => s.id === addStudentId);
    if (!student) return;
    await examRepository.update(exam!.id, { studentIds: [...exam!.studentIds, student.id] });
    if (currentAllocation) {
      const { updated, seated } = addStudentToAllocation(currentAllocation, student);
      await saveAllocation(updated);
      if (!seated) setError(`No feasible seat found for ${student.rollNumber}. They were added to the exam roster but remain unallocated.`);
    }
    setAddStudentId('');
    await refreshExams();
  }

  async function handleDisableRoom(roomId: string) {
    if (!currentAllocation) return;
    const { updated, stillUnseatedStudentIds } = disableRoomInAllocation(currentAllocation, roomId);
    await saveAllocation(updated);
    if (stillUnseatedStudentIds.length) {
      setError(`${stillUnseatedStudentIds.length} student(s) could not be reseated after disabling this room.`);
    }
  }

  const searchResult = useMemo(() => {
    if (!search.trim() || !currentAllocation) return null;
    const term = search.trim().toLowerCase();
    const student = examStudents.find((s) => s.rollNumber.toLowerCase() === term || s.rollNumber.toLowerCase().includes(term));
    if (!student) return null;
    const assignment = currentAllocation.assignments.find((a) => a.studentId === student.id);
    const room = assignment ? currentAllocation.roomSnapshot.find((r) => r.id === assignment.roomId) : undefined;
    const seat = room?.seats.find((s) => s.id === assignment?.seatId);
    return { student, room, seat };
  }, [search, currentAllocation, examStudents]);

  const unselectedStudents = students.filter((s) => !exam.studentIds.includes(s.id));
  const activeRoom = currentAllocation?.roomSnapshot.find((r) => r.id === activeRoomId);

  return (
    <div>
      <PageHeader
        title={exam.name}
        subtitle={`${exam.date} · ${exam.startTime}–${exam.endTime} · ${examStudents.length} students · ${examRooms.length} rooms`}
        actions={
          <>
            <button className="btn-secondary" onClick={() => setShowRules((v) => !v)}>
              {showRules ? 'Hide Rules' : 'Edit Rules'}
            </button>
            <button className="btn-primary" onClick={handleGenerate} disabled={generating || (feasibility ? !feasibility.feasible : false)}>
              {generating ? 'Generating…' : currentAllocation ? 'Regenerate Allocation' : 'Generate Allocation'}
            </button>
          </>
        }
      />

      <div className="p-6 space-y-5">
        {error && (
          <div className="rounded-md border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-800 flex justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="text-red-500">
              ✕
            </button>
          </div>
        )}

        {feasibility && !feasibility.feasible && (
          <div className="card p-4 border-amber-300 bg-amber-50">
            <h2 className="text-sm font-semibold text-amber-800 mb-2">Allocation is not feasible yet</h2>
            <ul className="list-disc pl-5 text-sm text-amber-800 space-y-1">
              {feasibility.issues.map((issue, i) => (
                <li key={i}>
                  {issue.message}
                  {issue.suggestions.length > 0 && (
                    <ul className="list-[circle] pl-5 text-xs text-amber-700">
                      {issue.suggestions.map((s, j) => (
                        <li key={j}>{s}</li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
              {feasibility.ruleContradictions.map((msg, i) => (
                <li key={`c${i}`}>{msg}</li>
              ))}
            </ul>
          </div>
        )}

        {showRules && ruleConfig && (
          <div className="card p-4">
            <h2 className="text-sm font-semibold text-slate-800 mb-3">Allocation Rules</h2>
            <RuleConfigEditor value={ruleConfig} onChange={setRuleConfig} rooms={examRooms} />
            <div className="mt-3">
              <button className="btn-primary" onClick={saveRules}>
                Save Rules
              </button>
            </div>
          </div>
        )}

        {!currentAllocation && !showRules && (
          <div className="card p-8 text-center text-sm text-slate-500">
            No allocation generated yet. Review feasibility above, then click "Generate Allocation".
          </div>
        )}

        {currentAllocation && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatTile label="Allocated" value={`${currentAllocation.validationReport.allocatedStudents}/${currentAllocation.validationReport.totalStudents}`} />
              <StatTile
                label="Status"
                value={currentAllocation.status}
                tone={currentAllocation.status === 'success' ? 'good' : currentAllocation.status === 'partial' ? 'warn' : 'bad'}
              />
              <StatTile label="Conflicts" value={currentAllocation.validationReport.conflicts.length} tone={currentAllocation.validationReport.conflicts.length ? 'warn' : 'good'} />
              <StatTile label="Score" value={`${currentAllocation.score}%`} />
            </div>

            <ValidationPanel report={currentAllocation.validationReport} />
            <ConflictList conflicts={currentAllocation.validationReport.conflicts} />

            <div className="card p-4">
              <div className="flex flex-wrap items-center gap-3 mb-3">
                <h2 className="text-sm font-semibold text-slate-800">Seating Map</h2>
                <select className="input w-48" value={activeRoomId ?? ''} onChange={(e) => setActiveRoomId(e.target.value)}>
                  {currentAllocation.roomSnapshot.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} ({currentAllocation.assignments.filter((a) => a.roomId === r.id).length} seated)
                    </option>
                  ))}
                </select>
                {activeRoom && (
                  <button className="btn-ghost text-red-600" onClick={() => handleDisableRoom(activeRoom.id)} disabled={!activeRoom.enabled}>
                    {activeRoom.enabled ? 'Disable this room' : 'Room disabled'}
                  </button>
                )}
                <div className="ml-auto flex items-center gap-2">
                  <input className="input w-44" placeholder="Search roll number..." value={search} onChange={(e) => setSearch(e.target.value)} />
                </div>
              </div>

              {searchResult && (
                <div className="mb-3 text-sm bg-brand-50 border border-brand-200 rounded-md px-3 py-2">
                  <strong>{searchResult.student.rollNumber}</strong> — {searchResult.student.name} ({searchResult.student.branch}, Y{searchResult.student.year})
                  {searchResult.room && searchResult.seat ? (
                    <>
                      {' '}
                      is in <strong>{searchResult.room.name}</strong>, row {searchResult.seat.row}, seat {searchResult.seat.col}.
                    </>
                  ) : (
                    ' is not currently allocated a seat.'
                  )}
                </div>
              )}

              <div className="flex items-center gap-2 mb-3 text-sm">
                <span className="text-slate-500">Move student:</span>
                <select className="input w-56" value={moveStudentId ?? ''} onChange={(e) => setMoveStudentId(e.target.value || null)}>
                  <option value="">Select a seated student…</option>
                  {currentAllocation.assignments.map((a) => {
                    const s = students.find((st) => st.id === a.studentId);
                    return s ? (
                      <option key={a.studentId} value={a.studentId}>
                        {s.rollNumber} — {s.name}
                      </option>
                    ) : null;
                  })}
                </select>
                {moveStudentId && <span className="text-xs text-slate-500">Now click a seat in the map to move them there.</span>}
              </div>

              {pendingOverride && (
                <div className="mb-3 border border-brand-300 bg-brand-50 rounded-md p-3 text-sm space-y-2">
                  <div>
                    Move to seat <strong>{pendingOverride.seatId}</strong>?
                  </div>
                  {!pendingOverride.preview.seatLegal && <div className="text-red-600">This seat is blocked, unavailable, or in a disabled room.</div>}
                  {pendingOverride.preview.hardViolations.length > 0 && (
                    <ul className="list-disc pl-5 text-amber-700">
                      {pendingOverride.preview.hardViolations.map((v) => (
                        <li key={v.id}>{v.description}</li>
                      ))}
                    </ul>
                  )}
                  <div className="flex gap-2">
                    <button
                      className="btn-primary"
                      disabled={!pendingOverride.preview.seatLegal}
                      onClick={() => confirmOverride(false)}
                    >
                      Apply
                    </button>
                    {pendingOverride.preview.hardViolations.length > 0 && pendingOverride.preview.seatLegal && (
                      <button className="btn-danger" onClick={() => confirmOverride(true)}>
                        Force Override
                      </button>
                    )}
                    <button className="btn-ghost" onClick={() => setPendingOverride(null)}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {activeRoom && (
                <SeatingMap
                  room={activeRoom}
                  allocation={currentAllocation}
                  students={students}
                  onSeatClick={handleSeatClick}
                  highlightStudentId={moveStudentId ?? searchResult?.student.id}
                />
              )}
            </div>

            <div className="card p-4">
              <h2 className="text-sm font-semibold text-slate-800 mb-3">Exam Roster</h2>
              <div className="flex items-center gap-2 mb-3">
                <select className="input w-64" value={addStudentId} onChange={(e) => setAddStudentId(e.target.value)}>
                  <option value="">Add a student to this exam…</option>
                  {unselectedStudents.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.rollNumber} — {s.name}
                    </option>
                  ))}
                </select>
                <button className="btn-secondary" onClick={handleAddStudent} disabled={!addStudentId}>
                  Add
                </button>
              </div>
              {currentAllocation.unallocatedStudentIds.length > 0 && (
                <div className="text-sm">
                  <div className="font-medium text-slate-700 mb-1">Unallocated students ({currentAllocation.unallocatedStudentIds.length})</div>
                  <div className="flex flex-wrap gap-1.5">
                    {currentAllocation.unallocatedStudentIds.map((id) => {
                      const s = students.find((st) => st.id === id);
                      if (!s) return null;
                      return (
                        <span key={id} className="badge bg-red-50 text-red-700 gap-1">
                          {s.rollNumber}
                          <button className="ml-1" onClick={() => handleRemoveStudent(id)} title="Remove from exam">
                            ✕
                          </button>
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <ReportsPanel allocation={currentAllocation} students={students} rooms={currentAllocation.roomSnapshot} examName={exam.name} examDate={exam.date} />
          </>
        )}
      </div>
    </div>
  );
}
