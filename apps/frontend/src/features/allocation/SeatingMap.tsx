import type { AllocationResult, Room, Student, SubjectAssignment } from '../../vendor/core/index.js';
import { computeRoomLaneSubjects, resolveSubjectForGroup, type LaneGroupLabel, type LaneSubjectLabel } from '../../vendor/allocation-engine/index.js';
import SeatGridView from '../../components/SeatGridView.js';
import { branchColorClass } from '../../utils/branchColors.js';

export default function SeatingMap({
  room,
  allocation,
  students,
  onSeatClick,
  highlightSeatId,
  highlightStudentId,
  subjectAssignments = [],
}: {
  room: Room;
  allocation: AllocationResult;
  students: Student[];
  onSeatClick?: (seatId: string) => void;
  highlightSeatId?: string | null;
  highlightStudentId?: string | null;
  subjectAssignments?: SubjectAssignment[];
}) {
  const studentsById = new Map(students.map((s) => [s.id, s]));
  const seatToStudent = new Map(
    allocation.assignments.filter((a) => a.roomId === room.id).map((a) => [a.seatId, studentsById.get(a.studentId)] as const)
  );

  const branchYearsInRoom = new Set(
    [...seatToStudent.values()].filter((s): s is Student => !!s).map((s) => `${s.branch}|${s.year}`)
  );
  // Post-allocation labelling only - reads the finished allocation, never affects placement.
  const laneSubjects = computeRoomLaneSubjects({
    room,
    assignments: allocation.assignments,
    students,
    subjectAssignments,
    adjacencyRules: allocation.configSnapshot.adjacencyRules,
  });
  const laneByIndex = new Map<number, LaneSubjectLabel>(laneSubjects.lanes.map((l) => [l.index, l]));
  const groupText = (g: LaneGroupLabel): string => (g.subjectName ? `${g.subjectName}${g.subjectCode ? ` (${g.subjectCode})` : ''}` : `${g.branch}-Y${g.year}: no subject`);
  const laneText = (lane: LaneSubjectLabel): string => lane.groups.map((g) => `${g.branch}-Y${g.year}: ${groupText(g)}`).join(' | ');
  const laneBadge = (lane: LaneSubjectLabel | undefined) =>
    lane ? (
      <div
        title={laneText(lane)}
        className={`text-[10px] leading-tight px-1 py-0.5 rounded border truncate ${
          lane.mixed ? 'bg-amber-50 border-amber-300 text-amber-800' : 'bg-brand-50 border-brand-200 text-brand-800'
        }`}
      >
        {lane.mixed ? `Mixed: ${laneText(lane)}` : groupText(lane.groups[0]!)}
      </div>
    ) : null;
  const seatSubject = (label: LaneGroupLabel | undefined) => (label ? groupText(label) : '');
  const laneLabel = laneSubjects.direction === 'row' ? 'Row' : laneSubjects.direction === 'column' ? 'Column' : '';

  const subjectsInRoom = subjectAssignments.filter((a) => branchYearsInRoom.has(`${a.branch}|${a.year}`));

  return (
    <div>
      {subjectsInRoom.length > 0 && (
        <div className="text-xs text-slate-500 mb-2">
          Subjects in this room:{' '}
          {subjectsInRoom.map((s, i) => (
            <span key={s.id}>
              {i > 0 && '; '}
              <strong className="text-slate-700">
                {s.branch}-Y{s.year}
              </strong>{' '}
              {s.subjectName}
            </span>
          ))}
        </div>
      )}
      <SeatGridView
        room={room}
        rowPrefix={laneSubjects.direction === 'row' ? (rowIndex) => laneBadge(laneByIndex.get(rowIndex)) : undefined}
        colHeader={
          laneSubjects.direction === 'column'
            ? (col) => {
                const lane = laneByIndex.get(col);
                return lane ? (
                  <div
                    title={laneText(lane)}
                    style={{ writingMode: 'vertical-rl' }}
                    className={`text-[10px] max-h-24 overflow-hidden rounded border px-0.5 ${lane.mixed ? 'bg-amber-50 border-amber-300 text-amber-800' : 'bg-brand-50 border-brand-200 text-brand-800'}`}
                  >
                    {lane.mixed ? `Mixed: ${laneText(lane)}` : groupText(lane.groups[0]!)}
                  </div>
                ) : null;
              }
            : undefined
        }
        onSeatClick={onSeatClick ? (seat) => onSeatClick(seat.id) : undefined}
        renderSeat={(seat) => {
          if (seat.blocked) {
            return { content: '✕', className: 'bg-slate-100 border-slate-300 text-slate-400', title: 'Blocked' };
          }
          const student = seatToStudent.get(seat.id);
          const isHighlighted = seat.id === highlightSeatId || (!!student && student.id === highlightStudentId);
          if (!student) {
            return {
              content: '',
              className: `bg-white border-dashed ${isHighlighted ? 'border-brand-500 ring-2 ring-brand-300' : 'border-slate-300'} hover:bg-slate-50`,
              title: 'Empty seat',
            };
          }
          const subject = resolveSubjectForGroup(student.branch, student.year, subjectAssignments);
          return {
            content: student.rollNumber.slice(-4),
            className: `${branchColorClass(student.branch)} ${isHighlighted ? 'ring-2 ring-brand-500' : ''}`,
            title: `${student.rollNumber} — ${student.name} (${student.branch})${subject ? ` — ${subject.subjectName}` : ''}${laneSubjects.direction === 'seat' ? ` [${seatSubject(laneSubjects.seats[seat.id])}]` : ''}`,
          };
        }}
      />
      {laneSubjects.direction !== 'none' && (
        <div className="mt-3 text-xs text-slate-600 space-y-0.5">
          <div className="font-medium text-slate-700">Subject legend</div>
          {laneSubjects.direction === 'seat'
            ? [...new Map(Object.values(laneSubjects.seats).map((g) => [g.groupKey, g])).values()]
                .sort((a, b) => a.branch.localeCompare(b.branch) || a.year - b.year)
                .map((g) => (
                  <div key={g.groupKey}>
                    {g.branch}-Y{g.year} — {groupText(g)}
                  </div>
                ))
            : laneSubjects.lanes.map((lane) => (
                <div key={lane.index}>
                  {laneLabel} {lane.index} — {lane.mixed ? `Mixed: ${laneText(lane)}` : groupText(lane.groups[0]!)}
                </div>
              ))}
        </div>
      )}
    </div>
  );
}
