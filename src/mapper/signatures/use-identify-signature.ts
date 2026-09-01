'use client';

import { useCallback } from 'react';
import { api } from '@/data/convex/api';
import { useMutation } from '@/data/convex/use-mutation';
import type { SigGroup } from '@/data/maps/scan-parse';
import { eliminateSignaturesAndAnnounce } from './signature-elimination-client';
import type { SignatureWindowRow } from './signature-model';

export function useIdentifySignature(mapId: string) {
  const identifySignature = useMutation(api.mapScan.identifySignature);
  return useCallback(
    async (
      row: SignatureWindowRow,
      group: SigGroup,
      wormholeTypeCode?: string,
    ): Promise<void> => {
      await identifySignature({
        mapId,
        systemId: row.systemId,
        signatureId: row.signatureId,
        group,
        ...(wormholeTypeCode ? { wormholeTypeCode } : {}),
      });
      if (group === 'Wormhole') {
        await eliminateSignaturesAndAnnounce({ mapId, systemId: row.systemId });
      }
    },
    [identifySignature, mapId],
  );
}
