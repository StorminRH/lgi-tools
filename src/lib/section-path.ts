/** Match a route segment without treating a similarly prefixed route as a child. */
export function sectionMatches(pathname: string, href: string, exact = false): boolean {
  const trimmed = pathname.replace(/\/+$/, '') || '/';
  return trimmed === href || (!exact && trimmed.startsWith(`${href}/`));
}

/**
 * The item whose href is the longest section match for pathname, or null.
 * Ties keep the first item; exactOf marks items that match only their own path.
 */
export function longestSectionMatch<T>(
  pathname: string,
  items: Iterable<T>,
  hrefOf: (item: T) => string,
  exactOf?: (item: T) => boolean,
): T | null {
  let best: T | null = null;
  let bestLength = -1;
  for (const item of items) {
    const href = hrefOf(item);
    if (href.length > bestLength && sectionMatches(pathname, href, exactOf?.(item))) {
      best = item;
      bestLength = href.length;
    }
  }
  return best;
}
