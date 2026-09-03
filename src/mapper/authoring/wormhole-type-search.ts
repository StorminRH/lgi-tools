import { isWormholeTypeCode } from '@/data/eve-data/wormhole-contract';

export type WormholeTypeParams = { code: string | null };

export type WormholeTypeErr = { kind: 'not_found' };

const SUGGEST_LIMIT = 12;

export function wormholeTypeSearch(
  codes: readonly string[],
  options?: {
    readonly lenient?: boolean;
    readonly preferredCodes?: readonly string[];
  },
): {
  parse: (
    input: string,
  ) =>
    | { ok: true; params: WormholeTypeParams }
    | { ok: false; error: WormholeTypeErr };
  suggest: (input: string) => Promise<string[]>;
} {
  const alphabetical = [
    ...new Set(codes.map((code) => code.toUpperCase())),
  ].toSorted((left, right) => left.localeCompare(right));
  const known = new Set(alphabetical);
  const preferred = [
    ...new Set(
      (options?.preferredCodes ?? []).map((code) => code.toUpperCase()),
    ),
  ]
    .filter((code) => known.has(code))
    .toSorted((left, right) => left.localeCompare(right));
  const preferredSet = new Set(preferred);
  const upper = [
    ...preferred,
    ...alphabetical.filter((code) => !preferredSet.has(code)),
  ];

  return {
    parse(input) {
      const trimmed = input.trim();
      if (trimmed.length === 0) return { ok: true, params: { code: null } };
      const code = trimmed.toUpperCase();
      if (!isWormholeTypeCode(code)) {
        return { ok: false, error: { kind: 'not_found' } };
      }
      if (!known.has(code) && options?.lenient !== true) {
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
