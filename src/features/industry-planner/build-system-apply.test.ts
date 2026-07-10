import { describe, expect, it, vi } from 'vitest';
import {
  createBuildSystemApplier,
  type BuildLocationData,
  type BuildSystemRef,
} from './build-system-apply';

const JITA: BuildSystemRef = { systemId: 30000142, systemName: 'Jita', security: 0.9 };
const AMARR: BuildSystemRef = { systemId: 30002187, systemName: 'Amarr', security: 1.0 };

const DATA: BuildLocationData = {
  stations: [],
  costIndices: { manufacturing: 0.05, reaction: null },
  adjustedPrices: [{ typeId: 34, adjustedPrice: 4.2 }],
};

function makeDeps(
  fetchLocation: (systemId: number, signal: AbortSignal) => Promise<BuildLocationData | null>,
) {
  return {
    fetchLocation,
    onApplied: vi.fn<(sys: BuildSystemRef, data: BuildLocationData) => void>(),
    onPersist: vi.fn<(sys: BuildSystemRef) => void>(),
  };
}

describe('createBuildSystemApplier', () => {
  it('applies the fetched data and persists when asked', async () => {
    const deps = makeDeps(async () => DATA);
    const apply = createBuildSystemApplier(deps);
    await expect(apply(JITA, { persist: true })).resolves.toBe('applied');
    expect(deps.onApplied).toHaveBeenCalledWith(JITA, DATA);
    expect(deps.onPersist).toHaveBeenCalledWith(JITA);
  });

  it('persist: false applies without writing the preference', async () => {
    const deps = makeDeps(async () => DATA);
    const apply = createBuildSystemApplier(deps);
    await expect(apply(JITA, { persist: false })).resolves.toBe('applied');
    expect(deps.onApplied).toHaveBeenCalledOnce();
    expect(deps.onPersist).not.toHaveBeenCalled();
  });

  it('a non-OK response fails without touching state', async () => {
    const deps = makeDeps(async () => null);
    const apply = createBuildSystemApplier(deps);
    await expect(apply(JITA, { persist: true })).resolves.toBe('failed');
    expect(deps.onApplied).not.toHaveBeenCalled();
    expect(deps.onPersist).not.toHaveBeenCalled();
  });

  it('a thrown (non-abort) fetch failure fails without touching state', async () => {
    const deps = makeDeps(async () => {
      throw new Error('network down');
    });
    const apply = createBuildSystemApplier(deps);
    await expect(apply(JITA, { persist: true })).resolves.toBe('failed');
    expect(deps.onApplied).not.toHaveBeenCalled();
  });

  it('a later apply supersedes an in-flight one — last request wins even when the slow fetch resolves', async () => {
    // The first fetch resolves only AFTER the second apply has completed, and
    // resolves successfully (no abort-throw) — the generation check alone must
    // reject its data.
    let releaseFirst!: (data: BuildLocationData) => void;
    const first = new Promise<BuildLocationData>((resolve) => {
      releaseFirst = resolve;
    });
    const seen: AbortSignal[] = [];
    const deps = makeDeps((systemId, signal) => {
      seen.push(signal);
      return systemId === JITA.systemId ? first : Promise.resolve(DATA);
    });
    const apply = createBuildSystemApplier(deps);

    const slow = apply(JITA, { persist: true });
    const fast = apply(AMARR, { persist: true });
    await expect(fast).resolves.toBe('applied');

    // The superseding apply aborted the first controller.
    expect(seen[0]?.aborted).toBe(true);
    expect(seen[1]?.aborted).toBe(false);

    releaseFirst(DATA);
    await expect(slow).resolves.toBe('superseded');

    // Only the winner ever touched state or the preference.
    expect(deps.onApplied).toHaveBeenCalledOnce();
    expect(deps.onApplied).toHaveBeenCalledWith(AMARR, DATA);
    expect(deps.onPersist).toHaveBeenCalledOnce();
    expect(deps.onPersist).toHaveBeenCalledWith(AMARR);
  });

  it('an aborted fetch that throws resolves superseded, not failed', async () => {
    let rejectFirst!: (err: unknown) => void;
    const first = new Promise<BuildLocationData>((_resolve, reject) => {
      rejectFirst = reject;
    });
    const deps = makeDeps((systemId) =>
      systemId === JITA.systemId ? first : Promise.resolve(DATA),
    );
    const apply = createBuildSystemApplier(deps);

    const slow = apply(JITA, { persist: false });
    await apply(AMARR, { persist: false });
    // The aborted fetch surfaces as a rejection (the fetch() contract).
    rejectFirst(new DOMException('aborted', 'AbortError'));
    await expect(slow).resolves.toBe('superseded');
  });
});
