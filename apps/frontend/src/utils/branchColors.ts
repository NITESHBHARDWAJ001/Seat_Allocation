const PALETTE = [
  'bg-blue-100 border-blue-300 text-blue-800',
  'bg-emerald-100 border-emerald-300 text-emerald-800',
  'bg-amber-100 border-amber-300 text-amber-800',
  'bg-violet-100 border-violet-300 text-violet-800',
  'bg-rose-100 border-rose-300 text-rose-800',
  'bg-cyan-100 border-cyan-300 text-cyan-800',
  'bg-lime-100 border-lime-300 text-lime-800',
  'bg-orange-100 border-orange-300 text-orange-800',
];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/**
 * Deterministic color per branch, used only as a supplementary visual cue —
 * every seat also always shows the student's roll number as text, so the UI
 * never relies on color alone (spec §49).
 */
export function branchColorClass(branch: string): string {
  const idx = hash(branch) % PALETTE.length;
  return PALETTE[idx]!;
}
