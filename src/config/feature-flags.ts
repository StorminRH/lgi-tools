// Env-var-driven feature flags. Strict opt-in: only the literal string
// `'true'` flips a flag on — typos and loose-truthy values ('1', 'yes')
// deliberately fall back to false. Read at call time inside Server
// Components so flipping a Vercel env var takes effect on next request
// without a rebuild. Missing/unset flags must always preserve the
// existing "Coming Soon" state — the flags are additive only.
export interface FeatureFlags {
  wormholeRollCalc: boolean;
}

export function getFeatureFlags(): FeatureFlags {
  return {
    wormholeRollCalc: process.env.FF_WORMHOLE_ROLL_CALC === 'true',
  };
}
