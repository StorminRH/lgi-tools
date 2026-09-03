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
