import type {
  AdjacencyRule,
  AllocationMode,
  BranchMixingMode,
  DistributionEntry,
  Room,
  RuleConfig,
  RuleMode,
  RulePriority,
  StudentGroupingAttribute,
  UtilizationStrategy,
  YearMixingMode,
} from '../vendor/core/index.js';

const ATTRIBUTES: StudentGroupingAttribute[] = ['branch', 'year', 'section', 'batch'];
const MODES: RuleMode[] = ['off', 'preferred', 'strict'];
const PRIORITIES: RulePriority[] = ['low', 'medium', 'high', 'critical'];

function newAdjacencyRule(): AdjacencyRule {
  return { enabled: true, attribute: 'branch', horizontal: true, vertical: false, diagonal: false, mode: 'strict', priority: 'high' };
}

export default function RuleConfigEditor({
  value,
  onChange,
  rooms,
}: {
  value: RuleConfig;
  onChange: (next: RuleConfig) => void;
  rooms: Room[];
}) {
  function updateAdjacency(i: number, patch: Partial<AdjacencyRule>) {
    const next = value.adjacencyRules.slice();
    next[i] = { ...next[i]!, ...patch };
    onChange({ ...value, adjacencyRules: next });
  }
  function removeAdjacency(i: number) {
    onChange({ ...value, adjacencyRules: value.adjacencyRules.filter((_, idx) => idx !== i) });
  }
  function addAdjacency() {
    onChange({ ...value, adjacencyRules: [...value.adjacencyRules, newAdjacencyRule()] });
  }

  function updateDistribution(i: number, patch: Partial<DistributionEntry>) {
    const next = value.distribution.slice();
    next[i] = { ...next[i]!, ...patch };
    onChange({ ...value, distribution: next });
  }
  function removeDistribution(i: number) {
    onChange({ ...value, distribution: value.distribution.filter((_, idx) => idx !== i) });
  }
  function addDistribution() {
    onChange({
      ...value,
      distribution: [...value.distribution, { roomId: rooms[0]?.id ?? '', branch: '', count: 10, mode: 'strict' }],
    });
  }

  return (
    <div className="space-y-5">
      <section>
        <h3 className="text-sm font-semibold text-slate-800 mb-2">Adjacency Rules</h3>
        <p className="text-xs text-slate-500 mb-2">
          When enabled, students sharing the same attribute cannot sit in the checked directions relative to each
          other. <strong>Strict</strong> is enforced absolutely; <strong>Preferred</strong> is scored but may be
          relaxed if needed.
        </p>
        <div className="space-y-2">
          {value.adjacencyRules.map((rule, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2 border border-slate-200 rounded-md px-3 py-2">
              <input type="checkbox" checked={rule.enabled} onChange={(e) => updateAdjacency(i, { enabled: e.target.checked })} />
              <span className="text-xs text-slate-500">Prevent same</span>
              <select className="input w-28" value={rule.attribute} onChange={(e) => updateAdjacency(i, { attribute: e.target.value as StudentGroupingAttribute })}>
                {ATTRIBUTES.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
              <label className="text-xs flex items-center gap-1">
                <input type="checkbox" checked={rule.horizontal} onChange={(e) => updateAdjacency(i, { horizontal: e.target.checked })} /> H
              </label>
              <label className="text-xs flex items-center gap-1">
                <input type="checkbox" checked={rule.vertical} onChange={(e) => updateAdjacency(i, { vertical: e.target.checked })} /> V
              </label>
              <label className="text-xs flex items-center gap-1">
                <input type="checkbox" checked={rule.diagonal} onChange={(e) => updateAdjacency(i, { diagonal: e.target.checked })} /> D
              </label>
              <select className="input w-28" value={rule.mode} onChange={(e) => updateAdjacency(i, { mode: e.target.value as RuleMode })}>
                {MODES.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
              <select className="input w-24" value={rule.priority} onChange={(e) => updateAdjacency(i, { priority: e.target.value as RulePriority })}>
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
              <button className="btn-ghost text-red-600 ml-auto" onClick={() => removeAdjacency(i)}>
                Remove
              </button>
            </div>
          ))}
        </div>
        <button className="btn-secondary mt-2" onClick={addAdjacency}>
          Add adjacency rule
        </button>
      </section>

      <section className="grid sm:grid-cols-2 gap-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-800 mb-2">Roll Number Continuity</h3>
          <p className="text-xs text-slate-500 mb-2">
            <strong>Strict</strong> hard-confines a branch group to the room it starts in until that room truly has no
            legal seat left (a split is then reported as a conflict, not hidden). <strong>Preferred</strong> is a
            softer nudge toward the same room/nearby seats but may still split for other priorities like utilization.
          </p>
          <select
            className="input"
            value={value.rollContinuity.mode}
            onChange={(e) => onChange({ ...value, rollContinuity: { ...value.rollContinuity, mode: e.target.value as RuleMode } })}
          >
            {MODES.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-slate-800 mb-2">Branch Continuity</h3>
          <select
            className="input"
            value={value.branchContinuity.mode}
            onChange={(e) => onChange({ ...value, branchContinuity: { ...value.branchContinuity, mode: e.target.value as RuleMode } })}
          >
            {MODES.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
      </section>

      <section className="grid sm:grid-cols-3 gap-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-800 mb-2">Utilization Strategy</h3>
          <select className="input" value={value.utilizationStrategy} onChange={(e) => onChange({ ...value, utilizationStrategy: e.target.value as UtilizationStrategy })}>
            {(['compact', 'spread', 'balanced', 'custom'] as UtilizationStrategy[]).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-slate-800 mb-2">Year Mixing</h3>
          <select className="input" value={value.yearMixing} onChange={(e) => onChange({ ...value, yearMixing: e.target.value as YearMixingMode })}>
            {(['mixed', 'year-wise', 'custom'] as YearMixingMode[]).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-slate-800 mb-2">Branch Mixing</h3>
          <select className="input" value={value.branchMixing} onChange={(e) => onChange({ ...value, branchMixing: e.target.value as BranchMixingMode })}>
            {(['mixed', 'partial', 'branch-specific', 'custom'] as BranchMixingMode[]).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </section>

      <section>
        <h3 className="text-sm font-semibold text-slate-800 mb-2">Allocation Mode</h3>
        <select className="input max-w-xs" value={value.allocationMode} onChange={(e) => onChange({ ...value, allocationMode: e.target.value as AllocationMode })}>
          {(['auto', 'strict-custom', 'balanced', 'minimum-rooms', 'maximum-separation'] as AllocationMode[]).map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </section>

      <section>
        <h3 className="text-sm font-semibold text-slate-800 mb-2">Explicit Room / Branch Distribution</h3>
        <p className="text-xs text-slate-500 mb-2">
          Reserve a specific number of seats for a branch in a room. <strong>Strict</strong> is enforced;{' '}
          <strong>Preferred</strong> is a soft bias.
        </p>
        <div className="space-y-2">
          {value.distribution.map((entry, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2 border border-slate-200 rounded-md px-3 py-2">
              <select className="input w-36" value={entry.roomId} onChange={(e) => updateDistribution(i, { roomId: e.target.value })}>
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
              <input className="input w-28" placeholder="Branch" value={entry.branch} onChange={(e) => updateDistribution(i, { branch: e.target.value })} />
              <input
                type="number"
                className="input w-20"
                value={entry.count ?? ''}
                onChange={(e) => updateDistribution(i, { count: e.target.value ? Number(e.target.value) : undefined })}
              />
              <select className="input w-28" value={entry.mode} onChange={(e) => updateDistribution(i, { mode: e.target.value as DistributionEntry['mode'] })}>
                <option value="strict">strict</option>
                <option value="preferred">preferred</option>
                <option value="auto">auto</option>
              </select>
              <button className="btn-ghost text-red-600 ml-auto" onClick={() => removeDistribution(i)}>
                Remove
              </button>
            </div>
          ))}
        </div>
        <button className="btn-secondary mt-2" onClick={addDistribution} disabled={rooms.length === 0}>
          Add distribution rule
        </button>
      </section>
    </div>
  );
}
