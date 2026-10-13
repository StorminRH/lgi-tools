import type { JobSystemRef, SystemJobCostIndex } from './types';

export type ApplySystemOutcome =
  | { status: 'applied'; data: SystemJobCostIndex }
  | { status: 'failed' }
  | { status: 'superseded' };

export interface ApplySystemOptions {
  persist: boolean;
  signal?: AbortSignal;
}

export function createBuildSystemApplier(deps: {
  fetchLocation: (systemId: number, signal: AbortSignal) => Promise<SystemJobCostIndex | null>;
  onApplied: (sys: JobSystemRef, data: SystemJobCostIndex) => void;
  onPersist: (sys: JobSystemRef) => void;
}): (sys: JobSystemRef, opts: ApplySystemOptions) => Promise<ApplySystemOutcome> {
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
