'use client';

import { Banner } from '@/components/ui/banner';
import { BoardEmpty } from './BoardEmpty';
import { BoardSkeleton } from './BoardSkeleton';
import { BOARD_LOAD_FAILED } from './board-view-model';
import { HomeBoardView } from './HomeBoardView';
import { useBoardLive } from './use-board-live';

export function LiveBoard({ sessionCharacterId }: { sessionCharacterId: number }) {
  const { response, now, loading } = useBoardLive();
  if (loading) return <BoardSkeleton />;
  if (response === null) return <Banner tone="warn">{BOARD_LOAD_FAILED}</Banner>;
  if (response.characters.length === 0) return <BoardEmpty />;
  return <HomeBoardView board={response} now={now} sessionCharacterId={sessionCharacterId} />;
}
