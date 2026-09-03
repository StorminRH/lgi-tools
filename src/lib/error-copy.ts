export function resolveErrorMessage(
  raw: string | string[] | undefined,
  messages: Record<string, string>,
  fallback: string,
): string | null {
  if (typeof raw !== 'string') return null;
  return messages[raw] ?? fallback;
}
