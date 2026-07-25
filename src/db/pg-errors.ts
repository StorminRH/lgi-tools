// Shared Postgres error classification. Extracted here (3.10.2.3) when a second
// slice needed the same unique-violation check the ESI refresh queue had kept as
// a local copy — one owner, not a per-file duplicate.

/** Postgres `unique_violation`. */
const UNIQUE_VIOLATION = '23505';

// Drivers wrap the original error at different depths (neon-http and postgres-js differ,
// and Drizzle adds its own wrapper), so walk a bounded cause chain rather than
// trusting one shape.
const MAX_CAUSE_DEPTH = 5;

/**
 * Whether an error is a Postgres unique-constraint violation, unwrapping the driver and ORM `cause`
 * chain. Callers use it to coalesce a lost insert race into a normal outcome instead of a failure.
 */
export function isUniqueViolation(error: unknown): boolean {
  let node = error;
  for (let depth = 0; depth < MAX_CAUSE_DEPTH && node instanceof Error; depth++) {
    if ((node as { code?: unknown }).code === UNIQUE_VIOLATION) return true;
    node = (node as { cause?: unknown }).cause;
  }
  return false;
}
