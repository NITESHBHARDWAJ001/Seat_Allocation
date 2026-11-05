/** 3x3 seat grid with one red-pen seat in the middle: "this is where you sit". */
export function LogoMark({ size = 32, className = '' }: { size?: number; className?: string }) {
  const cells = [0, 1, 2].flatMap((r) => [0, 1, 2].map((c) => [r, c] as const));
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={`shrink-0 ${className}`} aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="#f7f2e7" />
      {cells.map(([r, c]) => (
        <rect key={`${r}${c}`} x={6 + c * 7} y={6 + r * 7} width="6" height="6" rx="1.5" fill={r === 1 && c === 1 ? '#e4552d' : '#14264d'} />
      ))}
    </svg>
  );
}

export default function Logo({ light = false }: { light?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <LogoMark />
      <div className="leading-none">
        <div className={`font-display text-[17px] font-semibold tracking-tight ${light ? 'text-paper' : 'text-brand-900'}`}>Seat Allocator</div>
        <div className={`font-mono text-[9.5px] uppercase tracking-[0.18em] mt-1 ${light ? 'text-brand-200/70' : 'text-slate-500'}`}>Exam Room Desk</div>
      </div>
    </div>
  );
}
