import type { AllocationResult, Room, Student, SubjectAssignment } from '../../vendor/core/index.js';
import { resolveSubjectForGroup } from '../../vendor/allocation-engine/index.js';
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
            title: `${student.rollNumber} — ${student.name} (${student.branch})${subject ? ` — ${subject.subjectName}` : ''}`,
          };
        }}
      />
    </div>
  );
}
