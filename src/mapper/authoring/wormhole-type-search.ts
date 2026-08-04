// Pure wormhole-type search over the session codex — vocabulary only; no auto-fill.
import { isWormholeTypeCode } from '@/data/eve-data/wormhole-contract';

/** Parsed terminal-search parameters for one wormhole type code. */
export type WormholeTypeParams = { code: string | null };

/**
 * Closed failure contract for wormhole-type search; consumers branch on kind
 * instead of parsing messages.
 */
export type WormholeTypeErr = { kind: 'not_found' };

const SUGGEST_LIMIT = 12;

/**
 * Builds parse/suggest for a TerminalSearch over a fixed, sorted code list.
 * Empty input parses to null (unset). Unknown codes fail closed.
 */
export function wormholeTypeSearch(codes: readonly string[]): {
  parse: (
    input: string,
  ) =>
    | { ok: true; params: WormholeTypeParams }
    | { ok: false; error: WormholeTypeErr };
  suggest: (input: string) => Promise<string[]>;
} {
  // Deduplicate: the SDE can emit the same code on many typeIds; typeahead
  // keys on the code string and must not list a code twice.
  const upper = [...new Set(codes.map((code) => code.toUpperCase()))].toSorted(
    (left, right) => left.localeCompare(right),
  );
  const known = new Set(upper);

  return {
    parse(input) {
      const trimmed = input.trim();
      if (trimmed.length === 0) return { ok: true, params: { code: null } };
      const code = trimmed.toUpperCase();
      if (!isWormholeTypeCode(code) || !known.has(code)) {
        return { ok: false, error: { kind: 'not_found' } };
      }
      return { ok: true, params: { code } };
    },
    async suggest(input) {
      const needle = input.trim().toUpperCase();
      if (needle.length === 0) return upper.slice(0, SUGGEST_LIMIT);
      return upper
        .filter((code) => code.startsWith(needle))
        .slice(0, SUGGEST_LIMIT);
    },
  };
}
