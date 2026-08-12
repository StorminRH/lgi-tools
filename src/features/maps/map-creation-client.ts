import {
  createMapEndpoint,
  type CreateMapRequest,
} from '@/data/maps/api-contract';
import { apiFetch } from '@/transport/api-client';
import type { PreparedMapCreation } from './access-editor-model';

/** Minimum time the creation compass remains visible for a fast successful request. */
export const MAP_CREATION_INTERSTITIAL_MIN_MS = 5_000;

function delay(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

/**
 * Starts the non-idempotent create request and minimum interstitial clock
 * together. The server owns its projection retry budget; this client adds no
 * second timeout or retry.
 */
export async function createMapWithMinimumInterstitial(input: CreateMapRequest) {
  const [outcome] = await Promise.all([
    apiFetch(createMapEndpoint, { body: input, cache: 'no-store' }),
    delay(MAP_CREATION_INTERSTITIAL_MIN_MS),
  ]);
  return outcome;
}

/** Calm operator-facing copy for one closed create endpoint outcome. */
export function mapCreationFailureMessage(
  outcome: Awaited<ReturnType<typeof createMapWithMinimumInterstitial>>,
): string {
  if (outcome.ok) return '';
  if (outcome.kind === 'api' && outcome.status === 429) {
    return 'Map creation is moving too quickly. Try again in a minute.';
  }
  if (outcome.kind === 'api' && outcome.status === 503) {
    return 'Map access could not be projected. The attempted map was rolled back; try again.';
  }
  return 'The map could not be created. Check your connection and try again.';
}

/** Side effects required to leave the persistent creation shell after success. */
export interface MapCreationHandoffActions {
  readonly reset: () => void;
  readonly close: () => void;
  readonly onCreated: (mapId: string) => void;
  readonly navigate: (href: string) => void;
}

/** Resets and closes the shared-layout dialog before navigating to the new map. */
export function handoffCreatedMap(
  mapId: string,
  actions: MapCreationHandoffActions,
): void {
  actions.reset();
  actions.close();
  actions.onCreated(mapId);
  const query = new URLSearchParams({ map: mapId });
  actions.navigate(`/atlas?${query.toString()}`);
}

/** First synchronous gate of the creation-dialog submit path. */
export type MapCreationSubmitStart =
  | { readonly kind: 'ignored' }
  | { readonly kind: 'invalid'; readonly message: string }
  | { readonly kind: 'begin'; readonly input: CreateMapRequest };

/** Ignores an in-flight submit, surfaces draft errors, or starts transport. */
export function mapCreationSubmitStart(
  busy: boolean,
  prepared: PreparedMapCreation,
): MapCreationSubmitStart {
  if (busy) return { kind: 'ignored' };
  if (!prepared.ok) return { kind: 'invalid', message: prepared.message };
  return { kind: 'begin', input: prepared.input };
}

/** Closed create-request outcome after the interstitial has elapsed. */
export type MapCreationSubmitFinish =
  | { readonly kind: 'failed'; readonly message: string }
  | { readonly kind: 'created'; readonly mapId: string };

/** Maps one create-endpoint outcome onto the dialog's success or retry state. */
export function mapCreationSubmitFinish(
  outcome: Awaited<ReturnType<typeof createMapWithMinimumInterstitial>>,
): MapCreationSubmitFinish {
  if (!outcome.ok) {
    return { kind: 'failed', message: mapCreationFailureMessage(outcome) };
  }
  return { kind: 'created', mapId: outcome.data.mapId };
}

/** Side effects the creation dialog applies as submit progresses. */
export interface MapCreationSubmitActions {
  readonly onInvalid: (message: string) => void;
  readonly onBegin: () => void;
  readonly onFailed: (message: string) => void;
  readonly onCreated: (mapId: string) => void;
}

/** Runs one creation-dialog submit from the busy/draft gate through transport. */
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
