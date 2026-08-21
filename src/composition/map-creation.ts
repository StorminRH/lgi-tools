import {
  projectStagedMapAccess,
  requireCurrentProjection,
  teardownMapAccessProjection,
} from '@/composition/map-access-projection';
import type { CreateMapRequest } from '@/data/maps/api-contract';
import {
  compensateFailedMapCreation,
  createMapAtomic,
  publishCreatedMap,
} from '@/data/maps/queries';

const PROJECTION_ATTEMPT_OFFSETS_MS = [0, 2_000, 5_000, 10_000] as const;
const CREATION_PROJECTION_ATTEMPT_TIMEOUT_MS = 2_000;
const CREATION_PROJECTION_DEADLINE_MS = 20_000;
const COMPENSATION_RETRY_OFFSETS_MS = [0, 250, 1_000] as const;

type CreateMap = typeof createMapAtomic;
type Compensate = typeof compensateFailedMapCreation;
type Project = typeof projectStagedMapAccess;
type Publish = typeof publishCreatedMap;
type Teardown = typeof teardownMapAccessProjection;

interface MapCreationDependencies {
  readonly createMap?: CreateMap;
  readonly compensate?: Compensate;
  readonly project?: Project;
  readonly publish?: Publish;
  readonly teardown?: Teardown;
  readonly now?: () => number;
  readonly pause?: (delayMs: number) => Promise<void>;
}

export type CreateProjectedMapResult =
  | { readonly ok: true; readonly mapId: string }
  | {
      readonly ok: false;
      readonly cause: unknown;
      readonly cleanup: 'deleted' | 'queued';
    };

function delay(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

async function projectOnCreationLadder(
  mapId: string,
  dependencies: Required<Pick<MapCreationDependencies, 'project' | 'now' | 'pause'>>,
): Promise<void> {
  const startedAt = dependencies.now();
  let finalCause: unknown;

  for (const offsetMs of PROJECTION_ATTEMPT_OFFSETS_MS) {
    const waitMs = startedAt + offsetMs - dependencies.now();
    if (waitMs > 0) await dependencies.pause(waitMs);

    const remainingMs = startedAt + CREATION_PROJECTION_DEADLINE_MS - dependencies.now();
    if (remainingMs <= 0) break;
    const timeoutMs = Math.min(CREATION_PROJECTION_ATTEMPT_TIMEOUT_MS, remainingMs);
    const controller = new AbortController();
    let rejectOnAbort: ((reason: unknown) => void) | undefined;
    const aborted = new Promise<never>((_resolve, reject) => {
      rejectOnAbort = reject;
    });
    const timer = setTimeout(() => {
      const cause = new DOMException('projection attempt timed out', 'TimeoutError');
      controller.abort(cause);
      rejectOnAbort?.(cause);
    }, timeoutMs);
    try {
      const projection = dependencies.project(mapId, {
        timeoutMs,
        signal: controller.signal,
      });
      void projection.catch(() => {});
      await Promise.race([projection, aborted]);
      return;
    } catch (cause) {
      finalCause = cause;
    } finally {
      clearTimeout(timer);
    }
  }

  throw finalCause ?? new Error('Map access projection exhausted its creation deadline.');
}

async function compensateWithRetry(
  mapId: string,
  compensate: Compensate,
  pause: (delayMs: number) => Promise<void>,
): Promise<{ deleted: true } | { deleted: false; cause: unknown }> {
  let finalCause: unknown;
  let priorOffset = 0;
  for (const offsetMs of COMPENSATION_RETRY_OFFSETS_MS) {
    if (offsetMs > priorOffset) await pause(offsetMs - priorOffset);
    priorOffset = offsetMs;
    try {
      const result = await compensate(mapId);
      return result.outcome === 'deleted'
        ? { deleted: true }
        : {
            deleted: false,
            cause: new Error('Map creation cleanup is owned by the purge claim.'),
          };
    } catch (cause) {
      finalCause = cause;
    }
  }
  return {
    deleted: false,
    cause: finalCause ?? new Error('Map creation compensation failed without a cause.'),
  };
}

export async function createProjectedMap(
  userId: string,
  input: CreateMapRequest,
  dependencies: MapCreationDependencies = {},
): Promise<CreateProjectedMapResult> {
  const createMap = dependencies.createMap ?? createMapAtomic;
  const compensate = dependencies.compensate ?? compensateFailedMapCreation;
  const project = dependencies.project ?? projectStagedMapAccess;
  const publish = dependencies.publish ?? publishCreatedMap;
  const teardown = dependencies.teardown ?? teardownMapAccessProjection;
  const now = dependencies.now ?? Date.now;
  const pause = dependencies.pause ?? delay;

  const mapId = await createMap(userId, input.name, input.grants);
  try {
    await projectOnCreationLadder(mapId, { project, now, pause });
    await publish(mapId);
    return { ok: true, mapId };
  } catch (cause) {
    try {
      requireCurrentProjection(await teardown(mapId));
    } catch (teardownCause) {
      return {
        ok: false,
        cause: new AggregateError(
          [cause, teardownCause],
          'Map creation failed; projection teardown is queued for purge.',
        ),
        cleanup: 'queued',
      };
    }
    const cleanup = await compensateWithRetry(mapId, compensate, pause);
    return cleanup.deleted
      ? { ok: false, cause, cleanup: 'deleted' }
      : {
          ok: false,
          cause: new AggregateError(
            [cause, cleanup.cause],
            'Map creation failed; staged recovery remains queued for purge.',
          ),
          cleanup: 'queued',
        };
  }
}
