'use client';

import { useCallback, useMemo, useState } from 'react';
import { api } from '@/data/convex/api';
import type { Id } from '@/data/convex/data-model';
import { useLiveValue } from '@/data/convex/use-live-value';
import type {
  ConnectionDetail,
  UnresolvedHoleSummary,
} from '../chain/connection-detail';
import { useUniverseAssets } from '../chain/use-universe-assets';
import { answerAndAnnounce } from './connection-authoring-api';
import {
  jumpAnswerTarget,
  pendingJumpResolution,
  type JumpResolutionCandidate,
} from './jump-resolution';

export function useSignatureJumpFlow(
  mapId: string,
  canEdit: boolean,
  connectionDetails: ReadonlyMap<Id<'mapConnections'>, ConnectionDetail>,
  unresolvedHoles: readonly UnresolvedHoleSummary[],
) {
  const assets = useUniverseAssets();
  const tracking = useLiveValue(api.mapTrackingLive.forMap, { mapId });
  const ownCharacterIds = useMemo(
    () => new Set(tracking?.ownTrackedCharacterIds ?? []),
    [tracking?.ownTrackedCharacterIds],
  );
  const [dismissedResolutions, setDismissedResolutions] = useState<
    ReadonlySet<string>
  >(() => new Set());
  const jumpResolution = useMemo(
    () =>
      canEdit
        ? pendingJumpResolution(
            connectionDetails,
            unresolvedHoles,
            dismissedResolutions,
            assets === null ? null : (id: number) => assets.systemInfo(id),
            ownCharacterIds,
          )
        : null,
    [
      assets,
      canEdit,
      connectionDetails,
      dismissedResolutions,
      ownCharacterIds,
      unresolvedHoles,
    ],
  );
  const dismissResolution = useCallback((connectionId: string) => {
    setDismissedResolutions((previous) =>
      new Set(previous).add(connectionId),
    );
  }, []);
  const pickJumpCandidate = useCallback(
    (candidate: JumpResolutionCandidate) => {
      const connectionId = jumpResolution?.connectionId;
      if (connectionId === undefined) return;
      void answerAndAnnounce({
        mapId,
        connectionId,
        targetConnectionId: jumpAnswerTarget(candidate),
        dismiss: () => dismissResolution(connectionId),
      });
    },
    [dismissResolution, jumpResolution, mapId],
  );
  return { jumpResolution, pickJumpCandidate };
}
