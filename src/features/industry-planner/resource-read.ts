export interface ResourceRead {
  start: () => Promise<void>;
  cancel: () => void;
}

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
