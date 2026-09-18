import type { ReactNode } from 'react';
import type { Room, Seat } from '../vendor/core/index.js';

export interface SeatCellRender {
  content: ReactNode;
  className: string;
  title?: string;
}

export default function SeatGridView({
  room,
  renderSeat,
  onSeatClick,
  rowPrefix,
  colHeader,
}: {
  room: Room;
  renderSeat: (seat: Seat) => SeatCellRender;
  onSeatClick?: (seat: Seat) => void;
  /** Optional label rendered in front of a row (e.g. that row's subject). */
  rowPrefix?: (rowIndex: number) => ReactNode;
  /** Optional label rendered above a column number (e.g. that column's subject). */
  colHeader?: (col: number) => ReactNode;
}) {
  const rowsByIndex = new Map<number, Seat[]>();
  for (const seat of room.seats) {
    const list = rowsByIndex.get(seat.row) ?? [];
    list.push(seat);
    rowsByIndex.set(seat.row, list);
  }
  const sortedRows = [...rowsByIndex.entries()].sort((a, b) => a[0] - b[0]);
  const maxCols = Math.max(1, ...room.seats.map((s) => s.col));
  // Header rows must clear the R-label (2.5rem) plus the optional prefix column (11rem + 0.5rem gap).
  const headerPad = { paddingLeft: rowPrefix ? '14rem' : '2.5rem' };

  return (
    <div className="overflow-x-auto">
      <div className="inline-block">
        {colHeader && (
          <div className="flex mb-1" style={headerPad}>
            {Array.from({ length: maxCols }, (_, i) => i + 1).map((c) => (
              <div key={c} className="w-11 shrink-0 mx-0.5 flex justify-center">
                {colHeader(c)}
              </div>
            ))}
          </div>
        )}
        <div className="flex mb-1" style={headerPad}>
          {Array.from({ length: maxCols }, (_, i) => i + 1).map((c) => (
            <div key={c} className="w-11 shrink-0 mx-0.5 text-center text-[10px] text-slate-400">
              {c}
            </div>
          ))}
        </div>
        {sortedRows.map(([rowIndex, seats]) => (
          <div key={rowIndex} className="flex items-center mb-1">
            {rowPrefix && <div className="w-44 shrink-0 mr-2">{rowPrefix(rowIndex)}</div>}
            <div className="w-10 shrink-0 text-xs text-slate-400 text-right pr-2">R{rowIndex}</div>
            {seats
              .slice()
              .sort((a, b) => a.col - b.col)
              .map((seat) => {
                const cell = renderSeat(seat);
                return (
                  <button
                    key={seat.id}
                    type="button"
                    title={cell.title}
                    onClick={() => onSeatClick?.(seat)}
                    className={`w-11 h-9 shrink-0 mx-0.5 rounded border text-[10px] leading-tight flex items-center justify-center font-medium ${cell.className}`}
                  >
                    {cell.content}
                  </button>
                );
              })}
          </div>
        ))}
      </div>
    </div>
  );
}
