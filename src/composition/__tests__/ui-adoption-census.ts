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

/** A walk through comment-stripped source that collects its literals' text. */
interface Scan {
  readonly source: string;
  at: number;
  readonly literals: string[];
}

// One step through code: a quoted string (group 2 is its body), a template's
// opening backtick (3), a brace (4), a run of other code, or one other
// character. JSX text is code here, not a literal. A quoted string ends at its
// closing quote or, left open, at the line end, so a stray quote (in a regex
// literal, say) spoils one line at most, and a quote straight after a word
// character is an apostrophe in copy (`Don't`), never an opening quote.
const CODE_STEP = /(?<![\w$])(['"])((?:\\.|(?!\1)[^\\\n])*)\1?|(`)|([{}])|[^'"`{}]+|[\s\S]/y;
// Template text (group 1) up to its closing backtick, a `${` (2) or the end.
const TEMPLATE_STEP = /((?:\\[\s\S]|\$(?!\{)|[^`\\$])*)(?:(\$\{)|`)?/y;
// Stands in for each `${}` so a template is judged whole: `${base} uppercase`
// reads as a class list and `Hi ${name}, uppercase` does not.
const EXPRESSION = 'x';

// Both patterns match at any position, so `exec` never returns null here.
function step(pattern: RegExp, scan: Scan): (string | undefined)[] {
  pattern.lastIndex = scan.at;
  const match = pattern.exec(scan.source) ?? [];
  scan.at = pattern.lastIndex;
  return match;
}

// Reads code up to the `}` that closes a template expression, or the end.
function readCode(scan: Scan): void {
  for (let depth = 0; depth >= 0 && scan.at < scan.source.length;) {
    depth += readCodeStep(scan);
  }
}

// Reads one code step and returns how it moves the brace depth.
function readCodeStep(scan: Scan): number {
  const [, , body, backtick, brace] = step(CODE_STEP, scan);
  if (body !== undefined) scan.literals.push(body);
  if (backtick !== undefined) readTemplate(scan);
  return Number(brace === '{') - Number(brace === '}');
}

function readTemplate(scan: Scan): void {
  const parts: string[] = [];
  for (let expression = true; expression;) {
    const [, text = '', opener] = step(TEMPLATE_STEP, scan);
    parts.push(text);
    expression = opener !== undefined;
    if (expression) readCode(scan);
  }
  scan.literals.push(parts.join(EXPRESSION));
}

/**
 * The text of every string and template literal in comment-stripped
 * `source`, multi-line templates and literals nested in `${}` included.
 */
function literalsOf(source: string): string[] {
  const scan: Scan = { source, at: 0, literals: [] };
  while (scan.at < source.length) readCode(scan);
  return scan.literals;
}

// A token a class list holds: lowercase letters, digits and the punctuation
// of variants, modifiers and arbitrary values, with anything but whitespace
// inside square brackets (`bg-[#FFF]`). Copy fails it on a capital letter or
// on punctuation such as `?`, `;` or `<`.
const CLASS_TOKEN = /^(?:[a-z0-9:/!.%_#()=',&>*+~@[\]-]|\[[^\s\]]*\])+$/;
// `uppercase` or the `[text-transform:uppercase]` arbitrary property, at any
// variant, with the `!` important modifier on either side or none.
const UPPERCASE_CLASS = /^(?:\S*:)?!?(?:uppercase|\[text-transform:uppercase\])!?$/;
const CSS_UPPERCASE = /\btext-transform\s*:\s*uppercase\b|@apply\b[^;}]*\buppercase\b/g;

// A literal is a class list when every whitespace-separated token is a class
// token. The word in copy, with a capital or sentence punctuation in the
// string or punctuation on the word (`uppercase.`), is not counted; a copy
// string in bare lowercase words (`set in uppercase`) still reads as classes.
function uppercaseClasses(literal: string): number {
  const tokens = literal.split(/\s+/).filter(Boolean);
  return tokens.every((token) => CLASS_TOKEN.test(token))
    ? tokens.filter((token) => UPPERCASE_CLASS.test(token)).length
    : 0;
}

/**
 * How many times `source` sets text in capitals. In a script: an `uppercase`
 * class at any variant, important or not, or the `[text-transform:uppercase]`
 * arbitrary property, in a string or template literal that reads as a class
 * list, which covers `cn()`/`cva()` arguments and the `'uppercase'` style
 * value. In a stylesheet: a `text-transform: uppercase` declaration or an
 * `@apply` of `uppercase`. Pass comment-stripped source.
 */
export function uppercaseCount(source: string, kind: 'script' | 'css'): number {
  return kind === 'css'
    ? [...source.matchAll(CSS_UPPERCASE)].length
    : literalsOf(source).reduce((total, literal) => total + uppercaseClasses(literal), 0);
}
