'use client';

import { useMemo } from 'react';
import { api } from '@/data/convex/api';
import type { Id } from '@/data/convex/data-model';
import { useDrainedPages } from '@/data/convex/use-drained-pages';
import { systemClassText } from '@/data/eve-data/system-identity';
import { useWormholeCodexData } from '../authoring/use-wormhole-editor-data';
import type {
  ConnectionDetail,
  UnresolvedHoleSummary,
} from '../chain/connection-detail';
import {
  buildSignatureRows,
  type ConnectionSignatureInput,
} from './signature-model';

const SIGNATURE_PAGE_SIZE = 100;

function connectionRows(
  resolved: ReadonlyMap<Id<'mapConnections'>, ConnectionDetail>,
  unresolved: readonly UnresolvedHoleSummary[],
): readonly ConnectionSignatureInput[] {
  return [...resolved.values(), ...unresolved];
}

export function useSignaturePage(
  mapId: string,
  systemId: number | null,
  connectionDetails: ReadonlyMap<Id<'mapConnections'>, ConnectionDetail>,
  unresolvedHoles: readonly UnresolvedHoleSummary[],
) {
  const signatures = useDrainedPages(
    api.mapScan.watchSystemSignatures,
    systemId === null ? 'skip' : { mapId, systemId },
    SIGNATURE_PAGE_SIZE,
  );
  const connections = useMemo(
    () => connectionRows(connectionDetails, unresolvedHoles),
    [connectionDetails, unresolvedHoles],
  );
  const { codex } = useWormholeCodexData(null);
  const rows = useMemo(
    () =>
      buildSignatureRows(signatures.rows, connections, (code) => {
        const entry = codex?.byCode(code) ?? null;
        return entry === null || entry.farSide
          ? null
          : systemClassText(entry.targetClass);
      }),
    [signatures.rows, connections, codex],
  );
  return { rows, complete: systemId === null || signatures.complete };
}
