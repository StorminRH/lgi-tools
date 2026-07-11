// Turns a raw error code carried on a query string into a friendly message.
// Non-string input (an absent or repeated param) yields null so the caller shows
// nothing; an unrecognised code falls back to a generic line. The per-surface
// message tables stay at the call sites — only this lookup shape is shared.
export function resolveErrorMessage(
  raw: string | string[] | undefined,
  messages: Record<string, string>,
  fallback: string,
): string | null {
  if (typeof raw !== 'string') return null;
  return messages[raw] ?? fallback;
}
