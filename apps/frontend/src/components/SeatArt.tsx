/**
 * Decorative seating chart: three "branches" arranged so no two neighbours match (the thing the solver guarantees).
 * Seats pop in one after another, then a few stay softly pulsing like someone is still being seated.
 */
const COLORS = ['#f7f2e7', '#e4552d', '#ffdf4d'];

export default function SeatArt({ rows = 6, cols = 9, className = '' }: { rows?: number; cols?: number; className?: string }) {
  const seats = Array.from({ length: rows * cols }, (_, i) => {
    const r = Math.floor(i / cols);
    const c = i % cols;
    return { r, c, tone: (r + c * 2) % 3, empty: (r * 7 + c * 3) % 11 === 0 };
  });
  return (
    <div className={`grid gap-1.5 sm:gap-2 ${className}`} style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }} aria-hidden="true">
      {seats.map(({ r, c, tone, empty }) => (
        <div
          key={`${r}-${c}`}
          className="aspect-square rounded-md sm:rounded-lg relative animate-pop"
          style={{ animationDelay: `${(r * cols + c) * 10}ms`, background: empty ? 'transparent' : COLORS[tone], border: empty ? '1.5px dashed rgb(255 255 255 / .28)' : 'none', boxShadow: empty ? 'none' : 'inset 0 -3px 0 rgb(0 0 0 / .18)' }}
        >
          {!empty && <span className="absolute inset-x-[22%] top-[18%] h-[14%] rounded-full bg-black/10" />}
        </div>
      ))}
    </div>
  );
}
