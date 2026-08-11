'use client';

import { useEffect, useMemo, useState } from 'react';
import { systemClassText } from '@/data/eve-data/system-identity';
import {
  loadWormholeCodex,
  type WormholeCodex,
} from '@/data/eve-data/universe-assets-client';
import type { StaticStubSlot } from '@/data/maps/stub-accounting';
import { loadSystemStatics } from '@/data/wh-statics/client';

const EMPTY_STATIC_SLOTS: ReadonlyMap<number, readonly StaticStubSlot[]> = new Map();

/** Resolves a near-side wormhole code to its broad destination class. */
export function destinationClassIdForCode(
  code: string,
  codex: WormholeCodex | null,
): number | null {
  const entry = codex?.byCode(code) ?? null;
  return entry === null || entry.farSide ? null : entry.targetClass;
}

/** Decorates one system's promoted statics with stable multiset identities and classes. */
export function staticSlotsForCodes(
  systemId: number,
  codes: readonly string[],
  codex: WormholeCodex,
): readonly StaticStubSlot[] {
  const occurrences = new Map<string, number>();
  const slots: StaticStubSlot[] = [];
  for (const code of codes) {
    const whClassId = destinationClassIdForCode(code, codex);
    if (whClassId === null) return [];
    const className = systemClassText(whClassId);
    if (className === null) return [];
    const ordinal = (occurrences.get(code) ?? 0) + 1;
    occurrences.set(code, ordinal);
    slots.push({
      id: `${systemId}:${code}:${ordinal}`,
      code,
      className,
      whClassId,
    });
  }
  return slots;
}

interface LoadedStatics {
  readonly key: string;
  readonly bySystem: ReadonlyMap<number, readonly StaticStubSlot[]>;
  readonly codex: WormholeCodex | null;
}

/** Loaded static-slot assertions and the codex that classified them. */
export interface SystemStaticSlots {
  readonly bySystem: ReadonlyMap<number, readonly StaticStubSlot[]>;
  readonly codex: WormholeCodex | null;
}

const EMPTY_SYSTEM_STATIC_SLOTS: SystemStaticSlots = {
  bySystem: EMPTY_STATIC_SLOTS,
  codex: null,
};

/**
 * Loads promoted statics for the authored systems named by one content-stable
 * key. A failed system contributes no assertion and cannot retain stale slots.
 */
export function useSystemStaticSlots(
  systemIdsKey: string,
): SystemStaticSlots {
  const [loaded, setLoaded] = useState<LoadedStatics>({
    key: '',
    bySystem: EMPTY_STATIC_SLOTS,
    codex: null,
  });
  const systemIds = useMemo(
    () => systemIdsKey.length === 0 ? [] : systemIdsKey.split(',').map(Number),
    [systemIdsKey],
  );

  useEffect(() => {
    if (systemIdsKey.length === 0) return;
    const controller = new AbortController();
    let ignore = false;

    void loadWormholeCodex().then(
      async (codex) => {
        const entries = await Promise.all(
          systemIds.map(async (systemId) => {
            try {
              const codes = await loadSystemStatics(systemId, controller.signal);
              return [systemId, staticSlotsForCodes(systemId, codes, codex)] as const;
            } catch {
              return [systemId, []] as const;
            }
          }),
        );
        if (!ignore) {
          setLoaded({ key: systemIdsKey, bySystem: new Map(entries), codex });
        }
      },
      () => {
        if (!ignore) {
          setLoaded({ key: systemIdsKey, bySystem: EMPTY_STATIC_SLOTS, codex: null });
        }
      },
    );

    return () => {
      ignore = true;
      controller.abort();
    };
  }, [systemIds, systemIdsKey]);

  return loaded.key === systemIdsKey ? loaded : EMPTY_SYSTEM_STATIC_SLOTS;
}
