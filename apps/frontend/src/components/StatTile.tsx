export default function StatTile({ label, value, tone = 'default', hint }: { label: string; value: string | number; tone?: 'default' | 'good' | 'bad' | 'warn'; hint?: string }) {
  const toneClass = {
    default: 'text-brand-900',
    good: 'text-emerald-700',
    bad: 'text-pen-600',
    warn: 'text-amber-700',
  }[tone];
  const stub = { default: 'bg-brand-800', good: 'bg-emerald-600', bad: 'bg-pen-500', warn: 'bg-marker-400' }[tone];

  return (
    <div className="ticket flex animate-rise">
      <div className={`w-1.5 shrink-0 ${stub}`} />
      <div className="px-4 py-3 min-w-0">
        <div className="font-mono text-[10.5px] font-medium uppercase tracking-[0.14em] text-slate-500 truncate">{label}</div>
        <div className={`font-display text-[34px] leading-none font-semibold mt-1.5 tabular-nums ${toneClass}`}>{value}</div>
        {hint && <div className="text-[11px] text-slate-500 mt-1.5 truncate">{hint}</div>}
      </div>
    </div>
  );
}
