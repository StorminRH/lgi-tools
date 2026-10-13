/**
 * The copy for a notice code (a query-string `?error=` or `?outcome=`, or a
 * server refusal code), or the fallback when the code has no entry. Only the
 * table's own keys match, so a crafted `?error=constructor` can never hand a
 * page an inherited function. Without a fallback an unknown code shows
 * nothing; a missing or repeated param always shows nothing.
 */
export function resolveNotice<C extends string>(
  raw: string | string[] | undefined,
  copy: Readonly<Record<C, string>>,
  fallback?: string,
): string | null {
  if (typeof raw !== 'string') return null;
  return isOwnCode(copy, raw) ? copy[raw] : (fallback ?? null);
}

function isOwnCode<C extends string>(copy: Readonly<Record<C, string>>, raw: string): raw is C {
  return Object.hasOwn(copy, raw);
}
