import type { Conflict } from '../../vendor/core/index.js';

const SEVERITY_STYLE: Record<Conflict['severity'], string> = {
  low: 'bg-slate-100 text-slate-600',
  medium: 'bg-amber-100 text-amber-700',
  high: 'bg-orange-100 text-orange-700',
  critical: 'bg-red-100 text-red-700',
};

export default function ConflictList({ conflicts }: { conflicts: Conflict[] }) {
  if (conflicts.length === 0) {
    return <div className="card p-4 text-sm text-emerald-700">No conflicts detected.</div>;
  }

  return (
    <div className="card p-4">
      <h2 className="text-sm font-semibold text-slate-800 mb-3">Conflicts ({conflicts.length})</h2>
      <div className="space-y-2 max-h-72 overflow-y-auto">
        {conflicts.map((c) => (
          <div key={c.id} className="border border-slate-200 rounded-md px-3 py-2">
            <div className="flex items-center gap-2 mb-1">
              <span className={`badge ${SEVERITY_STYLE[c.severity]}`}>{c.severity}</span>
              <span className="text-xs text-slate-400">{c.type}</span>
            </div>
            <div className="text-sm text-slate-700">{c.description}</div>
            {c.suggestedResolution && <div className="text-xs text-slate-500 mt-1">Suggestion: {c.suggestedResolution}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
