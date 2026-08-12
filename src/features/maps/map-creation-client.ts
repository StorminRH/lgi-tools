import {
  createMapEndpoint,
  type CreateMapRequest,
} from '@/data/maps/api-contract';
import { apiFetch } from '@/transport/api-client';

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
