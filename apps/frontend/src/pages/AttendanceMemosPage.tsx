import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { DEFAULT_INSTITUTION, type AllocationResult, type InstitutionProfile } from '../vendor/core/index.js';
import { buildSecrecyMemos } from '../vendor/allocation-engine/index.js';
import { useAppData } from '../services/AppDataContext.js';
import { allocationRepository } from '../services/repositories.js';
import { getInstitution } from '../services/attendanceService.js';
import { exportMemosXlsx, memoExamName, printMemos, sessionLabel } from '../services/attendanceExport.js';
import PageHeader from '../components/PageHeader.js';

/** Forwarding memos for secrecy answer-books: one per branch + paper + semester in the sitting. */
export default function AttendanceMemosPage() {
  const { examId } = useParams();
  const { exams, students, attendances } = useAppData();
  const exam = exams.find((e) => e.id === examId);
  const attendance = attendances.find((a) => a.examId === examId);
  const [allocation, setAllocation] = useState<AllocationResult | undefined>();
  const [institution, setInstitution] = useState<InstitutionProfile>(DEFAULT_INSTITUTION);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    getInstitution().then(setInstitution);
  }, []);
  useEffect(() => {
    if (exam?.activeAllocationId) allocationRepository.getById(exam.activeAllocationId).then(setAllocation);
  }, [exam?.activeAllocationId]);

  const memos = useMemo(
    () => (exam ? buildSecrecyMemos({ exam, students: students.filter((s) => exam.studentIds.includes(s.id)), allocation, attendance }) : []),
    [exam, students, allocation, attendance]
  );

  if (!exam) return <div className="p-6 text-sm text-slate-500">Exam not found.</div>;

  return (
    <div>
      <PageHeader
        title="Answer-book memos"
        subtitle={`${exam.name} · one memo per branch, paper and semester`}
        actions={
          <>
            <Link to={`/attendance/${exam.id}`} className="btn-ghost">
              Back to marking
            </Link>
            <button className="btn-secondary" disabled={!memos.length} onClick={() => exportMemosXlsx({ institution, memos, filename: `memos-${exam.date}-${exam.startTime.replace(':', '')}.xlsx` })}>
              Excel
            </button>
            <button className="btn-primary" disabled={!memos.length} onClick={() => printMemos({ institution, memos })}>
              Print all (3 copies each)
            </button>
          </>
        }
      />
      <div className="p-6 space-y-3">
        {!attendance?.finalized && <div className="card p-3 text-xs text-amber-800 bg-amber-50 border-amber-200">Attendance is not finalized yet — memos reflect the marks entered so far.</div>}
        {memos.some((m) => m.unseated.length > 0) && (
          <div className="card p-3 text-xs text-amber-800 bg-amber-50 border-amber-200">
            Some candidates have no seat in the allocation, so they are missing from the room rows. Generate the allocation for this sitting first.
          </div>
        )}
        {memos.map((memo) => (
          <div key={memo.key} className="card">
            <button className="w-full text-left p-4 flex flex-wrap items-center gap-x-6 gap-y-1" onClick={() => setOpen(open === memo.key ? null : memo.key)}>
              <div className="font-medium min-w-[14rem]">
                {memo.branch} · {memoExamName(memo)}
              </div>
              <div className="text-sm text-slate-600 flex-1">
                {memo.subjectName} <span className="text-slate-400">({memo.subjectCode || 'no code'})</span> · {sessionLabel(memo.startTime)}
              </div>
              <div className="text-sm tabular-nums">
                {memo.presentTotal} (P) + {memo.absentTotal} (A) = <strong>{memo.grandTotal}</strong>
              </div>
              <span className="text-slate-400 text-xs">{open === memo.key ? 'Hide' : 'Preview'}</span>
            </button>
            {open === memo.key && (
              <div className="border-t border-slate-100 p-4 space-y-3 text-sm">
                <table className="table-base">
                  <thead>
                    <tr>
                      <th>Room</th>
                      <th>Roll numbers</th>
                      <th>Sub-total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {memo.rooms.map((r) => (
                      <tr key={r.roomId}>
                        <td className="font-medium">{r.roomName}</td>
                        <td className="font-mono text-xs">{r.ranges}</td>
                        <td>{r.count}</td>
                      </tr>
                    ))}
                    <tr>
                      <td colSpan={2} className="text-right font-medium">
                        Total answer-books
                      </td>
                      <td className="font-semibold">{memo.answerBooks}</td>
                    </tr>
                  </tbody>
                </table>
                <div>
                  <strong>(C) Absent:</strong> <span className="font-mono text-xs">{memo.absent.map((e) => e.rollNumber).join(', ') || '—'}</span>
                </div>
                <div>
                  <strong>(D) Unfair means:</strong> <span className="font-mono text-xs">{memo.umc.map((e) => `${e.rollNumber}${e.reason ? ` (${e.reason})` : ''}`).join(', ') || '—'}</span>
                </div>
                <div>
                  <strong>(E) Stray:</strong> <span className="font-mono text-xs">{memo.stray.map((e) => e.rollNumber).join(', ') || '—'}</span>
                </div>
                <div className="flex gap-2">
                  <button className="btn-secondary" onClick={() => printMemos({ institution, memos: [memo] })}>
                    Print this memo
                  </button>
                  <button className="btn-secondary" onClick={() => exportMemosXlsx({ institution, memos: [memo], filename: `memo-${memo.branch}-${memo.subjectCode || 'paper'}.xlsx` })}>
                    Excel
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
        {memos.length === 0 && <div className="card p-8 text-center text-sm text-slate-500">No candidates on this sitting.</div>}
      </div>
    </div>
  );
}
