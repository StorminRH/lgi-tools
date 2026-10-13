const PAGE_FAMILY =
  /\.((?:account|nav|content-browser|industry|prose|sites)[\w-]*)/g;

function cssFamilies(css: string): string[] {
  return [...new Set(
    [...css.matchAll(PAGE_FAMILY)].flatMap((match) =>
      match[1] === undefined ? [] : [match[1]],
    ),
  )].sort();
}

export function unexpectedFamilies(css: string, allowed: readonly string[]): string[] {
  return cssFamilies(css).filter(
    (className) => !allowed.some((family) => className.startsWith(family)),
  );
}

export function deadAllowlistEntries(css: string, allowed: readonly string[]): string[] {
  const found = cssFamilies(css);
  return [...allowed]
    .filter((family) => !found.some((className) => className.startsWith(family)))
    .sort();
}

const STRING_LITERAL = /(["'`])([^"'`\n]*)\1/g;

function handRollsTypeRole(classes: string): boolean {
  const utilities = classes
    .split(/\s+/)
    .map((token) => token.slice(token.lastIndexOf(':') + 1));
  const tracked = utilities.some((utility) => utility.startsWith('tracking-'));
  return (
    utilities.some((utility) => utility.startsWith('tracking-['))
    || (tracked && utilities.includes('uppercase'))
  );
}

/**
 * The one-line string literals in `source` that hand-roll a type role: an
 * uppercase class string with a tracking step, in any order, or any arbitrary
 * tracking value.
 */
export function handRolledTypeRoles(source: string): string[] {
  return [...source.matchAll(STRING_LITERAL)]
    .map((match) => match[2] ?? '')
    .filter(handRollsTypeRole);
}
