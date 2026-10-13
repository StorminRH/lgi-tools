/**
 * Finds 'use cache' function bodies in a source file, so a registry test can
 * hold every reader of stored EVE data to one shape. A directive is the
 * first statement of its function, so the body is the block that encloses
 * it: the nearest `{` before the directive and its matching `}`.
 */

const DIRECTIVE = /'use cache(?:: (?:remote|private))?';/g;
const QUOTES = new Set(["'", '"', '`']);

export interface CachedScope {
  readonly directive: string;
  readonly body: string;
}

/** The index just past the `}` that closes the block opening at `open`, skipping braces inside string literals. */
function blockEnd(source: string, open: number): number {
  let depth = 0;
  let quote: string | null = null;
  for (let i = open; i < source.length; i++) {
    const char = source[i]!;
    if (quote !== null) {
      if (char === '\\') i++;
      else if (char === quote) quote = null;
      continue;
    }
    if (QUOTES.has(char)) quote = char;
    else if (char === '{') depth++;
    else if (char === '}' && --depth === 0) return i + 1;
  }
  throw new Error('Unbalanced block in cached scope');
}

/** Every directive scope in `source` (comments already stripped), in file order. */
export function cachedScopes(source: string): CachedScope[] {
  return [...source.matchAll(DIRECTIVE)].map((match) => {
    const open = source.lastIndexOf('{', match.index);
    return { directive: match[0].slice(1, -2), body: source.slice(open, blockEnd(source, open)) };
  });
}

/** The index just past the `)` that closes the call opening at `open`. */
function callEnd(source: string, open: number): number {
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '(') depth++;
    else if (source[i] === ')' && --depth === 0) return i + 1;
  }
  throw new Error('Unbalanced call in cached scope');
}

/** The top-level arguments of every `cacheTag(...)` call in a body, as written. */
export function cacheTagArguments(body: string): string[] {
  const args: string[] = [];
  for (const match of body.matchAll(/\bcacheTag\(/g)) {
    const open = match.index + match[0].length - 1;
    const inner = body.slice(open + 1, callEnd(body, open) - 1);
    let depth = 0;
    let start = 0;
    for (let i = 0; i < inner.length; i++) {
      const char = inner[i];
      if (char === '(' || char === '{' || char === '[') depth++;
      else if (char === ')' || char === '}' || char === ']') depth--;
      else if (char === ',' && depth === 0) {
        args.push(inner.slice(start, i).trim());
        start = i + 1;
      }
    }
    const last = inner.slice(start).trim();
    if (last !== '') args.push(last);
  }
  return args;
}

/** The symbol an argument names once a spread and a call are peeled away: `...sheetTags(id)` is `sheetTags`. */
export function argumentSymbol(argument: string): string | null {
  return /^(?:\.\.\.)?([A-Za-z_$][\w$]*)\b/.exec(argument)?.[1] ?? null;
}
