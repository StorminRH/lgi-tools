// Project-shaped wrapper around fuzzysort. Every search source uses this
// helper for both ranking and per-character match highlighting so the
// behavior is identical across Sites, Tools, Commands, Recents, and the
// future Blueprints source.
//
// fuzzysort v3 returns score in [0, 1] (1 = perfect, 0 = no match) plus
// an `indexes` array — exact character positions of the matched query
// chars inside the target. We surface those directly so the dropdown can
// render each matched character in green.
//
// Empty query is a sentinel: we return { score: 0, matchIndices: [] }
// rather than null so callers can branch on "show everything when empty"
// without a second code path. No-match (non-empty query that doesn't
// match the target) returns null.

import fuzzysort from 'fuzzysort';

/** Successful fuzzy-match score and matched character indexes in the original candidate string. */
export type FuzzyMatch = {
  score: number;
  matchIndices: number[];
};

/**
 * Scores a candidate against one query and returns matched character indexes, or null when the
 * candidate does not satisfy the fuzzy search.
 */
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
