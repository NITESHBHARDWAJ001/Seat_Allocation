import { useState } from 'react';
import { Link } from 'react-router-dom';
import { buildIrregularRoom, buildRegularRoom, generateId, roomAvailableSeats, roomCapacity } from '../vendor/core/index.js';
import { useAppData } from '../services/AppDataContext.js';
import { roomRepository } from '../services/repositories.js';
import PageHeader from '../components/PageHeader.js';

export default function RoomsPage() {
  const { rooms, refreshRooms } = useAppData();
  const [showAdd, setShowAdd] = useState(false);
  const [layoutMode, setLayoutMode] = useState<'regular' | 'irregular'>('regular');
  const [name, setName] = useState('');
  const [building, setBuilding] = useState('');
  const [rows, setRows] = useState(6);
  const [seatsPerRow, setSeatsPerRow] = useState(10);
  const [irregularRows, setIrregularRows] = useState('10, 10, 8, 10, 6, 10');
  const [priority, setPriority] = useState(1);
  const [showBulk, setShowBulk] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [bulkError, setBulkError] = useState<string | null>(null);

  function parseBulk(): { valid: ReturnType<typeof buildRegularRoom>[]; errors: string[] } {
    const lines = bulkText
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    const valid: ReturnType<typeof buildRegularRoom>[] = [];
    const errors: string[] = [];
    lines.forEach((line, idx) => {
      const parts = line.split(',').map((p) => p.trim());
      const [roomName, rowsStr, seatsPerRowStr, priorityStr, building] = parts;
      if (!roomName || !rowsStr || !seatsPerRowStr) {
        errors.push(`Line ${idx + 1}: expected "name, rows, seatsPerRow[, priority, building]"`);
        return;
      }
      const rowsN = Number(rowsStr);
      const seatsN = Number(seatsPerRowStr);
      if (!Number.isFinite(rowsN) || rowsN <= 0 || !Number.isFinite(seatsN) || seatsN <= 0) {
        errors.push(`Line ${idx + 1}: rows/seatsPerRow must be positive numbers.`);
        return;
      }
      valid.push(
        buildRegularRoom({
          id: generateId('room'),
          name: roomName,
          building: building || undefined,
          rows: rowsN,
          seatsPerRow: seatsN,
          priority: priorityStr ? Number(priorityStr) || 1 : 1,
        })
      );
    });
    return { valid, errors };
  }

  async function handleBulkImport() {
    const { valid, errors } = parseBulk();
    if (errors.length) {
      setBulkError(errors.join('\n'));
      return;
    }
    if (valid.length === 0) {
      setBulkError('No valid rows found.');
      return;
    }
    for (const room of valid) {
      await roomRepository.create(room);
    }
    setBulkText('');
    setBulkError(null);
    setShowBulk(false);
    await refreshRooms();
  }

  async function handleAdd() {
    if (!name.trim()) return;
    const id = generateId('room');
    const room =
      layoutMode === 'regular'
        ? buildRegularRoom({ id, name: name.trim(), building: building.trim() || undefined, rows, seatsPerRow, priority })
        : buildIrregularRoom({
            id,
            name: name.trim(),
            building: building.trim() || undefined,
            rowSeatCounts: irregularRows
              .split(',')
              .map((s) => Number(s.trim()))
              .filter((n) => Number.isFinite(n) && n > 0),
            priority,
          });
    await roomRepository.create(room);
    setName('');
    setBuilding('');
    setShowAdd(false);
    await refreshRooms();
  }

  async function toggleEnabled(id: string, enabled: boolean) {
    await roomRepository.update(id, { enabled: !enabled });
    await refreshRooms();
  }

  async function updatePriority(id: string, value: number) {
    await roomRepository.update(id, { priority: value });
    await refreshRooms();
  }

  async function remove(id: string) {
    await roomRepository.remove(id);
    await refreshRooms();
  }

  return (
    <div>
      <PageHeader
        title="Rooms"
        subtitle={`${rooms.length} total`}
        actions={
          <>
            <button className="btn-secondary" onClick={() => setShowBulk((v) => !v)}>
              Bulk Import
            </button>
            <button className="btn-primary" onClick={() => setShowAdd((v) => !v)}>
              Add Room
            </button>
          </>
        }
      />

      <div className="p-6 space-y-4">
        {showBulk && (
          <div className="card p-4 space-y-2">
            <div className="text-sm font-medium text-slate-700">Bulk paste import</div>
            <p className="text-xs text-slate-500">
              One room per line: <code>name, rows, seatsPerRow[, priority, building]</code> — creates regular grid
              rooms. Irregular layouts still need the visual layout editor.
            </p>
            <textarea
              className="input font-mono h-32"
              placeholder={'B1, 6, 10\nB2, 6, 10, 2'}
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
            />
            {bulkError && <pre className="text-xs text-red-600 whitespace-pre-wrap">{bulkError}</pre>}
            <div className="flex gap-2">
              <button className="btn-primary" onClick={handleBulkImport}>
                Import
              </button>
              <button className="btn-ghost" onClick={() => setShowBulk(false)}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {showAdd && (
          <div className="card p-4 space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <div className="label">Room Name</div>
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="A101" />
              </div>
              <div>
                <div className="label">Building</div>
                <input className="input" value={building} onChange={(e) => setBuilding(e.target.value)} placeholder="Block A" />
              </div>
              <div>
                <div className="label">Priority (1 = highest)</div>
                <input type="number" className="input" value={priority} onChange={(e) => setPriority(Number(e.target.value))} />
              </div>
              <div>
                <div className="label">Layout</div>
                <select className="input" value={layoutMode} onChange={(e) => setLayoutMode(e.target.value as 'regular' | 'irregular')}>
                  <option value="regular">Regular grid</option>
                  <option value="irregular">Irregular rows</option>
                </select>
              </div>
            </div>

            {layoutMode === 'regular' ? (
              <div className="grid grid-cols-2 gap-3 max-w-sm">
                <div>
                  <div className="label">Rows</div>
                  <input type="number" className="input" value={rows} onChange={(e) => setRows(Number(e.target.value))} />
                </div>
                <div>
                  <div className="label">Seats per row</div>
                  <input type="number" className="input" value={seatsPerRow} onChange={(e) => setSeatsPerRow(Number(e.target.value))} />
                </div>
              </div>
            ) : (
              <div>
                <div className="label">Seats per row (comma-separated, one number per row)</div>
                <input className="input" value={irregularRows} onChange={(e) => setIrregularRows(e.target.value)} />
              </div>
            )}

            <div className="flex gap-2">
              <button className="btn-primary" onClick={handleAdd}>
                Save Room
              </button>
              <button className="btn-ghost" onClick={() => setShowAdd(false)}>
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {rooms.map((room) => {
            const available = roomAvailableSeats(room).length;
            const capacity = roomCapacity(room);
            return (
              <div key={room.id} className="card p-4 space-y-2">
                <div className="flex items-start justify-between">
                  <div>
                    <Link to={`/rooms/${room.id}`} className="font-semibold text-brand-700 hover:underline">
                      {room.name}
                    </Link>
                    <div className="text-xs text-slate-500">{room.building ?? 'No building set'}</div>
                  </div>
                  <button
                    className={`badge ${room.enabled ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}
                    onClick={() => toggleEnabled(room.id, room.enabled)}
                  >
                    {room.enabled ? 'Enabled' : 'Disabled'}
                  </button>
                </div>
                <div className="text-sm text-slate-600 grid grid-cols-2 gap-y-1">
                  <span>Rows: {room.rows.length}</span>
                  <span>Capacity: {capacity}</span>
                  <span>Available: {available}</span>
                  <span>Blocked: {room.seats.filter((s) => s.blocked).length}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-slate-500">Priority</span>
                  <input
                    type="number"
                    className="input w-16"
                    value={room.priority}
                    onChange={(e) => updatePriority(room.id, Number(e.target.value))}
                  />
                </div>
                <div className="flex gap-2 pt-1">
                  <Link to={`/rooms/${room.id}`} className="btn-secondary">
                    Edit Layout
                  </Link>
                  <button className="btn-ghost text-red-600" onClick={() => remove(room.id)}>
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
          {rooms.length === 0 && <div className="text-sm text-slate-500">No rooms yet. Add one to get started.</div>}
        </div>
      </div>
    </div>
  );
}
