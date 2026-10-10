/**
 * The address `pathname` with `search` patched: a string value sets that key,
 * null deletes it. `search` may be a raw query (a leading '?' is fine) or
 * anything that prints one, such as `useSearchParams()` output. Empty values
 * print as bare keys ('?demo', not '?demo='), which readers parse the same.
 * The query is left off when nothing remains, and `hash` (a `location.hash`,
 * '#' included) is appended only when passed.
 */
export function withSearchParams(
  pathname: string,
  search: string | Pick<URLSearchParams, 'toString'>,
  patch: Readonly<Record<string, string | null>>,
  hash = '',
): string {
  const params = new URLSearchParams(search.toString());
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) params.delete(key);
    else params.set(key, value);
  }
  const query = params.toString().replace(/=(&|$)/g, '$1');
  return `${pathname}${query === '' ? '' : `?${query}`}${hash}`;
}
