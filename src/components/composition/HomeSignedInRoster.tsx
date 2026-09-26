'use client';

import { Card } from '@/components/ui/card';
import { HomeRosterPanel } from '@/components/composition/HomeRosterPanel';
import { useAuth } from '@/platform/auth/components/AuthProvider';

// A sibling of the hero, never its parent: the session resolves after the
// static shell paints, and only this slot may change when it does.
export function HomeSignedInRoster() {
  const { session } = useAuth();
  if (!session) return null;
  return (
    <Card className="reveal mx-auto w-full max-w-[820px] rounded-panel p-5">
      <HomeRosterPanel />
    </Card>
  );
}
