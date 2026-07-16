interface ResourceRead {
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
      let data: T | null;
      try {
        data = await deps.read(activeController.signal);
      } catch {
        // Per-user overlays fail open: aborted and failed reads both leave the
        // existing pending/empty presentation rather than surfacing an error.
        return;
      } finally {
        if (run === generation) controller = null;
      }
      if (run !== generation || activeController.signal.aborted || data === null) return;
      deps.onData(data);
    },
    cancel() {
      generation++;
      controller?.abort();
      controller = null;
    },
  };
}
