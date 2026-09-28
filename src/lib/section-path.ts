/** Match a route segment without treating a similarly prefixed route as a child. */
export function sectionMatches(pathname: string, href: string, exact = false): boolean {
  const trimmed = pathname.replace(/\/+$/, '') || '/';
  return trimmed === href || (!exact && trimmed.startsWith(`${href}/`));
}
