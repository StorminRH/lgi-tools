import { Suspense } from 'react';
import { MapChrome } from '@/components/composition/map/MapChrome';
import { checkAdmin } from '@/platform/auth/route-guards';
import type { Session } from '@/platform/auth/types';

function MapDevelopmentWall() {
  return (
    <section
      data-map-development-wall
      className="flex h-full w-full items-center justify-center px-6 text-center"
    >
      <div className="flex max-w-xl flex-col items-center gap-4">
        <div className="font-data text-label uppercase tracking-eyebrow text-isk">
          Atlas · under development
        </div>
        <h1 className="font-display text-display font-bold uppercase tracking-copy text-name">
          Mapping the unknown
        </h1>
        <p className="text-body leading-relaxed text-text">
          The living map is still being assembled behind the development wall.
          It will open once its navigation, collaboration, and safety checks are complete.
        </p>
      </div>
    </section>
  );
}

/**
 * Resolves the atlas's server-side administrator wall before rendering its canvas subtree.
 */
export async function MapAccessGate({
  children,
}: {
  children: React.ReactNode;
}) {
  const gate = await checkAdmin();
  if (!gate.ok) return <MapDevelopmentWall />;

  const session: Session | null =
    gate.session.characterId == null
      ? null
      : {
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
 * Provides the full-dynamic-viewport frame and request-time authorization hole for map routes.
 */
export default function MapLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative h-[100dvh] w-full overflow-hidden">
      <Suspense fallback={null}>
        <MapAccessGate>{children}</MapAccessGate>
      </Suspense>
    </div>
  );
}
