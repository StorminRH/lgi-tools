const UNIQUE_VIOLATION = '23505';

const MAX_CAUSE_DEPTH = 5;

export function isUniqueViolation(error: unknown): boolean {
  let node = error;
  for (let depth = 0; depth < MAX_CAUSE_DEPTH && node instanceof Error; depth++) {
    if ((node as { code?: unknown }).code === UNIQUE_VIOLATION) return true;
    node = (node as { cause?: unknown }).cause;
  }
  return false;
}
