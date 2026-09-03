import { v } from 'convex/values';

export const purgeScopeArgs = {
  userId: v.string(),
  characterId: v.union(v.number(), v.null()),
};

export const runObservabilityFields = {
  lastError: v.union(v.string(), v.null()),
  rlGroup: v.union(v.string(), v.null()),
  rlLimit: v.union(v.number(), v.null()),
  rlRemaining: v.union(v.number(), v.null()),
  rlUsed: v.union(v.number(), v.null()),
};
