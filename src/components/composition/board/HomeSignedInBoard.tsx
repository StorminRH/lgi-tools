'use client';

import { useAuth } from '@/platform/auth/components/AuthProvider';
import { BoardFrame } from './BoardFrame';
import { LiveBoard } from './LiveBoard';

// A sibling of the hero, never its parent: the session resolves after the
// static shell paints, and only this slot may change when it does.
export function HomeSignedInBoard() {
  const { session } = useAuth();
  if (!session) return null;
  return (
    <BoardFrame>
      <LiveBoard mainId={session.characterId} />
    </BoardFrame>
  );
}
