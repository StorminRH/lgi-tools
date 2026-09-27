'use client';

import { useEffect, useState } from 'react';
import { subscribeEliminationApplied } from './signature-elimination-client';
import type { SignatureWindowRow } from './signature-model';
import {
  diffSignatureUpdates,
  signatureIdentityKey,
  SIGNATURE_UPDATE_FLASH_MS,
  type SignatureRowFacts,
} from './signature-update-flash';

interface FlashState {
  readonly keys: ReadonlySet<string>;
  readonly generation: number;
}

const NO_FLASH: FlashState = { keys: new Set(), generation: 0 };

function withKeys(state: FlashState, keys: Iterable<string>): FlashState {
  return { keys: new Set([...state.keys, ...keys]), generation: state.generation + 1 };
}

/**
 * Scanner rows the eliminator or jump resolver just filled in, keyed by
 * `systemId:signatureId`. Live updates from any client are diffed; this
 * client's own elimination results are added directly, which also catches a
 * signature the eliminator moved onto another hallway.
 */
export function useSignatureUpdateFlash(
  mapId: string | null,
  rows: readonly SignatureWindowRow[],
): ReadonlySet<string> {
  const [seen, setSeen] = useState<{
    readonly rows: readonly SignatureWindowRow[];
    readonly facts: ReadonlyMap<string, SignatureRowFacts>;
  }>(() => ({ rows, facts: diffSignatureUpdates(new Map(), rows).snapshot }));
  const [flash, setFlash] = useState<FlashState>(NO_FLASH);

  if (seen.rows !== rows) {
    const { snapshot, updated } = diffSignatureUpdates(seen.facts, rows);
    setSeen({ rows, facts: snapshot });
    if (updated.size > 0) setFlash(withKeys(flash, updated));
  }

  useEffect(() => {
    if (mapId === null) return;
    return subscribeEliminationApplied((eliminatedMapId, systemId, signatureIds) => {
      if (eliminatedMapId !== mapId) return;
      setFlash((current) =>
        withKeys(current, signatureIds.map((signatureId) => signatureIdentityKey({ systemId, signatureId }))),
      );
    });
  }, [mapId]);

  const { generation } = flash;
  useEffect(() => {
    if (generation === 0) return;
    const timer = setTimeout(() => {
      setFlash((current) => (current.generation === generation ? NO_FLASH : current));
    }, SIGNATURE_UPDATE_FLASH_MS);
    return () => clearTimeout(timer);
  }, [generation]);

  return flash.keys;
}
