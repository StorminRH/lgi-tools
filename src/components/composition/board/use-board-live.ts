'use client';

import { boardEndpoint } from '@/composition/board/api-contract';
import { useLiveDataset } from '@/components/use-live-dataset';
import { boardIsCold } from './board-view-model';

// A first sync reads about ten ESI endpoints per pilot and can outlast one
// reconcile, so the board keeps checking on a short backoff, then gives up.
const BOARD_RECONCILE_SCHEDULE: readonly number[] = [4_000, 8_000, 15_000, 30_000, 60_000];

export function useBoardLive() {
  return useLiveDataset(boardEndpoint, true, boardIsCold, BOARD_RECONCILE_SCHEDULE);
}
