'use client';

import type { ReactNode } from 'react';
import { HomeRosterPanel } from '@/components/HomeRosterPanel';
import { useAuth } from '@/features/auth/components/AuthProvider';

// The home page's ONLY auth-conditional region. The anonymous hero is rendered
// on the server and handed in as `anonHero` so it ships in the static prerender
// (the hero is the anonymous pitch and should be crawlable). Until the client
// session resolves — and for every signed-out visitor — we render that hero
// unchanged, so there's no skeleton flash. A signed-in visitor swaps to the
// character roster (P3b), which fetches its own linked-character list and live
// skill queues client-side, leaving the static shell untouched.
export function HomeLeftColumn({ anonHero }: { anonHero: ReactNode }) {
  const { session } = useAuth();
  if (session) return <HomeRosterPanel />;
  return <>{anonHero}</>;
}
