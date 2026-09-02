import { useMemo, useState } from 'react';
import type { AllocationResult, Room, Student } from '../../vendor/core/index.js';
import { allocationReportRows, buildPrintableRoomSheet, exportAllocationCsv, exportAllocationJson, printHtml } from '../../services/exportService.js';

export default function ReportsPanel({
  allocation,
  students,
  rooms,
  examName,
  examDate,
}: {
  allocation: AllocationResult;
  students: Student[];
  rooms: Room[];
  examName: string;
  examDate: string;
}) {
  const [search, setSearch] = useState('');
  const rows = useMemo(() => allocationReportRows(allocation, students, rooms), [allocation, students, rooms]);
  const filteredRows = useMemo(() => {
    if (!search.trim()) return rows;
    const term = search.toLowerCase();
    return rows.filter((r) => r.rollNumber.toLowerCase().includes(term) || r.name.toLowerCase().includes(term));
  }, [rows, search]);

  const byBranch = useMemo(() => {
    const map = new Map<string, Map<string, number>>();
    for (const row of rows) {
      const roomMap = map.get(row.branch) ?? new Map<string, number>();
      roomMap.set(row.room, (roomMap.get(row.room) ?? 0) + 1);
      map.set(row.branch, roomMap);
    }
    return map;
  }, [rows]);

  const usedRooms = rooms.filter((r) => allocation.assignments.some((a) => a.roomId === r.id));

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-slate-800">Student-wise Allocation Report</h2>
          <div className="flex gap-2">
            <input className="input w-56" placeholder="Search roll number or name..." value={search} onChange={(e) => setSearch(e.target.value)} />
            <button className="btn-secondary" onClick={() => exportAllocationCsv(allocation, students, rooms, examName)}>
              Export CSV
            </button>
            <button className="btn-secondary" onClick={() => exportAllocationJson(allocation, examName)}>
              Export JSON
            </button>
          </div>
        </div>
        <div className="max-h-80 overflow-y-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>Roll Number</th>
                <th>Name</th>
                <th>Branch</th>
                <th>Year</th>
                <th>Section</th>
                <th>Room</th>
                <th>Seat</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((r) => (
                <tr key={r.rollNumber}>
                  <td className="font-mono">{r.rollNumber}</td>
                  <td>{r.name}</td>
                  <td>{r.branch}</td>
                  <td>{r.year}</td>
                  <td>{r.section}</td>
                  <td>{r.room}</td>
                  <td>{r.seatLabel}</td>
                </tr>
              ))}
              {filteredRows.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center text-slate-400 py-6">
                    No matches.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card p-4">
        <h2 className="text-sm font-semibold text-slate-800 mb-3">Branch / Room Breakdown</h2>
        <table className="table-base">
          <thead>
            <tr>
              <th>Branch</th>
              <th>Total</th>
              {usedRooms.map((r) => (
                <th key={r.id}>{r.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...byBranch.entries()].map(([branch, roomMap]) => (
              <tr key={branch}>
                <td>{branch}</td>
                <td>{[...roomMap.values()].reduce((a, b) => a + b, 0)}</td>
                {usedRooms.map((r) => (
                  <td key={r.id}>{roomMap.get(r.name) ?? 0}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card p-4">
        <h2 className="text-sm font-semibold text-slate-800 mb-3">Printable Room Sheets</h2>
        <div className="flex flex-wrap gap-2">
          {usedRooms.map((room) => (
            <button
              key={room.id}
              className="btn-secondary"
              onClick={() =>
                printHtml(
                  buildPrintableRoomSheet({
                    collegeName: 'Your College',
                    examName,
                    examDate,
                    room,
                    students,
                    assignments: allocation.assignments,
                  })
                )
              }
            >
              Print {room.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
