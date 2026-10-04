const UNIQUE_VIOLATION = '23505';
const SERIALIZATION_FAILURE = '40001';

const MAX_CAUSE_DEPTH = 5;

function hasCode(error: unknown, code: string): boolean {
  let node = error;
  for (let depth = 0; depth < MAX_CAUSE_DEPTH && node instanceof Error; depth++) {
    if ((node as { code?: unknown }).code === code) return true;
    node = (node as { cause?: unknown }).cause;
  }
  return false;
}

export function isUniqueViolation(error: unknown): boolean {
  return hasCode(error, UNIQUE_VIOLATION);
}

/** Postgres rejected a serializable transaction that overlapped a conflicting one; running it again is safe. */
export function isSerializationFailure(error: unknown): boolean {
  return hasCode(error, SERIALIZATION_FAILURE);
}
