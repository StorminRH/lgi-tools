import type { BuildLocationData } from './types';

export interface BuildSystemRef {
  systemId: number;
  systemName: string;
  security: number | null;
}

export type ApplySystemOutcome =
  | { status: 'applied'; data: BuildLocationData }
  | { status: 'failed' }
  | { status: 'superseded' };

export function createBuildSystemApplier(deps: {

  fetchLocation: (systemId: number, signal: AbortSignal) => Promise<BuildLocationData | null>;

  onApplied: (sys: BuildSystemRef, data: BuildLocationData) => void;

  onPersist: (sys: BuildSystemRef) => void;
}): (sys: BuildSystemRef, opts: { persist: boolean }) => Promise<ApplySystemOutcome> {
  let gen = 0;
  let ctrl: AbortController | null = null;
  return async (sys, opts) => {
    const myGen = ++gen;
    ctrl?.abort();
    const myCtrl = new AbortController();
    ctrl = myCtrl;
    try {
      const data = await deps.fetchLocation(sys.systemId, myCtrl.signal);

      if (myGen !== gen) return { status: 'superseded' };
      if (data === null) return { status: 'failed' };
      deps.onApplied(sys, data);
      if (opts.persist) deps.onPersist(sys);
      return { status: 'applied', data };
    } catch {

      return { status: myCtrl.signal.aborted ? 'superseded' : 'failed' };
    }
  };
}
