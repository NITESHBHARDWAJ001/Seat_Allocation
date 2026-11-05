const PALETTE = [
  'bg-brand-100 border-brand-300 text-brand-800',
  'bg-pen-100 border-pen-300 text-pen-700',
  'bg-marker-200 border-marker-400 text-amber-900',
  'bg-emerald-100 border-emerald-300 text-emerald-800',
  'bg-fuchsia-100 border-fuchsia-300 text-fuchsia-800',
  'bg-cyan-100 border-cyan-300 text-cyan-800',
  'bg-lime-100 border-lime-400 text-lime-900',
  'bg-orange-100 border-orange-300 text-orange-800',
];

// Each new branch takes the next free colour, so two branches in one room never share a colour
// (hashing could collide). Seeded alphabetically on first sight of a batch via the shared registry.
const assigned = new Map<string, number>();

/**
 * Colour per branch, used only as a supplementary visual cue -
 * every seat also always shows the student's roll number as text, so the UI
 * never relies on color alone (spec §49).
 */
export function branchColorClass(branch: string): string {
  let idx = assigned.get(branch);
  if (idx === undefined) {
    idx = assigned.size % PALETTE.length;
    assigned.set(branch, idx);
  }
  return PALETTE[idx]!;
}
