import { Suspense, type ReactNode } from 'react';
import { MapChrome } from '@/components/composition/map/MapChrome';
import { checkAdmin } from '@/platform/auth/route-guards';
import type { Session } from '@/platform/auth/types';

function MapWall() {
  return (
    <div className="flex h-full items-center justify-center px-6 text-center">
      <div className="flex max-w-[640px] flex-col items-center gap-3">
        <div className="font-data text-label text-muted tracking-eyebrow uppercase">
          Under development
        </div>
        <h1 className="font-display font-bold text-hero leading-none tracking-copy uppercase text-name">
          Map not yet cleared for public undock
        </h1>
        <p className="text-body text-text leading-relaxed">
          The living map is still behind the development wall. Check back after
          the version audit completes.
        </p>
      </div>
    </div>
  );
}

/**
 * Server-side admin gate for map routes. Non-admins receive the wall and never
 * the canvas children; admins receive floating chrome plus the page.
 */
export async function MapAdminGate({ children }: { children: ReactNode }) {
  const gate = await checkAdmin();
  if (!gate.ok || gate.session.characterId == null) {
    return <MapWall />;
  }

  const session: Session = {
    characterId: gate.session.characterId,
    name: gate.session.name,
    portraitUrl: gate.session.portraitUrl,
    role: gate.session.role,
  };

  return (
    <>
      <MapChrome session={session} />
      {children}
    </>
  );
}

/**
 * Full-viewport map frame with a Suspense-isolated admin gate. Non-admins receive
 * the under-development wall and never the canvas subtree.
 */
export default function MapLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="relative h-[100dvh] overflow-hidden">
      <Suspense fallback={<MapWall />}>
        <MapAdminGate>{children}</MapAdminGate>
      </Suspense>
    </div>
  );
}
