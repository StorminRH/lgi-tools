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

const CODEX_RETRY_MS = 10_000;

/**
 * The codex once loaded, and whether the latest load failed so callers can
 * say so. A failed load retries every CODEX_RETRY_MS while mounted.
 */
export function useWormholeCodexStatus(): {
  readonly codex: WormholeCodex | null;
  readonly failed: boolean;
} {
  const [codex, setCodex] = useState<WormholeCodex | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (codex !== null) return;
    let alive = true;
    let retry: ReturnType<typeof setTimeout> | null = null;
    loadWormholeCodex().then(
      (loaded) => {
        if (alive) setCodex(loaded);
      },
      () => {
        if (!alive) return;
        setFailed(true);
        // The shared loader clears a failed load, so a later attempt can
        // succeed; keep trying while the caller is still mounted.
        retry = setTimeout(() => setAttempt((current) => current + 1), CODEX_RETRY_MS);
      },
    );
    return () => {
      alive = false;
      if (retry !== null) clearTimeout(retry);
    };
  }, [codex, attempt]);

  return { codex, failed: codex === null && failed };
}

export function useWormholeCodex(): WormholeCodex | null {
  return useWormholeCodexStatus().codex;
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
