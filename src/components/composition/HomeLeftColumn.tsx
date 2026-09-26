'use client';

import type { ReactNode } from 'react';
import { Card } from '@/components/ui/card';
import { HomeRosterPanel } from '@/components/composition/HomeRosterPanel';
import { useAuth } from '@/platform/auth/components/AuthProvider';

export function HomeLeftColumn({
  anonHero,
  signedInHero,
}: {
  anonHero: ReactNode;
  signedInHero: ReactNode;
}) {
  const { session } = useAuth();
  if (session) {
    return (
      <div className="flex flex-col gap-10">
        {signedInHero}
        <Card className="reveal reveal-5 mx-auto w-full max-w-[820px] rounded-panel p-5">
          <HomeRosterPanel />
        </Card>
      </div>
    );
  }
  return <>{anonHero}</>;
}
