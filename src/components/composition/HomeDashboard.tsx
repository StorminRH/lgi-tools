import type { ReactNode } from 'react';
import { HomeSignedInBoard } from '@/components/composition/board/HomeSignedInBoard';
import { HomeHero } from '@/components/composition/HomeHero';
import { SignedInFold } from '@/components/composition/SignedInFold';

export function HomeDashboard({ demoSlot }: { demoSlot?: ReactNode }) {
  return (
    <div className="flex flex-col gap-10 [--fold-gap:--spacing(10)]">
      <SignedInFold pendingFallback={<div className="min-h-104" />}>
        <HomeHero />
      </SignedInFold>
      {demoSlot}
      <div className="empty:hidden">
        <HomeSignedInBoard />
      </div>
    </div>
  );
}
