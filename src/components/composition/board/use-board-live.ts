'use client';

import { boardEndpoint } from '@/composition/board/api-contract';
import { useLiveDataset } from '@/components/use-live-dataset';
import { boardIsCold } from './board-view-model';

export function useBoardLive() {
  return useLiveDataset(boardEndpoint, true, boardIsCold);
}
