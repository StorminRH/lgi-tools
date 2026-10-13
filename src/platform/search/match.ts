import fuzzysort from 'fuzzysort';

export type FuzzyMatch = {
  score: number;
  matchIndices: number[];
};

export function fuzzyMatch(query: string, target: string): FuzzyMatch | null {
  if (query.length === 0) {
    return { score: 0, matchIndices: [] };
  }
  const result = fuzzysort.single(query, target);
  if (result === null) return null;
  return {
    score: result.score,
    matchIndices: [...result.indexes],
  };
}

/**
 * Whether every word typed appears in the name, in any order and ignoring
 * case and extra whitespace (a stray empty word is in every name). A blank
 * query therefore matches every name; callers that want nothing for a blank
 * query check for it first.
 */
export function matchesAllWords(name: string, query: string): boolean {
  const lower = name.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .every((word) => lower.includes(word));
}
