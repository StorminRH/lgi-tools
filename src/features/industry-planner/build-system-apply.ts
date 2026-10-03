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

export interface ApplySystemOptions {
  persist: boolean;
  signal?: AbortSignal;
}

export function createBuildSystemApplier(deps: {
  fetchLocation: (systemId: number, signal: AbortSignal) => Promise<BuildLocationData | null>;
  onApplied: (sys: BuildSystemRef, data: BuildLocationData) => void;
  onPersist: (sys: BuildSystemRef) => void;
}): (sys: BuildSystemRef, opts: ApplySystemOptions) => Promise<ApplySystemOutcome> {
  let gen = 0;
  let ctrl: AbortController | null = null;
  return async (sys, opts) => {
    const myGen = ++gen;
    ctrl?.abort();
    const myCtrl = new AbortController();
    ctrl = myCtrl;
    const cancel = () => myCtrl.abort();
    opts.signal?.addEventListener('abort', cancel, { once: true });
    if (opts.signal?.aborted) myCtrl.abort();
    try {
      const data = await deps.fetchLocation(sys.systemId, myCtrl.signal);
      if (myGen !== gen || myCtrl.signal.aborted) return { status: 'superseded' };
      if (data === null) return { status: 'failed' };
      deps.onApplied(sys, data);
      if (opts.persist) deps.onPersist(sys);
      return { status: 'applied', data };
    } catch {
      return { status: myCtrl.signal.aborted ? 'superseded' : 'failed' };
    } finally {
      opts.signal?.removeEventListener('abort', cancel);
    }
  };
}
