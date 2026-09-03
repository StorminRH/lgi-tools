'use client';

import type { ReactNode } from 'react';
import { HeroBanner } from '@/components/composition/HeroBanner';
import { HomeRosterPanel } from '@/components/composition/HomeRosterPanel';
import { useAuth } from '@/platform/auth/components/AuthProvider';

export function HomeLeftColumn({ anonHero }: { anonHero: ReactNode }) {
  const { session } = useAuth();
  if (session) {
    return (
      <div className="flex flex-col gap-8 pt-2">
        <HeroBanner />
        <HomeRosterPanel />
      </div>
    );
  }
  return <>{anonHero}</>;
}
