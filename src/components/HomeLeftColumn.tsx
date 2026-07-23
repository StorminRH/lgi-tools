'use client';

import type { ReactNode } from 'react';
import { HeroBanner } from '@/components/HeroBanner';
import { HomeRosterPanel } from '@/components/HomeRosterPanel';
import { useAuth } from '@/platform/auth/components/AuthProvider';

/**
 * The home page's ONLY auth-conditional region. The anonymous hero is rendered
 * on the server and handed in as `anonHero` so it ships in the static prerender
 * (the hero is the anonymous pitch and should be crawlable). Until the client
 * session resolves — and for every signed-out visitor — we render that hero
 * unchanged, so there's no skeleton flash. A signed-in visitor keeps the hero
 * banner (the wordmark, sans the anon pitch line + login button) and gains the
 * character roster below it (P3b), which fetches its own linked-character list
 * and live skill queues client-side, leaving the static shell untouched.
 */
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
