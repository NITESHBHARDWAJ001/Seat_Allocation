let counter = 0;

/**
 * Simple collision-resistant id generator (no external uuid dependency).
 * Not cryptographically secure — fine for local-first entity ids.
 */
export function generateId(prefix: string): string {
  counter = (counter + 1) % Number.MAX_SAFE_INTEGER;
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now().toString(36)}-${counter.toString(36)}-${rand}`;
}
