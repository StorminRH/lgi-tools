'use client';

import { useCallback } from 'react';
import { api } from '@/data/convex/api';
import { useMutation } from '@/data/convex/use-mutation';
import type { SigGroup } from '@/data/maps/scan-parse';
import {
  identifySemanticWrite,
  identifyWriteDigest,
} from '@/data/maps/semantic-write';
import { followUpElimination } from './signature-elimination-client';
import type { SignatureWindowRow } from './signature-model';

export function useIdentifySignature(mapId: string) {
  const identifySignature = useMutation(api.mapScan.identifySignature);
  return useCallback(
    async (
      row: SignatureWindowRow,
      group: SigGroup,
      wormholeTypeCode?: string,
    ): Promise<void> => {
      const identified = await identifySignature({
        mapId,
        systemId: row.systemId,
        signatureId: row.signatureId,
        group,
        ...(wormholeTypeCode ? { wormholeTypeCode } : {}),
      });
      if (group === 'Wormhole') {
        await followUpElimination({
          mapId,
          systemId: row.systemId,
          write: identifySemanticWrite(identified),
          digest: identifyWriteDigest(row.systemId, row.signatureId, group),
        });
      }
    },
    [identifySignature, mapId],
  );
}
