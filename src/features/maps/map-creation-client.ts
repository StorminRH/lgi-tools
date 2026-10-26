import {
  createMapEndpoint,
  type CreateMapRequest,
} from '@/data/maps/api-contract';
import { sleep } from '@/lib/retry';
import { apiFetch } from '@/transport/api-client';
import { failureMessage, type FailedOutcome, type FailureCopy } from '@/transport/failure-copy';
import type { PreparedMapCreation } from './access-editor-model';
import { atlasMapHref } from './map-navigation';

const MAP_CREATION_INTERSTITIAL_MIN_MS = 5_000;

export async function createMapWithMinimumInterstitial(input: CreateMapRequest) {
  const [outcome] = await Promise.all([
    apiFetch(createMapEndpoint, { body: input, cache: 'no-store' }),
    sleep(MAP_CREATION_INTERSTITIAL_MIN_MS),
  ]);
  return outcome;
}

// Owner-approved (promote #694): every failure without its own entry reads the connection line.
const MAP_CREATION_FAILED = 'Check your connection and try again.';

const MAP_CREATION_FAILURE_COPY = {
  fallback: MAP_CREATION_FAILED,
  codes: {
    not_linked: 'Choose one of your own linked characters.',
    rate_limited: "You're creating maps too fast. Try again in a minute.",
    map_projection_unavailable: "Couldn't set up map access. Try again.",
  },
  network: MAP_CREATION_FAILED,
} satisfies FailureCopy<FailedOutcome<typeof createMapEndpoint>>;

export function mapCreationFailureMessage(failure: FailedOutcome<typeof createMapEndpoint>): string {
  return failureMessage(failure, MAP_CREATION_FAILURE_COPY);
}

export interface MapCreationHandoffActions {
  readonly reset: () => void;
  readonly close: () => void;
  readonly onCreated: (mapId: string) => void;
  readonly navigate: (href: string) => void;
}

export function handoffCreatedMap(
  mapId: string,
  actions: MapCreationHandoffActions,
): void {
  actions.reset();
  actions.close();
  actions.onCreated(mapId);
  actions.navigate(atlasMapHref(mapId));
}

type MapCreationSubmitStart =
  | { readonly kind: 'ignored' }
  | { readonly kind: 'invalid'; readonly message: string }
  | { readonly kind: 'begin'; readonly input: CreateMapRequest };

function mapCreationSubmitStart(
  busy: boolean,
  prepared: PreparedMapCreation,
): MapCreationSubmitStart {
  if (busy) return { kind: 'ignored' };
  if (!prepared.ok) return { kind: 'invalid', message: prepared.message };
  return { kind: 'begin', input: prepared.input };
}

type MapCreationSubmitFinish =
  | { readonly kind: 'failed'; readonly message: string }
  | { readonly kind: 'created'; readonly mapId: string };

function mapCreationSubmitFinish(
  outcome: Awaited<ReturnType<typeof createMapWithMinimumInterstitial>>,
): MapCreationSubmitFinish {
  if (!outcome.ok) {
    return { kind: 'failed', message: mapCreationFailureMessage(outcome) };
  }
  return { kind: 'created', mapId: outcome.data.mapId };
}

export interface MapCreationSubmitActions {
  readonly onInvalid: (message: string) => void;
  readonly onBegin: () => void;
  readonly onFailed: (message: string) => void;
  readonly onCreated: (mapId: string) => void;
}

export async function runMapCreationSubmit(
  busy: boolean,
  prepared: PreparedMapCreation,
  create: (
    input: CreateMapRequest,
  ) => ReturnType<typeof createMapWithMinimumInterstitial>,
  actions: MapCreationSubmitActions,
): Promise<void> {
  const start = mapCreationSubmitStart(busy, prepared);
  if (start.kind === 'ignored') return;
  if (start.kind === 'invalid') {
    actions.onInvalid(start.message);
    return;
  }
  actions.onBegin();
  const finish = mapCreationSubmitFinish(await create(start.input));
  if (finish.kind === 'failed') {
    actions.onFailed(finish.message);
    return;
  }
  actions.onCreated(finish.mapId);
}
