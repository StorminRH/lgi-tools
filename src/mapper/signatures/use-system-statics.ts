'use client';

import { useEffect, useMemo, useState } from 'react';
import { systemClassText } from '@/data/eve-data/system-identity';
import {
  loadWormholeCodex,
  type WormholeCodex,
} from '@/data/eve-data/universe-assets-client';
import { loadSystemStatics } from '@/data/wh-statics/client';
import { staticSlotsFromCodes, type StaticSlot } from '../windows/intel-model';

export function destinationClassIdForCode(
  code: string,
  codex: WormholeCodex | null,
): number | null {
  const entry = codex?.byCode(code) ?? null;
  return entry === null || entry.farSide ? null : entry.targetClass;
}

export function staticClassForCode(
  code: string,
  codex: WormholeCodex | null,
): { readonly className: string; readonly whClassId: number } | null {
  const whClassId = destinationClassIdForCode(code, codex);
  if (whClassId === null) return null;
  const className = systemClassText(whClassId);
  if (className === null) return null;
  return { className, whClassId };
}

export function useWormholeCodex(): WormholeCodex | null {
  const [codex, setCodex] = useState<WormholeCodex | null>(null);

  useEffect(() => {
    if (codex !== null) return;
    let alive = true;
    loadWormholeCodex().then(
      (loaded) => {
        if (alive) setCodex(loaded);
      },
      () => {
      },
    );
    return () => {
      alive = false;
    };
  }, [codex]);

  return codex;
}

export function useSystemStaticCodes(systemId: number): readonly string[] {
  const [codes, setCodes] = useState<{
    readonly systemId: number;
    readonly codes: readonly string[];
  } | null>(null);

  useEffect(() => {
    if (systemId <= 0) return;
    const controller = new AbortController();
    let alive = true;
    loadSystemStatics(systemId, controller.signal).then(
      (statics) => {
        if (alive) setCodes({ systemId, codes: statics });
      },
      () => {},
    );
    return () => {
      alive = false;
      controller.abort();
    };
  }, [systemId]);

  return codes?.systemId === systemId ? codes.codes : [];
}

export function useSystemStaticSlots(systemId: number): readonly StaticSlot[] {
  const codex = useWormholeCodex();
  const codes = useSystemStaticCodes(systemId);
  return useMemo(
    () =>
      staticSlotsFromCodes(
        codes,
        (code) => staticClassForCode(code, codex)?.className ?? null,
      ),
    [codes, codex],
  );
}
