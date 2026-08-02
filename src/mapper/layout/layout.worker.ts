/// <reference lib="webworker" />

// Layout worker entry: one message in, one kernel run, one message out.
//
// Mounted only from mapper client code via
// `new Worker(new URL('./layout.worker.ts', import.meta.url))`. Never imported
// statically into the main bundle. The worker never posts for a request it did
// not receive; a kernel rejection posts an error variant the hook logs and drops.
import type { ChainPosition } from '../chain/intents';
import { compassKernel } from './compass';
import type { LayoutConfig, LayoutFacts } from './layout-contract';

/** One layout request posted by the client bridge. */
export interface LayoutWorkerRequest {
  readonly requestId: number;
  readonly facts: LayoutFacts;
  readonly config: LayoutConfig;
}

/** A successful layout reply. Structured clone carries the Map. */
export interface LayoutWorkerSuccess {
  readonly kind: 'ok';
  readonly requestId: number;
  readonly positions: ReadonlyMap<number, ChainPosition>;
}

/** A kernel rejection for one request; the bridge logs and drops it. */
export interface LayoutWorkerFailure {
  readonly kind: 'error';
  readonly requestId: number;
  readonly message: string;
}

/** Everything the worker can post back for one request. */
export type LayoutWorkerResponse = LayoutWorkerSuccess | LayoutWorkerFailure;

declare const self: DedicatedWorkerGlobalScope;

self.onmessage = (event: MessageEvent<LayoutWorkerRequest>) => {
  const { requestId, facts, config } = event.data;
  void compassKernel(facts, config).then(
    (positions) => {
      const response: LayoutWorkerSuccess = { kind: 'ok', requestId, positions };
      self.postMessage(response);
    },
    (error: unknown) => {
      const response: LayoutWorkerFailure = {
        kind: 'error',
        requestId,
        message: error instanceof Error ? error.message : String(error),
      };
      self.postMessage(response);
    },
  );
};
