import type { ValidationReport } from '../../vendor/core/index.js';

export default function ValidationPanel({ report }: { report: ValidationReport }) {
  return (
    <div className="card p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-800">Validation Report</h2>
        <div className="text-right">
          <div className="text-2xl font-semibold text-slate-900">{report.overallScore}%</div>
          <div className="text-xs text-slate-400">Overall score</div>
        </div>
      </div>

      <div>
        <div className="text-xs font-medium text-slate-500 mb-1.5">
          Hard constraints ({report.allocatedStudents}/{report.totalStudents} allocated)
        </div>
        <div className="grid sm:grid-cols-2 gap-1.5">
          {report.hardConstraints.map((c) => (
            <div key={c.id} className="flex items-center gap-2 text-sm">
              <span className={c.passed ? 'text-emerald-600' : 'text-red-600'}>{c.passed ? '✓' : '✗'}</span>
              <span className="text-slate-700">{c.label}</span>
              {c.details && <span className="text-xs text-slate-400">— {c.details}</span>}
            </div>
          ))}
        </div>
      </div>

      {report.softConstraints.length > 0 && (
        <div>
          <div className="text-xs font-medium text-slate-500 mb-1.5">Soft constraint scores</div>
          <div className="grid sm:grid-cols-2 gap-2">
            {report.softConstraints.map((s) => (
              <div key={s.id} className="flex items-center gap-2">
                <div className="w-32 text-xs text-slate-600 truncate">{s.label}</div>
                <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-brand-500" style={{ width: `${s.score}%` }} />
                </div>
                <div className="w-9 text-xs text-slate-500 text-right">{s.score}%</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
