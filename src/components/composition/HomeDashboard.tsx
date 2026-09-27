import type { ReactNode } from 'react';
import { HomeSignedInBoard } from '@/components/composition/board/HomeSignedInBoard';
import { HomeHero } from '@/components/composition/HomeHero';

export function HomeDashboard({ demoSlot }: { demoSlot?: ReactNode }) {
  return (
    <div className="flex flex-col gap-10">
      <HomeHero />
      {demoSlot}
      <HomeSignedInBoard />
    </div>
  );
}
