/// <reference lib="webworker" />

import type { ChainPosition } from '../chain/intents';
import { compassKernel } from './compass';
import type { LayoutConfig, LayoutFacts } from './layout-contract';

export interface LayoutWorkerRequest {
  readonly requestId: number;
  readonly facts: LayoutFacts;
  readonly config: LayoutConfig;
}

export interface LayoutWorkerSuccess {
  readonly kind: 'ok';
  readonly requestId: number;
  readonly positions: ReadonlyMap<number, ChainPosition>;
}

export interface LayoutWorkerFailure {
  readonly kind: 'error';
  readonly requestId: number;
  readonly message: string;
}

export type LayoutWorkerResponse = LayoutWorkerSuccess | LayoutWorkerFailure;

declare const self: DedicatedWorkerGlobalScope;

self.onmessage = (event: MessageEvent<LayoutWorkerRequest>) => {
  const { requestId, facts, config } = event.data;
  const fail = (error: unknown): void => {
    const response: LayoutWorkerFailure = {
      kind: 'error',
      requestId,
      message: error instanceof Error ? error.message : String(error),
    };
    self.postMessage(response);
  };
  try {
    void compassKernel(facts, config).then((positions) => {
      const response: LayoutWorkerSuccess = { kind: 'ok', requestId, positions };
      self.postMessage(response);
    }, fail);
  } catch (error) {
    fail(error);
  }
};
