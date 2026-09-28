import type { ReactNode } from 'react';
import { HomeSignedInBoard } from '@/components/composition/board/HomeSignedInBoard';
import { HomeHero } from '@/components/composition/HomeHero';
import { SignedInFold } from '@/components/composition/SignedInFold';

export function HomeDashboard({ demoSlot }: { demoSlot?: ReactNode }) {
  return (
    <div className="home-dashboard flex flex-col gap-10 [--fold-gap:--spacing(10)]">
      <SignedInFold>
        <HomeHero />
      </SignedInFold>
      {demoSlot}
      <div className="home-board-slot empty:hidden">
        <HomeSignedInBoard />
      </div>
    </div>
  );
}
