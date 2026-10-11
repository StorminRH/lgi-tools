'use client';

import { boardEndpoint } from '@/composition/board/api-contract';
import { useLiveDataset } from '@/components/use-live-dataset';
import { RECONCILE_BACKOFF } from '@/lib/live-dataset';
import { boardIsCold } from './board-view-model';

// A first sync reads about ten ESI endpoints per pilot and can outlast one
// reconcile, so the board keeps checking on a short backoff, then gives up.
export function useBoardLive() {
  return useLiveDataset(boardEndpoint, true, boardIsCold, RECONCILE_BACKOFF);
}
