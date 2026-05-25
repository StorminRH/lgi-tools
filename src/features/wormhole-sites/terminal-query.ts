// Pure terminal-search grammar for /sites. Translates user-typed strings
// like `c2/combat`, `c5`, or `ore` into the `?class=` / `?type=` URL params
// the page already understands. No `@/db`, no `next/*`, no React imports —
// trivially unit-testable.
//
// The reusable primitive `<TerminalSearch>` consumes these four functions
// via its props. Future features (sleeper lookup, killmail browsing, …)
// each contribute their own terminal-query.ts and reuse the same UI.

import {
  SITE_TYPES,
  WORMHOLE_CLASSES,
  type SiteType,
  type WormholeClass,
} from './schema';

export type TerminalParams = {
  type?: SiteType;
  wormholeClass?: WormholeClass;
};

export type ParseError =
  | { kind: 'empty' }
  | { kind: 'unknown_token'; token: string }
  | { kind: 'too_many_tokens'; count: number }
  | { kind: 'duplicate_type'; tokens: [string, string] }
  | { kind: 'duplicate_class'; tokens: [string, string] };

export type ParseResult =
  | { ok: true; params: TerminalParams }
  | { ok: false; error: ParseError };

type Classified =
  | { kind: 'type'; value: SiteType }
  | { kind: 'class'; value: WormholeClass };

// Source-of-truth lookup table built once at module load. Adding a new
// site type or wormhole class is a one-line edit in schema.ts — zero in
// this file.
const TOKEN_TABLE: Record<string, Classified> = (() => {
  const table: Record<string, Classified> = {};
  for (const t of SITE_TYPES) table[t] = { kind: 'type', value: t };
  for (const c of WORMHOLE_CLASSES) table[c.toLowerCase()] = { kind: 'class', value: c };
  return table;
})();

export function parseTerminalQuery(input: string): ParseResult {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return { ok: false, error: { kind: 'empty' } };
  }

  const tokens = trimmed
    .toLowerCase()
    .split('/')
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  if (tokens.length > 2) {
    return { ok: false, error: { kind: 'too_many_tokens', count: tokens.length } };
  }

  const params: TerminalParams = {};
  const seen: { type?: string; class?: string } = {};

  for (const token of tokens) {
    const hit = TOKEN_TABLE[token];
    if (!hit) {
      return { ok: false, error: { kind: 'unknown_token', token } };
    }
    if (hit.kind === 'type') {
      if (seen.type !== undefined) {
        return { ok: false, error: { kind: 'duplicate_type', tokens: [seen.type, token] } };
      }
      params.type = hit.value;
      seen.type = token;
    } else {
      if (seen.class !== undefined) {
        return { ok: false, error: { kind: 'duplicate_class', tokens: [seen.class, token] } };
      }
      params.wormholeClass = hit.value;
      seen.class = token;
    }
  }

  return { ok: true, params };
}

// Round-trip symmetric with the parser. Canonical display order is
// class-then-type, so `?class=C2&type=ore` prefills as `c2/ore`.
export function formatTerminalQuery(params: TerminalParams): string {
  const parts: string[] = [];
  if (params.wormholeClass) parts.push(params.wormholeClass.toLowerCase());
  if (params.type) parts.push(params.type);
  return parts.join('/');
}

// Prefix-match completions for the autocomplete dropdown.
// - Empty input → []  (no dropdown).
// - No `/` yet → match against the single-token vocabulary.
// - First token classified + `/` + (optional partial) → suggest the other
//   kind, prefix-matched against the partial.
// - Invalid first token → [] (don't suggest into a broken left side).
export function suggestTerminalQuery(input: string): string[] {
  const lower = input.toLowerCase();
  if (lower.trim().length === 0) return [];

  const slashIndex = lower.indexOf('/');
  if (slashIndex === -1) {
    return Object.keys(TOKEN_TABLE)
      .filter((tok) => tok.startsWith(lower.trim()))
      .sort();
  }

  const firstRaw = lower.slice(0, slashIndex).trim();
  const secondRaw = lower.slice(slashIndex + 1).trim();
  const first = TOKEN_TABLE[firstRaw];
  if (!first) return [];

  const wantKind = first.kind === 'type' ? 'class' : 'type';
  return Object.entries(TOKEN_TABLE)
    .filter(([tok, hit]) => hit.kind === wantKind && tok.startsWith(secondRaw))
    .map(([tok]) => `${firstRaw}/${tok}`)
    .sort();
}

// Display copy for the inline error Callout. Kept in this file (not in the
// primitive) because each feature's vocabulary makes a different
// suggestions list.
export function terminalErrorMessage(error: ParseError): string {
  switch (error.kind) {
    case 'empty':
      return 'Enter a filter, like c3/relic or ore.';
    case 'unknown_token':
      return `Unknown filter: "${error.token}". Try c1–c6 or combat/ore/gas/relic/data.`;
    case 'too_many_tokens':
      return 'Use one filter or two separated by /, like c3/relic.';
    case 'duplicate_type':
      return `Pick one type, not two ("${error.tokens[0]}" and "${error.tokens[1]}").`;
    case 'duplicate_class':
      return `Pick one class, not two ("${error.tokens[0]}" and "${error.tokens[1]}").`;
  }
}
