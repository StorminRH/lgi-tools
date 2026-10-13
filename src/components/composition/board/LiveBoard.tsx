'use client';

import { LoadFailed } from '@/components/ui/load-failed';
import { BoardEmpty } from './BoardEmpty';
import { BoardSkeleton } from './BoardSkeleton';
import { HomeBoardView } from './HomeBoardView';
import { useBoardLive } from './use-board-live';

export function LiveBoard({ mainId }: { mainId: number }) {
  const { response, now, loading, retry } = useBoardLive();
  if (loading) return <BoardSkeleton />;
  if (response === null) {
    return <LoadFailed title="Your characters didn't load" retryLabel="Retry loading your characters" onRetry={retry} />;
  }
  if (response.characters.length === 0) return <BoardEmpty />;
  return <HomeBoardView board={response} now={now} mainId={mainId} />;
}
