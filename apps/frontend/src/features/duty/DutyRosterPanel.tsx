import { useMemo, useState } from 'react';
import type { AllocationResult, DutyRoster, Exam, Room, Teacher } from '../../vendor/core/index.js';
import {
  allocateDuties,
  applyManualDutyOverride,
  buildBranchesInRoom,
  findConflictingTeacherIds,
  findWorkloadExcludedTeacherIds,
  occupancyFromAllocation,
  previewManualDutyOverride,
  type ManualDutyPreview,
} from '../../vendor/allocation-engine/index.js';
import { dutyRosterRepository, examRepository } from '../../services/repositories.js';

export default function DutyRosterPanel({
  exam,
  rooms,
  teachers,
  seatAllocation,
  allExams,
  allDutyRosters,
  onRosterChange,
}: {
  exam: Exam;
  rooms: Room[];
  teachers: Teacher[];
  seatAllocation?: AllocationResult;
  allExams: Exam[];
  allDutyRosters: DutyRoster[];
  onRosterChange: () => Promise<void>;
}) {
  const [studentsPerInvigilator, setStudentsPerInvigilator] = useState(30);
  const [maxDutiesPerDay, setMaxDutiesPerDay] = useState<number | ''>('');
  const [maxDutiesTotal, setMaxDutiesTotal] = useState<number | ''>('');
  const [avoidOwnBranch, setAvoidOwnBranch] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [moveTeacherId, setMoveTeacherId] = useState<string | null>(null);
  const [pending, setPending] = useState<{ teacherId: string; roomId: string; preview: ManualDutyPreview } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const examRosters = useMemo(
    () => allDutyRosters.filter((r) => r.examId === exam.id).sort((a, b) => b.version - a.version),
    [allDutyRosters, exam.id]
  );
  const roster = examRosters.find((r) => r.id === exam.activeDutyRosterId) ?? examRosters[0];
  const branchesInRoom = useMemo(() => buildBranchesInRoom(seatAllocation), [seatAllocation]);
  // Duty follows the seating: only rooms that actually have students get invigilators, sized by students seated.
  const occupancy = useMemo(() => occupancyFromAllocation(seatAllocation), [seatAllocation]);
  const allocationRooms = seatAllocation?.roomSnapshot ?? rooms;
  const displayRooms = useMemo(
    () => (seatAllocation ? allocationRooms.filter((r) => r.enabled && (occupancy[r.id] ?? 0) > 0) : rooms),
    [seatAllocation, allocationRooms, occupancy, rooms]
  );
  const unusedRoomCount = seatAllocation ? allocationRooms.filter((r) => r.enabled).length - displayRooms.length : 0;
  const staleSeating = !!(roster && seatAllocation && roster.basedOnAllocationId && roster.basedOnAllocationId !== seatAllocation.id);
  const legacySizing = !!(roster && roster.basis !== 'students');
  const teachersById = useMemo(() => new Map(teachers.map((t) => [t.id, t])), [teachers]);
  const roomsById = useMemo(() => new Map(rooms.map((r) => [r.id, r])), [rooms]);

  async function handleGenerate() {
    setError(null);
    setGenerating(true);
    try {
      const perDay = maxDutiesPerDay === '' ? undefined : maxDutiesPerDay;
      const total = maxDutiesTotal === '' ? undefined : maxDutiesTotal;
      const excludeTeacherIds = new Set([
        ...findConflictingTeacherIds(exam, allExams, allDutyRosters),
        ...findWorkloadExcludedTeacherIds(exam, allExams, allDutyRosters, perDay, total),
      ]);
      const next = allocateDuties({
        examId: exam.id,
        teachers,
        rooms: allocationRooms,
        occupancy,
        seatsPerInvigilator: studentsPerInvigilator,
        avoidOwnBranchInvigilation: avoidOwnBranch,
        maxDutiesPerDay: perDay,
        maxDutiesTotal: total,
        seatAllocation,
        excludeTeacherIds,
        version: examRosters.length + 1,
      });
      await dutyRosterRepository.create(next);
      await examRepository.update(exam.id, { dutyRosterIds: [...exam.dutyRosterIds, next.id], activeDutyRosterId: next.id });
      await onRosterChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGenerating(false);
    }
  }

  function handleRoomClick(roomId: string) {
    if (!moveTeacherId || !roster) return;
    const preview = previewManualDutyOverride(roster, moveTeacherId, roomId, teachers, allocationRooms, branchesInRoom);
    setPending({ teacherId: moveTeacherId, roomId, preview });
  }

  async function confirmMove(force: boolean) {
    if (!pending || !roster) return;
    const updated = applyManualDutyOverride(roster, pending.teacherId, pending.roomId, force, teachers, allocationRooms, branchesInRoom);
    await dutyRosterRepository.update(updated.id, updated);
    setPending(null);
    setMoveTeacherId(null);
    await onRosterChange();
  }

  return (
    <div className="card p-4">
      <div className="flex flex-wrap items-end gap-3 mb-3">
        <h2 className="text-sm font-semibold text-slate-800 self-center">Duty Roster (Invigilators)</h2>
        <Field label="Students per invigilator">
          <input
            type="number"
            min={1}
            className="input w-20"
            value={studentsPerInvigilator}
            onChange={(e) => setStudentsPerInvigilator(Math.max(1, Number(e.target.value) || 1))}
          />
        </Field>
        <Field label="Max duties / day">
          <input
            type="number"
            min={0}
            className="input w-20"
            placeholder="none"
            value={maxDutiesPerDay}
            onChange={(e) => setMaxDutiesPerDay(e.target.value === '' ? '' : Math.max(0, Number(e.target.value)))}
          />
        </Field>
        <Field label="Max duties total">
          <input
            type="number"
            min={0}
            className="input w-20"
            placeholder="none"
            value={maxDutiesTotal}
            onChange={(e) => setMaxDutiesTotal(e.target.value === '' ? '' : Math.max(0, Number(e.target.value)))}
          />
        </Field>
        <label className="text-xs text-slate-600 flex items-center gap-1.5 self-center">
          <input type="checkbox" checked={avoidOwnBranch} onChange={(e) => setAvoidOwnBranch(e.target.checked)} />
          Avoid own-branch invigilation
        </label>
        <button className="btn-primary ml-auto" onClick={handleGenerate} disabled={generating || teachers.length === 0 || !seatAllocation || displayRooms.length === 0}>
          {generating ? 'Generating…' : roster ? 'Regenerate Duty Roster' : 'Generate Duty Roster'}
        </button>
      </div>

      {error && <div className="mb-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</div>}

      {!seatAllocation && (
        <div className="mb-3 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
          Generate the seat allocation first - duty is given only to rooms that actually have students, sized by how many are seated.
        </div>
      )}
      {staleSeating && (
        <div className="mb-3 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
          The seating was regenerated after this duty roster was made, so it may not match the rooms in use now. Click Regenerate Duty Roster.
        </div>
      )}
      {roster && legacySizing && seatAllocation && !staleSeating && (
        <div className="mb-3 text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-md px-3 py-2">
          This roster was sized by room capacity. Regenerate to size it by students seated and skip unused rooms.
        </div>
      )}
      {seatAllocation && unusedRoomCount > 0 && (
        <div className="mb-2 text-xs text-slate-500">
          {unusedRoomCount} assigned room(s) have no students seated and get no duty.
        </div>
      )}
      <p className="mb-2 text-xs text-slate-400">For fair sharing of duties across a date range (e.g. a sessional) use the Duty Windows page.</p>

      {!roster && <div className="text-sm text-slate-500">No duty roster generated yet.</div>}

      {roster && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
            <MiniStat label="Rooms staffed" value={`${roster.validationReport.roomsFullyStaffed}/${roster.validationReport.totalRoomsNeeded}`} />
            <MiniStat label="Fulfillment score" value={`${roster.validationReport.balanceScore}%`} />
            <MiniStat label="Unassigned teachers" value={roster.unassignedTeacherIds.length} />
            <MiniStat label="Understaffed rooms" value={roster.understaffedRoomIds.length} tone={roster.understaffedRoomIds.length ? 'warn' : 'good'} />
          </div>

          {roster.validationReport.conflicts.length > 0 && (
            <div className="mb-3 text-sm bg-amber-50 border border-amber-200 rounded-md p-3 space-y-1">
              {roster.validationReport.conflicts.map((c) => (
                <div key={c.id} className="text-amber-800">
                  {c.description}
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2 mb-3 text-sm">
            <span className="text-slate-500">Move teacher:</span>
            <select className="input w-56" value={moveTeacherId ?? ''} onChange={(e) => setMoveTeacherId(e.target.value || null)}>
              <option value="">Select an assigned teacher…</option>
              {roster.assignments.map((a) => {
                const t = teachersById.get(a.teacherId);
                return t ? (
                  <option key={a.teacherId} value={a.teacherId}>
                    {t.name} ({t.branch})
                  </option>
                ) : null;
              })}
            </select>
            {moveTeacherId && <span className="text-xs text-slate-500">Click a room below to move them there.</span>}
          </div>

          {pending && (
            <div className="mb-3 border border-brand-300 bg-brand-50 rounded-md p-3 text-sm space-y-2">
              <div>
                Move to <strong>{roomsById.get(pending.roomId)?.name}</strong>?
              </div>
              {pending.preview.hardViolations.length > 0 && (
                <ul className="list-disc pl-5 text-amber-700">
                  {pending.preview.hardViolations.map((v) => (
                    <li key={v.id}>{v.description}</li>
                  ))}
                </ul>
              )}
              <div className="flex gap-2">
                <button className="btn-primary" disabled={pending.preview.hardViolations.length > 0} onClick={() => confirmMove(false)}>
                  Apply
                </button>
                {pending.preview.hardViolations.length > 0 && (
                  <button className="btn-danger" onClick={() => confirmMove(true)}>
                    Force Override
                  </button>
                )}
                <button className="btn-ghost" onClick={() => setPending(null)}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {displayRooms.map((room) => {
              const assigned = roster.assignments.filter((a) => a.roomId === room.id);
              const target = roster.roomDutyTargets[room.id] ?? 1;
              return (
                <button
                  key={room.id}
                  onClick={() => handleRoomClick(room.id)}
                  className={`text-left border rounded-md px-3 py-2 text-sm ${
                    moveTeacherId ? 'hover:bg-brand-50 border-brand-300 cursor-pointer' : 'border-slate-200'
                  }`}
                >
                  <div className="font-medium text-slate-800">
                    {room.name} <span className="text-xs text-slate-400">({assigned.length}/{target}{occupancy[room.id] ? ` · ${occupancy[room.id]} students` : ''})</span>
                  </div>
                  {assigned.length === 0 ? (
                    <div className="text-xs text-red-600">No invigilator assigned</div>
                  ) : (
                    assigned.map((a) => (
                      <div key={a.teacherId} className="text-xs text-slate-600">
                        {teachersById.get(a.teacherId)?.name ?? a.teacherId}
                      </div>
                    ))
                  )}
                </button>
              );
            })}
          </div>

          {roster.unassignedTeacherIds.length > 0 && (
            <div className="mt-3 text-sm">
              <div className="font-medium text-slate-700 mb-1">Not on duty this exam ({roster.unassignedTeacherIds.length})</div>
              <div className="flex flex-wrap gap-1.5">
                {roster.unassignedTeacherIds.map((id) => (
                  <span key={id} className="badge bg-slate-100 text-slate-600">
                    {teachersById.get(id)?.name ?? id}
                  </span>
                ))}
              </div>
            </div>
          )}
        </>
      )}
      {teachers.length === 0 && (
        <p className="text-xs text-slate-400 mt-2">Add teachers on the Teachers page before generating a duty roster.</p>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="label">{label}</div>
      {children}
    </div>
  );
}

function MiniStat({ label, value, tone = 'default' }: { label: string; value: string | number; tone?: 'default' | 'good' | 'warn' }) {
  const toneClass = { default: 'text-slate-900', good: 'text-emerald-600', warn: 'text-amber-600' }[tone];
  return (
    <div className="border border-slate-200 rounded-md px-3 py-2">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`text-lg font-semibold ${toneClass}`}>{value}</div>
    </div>
  );
}
