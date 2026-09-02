import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { BlockReason, Seat } from '../vendor/core/index.js';
import { useAppData } from '../services/AppDataContext.js';
import { roomRepository } from '../services/repositories.js';
import PageHeader from '../components/PageHeader.js';
import SeatGridView from '../components/SeatGridView.js';

const REASONS: { value: BlockReason; label: string }[] = [
  { value: 'broken_desk', label: 'Broken desk' },
  { value: 'reserved', label: 'Reserved seat' },
  { value: 'damaged_chair', label: 'Damaged chair' },
  { value: 'teacher_desk', label: 'Teacher desk' },
  { value: 'obstruction', label: 'Obstruction' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'special_accommodation', label: 'Special accommodation' },
  { value: 'other', label: 'Other' },
];

export default function RoomLayoutPage() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const { rooms, refreshRooms } = useAppData();
  const room = rooms.find((r) => r.id === roomId);
  const [reason, setReason] = useState<BlockReason>('other');

  if (!room) {
    return (
      <div className="p-6 text-sm text-slate-500">
        Room not found. <Link to="/rooms" className="text-brand-700 hover:underline">Back to rooms</Link>
      </div>
    );
  }

  async function toggleSeat(seat: Seat) {
    if (!room) return;
    await roomRepository.setSeatBlocked(room.id, seat.id, !seat.blocked, seat.blocked ? undefined : reason);
    await refreshRooms();
  }

  async function rename(name: string) {
    if (!room) return;
    await roomRepository.update(room.id, { name });
    await refreshRooms();
  }

  return (
    <div>
      <PageHeader
        title={`Room Layout — ${room.name}`}
        subtitle="Click a seat to block or unblock it"
        actions={
          <button className="btn-secondary" onClick={() => navigate('/rooms')}>
            Back to Rooms
          </button>
        }
      />
      <div className="p-6 space-y-4">
        <div className="card p-4 flex flex-wrap items-end gap-4">
          <div>
            <div className="label">Room name</div>
            <input className="input" defaultValue={room.name} onBlur={(e) => rename(e.target.value)} />
          </div>
          <div>
            <div className="label">Block reason for next click</div>
            <select className="input" value={reason} onChange={(e) => setReason(e.target.value as BlockReason)}>
              {REASONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-3 text-xs text-slate-500 ml-auto">
            <LegendSwatch className="bg-white border-slate-300" label="Available" />
            <LegendSwatch className="bg-red-100 border-red-300" label="Blocked" />
          </div>
        </div>

        <div className="card p-4">
          <SeatGridView
            room={room}
            onSeatClick={toggleSeat}
            renderSeat={(seat) => ({
              content: seat.blocked ? '✕' : `${seat.row}-${seat.col}`,
              className: seat.blocked
                ? 'bg-red-100 border-red-300 text-red-700 hover:bg-red-200'
                : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-100',
              title: seat.blocked ? `Blocked: ${seat.blockedReason ?? 'unspecified'}` : 'Available — click to block',
            })}
          />
        </div>
      </div>
    </div>
  );
}

function LegendSwatch({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`w-3.5 h-3.5 rounded border ${className}`} />
      {label}
    </span>
  );
}
