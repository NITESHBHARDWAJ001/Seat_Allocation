import { useEffect, useMemo, useState } from 'react';
import type { AllocationResult, DutyTeacherQuota, DutyWindow } from '../vendor/core/index.js';
import { generateId } from '../vendor/core/index.js';
import { computeWindowDemand, defaultLockedExamIds, examsInWindow, planDutyWindow, type DutyWindowReport } from '../vendor/allocation-engine/index.js';
import { useAppData } from '../services/AppDataContext.js';
import { allocationRepository, dutyRosterRepository, examRepository } from '../services/repositories.js';
import { deleteDutyWindow, getDutyWindows, newDutyWindow, saveDutyWindow } from '../services/dutyWindows.js';
import PageHeader from '../components/PageHeader.js';

const numOrUndef = (v: string): number | undefined => (v === '' ? undefined : Math.max(0, Math.floor(Number(v)) || 0));

export default function DutyWindowsPage() {
  const { teachers, exams, dutyRosters, refreshExams, refreshDutyRosters } = useAppData();
  const [windows, setWindows] = useState<DutyWindow[]>([]);
  const [draft, setDraft] = useState<DutyWindow | null>(null);
  const [allocations, setAllocations] = useState<Record<string, AllocationResult | undefined>>({});
  const [report, setReport] = useState<DutyWindowReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    getDutyWindows().then((list) => {
      setWindows(list);
      setDraft((current) => current ?? list[0] ?? null);
    });
  }, []);

  useEffect(() => {
    allocationRepository.getAll().then((all) => {
      const byId = new Map(all.map((a) => [a.id, a]));
      const map: Record<string, AllocationResult | undefined> = {};
      for (const exam of exams) map[exam.id] = exam.activeAllocationId ? byId.get(exam.activeAllocationId) : undefined;
      setAllocations(map);
    });
  }, [exams]);

  const activeTeachers = useMemo(() => teachers.filter((t) => t.active), [teachers]);

  const demand = useMemo(() => (draft ? computeWindowDemand(draft, exams, allocations) : null), [draft, exams, allocations]);

  const capacity = useMemo(() => {
    if (!draft) return null;
    let eligible = 0;
    let total = 0;
    let unlimited = false;
    for (const t of activeTeachers) {
      const q = draft.perTeacher[t.id];
      if (q?.exempt) continue;
      eligible++;
      const max = q?.max ?? draft.defaultMaxDuties;
      if (max === undefined) unlimited = true;
      else total += max;
    }
    return { eligible, total, unlimited };
  }, [draft, activeTeachers]);

  const lockedCount = useMemo(() => {
    if (!draft) return 0;
    return defaultLockedExamIds(examsInWindow(draft, exams), dutyRosters).size;
  }, [draft, exams, dutyRosters]);

  function update(patch: Partial<DutyWindow>) {
    setDraft((d) => (d ? { ...d, ...patch } : d));
  }
  function updateQuota(teacherId: string, patch: Partial<DutyTeacherQuota>) {
    setDraft((d) => {
      if (!d) return d;
      const merged = { ...(d.perTeacher[teacherId] ?? {}), ...patch };
      const cleaned: DutyTeacherQuota = {};
      if (merged.exempt) cleaned.exempt = true;
      if (merged.min !== undefined) cleaned.min = merged.min;
      if (merged.max !== undefined) cleaned.max = merged.max;
      const perTeacher = { ...d.perTeacher };
      if (Object.keys(cleaned).length === 0) delete perTeacher[teacherId];
      else perTeacher[teacherId] = cleaned;
      return { ...d, perTeacher };
    });
  }

  async function handleNew() {
    const w = newDutyWindow(generateId('dutywindow'));
    setDraft(w);
    setReport(null);
    setMessage(null);
  }

  async function handleSave() {
    if (!draft) return;
    setWindows(await saveDutyWindow(draft));
    setMessage('Window saved.');
  }

  async function handleDelete() {
    if (!draft) return;
    const next = await deleteDutyWindow(draft.id);
    setWindows(next);
    setDraft(next[0] ?? null);
    setReport(null);
  }

  const dateError = draft && draft.endDate < draft.startDate ? 'End date is before the start date.' : null;

  async function handleGenerate() {
    if (!draft || dateError) return;
    setBusy(true);
    setMessage(null);
    try {
      setWindows(await saveDutyWindow(draft));
      const result = planDutyWindow({
        window: draft,
        exams,
        allocationsByExamId: allocations,
        teachers,
        existingRosters: dutyRosters,
      });
      for (const roster of result.rosters) {
        const exam = exams.find((e) => e.id === roster.examId);
        if (!exam) continue;
        await dutyRosterRepository.create(roster);
        await examRepository.update(exam.id, { dutyRosterIds: [...exam.dutyRosterIds, roster.id], activeDutyRosterId: roster.id });
      }
      // Refreshing shared app data is what keeps the Duty Chart (and each exam's roster panel) up to date.
      await Promise.all([refreshExams(), refreshDutyRosters()]);
      setReport(result.report);
      setMessage(`Duties generated for ${result.rosters.length} session(s). The Duty Chart is already updated.`);
    } catch (e) {
      setMessage(`Could not generate duties: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Duty Windows"
        subtitle="Share invigilation duties fairly across a date range (e.g. a sessional) - only occupied rooms, sized by students seated"
        actions={
          <button className="btn-primary" onClick={handleNew}>
            New window
          </button>
        }
      />
      <div className="p-6 space-y-5 max-w-5xl">
        {windows.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {windows.map((w) => (
              <button
                key={w.id}
                className={`px-3 py-1.5 rounded-full border text-sm ${draft?.id === w.id ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'}`}
                onClick={() => {
                  setDraft(w);
                  setReport(null);
                  setMessage(null);
                }}
              >
                {w.name} <span className="opacity-70">{w.startDate} → {w.endDate}</span>
              </button>
            ))}
          </div>
        )}

        {!draft ? (
          <div className="card p-8 text-center text-sm text-slate-500">
            No duty window yet. Click <strong>New window</strong> to set a date range and how many duties each teacher should do in it.
          </div>
        ) : (
          <>
            <div className="card p-4 space-y-3">
              <h2 className="text-sm font-semibold text-slate-800">Window rules</h2>
              <div className="grid sm:grid-cols-4 gap-3">
                <Field label="Name">
                  <input className="input" value={draft.name} onChange={(e) => update({ name: e.target.value })} />
                </Field>
                <Field label="From date">
                  <input type="date" className="input" value={draft.startDate} onChange={(e) => update({ startDate: e.target.value })} />
                </Field>
                <Field label="To date">
                  <input type="date" className="input" value={draft.endDate} onChange={(e) => update({ endDate: e.target.value })} />
                </Field>
                <Field label="Students per invigilator">
                  <input
                    type="number"
                    min={1}
                    className="input"
                    value={draft.studentsPerInvigilator}
                    onChange={(e) => update({ studentsPerInvigilator: Math.max(1, Number(e.target.value) || 1) })}
                  />
                </Field>
                <Field label="Min duties / teacher">
                  <input type="number" min={0} className="input" placeholder="none" value={draft.defaultMinDuties ?? ''} onChange={(e) => update({ defaultMinDuties: numOrUndef(e.target.value) })} />
                </Field>
                <Field label="Max duties / teacher">
                  <input type="number" min={0} className="input" placeholder="no limit" value={draft.defaultMaxDuties ?? ''} onChange={(e) => update({ defaultMaxDuties: numOrUndef(e.target.value) })} />
                </Field>
                <Field label="Max sessions / day">
                  <input type="number" min={0} className="input" placeholder="no limit" value={draft.maxPerDay ?? ''} onChange={(e) => update({ maxPerDay: numOrUndef(e.target.value) })} />
                </Field>
                <label className="text-xs text-slate-600 flex items-center gap-1.5 self-end pb-2">
                  <input type="checkbox" checked={draft.avoidOwnBranchInvigilation} onChange={(e) => update({ avoidOwnBranchInvigilation: e.target.checked })} />
                  Avoid own-branch invigilation
                </label>
              </div>
              {dateError && <div className="text-xs text-red-600">{dateError}</div>}
              <div className="flex gap-2">
                <button className="btn-secondary" onClick={handleSave}>
                  Save window
                </button>
                {windows.some((w) => w.id === draft.id) && (
                  <button className="btn-ghost text-red-600" onClick={handleDelete}>
                    Delete window
                  </button>
                )}
              </div>
            </div>

            {demand && capacity && (
              <div className="card p-4 space-y-3">
                <h2 className="text-sm font-semibold text-slate-800">What this window needs</h2>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  <Tile label="Exams in range" value={demand.examsInWindow} />
                  <Tile label="With seating" value={demand.sessions.length} />
                  <Tile label="Duty slots needed" value={demand.totalSlots} />
                  <Tile label="Teachers available" value={capacity.eligible} />
                  <Tile
                    label="Fair share each"
                    value={capacity.eligible > 0 ? (demand.totalSlots / capacity.eligible).toFixed(1) : '—'}
                  />
                </div>
                {!capacity.unlimited && capacity.total < demand.totalSlots && (
                  <div className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                    Teacher limits allow only {capacity.total} duties but {demand.totalSlots} slots are needed - {demand.totalSlots - capacity.total} would stay unfilled. Raise the max or add teachers.
                  </div>
                )}
                {capacity.eligible === 0 && <div className="text-sm text-amber-800">No available teachers. Add teachers on the Teachers page.</div>}
                {demand.skipped.length > 0 && (
                  <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                    Will be skipped: {demand.skipped.map((s) => `${s.examName} (${s.reason})`).join('; ')}.
                  </div>
                )}
                {lockedCount > 0 && (
                  <div className="text-xs text-slate-600">
                    {lockedCount} exam(s) have hand-edited duty rosters - they are kept as they are and still count toward each teacher's total.
                  </div>
                )}
                {demand.sessions.length > 0 && (
                  <div className="overflow-x-auto max-h-56 overflow-y-auto">
                    <table className="table-base">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Time</th>
                          <th>Session</th>
                          <th>Occupied rooms</th>
                          <th>Invigilators needed</th>
                        </tr>
                      </thead>
                      <tbody>
                        {demand.sessions.map((s) => (
                          <tr key={s.examId}>
                            <td>{s.date}</td>
                            <td>{s.startTime}</td>
                            <td>{s.name}</td>
                            <td>{s.occupiedRooms}</td>
                            <td>{s.slots}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <div className="flex items-center gap-3">
                  <button className="btn-primary" onClick={handleGenerate} disabled={busy || !!dateError || demand.sessions.length === 0 || activeTeachers.length === 0}>
                    {busy ? 'Generating…' : 'Generate fair duties for this window'}
                  </button>
                  {demand.sessions.length === 0 && <span className="text-xs text-slate-500">Generate seating for the exams in this range first.</span>}
                </div>
                {message && <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-3 py-2">{message}</div>}
              </div>
            )}

            <div className="card p-4">
              <h2 className="text-sm font-semibold text-slate-800 mb-1">Per-teacher limits (optional)</h2>
              <p className="text-xs text-slate-500 mb-2">Leave blank to use the window defaults. Tick Exempt for teachers who should get no duty (e.g. HOD, on leave).</p>
              <div className="max-h-72 overflow-y-auto">
                <table className="table-base">
                  <thead>
                    <tr>
                      <th>Teacher</th>
                      <th>Branch</th>
                      <th>Exempt</th>
                      <th>Min</th>
                      <th>Max</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeTeachers.map((t) => {
                      const q = draft.perTeacher[t.id] ?? {};
                      return (
                        <tr key={t.id}>
                          <td>{t.name}</td>
                          <td>{t.branch}</td>
                          <td>
                            <input type="checkbox" checked={!!q.exempt} onChange={(e) => updateQuota(t.id, { exempt: e.target.checked })} />
                          </td>
                          <td>
                            <input type="number" min={0} className="input w-20" placeholder={draft.defaultMinDuties?.toString() ?? '—'} value={q.min ?? ''} onChange={(e) => updateQuota(t.id, { min: numOrUndef(e.target.value) })} disabled={!!q.exempt} />
                          </td>
                          <td>
                            <input type="number" min={0} className="input w-20" placeholder={draft.defaultMaxDuties?.toString() ?? '—'} value={q.max ?? ''} onChange={(e) => updateQuota(t.id, { max: numOrUndef(e.target.value) })} disabled={!!q.exempt} />
                          </td>
                        </tr>
                      );
                    })}
                    {activeTeachers.length === 0 && (
                      <tr>
                        <td colSpan={5} className="text-center text-slate-400 py-6">
                          No teachers yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {report && (
              <div className="card p-4 space-y-3">
                <h2 className="text-sm font-semibold text-slate-800">Result</h2>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <Tile label="Sessions planned" value={report.examsPlanned} />
                  <Tile label="Slots filled" value={`${report.filledSlots}/${report.totalSlots}`} tone={report.unfilledSlots ? 'warn' : 'good'} />
                  <Tile label="Busiest − quietest" value={report.spread} tone={report.spread <= 1 ? 'good' : 'warn'} />
                  <Tile label="Kept (hand-edited)" value={report.examsKept} />
                </div>
                {report.warnings.length > 0 && (
                  <ul className="list-disc pl-5 text-sm text-amber-800 space-y-1">
                    {report.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                )}
                <div className="max-h-96 overflow-y-auto">
                  <table className="table-base">
                    <thead>
                      <tr>
                        <th>Teacher</th>
                        <th>Branch</th>
                        <th>Duties</th>
                        <th>Limit</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.teachers.map((t) => {
                        const top = Math.max(1, ...report.teachers.map((x) => x.duties));
                        return (
                          <tr key={t.teacherId} className={t.exempt ? 'text-slate-400' : ''}>
                            <td>{t.name}</td>
                            <td>{t.branch}</td>
                            <td className="font-medium">{t.duties}</td>
                            <td className="text-xs">
                              {t.exempt ? 'exempt' : `${t.min !== undefined ? `min ${t.min}` : ''}${t.min !== undefined && t.max !== undefined ? ' · ' : ''}${t.max !== undefined ? `max ${t.max}` : ''}` || '—'}
                              {t.belowMin && <span className="ml-1 text-amber-700">below min</span>}
                            </td>
                            <td className="w-40">
                              <div className="h-2 bg-slate-100 rounded">
                                <div className={`h-2 rounded ${t.belowMin ? 'bg-amber-400' : 'bg-brand-500'}`} style={{ width: `${(t.duties / top) * 100}%` }} />
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>
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

function Tile({ label, value, tone = 'default' }: { label: string; value: string | number; tone?: 'default' | 'good' | 'warn' }) {
  const toneClass = { default: 'text-slate-900', good: 'text-emerald-600', warn: 'text-amber-600' }[tone];
  return (
    <div className="border border-slate-200 rounded-md px-3 py-2">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`text-lg font-semibold ${toneClass}`}>{value}</div>
    </div>
  );
}
