'use client';

import { useEffect, useState } from 'react';
import { loadSystemStatics } from '@/data/wh-statics/client';
import { systemClassText } from '@/data/eve-data/system-identity';
import {
  loadWormholeCodex,
  type WormholeCodex,
} from '@/data/eve-data/universe-assets-client';

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

export function useSystemStaticSlots(systemId: number) {
  const codex = useWormholeCodex();
  const [result, setResult] = useState<{ systemId: number; codes: readonly string[] } | null>(null);
  useEffect(() => {
    let alive = true;
    loadSystemStatics(systemId).then(
      (codes) => { if (alive) setResult({ systemId, codes }); },
      () => {},
    );
    return () => {
      alive = false;
    };
  }, [systemId]);
  const codes = result?.systemId === systemId ? result.codes : [];
  return codes.flatMap((code) => {
    const target = staticClassForCode(code, codex);
    return target === null ? [] : [{ code, ...target }];
  });
}
