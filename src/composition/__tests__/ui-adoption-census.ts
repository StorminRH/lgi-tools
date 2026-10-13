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

function utilitiesOf(classes: string): string[] {
  return classes
    .split(/\s+/)
    .map((token) => token.slice(token.lastIndexOf(':') + 1));
}

// The label sizes the eyebrow and data-label roles own. A tracking step set
// beside one of them spells a label role by hand.
const LABEL_SIZES = ['text-eyebrow', 'text-caption', 'text-small', 'text-bar'];

function handRollsTypeRole(classes: string): boolean {
  const utilities = utilitiesOf(classes);
  const tracked = utilities.some((utility) => utility.startsWith('tracking-'));
  return (
    utilities.some((utility) => utility.startsWith('tracking-['))
    || (tracked && utilities.some((utility) => utility === 'uppercase' || LABEL_SIZES.includes(utility)))
  );
}

/**
 * The one-line string literals in `source` that hand-roll a type role: a
 * tracking step beside a label size or `uppercase`, in any order, or any
 * arbitrary tracking value.
 */
export function handRolledTypeRoles(source: string): string[] {
  return [...source.matchAll(STRING_LITERAL)]
    .map((match) => match[2] ?? '')
    .filter(handRollsTypeRole);
}

// `uppercase` as a whole class token: after a line start, whitespace, a
// variant colon or a quote, and before whitespace, a quote or the line end.
// Quote pairing is not needed, so a multi-line template literal or an earlier
// apostrophe on the line does not hide it. The word in copy, before `<` or
// punctuation, is not a class.
const UPPERCASE_TOKEN = /(?:^|[\s:'"`])uppercase(?=[\s'"`]|$)/gm;
const CSS_UPPERCASE = /\btext-transform\s*:\s*uppercase\b|@apply\b[^;}]*\buppercase\b/g;

/**
 * How many times `source` sets text in capitals: an `uppercase` class at any
 * variant, the `'uppercase'` style value, or, in a stylesheet, a
 * `text-transform: uppercase` declaration or an `@apply` of `uppercase`.
 * Pass comment-stripped source.
 */
export function uppercaseCount(source: string, kind: 'script' | 'css'): number {
  return [...source.matchAll(kind === 'css' ? CSS_UPPERCASE : UPPERCASE_TOKEN)].length;
}
