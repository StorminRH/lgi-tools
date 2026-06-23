'use client';

import type { ReactNode } from 'react';
import { HomeLoggedInPlaceholder } from '@/components/HomeLoggedInPlaceholder';
import { useAuth } from '@/features/auth/components/AuthProvider';

// The home page's ONLY auth-conditional region. The anonymous hero is rendered
// on the server and handed in as `anonHero` so it ships in the static prerender
// (the hero is the anonymous pitch and should be crawlable). Until the client
// session resolves — and for every signed-out visitor — we render that hero
// unchanged, so there's no skeleton flash. A signed-in visitor swaps to the
// logged-in panel.
//
// P3b drops the character roster in right here: replace <HomeLoggedInPlaceholder>
// in the `session` branch. Nothing else changes — not the shell, the grid, the
// right column, or the route's render mode.
export function HomeLeftColumn({ anonHero }: { anonHero: ReactNode }) {
  const { session } = useAuth();
  if (session) return <HomeLoggedInPlaceholder name={session.name} />;
  return <>{anonHero}</>;
}
