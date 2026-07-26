const PAGE_FAMILY =
  /(?:^|\n)\s*\.((?:account|nav|content-browser|industry|prose|sites)[\w-]*)/g;

function cssFamilies(css: string): string[] {
  return [...new Set(
    [...css.matchAll(PAGE_FAMILY)].flatMap((match) =>
      match[1] === undefined ? [] : [match[1]],
    ),
  )].sort();
}

/**
 * Returns stylesheet families that are not covered by any recorded allowed prefix.
 */
export function unexpectedFamilies(css: string, allowed: readonly string[]): string[] {
  return cssFamilies(css).filter(
    (className) => !allowed.some((family) => className.startsWith(family)),
  );
}

/**
 * Returns allowed prefixes that no longer own a matching stylesheet family.
 */
export function deadAllowlistEntries(css: string, allowed: readonly string[]): string[] {
  const found = cssFamilies(css);
  return [...allowed]
    .filter((family) => !found.some((className) => className.startsWith(family)))
    .sort();
}
