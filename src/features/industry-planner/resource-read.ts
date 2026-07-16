export interface ResourceRead {
  start: () => Promise<void>;
  cancel: () => void;
}

// One abortable client read with last-request-wins semantics. The generation
// guard rejects late successful resolutions even when an underlying read does
// not throw on abort; failures and non-results settle silently for fail-open UI.
export function createResourceRead<T>(deps: {
  read: (signal: AbortSignal) => Promise<T | null>;
  onData: (data: T) => void;
}): ResourceRead {
  let generation = 0;
  let controller: AbortController | null = null;

  return {
    async start() {
      const run = ++generation;
      controller?.abort();
      const activeController = new AbortController();
      controller = activeController;
      try {
        const data = await deps.read(activeController.signal);
        if (run !== generation || activeController.signal.aborted || data === null) return;
        deps.onData(data);
      } catch {
        // Per-user overlays fail open: aborted and failed reads both leave the
        // existing pending/empty presentation rather than surfacing an error.
      } finally {
        if (run === generation) controller = null;
      }
    },
    cancel() {
      generation++;
      controller?.abort();
      controller = null;
    },
  };
}
