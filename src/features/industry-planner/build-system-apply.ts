import type { IndustryStationView } from './types';

// The build-system apply machinery (3.7.23.1) — moved out of the selector so the
// provider owns ONE instance whose generation counter serializes every caller:
// the selector's submit, the lock/unlock transitions, the on-mount restore, and
// a template load. Two independent counters would let a slow earlier apply
// resolve late and clobber the winner. Pure factory (fetch + state writes
// injected) so the guard's branches are testable without a render.

// The identifier triple every apply takes — the same shape the
// planner.buildLocation preference persists and a saved template stores; the
// live stations/indices/prices are fetched by the apply itself.
export interface BuildSystemRef {
  systemId: number;
  systemName: string;
  security: number | null;
}

// The apply's settled outcome: 'superseded' means a later apply took over (the
// generation guard) — callers stay silent on it; only 'failed' is an error.
export type ApplySystemResult = 'applied' | 'failed' | 'superseded';

// The slice of the build-location response the apply seeds state from.
export interface BuildLocationData {
  stations: IndustryStationView[];
  costIndices: { manufacturing: number | null; reaction: number | null };
  adjustedPrices: { typeId: number; adjustedPrice: number }[];
}

export function createBuildSystemApplier(deps: {
  // Resolves the system's live build data; null = a non-OK response.
  fetchLocation: (systemId: number, signal: AbortSignal) => Promise<BuildLocationData | null>;
  // Seeds the location state from the winning apply's data.
  onApplied: (sys: BuildSystemRef, data: BuildLocationData) => void;
  // Writes the saved-build-location preference ({ persist: true } applies only).
  onPersist: (sys: BuildSystemRef) => void;
}): (sys: BuildSystemRef, opts: { persist: boolean }) => Promise<ApplySystemResult> {
  let gen = 0;
  let ctrl: AbortController | null = null;
  return async (sys, opts) => {
    const myGen = ++gen;
    ctrl?.abort();
    const myCtrl = new AbortController();
    ctrl = myCtrl;
    try {
      const data = await deps.fetchLocation(sys.systemId, myCtrl.signal);
      // A later apply advanced the counter while this fetch was in flight —
      // even a successfully resolved response must not clobber the winner.
      if (myGen !== gen) return 'superseded';
      if (data === null) return 'failed';
      deps.onApplied(sys, data);
      if (opts.persist) deps.onPersist(sys);
      return 'applied';
    } catch {
      // A superseding apply aborts this controller — silent; a real network
      // failure is the caller's to surface.
      return myCtrl.signal.aborted ? 'superseded' : 'failed';
    }
  };
}
